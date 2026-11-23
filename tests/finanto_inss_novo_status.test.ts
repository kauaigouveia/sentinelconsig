import {beforeEach,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
  factaConfig:vi.fn(),facta:vi.fn(),finantoConfig:vi.fn(),finantoRequest:vi.fn(),
  c6:vi.fn(),happy:vi.fn(),nossaConfig:vi.fn(),
}));
vi.mock('../server/services/factaBankService',()=>({FactaBankService:{getTenantConfig:mocks.factaConfig}}));
vi.mock('../server/services/factaSimulationService',()=>({FactaSimulationService:{inss:mocks.facta}}));
vi.mock('../server/services/finantoService',()=>({FinantoService:{getConfig:mocks.finantoConfig,request:mocks.finantoRequest}}));
vi.mock('../server/services/c6SimulationService',()=>({C6SimulationService:{inss:mocks.c6}}));
vi.mock('../server/services/partnerHappySimulation',()=>({partnerHappySimulation:mocks.happy}));
vi.mock('../server/services/nossaFintechService',()=>({NossaFintechService:{getConfig:mocks.nossaConfig}}));
vi.mock('../server/services/portRefinWorkbooks',()=>({SPREADSHEET_MODELS:{}}));
vi.mock('../server/services/bmgBankService',()=>({BmgBankService:{offers:vi.fn()}}));
vi.mock('../server/services/productSimulationService',()=>({ProductSimulationService:{run:vi.fn()}}));
import {PartnerSimulationService} from '../server/services/partnerSimulationService';

const input={
  product:'INSS',operation:'NEW',birthDate:'1980-01-01',benefitType:41,
  cpf:'00000000191',benefitNumber:'1234567890',
  mode:'Payment',value:500,term:108,rate:1.85,
};
const bankRules=[{id:'synthetic-rule',name:'INSS NOVO',product:{id:'synthetic-product'},items:[{term:108,rate:1.85}]}];

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.factaConfig.mockResolvedValue({isConfigured:true,simulationEnabled:true});
  mocks.facta.mockResolvedValue({offers:[{provider:'FACTA',amount:1000,installment:500,rate:1.85,term:108}]});
  mocks.finantoConfig.mockResolvedValue({enabled:true,isConfigured:true});
  mocks.c6.mockResolvedValue([]);
  mocks.happy.mockResolvedValue([]);
  mocks.nossaConfig.mockResolvedValue({enabled:false,isConfigured:false});
  mocks.finantoRequest.mockImplementation(async (_db,_tenant,_method,endpoint)=>{
    if(endpoint.includes('loan-products/search'))return {success:true,status:200,data:{items:[{id:'synthetic-product',type:{code:20}}]}};
    if(endpoint.includes('loan-product-rules/search'))return {success:true,status:200,data:{items:bankRules}};
    if(endpoint.includes('/calculation'))return {success:true,status:200,data:{netValue:0,loanValue:0}};
    throw Error('Endpoint de teste inesperado');
  });
});

it('não conta oferta concorrente da FACTA como cotação da FINANTO',async()=>{
  const result=await PartnerSimulationService.run({} as any,'tenant-synthetic',input,'SIMULATE');
  expect(result.rows).toContainEqual(expect.objectContaining({provider:'FACTA',state:'OFFER'}));
  expect(result.rows).toContainEqual(expect.objectContaining({provider:'FINANTO',state:'PENDING',outcome:'MISSING_DATA'}));
  expect(result.rows.some(row=>row.provider==='FINANTO'&&row.state==='OFFER')).toBe(false);
});

it('distingue falha de cálculo FINANTO de falta de tabela',async()=>{
  mocks.finantoRequest.mockImplementation(async (_db,_tenant,_method,endpoint)=>{
    if(endpoint.includes('loan-products/search'))return {success:true,status:200,data:{items:[{id:'synthetic-product',type:{code:20}}]}};
    if(endpoint.includes('loan-product-rules/search'))return {success:true,status:200,data:{items:bankRules}};
    if(endpoint.includes('/calculation'))return {success:false,status:502,data:{message:'Gateway indisponível'}};
    throw Error('Endpoint de teste inesperado');
  });
  const result=await PartnerSimulationService.run({} as any,'tenant-synthetic',input,'SIMULATE');
  expect(result.rows).toContainEqual(expect.objectContaining({provider:'FINANTO',state:'ERROR',outcome:'TECHNICAL_ERROR'}));
});

it('identifica tabelas INSS ausentes sem criar ofertas fictícias',async()=>{
  mocks.finantoRequest.mockImplementation(async (_db,_tenant,_method,endpoint)=>{
    if(endpoint.includes('loan-products/search'))return {success:true,status:200,data:{items:[{id:'synthetic-product',type:{code:20}}]}};
    return {success:true,status:200,data:{items:[]}};
  });
  const result=await PartnerSimulationService.run({} as any,'tenant-synthetic',input,'SIMULATE');
  expect(result.rows).toContainEqual(expect.objectContaining({provider:'FINANTO',state:'PENDING',outcome:'UNSUPPORTED'}));
  expect(result.rows.filter(row=>row.provider==='FINANTO'&&row.state==='OFFER')).toHaveLength(0);
});
