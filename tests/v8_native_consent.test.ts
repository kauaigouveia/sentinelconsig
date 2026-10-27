import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { journeyDatabase } from './helpers/cltJourneyDatabase';
import { registerV8NativeConsent } from '../server/services/v8CltConsent';
import { V8CltContract } from '../server/services/v8CltContract';
import { V8CltConsentAudit } from '../server/services/v8CltConsentAudit';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
const consult = '00000000-0000-4000-8000-000000000055', tenant = 'tenant-synthetic', promoter = 'promoter-synthetic';
const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 0, term: 0, mode: 'Payment', eligibility: true };
const terms = 'TERMO EXCLUSIVAMENTE SINTÉTICO PARA TESTES. '.repeat(8), termsHash = createHash('sha256').update(terms).digest('hex');
beforeEach(() => { vi.stubEnv('JWT_SECRET', 'synthetic-native-consent-encryption'); vi.stubGlobal('fetch', vi.fn(() => { throw Error('Real bank forbidden'); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  const db = journeyDatabase(); let actor = { tenant, actor: 'user:synthetic-operator' };
  const policy = vi.spyOn(V8CltContract, 'read').mockResolvedValue({ nativeConsentReady: true, consentReady: false, termsText: terms, termsHash, termsVersion: 'synthetic-v1' });
  vi.spyOn(V8CltSimulationService, 'ownsConsult').mockResolvedValue(true);
  const bank = vi.spyOn(V8CltSimulationService, 'request').mockImplementation(async (_db, _tenant, _promoter, path) => path.includes('?') ? { data: [{ id: consult, documentNumber: input.cpf, status: 'WAITING_CONSENT' }] } : {});
  const service = { get: vi.fn(async () => ({ record: { phase: 'DONE' }, snapshot: { customer: input, results: { v8: { rows: [{ data: { v8: { consultId: consult, promoterId: promoter, status: 'WAITING_CONSENT' } } }] } } } })) };
  const app = express(); app.use(express.json()); registerV8NativeConsent(app, db, async () => actor, service as any);
  const prepared = await request(app).post('/api/simulations/clt/v8/consent/native/prepare').send({ executionId: consult, consultId: consult, promoterId: promoter });
  expect(prepared.status).toBe(200); expect(prepared.body.path).toBeUndefined(); expect(bank).not.toHaveBeenCalled();
  const body = { challengeToken: prepared.body.challengeToken, termsHash, accepted: true, workerTookControl: true, workerName: input.name, signature: [[0.1, 0.1], [0.2, 0.3], [0.3, 0.4], [0.4, 0.2]], operationalSystem: 'Synthetic OS', deviceModel: 'Synthetic device model', deviceName: 'Synthetic worker device', deviceType: 'desktop' };
  return { app, db, policy, bank, body, switchActor: (value: any) => { actor = value; } };
}
it('records native worker evidence and directly calls authorize once, without SMS OTP or an external link', async () => {
  const c = await setup();
  for (let i = 0; i < 2; i++) expect((await request(c.app).post('/api/simulations/clt/v8/consent/native/accept').set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(200);
  expect(c.bank.mock.calls.filter(call => call[3].endsWith('/authorize'))).toHaveLength(1);
  expect(c.bank.mock.calls.find(call => call[3].endsWith('/authorize'))?.[4]).toEqual({ consult_id: consult, operationalSystem: c.body.operationalSystem, deviceModel: c.body.deviceModel, deviceName: c.body.deviceName, deviceType: 'desktop' });
  expect(await V8CltConsentAudit.recorded(c.db, tenant, promoter, input.cpf, consult)).toBe(true);
  expect(JSON.stringify(c.db.rows)).not.toContain(input.cpf); expect(JSON.stringify(c.db.rows)).not.toContain(input.name);
});
it.each([{ signature: [] }, { workerTookControl: false }, { accepted: false }, { termsHash: 'stale' }, { workerName: 'Operador sintético' }, { deviceModel: '' }])('rejects an operator checkbox or incomplete evidence: %s', async patch => {
  const c = await setup(); expect((await request(c.app).post('/api/simulations/clt/v8/consent/native/accept').set('User-Agent', 'SyntheticDevice/1').send({ ...c.body, ...patch })).status).toBe(400); expect(c.bank).not.toHaveBeenCalled();
});
it('binds the native challenge to the original operator and tenant', async () => {
  const c = await setup(); c.switchActor({ tenant: 'other-tenant', actor: 'user:synthetic-operator' });
  expect((await request(c.app).post('/api/simulations/clt/v8/consent/native/accept').send(c.body)).status).toBe(403); expect(c.bank).not.toHaveBeenCalled();
});
it('blocks only authorization when native documentary requirements are not configured', async () => {
  const c = await setup(); c.policy.mockResolvedValue({ nativeConsentReady: false, consentReady: false, termsHash });
  const r = await request(c.app).post('/api/simulations/clt/v8/consent/native/prepare').send({ executionId: consult, consultId: consult, promoterId: promoter });
  expect(r.status).toBe(409); expect(r.body.error).toContain('Somente /authorize'); expect(c.bank).not.toHaveBeenCalled();
});
it('does not replay authorize after a bank timeout', async () => {
  const c = await setup(); c.bank.mockImplementation(async (_db, _tenant, _p, path) => { if (path.endsWith('/authorize')) throw Error('synthetic timeout'); return { data: [{ id: consult, documentNumber: input.cpf, status: 'WAITING_CONSENT' }] }; });
  for (let i = 0; i < 2; i++) expect((await request(c.app).post('/api/simulations/clt/v8/consent/native/accept').set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(409);
  expect(c.bank.mock.calls.filter(call => call[3].endsWith('/authorize'))).toHaveLength(1); expect(await V8CltConsentAudit.recorded(c.db, tenant, promoter, input.cpf, consult)).toBe(false);
});
