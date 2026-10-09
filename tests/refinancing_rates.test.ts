import { afterEach, describe, expect, it, vi } from 'vitest';
import { finantoRefinancingChoices, nossaFintechTableRate } from '../src/lib/inssEligibility';
import { NossaFintechService } from '../server/services/nossaFintechService';

afterEach(() => vi.restoreAllMocks());
const rule = { name: 'PRIME ≥ 300', items: [{ rate: 1.85, minTerm: 1, maxTerm: 108 }] };
describe('Taxas do refinanciamento', () => {
  it('compara taxas permitidas em vez de somente a taxa padrão', () => {
    const rates = finantoRefinancingChoices(rule, 108).map(item => item.rate);
    expect(rates).toContain(1.6);
    expect(rates).toContain(1.83);
    expect(rates).toContain(1.85);
    expect(new Set(rates).size).toBe(rates.length);
    expect(finantoRefinancingChoices(rule, 108, 1.83).map(item => item.rate)).toEqual([1.83]);
    expect(finantoRefinancingChoices({ ...rule, name: 'ESSENCIAL ≥ 50' }, 108, 1.65)).toEqual([]);
    expect(finantoRefinancingChoices(rule, 120)).toEqual([]);
  });
  it('respeita os limites explícitos da API', () => {
    expect(finantoRefinancingChoices({ ...rule, items: [{ minRate: 1.8, maxRate: 1.85, minTerm: 96, maxTerm: 108 }] }, 108, 1.75)).toEqual([]);
    expect(finantoRefinancingChoices({ name: 'Outra tabela', items: rule.items }, 108).map(item => item.rate)).toEqual([1.85]);
    expect(nossaFintechTableRate({ name: 'INSS PORT-REFIN 1,83% - 108x' })).toBe(1.83);
  });
  it('Nossa Fintech consulta apenas a taxa escolhida', async () => {
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_prisma, _tenant, method) => method === 'GET'
      ? { success: true, status: 200, data: [
        { cod_tabela: '183', name: 'INSS PORT-REFIN 1,83% - 108x', number_of_installments: [108] },
        { cod_tabela: '185', name: 'INSS PORT-REFIN 1,85% - 108x', number_of_installments: [108] },
      ] } : { success: true, status: 200, data: { final_disbursement_amount: 2000 } });
    const result = await NossaFintechService.simulatePortabilityAcrossTables({} as any, 'tenant', {
      birthDate: '1980-01-01', lastDueBalance: 20000, installmentFaceValue: 500, openedInstallmentNumber: 72, numberOfInstallments: 108, legalRepresentative: false, refinancingRate: 1.83,
    });
    expect((result.data as any).results).toHaveLength(1);
    expect(request.mock.calls.filter(call => call[2] === 'POST')).toHaveLength(1);
    expect(request.mock.calls[1][4]).toMatchObject({ refinancing: { cod_tabela: '183' } });
  });
});
