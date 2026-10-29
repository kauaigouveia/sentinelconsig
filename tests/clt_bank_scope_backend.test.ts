import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
import {CltJourneyService} from '../server/services/cltJourneyService';
import {ProductSimulationService} from '../server/services/productSimulationService';
import {NossaFintechService} from '../server/services/nossaFintechService';
import {nossaAuthorization} from '../server/services/nossaCltAuthorization';
const root='00000000-0000-4000-8000-000000000401',child='00000000-0000-4000-8000-000000000402';
const input={cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',v8BirthDate:'1990-02-28',v8Gender:'male' as const,v8Email:'synthetic@example.invalid',value:0,term:0,mode:'Payment',eligibility:true};
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-bank-isolation');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Real banks forbidden');}));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function setup(){const db=journeyDatabase(),service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([{id:'nossa',name:'Nossa Fintech'},{id:'facta',name:'FACTA'}]);const parent=await service.start(db,'t','user:a',root,input as any);parent.record.phase='DONE';parent.snapshot.running=false;parent.snapshot.results.nossa={status:'RETURNED',rows:[{provider:'Nossa Fintech',institution:'qi',state:'DATA',data:{margin:{available_balance:529.93,can_continue:true}}},{provider:'Nossa Fintech',institution:'qi',state:'OFFER',table:'Old Nossa',amount:1500}]};parent.snapshot.results.facta={executionId:root,status:'RETURNED',rows:[{provider:'FACTA',institution:'FACTA',state:'OFFER',simulationId:'f',table:'FACTA preservada',amount:2500,installment:300,term:12}]};await parent.store.compareAndSet(root,parent.raw,parent.record);return {db,service};}
it('recalculates only one bank, persists its request, and preserves the other bank in the canonical root',async()=>{
 const {db,service}=await setup();const run=vi.spyOn(ProductSimulationService,'run').mockResolvedValue({message:undefined,rows:[{provider:'Nossa Fintech',institution:'qi',origin:{providerId:'nossa',subInstitutionId:'qi',connectionId:'p'},state:'OFFER',table:'Nossa 200',amount:2000,installment:200,term:12}]});
 const entry=await service.start(db,'t','user:a',child,{...input,value:200} as any,'nossa','SIMULATE',root);await service.execute(db,'t','user:a',entry,{...input,value:200} as any,'SIMULATE','nossa');
 expect(run).toHaveBeenCalledOnce();expect(run.mock.calls[0][6]).toEqual(['nossa']);expect(run.mock.calls[0][4].value).toBe(200);
 expect(entry.snapshot.rootExecutionId).toBe(root);expect(entry.snapshot.customer?.value).toBe(0);expect(entry.snapshot.results.nossa.request?.value).toBe(200);expect(entry.snapshot.results.facta.rows[0].table).toBe('FACTA preservada');
 const saved=await new CltJourneyService().get(db,'t','user:a',root);expect(saved?.snapshot.results.facta.rows[0].table).toBe('FACTA preservada');expect(saved?.snapshot.results.nossa.rows.some(r=>r.table==='Old Nossa')).toBe(false);expect(saved?.snapshot.results.nossa.rows.find(r=>r.state==='OFFER')?.origin).toMatchObject({providerId:'nossa',subInstitutionId:'qi',executionId:child});
 await expect(service.recordProvider(db,'t','user:a',root,input.cpf,'nossa',[{provider:'Nossa Fintech',institution:'qi',state:'OFFER',installment:100,amount:9999,term:12}])).rejects.toThrow('execução anterior');
 run.mockImplementation(async(_db,_t,_p,action,body)=>{expect(action).toBe('REFRESH');expect(body.value).toBe(0);return {rows:[],message:undefined};});await service.observe(db,'t','user:a',root,'facta',true);
 expect((await service.get(db,'other','user:a',root))).toBeUndefined();expect((await service.get(db,'t','user:b',root))).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
});
it('rejects a response stamped for another bank instead of relabeling its financial values',async()=>{
 const {db,service}=await setup();vi.spyOn(ProductSimulationService,'run').mockResolvedValue({message:undefined,rows:[{provider:'Nossa Fintech',institution:'qi',origin:{providerId:'vctex'},state:'OFFER',amount:987654,table:'Wrong bank'}]});
 const entry=await service.start(db,'t','user:a',child,{...input,value:200} as any,'nossa','SIMULATE',root);await service.execute(db,'t','user:a',entry,{...input,value:200} as any,'SIMULATE','nossa');expect(JSON.stringify(entry.snapshot.results.nossa)).not.toContain('987654');expect(entry.snapshot.results.nossa.rows.some(r=>r.outcome==='TECHNICAL_ERROR')).toBe(true);
});
it('normalizes only explicit QI aliases and never accepts UY3 authorization for QI',()=>{
 expect(nossaAuthorization({status:'AUTHORIZED',service_type:'QITECH'},{document_number:input.cpf,service_type:'qi'}).status).toBe('AUTHORIZED');expect(()=>nossaAuthorization({status:'AUTHORIZED',service_type:'uy3'},{document_number:input.cpf,service_type:'qi'})).toThrow();expect(()=>nossaAuthorization({status:'AUTHORIZED',service_type:'unrecognized qi bank'},{document_number:input.cpf,service_type:'qi'})).toThrow();
});

