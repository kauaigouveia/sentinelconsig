import { expect, it, vi, beforeEach } from 'vitest';
import { registerInssStatementQuoteRoutes } from '../server/services/inssStatementQuoteRoutes';
import { PartnerSimulationService } from '../server/services/partnerSimulationService';

vi.mock('../server/services/partnerSimulationService',()=>({PartnerSimulationService:{run:vi.fn()}}));
vi.mock('../src/lib/permissions',()=>({hasPermission:()=>true}));

type Callback=(req:any,res:any)=>Promise<any>;
let handler:Callback;
const app={post:(route:string,_limit:any,callback:Callback)=>{
  if (route==='/api/inss/statement/quote') handler=callback;
}} as any;
const base={
  confirmedClientAuthorization:true,
  operation:'PORT_REFIN',illiterate:'NO',loanBlocked:false,legalRepresentative:false,
  cpf:'52998224725',name:'Pessoa sintética',benefitNumber:'1234567890',
  benefitType:41,birthDate:'1960-01-01',income:1621,loanMargin:36.52,term:108,
  contract:{originBank:'707',contractNumber:'TESTE',originalTerm:84,remainingTerm:27,debt:1000,installment:36.5},
};
const user={user:{id:'user-test',role:'GESTOR',tenantId:'tenant-test',customPermissions:[]},effectiveTenantId:'tenant-test'};
function response(){
  const res:any={payload:null,code:200};
  res.setHeader=vi.fn();
  res.status=(code:number)=>{res.code=code;return res;};
  res.json=(data:any)=>{res.payload=data;return res;};
  return res;
}
beforeEach(()=>{
  vi.resetAllMocks();
  registerInssStatementQuoteRoutes(app,{} as any,async()=>user);
});
it('rejeita execução sem autorização explícita do cliente',async()=>{
  const res=response();
  await handler({body:{...base,confirmedClientAuthorization:false}},res);
  expect(res.code).toBe(400);
  expect(PartnerSimulationService.run).not.toHaveBeenCalled();
});
it('filtra Daycoval→Daycoval inclusive quando retorna por outra integração',async()=>{
  vi.mocked(PartnerSimulationService.run).mockResolvedValue({
    rows:[
      {provider:'DAYCOVAL',institution:'DAYCOVAL',state:'OFFER',amount:1000,term:108,rate:1.85},
      {provider:'FINANTO',institution:'Banco Daycoval',state:'OFFER',amount:1000,term:108,rate:1.85},
      {provider:'FACTA',institution:'FACTA',state:'OFFER',amount:1500,term:108,rate:1.85},
    ],
  } as any);
  const res=response();
  await handler({body:base},res);
  expect(res.code).toBe(200);
  expect(res.payload.offers).toHaveLength(1);
  expect(res.payload.offers[0].provider).toBe('FACTA');
  expect(vi.mocked(PartnerSimulationService.run).mock.calls[0][1]).toBe('tenant-test');
});
it('NOVO usa apenas margem atual e não executa aumento projetado de 42',async()=>{
  vi.mocked(PartnerSimulationService.run).mockResolvedValue({
    rows:[{provider:'C6',institution:'C6 BANK',state:'OFFER',amount:1600,term:108,rate:1.85,installment:36.52}],
  } as any);
  const res=response();
  await handler({body:{...base,contract:undefined,operation:'NEW'}},res);
  expect(res.code).toBe(200);
  const input=vi.mocked(PartnerSimulationService.run).mock.calls[0][2];
  expect(input).toMatchObject({operation:'NEW',value:36.52,term:108});
  expect(JSON.stringify(input)).not.toContain('42.00');
  expect(res.payload.offers[0].source).toBe('API');
});
it('bloqueia sessão ausente sem consultar motor bancário',async()=>{
  registerInssStatementQuoteRoutes(app,{} as any,async()=>null);
  const res=response();
  await handler({body:base},res);
  expect(res.code).toBe(401);
  expect(PartnerSimulationService.run).not.toHaveBeenCalled();
});
