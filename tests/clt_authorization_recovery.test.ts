import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readV8Device} from '../src/lib/v8Device';
import {nossaAuthorization,rememberNossaAuthorization} from '../server/services/nossaCltAuthorization';
import {CltAuthorizationFollowup as Followup} from '../server/services/cltAuthorizationFollowup';
import {V8CltPilot} from '../server/services/v8CltPilot';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
import {withIntegrationPromoter} from '../server/services/bankPromoterConfig';
const identity={document_number:'52998224725',service_type:'qi'};
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-recovery-secret-only');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Real banks forbidden');}));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
it('uses real client hints plus a class description, without claiming a hostname',async()=>{
 const result=await readV8Device({platform:'legacy-platform',userAgent:'synthetic',userAgentData:{getHighEntropyValues:async()=>({platform:'SyntheticOS',model:'SyntheticModel',formFactors:['Desktop']})}});expect(result).toEqual({operationalSystem:'SyntheticOS',deviceModel:'SyntheticModel',deviceType:'desktop',deviceName:'Computador SyntheticOS'});
});
it('requests only missing fields when client hints are unavailable or denied',async()=>{
 expect(await readV8Device({platform:'MacIntel',userAgent:'synthetic'})).toEqual({operationalSystem:'macOS',deviceModel:'PC',deviceName:'Computador macOS',deviceType:'desktop'});
 expect((await readV8Device({platform:'',userAgent:'synthetic',userAgentData:{mobile:true,getHighEntropyValues:async()=>{throw Error('denied');}}})).deviceType).toBe('mobile');
});
it('recognizes the same official authorized state in root or data envelopes without treating success as consent',()=>{
 expect(nossaAuthorization({status:' authorized '},identity).status).toBe('AUTHORIZED');expect(nossaAuthorization({data:{status:'AUTHORIZED'}},identity).status).toBe('AUTHORIZED');expect(nossaAuthorization({success:true,status:'SUCCESS'},identity).status).toBe('UNCONFIRMED');expect(nossaAuthorization({status:'EXPIRED'},identity).status).toBe('EXPIRED');
});
it('rejects a returned authorization tied to another identity or institution',()=>{
 expect(()=>nossaAuthorization({status:'AUTHORIZED',document_number:'11111111111'},identity)).toThrow();expect(()=>nossaAuthorization({status:'AUTHORIZED',service_type:'uy3'},identity)).toThrow();
 expect(()=>nossaAuthorization({status:'PENDING',data:{status:'AUTHORIZED'}},identity)).toThrow();expect(()=>nossaAuthorization({document_number:'11111111111',data:{status:'AUTHORIZED'}},identity)).toThrow();
});
it('retains the existing pending link across restarts, removes it when authorized, and keeps encrypted evidence',async()=>{
 const db=journeyDatabase();await rememberNossaAuthorization(db,'t','user:a',identity,{status:'REQUESTED',authorization_link:'https://signature.example.invalid/qi',authorizationId:'synthetic-authorization'},'REQUEST');
 const pending=await rememberNossaAuthorization(db,'t','user:a',identity,{status:'PENDING',authorization_link:undefined,authorizationId:undefined});expect(pending.authorization_link).toContain('/qi');expect(pending.previousStatus).toBe('REQUESTED');
 const done=await rememberNossaAuthorization(db,'t','user:a',identity,{status:'AUTHORIZED',authorization_link:undefined,authorizationId:undefined});expect(done.authorization_link).toBeUndefined();expect(done.source).toBe('API');expect(done.authorizationId).toBe('synthetic-authorization');
 expect(JSON.stringify(db.rows)).not.toContain(identity.document_number);expect(JSON.stringify(db.rows)).not.toContain('signature.example');
});
it('isolates QI, UY3, users, tenants and promoters when reusing links',async()=>{
 const db=journeyDatabase(),pending={status:'PENDING',authorization_link:undefined,authorizationId:undefined};
 await withIntegrationPromoter('p-a',()=>rememberNossaAuthorization(db,'t','user:a',identity,{...pending,authorization_link:'https://signature.example.invalid/qi'}));
 for(const [tenant,actor,promoter,service] of [['t','user:a','p-a','uy3'],['other','user:a','p-a','qi'],['t','user:b','p-a','qi'],['t','user:a','p-b','qi']]){const state=await withIntegrationPromoter(promoter,()=>rememberNossaAuthorization(db,tenant,actor,{...identity,service_type:service},pending));expect(state.authorization_link).toBeUndefined();}
});
it('clears expired links and does not attach an old authorization ID to a new request',async()=>{
 const db=journeyDatabase();await rememberNossaAuthorization(db,'t','user:a',identity,{status:'PENDING',authorization_link:'https://signature.example.invalid/old',authorizationId:'old'});
 expect((await rememberNossaAuthorization(db,'t','user:a',identity,{status:'EXPIRED',authorization_link:undefined,authorizationId:undefined})).authorization_link).toBeUndefined();expect((await rememberNossaAuthorization(db,'t','user:a',identity,{status:'REQUESTED',authorization_link:'https://signature.example.invalid/new',authorizationId:undefined},'REQUEST')).authorizationId).toBeUndefined();
});
function workerDb(){const db:any=journeyDatabase();db.systemConfig.findMany=async({where,take}:any)=>db.rows.filter((r:any)=>(!where.tenantId||r.tenantId===where.tenantId)&&r.configKey.startsWith(where.configKey.startsWith)).slice(0,take);db.systemConfig.deleteMany=async({where}:any)=>{for(let i=db.rows.length-1;i>=0;i--)if(db.rows[i].tenantId===where.tenantId&&db.rows[i].configKey===where.configKey)db.rows.splice(i,1);};return db;}
const customer={cpf:identity.document_number,name:'Synthetic',phone:'11999999999',mode:'Payment',value:0,term:0,eligibility:true};
function snapshot(){return {executionId:'synthetic-execution',automaticEnabled:true,running:false,customer,banks:[{id:'nossa',name:'Nossa'}],results:{nossa:{status:'RETURNED',rows:[{provider:'Nossa',institution:'qi',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'}]}}} as any;}
it('stops following completed offers but keeps another institution pending',()=>{
 const snap=snapshot();snap.results.nossa.rows=[{institution:'qi',state:'DATA'},{institution:'qi',state:'OFFER'}];expect(Followup.pending(snap)).toBe(false);
 snap.results.nossa.rows.push({institution:'uy3',state:'PENDING',outcome:'AUTHORIZATION_REQUIRED'});expect(Followup.pending(snap)).toBe(true);
});
it('resumes encrypted tasks after restart, claims once across workers and never sends consent or consult creation',async()=>{
 vi.useFakeTimers();const db=workerDb(),snap=snapshot();await Followup.schedule(db,'t','user:a',snap);await Followup.schedule(db,'t','user:a',snap);expect(db.rows).toHaveLength(1);expect(JSON.stringify(db.rows)).not.toContain('user:a');vi.advanceTimersByTime(61000);
 vi.spyOn(V8CltPilot,'authorize').mockResolvedValue({allowed:true,userId:'a',tenantId:'t'});const service:any={get:vi.fn(async()=>({snapshot:snap})),observe:vi.fn(async()=>snap),start:vi.fn(),execute:vi.fn()};
 await Promise.all([Followup.run(db,service),Followup.run(db,service)]);expect(service.observe).toHaveBeenCalledTimes(1);expect(service.start).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(service.observe).toHaveBeenCalledWith(db,'t','user:a','synthetic-execution','nossa');
});
it('revalidates permissions and drops pending jobs when access is revoked',async()=>{
 vi.useFakeTimers();const db=workerDb(),snap=snapshot();await Followup.schedule(db,'t','user:a',snap);vi.advanceTimersByTime(61000);vi.spyOn(V8CltPilot,'authorize').mockResolvedValue({allowed:false,reason:'RESTRICTED'});const service:any={get:vi.fn(async()=>({snapshot:snap})),observe:vi.fn()};await Followup.run(db,service);expect(service.observe).not.toHaveBeenCalled();expect(db.rows).toHaveLength(0);
});
it('does not replay uncertain writes and stops expired followups',async()=>{
 vi.useFakeTimers();const db=workerDb(),snap=snapshot();snap.results.nossa.status='UNKNOWN';await Followup.schedule(db,'t','user:a',snap);vi.advanceTimersByTime(61000);vi.spyOn(V8CltPilot,'authorize').mockResolvedValue({allowed:true,userId:'a',tenantId:'t'});const service:any={get:vi.fn(async()=>({snapshot:snap})),observe:vi.fn(),start:vi.fn()};await Followup.run(db,service);expect(service.observe).not.toHaveBeenCalled();expect(service.start).not.toHaveBeenCalled();vi.advanceTimersByTime(8*86400000);await Followup.run(db,service);expect(db.rows).toHaveLength(0);
});
