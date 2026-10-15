import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParanaBankService, paranaFinancial } from '../server/services/paranaBankService';
import { proposalSyncProvider } from '../src/services/proposalBatchSync';
import { registerParanaRoutes } from '../server/services/paranaRoutes';
import express from 'express';
import request from 'supertest';

const guid = '11111111-2222-4333-8444-555555555555';
const proposal: any = { id: 'p-a', tenantId: 'tenant-a', promoterId: 'promoter-a', bankId: 'bank-a', clientId: 'client-a', partnerId: 'partner-a', version: 1, statusId: 'old', proposalNumber: 'DEMO-123', bank: { code: '254', name: 'Paraná Banco' }, client: { cpf: '00000000000' } };
const remote = { codigoDaProposta: guid, numeroDaProposta: 'DEMO-123', codigoDoPromotor: 'PROM-DEMO', status: 'AguardandoRetornoAverbacao', cliente: { cpf: '000.000.000-00' }, simulacao: { valorLiberadoParaOCliente: 4500, valorBruto: 5000, valorDaParcela: 100, totalDeParcelas: 84, saldoDevedor: 0 } };
function fake() {
  const config = new Map<string, any>();
  const identity = (tenantId: string, configKey: string) => `${tenantId}|${configKey}`;
  const db: any = {
    systemConfig: {
      findUnique: vi.fn(async ({ where }: any) => config.get(identity(where.tenantId_configKey.tenantId, where.tenantId_configKey.configKey)) || null),
      upsert: vi.fn(async ({ where, create, update }: any) => { const key = identity(where.tenantId_configKey.tenantId, where.tenantId_configKey.configKey); const value = config.has(key) ? { ...config.get(key), ...update } : create; config.set(key, value); return value; }),
    },
    bank: { findFirst: vi.fn(async () => ({ id: 'bank-a', code: '254', name: 'Paraná Banco' })) },
    promoter: { findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' && where.id === 'promoter-a' ? [{ id: 'promoter-a', name: 'Promotora fictícia' }] : []) },
    proposal: { findFirst: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? { ...proposal } : null), updateMany: vi.fn(async () => ({ count: 1 })) },
    proposalStatus: { findFirst: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? { id: 'new', name: 'Em averbação', standardCategory: 'ANDAMENTO' } : null) },
    statusHistory: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (action: any) => action(db)),
  };
  const save = (environment = 'homologation', promoterId = 'promoter-a') => ParanaBankService.save(db, 'tenant-a', promoterId, { environment, enabled: true, clientId: 'fictional-client', clientSecret: 'fictional-secret+&=%', bankId: 'bank-a', promoterCode: 'PROM-DEMO' });
  return { db, config, save };
}
const previousSecret = process.env.JWT_SECRET;
beforeEach(() => { process.env.JWT_SECRET = 'fictional-parana-test-secret'; });
afterEach(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('Paraná API — in-memory data and mocked requests only', () => {
  it('keeps credentials independent and preserves legacy credentials only in their own environment', async () => {
    const { db, config, save } = fake(); await save();
    config.delete(`tenant-a|${ParanaBankService.configKey('promoter-a')}:homologation`);
    const input = { environment: 'production', enabled: true, clientId: 'production-client', clientSecret: '', bankId: 'bank-a', promoterCode: 'PROD' };
    await expect(ParanaBankService.save(db, 'tenant-a', 'promoter-a', input)).rejects.toThrow('client_secret');
    await ParanaBankService.save(db, 'tenant-a', 'promoter-a', { ...input, clientSecret: 'production-secret' });
    expect((await ParanaBankService.config(db, 'tenant-a', 'promoter-a', 'homologation')).clientSecret).toBe('fictional-secret+&=%');
    await ParanaBankService.save(db, 'tenant-a', 'promoter-a', { ...input, environment: 'homologation', clientId: 'hom-client' });
    expect((await ParanaBankService.config(db, 'tenant-a', 'promoter-a')).clientSecret).toBe('fictional-secret+&=%');
    expect((await ParanaBankService.config(db, 'tenant-a', 'promoter-a', 'production')).clientSecret).toBe('production-secret');
    expect((await ParanaBankService.config(db, 'tenant-a', 'promoter-a')).environment).toBe('homologation');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'demo', expires_in: 300 })));
    vi.stubGlobal('fetch', fetchMock);
    await ParanaBankService.token(db, 'tenant-a', 'promoter-a', true, 'production');
    const call: any = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://api-marketplace.paranabanco.com.br/v1/auth/token');
    expect(new URLSearchParams(call[1].body).get('client_secret')).toBe('production-secret');
    expect((await ParanaBankService.config(db, 'tenant-a', 'promoter-a')).environment).toBe('homologation');
  });
  it('encrypts credentials, scopes connections and honors the actual expires_in', async () => {
    const { db, config, save } = fake(); await save();
    expect(JSON.stringify([...config.values()])).not.toContain('fictional-secret');
    expect(ParanaBankService.metadata(await ParanaBankService.config(db, 'tenant-a', 'promoter-a'))).not.toHaveProperty('clientSecret');
    expect((await ParanaBankService.config(db, 'tenant-b', 'promoter-a')).enabled).toBe(false);
    let now = 1000000; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'fictional-token', expires_in: 300 }), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    await ParanaBankService.token(db, 'tenant-a', 'promoter-a'); now += 260000; await ParanaBankService.token(db, 'tenant-a', 'promoter-a'); expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 20000; await ParanaBankService.token(db, 'tenant-a', 'promoter-a'); expect(fetchMock).toHaveBeenCalledTimes(2);
    const call: any = fetchMock.mock.calls[0]; expect(call[0]).toBe('https://api-marketplace-hom.paranabanco.com.br/v1/auth/token');
    const body = new URLSearchParams(call[1].body); expect(body.get('grant_type')).toBe('client_credentials'); expect(body.get('client_secret')).toBe('fictional-secret+&=%');
  });
  it('uses the resource prefix, cursor and mandatory headers; excludes other promoter codes', async () => {
    const { db, save } = fake(); await save();
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/auth/') ? { access_token: 'fictional-token', expires_in: 300 } : { indiceDaPagina: 'cursor-next', propostas: [{ numeroDaProposta: 'demo', codigoDoPromotor: 'PROM-DEMO', status: 'Novo' }, { numeroDaProposta: 'foreign', codigoDoPromotor: 'OTHER' }] }), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    const result = await ParanaBankService.list(db, 'tenant-a', 'promoter-a', { indiceDaPagina: 'cursor-in', quantidadeDeItens: 100 });
    expect(result.propostas).toHaveLength(1); expect(result.ignoredCount).toBe(1); expect(result.indiceDaPagina).toBe('cursor-next');
    const call: any = fetchMock.mock.calls[1]; expect(call[0]).toContain('/consignado-cartao/v1/propostas?QuantidadeDeItens=100&IndiceDaPagina=cursor-in'); expect(call[1].headers).toMatchObject({ Authorization: 'Bearer fictional-token', 'X-Client-Id': 'fictional-client' });
    await expect(ParanaBankService.list(db, 'tenant-a', 'promoter-a', { quantidadeDeItens: 101 })).rejects.toThrow('1 e 100');
    await expect(ParanaBankService.request(db, 'tenant-a', 'promoter-a', 'POST', '/v1/formalizacao', {})).rejects.toThrow('não autorizada');
  });
  it('handles 204 without parsing a body and does not expose bank error payloads', async () => {
    const { db, save } = fake(); await save();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/auth/') ? new Response(JSON.stringify({ access_token: 'fictional-token', expires_in: 300 }), { status: 200 }) : new Response(null, { status: 204 })));
    expect((await ParanaBankService.list(db, 'tenant-a', 'promoter-a', {})).propostas).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('private-provider-details', { status: 403 })));
    await expect(ParanaBankService.list(db, 'tenant-a', 'promoter-a', {})).rejects.toThrow('HTTP 403');
  });
  it('verifies CPF, proposal and promoter before any financial or status write', async () => {
    const { db, config, save } = fake(); await save();
    const response = vi.spyOn(ParanaBankService, 'request').mockResolvedValue({ propostas: [{ ...remote, cliente: { cpf: '11111111111' } }] });
    await expect(ParanaBankService.sync(db, 'tenant-a', 'p-a', 'user')).rejects.toThrow('mesmo CPF'); expect(db.proposal.updateMany).not.toHaveBeenCalled();
    response.mockResolvedValue({ propostas: [{ ...remote, codigoDoPromotor: 'OTHER' }] });
    await expect(ParanaBankService.sync(db, 'tenant-a', 'p-a', 'user')).rejects.toThrow('promotor');
    config.set('tenant-a|integration:parana:promoter-a:status_mappings', { configValue: JSON.stringify([{ externalStatus: remote.status, internalStatusId: 'new' }]) });
    response.mockResolvedValue({ propostas: [remote] });
    const result = await ParanaBankService.sync(db, 'tenant-a', 'p-a', 'user'); expect(result.statusMapped).toBe(true);
    expect(db.proposal.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', promoterId: 'promoter-a', version: 1, partnerId: 'partner-a' }), data: expect.objectContaining({ releasedValue: 4500, contractValue: 5000, installmentsCount: 84, statusId: 'new' }) }));
    expect(db.statusHistory.create).toHaveBeenCalledTimes(1);
    await expect(ParanaBankService.sync(db, 'tenant-b', 'p-a', 'user')).rejects.toThrow('não encontrada');
  });
  it('preserves zero, rejects invalid amounts, and routes batch queries to Paraná', () => {
    expect(paranaFinancial({ simulacao: { valorLiberadoParaOCliente: 0, saldoDevedor: 0 } })).toEqual({ releasedValue: 0, debtBalance: 0 });
    expect(() => paranaFinancial({ valorDaParcela: -1 })).toThrow();
    expect(() => paranaFinancial({ totalDeParcelas: 1.5 })).toThrow();
    expect(proposalSyncProvider({ bankId: 'bank-a' } as any, [{ id: 'bank-a', code: '254', name: 'Paraná' }] as any)).toBe('parana');
    expect(() => proposalSyncProvider({ bankId: 'bank-a', workbankSource: true } as any, [])).toThrow('WorkBank');
  });
  it('requires staff permissions and refuses a foreign promoter over HTTP', async () => {
    const { db } = fake(); const app = express(); app.use(express.json()); let session: any = null;
    registerParanaRoutes(app, db, async () => session);
    expect((await request(app).get('/api/integrations/parana/config?promoterId=promoter-a')).status).toBe(401);
    session = { user: { id: 'user' }, effectiveTenantId: 'tenant-a', activeRole: 'USUARIO', activePermissions: [] };
    expect((await request(app).put('/api/integrations/parana/config?promoterId=promoter-a').send({})).status).toBe(403);
    session.activeRole = 'MASTER'; expect((await request(app).get('/api/integrations/parana/config?promoterId=other')).status).toBe(400);
  });
});
