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
