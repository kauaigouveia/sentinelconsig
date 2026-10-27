import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from '../server/services/cltJourneyStore';
import { CltJourneyService } from '../server/services/cltJourneyService';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
import { V8BankService } from '../server/services/v8BankService';
import { V8CltPilot } from '../server/services/v8CltPilot';
import { v8CltOperation } from '../server/services/v8CltOperation';
import { V8CltConsentAudit } from '../server/services/v8CltConsentAudit';

// Explicit opt-in only. This guard verifies data_directory, system identifier,
// address, port, role, database and cluster marker before any fixture is written.
describe.skipIf(process.env.SENTINEL_CLT_REAL_POSTGRES_TEST !== '1')('CLT persistence on the preserved disposable PostgreSQL', () => {
  let db: any, tenant: any, store: CltJourneyStore;
  const actor = 'synthetic-pr1-actor', id = randomUUID();
  const record: JourneyRecord = { fingerprint: '', phase: 'READY', deadline: Date.now() + 50000, snapshot: { executionId: id, running: true, banks: [], results: {} } };
  const oldSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.SENTINEL_DATABASE = 'sentinel_rebuild_verify';
    const require = createRequire(import.meta.url);
    const guard = require(path.join(process.env.LOCALAPPDATA!, 'SentinelConsig', 'integration-test', 'rebuild-v1', 'guard.cjs'));
    db = guard.client();
    const live = await guard.assertInstance(db);
    expect(live.marker).toBe('sentinel_rebuild_ad4813e784917e9e');
    expect(live.database).toBe('sentinel_rebuild_verify');
    expect(live.port).toBe(50650);
    process.env.JWT_SECRET = randomUUID() + randomUUID(); // Synthetic and process-local.
    record.fingerprint = journeyFingerprint({ synthetic: true });
    tenant = await db.tenant.create({ data: { name: 'Synthetic PR1 persistence', slug: `synthetic-pr1-${randomUUID()}` } });
    store = new CltJourneyStore(db, tenant.id, actor);
    await store.create(id, record);
  });
  afterAll(async () => {
    try {
      if (tenant) {
        await db.systemConfig.deleteMany({ where: { tenantId: tenant.id } });
        await db.tenant.delete({ where: { id: tenant.id } });
      }
    } finally {
      await db?.$disconnect();
      if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    }
  });
  it('survives a new store instance', async () => {
    expect((await new CltJourneyStore(db, tenant.id, actor).read(id))?.record.phase).toBe('READY');
  });
  it('atomically reserves a duplicate execution', async () => {
    expect(await store.create(id, record)).toBe(id);
  });
  it('allows exactly one of two simultaneous claims', async () => {
    const saved = (await store.read(id))!;
    const next = { ...saved.record, phase: 'RUNNING' as const };
    const claims = await Promise.allSettled([store.compareAndSet(id, saved.raw, next), new CltJourneyStore(db, tenant.id, actor).compareAndSet(id, saved.raw, next)]);
    expect(claims.filter(c => c.status === 'fulfilled')).toHaveLength(1);
  });
  it('recovers the committed claim after an instance restart', async () => {
    expect((await new CltJourneyStore(db, tenant.id, actor).read(id))?.record.phase).toBe('RUNNING');
  });
  it('isolates the actor', async () => {
    expect(await new CltJourneyStore(db, tenant.id, 'another-synthetic-actor').read(id)).toBeUndefined();
  });
  it('isolates the tenant', async () => {
    expect(await new CltJourneyStore(db, 'another-synthetic-tenant', actor).read(id)).toBeUndefined();
  });
  it('deduplicates a different UUID and preserves recovery after a lost first frame', async () => {
    const alias = randomUUID();
    expect(await store.create(alias, record)).toBe(id);
    expect((await new CltJourneyStore(db, tenant.id, actor).read(alias))?.record.snapshot.executionId).toBe(id);
  });
  it('stores only secret ciphertext, including the alias', async () => {
    const rows = await db.systemConfig.findMany({ where: { tenantId: tenant.id } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r: any) => r.isSecret && !r.configValue.includes(id) && !r.configValue.includes(actor))).toBe(true);
  });
  it('recovers identity, bank results and consultation references across real Prisma instances without replay', async () => {
    const service = new CltJourneyService(), firstId = randomUUID(), nextId = randomUUID();
    const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 0, term: 0, mode: 'Payment' as const, eligibility: true };
    const available = vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }, { id: 'v8', name: 'V8', contextual: true }]);
    const run = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _p, _a, _i, _cb, providers) => ({ rows: providers?.[0] === 'facta' ? [{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', amount: 1000 }] : [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING', outcome: 'INELIGIBLE', data: { v8: { consultId: nextId, promoterId: 'synthetic', status: 'REJECTED' } } }], message: undefined }));
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('Real bank forbidden'); }));
    try {
      const first = await service.start(db, tenant.id, actor, firstId, input); await service.execute(db, tenant.id, actor, first, input);
      const next = await service.start(db, tenant.id, actor, nextId, input, 'v8', 'REFRESH', firstId); await service.execute(db, tenant.id, actor, next, input, 'REFRESH', 'v8');
      const recovered = await new CltJourneyService().get(db, tenant.id, actor, nextId);
      expect(recovered?.snapshot.customer?.cpf).toBe(input.cpf); expect(recovered?.snapshot.results.facta.rows[0].amount).toBe(1000);
      expect((recovered?.snapshot.results.v8.rows[0].data as any).v8.consultId).toBe(nextId);
      expect(run.mock.calls.filter(c => c[6]?.[0] === 'facta')).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
      const ciphertext = await db.systemConfig.findMany({ where: { tenantId: tenant.id } });
      expect(JSON.stringify(ciphertext)).not.toContain(input.cpf);
      expect(await new CltJourneyService().get(db, tenant.id, 'another-actor', nextId)).toBeUndefined();
    } finally { available.mockRestore(); run.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('reserves a V8 consultation before mocked HTTP and reuses its ID with real PostgreSQL concurrency', async () => {
    const promoter = `synthetic-${randomUUID()}`, consult = randomUUID();
    await db.systemConfig.create({ data: { tenantId: tenant.id, configKey: `integration:v8:${promoter}:config`, configValue: 'synthetic-metadata-only', isSecret: true } });
    const permit = vi.spyOn(V8CltPilot, 'authorize').mockResolvedValue({ allowed: true, tenantId: tenant.id, userId: actor });
    const config = { environment: 'production' as const, enabled: true, cltEnabled: true, fgtsEnabled: false, username: 'synthetic', password: 'synthetic', clientId: 'synthetic', audience: 'synthetic' };
    const configuration = vi.spyOn(V8BankService, 'config').mockResolvedValue(config);
    const token = vi.spyOn(V8BankService, 'token').mockResolvedValue({ token: 'synthetic-not-real', config });
    const bank = vi.fn(async (url: any, options: any) => {
      expect(String(url)).toBe('https://bff.v8sistema.com/private-consignment/consult'); expect(options.method).toBe('POST');
      return new Response(JSON.stringify({ id: consult }));
    }); vi.stubGlobal('fetch', bank);
    const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 0, term: 0, mode: 'Payment' as const, eligibility: true, v8PromoterId: promoter, v8BirthDate: '1980-01-02', v8Gender: 'female' as const, v8Email: 'synthetic@example.invalid' };
    try {
      await Promise.all([V8CltSimulationService.run(db, tenant.id, 'CREATE_CONSULT', input), V8CltSimulationService.run(db, tenant.id, 'CREATE_CONSULT', input)]);
      const recovered = await V8CltSimulationService.run(db, tenant.id, 'CREATE_CONSULT', input);
      expect((recovered[0].data as any).v8.consultId).toBe(consult); expect(bank).toHaveBeenCalledTimes(1);
      const rows = await db.systemConfig.findMany({ where: { tenantId: tenant.id } });
      expect(JSON.stringify(rows)).not.toContain(input.cpf);
    } finally { permit.mockRestore(); configuration.mockRestore(); token.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('persists bank API authorization without inventing human acceptance and keeps its audit tenant-scoped', async () => {
    const promoter = `synthetic-${randomUUID()}`, consult = randomUUID(), document = 'synthetic-document';
    await V8CltConsentAudit.record(db, tenant.id, promoter, document, consult, { method: 'BANK_API_AUTHORIZATION', humanAcceptanceCollected: false });
    expect(await V8CltConsentAudit.recorded(db, tenant.id, promoter, document, consult)).toBe(true);
    expect(await V8CltConsentAudit.recorded(db, 'synthetic-other-tenant', promoter, document, consult)).toBe(false);
    const data = await db.systemConfig.findMany({ where: { tenantId: tenant.id } });
    expect(JSON.stringify(data)).not.toContain('BANK_API_AUTHORIZATION');
    expect(JSON.stringify(data)).not.toContain(document);
  });
  it('persists a financial UNKNOWN and never repeats its mocked bank POST across Prisma instances', async () => {
    const promoter = `synthetic-${randomUUID()}`, intent = ['SIMULATE', randomUUID(), 300, 12];
    let calls = 0;
    const bank = async () => { calls++; throw Error('synthetic timeout'); };
    await Promise.allSettled([v8CltOperation(db, tenant.id, promoter, intent, bank), v8CltOperation(db, tenant.id, promoter, intent, bank)]);
    await expect(v8CltOperation(db, tenant.id, promoter, intent, bank)).rejects.toThrow(); expect(calls).toBe(1);
  });
});
