import {describe,expect,it,vi} from 'vitest';
import {defaultRoutingRule,planPortabilityRouting,executeRoutingJobs,existingPortabilityPlan,publicPortabilityRows,type RoutingCandidate} from '../server/services/portabilityRouting';
const input={product:'INSS',operation:'PORT_REFIN',originalInstallment:35,debt:900};
const candidate=(bank:string,patch:Partial<RoutingCandidate>={}):RoutingCandidate=>({id:bank+'-api',bank,enabled:true,configured:true,authorized:true,transport:'OFFICIAL_API',dataReady:true,idempotencyReady:true,minimumBalance:2000,check:{blocked:false,review:false,status:'ELEGÍVEL',reason:'Fixture sintética; não representa homologação documental'},...patch});
const day=candidate('daycoval',{minimumBalance:0});
const other=candidate('facta',{check:{blocked:true,review:false,status:'NÃO ELEGÍVEL',reason:'Saldo abaixo do mínimo sintético'}});
const run=(patch={},candidates=[day,other],rules=[defaultRoutingRule('tenant-a')])=>planPortabilityRouting('tenant-a',{...input,...patch},candidates,rules,'2026-10-30');
describe('server-only routing with synthetic official-provider capability fixtures',()=>{
 it('prioritizes 35/900 only with proven eligibility, transport and other documented minima',()=>{expect(run().priorityId).toBe('daycoval-api');expect(run().trace[0].code).toBe('PRIORITY_SELECTED');});
 it('accepts workbook transport without a Daycoval API',()=>{expect(run({},[{...day,id:'daycoval-workbook',transport:'WORKBOOK'},other]).priorityId).toBe('daycoval-workbook');});
 it.each([50,60])('does not trigger at installment %s',value=>{expect(run({originalInstallment:value}).priorityId).toBeNull();});
 it.each([undefined,0])('does not discard another bank with unknown/zero minimum %s',minimumBalance=>{expect(run({},[day,{...other,minimumBalance}]).priorityId).toBeNull();});
 it('does not discard an eligible alternative or a documentary pending',()=>{expect(run({},[day,candidate('pan')]).priorityId).toBeNull();expect(run({},[day,{...other,check:{...other.check,review:true}}]).priorityId).toBeNull();});
 it.each([{enabled:false},{configured:false},{authorized:false},{transport:'UNAVAILABLE' as const},{dataReady:false},{idempotencyReady:false},{check:{...day.check,blocked:true}},{check:{...day.check,review:true}}])('does not call unavailable/ineligible/unproven Daycoval %j',patch=>{expect(run({},[{...day,...patch},other]).priorityId).toBeNull();});
 it('rejects invalid/missing financial data without inventing eligibility',()=>{for(const patch of [{debt:undefined},{originalInstallment:NaN},{debt:-1},{product:'CLT'},{operation:'NEW'}])expect(run(patch).priorityId).toBeNull();});
 it('scopes rules by tenant, active state and validity',()=>{
  for(const patch of [{tenantId:'tenant-b'},{active:false},{validFrom:'2027-01-01'},{validUntil:'2026-10-29'}])expect(run({},[day,other],[{...defaultRoutingRule('tenant-a'),...patch}]).priorityId).toBeNull();
 });
 it('executes Daycoval first, continues after failure and never executes a duplicate job',async()=>{
  const calls:string[]=[];const day=vi.fn(async()=>{calls.push('daycoval');throw Error('synthetic timeout');}),facta=vi.fn(async()=>{calls.push('facta');});
  const results=await executeRoutingJobs([{id:'facta',run:facta},{id:'daycoval',run:day},{id:'daycoval',run:day}],'daycoval');
  expect(calls).toEqual(['daycoval','facta']);expect(day).toHaveBeenCalledTimes(1);expect(facta).toHaveBeenCalledTimes(1);expect(results[0].status).toBe('FAILED');
 });
 it('does not upgrade the existing workbook to a bank API based on browser/config claims',async()=>{
  const findUnique=vi.fn(async(..._args:any[])=>null);const plan=await existingPortabilityPlan({systemConfig:{findUnique}},'tenant-a',{...input,priorityId:'daycoval-api',officialApi:true});
  expect(plan.priorityId).toBeNull();expect(findUnique.mock.calls.every(call=>(call[0] as any)?.where?.tenantId_configKey?.tenantId==='tenant-a')).toBe(true);
 });
 it('strips commercial criteria, discarded banks and nested diagnostics but retains actual institution and quote kind',()=>{
  const rows=publicPortabilityRows([{provider:'DAYCOVAL',institution:'Daycoval',state:'OFFER',amount:123,installment:35,term:36,rate:1.5,policyReview:'INTERNAL',routing:{reason:'INTERNAL'},spreadsheet:{secret:'INTERNAL'}},{provider:'FACTA',state:'PENDING',policyStatus:'NÃO ELEGÍVEL',message:'INTERNAL'}]);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({institution:'Daycoval',amount:123,quoteKind:'ESTIMATE'});expect(JSON.stringify(rows)).not.toContain('INTERNAL');
 });
});
