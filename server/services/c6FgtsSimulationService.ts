import type { PrismaClient } from '@prisma/client';
import { C6BankService } from './c6BankService.js';
import type { C6TenantConfig } from './c6BankTypes.js';
import { isValidCpf } from '../../src/lib/utils.js';

type FgtsInput={
 cpf:string;birthDate?:string;term:number;value:number;mode:'Payment'|'Liquid';
 fgtsSimulationType?:'BY_INSTALLMENT_QUANTITY'|'BY_REQUESTED_AMOUNT'|'BY_FULL_AVAILABLE_AMOUNT';
};
export class C6FgtsSimulationService {
 static config(db:PrismaClient,tenantId:string){return C6BankService.getTenantConfig(db,tenantId);}
 static async simulate(db:PrismaClient,tenantId:string,input:FgtsInput,config?:C6TenantConfig,transport:typeof fetch=fetch){
  const bank=config||await this.config(db,tenantId);
  if(!bank.enabled||!bank.isConfigured||!bank.fgtsSimulationEnabled)
    throw Error('Simulação FGTS C6 não habilitada para esta empresa.');
  const covenant=String(bank.fgtsCovenantCode||'').trim();
  const promoter=String(bank.promoterCode||'').trim();
  if(!/^\d{1,16}$/.test(covenant)||!/^\d{1,16}$/.test(promoter))
    throw Error('Cadastre o convênio FGTS e o código da promotora C6 em Integrações Bancárias.');
  const cpf=String(input.cpf||'').replace(/\D/g,'');
  if(!isValidCpf(cpf))throw Error('CPF inválido para consulta FGTS C6.');
  const birth=String(input.birthDate||'');
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  const date=m?new Date(birth+'T00:00:00Z'):null;
  if(!m||!date||!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==birth||date.valueOf()>=Date.now())
    throw Error('Informe a data de nascimento válida para simular FGTS no C6.');
  const mode=input.fgtsSimulationType|| (input.mode==='Liquid'?'BY_REQUESTED_AMOUNT':'BY_INSTALLMENT_QUANTITY');
  const extra:Record<string,number>={};
  if(mode==='BY_INSTALLMENT_QUANTITY'){
    if(!Number.isInteger(input.term)||input.term<1||input.term>10)
      throw Error('O C6 aceita de 1 a 10 saques-aniversário nesta modalidade.');
    extra.installment_quantity=input.term;
  }else if(mode==='BY_REQUESTED_AMOUNT'){
    if(!Number.isFinite(input.value)||input.value<=0)
      throw Error('Informe valor positivo para simulação por valor solicitado.');
    extra.financed_amount=input.value;
  }else if(mode!=='BY_FULL_AVAILABLE_AMOUNT')throw Error('Modalidade FGTS C6 não reconhecida.');
  const body={
    covenant_code:covenant,formalization_subtype:'DIGITAL_WEB',
    simulation_type:mode,tax_identifier:cpf,birth_date:birth,promoter_code:promoter,...extra,
  };
  const token=await C6BankService.getAccessToken(db,tenantId);
  // Bank token is sent only to the configured C6 API; no response/body is logged.
  const response=await transport(bank.baseUrl+'/marketplace/proposal/fgts/simulation',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/json',
      Accept:'application/vnd.c6bank_fgts_simulation_v2+json',
      Authorization:token},
    body:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>null) as any;
  if(!response.ok||!data||typeof data!=='object'||data.error||data.errors)
    throw Error('C6 FGTS não concluiu a simulação (HTTP '+response.status+').');
  const number=(v:unknown)=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):undefined;
  const amount=number(data.net_amount),term=number(data.installment_quantity);
  if(!amount||amount<=0||!term||!Number.isInteger(term)||term<1||term>10)
    return {provider:'C6',institution:'C6 BANK',state:'PENDING' as const,
      message:'C6 não retornou valor líquido e quantidade de saques válidos nesta consulta.'};
  const expiration=typeof data.expire_at==='string'?Date.parse(data.expire_at):NaN;
  if(Number.isFinite(expiration)&&expiration<=Date.now())
    return {provider:'C6',institution:'C6 BANK',state:'PENDING' as const,
      message:'A cotação FGTS C6 retornou expirada. Atualize a consulta.'};
  const annual=Array.isArray(data.installments)?data.installments.slice(0,10).map((x:any)=>({
    number:number(x.number),amount:number(x.amount),
    dueDate:typeof x.due_date==='string'?x.due_date.slice(0,10):undefined,
  })).filter((x:any)=>Number.isInteger(x.number)&&x.number>0&&x.amount>0):[];
  return {provider:'C6',institution:'C6 BANK',state:'OFFER' as const,
    table:'Convênio FGTS '+covenant,name:'Convênio FGTS '+covenant,
    amount,contractAmount:number(data.principal_amount),term,
    rate:number(data.monthly_customer_rate),simulationId:String(data.simulation_id||''),
    data:{annualInstallments:annual,iof:number(data.iof_amount),
      anniversaryWithdrawAvailable:number(data.anniversary_withdraw_available),
      expiresAt:Number.isFinite(expiration)?new Date(expiration).toISOString():undefined},
  };
 }
}
