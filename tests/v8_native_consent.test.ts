import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { journeyDatabase } from './helpers/cltJourneyDatabase';
import { registerV8ApiAuthorization } from '../server/services/v8CltConsent';
import { V8CltContract } from '../server/services/v8CltContract';
import { V8CltPilot } from '../server/services/v8CltPilot';
import { V8CltConsentAudit } from '../server/services/v8CltConsentAudit';
import { CltJourneyStore } from '../server/services/cltJourneyStore';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
const consult = '00000000-0000-4000-8000-000000000055', tenant = 'tenant-synthetic', promoter = 'promoter-synthetic';
const input = { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 0, term: 0, mode: 'Payment', eligibility: true };
const path='/api/simulations/clt/v8/authorize';
beforeEach(() => { vi.stubEnv('JWT_SECRET', 'synthetic-api-authorization-encryption'); vi.stubGlobal('fetch', vi.fn(() => { throw Error('Real bank forbidden'); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  const db = journeyDatabase(); let actor: any = { tenant, actor: 'user:synthetic-operator' };
  vi.spyOn(V8CltContract, 'read').mockResolvedValue({ apiAuthorizationReady:true, nativeConsentReady:false,consentReady:false,simulationReady:true,reasons:[] });
  const permit=vi.spyOn(V8CltPilot,'authorize').mockResolvedValue({allowed:true,userId:'synthetic-operator',tenantId:tenant});
  const owns=vi.spyOn(V8CltSimulationService, 'ownsConsult').mockResolvedValue(true);
  const bank = vi.spyOn(V8CltSimulationService, 'request').mockImplementation(async (_db, _tenant, _promoter, endpoint) => endpoint.includes('?') ? { data: [{ id: consult, documentNumber: input.cpf, status: 'WAITING_CONSENT' }] } : {});
  const service = { get: vi.fn(async (_db,t,a,id) => t===tenant&&a==='user:synthetic-operator'&&id===consult?({ record: { phase: 'DONE' }, snapshot: { banks:[{id:'v8',name:'V8'}], customer: input, results: { v8: { rows: [{ data: { v8: { consultId: consult, promoterId: promoter, status: 'WAITING_CONSENT' } } }] } } } }):undefined) };
  const app = express(); app.use(express.json()); registerV8ApiAuthorization(app, db, async () => actor, service as any);
  const body = { executionId:consult,consultId:consult,promoterId:promoter, operationalSystem: 'Synthetic OS', deviceModel: 'Synthetic device model', deviceName: 'Synthetic operator device', deviceType: 'desktop' };
  return { app, db, bank, body,permit,owns,service, switchActor: (value: any) => { actor = value; } };
}
it('authorizes directly with the documented five fields, without a human acceptance or a per-case administrative approval', async () => {
  const c = await setup();
  for (let i = 0; i < 2; i++) expect((await request(c.app).post(path).set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(200);
  expect(c.bank.mock.calls.filter(call => call[3].endsWith('/authorize'))).toHaveLength(1);
  expect(c.bank.mock.calls.find(call => call[3].endsWith('/authorize'))?.[4]).toEqual({ consult_id: consult, operationalSystem: c.body.operationalSystem, deviceModel: c.body.deviceModel, deviceName: c.body.deviceName, deviceType: 'desktop' });
  expect(await V8CltConsentAudit.recorded(c.db, tenant, promoter, input.cpf, consult)).toBe(true);
  const saved=await new CltJourneyStore(c.db,tenant,'bank:v8-consent-evidence').read(V8CltConsentAudit.id(promoter,input.cpf,consult));
  const audit=(saved!.record as any).audit;
  expect(audit.method).toBe('BANK_API_AUTHORIZATION');expect(audit.humanAcceptanceCollected).toBe(false);expect(audit.signature).toBeUndefined();expect(audit.acceptedAt).toBeUndefined();
  expect(JSON.stringify(c.db.rows)).not.toContain(input.cpf); expect(JSON.stringify(c.db.rows)).not.toContain(input.name);
});
it.each([{deviceModel:''},{deviceType:'invalid'},{operationalSystem:''},{deviceName:''}])('rejects missing device metadata before provider access: %s',async patch=>{
  const c=await setup();expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send({...c.body,...patch})).status).toBe(400);expect(c.bank).not.toHaveBeenCalled();
});
it.each([{tenant:'other-tenant',actor:'user:synthetic-operator'},{tenant,actor:'user:other-operator'}])('rejects another tenant or actor without a bank call: %s',async actor=>{
  const c=await setup();c.switchActor(actor);expect((await request(c.app).post(path).send(c.body)).status).toBe(404);expect(c.bank).not.toHaveBeenCalled();
});
it.each([401,403])('preserves authentication and authorization HTTP %s',async status=>{
  const c=await setup();c.switchActor({status});expect((await request(c.app).post(path).send(c.body)).status).toBe(status);expect(c.bank).not.toHaveBeenCalled();
});
it('revalidates the active user and tenant permissions before any bank operation',async()=>{
  const c=await setup();c.permit.mockResolvedValue({allowed:false,reason:'RESTRICTED'});expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)).status).toBe(403);expect(c.bank).not.toHaveBeenCalled();
});
it.each(['REJECTED','FAILED'])('does not authorize or mark a terminal %s consult',async status=>{
  const c=await setup();c.bank.mockResolvedValue({data:[{id:consult,documentNumber:input.cpf,status}]});expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)).status).toBe(409);expect(c.bank.mock.calls.some(call=>call[3].endsWith('/authorize'))).toBe(false);expect(await V8CltConsentAudit.recorded(c.db,tenant,promoter,input.cpf,consult)).toBe(false);
});
it('does not replay authorize after a bank timeout', async () => {
  const c = await setup(); c.bank.mockImplementation(async (_db, _tenant, _p, endpoint) => { if (endpoint.endsWith('/authorize')) throw Error('synthetic timeout'); return { data: [{ id: consult, documentNumber: input.cpf, status: 'WAITING_CONSENT' }] }; });
  for (let i = 0; i < 2; i++) expect((await request(c.app).post(path).set('User-Agent', 'SyntheticDevice/1').send(c.body)).status).toBe(409);
  expect(c.bank.mock.calls.filter(call => call[3].endsWith('/authorize'))).toHaveLength(1); expect(await V8CltConsentAudit.recorded(c.db, tenant, promoter, input.cpf, consult)).toBe(false);
});
it('reserves simultaneous authorization requests before a single bank POST',async()=>{
  const c=await setup();await Promise.all([request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body),request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)]);expect(c.bank.mock.calls.filter(call=>call[3].endsWith('/authorize'))).toHaveLength(1);
});
it('does not reuse an unowned bank reference',async()=>{
  const c=await setup();c.owns.mockResolvedValue(false);expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)).status).toBe(404);expect(c.bank).not.toHaveBeenCalled();
});
it('recovers an owned V8 reference despite a stale row and an uncertain result from another bank',async()=>{
  const c=await setup();const entry:any=await c.service.get(null,tenant,'user:synthetic-operator',consult);
  entry.record.phase='UNKNOWN';entry.snapshot.results={};c.service.get.mockResolvedValue(entry);
  expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)).status).toBe(200);
  expect(c.bank.mock.calls.filter(call=>call[3].endsWith('/authorize'))).toHaveLength(1);
});
it('observes an already SUCCESS consultation without replaying authorize or claiming a human act',async()=>{
  const c=await setup();c.bank.mockResolvedValue({data:[{id:consult,documentNumber:input.cpf,status:'SUCCESS'}]});
  expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)).status).toBe(200);
  expect(c.bank.mock.calls.some(call=>call[3].endsWith('/authorize'))).toBe(false);
  const saved=await new CltJourneyStore(c.db,tenant,'bank:v8-consent-evidence').read(V8CltConsentAudit.id(promoter,input.cpf,consult));
  expect((saved!.record as any).audit.authorizationAction).toBe('OBSERVED_BANK_AUTHORIZED');
  expect((saved!.record as any).audit.humanAcceptanceCollected).toBe(false);
});
it('finds the exact owned reference on a later page instead of authorizing another customer',async()=>{
  const c=await setup();c.bank.mockImplementation(async(_db,_tenant,_p,endpoint)=>endpoint.endsWith('/authorize')?{}:new URL('https://synthetic.invalid'+endpoint).searchParams.get('page')==='1'?{data:[],pages:{hasNext:true}}:{data:[{id:consult,documentNumber:input.cpf,status:'WAITING_CONSENT'}]});
  expect((await request(c.app).post(path).set('User-Agent','SyntheticDevice/1').send(c.body)).status).toBe(200);
  expect(c.bank.mock.calls.filter(call=>call[3].endsWith('/authorize'))).toHaveLength(1);
});
