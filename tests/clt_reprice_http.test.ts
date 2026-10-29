import express from 'express';import request from 'supertest';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {journeyDatabase} from './helpers/cltJourneyDatabase';
import {CltJourneyService} from '../server/services/cltJourneyService';
import {registerCltJourneyRoutes} from '../server/services/cltJourneyRoutes';
import {ProductSimulationService} from '../server/services/productSimulationService';
import {calculateVctexConditions} from '../server/services/vctexCltCalculation';
import {VctexBankService} from '../server/services/vctexBankService';
const root='00000000-0000-4000-8000-000000000101',id='00000000-0000-4000-8000-000000000102';
const customer={cpf:'52998224725',name:'Pessoa sintética',phone:'11999999999',v8BirthDate:'1990-02-28',v8Gender:'male',v8Email:'synthetic@example.invalid',value:0,term:0,mode:'Payment',eligibility:true};
beforeEach(()=>{vi.stubEnv('JWT_SECRET','synthetic-reprice-only');vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No bank calls');}));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each([0,12])('reprices all enabled banks with the exact requested 200 and term %s, preserves margin/history, and never mixes old offers',async term=>{
 const db:any=journeyDatabase();db.tenant.findUnique=async()=>({status:'ACTIVE'});const service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([{id:'nossa',name:'Nossa'},{id:'facta',name:'FACTA'},{id:'v8',name:'V8'}]);
 const parent=await service.start(db,'t','user:a',root,customer as any);parent.record.phase='DONE';parent.snapshot.running=false;
 for(const bank of parent.snapshot.banks)parent.snapshot.results[bank.id]={status:'RETURNED',rows:[{provider:bank.name,institution:bank.name,state:'DATA',data:{margin:{available_balance:529.93,can_continue:true}}},{provider:bank.name,institution:bank.name,state:'OFFER',table:'old-'+bank.id,amount:5000,installment:529.93,term:24}]};
 await parent.store.compareAndSet(root,parent.raw,parent.record);
 const run=vi.spyOn(ProductSimulationService,'run').mockImplementation(async(_db,_tenant,_product,action,input,_cb,providers)=>{
  expect(action).toBe('SIMULATE');expect(input).toMatchObject({value:200,term,autoConditions:false});const bank=providers![0];if(bank==='facta')throw Error('synthetic failure');
  return {message:undefined,rows:[{provider:bank,institution:bank,state:'OFFER',table:'new-'+bank,simulationId:'synthetic-'+bank,amount:2000,installment:200,term:term||24}]};
 });let tenant='t';const app=express();app.use(express.json());registerCltJourneyRoutes(app,db,async()=>({user:{id:'a',role:'MASTER'},effectiveTenantId:tenant}),service);
 const body={...customer,executionId:id,parentExecutionId:root,action:'SIMULATE',value:200,term};
 const response=await request(app).post('/api/simulations/clt/journey').send(body);expect(response.status).toBe(200);const final=JSON.parse(response.text.trim().split('\n').at(-1)!);
 expect(final.calculation).toMatchObject({value:200,term,sourceExecutionId:root});expect(final.rootExecutionId).toBe(id);expect(final.results.facta.status).toBe('UNKNOWN');
 expect(JSON.stringify(final)).not.toContain('old-');expect(final.results.nossa.rows.some((r:any)=>r.state==='OFFER'&&r.installment===200)).toBe(true);expect(final.results.nossa.rows.some((r:any)=>r.data?.margin?.available_balance===529.93)).toBe(true);
 expect((await service.get(db,'t','user:a',root))!.snapshot.results.nossa.rows.some(r=>r.table==='old-nossa')).toBe(true);
 await request(app).post('/api/simulations/clt/journey').send(body);expect(run).toHaveBeenCalledTimes(3);tenant='other';expect((await request(app).get('/api/simulations/clt/journey/'+id)).status).toBe(404);expect(fetch).not.toHaveBeenCalled();
});
it('requires positive parameters and an owned source execution before batch pricing',async()=>{
 const db:any=journeyDatabase();db.tenant.findUnique=async()=>({status:'ACTIVE'});const service=new CltJourneyService();vi.spyOn(service,'available').mockResolvedValue([]);const run=vi.spyOn(ProductSimulationService,'run');const app=express();app.use(express.json());registerCltJourneyRoutes(app,db,async()=>({user:{id:'a',role:'MASTER'},effectiveTenantId:'t'}),service);
 for(const value of [0,-1,'invalid'])expect((await request(app).post('/api/simulations/clt/journey').send({...customer,executionId:id,parentExecutionId:root,action:'SIMULATE',value})).status).toBe(400);
 expect((await request(app).post('/api/simulations/clt/journey').send({...customer,executionId:id,parentExecutionId:root,action:'SIMULATE',value:200})).status).toBeGreaterThanOrEqual(400);expect(run).not.toHaveBeenCalled();
});
it('VCTEX uses only an existing authorized pre-operation and every allowed installment term',async()=>{
 const db:any={promoter:{findMany:vi.fn(async()=>[{id:'p'}])}};vi.spyOn(VctexBankService,'config').mockResolvedValue({enabled:true,cpf:'synthetic',password:'synthetic'} as any);
 const refresh=vi.spyOn(VctexBankService,'refresh').mockResolvedValue({status:'finished',authorizationValid:true,preOperationId:'synthetic',employments:[{employmentId:'e',eligible:true,availableMarginValue:529.93}]} as any);
 vi.spyOn(VctexBankService,'rates').mockResolvedValue([{id:'r',allowedInstallments:[12,24]}] as any);const calculate=vi.spyOn(VctexBankService,'simulate').mockImplementation(async(_db,_t,_a,_p,_i,selected)=>({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',state:'OFFER',installment:selected.installment,term:selected.term} as any));
 const rows=await calculateVctexConditions(db,'t',{...customer,bmgActorId:'user:a',mode:'Payment',value:200} as any);expect(rows.filter(r=>r.state==='OFFER').map(r=>r.term)).toEqual([12,24]);expect(calculate.mock.calls.every(c=>c[5].installment===200)).toBe(true);expect(refresh.mock.calls.every(c=>c[5]===false)).toBe(true);
 calculate.mockClear();await calculateVctexConditions(db,'t',{...customer,bmgActorId:'user:a',mode:'Payment',value:600} as any);expect(calculate).not.toHaveBeenCalled();
 const unsupported=await calculateVctexConditions(db,'t',{...customer,bmgActorId:'user:a',mode:'Liquid',value:200} as any);expect(unsupported[0].outcome).toBe('UNSUPPORTED');
});

it('treats VCTEX limit refusals as condition outcomes, retains distinct equal-margin employments and persists one summarized diagnostic',async()=>{
 const db:any={promoter:{findMany:vi.fn(async()=>[{id:'p'}])}};vi.spyOn(VctexBankService,'config').mockResolvedValue({enabled:true,cpf:'synthetic',password:'synthetic'} as any);
 const employment={employmentId:'e-a',eligible:true,employer:{name:'Empresa sintética'},registrationNumber:'0001',availableMarginValue:529.94};
 vi.spyOn(VctexBankService,'refresh').mockResolvedValue({status:'finished',authorizationValid:true,preOperationId:'query-a',employments:[employment,employment,{...employment,employmentId:'e-b',registrationNumber:'0002'}]} as any);
 vi.spyOn(VctexBankService,'rates').mockResolvedValue([{id:'rate',allowedInstallments:[12,24],minInstallmentAmount:300,maxInstallmentAmount:500}] as any);const simulate=vi.spyOn(VctexBankService,'simulate');
 const rows=await calculateVctexConditions(db,'t',{...customer,bmgActorId:'user:a',mode:'Payment',value:200} as any);
 expect(simulate).not.toHaveBeenCalled();expect(rows.filter(r=>r.state==='DATA')).toHaveLength(2);expect(rows.some(r=>r.outcome==='TECHNICAL_ERROR'||r.state==='OFFER')).toBe(false);const summary=rows.filter(r=>(r.data as any)?.vctex?.conditionRejections);expect(summary).toHaveLength(1);expect(summary[0].message).toBe('Nenhuma oferta disponível para os parâmetros informados');expect((summary[0].data as any).vctex.conditionRejections).toHaveLength(4);
});
