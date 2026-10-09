import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinantoService } from '../../server/services/finantoService';
import { NossaFintechService } from '../../server/services/nossaFintechService';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Payload e seleção de tabelas INSS', () => {
  it('envia issue_amount e parcela positiva ao motor FINANTO no Port/Refin', async () => {
    vi.spyOn(FinantoService, 'getConfig').mockResolvedValue({ enabled: true, hasApiKey: true, isConfigured: true });
    const prisma = { systemConfig: { findUnique: vi.fn().mockResolvedValue({ configValue: 'fixture-key' }) } } as any;
    const request = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const valid = body.issue_amount === 13000 && body.refinancing.installmentValue === 300;
      return new Response(JSON.stringify(valid ? { loanValue: 13000, refinancing: { netValue: 2500 } } : { messages: [{ text: "'issue_amount' is a required property" }] }), { status: valid ? 200 : 400, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', request);
    const result = await FinantoService.request(prisma, 'fixture-tenant', 'POST', '/v3/loan-inss-simulations/calculation', {
      ruleId: 'fixture-rule', loanValue: 13000, installmentValue: 300, term: 66, rate: 1.85,
      originContract: { dueBalanceValue: 13000, installmentValue: 300, installmentsRemaining: 66 },
      refinancing: { term: 108, rate: 1.85, installmentValue: 0 },
    });
    expect(result.success).toBe(true);
    const sent = JSON.parse(String(request.mock.calls[0][1].body));
    expect(sent.term).toBe(66);
    expect(sent.refinancing.term).toBe(108);
    expect(sent.loanValue).toBe(13000);
  });

  it('Nossa Fintech consulta somente as tabelas que atendem ao saldo', async () => {
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_prisma, _tenant, method, endpoint) => {
      if (method === 'GET') return { success: true, status: 200, data: [
        { cod_tabela: 'low-rate', name: 'INSS PORT-REFIN 1,65% - 108x', number_of_installments: [108] },
        { cod_tabela: 'normal', name: 'INSS PORT-REFIN 1,85% - 108x', number_of_installments: [108] },
        { cod_tabela: 'exclusive', name: 'INSS PORT-REFIN 1,85% Exclusiva - 108x', number_of_installments: [108] },
      ] };
      return { success: true, status: 200, data: { final_disbursement_amount: 2000 } };
    });
    const result = await NossaFintechService.simulatePortabilityAcrossTables({} as any, 'fixture-tenant', {
      birthDate: '1980-01-01', lastDueBalance: 3000, installmentFaceValue: 500, openedInstallmentNumber: 72, numberOfInstallments: 108, legalRepresentative: false,
    });
    expect((result.data as any).results).toHaveLength(1);
    expect((result.data as any).results[0].table.cod_tabela).toBe('exclusive');
    expect((result.data as any).excludedTables).toHaveLength(2);
    expect(request.mock.calls.filter(call => call[2] === 'POST')).toHaveLength(1);
    expect(request.mock.calls[1][4]).toMatchObject({ refinancing: { cod_tabela: 'exclusive', number_of_installments: '108' } });
  });

  it('Nossa Fintech não consulta a API quando idade e prazo são incompatíveis', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
    const request = vi.spyOn(NossaFintechService, 'request');
    await expect(NossaFintechService.simulatePortabilityAcrossTables({} as any, 'fixture-tenant', {
      birthDate: '1954-10-08', lastDueBalance: 20000, installmentFaceValue: 500, openedInstallmentNumber: 72, numberOfInstallments: 108, legalRepresentative: false,
    })).rejects.toThrow('idade máxima');
    expect(request).not.toHaveBeenCalled();
  });
});
