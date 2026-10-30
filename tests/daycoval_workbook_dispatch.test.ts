import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({facta:vi.fn(),prepare:vi.fn(),audit:vi.fn(),calls:[] as string[]}));
vi.mock('../server/services/auditLogService',()=>({AuditLogService:{record:mocks.audit}}));
vi.mock('../server/services/factaSimulationService',()=>({FactaSimulationService:{inss:mocks.facta}}));
vi.mock('../server/services/factaBankService',()=>({FactaBankService:{getTenantConfig:async()=>({isConfigured:true,simulationEnabled:true})}}));
vi.mock('../server/services/happyBankService',()=>({HappyBankService:{getTenantConfig:async()=>({isConfigured:false})}}));
vi.mock('../server/services/bmgBankService',()=>({BmgBankService:{offers:vi.fn()}}));
vi.mock('../server/services/partnerHappySimulation',()=>({partnerHappySimulation:async()=>[]}));
vi.mock('../server/services/nossaFintechService',()=>({NossaFintechService:{getConfig:async()=>({enabled:false})}}));
vi.mock('../server/services/finantoService',()=>({FinantoService:{getConfig:async()=>({enabled:false})}}));
vi.mock('../server/services/c6SimulationService',()=>({C6SimulationService:{inss:vi.fn()}}));
vi.mock('../server/services/productSimulationService',()=>({ProductSimulationService:{run:vi.fn()}}));
vi.mock('../server/services/portRefinWorkbooks',()=>({SPREADSHEET_MODELS:{DAYCOVAL:{key:'DAYCOVAL_INSS_WORKBOOK_V1',label:'Daycoval'}},calculatePortRefin:vi.fn()}));
vi.mock('../server/services/daycovalWorkbook',()=>({decodeDaycoval:JSON.parse}));
vi.mock('../server/services/daycovalAutomaticWorkbook',()=>({prepareDaycovalWorkbook:mocks.prepare}));
// Eligibility/capability fixtures here are synthetic; real documentary conflicts are tested separately.
vi.mock('../src/lib/portabilitySimulationPolicy',()=>({simulationPortabilityCheck:(bank:string)=>({blocked:bank.toLowerCase()==='facta',review:false,status:bank.toLowerCase()==='facta'?'NÃO ELEGÍVEL':'ELEGÍVEL',reason:'Synthetic minimum'})}));
vi.mock('../src/lib/portabilityRuleSources',()=>({portabilitySourceCatalog:[{id:'daycoval'}],portabilityRuleSources:()=>({criteria:{minBalance:2000}})}));
import {PartnerSimulationService} from '../server/services/partnerSimulationService';
const input={product:'INSS',operation:'PORT_REFIN',originalInstallment:35,debt:900};
const db=()=>({systemConfig:{findUnique:vi.fn(async({where}:any)=>where.tenantId_configKey.configKey==='DAYCOVAL_INSS_WORKBOOK_V1'&&where.tenantId_configKey.tenantId==='tenant-a'?{configValue:JSON.stringify({enabled:true})}:null)}});
beforeEach(()=>{vi.clearAllMocks();mocks.calls=[];mocks.facta.mockResolvedValue({offers:[]});mocks.prepare.mockImplementation(book=>{
 if(!book)return {ready:false,code:'WORKBOOK_UNAVAILABLE',reason:'Planilha ausente',result:null};
 mocks.calls.push('daycoval');return {ready:true,code:'WORKBOOK_READY',result:{offers:[{provider:'DAYCOVAL',tableName:'Synthetic',tableId:'s1',amount:100,installment:35,term:36,rate:1,eligible:true}],version:{hash:'synthetic'}}};
});});
it('uses the registered tenant workbook once without a Daycoval API and projects only financial results',async()=>{
 const prisma=db();const updates:any[]=[];
 const result=await PartnerSimulationService.run(prisma as any,'tenant-a',input,'SIMULATE',async rows=>{updates.push(rows);});
 expect(mocks.prepare).toHaveBeenCalledTimes(1);expect(mocks.calls).toEqual(['daycoval']);expect(mocks.facta).not.toHaveBeenCalled();
 expect(result.rows).toEqual([expect.objectContaining({provider:'DAYCOVAL',amount:100,quoteKind:'ESTIMATE'})]);
 expect(mocks.audit.mock.calls[0][1].newData.priorityId).toBe('daycoval-workbook');
 for(const rows of [result.rows,...updates])expect(JSON.stringify(rows)).not.toMatch(/priorityId|spreadsheetVersion|policyReview|Synthetic minimum/);
 expect(prisma.systemConfig.findUnique.mock.calls.every(([q]:any[])=>q.where.tenantId_configKey.tenantId==='tenant-a')).toBe(true);
});
it('cannot reuse a workbook from a different tenant',async()=>{
 const result=await PartnerSimulationService.run(db() as any,'tenant-b',input,'SIMULATE');
 expect(result.rows).toEqual([]);expect(mocks.prepare).toHaveBeenCalledWith(null,expect.anything(),expect.any(String));
 expect(mocks.audit.mock.calls[0][1].newData.decisions).toContainEqual(expect.objectContaining({bank:'daycoval',status:'WORKBOOK_UNAVAILABLE'}));
});
it('keeps unavailable workbook details private, without fictional offers',async()=>{
 mocks.prepare.mockReturnValue({ready:false,code:'WORKBOOK_VALIDITY_UNCONFIRMED',reason:'Private validity pending',result:null});
 const result=await PartnerSimulationService.run(db() as any,'tenant-a',input,'SIMULATE');
 expect(result.rows).toEqual([]);expect(result.message).not.toContain('Private');
 expect(mocks.audit.mock.calls[0][1].newData.decisions).toContainEqual(expect.objectContaining({bank:'daycoval',status:'WORKBOOK_VALIDITY_UNCONFIRMED'}));
});
