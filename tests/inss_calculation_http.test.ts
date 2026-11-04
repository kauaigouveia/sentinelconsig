import express from 'express';
import request from 'supertest';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({calculate:vi.fn()}));
vi.mock('../server/services/portRefinWorkbooks',()=>({SPREADSHEET_MODELS:{DAYCOVAL:{key:'DAYCOVAL_INSS_WORKBOOK_V1',hash:'synthetic'}},calculatePortRefin:mocks.calculate,portRefinRatePolicies:()=>[],importPortRefin:vi.fn()}));
vi.mock('../server/services/daycovalWorkbook',()=>({decodeDaycoval:JSON.parse,encodeDaycoval:JSON.stringify,parseDate:(value:string)=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('Data inválida');return date;}}));
vi.mock('../server/services/partnerPortalService',()=>({PartnerPortalService:{getPartnerSession:async()=>null}}));
vi.mock('../server/services/auditLogService',()=>({AuditLogService:{record:vi.fn()}}));
vi.mock('../server/services/pusherService',()=>({eventBus:{publishToTenant:vi.fn()}}));
import {registerDaycovalRoutes} from '../server/services/daycovalRoutes';
const body={tenantId:'other-tenant',birthDate:'1959-10-30',benefitType:41,term:84,contracts:[{originBank:'001',originalTerm:84,remaining:57,balance:'3.481,19',installment:'43,00'}]};
beforeEach(()=>{vi.clearAllMocks();mocks.calculate.mockReturnValue({offers:[{calculated:true,eligible:false,tableId:'synthetic',tableName:'Synthetic',amount:100,contractAmount:3581.19,installment:43,term:84,rate:1,policyStatus:'PENDENTE DE DADOS'}]});});
function setup(session:any){
 const findUnique=vi.fn(async({where}:any)=>where.tenantId_configKey.tenantId==='synthetic-a'?{configValue:JSON.stringify({enabled:true,formulaHash:'synthetic',hash:'synthetic',terms:[84]})}:null);
 const write=vi.fn(()=>{throw Error('Business write forbidden');});
 const db={systemConfig:{findUnique},simulationRequest:{create:write,upsert:write},partner:{findFirst:write}};
 const app=express();app.use(express.json());registerDaycovalRoutes(app,db as any,async()=>session);return {app,findUnique,write};
}
it('uses the session tenant and returns a calculation without saving, publishing events, customer lookup or partner selection',async()=>{
 const {app,findUnique,write}=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-a'});
 const result=await request(app).post('/api/daycoval/calculate').send(body);
 expect(result.status).toBe(200);expect(result.body.offers[0]).toMatchObject({amount:100,requiresReview:true,quoteKind:'ESTIMATE'});
 expect(findUnique).toHaveBeenCalledWith({where:{tenantId_configKey:{tenantId:'synthetic-a',configKey:'DAYCOVAL_INSS_WORKBOOK_V1'}}});expect(write).not.toHaveBeenCalled();
 expect(mocks.calculate.mock.calls[0][2].contracts[0].paidInstallments).toBe(27);
});
it.each([null,{user:{id:'synthetic-user',role:'OPERADOR',customPermissions:[]},effectiveTenantId:'synthetic-a'}])('requires an authorized session before accessing a worksheet',async session=>{
 const {app,findUnique,write}=setup(session);expect((await request(app).post('/api/daycoval/calculate').send(body)).status).toBe(403);expect(findUnique).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(mocks.calculate).not.toHaveBeenCalled();
});
it('cannot use a workbook from another tenant even when its ID is supplied by the browser',async()=>{
 const {app,write}=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-b'});expect((await request(app).post('/api/daycoval/calculate').send({...body,tenantId:'synthetic-a'})).status).toBe(422);expect(write).not.toHaveBeenCalled();expect(mocks.calculate).not.toHaveBeenCalled();
});

