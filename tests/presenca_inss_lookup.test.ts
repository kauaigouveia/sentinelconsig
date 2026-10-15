import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PresencaBankService as Bank } from '../server/services/presencaBankService';
import { PresencaInssLookup as Lookup } from '../server/services/presencaInssLookup';
const cpf = '52998224725';
const config = { environment: 'production', enabled: true, login: 'fictional-login', password: 'fictional-password', cltEnabled: false, fgtsEnabled: false, inssLookupEnabled: true };
const db: any = { promoter: { findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? [{ id: where.id || 'promoter-a', name: 'Ficticia' }] : []) } };
const previous = process.env.JWT_SECRET;
beforeEach(() => { process.env.JWT_SECRET = 'fictional-benefits-secret'; vi.spyOn(Bank, 'config').mockResolvedValue(config as any); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
async function list() { const call = vi.spyOn(Bank, 'request').mockResolvedValue([{ numeroBeneficio: '1234567890', valorBeneficio: 1500, especie: '41' }, { numeroBeneficio: '1234567891', valorBeneficio: 1200, especie: '21' }]); return { result: await Lookup.list(db, 'tenant-a', 'user-a', { cpf }), call }; }
const detail = { cpf, nome: 'Cliente Ficticio', numeroBeneficio: '1234567890', especie: '41', dataNascimento: '1960-01-01T00:00:00', dataConcessao: '2021-01-06T00:00:00', valorBeneficio: 1500, margemResidual: 500.5, margemCartao: 75, margemCartaoBeneficio: 75, ufBeneficio: 'AL', bancoPagamento: '237', agenciaPagamento: '1234', numeroConta: 'sensitive-not-returned', sexo: 'Feminino' };
it('gets all benefits with sealed source context without exposing promoter or CPF in API URL to browser', async () => {
  const { result, call } = await list(); expect(result.benefits).toHaveLength(2);
  expect(call.mock.calls[0]).toEqual([db, 'tenant-a', 'promoter-a', `/v2/consultas/inss/${cpf}/beneficios`, undefined, 'GET']);
  expect(result.benefits[0]).not.toHaveProperty('promoterId'); expect(result.benefits[0].receipt).not.toContain(cpf);
  await expect(Lookup.list(db, 'tenant-a', 'user-a', { cpf: '00000000000' })).rejects.toThrow('CPF válido');
});
it('returns only mapped benefit fields and preserves residual margin separately from income/card margins', async () => {
  const { result, call } = await list(); call.mockResolvedValue(detail);
  const returned = await Lookup.detail(db, 'tenant-a', 'user-a', { receipt: result.benefits[0].receipt, cpf: '11111111111', benefit: 'wrong' });
  expect(returned.detail).toMatchObject({ name: 'Cliente Ficticio', birthDate: '1960-01-01', benefitStartDate: '2021-01-06', income: 1500, margin: 500.5, cardMargin: 75, benefitState: 'AL' });
  expect(returned.detail).not.toHaveProperty('numeroConta'); expect(JSON.stringify(returned)).not.toContain('sensitive-not-returned');
  expect(call.mock.calls.at(-1)?.[3]).toBe(`/v2/consultas/inss/${cpf}/beneficio/1234567890/detalhe`);
});
it('rejects another CPF/benefit, tenant, user, altered context and expired/changed connection', async () => {
  const { result, call } = await list(); const receipt = result.benefits[0].receipt;
  for (const row of [{ ...detail, cpf: '11111111111' }, { ...detail, numeroBeneficio: '1234567891' }]) { call.mockResolvedValue(row); await expect(Lookup.detail(db, 'tenant-a', 'user-a', { receipt })).rejects.toThrow('não corresponde'); }
  await expect(Lookup.detail(db, 'tenant-b', 'user-a', { receipt })).rejects.toThrow();
  await expect(Lookup.detail(db, 'tenant-a', 'user-b', { receipt })).rejects.toThrow();
  await expect(Lookup.detail(db, 'tenant-a', 'user-a', { receipt: receipt + 'x' })).rejects.toThrow();
  vi.spyOn(Bank, 'config').mockResolvedValue({ ...config, inssLookupEnabled: false } as any); await expect(Lookup.detail(db, 'tenant-a', 'user-a', { receipt })).rejects.toThrow('mudou');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60000); await expect(Lookup.detail(db, 'tenant-a', 'user-a', { receipt })).rejects.toThrow('vencida');
});
it('keeps unavailable or negative financial data null and rejects malformed benefit lists', async () => {
  const { result, call } = await list(); call.mockResolvedValue({ ...detail, valorBeneficio: null, margemResidual: -1, margemCartao: '75', ufBeneficio: null, dataNascimento: 'bad' });
  expect((await Lookup.detail(db, 'tenant-a', 'user-a', { receipt: result.benefits[0].receipt })).detail).toMatchObject({ income: null, margin: null, cardMargin: null, benefitState: null, birthDate: null });
  call.mockResolvedValue({ benefits: [] }); await expect(Lookup.list(db, 'tenant-a', 'user-a', { cpf })).rejects.toThrow('não reconhecido');
});
it('allows only exact GET lookup paths and requires lookup-specific activation', async () => {
  vi.spyOn(Bank, 'token').mockResolvedValue('fictional-token'); const fetchMock = vi.fn(async () => new Response(JSON.stringify([detail]))); vi.stubGlobal('fetch', fetchMock);
  const path = `/v2/consultas/inss/${cpf}/beneficios`;
  await Bank.request(db, 'tenant-a', 'promoter-a', path, undefined, 'GET');
  const call: any = fetchMock.mock.calls[0]; expect(call[1]).toMatchObject({ method: 'GET', body: undefined, headers: { Authorization: 'Bearer fictional-token' }, redirect: 'error' });
  await expect(Bank.request(db, 'tenant-a', 'promoter-a', path, {})).rejects.toThrow('não permitida');
  await expect(Bank.request(db, 'tenant-a', 'promoter-a', path + '?cpf=other', undefined, 'GET')).rejects.toThrow('não permitida');
  await expect(Bank.request(db, 'tenant-a', 'promoter-a', '/v5/operacoes/simulacao/disponiveis', {})).rejects.toThrow('não permitida');
  vi.spyOn(Bank, 'config').mockResolvedValue({ ...config, inssLookupEnabled: false } as any);
  await expect(Bank.request(db, 'tenant-a', 'promoter-a', path, undefined, 'GET')).rejects.toThrow('não habilitado');
});
