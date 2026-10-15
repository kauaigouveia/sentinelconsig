import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PresencaBankService as Bank } from '../server/services/presencaBankService';
import { registerPresencaRoutes } from '../server/services/presencaRoutes';

const cpf = '52998224725';
const actor = { tenantId: 'tenant-a', userId: 'user-a' };
const input = { cpf, name: 'Cliente Ficticio', phone: '11999999999' };
const credentials = { environment: 'production', enabled: true, cltEnabled: true, login: 'fake-login', password: 'fake-password' };
const oldSecret = process.env.JWT_SECRET;
function fake() {
  const rows = new Map<string, any>();
  const identity = (where: any) => `${where.tenantId_configKey.tenantId}|${where.tenantId_configKey.configKey}`;
  const db: any = {
    promoter: { findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' && (!where.id || ['promoter-a', 'promoter-b'].includes(where.id)) ? [{ id: where.id || 'promoter-a', name: 'Ficticia' }] : []) },
    systemConfig: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(identity(where)) || null),
      upsert: vi.fn(async ({ where, create, update }: any) => { const value = rows.has(identity(where)) ? { ...rows.get(identity(where)), ...update } : create; rows.set(identity(where), value); return value; }),
    },
    $transaction: vi.fn(async (action: any) => action(db)),
  };
  return { db, rows };
}
async function journey() {
  const { db } = fake(); await Bank.save(db, actor.tenantId, 'promoter-a', credentials);
  const call = vi.spyOn(Bank, 'request').mockResolvedValue({ autorizacaoId: 'fake-authorization', shortUrl: 'https://sign.presen.ca/example' });
  const consent: any = await Bank.journey(db, actor.tenantId, actor.userId, 'consent', input);
  call.mockResolvedValue({ id: [{ cpf, matricula: '123', numeroInscricaoEmpregador: '12345678', elegivel: true }, { cpf, matricula: '456', numeroInscricaoEmpregador: '87654321', elegivel: false }] });
  const employees: any = await Bank.journey(db, actor.tenantId, actor.userId, 'employments', { receipt: consent.results[0].receipt, clientConfirmed: true });
  call.mockResolvedValue({ registroEmpregaticio: '123', cnpjEmpregador: '12345678', valorMargemDisponivel: 500, dataNascimento: '1990-01-01', nomeMae: 'Mae Ficticia', sexo: 'F' });
  const margin: any = await Bank.journey(db, actor.tenantId, actor.userId, 'margin', { receipt: employees.choices[0].receipt });
  return { db, call, consent, employees, margin };
}
beforeEach(() => { process.env.JWT_SECRET = 'fictional-presenca-test-secret'; });
afterEach(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Presença — mocked bank and memory database only', () => {
  it('encrypts credentials and separates companies, promoters and environments', async () => {
    const { db, rows } = fake();
    const safe = await Bank.save(db, 'tenant-a', 'promoter-a', credentials);
    expect(safe).not.toHaveProperty('login'); expect(safe).not.toHaveProperty('password');
    expect(JSON.stringify([...rows.values()])).not.toContain('fake-password');
    expect((await Bank.config(db, 'tenant-b', 'promoter-a')).enabled).toBe(false);
    expect((await Bank.config(db, 'tenant-a', 'promoter-b')).enabled).toBe(false);
    await Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, environment: 'homologation', enabled: false, login: 'hom-login', password: 'hom-password' });
    expect((await Bank.config(db, 'tenant-a', 'promoter-a', 'production')).password).toBe('fake-password');
    expect((await Bank.config(db, 'tenant-a', 'promoter-a', 'homologation')).password).toBe('hom-password');
    await expect(Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, environment: 'homologation' })).rejects.toThrow('não confirmada');
    await expect(Bank.save(db, 'tenant-b', 'promoter-a', credentials)).rejects.toThrow('promotora ativa');
  });
  it('does not inherit production credentials into homologation or enable without credentials', async () => {
    const { db } = fake(); await Bank.save(db, 'tenant-a', 'promoter-a', credentials);
    const hom = await Bank.config(db, 'tenant-a', 'promoter-a', 'homologation'); expect(hom.login).toBe(''); expect(hom.password).toBe('');
    await expect(Bank.save(db, 'tenant-a', 'promoter-b', { ...credentials, login: '', password: '' })).rejects.toThrow('login e senha');
    await Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, login: '', password: '' });
    expect((await Bank.config(db, 'tenant-a', 'promoter-a')).password).toBe('fake-password');
  });
  it('saves FGTS activation independently and preserves it for older configuration clients', async () => {
    const { db } = fake();
    await Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, fgtsEnabled: true, cltEnabled: false });
    expect(await Bank.available(db, 'tenant-a', 'fgts')).toEqual(['promoter-a']);
    expect(await Bank.available(db, 'tenant-a', 'clt')).toEqual([]);
    await Bank.save(db, 'tenant-a', 'promoter-a', credentials);
    expect((await Bank.config(db, 'tenant-a', 'promoter-a')).fgtsEnabled).toBe(true);
    await Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, fgtsEnabled: false });
    expect(await Bank.available(db, 'tenant-a', 'fgts')).toEqual([]);
  });
  it('authenticates at the fixed host and caches using expireAt and connection fingerprint', async () => {
    const { db } = fake(); await Bank.save(db, 'tenant-a', 'promoter-a', credentials);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: 'fictional-token', expireAt: new Date(Date.now() + 120000).toISOString() })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await Bank.token(db, 'tenant-a', 'promoter-a', true)).toBe('fictional-token');
    await Bank.token(db, 'tenant-a', 'promoter-a'); expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://presenca-bank-api.azurewebsites.net/login'); expect(call[1].redirect).toBe('error');
    expect(JSON.parse(call[1].body as string)).toEqual({ login: credentials.login, senha: credentials.password });
    await Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, password: 'changed-password' });
    await Bank.token(db, 'tenant-a', 'promoter-a'); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed authentication, disallowed endpoints and raw upstream errors', async () => {
    const { db } = fake(); await Bank.save(db, 'tenant-a', 'promoter-a', credentials);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: 'fictional-token', expireAt: 'bad-date' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(Bank.token(db, 'tenant-a', 'promoter-a', true)).rejects.toThrow('não autenticou');
    await expect(Bank.request(db, 'tenant-a', 'promoter-a', '/v3/operacoes', {})).rejects.toThrow('não permitida');
    await expect(Bank.request(db, 'tenant-a', 'promoter-a', 'https://example.test', {})).rejects.toThrow('não permitida');
    vi.spyOn(Bank, 'token').mockResolvedValue('fictional-token');
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ message: `private ${cpf} fake-password` }), { status: 400 }));
    try { await Bank.request(db, 'tenant-a', 'promoter-a', '/consultas/termo-inss', {}); throw new Error('Expected failure'); } catch (error: any) { expect(error.message).toContain('HTTP 400'); expect(error.message).not.toContain(cpf); expect(error.message).not.toContain('fake-password'); }
  });
  it('binds journey to actor, tenant, step, connection and technical expiration', async () => {
    const { db, consent, margin } = await journey(); const receipt = consent.results[0].receipt;
    expect(receipt).not.toContain(cpf);
    await expect(Bank.context(db, 'tenant-b', 'user-a', receipt, 'consent')).rejects.toThrow('outra sessão/empresa');
    await expect(Bank.context(db, 'tenant-a', 'user-b', receipt, 'consent')).rejects.toThrow('outra sessão/empresa');
    await expect(Bank.context(db, 'tenant-a', 'user-a', receipt, 'margin')).rejects.toThrow();
    await expect(Bank.context(db, 'tenant-a', 'user-a', receipt + 'x', 'consent')).rejects.toThrow();
    await Bank.save(db, 'tenant-a', 'promoter-a', { ...credentials, password: 'changed' });
    await expect(Bank.context(db, 'tenant-a', 'user-a', margin.receipt, 'margin')).rejects.toThrow('mudou');
    const future = Date.now() + 3600000; vi.spyOn(Date, 'now').mockReturnValue(future);
    await expect(Bank.context(db, 'tenant-a', 'user-a', receipt, 'consent')).rejects.toThrow('vencida');
  });
  it('requires reported client signature, filters foreign CPF and never signs a term', async () => {
    const { db, call, consent, employees } = await journey(); expect(employees.choices).toHaveLength(1);
    await expect(Bank.journey(db, 'tenant-a', 'user-a', 'employments', { receipt: consent.results[0].receipt })).rejects.toThrow('assinar');
    call.mockResolvedValue({ id: [{ cpf: '11111111111', matricula: '123', numeroInscricaoEmpregador: '12345678', elegivel: true }] });
    const result: any = await Bank.journey(db, 'tenant-a', 'user-a', 'employments', { receipt: consent.results[0].receipt, clientConfirmed: true }); expect(result.choices).toEqual([]);
    expect(call.mock.calls.some(row => String(row[3]).includes('autorizacaoId'))).toBe(false);
  });
  it('uses v6, bank margin and correct product/empty fields, rejecting negative or test offers', async () => {
    const { db, call, margin } = await journey();
    const offer = { id: 9942, nome: 'Tabela ficticia', prazo: 18, taxaJuros: 4.52, valorLiberado: 4906.06, tipoCredito: { id: 1 }, type: 'credito-privado-v2', valorParcela: 300, teste: false, valorSeguro: 0 };
    call.mockResolvedValue([offer, { ...offer, valorLiberado: -1 }, { ...offer, teste: true }, { ...offer, valorParcela: 600 }, { ...offer, tipoCredito: { id: 2 } }]);
    const input = { receipt: margin.receipt, installment: 300, email: 'cliente@example.test' };
    const result: any = await Bank.journey(db, 'tenant-a', 'user-a', 'offers', input); expect(result.offers).toHaveLength(1); expect(result.offers[0].rate).toBe(4.52);
    const last = call.mock.calls.at(-1)!; expect(last[3]).toBe('/v6/operacoes/simulacao/disponiveis');
    expect(last[4]).toMatchObject({ proposta: { produtoId: 28, valorSolicitado: 0, quantidadeParcelas: 0, valorParcela: 300 }, tomador: { endereco: { cep: '', estado: '' }, dadosBancarios: { codigoBanco: null }, dataNascimento: '1990-01-01' } });
    await expect(Bank.journey(db, 'tenant-a', 'user-a', 'offers', { ...input, installment: 501 })).rejects.toThrow('margem');
    await expect(Bank.journey(db, 'tenant-a', 'user-a', 'offers', { ...input, installment: -5 })).rejects.toThrow('positiva');
  });
  it('rejects mismatched margin and unknown consent hosts', async () => {
    const { db, call, employees } = await journey();
    call.mockResolvedValue({ registroEmpregaticio: 'other', cnpjEmpregador: '12345678', valorMargemDisponivel: 500 });
    await expect(Bank.journey(db, 'tenant-a', 'user-a', 'margin', { receipt: employees.choices[0].receipt })).rejects.toThrow('compatíveis');
    call.mockResolvedValue({ autorizacaoId: 'fake', shortUrl: 'https://evil.example.test/consent' });
    await expect(Bank.journey(db, 'tenant-a', 'user-a', 'consent', input)).rejects.toThrow('reconhecido');
  });
  it('authorizes each route and rejects partner access and foreign promoters', async () => {
    const { db } = fake(); let session: any = null;
    const app = express(); app.use(express.json()); registerPresencaRoutes(app, db, async () => session);
    expect((await request(app).get('/api/integrations/presenca/availability')).status).toBe(401);
    session = { user: { id: 'u', tenantId: 'tenant-a' }, activeRole: 'USUARIO', activePermissions: [] };
    expect((await request(app).get('/api/integrations/presenca/config?promoterId=promoter-a')).status).toBe(403);
    session.activeRole = 'MASTER';
    expect((await request(app).get('/api/integrations/presenca/config?promoterId=foreign')).status).toBe(400);
    expect((await request(app).get('/api/integrations/presenca/config?promoterId=promoter-a')).status).toBe(200);
    session.user.partnerId = 'partner-a';
    expect((await request(app).get('/api/integrations/presenca/availability')).status).toBe(403);
    session.user.partnerId = undefined; session.effectiveTenantId = 'tenant-b';
    expect((await request(app).get('/api/integrations/presenca/config?promoterId=promoter-a')).status).toBe(400);
  });
});
