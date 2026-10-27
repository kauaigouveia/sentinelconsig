import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from '../server/services/cltJourneyStore';

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
});