it('calculates Daycoval combinations in one tenant-scoped request without business writes',async()=>{
 const {app,findUnique,write}=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-a'});
 const contracts=Array.from({length:5},(_,index)=>({...body.contracts[0],contractNumber:`SYNTHETIC-${index}`}));
 const result=await request(app).post('/api/daycoval/calculate-groups').send({...body,contracts});
 expect(result.status).toBe(200);expect(result.body.groups).toHaveLength(20);expect(findUnique).toHaveBeenCalledTimes(1);
 expect(result.body.groups.every((group:any)=>group.indices.length>=2&&group.indices.length<=3)).toBe(true);
 expect(mocks.calculate.mock.calls.every(call=>call[2].contracts.every((contract:any)=>contract.paidInstallments===27))).toBe(true);
 expect(write).not.toHaveBeenCalled();
});
it('rejects unauthenticated and duplicate groups before reading any workbook',async()=>{
 const denied=setup(null);expect((await request(denied.app).post('/api/daycoval/calculate-groups').send(body)).status).toBe(403);expect(denied.findUnique).not.toHaveBeenCalled();
 const allowed=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-a'});
 const contract={...body.contracts[0],contractNumber:'SYNTHETIC'};
 expect((await request(allowed.app).post('/api/daycoval/calculate-groups').send({...body,contracts:[contract,contract]})).status).toBe(400);
 expect(allowed.findUnique).not.toHaveBeenCalled();
});
it('isolates failed groups and cannot load the requested foreign tenant workbook',async()=>{
 const {app,findUnique,write}=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-b'});
 const contracts=[{...body.contracts[0],contractNumber:'A'},{...body.contracts[0],contractNumber:'B'}];
 const result=await request(app).post('/api/daycoval/calculate-groups').send({...body,tenantId:'synthetic-a',contracts});
 expect(result.body.groups[0].offers).toEqual([]);expect(result.body.groups[0].error).toMatch(/ausente/);
 expect(findUnique.mock.calls[0][0].where.tenantId_configKey.tenantId).toBe('synthetic-b');expect(mocks.calculate).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});

it('continues the other Daycoval groups when one creditor is explicitly blocked',async()=>{
 const {app,write}=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-a'});
 const contracts=[{...body.contracts[0],contractNumber:'A'},{...body.contracts[0],contractNumber:'B',originBank:'626'},{...body.contracts[0],contractNumber:'C'}];
 const result=await request(app).post('/api/daycoval/calculate-groups').send({...body,contracts});
 expect(result.status).toBe(200);expect(result.body.groups).toHaveLength(4);
 expect(result.body.groups.filter((group:any)=>group.offers.length)).toHaveLength(1);
 expect(result.body.groups.find((group:any)=>group.offers.length).indices).toEqual([0,2]);expect(write).not.toHaveBeenCalled();
});

it('paginates all 364 groups for thirteen contracts without exceeding three contracts per calculation',async()=>{
 const {app,write}=setup({user:{id:'synthetic-user',role:'MASTER'},effectiveTenantId:'synthetic-a'});
 const contracts=Array.from({length:13},(_,index)=>({...body.contracts[0],contractNumber:`SYNTHETIC-${index}`}));
 const all:number[][]=[];let offset=0,pages=0;
 while(true){
  const result=await request(app).post('/api/daycoval/calculate-groups').send({...body,contracts,offset});
  expect(result.status).toBe(200);expect(result.body.total).toBe(364);expect(result.body.groups.length).toBeLessThanOrEqual(35);
  all.push(...result.body.groups.map((group:any)=>group.indices));pages++;
  if(result.body.nextOffset==null)break;offset=result.body.nextOffset;
 }
 expect(pages).toBe(11);expect(all).toHaveLength(364);expect(new Set(all.map(group=>group.join('|'))).size).toBe(364);
 expect(all.every(group=>group.length===2||group.length===3)).toBe(true);expect(write).not.toHaveBeenCalled();
 expect((await request(app).post('/api/daycoval/calculate-groups').send({...body,contracts:[...contracts,{...contracts[0],contractNumber:'FOURTEENTH'}]})).status).toBe(400);
});
