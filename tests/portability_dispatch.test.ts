import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({factaConfig:vi.fn(),facta:vi.fn(),bmg:vi.fn(),happy:vi.fn(),nossaConfig:vi.fn(),finantoConfig:vi.fn()}));
vi.mock('../server/services/factaSimulationService',()=>({FactaSimulationService:{inss:mocks.facta}}));
vi.mock('../server/services/factaBankService',()=>({FactaBankService:{getTenantConfig:mocks.factaConfig}}));
vi.mock('../server/services/bmgBankService',()=>({BmgBankService:{offers:mocks.bmg}}));
vi.mock('../server/services/partnerHappySimulation',()=>({partnerHappySimulation:mocks.happy}));
vi.mock('../server/services/nossaFintechService',()=>({NossaFintechService:{getConfig:mocks.nossaConfig}}));
vi.mock('../server/services/finantoService',()=>({FinantoService:{getConfig:mocks.finantoConfig}}));
vi.mock('../server/services/c6SimulationService',()=>({C6SimulationService:{inss:vi.fn()}}));
vi.mock('../server/services/productSimulationService',()=>({ProductSimulationService:{run:vi.fn()}}));
vi.mock('../server/services/portRefinWorkbooks',()=>({SPREADSHEET_MODELS:{},calculatePortRefin:vi.fn()}));
vi.mock('../server/services/daycovalWorkbook',()=>({decodeDaycoval:vi.fn()}));
import {PartnerSimulationService} from '../server/services/partnerSimulationService';
const input={product:'INSS',operation:'PORT_REFIN',birthDate:'1980-01-01',state:'SP',benefitType:41,
 originalBank:'012',originalTerm:60,remainingTerm:36,originalInstallment:900,debt:10000,
 mode:'Payment',value:900,term:36,rate:1.8,bmgActorId:'synthetic-user'};
beforeEach(()=>{vi.clearAllMocks();mocks.happy.mockResolvedValue([]);mocks.bmg.mockResolvedValue([{provider:'BMG',institution:'BMG',state:'OFFER',amount:1000}]);
 mocks.factaConfig.mockImplementation(async(_db,tenant)=>({isConfigured:tenant==='tenant-a',simulationEnabled:tenant==='tenant-a'}));
 mocks.facta.mockResolvedValue({offers:[{amount:1000}]});mocks.nossaConfig.mockResolvedValue({enabled:false});mocks.finantoConfig.mockResolvedValue({enabled:false});});
it('skips a confirmed forbidden origin, continues to the next bank once and exposes the reason',async()=>{
 const result=await PartnerSimulationService.run({} as any,'tenant-a',input,'SIMULATE');
 expect(mocks.facta).not.toHaveBeenCalled();expect(mocks.bmg).toHaveBeenCalledTimes(1);
 expect(result.rows.some(row=>row.provider==='BMG'&&row.state==='OFFER')).toBe(true);
 expect(result.rows.find(row=>row.provider==='FACTA')).toMatchObject({policyStatus:'NÃO ELEGÍVEL',state:'PENDING'});
 expect(mocks.bmg.mock.calls[0].slice(1,3)).toEqual(['tenant-a','synthetic-user']);
});
it('uses each tenant configuration without leaking a configured provider to another tenant',async()=>{
 const data={...input,originalBank:'001'};
 await PartnerSimulationService.run({} as any,'tenant-b',data,'SIMULATE');expect(mocks.facta).not.toHaveBeenCalled();
 await PartnerSimulationService.run({} as any,'tenant-a',data,'SIMULATE');expect(mocks.facta).toHaveBeenCalledTimes(1);
 expect(mocks.facta.mock.calls[0][1]).toBe('tenant-a');
});
it('isolates a provider failure and never retries its non-idempotent call',async()=>{
 mocks.facta.mockRejectedValue(new Error('Falha sintética'));
 const result=await PartnerSimulationService.run({} as any,'tenant-a',{...input,originalBank:'001'},'SIMULATE');
 expect(mocks.facta).toHaveBeenCalledTimes(1);expect(mocks.bmg).toHaveBeenCalledTimes(1);
 expect(result.message).toContain('Falha sintética');expect(result.rows.some(row=>row.provider==='BMG')).toBe(true);
});