it('deduplicates explicit QI aliases from the API catalogue and keeps UY3 origin separate without generating authorizations',async()=>{
 const db=journeyDatabase();vi.spyOn(NossaFintechService,'getConfig').mockResolvedValue({enabled:true,isConfigured:true});
 const bank=vi.spyOn(NossaFintechService,'request').mockImplementation(async(_db,_t,_m,path)=>({success:true,status:200,data:path.endsWith('banking-institutions')?['QITECH','qi','uy3']:{status:'PENDING'}}));
 const result=await ProductSimulationService.run(db as any,'t','CLT','REFRESH',{...input,mode:'Payment',bmgActorId:'user:a'},undefined,['nossa']);expect(result.rows).toHaveLength(2);expect(result.rows.map(r=>r.origin?.subInstitutionId).sort()).toEqual(['qi','uy3']);expect(bank.mock.calls.filter(c=>c[3].endsWith('check-authorization'))).toHaveLength(2);expect(bank.mock.calls.some(c=>c[3].endsWith('request-authorization'))).toBe(false);expect(fetch).not.toHaveBeenCalled();
});

it('keeps seven bound V8 offers after status refresh, persists recovery, and never simulates during GET',async()=>{
 const db=journeyDatabase(),service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([{id:'v8',name:'V8 DIGITAL'}]);
 const entry=await service.start(db,'t','user:a',root,input as any);entry.record.phase='UNKNOWN';entry.snapshot.running=false;
 const margin={provider:'V8 DIGITAL',institution:'V8',state:'DATA' as const,data:{v8:{consultId:'consult-a',promoterId:'p',status:'SUCCESS',consentRecorded:true},margin:{available_balance:529.93,can_continue:true}}};
 entry.snapshot.results.v8={executionId:root,status:'UNKNOWN',rows:[margin,...Array.from({length:7},(_,i)=>({provider:'V8 DIGITAL',institution:'V8',state:'OFFER' as const,origin:{providerId:'v8',executionId:root,consultationId:'consult-a',connectionId:'p'},simulationId:'synthetic-'+i,amount:2000,installment:200,term:12+i,data:{v8:{consultId:'consult-a',promoterId:'p'}}}))]};await entry.store.compareAndSet(root,entry.raw,entry.record);
 const run=vi.spyOn(ProductSimulationService,'run').mockResolvedValue({rows:[margin],message:undefined});
 await service.refreshV8(db,'t','user:a',root,'consult-a','p');const saved=await new CltJourneyService().get(db,'t','user:a',root);
 expect(saved?.snapshot.results.v8.rows.filter(r=>r.state==='OFFER')).toHaveLength(7);expect(saved?.snapshot.results.v8.rows.filter(r=>r.state==='DATA')).toHaveLength(1);expect(run.mock.calls[0][3]).toBe('REFRESH');expect(await service.refreshV8(db,'other','user:a',root,'consult-a','p')).toBeUndefined();expect(await service.refreshV8(db,'t','user:b',root,'consult-a','p')).toBeUndefined();expect(fetch).not.toHaveBeenCalled();
});
it('coordinates existing banks with read-only inputs, preserves completed offers and isolates a gateway failure',async()=>{
 const {db,service}=await setup();const entry=(await service.get(db,'t','user:a',root))!;entry.snapshot.banks.push({id:'v8',name:'V8'},{id:'vctex',name:'VCTEX',contextual:true});entry.snapshot.results.nossa.rows=entry.snapshot.results.nossa.rows.filter(r=>r.state!=='OFFER');entry.snapshot.results.v8={status:'RETURNED',rows:[]};entry.snapshot.results.vctex={status:'CONTEXTUAL',rows:[]};await entry.store.compareAndSet(root,entry.raw,entry.record);
 const run=vi.spyOn(ProductSimulationService,'run').mockImplementation(async(_db,_t,_p,action,body,_cb,providers)=>{expect(action).toBe('REFRESH');expect(body).toMatchObject({observeOnly:true,automaticAuthorization:false});if(providers?.[0]==='v8')throw Error('synthetic transport failure');return {rows:[{provider:'synthetic',institution:providers![0],state:'DATA',data:{margin:{available_balance:500}}}],message:undefined};});
 const next=await service.observe(db,'t','user:a',root,undefined,true);expect(next?.results.facta.rows[0].table).toBe('FACTA preservada');expect(next?.results.vctex.rows[0].state).toBe('DATA');expect(next?.results.v8.message).toContain('Nenhuma solicitação foi reenviada');expect(run.mock.calls.map(c=>c[6]?.[0]).sort()).toEqual(['nossa','v8','vctex']);expect(fetch).not.toHaveBeenCalled();
});

