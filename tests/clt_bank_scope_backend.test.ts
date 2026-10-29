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
