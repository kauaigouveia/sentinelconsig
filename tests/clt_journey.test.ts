import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { CltJourneyService } from '../server/services/cltJourneyService';
import { registerCltJourneyRoutes } from '../server/services/cltJourneyRoutes';
import { ProductSimulationService } from '../server/services/productSimulationService';
const id = '00000000-0000-4000-8000-000000000001';
const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 1423.98, term: 24, mode: 'Payment' as const, eligibility: true };
afterEach(() => vi.restoreAllMocks());
const done = async (entry: any) => { await vi.waitFor(() => expect(entry.snapshot.running).toBe(false)); return entry.snapshot; };

it('delivers an early offer before a slower bank, reserves duplicate execution and preserves pending authorization', async () => {
  const service = new CltJourneyService();
  let release!: () => void;
  const slow = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }, { id: 'nossa', name: 'Nossa Fintech' }]);
  const execute = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _product, _action, _input, _callback, providers) => {
    if (providers?.includes('nossa')) { await slow; return { message: undefined, rows: [{ provider: 'Nossa Fintech', institution: 'QI', state: 'PENDING', outcome: 'AUTHORIZATION_REQUIRED' }] }; }
    return { message: undefined, rows: [{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', amount: 12000, installment: 1423.98 }] };
  });
  const [entry, duplicate] = await Promise.all([service.start({}, 'tenant-a', 'user:a', id, input), service.start({}, 'tenant-a', 'user:a', id, input)]);
  expect(entry).toBe(duplicate);
  await vi.waitFor(() => expect(entry.snapshot.results.facta?.rows[0]?.state).toBe('OFFER'));
  expect(entry.snapshot.running).toBe(true);
  expect(entry.snapshot.results.facta.executionId).toBe(id);
  release(); const snapshot = await done(entry);
  expect(snapshot.results.nossa.rows[0].outcome).toBe('AUTHORIZATION_REQUIRED');
  expect(execute).toHaveBeenCalledTimes(2);
  expect(service.get('tenant-b', 'user:a', id)).toBeUndefined();
  expect(service.get('tenant-a', 'user:b', id)).toBeUndefined();
  await expect(service.start({}, 'tenant-a', 'user:a', id, { ...input, value: 1 })).rejects.toThrow('EXECUTION_CONFLICT');
});

it('isolates provider failure, never sends V8 simulate/authorize, and does not invoke contextual adapters', async () => {
  const service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'v8', name: 'V8' }, { id: 'facta', name: 'FACTA' }, { id: 'parana', name: 'Paraná', contextual: true }]);
  const run = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _product, action, _input, _callback, providers) => {
    if (providers?.includes('facta')) throw Error('private payload');
    expect(action).toBe('REFRESH'); return { message: undefined, rows: [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'DATA', data: { access_token: 'DO-NOT-EXPOSE', v8: { consultId: id, promoterId: 'p' } } }] };
  });
  const snapshot = await done(await service.start({}, 'tenant-a', 'user:a', id, input));
  expect(snapshot.results.facta.status).toBe('ERROR'); expect(snapshot.results.v8.rows[0].state).toBe('DATA');
  expect(snapshot.results.parana.status).toBe('CONTEXTUAL'); expect(run).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(snapshot)).not.toContain('DO-NOT-EXPOSE'); expect(JSON.stringify(snapshot)).not.toContain('private payload');
});

it('enforces HTTP authentication, permission, tenant ownership and refuses unscoped authorization', async () => {
  const service = new CltJourneyService(); vi.spyOn(service, 'available').mockResolvedValue([]);
  let session: any = null;
  const access = { simulationAccessEnabled: true };
  const app = express(); app.use(express.json()); registerCltJourneyRoutes(app, { tenant: { findUnique: async () => access } }, async () => session, service);
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
