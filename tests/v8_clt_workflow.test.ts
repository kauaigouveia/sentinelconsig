import { V8BankService } from '../server/services/v8BankService';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { journeyDatabase } from './helpers/cltJourneyDatabase';
import { V8CltContract } from '../server/services/v8CltContract';
import { V8CltConsent, registerV8WorkerConsent } from '../server/services/v8CltConsent';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
import { v8CltOperation } from '../server/services/v8CltOperation';
import * as promoter from '../server/services/bankPromoterConfig';
import { CltJourneyService } from '../server/services/cltJourneyService';
import { ProductSimulationService } from '../server/services/productSimulationService';

const consult = '00000000-0000-4000-8000-000000000001';
const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 0, term: 0, mode: 'Payment' as const, eligibility: true };
const termsText = 'TERMO SINTÉTICO PARA TESTES. '.repeat(8), termsHash = createHash('sha256').update(termsText).digest('hex');
const policy = { consentReady: true, simulationReady: true, termsText, termsHash, termsVersion: 'synthetic-v1', reasons: [] };
beforeEach(() => { vi.stubEnv('JWT_SECRET', 'synthetic-worker-consent-secret'); vi.stubGlobal('fetch', vi.fn(() => { throw Error('Real bank forbidden'); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('enables pricing by verified connection contract, never by a fixed false or a browser flag', async () => {
  vi.spyOn(promoter, 'resolveBankPromoter').mockResolvedValue({ id: 'p', name: 'Synthetic' } as any);
  const db = journeyDatabase();
  vi.spyOn(V8BankService, 'config').mockResolvedValue({ enabled: true, cltEnabled: true, environment: 'production', username: 'synthetic', password: 'synthetic', clientId: 'synthetic', audience: 'synthetic' } as any);
  expect((await V8CltContract.read(db, 'tenant-a', 'p')).simulationReady).toBe(true);
  const value = { moneyUnit: 'BRL', rateUnit: 'unconfirmed', precalculation: 'not-required', reference: 'Synthetic bank confirmation', reviewedBy: 'synthetic-admin', validUntil: new Date(Date.now() + 3600000).toISOString() };
  db.rows.push({ tenantId: 'tenant-a', configKey: V8CltContract.key('p'), configValue: JSON.stringify(value) });
  expect(await V8CltSimulationService.canSimulate(db, 'tenant-a', 'p')).toBe(true);
  db.rows[0].configValue = JSON.stringify({ ...value, precalculation: 'required' });
  expect(await V8CltSimulationService.canSimulate(db, 'tenant-a', 'p')).toBe(true);
  db.rows[0].configValue = JSON.stringify({ ...value, validUntil: '2000-01-01' });
  expect(await V8CltSimulationService.canSimulate(db, 'tenant-a', 'p')).toBe(true);
  expect((await V8CltContract.read(db, 'tenant-b', 'p')).nativeConsentReady).toBe(false);
  vi.mocked(V8BankService.config).mockResolvedValue({ enabled: false } as any); expect(await V8CltSimulationService.canSimulate(db, 'tenant-a', 'p')).toBe(false); expect(fetch).not.toHaveBeenCalled();
});

async function setup(verified = true) {
  const db = journeyDatabase();
  vi.spyOn(V8CltContract, 'read').mockResolvedValue({ ...policy });
  vi.spyOn(V8CltSimulationService, 'ownsConsult').mockResolvedValue(true);
  const issued = await V8CltConsent.issue(db, 'tenant-a', 'p', consult, input), token = issued.path.split('#')[1];
  let operator: any = null;
  const bank = vi.spyOn(V8CltSimulationService, 'request').mockImplementation(async (_db, _tenant, _promoter, path) => path.includes('?') ? { data: [{ id: consult, documentNumber: input.cpf, status: 'WAITING_CONSENT' }] } : {});
  const app = express(); app.use(express.json());
  registerV8WorkerConsent(app, db, async () => operator, async () => verified ? { cpf: input.cpf, subject: 'synthetic-verified-worker', method: 'synthetic-external-identity', verifiedAt: Date.now() } : null);
  const body = { token, termsHash, accepted: true, operationalSystem: 'Synthetic OS', deviceModel: 'Synthetic model', deviceName: 'Synthetic worker device', deviceType: 'desktop' };
  return { app, db, token, body, bank, setOperator: (s: any) => { operator = s; } };
}

it('binds the short-lived link to the consult and term, exposing no CPF or identity in the public view', async () => {
  const c = await setup();
  const view = await request(c.app).post('/api/public/v8/clt/consent/view').send({ token: c.token });
  expect(view.status).toBe(200); expect(view.body.workerVerified).toBe(true); expect(view.body.termsHash).toBe(termsHash); expect(view.text).not.toContain(input.cpf);
  expect((await request(c.app).post('/api/public/v8/clt/consent/view').send({ token: c.token + 'tampered' })).status).toBe(409); expect(c.bank).not.toHaveBeenCalled();
});
it('never accepts an operator checkbox, even with an independently verified worker assertion', async () => {
  const c = await setup(); c.setOperator({ user: { id: 'operator' } });
  expect((await request(c.app).post('/api/public/v8/clt/consent/accept').set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(403); expect(c.bank).not.toHaveBeenCalled();
});
it('blocks acceptance without independent identity or when only the default unconfigured verifier is available', async () => {
  const c = await setup(false);
  expect((await request(c.app).post('/api/public/v8/clt/consent/accept').send(c.body)).status).toBe(403);
  const app = express(); app.use(express.json()); registerV8WorkerConsent(app, c.db, async () => null);
  expect((await request(app).post('/api/public/v8/clt/consent/accept').send(c.body)).status).toBe(403); expect(c.bank).not.toHaveBeenCalled();
});
it('records verified evidence before acceptance and sends only one bank POST across retries', async () => {
  const c = await setup();
  for (let i = 0; i < 2; i++) expect((await request(c.app).post('/api/public/v8/clt/consent/accept').set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(200);
  expect(c.bank.mock.calls.filter(call => call[3].endsWith('/authorize'))).toHaveLength(1);
  expect(c.bank.mock.calls.find(call => call[3].endsWith('/authorize'))?.[4]).toEqual({ consult_id: consult, operationalSystem: c.body.operationalSystem, deviceModel: c.body.deviceModel, deviceName: c.body.deviceName, deviceType: 'desktop' });
  expect(JSON.stringify(c.db.rows)).not.toContain('Synthetic worker device'); expect(JSON.stringify(c.db.rows)).not.toContain(input.cpf);
});
it.each([{ accepted: false }, { termsHash: 'wrong' }, { deviceModel: '' }])('rejects missing or stale evidence before provider access: %s', async change => {
  const c = await setup(); expect((await request(c.app).post('/api/public/v8/clt/consent/accept').set('User-Agent', 'SyntheticDevice/1').send({ ...c.body, ...change })).status).toBe(400); expect(c.bank).not.toHaveBeenCalled();
});
it('refuses rejected consultations even after a legitimate worker acceptance', async () => {
  const c = await setup(); c.bank.mockResolvedValue({ data: [{ id: consult, documentNumber: input.cpf, status: 'REJECTED' }] });
  expect((await request(c.app).post('/api/public/v8/clt/consent/accept').set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(409); expect(c.bank.mock.calls.some(call => call[3].endsWith('/authorize'))).toBe(false);
});
it('reserves financial operations persistently across concurrency and retains UNKNOWN without bank replay', async () => {
  const db = journeyDatabase(), bank = vi.fn(async () => { throw Error('synthetic timeout'); });
  await Promise.allSettled([v8CltOperation(db, 'tenant-a', 'p', ['SIMULATE', consult, 300, 12], bank), v8CltOperation(db, 'tenant-a', 'p', ['SIMULATE', consult, 300, 12], bank)]);
  await expect(v8CltOperation(db, 'tenant-a', 'p', ['SIMULATE', consult, 300, 12], bank)).rejects.toThrow(); expect(bank).toHaveBeenCalledTimes(1);
});
it('automatically prices V8 only after eligible margin and connection contract are confirmed', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'v8', name: 'V8 DIGITAL' }]);
  const bank = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _p, action) => ({ rows: action === 'REFRESH' ? [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'DATA', data: { margin: { available_balance: 300, can_continue: true }, v8: { consultId: consult, promoterId: 'p', status: 'SUCCESS', simulationReady: true } } }] : [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'OFFER', amount: 2000, installment: 300, term: 12 }], message: undefined }));
  const entry = await service.start(db, 'tenant-a', 'user:a', consult, input); await service.execute(db, 'tenant-a', 'user:a', entry, input);
  expect(bank.mock.calls.map(c => c[3])).toEqual(['REFRESH', 'SIMULATE']); expect(bank.mock.calls[1][4].autoConditions).toBe(true);
  expect(entry.snapshot.results.v8.rows.some(r => r.state === 'OFFER')).toBe(true);
});