it.each([false,true])('recovers V8 consultation-only UNKNOWN for pricing but never releases an uncertain financial attempt: %s',async financialUnknown=>{
 const db=journeyDatabase(),service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([{id:'v8',name:'V8 DIGITAL'}]);const entry=await service.start(db,'t','user:a',root,input as any);entry.record.phase='UNKNOWN';entry.snapshot.running=false;
 const margin={provider:'V8 DIGITAL',institution:'V8',state:'DATA' as const,data:{v8:{consultId:'c',promoterId:'p',status:'SUCCESS',consentRecorded:true,simulationReady:true},margin:{available_balance:529.93,can_continue:true}}};
 entry.snapshot.results.v8={status:'UNKNOWN',stage:'RESULT',...(financialUnknown?{simulation:{status:'UNKNOWN' as const}}:{}),rows:[margin]};await entry.store.compareAndSet(root,entry.raw,entry.record);
 const run=vi.spyOn(ProductSimulationService,'run').mockImplementation(async(_db,_t,_p,action,body)=>{if(action==='REFRESH')return {rows:[margin],message:undefined};expect(body.autoConditions).toBe(true);return {rows:[{provider:'V8 DIGITAL',institution:'V8',state:'OFFER',simulationId:'q',installment:529.93,term:12,amount:2500,data:{v8:{consultId:'c',promoterId:'p'}}}],message:undefined};});
 const observed=await service.observe(db,'t','user:a',root,'v8',true);expect(observed?.results.v8.readyToSimulate).toBe(!financialUnknown);
 if(!financialUnknown){expect(observed?.results.v8.status).toBe('RETURNED');const next=await service.start(db,'t','user:a',child,{...input,autoConditions:true} as any,'v8','SIMULATE',root);await service.execute(db,'t','user:a',next,{...input,autoConditions:true} as any,'SIMULATE','v8');expect(next.snapshot.results.v8.simulation?.status).toBe('OFFERS');expect(next.snapshot.results.v8.rows.filter(r=>r.state==='OFFER')).toHaveLength(1);expect((await new CltJourneyService().get(db,'t','user:a',root))?.snapshot.results.v8.simulation?.status).toBe('OFFERS');}
 expect(run.mock.calls.filter(c=>c[3]==='SIMULATE')).toHaveLength(financialUnknown?0:1);expect(fetch).not.toHaveBeenCalled();
});

it.each(['MISSING_DATA','TECHNICAL_ERROR'] as const)('preserves a valid V8 margin and records the simulation outcome %s without an automatic replay',async outcome=>{
 const db=journeyDatabase(),service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([{id:'v8',name:'V8'}]);const parent=await service.start(db,'t','user:a',root,input as any);parent.record.phase='DONE';parent.snapshot.running=false;
 const margin={provider:'V8 DIGITAL',institution:'V8',state:'DATA' as const,data:{v8:{consultId:'c',promoterId:'p',status:'SUCCESS',simulationReady:true,consentRecorded:true},margin:{available_balance:529.93,can_continue:true}}};parent.snapshot.results.v8={status:'RETURNED',rows:[margin]};await parent.store.compareAndSet(root,parent.raw,parent.record);
 const run=vi.spyOn(ProductSimulationService,'run').mockImplementation(async(_db,_t,_p,action)=>({rows:action==='REFRESH'?[margin]:[{provider:'V8 DIGITAL',institution:'V8',state:'PENDING',outcome}],message:undefined}));
 const entry=await service.start(db,'t','user:a',child,{...input,value:200} as any,'v8','SIMULATE',root);await service.execute(db,'t','user:a',entry,{...input,value:200} as any,'SIMULATE','v8');expect(entry.snapshot.results.v8.simulation?.status).toBe(outcome==='TECHNICAL_ERROR'?'FAILED':'NO_OFFERS');expect(entry.snapshot.results.v8.rows.some(r=>(r.data as any)?.margin?.available_balance===529.93)).toBe(true);
 const observed=await service.observe(db,'t','user:a',root,'v8',true);expect(observed?.results.v8.readyToSimulate).toBe(false);expect(run.mock.calls.filter(c=>c[3]==='SIMULATE')).toHaveLength(1);expect(fetch).not.toHaveBeenCalled();
});
