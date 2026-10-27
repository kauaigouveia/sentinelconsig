import { journeyDatabase } from './helpers/cltJourneyDatabase';
import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { CltJourneyService } from '../server/services/cltJourneyService';
import { registerCltJourneyRoutes } from '../server/services/cltJourneyRoutes';
import { ProductSimulationService } from '../server/services/productSimulationService';
const id = '00000000-0000-4000-8000-000000000001';
const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 1423.98, term: 24, mode: 'Payment' as const, eligibility: true };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
import { beforeEach } from 'vitest';
beforeEach(() => vi.stubEnv('JWT_SECRET', 'synthetic-journey-secret'));

it('delivers an early offer before a slower bank, reserves duplicate execution and preserves pending authorization', async () => {
  const service = new CltJourneyService(), db = journeyDatabase();
  let release!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }, { id: 'nossa', name: 'Nossa Fintech' }]);
  const execute = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _product, _action, _input, _callback, providers) => {
    if (providers?.includes('nossa')) { await slow; return { message: undefined, rows: [{ provider: 'Nossa Fintech', institution: 'QI', state: 'PENDING', outcome: 'AUTHORIZATION_REQUIRED' }] }; }
    return { message: undefined, rows: [{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', amount: 12000, installment: 1423.98 }] };
  });
  const [entry, duplicate] = await Promise.all([service.start(db, 'tenant-a', 'user:a', id, input), service.start(db, 'tenant-a', 'user:a', id, input)]);
  const work = service.execute(db, 'tenant-a', 'user:a', entry, input);
  const duplicateWork = new CltJourneyService().execute(db, 'tenant-a', 'user:a', duplicate, input);
  await vi.waitFor(() => expect(entry.snapshot.results.facta?.rows[0]?.state).toBe('OFFER'));
  expect(entry.snapshot.running).toBe(true);
  expect(entry.snapshot.results.facta.executionId).toBe(id);
  release(); await Promise.all([work, duplicateWork]); const snapshot = entry.snapshot;
  expect(snapshot.results.nossa.rows[0].outcome).toBe('AUTHORIZATION_REQUIRED');
  expect(execute).toHaveBeenCalledTimes(2);
  expect(await service.get(db, 'tenant-b', 'user:a', id)).toBeUndefined();
  expect(await service.get(db, 'tenant-a', 'user:b', id)).toBeUndefined();
  await expect(service.start(db, 'tenant-a', 'user:a', id, { ...input, value: 1 })).rejects.toThrow('EXECUTION_CONFLICT');
});

it('isolates provider failure, never sends V8 simulate/authorize, and does not invoke contextual adapters', async () => {
  const service = new CltJourneyService(), db = journeyDatabase();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'v8', name: 'V8', contextual: true }, { id: 'facta', name: 'FACTA' }, { id: 'parana', name: 'Paraná', contextual: true }]);
  const run = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _product, action, _input, _callback, providers) => {
    if (providers?.includes('facta')) throw Error('private payload');
    expect(action).toBe('REFRESH'); return { message: undefined, rows: [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'DATA', data: { access_token: 'DO-NOT-EXPOSE', v8: { consultId: id, promoterId: 'p' } } }] };
  });
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input);
  await service.execute(db, 'tenant-a', 'user:a', entry, input);
  const snapshot = entry.snapshot;
  expect(snapshot.results.facta.status).toBe('UNKNOWN'); expect(snapshot.results.v8.status).toBe('CONTEXTUAL');
  expect(snapshot.results.parana.status).toBe('CONTEXTUAL'); expect(run).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(snapshot)).not.toContain('DO-NOT-EXPOSE'); expect(JSON.stringify(snapshot)).not.toContain('private payload');
});

it('enforces HTTP authentication, permission, tenant ownership and refuses unscoped authorization', async () => {
  const service = new CltJourneyService(), db = journeyDatabase(); vi.spyOn(service, 'available').mockResolvedValue([]);
  let session: any = null;
  const access = { simulationAccessEnabled: true };
  const app = express(); app.use(express.json()); registerCltJourneyRoutes(app, { ...db, tenant: { findUnique: async () => access } }, async () => session, service);
  expect((await request(app).post('/api/simulations/clt/journey').send({ ...input, executionId: id })).status).toBe(401);
  session = { user: { id: 'a', role: 'VIEWER' }, effectiveTenantId: 'tenant-a', activePermissions: [] };
  expect((await request(app).post('/api/simulations/clt/journey').send({ ...input, executionId: id })).status).toBe(403);
  session = { user: { id: 'a', role: 'MASTER' }, effectiveTenantId: 'tenant-a' };
  expect((await request(app).post('/api/simulations/clt/journey').send({ ...input, executionId: id, action: 'AUTHORIZE' })).status).toBe(400);
  const result = await request(app).post('/api/simulations/clt/journey').send({ ...input, executionId: id });
  expect(result.status).toBe(200); expect(result.headers['content-type']).toContain('ndjson');
  expect((await request(app).get(`/api/simulations/clt/journey/${id}`)).status).toBe(200);
  session.effectiveTenantId = 'tenant-b'; expect((await request(app).get(`/api/simulations/clt/journey/${id}`)).status).toBe(404);
  access.simulationAccessEnabled = false; expect((await request(app).post('/api/simulations/clt/journey').send({ ...input, executionId: id })).status).toBe(403);
});

