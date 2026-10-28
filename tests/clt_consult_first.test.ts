import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { journeyDatabase } from './helpers/cltJourneyDatabase';
import { CltJourneyService } from '../server/services/cltJourneyService';
import { registerCltJourneyRoutes } from '../server/services/cltJourneyRoutes';
import { ProductSimulationService } from '../server/services/productSimulationService';
import { cltPaymentLimit } from '../server/services/cltFinancialPolicy';
import { NossaFintechService } from '../server/services/nossaFintechService';
import { FinantoService } from '../server/services/finantoService';

const id = '00000000-0000-4000-8000-000000000031';
const input = { v8BirthDate: '1990-02-28', v8Email: 'synthetic@example.invalid', v8Gender: 'male' as const, cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', term: 0, value: 0, mode: 'Payment' as const, eligibility: true };
it('observes only an owned V8 reference without authorizing or pricing and preserves other banks', async () => {
  const db=journeyDatabase(), service=new CltJourneyService();
  vi.spyOn(service,'available').mockResolvedValue([{id:'v8',name:'V8 DIGITAL'},{id:'facta',name:'FACTA'}]);
  const run=vi.spyOn(ProductSimulationService,'run').mockImplementation(async(_db,_tenant,_product,action,_input,_rows,providers)=>({rows: providers?.[0]==='v8'?[{provider:'V8 DIGITAL',institution:'V8',state:'PENDING',data:{v8:{consultId:'synthetic-consult',promoterId:'synthetic-promoter',status:'WAITING_CONSENT'}}}]:[{provider:'FACTA',institution:'FACTA',state:'PENDING'}],message:undefined}));
  const entry=await service.start(db,'tenant-a','user:a',id,input); await service.execute(db,'tenant-a','user:a',entry,input);
  run.mockClear(); run.mockResolvedValue({rows:[{provider:'V8 DIGITAL',institution:'V8',state:'ERROR',outcome:'TECHNICAL_ERROR',data:{v8:{consultId:'synthetic-consult',promoterId:'synthetic-promoter',status:'FAILED'}}}],message:undefined});
  expect(await service.refreshV8(db,'tenant-b','user:a',id,'synthetic-consult','synthetic-promoter')).toBeUndefined();
  expect(await service.refreshV8(db,'tenant-a','user:b',id,'synthetic-consult','synthetic-promoter')).toBeUndefined();
  expect(await service.refreshV8(db,'tenant-a','user:a',id,'other-consult','synthetic-promoter')).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  const result=await service.refreshV8(db,'tenant-a','user:a',id,'synthetic-consult','synthetic-promoter');
  expect(run).toHaveBeenCalledOnce();expect(run.mock.calls[0][3]).toBe('REFRESH');expect((result?.results.v8.rows[0].data as any)?.v8.status).toBe('FAILED');expect(result?.results.facta.rows[0].provider).toBe('FACTA');
});
beforeEach(() => { vi.stubEnv('JWT_SECRET', 'synthetic-only-secret'); vi.stubGlobal('fetch', vi.fn(() => { throw Error('Real banking forbidden'); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([[1900.009, 1800, 1800], ['1423.98', undefined, 1423.98], [0.29, undefined, 0.29], [0, 300, undefined], [undefined, undefined, undefined], ['invalid', 300, undefined], [300, -1, undefined]])('uses only bank-returned positive limits %s / %s', (a, b, expected) => {
  expect(cltPaymentLimit(a, b)).toBe(expected);
});
it('floors a fractional cent without increasing the bank limit', () => expect(cltPaymentLimit(300.009)).toBe(300));

it('accepts identity-only HTTP input with Happy disabled, but keeps RBAC, active-company and action boundaries', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([]);
  const access = { status: 'ACTIVE', simulationAccessEnabled: false, happySimulationAccessEnabled: false };
  let session: any = { user: { id: 'u', role: 'MASTER' }, effectiveTenantId: 'tenant-a' };
  const app = express(); app.use(express.json()); registerCltJourneyRoutes(app, { ...db, tenant: { findUnique: async () => access } }, async () => session, service);
  const body = { executionId: id, cpf: input.cpf, name: input.name, phone: input.phone, v8BirthDate: input.v8BirthDate, v8Email: input.v8Email, v8Gender: input.v8Gender };
  const first = await request(app).post('/api/simulations/clt/journey').send(body);
  expect(first.status).toBe(200); expect(first.text).toContain('"autoConditions":true');
  expect((await request(app).post('/api/simulations/clt/journey').send({ ...body, action: 'SIMULATE' })).status).toBe(400);
  expect((await request(app).post('/api/simulations/clt/journey').send({ ...body, action: 'AUTHORIZE', provider: 'v8' })).status).toBe(400);
  expect((await request(app).post('/api/simulations/clt/journey').send({ ...body, action: 'CREATE_CONSULT', provider: 'v8', v8BirthDate: '' })).status).toBe(400);
  session.partnerId = 'partner-a'; expect((await request(app).post('/api/simulations/clt/journey').send(body)).status).toBe(403);
  delete session.partnerId; session.user.role = 'VIEWER'; expect((await request(app).post('/api/simulations/clt/journey').send(body)).status).toBe(403);
  session.user.role = 'MASTER'; access.status = 'SUSPENDED'; expect((await request(app).post('/api/simulations/clt/journey').send(body)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it('publishes margin first, then calculates independently, preserving the recoverable customer and returned offers', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }, { id: 'nossa', name: 'Nossa' }]);
  const run = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _product, action, data, _onRows, providers) => {
    if (providers?.[0] === 'nossa') return { rows: [{ provider: 'Nossa', institution: 'QI', state: 'PENDING', outcome: 'AUTHORIZATION_REQUIRED' }], message: undefined };
    if (action === 'REFRESH') return { rows: [{ provider: 'FACTA', institution: 'FACTA', state: 'DATA', data: { employment: { work_registration: '000A' }, margin: { available_balance: 300.009, can_continue: true } } }], message: undefined };
    expect(data.autoConditions).toBe(true); expect(data.value).toBe(0); // Adapter must derive it, not the browser.
    return { rows: [{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', installment: 300, amount: 2000 }], message: undefined };
  });
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input), stages: string[] = [];
  entry.listeners.add(s => { if (s.results.facta.stage) stages.push(s.results.facta.stage); });
  await service.execute(db, 'tenant-a', 'user:a', entry, input);
  expect(run.mock.calls.filter(c => c[3] === 'SIMULATE')).toHaveLength(1);
  expect(stages.indexOf('MARGIN')).toBeLessThan(stages.indexOf('SIMULATION'));
  expect(entry.snapshot.results.facta.rows.some(r => r.state === 'OFFER')).toBe(true);
  expect(entry.snapshot.results.nossa.rows[0].outcome).toBe('AUTHORIZATION_REQUIRED');
  expect((await new CltJourneyService().get(db, 'tenant-a', 'user:a', id))?.snapshot.customer?.phone).toBe(input.phone);
  expect(await service.get(db, 'tenant-b', 'user:a', id)).toBeUndefined();
  expect(JSON.stringify(db.rows)).not.toContain(input.cpf);
});

it.each(['ineligible', 'missing-margin', 'ambiguous-employments'])('never calculates from %s', async variant => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }]);
  const row: any = { provider: 'FACTA', institution: 'FACTA', state: 'DATA', data: { margin: { can_continue: variant !== 'ineligible', available_balance: variant === 'missing-margin' ? undefined : 300 } } };
  const run = vi.spyOn(ProductSimulationService, 'run').mockResolvedValue({ rows: variant === 'ambiguous-employments' ? [row, row] : [row], message: undefined });
  const entry = await service.start(db, 'tenant-a', 'user:a', id, input); await service.execute(db, 'tenant-a', 'user:a', entry, input);
  expect(run).toHaveBeenCalledTimes(1); expect(run.mock.calls[0][3]).toBe('REFRESH');
});

it('persists other banks when following a contextual consultation, without replaying their operations', async () => {
  const db = journeyDatabase(), service = new CltJourneyService();
  vi.spyOn(service, 'available').mockResolvedValue([{ id: 'facta', name: 'FACTA' }, { id: 'v8', name: 'V8', contextual: true }]);
  const run = vi.spyOn(ProductSimulationService, 'run').mockImplementation(async (_db, _tenant, _p, _a, _i, _cb, providers) => ({ rows: providers?.[0] === 'facta' ? [{ provider: 'FACTA', institution: 'FACTA', state: 'OFFER', amount: 1000 }] : [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING', outcome: 'INELIGIBLE', data: { v8: { consultId: id, promoterId: 'synthetic', status: 'REJECTED' } } }], message: undefined }));
  const first = await service.start(db, 'tenant-a', 'user:a', id, input); await service.execute(db, 'tenant-a', 'user:a', first, input);
  const nextId = '00000000-0000-4000-8000-000000000032';
  const next = await service.start(db, 'tenant-a', 'user:a', nextId, input, 'v8', 'REFRESH', id);
  await service.execute(db, 'tenant-a', 'user:a', next, input, 'REFRESH', 'v8');
  const restored = await new CltJourneyService().get(db, 'tenant-a', 'user:a', nextId);
  expect(restored?.snapshot.results.facta.rows[0].amount).toBe(1000);
  expect((restored?.snapshot.results.v8.rows[0].data as any).v8.consultId).toBe(id);
  expect(run.mock.calls.filter(c => c[6]?.[0] === 'facta')).toHaveLength(1);
  await expect(service.start(db, 'tenant-b', 'user:a', '00000000-0000-4000-8000-000000000033', input, 'v8', 'REFRESH', id)).rejects.toThrow('EXECUTION_CONFLICT');
  await expect(service.start(db, 'tenant-a', 'user:a', '00000000-0000-4000-8000-000000000034', { ...input, cpf: '11111111111' }, 'v8', 'REFRESH', id)).rejects.toThrow('EXECUTION_CONFLICT');
});

it('uses Nossa margin and utilizable limit, without a manual installment or financial call before authorization', async () => {
  vi.spyOn(NossaFintechService, 'getConfig').mockResolvedValue({ enabled: true, isConfigured: true } as any);
  let authorized = false;
  const bank = vi.spyOn(NossaFintechService, 'request').mockImplementation(async (_db, _tenant, _method, path, body: any) => {
    let data: any;
    if (path.endsWith('banking-institutions')) data = ['qi'];
    else if (path.endsWith('check-authorization')) data = { status: authorized ? 'AUTHORIZED' : 'WAITING' };
    else if (path.endsWith('check-employee-enrollment')) data = [{ employer_cnpj: '12345678000100' }];
    else if (path.endsWith('get-margin')) data = { margin_key: 'synthetic-key', can_continue: true, available_balance: 350.99, utilizable_balance: 300.009 };
    else if (path.includes('list-rebates')) data = [{ cod_tabela: 'synthetic', number_of_installments: 12 }];
    else if (path.endsWith('simulate-loan')) { expect(body).toMatchObject({ requested_amount: 300, simulation_type: 'Payment' }); data = { disbursement_amount: 2000, num_periods: 12, schedule: [{ payment: 300 }] }; }
    else throw Error('Unexpected endpoint');
    return { success: true, status: 200, data } as any;
  });
  await ProductSimulationService.run({} as any, 'tenant-a', 'CLT', 'REFRESH', input, undefined, ['nossa']);
  expect(bank.mock.calls.some(c => c[3].includes('simulate-loan'))).toBe(false);
  authorized = true;
  const result = await ProductSimulationService.run({} as any, 'tenant-a', 'CLT', 'SIMULATE', { ...input, autoConditions: true }, undefined, ['nossa']);
  expect(result.rows.some(r => r.state === 'OFFER')).toBe(true);
});

it('rejects retired FINANTO CLT dispatch without reading credentials or making calls',async()=>{
 const config=vi.spyOn(FinantoService,'getConfig');const bank=vi.spyOn(FinantoService,'request');
 for(const action of ['REFRESH','SIMULATE','AUTHORIZE'] as const){const result=await ProductSimulationService.run({} as any,'tenant-a','CLT',action,input,undefined,['finanto']);expect(result.rows).toHaveLength(0);}
 expect(config).not.toHaveBeenCalled();expect(bank).not.toHaveBeenCalled();
});
