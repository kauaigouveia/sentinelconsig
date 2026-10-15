import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresencaBankService as Bank } from '../server/services/presencaBankService';
import { PresencaFgtsService as Fgts } from '../server/services/presencaFgtsService';
const cpf = '52998224725';
const config = { environment: 'production', enabled: true, login: 'fictional-fgts', password: 'fictional-password', cltEnabled: false, fgtsEnabled: true };
const db: any = { promoter: { findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? [{ id: where.id || 'promoter-a', name: 'Ficticia' }] : []) } };
const secret = process.env.JWT_SECRET;
beforeEach(() => { process.env.JWT_SECRET = 'fictional-fgts-test-secret'; vi.spyOn(Bank, 'config').mockImplementation(async (_db, tenantId) => ({ ...config, enabled: tenantId === 'tenant-a' }) as any); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
async function tables() {
  const call = vi.spyOn(Bank, 'request').mockResolvedValue([{ id: 9939, nome: 'Tabela A', taxaJuros: 1.79, rentabilidade: 5 }, { id: 10166, nome: 'Tabela B', taxaJuros: 1.8 }, { id: 9939, nome: 'Duplicada', taxaJuros: 1.79 }, { id: 'bad', nome: 'Invalida', taxaJuros: 1 }]);
  const result = await Fgts.tables(db, 'tenant-a', 'user-a', { cpf }); return { result, call };
}
const offer = { id: 9941, valorLiquido: 752.83, saldoTotal: 1332.71, prazo: 4, parcelas: [{ dataRepasse: '2027-01-31', valor: 500 }, { dataRepasse: '2028-01-31', valor: 436.69 }, { dataRepasse: '2029-01-31', valor: 262.01 }, { dataRepasse: '2030-01-31', valor: 134.01 }] };
it('requires a valid CPF and independently enabled FGTS connections', async () => {
  await expect(Fgts.tables(db, 'tenant-a', 'user-a', { cpf: '00000000000' })).rejects.toThrow('CPF válido');
  vi.spyOn(Bank, 'config').mockResolvedValue({ ...config, fgtsEnabled: false } as any);
  await expect(Fgts.tables(db, 'tenant-a', 'user-a', { cpf })).rejects.toThrow('Nenhuma conexão');
  expect(await Bank.available(db, 'tenant-a', 'clt')).toEqual([]);
});
it('keeps every distinct returned table, ignores caller CDC and hides promoter and profitability', async () => {
  const { result, call } = await tables(); expect(result.tables).toHaveLength(2);
  expect(call.mock.calls[0]).toEqual([db, 'tenant-a', 'promoter-a', '/v3/operacoes/fgts/simulacao/agrupamento', { cpf, cdc: false }]);
  expect(result.tables[0]).not.toHaveProperty('promoterId'); expect(result.tables[0]).not.toHaveProperty('rentabilidade'); expect(result.tables[0].receipt).not.toContain(cpf);
});
it('simulates every source table using its sealed identifier, preserving actual amounts and annual payments', async () => {
  const { result, call } = await tables(); call.mockResolvedValue([offer]);
  for (const table of result.tables) {
    const response = await Fgts.simulate(db, 'tenant-a', 'user-a', { receipt: table.receipt, tabelaId: 999999, cdc: true });
    expect(response.offers[0]).toMatchObject({ tableId: table.id, id: 9941, amount: 752.83, balance: 1332.71, term: 4 });
    expect(response.offers[0].payments[0]).toEqual({ date: '2027-01-31', amount: 500 });
    expect(call.mock.calls.at(-1)?.[4]).toEqual({ cpf, cdc: false, tabelaId: table.id });
  }
});
it('rejects tampered, cross-user, cross-tenant, changed-connection and expired contexts', async () => {
  const { result } = await tables(); const receipt = result.tables[0].receipt;
  await expect(Fgts.simulate(db, 'tenant-b', 'user-a', { receipt })).rejects.toThrow();
  await expect(Fgts.simulate(db, 'tenant-a', 'user-b', { receipt })).rejects.toThrow();
  await expect(Fgts.simulate(db, 'tenant-a', 'user-a', { receipt: receipt + 'x' })).rejects.toThrow();
  vi.spyOn(Bank, 'config').mockResolvedValue({ ...config, fgtsEnabled: false } as any);
  await expect(Fgts.simulate(db, 'tenant-a', 'user-a', { receipt })).rejects.toThrow('mudou');
  const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60000);
  await expect(Fgts.simulate(db, 'tenant-a', 'user-a', { receipt })).rejects.toThrow('vencida');
});
it('rejects non-array responses, negative offers, invalid schedule and missing values', async () => {
  const { result, call } = await tables();
  call.mockResolvedValue([offer, { ...offer, valorLiquido: -1 }, { ...offer, prazo: 5 }, { ...offer, parcelas: [{ dataRepasse: '2027-02-31', valor: 500 }], prazo: 1 }, { ...offer, valorLiquido: undefined }]);
  expect((await Fgts.simulate(db, 'tenant-a', 'user-a', { receipt: result.tables[0].receipt })).offers).toHaveLength(1);
  call.mockResolvedValue({ message: 'not-an-offer' });
  await expect(Fgts.simulate(db, 'tenant-a', 'user-a', { receipt: result.tables[0].receipt })).rejects.toThrow('formato');
});
it('uses the bank host and Bearer for FGTS even with CLT disabled; origination stays blocked', async () => {
  vi.spyOn(Bank, 'token').mockResolvedValue('fictional-token');
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([offer]))); vi.stubGlobal('fetch', fetchMock);
  await Bank.request(db, 'tenant-a', 'promoter-a', '/v3/operacoes/fgts/simulacao', { cpf, tabelaId: 9939, cdc: false });
  const call: any = fetchMock.mock.calls[0]; expect(call[0]).toBe('https://presenca-bank-api.azurewebsites.net/v3/operacoes/fgts/simulacao'); expect(call[1].headers.Authorization).toBe('Bearer fictional-token'); expect(call[1].redirect).toBe('error');
  await expect(Bank.request(db, 'tenant-a', 'promoter-a', '/v2/operacoes/fgts', {})).rejects.toThrow('não permitida');
  await expect(Bank.request(db, 'tenant-a', 'promoter-a', '/v6/operacoes/simulacao/disponiveis', {})).rejects.toThrow('CLT não habilitado');
});
