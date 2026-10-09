import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchNossaFintechNovoTable } from '../src/lib/nossaFintech';
import { NossaFintechService } from '../server/services/nossaFintechService';
const tables = [
 { cod_produto: 200, cod_tabela: '200014', name: 'INSS NOVO s/ seguro 84X', start: 1, end: 1000000, number_of_installments: ['84'], amount: 8, amount_type: 'percentage' },
 { cod_produto: 200, cod_tabela: '200022', name: 'INSS NOVO s/ seguro 96X - Menor de 10k', start: 1, end: 9999, number_of_installments: ['96'] },
 { cod_produto: 200, cod_tabela: '200024', name: 'INSS NOVO s/ seguro 108X - Menor de 5k', start: 1, end: 5000, number_of_installments: ['108'] },
 { cod_produto: 200, cod_tabela: '200025', name: 'INSS NOVO s/ seguro 96X - Maior de 10k', start: 10000, end: 1000000, number_of_installments: ['96'] },
 { cod_produto: 200, cod_tabela: '200026', name: 'INSS NOVO s/ seguro 108X - 5k a 20k', start: 5001, end: 20000, number_of_installments: ['108'] },
 { cod_produto: 200, cod_tabela: '200027', name: 'INSS NOVO s/ seguro 108X - Maior de 20k', start: 20001, end: 1000000, number_of_installments: ['108'] },
];
afterEach(() => vi.restoreAllMocks());
describe('Nome comercial das ofertas Novo', () => {
 it.each([[84, 21853.68, '200014'], [96, 9999, '200022'], [96, 10000, '200025'], [108, 5000, '200024'], [108, 5001, '200026'], [108, 20000, '200026'], [108, 20001, '200027'], [108, 21853.68, '200027']])('associa prazo %s e valor %s à tabela %s', (term, amount, code) => {
   expect(matchNossaFintechNovoTable(tables, { disbursed_issue_amount: amount }, Number(term))?.cod_tabela).toBe(code);
 });
 it('prioriza o código retornado e não inventa tabela para faixas ambíguas', () => {
   expect(matchNossaFintechNovoTable(tables, { cod_tabela: '200027', disbursed_issue_amount: 21853 }, 108)?.name).toBe(tables[5].name);
   expect(matchNossaFintechNovoTable([tables[5], { ...tables[5], cod_tabela: 'other' }], { disbursed_issue_amount: 21853 }, 108)).toBeNull();
   expect(matchNossaFintechNovoTable(tables, { cod_tabela: 'unknown', disbursed_issue_amount: 21853 }, 108)).toBeNull();
 });
 it('mantém quatro ofertas e o nome Maior de 20k, consultando o produto uma vez', async () => {
   const request = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_p, _t, method) => method === 'GET'
     ? { success: true, status: 200, data: tables }
     : { success: true, status: 201, data: { disbursement_options: [21853.68, 21867.23, 21880.81, 21894.38].map(value => ({ disbursed_issue_amount: value })) } });
   const result = await NossaFintechService.simulateInssNovoAcrossTables({} as any, 'tenant', { birthDate: '1980-01-01', benefitType: 41, numberOfInstallments: 108, mode: 'INSTALLMENT', value: 500, legalRepresentative: false });
   const rows = (result.data as any).results;
   expect(rows).toHaveLength(4);
   for (const row of rows) { expect(row.table.name).toBe(tables[5].name); expect(row.table.cod_tabela).toBe('200027'); }
   expect(request.mock.calls.filter(call => call[2] === 'POST')).toHaveLength(1);
 });
});
