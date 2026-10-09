import { afterEach, describe, expect, it, vi } from 'vitest';
import { finantoBenefitError } from '../src/lib/inssEligibility';
import { getNossaFintechNovoAmount, getNossaFintechNovoOptions, getNossaFintechTroco } from '../src/lib/nossaFintech';
import { NossaFintechService } from '../server/services/nossaFintechService';

afterEach(() => vi.restoreAllMocks());

describe('Espécie FINANTO e retorno Novo Nossa Fintech', () => {
  it('bloqueia BNF 32 para espécie 41 e permite para 32', () => {
    expect(finantoBenefitError('NORMAL- Tx 1,85 BNF 32', '41')).toContain('espécie 32');
    expect(finantoBenefitError('NORMAL- Tx 1,85 BNF 32', '32')).toBeNull();
    expect(finantoBenefitError('ESPÉCIE 32', 41)).toContain('espécie 32');
    expect(finantoBenefitError('CARÊNCIA + 90 DIAS - ENTRANTE', 41)).toBeNull();
    expect(finantoBenefitError('NORMAL - Tx 1,85', 41)).toBeNull();
  });

  it('lê o valor da oferta documentada, sem usar o zero da entrada', () => {
    expect(getNossaFintechNovoAmount({ disbursed_amount: 0, data: { disbursement_options: [{ disbursed_issue_amount: 22621.36 }] } })).toBe(22621.36);
    expect(getNossaFintechNovoAmount({ disbursed_amount: 5000 })).toBeNull();
    expect(getNossaFintechNovoOptions({ disbursement_options: [{ disbursed_issue_amount: 0 }, { disbursed_issue_amount: null }, { disbursed_issue_amount: -1 }] })).toEqual([]);
    expect(getNossaFintechNovoAmount({ success: false, disbursement_options: [{ disbursed_issue_amount: 5000 }] })).toBeNull();
    expect(getNossaFintechTroco({ final_disbursement_amount: 2500 })).toBe(2500);
  });

  it.each(['INSTALLMENT', 'AMOUNT'] as const)('consulta cada produto uma vez no modo %s e preserva cada opção real', async mode => {
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_prisma, _tenant, method) => method === 'GET'
      ? { success: true, status: 200, data: [
        { cod_produto: 200, cod_tabela: 'a', number_of_installments: [108] },
        { cod_produto: 200, cod_tabela: 'b', number_of_installments: [108] },
        { cod_produto: 201, cod_tabela: 'c', number_of_installments: [96] },
      ] }
      : { success: true, status: 201, data: { disbursed_amount: 0, data: { disbursement_options: [
        { cod_tabela: 'b', disbursed_issue_amount: 20000 }, { disbursed_issue_amount: 19900 },
      ] } } });
    const result = await NossaFintechService.simulateInssNovoAcrossTables({} as any, 'tenant', {
      birthDate: '1980-01-01', numberOfInstallments: 108, mode, value: 500, legalRepresentative: false,
    });
    const calls = request.mock.calls.filter(call => call[2] === 'POST');
    expect(calls).toHaveLength(1);
    expect(calls[0][4]).toEqual({ number_of_installments: 108, cod_produto: 200, ...(mode === 'INSTALLMENT' ? { installment_face_value: 500 } : { disbursed_amount: 500 }) });
    const rows = (result.data as any).results;
    expect(rows).toHaveLength(2);
    expect(rows[0].success).toBe(true);
    expect(rows[0].table.cod_tabela).toBe('b');
    expect(getNossaFintechNovoAmount(rows[0].data)).toBe(20000);
    expect(getNossaFintechNovoAmount(rows[1].data)).toBe(19900);
  });

  it('HTTP 201 sem oferta válida não vira uma simulação de R$ 0,00', async () => {
    vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_prisma, _tenant, method) => method === 'GET'
      ? { success: true, status: 200, data: [{ cod_produto: 200, number_of_installments: [108] }] }
      : { success: true, status: 201, data: { disbursed_amount: 0, disbursement_options: [{ disbursed_issue_amount: 0 }] } });
    const result = await NossaFintechService.simulateInssNovoAcrossTables({} as any, 'tenant', {
      birthDate: '1980-01-01', numberOfInstallments: 108, mode: 'INSTALLMENT', value: 500, legalRepresentative: false,
    });
    expect((result.data as any).results[0]).toMatchObject({ success: false, status: 201, error: expect.stringContaining('valor liberado válido') });
  });
});
