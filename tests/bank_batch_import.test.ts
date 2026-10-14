import { describe, expect, it, vi } from 'vitest';
import { importBankRows, parseBankText, prepareBankRows } from '../src/services/bankBatchImport';
describe('bank bulk import without network or database', () => {
  it('reads Excel-style pasted columns and preserves FEBRABAN leading zeroes', () => {
    const rows = prepareBankRows(parseBankText('Nome\tCódigo FEBRABAN\nBANCO EXEMPLO\t70\nOUTRO BANCO\t707'), []);
    expect(rows.map(row => [row.name, row.code, row.status])).toEqual([['BANCO EXEMPLO', '070', 'VALID'], ['OUTRO BANCO', '707', 'VALID']]);
  });
  it('reads quoted CSV and reversed column headers', () => {
    const rows = prepareBankRows(parseBankText('Código;Nome\n336;"BANCO; EXEMPLO"'), []);
    expect(rows[0]).toMatchObject({ code: '336', name: 'BANCO; EXEMPLO', status: 'VALID' });
    expect(() => parseBankText('Nome,Código\n"BANCO,336')).toThrow();
  });
  it('does not overwrite existing banks or import duplicates and invalid codes', () => {
    const rows = prepareBankRows([['Teste', '336'], ['Novo', '70'], ['Duplicado', '070'], ['Sem código', ''], ['Inválido', '1234']], [{ name: 'TESTE', code: '336' }]);
    expect(rows.map(row => row.status)).toEqual(['EXISTS', 'VALID', 'INVALID', 'INVALID', 'INVALID']);
  });
  it('uses existing create endpoint only for valid rows and reports progress', async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response('{"id":"fictional"}'));
    const progress = vi.fn();
    const rows = prepareBankRows([['Teste', '336'], ['Inválido', '']], []);
    const result = await importBankRows(rows, progress, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0]?.[1]?.body as string)).toEqual({ name: 'TESTE', code: '336' });
    expect(result[0].status).toBe('CREATED'); expect(rows[0].status).toBe('VALID');
    expect(progress).toHaveBeenCalledWith(1, 1);
  });
  it('stops mutation requests on permission failures', async () => {
    const request = vi.fn(async () => new Response('{"error":"Sem permissão"}', { status: 403 }));
    const result = await importBankRows(prepareBankRows([['A', '001'], ['B', '002']], []), () => {}, request);
    expect(request).toHaveBeenCalledTimes(1); expect(result.every(row => row.status === 'FAILED')).toBe(true);
  });
});
