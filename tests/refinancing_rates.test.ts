import { afterEach, describe, expect, it, vi } from 'vitest';
import { finantoRefinancingChoices, nossaFintechTableRate } from '../src/lib/inssEligibility';
import { NossaFintechService } from '../server/services/nossaFintechService';

// Synthetic model/Prisma dependencies: no database or real workbook credentials.
vi.mock('../server/services/daycovalWorkbook',()=>({decodeDaycoval:()=>({enabled:true})}));
vi.mock('../server/services/nossaFintechWorkbook',()=>({NOSSA_WORKBOOK_KEY:'synthetic',nossaWorkbookTables:()=>[...Array.from({length:5},(_,i)=>({id:String(i+1),code:String(i+1),term:108,invalidity:false,rate:0.0185})),{id:'183',code:'183',term:108,invalidity:false,rate:0.0183},{id:'185',code:'185',term:108,invalidity:false,rate:0.0185}],simulateNossaWorkbook:()=>({offers:[{eligible:true,amount:100}]})}));
const modelDb={systemConfig:{findUnique:vi.fn(async()=>({configValue:'synthetic'}))}} as any;
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
  it('não retorna ofertas com troco negativo, inclusive quando todas são negativas', async () => {
    const simulate = (values: number[]) => {
      let index = 0;
      vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_db, _tenant, method) => method === 'GET'
        ? { success: true, status: 200, data: values.map((_, i) => ({ cod_tabela: String(i + 1), name: 'Tabela 1,85%', number_of_installments: [108] })) }
        : { success: true, status: 200, data: { final_disbursement_amount: values[index++] } });
      return NossaFintechService.simulatePortabilityAcrossTables(modelDb, 'tenant', {
        birthDate: '1980-01-01', lastDueBalance: 20000, installmentFaceValue: 500, openedInstallmentNumber: 72, numberOfInstallments: 108, legalRepresentative: false,
      });
    };
    const mixed = await simulate([-9.68, 68.42, -89.66, 626.41, 0]);
    expect((mixed.data as any).results.map((row: any) => row.data.final_disbursement_amount)).toEqual([68.42, 626.41, 0]);
    expect((mixed.data as any).tables).toHaveLength(3);
    const negative = await simulate([-1, -100]);
    expect((negative.data as any).results).toEqual([]);
    expect((negative.data as any).tables).toEqual([]);
  });
  it('Nossa Fintech consulta apenas a taxa escolhida', async () => {
    const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_prisma, _tenant, method) => method === 'GET'
      ? { success: true, status: 200, data: [
        { cod_tabela: '183', name: 'INSS PORT-REFIN 1,83% - 108x', number_of_installments: [108] },
        { cod_tabela: '185', name: 'INSS PORT-REFIN 1,85% - 108x', number_of_installments: [108] },
      ] } : { success: true, status: 200, data: { final_disbursement_amount: 2000 } });
    const result = await NossaFintechService.simulatePortabilityAcrossTables(modelDb, 'tenant', {
      birthDate: '1980-01-01', lastDueBalance: 20000, installmentFaceValue: 500, openedInstallmentNumber: 72, numberOfInstallments: 108, legalRepresentative: false, refinancingRate: 1.83,
    });
    expect((result.data as any).results).toHaveLength(1);
    expect(request.mock.calls.filter(call => call[2] === 'POST')).toHaveLength(1);
    expect(request.mock.calls[1][4]).toMatchObject({ refinancing: { cod_tabela: '183' } });
  });
});