it('deduplicates different UUIDs across instances and recovers durable partial results without repeating calls', async () => {
  const db = journeyDatabase(), first = new CltJourneyService(), second = new CltJourneyService();
  for (const service of [first, second]) vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }]);
  const run = vi.spyOn(ProductSimulationService, 'run').mockResolvedValue({ rows: [], message: undefined });
  const a = await first.start(db, 'tenant-a', 'user:a', id, input);
  const b = await second.start(db, 'tenant-a', 'user:a', '00000000-0000-4000-8000-000000000002', input);
  expect(b.snapshot.executionId).toBe(id);
  await Promise.all([first.execute(db, 'tenant-a', 'user:a', a, input), second.execute(db, 'tenant-a', 'user:a', b, input)]);
  expect(run).toHaveBeenCalledTimes(1);
  const recovered = await new CltJourneyService().get(db, 'tenant-a', 'user:a', id);
  expect(recovered?.snapshot.running).toBe(false);
  expect(JSON.stringify(db.rows)).not.toContain(input.cpf);
  expect(JSON.stringify(db.rows)).not.toContain(input.name);
});
it('turns abandoned leases into UNKNOWN, never reclaims them, and rejects ciphertext moved across tenants', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }]);
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input);
  entry.record.phase = 'RUNNING'; entry.record.deadline = Date.now() - 1;
  await entry.store.compareAndSet(id, entry.raw, entry.record);
  const recovered = await new CltJourneyService().get(db, 'tenant-a', 'user:a', id);
  expect(recovered?.snapshot.results.facta.status).toBe('UNKNOWN'); expect(recovered?.snapshot.running).toBe(false);
  const run = vi.spyOn(ProductSimulationService, 'run');
  await service.execute(db, 'tenant-a', 'user:a', recovered!, input); expect(run).not.toHaveBeenCalled();
  const row = db.rows.find(r => !r.configKey.includes('intent:')); db.rows.push({ ...row, tenantId: 'tenant-b' });
  await expect(service.get(db, 'tenant-b', 'user:a', id)).rejects.toThrow();
});

it('retains uncertain intent indefinitely but allows a new explicit attempt after the completed cooldown', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([]);
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input);
  entry.record.phase = 'UNKNOWN'; entry.record.deadline = Date.now() - 60000;
  entry.raw = await entry.store.compareAndSet(id, entry.raw, entry.record);
  const alias = '00000000-0000-4000-8000-000000000002';
  expect((await service.start(db, 'tenant-a', 'user:a', alias, input)).snapshot.executionId).toBe(id);
  entry.record.phase = 'DONE'; entry.record.snapshot.running = false;
  await entry.store.compareAndSet(id, entry.raw, entry.record);
  const fresh = '00000000-0000-4000-8000-000000000003';
  expect((await service.start(db, 'tenant-a', 'user:a', fresh, input)).snapshot.executionId).toBe(fresh);
});

it('preserves enrollment choices and eligibility while removing nested provider credentials', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'finanto', name: 'FINANTO' }]);
  vi.spyOn(ProductSimulationService, 'run').mockResolvedValue({ rows: [{ provider: 'FINANTO', institution: 'QI', state: 'DATA', data: { eligible: false, restrictions: ['Vínculo não elegível'], access_token: 'SECRET', borrower: { name: 'Pessoa sintética', password: 'SECRET' }, items: [{ employerDocument: '12345678000100', registrationNumber: '000A', employerName: 'Empresa fictícia', term: 24, apiKey: 'SECRET' }], margin: { can_continue: false, restrictions: ['Vínculo não elegível'], password: 'SECRET' } } }], message: undefined });
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input);
  await service.execute(db, 'tenant-a', 'user:a', entry, input);
  const projected: any = entry.snapshot.results.finanto.rows[0].data;
  expect(projected.eligible).toBe(false); expect(projected.margin.can_continue).toBe(false);
  expect(projected.items[0].registrationNumber).toBe('000A'); expect(projected.restrictions).toEqual(['Vínculo não elegível']);
  expect(JSON.stringify(projected)).not.toContain('SECRET');
});
it('marks interrupted READY and technical bank errors UNKNOWN without permitting an automatic retry', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }]);
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input);
  entry.record.deadline = Date.now() - 1; await entry.store.compareAndSet(id, entry.raw, entry.record);
  expect((await service.get(db, 'tenant-a', 'user:a', id))?.snapshot.results.facta.status).toBe('UNKNOWN');
  const other = await service.start(db, 'tenant-a', 'user:a', '00000000-0000-4000-8000-000000000003', { ...input, value: 1 });
  vi.spyOn(ProductSimulationService, 'run').mockResolvedValue({ rows: [{ provider: 'FACTA', institution: 'FACTA', state: 'ERROR', outcome: 'TECHNICAL_ERROR' }], message: undefined });
  await service.execute(db, 'tenant-a', 'user:a', other, input);
  expect(other.record.phase).toBe('UNKNOWN');
});
