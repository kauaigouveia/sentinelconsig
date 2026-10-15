import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbankService, normalizeWorkbankRow, workbankAgentKey } from '../server/services/workbankService';
import { proposalSyncProvider } from '../src/services/proposalBatchSync';
import { decorateWorkbankProposals } from '../server/services/workbankRoutes';
import { registerWorkbankRoutes } from '../server/services/workbankRoutes';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';

const raw = { idProposta: 'test-1', nrProposta: 'DEMO-WB-1', nmAgente: 'EXEMPLO - AGENTE FICTICIO', nmBanco: 'BANCO FICTICIO', dsProduto: 'TABELA FICTICIA', dsConvenio: 'INSS', DsSituacao: 'EM ANALISE', dsTipoProposta: 'NOVO', nrCPF: '52998224725', nmCliente: 'CLIENTE FICTICIO', dtInclusao: '2026-10-10T10:00:00-03:00', qtParcela: 84, vrParcela: 100, VAL_BRUTO: 5000, vrSaldoRefin: 0, vrLiquido: 4500 };
function fakeDb() {
  const configs = new Map<string, any>(), proposals: any[] = [];
  const configId = (tenantId: string, configKey: string) => `${tenantId}|${configKey}`;
  const db: any = {
    systemConfig: {
      findUnique: vi.fn(async ({ where }: any) => configs.get(configId(where.tenantId_configKey.tenantId, where.tenantId_configKey.configKey)) || null),
      findFirst: vi.fn(async ({ where }: any) => [...configs.values()].find(row => row.id === where.id && row.tenantId === where.tenantId && row.configKey.startsWith(where.configKey.startsWith)) || null),
      findMany: vi.fn(async ({ where }: any) => [...configs.values()].filter(row => row.tenantId === where.tenantId && (where.configKey.in ? where.configKey.in.includes(row.configKey) : row.configKey.startsWith(where.configKey.startsWith)))),
      upsert: vi.fn(async ({ create, update }: any) => { const id = configId(create.tenantId, create.configKey), row = configs.get(id); configs.set(id, row ? { ...row, ...update } : { id, ...create }); return configs.get(id); }),
      create: vi.fn(async ({ data }: any) => { const id = configId(data.tenantId, data.configKey); const row = { id, ...data }; configs.set(id, row); return row; }),
      updateMany: vi.fn(async ({ where, data }: any) => { const row = [...configs.values()].find(item => item.id === where.id && item.tenantId === where.tenantId && item.configValue === where.configValue); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; }),
    },
    partner: { findFirst: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' && where.promoterId === 'promoter-a' && where.id === 'partner-a' ? { id: 'partner-a' } : null) },
    promoter: { findMany: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' && where.id === 'promoter-a' ? [{ id: 'promoter-a', name: 'Promotora fictícia' }] : []) },
    bank: { findFirst: vi.fn(async () => ({ id: 'bank-a' })) }, bankPromoter: { findFirst: vi.fn(async () => ({ id: 'link' })) },
    product: { findFirst: vi.fn(async () => ({ id: 'product-a' })) }, convenio: { findFirst: vi.fn(async () => ({ id: 'agreement-a' })) },
    proposalStatus: { findFirst: vi.fn(async ({ where }: any) => where.tenantId === 'tenant-a' && where.id === 'status-a' ? { id: 'status-a', name: 'Em análise', standardCategory: 'ANDAMENTO' } : null) },
    client: { findUnique: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => ({ id: 'client-a', ...data })) },
    proposal: {
      findUnique: vi.fn(async ({ where }: any) => proposals.find(row => row.tenantId === where.tenantId_proposalNumber.tenantId && row.proposalNumber === where.tenantId_proposalNumber.proposalNumber) || null),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `proposal-${proposals.length + 1}`, ...data }; proposals.push(row); return row; }),
      update: vi.fn(),
    }, statusHistory: { create: vi.fn(async () => ({})) },
    $transaction: async (fn: any) => {
      const snapshot = structuredClone([...configs.entries()]), previous = [...proposals];
      try { return await fn(db); } catch (err) { configs.clear(); snapshot.forEach(([key, value]: any) => configs.set(key, value)); proposals.splice(0, proposals.length, ...previous); throw err; }
    },
  };
  return { db, configs, proposals };
}
const secret = process.env.JWT_SECRET;
beforeEach(() => { process.env.JWT_SECRET = 'fictional-workbank-test-secret'; });
afterEach(() => { if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('WorkBank — no live network or database', () => {
  it('preserves names exactly, strips excess spaces and never matches a partial agent name', () => {
    expect(workbankAgentKey(' Exemplo   - Agente ')).toBe('EXEMPLO - AGENTE');
    expect(workbankAgentKey('EXEMPLO')).not.toBe(workbankAgentKey('EXEMPLO - AGENTE'));
    expect(normalizeWorkbankRow(raw).releasedValue).toBe(4500);
    expect(() => normalizeWorkbankRow({ ...raw, vrLiquido: -1 })).toThrow();
    expect(() => normalizeWorkbankRow({ ...raw, qtParcela: null })).toThrow();
  });
  it('encrypts credentials and scopes exact-name aliases by tenant and promoter', async () => {
    const { db, configs } = fakeDb();
    await WorkbankService.save(db, 'tenant-a', 'promoter-a', { enabled: true, username: 'example', clientKey: 'fictional-client-secret', publicKey: 'fictional-public-secret', authOrigin: 'https://go-api.workbankvirtual.com.br', extractOrigin: 'https://goapi.workbankvirtual.com.br' });
    expect(JSON.stringify([...configs.values()])).not.toContain('fictional-client-secret');
    expect(WorkbankService.metadata(await WorkbankService.config(db, 'tenant-a', 'promoter-a'))).not.toHaveProperty('clientKey');
    await WorkbankService.bindAgent(db, 'tenant-a', 'promoter-a', raw.nmAgente, 'partner-a');
    expect(await WorkbankService.agent(db, 'tenant-a', 'promoter-a', raw.nmAgente)).toMatchObject({ id: 'partner-a' });
    expect(await WorkbankService.agent(db, 'tenant-b', 'promoter-a', raw.nmAgente)).toBeNull();
    expect(await WorkbankService.agent(db, 'tenant-a', 'promoter-b', raw.nmAgente)).toBeNull();
    expect(await WorkbankService.agent(db, 'tenant-a', 'promoter-a', 'EXEMPLO')).toBeNull();
    await expect(WorkbankService.bindAgent(db, 'tenant-b', 'promoter-a', raw.nmAgente, 'partner-a')).rejects.toThrow();
    await expect(WorkbankService.save(db, 'tenant-a', 'promoter-a', { authOrigin: 'http://localhost', extractOrigin: 'https://attacker.test' })).rejects.toThrow('HTTPS');
  });
  it('uses documented headers, stages repeated pages idempotently, and never creates production without a partner', async () => {
    const { db, configs } = fakeDb();
    await WorkbankService.save(db, 'tenant-a', 'promoter-a', { enabled: true, username: 'example', clientKey: 'client', publicKey: 'public', authOrigin: 'https://go-api.workbankvirtual.com.br', extractOrigin: 'https://goapi.workbankvirtual.com.br' });
    const request = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/auth/') ? { token: 'fictional-token', expiresIn: 1 } : { pageNumber: 1, hasNextPage: true, totalPaginas: 2, propostaIntegracao: [raw] }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    for (let attempt = 0; attempt < 2; attempt++) {
      const batch = await WorkbankService.extract(db, 'tenant-a', 'promoter-a', 'user-a', { datainicio: '20261001', datatermino: '20261015', pageNumber: 1 });
      expect(batch.hasNextPage).toBe(true);
      const result = await WorkbankService.step(db, 'tenant-a', 'promoter-a', 'user-a', batch.batchId);
      expect(result).toEqual({ done: true, processed: 1, total: 1 });
      expect(await WorkbankService.step(db, 'tenant-a', 'promoter-a', 'user-a', batch.batchId)).toEqual(result);
      await expect(WorkbankService.step(db, 'tenant-b', 'promoter-a', 'user-a', batch.batchId)).rejects.toThrow();
    }
    expect(db.proposal.create).not.toHaveBeenCalled(); expect(db.client.create).not.toHaveBeenCalled();
    expect([...configs.values()].filter(row => row.configKey.includes('record:'))).toHaveLength(1);
    const records = await WorkbankService.records(db, 'tenant-a', 'promoter-a');
    expect(records.items[0].state).toBe('WAITING_AGENT'); expect(records.items[0].row.cpf).toBeUndefined();
    await expect(WorkbankService.publish(db, 'tenant-a', 'promoter-a', 'user-a', records.items[0].id, {}, true)).rejects.toThrow('Vincule');
    const auth = request.mock.calls[0] as any, extract = request.mock.calls[1] as any;
    expect(auth[1].headers).toMatchObject({ clientKey: 'client', publicKey: 'public' });
    expect(extract[1].headers).toMatchObject({ 'x-api-key': 'public', 'x-api-token': 'fictional-token' });
    expect(JSON.parse(extract[1].body)).toMatchObject({ acao: 'Extrair', tipoperiodo: 'DataOperacao', pageNumber: 1 });
  });
  it('requires a mapped status and explicit review; preserves financials and blocks duplicate publishing', async () => {
    const { db, configs, proposals } = fakeDb();
    const row = normalizeWorkbankRow(raw);
    const recordKey = `record:${createHash('sha256').update(row.id).digest('hex')}`;
    await WorkbankService.write(db, 'tenant-a', 'promoter-a', recordKey, { row, lastSyncAt: '2026-10-15' });
    await WorkbankService.bindAgent(db, 'tenant-a', 'promoter-a', row.agent, 'partner-a');
    const stored = [...configs.values()].find(value => value.configKey.endsWith(recordKey));
    const selection = { bankId: 'bank-a', productId: 'product-a', convenioId: 'agreement-a', type: 'NOVO' };
    await expect(WorkbankService.publish(db, 'tenant-a', 'promoter-a', 'user-a', stored.id, selection, true)).rejects.toThrow('Mapeie');
    configs.set('tenant-a|integration:workbank:promoter-a:status_mappings', { tenantId: 'tenant-a', configKey: 'integration:workbank:promoter-a:status_mappings', configValue: JSON.stringify([{ externalStatus: row.status, internalStatusId: 'status-a' }]) });
    const published = await WorkbankService.publish(db, 'tenant-a', 'promoter-a', 'user-a', stored.id, selection, true);
    expect(published.proposalId).toBeTruthy();
    expect(proposals[0]).toMatchObject({ tenantId: 'tenant-a', promoterId: 'promoter-a', partnerId: 'partner-a', releasedValue: 4500, contractValue: 5000, installmentsCount: 84, installmentValue: 100 });
    await expect(WorkbankService.publish(db, 'tenant-a', 'promoter-a', 'user-a', stored.id, selection, true)).rejects.toThrow('já foi');
    await expect(WorkbankService.publish(db, 'tenant-b', 'promoter-a', 'user-a', stored.id, selection, true)).rejects.toThrow('não encontrado');
    expect(proposals).toHaveLength(1);
  });
  it('marks source on staff proposals and never routes WorkBank through the bank API', async () => {
    const { db } = fakeDb();
    await db.systemConfig.create({ data: { tenantId: 'tenant-a', configKey: 'workbank:source:p-1', configValue: '{}', isSecret: false } });
    const rows = await decorateWorkbankProposals(db, 'tenant-a', [{ id: 'p-1' }, { id: 'p-2' }]);
    expect(rows[0].workbankSource).toBe(true); expect(rows[1].workbankSource).toBeUndefined();
    expect(() => proposalSyncProvider({ id: 'p-1', workbankSource: true } as any, [])).toThrow('WorkBank');
  });
  it('protects HTTP routes, rejects a foreign promoter and stops the native bank handler', async () => {
    const { db } = fakeDb();
    const app = express(); app.use(express.json());
    let session: any = null;
    registerWorkbankRoutes(app, db, async () => session);
    const nativeHandler = vi.fn((_req: any, res: any) => res.json({ success: true }));
    app.post('/api/proposals/:id/facta-sync', nativeHandler);
    expect((await request(app).get('/api/integrations/workbank/config?promoterId=promoter-a')).status).toBe(401);
    session = { user: { id: 'user-a' }, effectiveTenantId: 'tenant-a', activeRole: 'USUARIO', activePermissions: [] };
    expect((await request(app).put('/api/integrations/workbank/config?promoterId=promoter-a').send({})).status).toBe(403);
    session.activeRole = 'MASTER';
    expect((await request(app).get('/api/integrations/workbank/config?promoterId=promoter-b')).status).toBe(400);
    await db.systemConfig.create({ data: { tenantId: 'tenant-a', configKey: 'workbank:source:p-1', configValue: '{}', isSecret: false } });
    expect((await request(app).post('/api/proposals/p-1/facta-sync').send({})).status).toBe(409);
    expect(nativeHandler).not.toHaveBeenCalled();
    expect((await request(app).post('/api/proposals/p-2/facta-sync').send({})).status).toBe(200);
  });
});
