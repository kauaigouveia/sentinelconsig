// @vitest-environment node
import {describe,it,expect,vi,afterEach} from 'vitest';
import {C6FgtsSimulationService} from '../server/services/c6FgtsSimulationService';
import {C6BankService} from '../server/services/c6BankService';
import {ProductSimulationService} from '../server/services/productSimulationService';
import {NossaFintechService} from '../server/services/nossaFintechService';
import {FactaBankService} from '../server/services/factaBankService';
import {V8CltSimulationService} from '../server/services/v8CltSimulationService';

const bank={enabled:true,isConfigured:true,fgtsSimulationEnabled:true,
  fgtsCovenantCode:'610001',promoterCode:'004556',
  baseUrl:'https://marketplace-proposal-service-api-p.c6bank.info'};
const input={cpf:'52998224725',birthDate:'1986-07-23',
  term:5,value:0,mode:'Payment' as const};
const data={installment_quantity:5,net_amount:23082.31,principal_amount:23682.49,
 monthly_customer_rate:1.799,iof_amount:600.18,
 simulation_id:'TEST_ONLY',expire_at:'2099-01-01T00:00:00Z',
 installments:[{number:1,amount:7746.15,due_date:'2027-05-01T00:00:00'}]};
afterEach(()=>vi.restoreAllMocks());
describe('C6 FGTS oficial — simulação sem inclusão',()=>{
 const prep=()=>{vi.spyOn(C6BankService,'getAccessToken').mockResolvedValue('synthetic-token');};
 const fake=(response=data)=>{
   const calls:any[]=[];
   const transport=vi.fn(async(url:any,init:any)=>{
    calls.push({url,init});
    return {ok:true,status:200,json:async()=>response};
   }) as any;
   return {calls,transport};
 };
 it('BY_INSTALLMENT_QUANTITY envia somente campos documentados e retorna oferta líquida',async()=>{
  prep();const {calls,transport}=fake();
  const quote=await C6FgtsSimulationService.simulate({} as any,'tenant-a',input,bank as any,transport);
  expect(quote).toMatchObject({provider:'C6',state:'OFFER',amount:23082.31,term:5,rate:1.799,
    data:{iof:600.18,annualInstallments:[{amount:7746.15,number:1}]}});
  const {url,init}=calls[0],payload=JSON.parse(init.body);
  expect(url).toBe(bank.baseUrl+'/marketplace/proposal/fgts/simulation');
  expect(init.method).toBe('POST');
  expect(init.headers).toMatchObject({
    Accept:'application/vnd.c6bank_fgts_simulation_v2+json',
    Authorization:'synthetic-token',
  });
  expect(payload).toEqual({covenant_code:'610001',formalization_subtype:'DIGITAL_WEB',
    simulation_type:'BY_INSTALLMENT_QUANTITY',installment_quantity:5,
    tax_identifier:'52998224725',birth_date:'1986-07-23',promoter_code:'004556'});
  expect(JSON.stringify(quote)).not.toContain(input.cpf);
  expect(JSON.stringify(quote)).not.toContain('synthetic-token');
  expect(quote).not.toHaveProperty('installment'); // FGTS uses variable ANNUAL withdrawals
  expect(calls).toHaveLength(1); // never invoke /fgts inclusion
 });
 it('BY_REQUESTED_AMOUNT envia financed_amount, sem installment_quantity',async()=>{
  prep();const {calls,transport}=fake({...data,installment_quantity:1} as any);
  await C6FgtsSimulationService.simulate({} as any,'tenant-a',
    {...input,mode:'Liquid',value:3000,fgtsSimulationType:'BY_REQUESTED_AMOUNT'},bank as any,transport);
  expect(JSON.parse(calls[0].init.body)).toMatchObject({simulation_type:'BY_REQUESTED_AMOUNT',financed_amount:3000});
  expect(JSON.parse(calls[0].init.body)).not.toHaveProperty('installment_quantity');
 });
 it('BY_FULL_AVAILABLE_AMOUNT não envia quantidade ou valor',async()=>{
  prep();const {calls,transport}=fake({...data,installment_quantity:10} as any);
  await C6FgtsSimulationService.simulate({} as any,'tenant-a',
    {...input,fgtsSimulationType:'BY_FULL_AVAILABLE_AMOUNT'},bank as any,transport);
  const request=JSON.parse(calls[0].init.body);
  expect(request.simulation_type).toBe('BY_FULL_AVAILABLE_AMOUNT');
  expect(request).not.toHaveProperty('financed_amount');
  expect(request).not.toHaveProperty('installment_quantity');
 });
 it('sem autorização ou dados obrigatórios não consulta C6',async()=>{
  prep();const {transport}=fake();
  await expect(C6FgtsSimulationService.simulate({} as any,'tenant-a',input,
    {...bank,fgtsSimulationEnabled:false} as any,transport)).rejects.toThrow(/não habilitada/);
  await expect(C6FgtsSimulationService.simulate({} as any,'tenant-a',input,
    {...bank,fgtsCovenantCode:''} as any,transport)).rejects.toThrow(/convênio/);
  await expect(C6FgtsSimulationService.simulate({} as any,'tenant-a',
    {...input,birthDate:'31/02/1986'},bank as any,transport)).rejects.toThrow(/nascimento/);
  await expect(C6FgtsSimulationService.simulate({} as any,'tenant-a',
    {...input,term:11},bank as any,transport)).rejects.toThrow(/10 saques/);
  expect(transport).not.toHaveBeenCalled();
 });
 it('erro e expiração não fabricam valor líquido',async()=>{
  prep();const failure=vi.fn(async()=>({ok:false,status:401,json:async()=>({message:'private'})})) as any;
  await expect(C6FgtsSimulationService.simulate({} as any,'tenant-a',input,bank as any,failure))
    .rejects.toThrow(/HTTP 401/);
  const pending=await C6FgtsSimulationService.simulate({} as any,'tenant-a',
    input,bank as any,fake({...data,expire_at:'2025-01-01'} as any).transport);
  expect(pending.state).toBe('PENDING');
  expect(JSON.stringify(pending)).not.toContain('23082.31');
 });
 it('403 não vira ausência de saldo e não expõe dados bancários',async()=>{
  prep();
  const failure=vi.fn(async()=>({ok:false,status:403,json:async()=>({message:'Forbidden',private:'secret-fixture'})})) as any;
  const call=C6FgtsSimulationService.simulate({} as any,'tenant-a',input,bank as any,failure);
  await expect(call).rejects.toThrow(/HTTP 403.*permissão/);
  expect(failure).toHaveBeenCalledTimes(1);
 });
 it('classifica recusa de convênio sem divulgar mensagem bruta do banco',async()=>{
  prep();
  const failure=vi.fn(async()=>({ok:false,status:403,json:async()=>({message:'Convênio inválido para CPF 52998224725'})})) as any;
  const error=await C6FgtsSimulationService.simulate({} as any,'tenant-a',input,bank as any,failure).catch(e=>e);
  expect(error.message).toContain('convênio FGTS');
  expect(error.message).not.toContain('52998224725');
 });
 it('encaminha C6 FGTS ao motor compartilhado usado pelo site e Telegram',async()=>{
  vi.spyOn(NossaFintechService,'getConfig').mockResolvedValue({enabled:false,isConfigured:false} as any);
  vi.spyOn(FactaBankService,'getTenantConfig').mockResolvedValue({isConfigured:false,simulationEnabled:false} as any);
  vi.spyOn(V8CltSimulationService,'run').mockResolvedValue([]);
  vi.spyOn(C6BankService,'getTenantConfig').mockResolvedValue(bank as any);
  const run=vi.spyOn(C6FgtsSimulationService,'simulate').mockResolvedValue({
    provider:'C6',institution:'C6 BANK',state:'OFFER',amount:23082.31,term:5,rate:1.799,table:'FGTS',
  } as any);
  const response=await ProductSimulationService.run({} as any,'tenant-a','FGTS','SIMULATE',
    {...input,name:'',phone:'',eligibility:true});
  expect(run).toHaveBeenCalledTimes(1);
  expect(response.rows.some(r=>r.provider==='C6'&&r.state==='OFFER')).toBe(true);
 });
 it('sem código de convênio mostra pendência no relatório, sem chamar o banco',async()=>{
  vi.spyOn(NossaFintechService,'getConfig').mockResolvedValue({enabled:false,isConfigured:false} as any);
  vi.spyOn(FactaBankService,'getTenantConfig').mockResolvedValue({isConfigured:false,simulationEnabled:false} as any);
  vi.spyOn(V8CltSimulationService,'run').mockResolvedValue([]);
  vi.spyOn(C6BankService,'getTenantConfig').mockResolvedValue({...bank,fgtsCovenantCode:''} as any);
  const run=vi.spyOn(C6FgtsSimulationService,'simulate');
  const response=await ProductSimulationService.run({} as any,'tenant-a','FGTS','SIMULATE',
    {...input,name:'',phone:'',eligibility:true});
  expect(run).not.toHaveBeenCalled();
  expect(response.rows.find(r=>r.provider==='C6')).toMatchObject({state:'PENDING'});
  expect(response.rows.find(r=>r.provider==='C6')?.message).toContain('Convênio');
 });
});
