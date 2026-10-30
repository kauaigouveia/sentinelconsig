import { paidFromTerms, portabilityEligibility } from './portabilityEligibility';
import type { PortabilityContext } from './portabilityPolicy';

export function parseIlliteracy(value: unknown): boolean | undefined {
 return value === true || value === 'YES' ? true : value === false || value === 'NO' ? false : undefined;
}

export function portabilityReviewMetadata(raw:any={}) {
 return {illiterate:parseIlliteracy(raw.illiterate),state:String(raw.state||'').slice(0,2).toUpperCase(),benefitStartDate:String(raw.benefitStartDate||'').slice(0,10),sex:['M','F'].includes(raw.sex)?raw.sex:undefined,originCategory:['CORBAN','NETWORK'].includes(raw.originCategory)?raw.originCategory:undefined,negativeMarginAmount:raw.negativeMarginAmount!==''&&raw.negativeMarginAmount!=null?Number(raw.negativeMarginAmount):undefined,medicalExamDate:String(raw.medicalExamDate||'').slice(0,10)};
}

/** Normalize the existing simulators without confusing the port rate with the refinancing rate. */
function checkContract(bank: string, raw: any, offer?: any) {
 const contract=raw.originContract||raw.contracts?.[0]||{};
 const value=(...values:any[])=>values.find(v=>v!==undefined&&v!==null&&v!=='');
 const number=(...values:any[])=>{const v=value(...values);return v===undefined?undefined:Number(v);};
 const operation=value(raw.operation,raw.operationCode==='2'?'PORT':raw.operationCode==='4'?'PORT_REFIN':undefined,'PORT_REFIN');
 const originalInstallment=number(raw.originalInstallment,raw.installmentFaceValue,raw.valor_parcelas,contract.installmentValue,contract.installment);
 const installment=number(offer?.installment,offer?.installmentValue,raw.refinancing?.installmentValue,raw.valor_parcelas_refin,raw.installment,['AMOUNT','Liquid'].includes(raw.mode)?undefined:raw.value,raw.installmentFaceValue,contract.installment);
 const input:PortabilityContext={
  operation,birthDate:value(raw.birthDate,raw.clientBirthDate),benefitType:value(raw.benefitType,raw.cd_beneficio_tipo),
  benefitStartDate:value(raw.benefitStartDate,raw.dataConcessao),simulationDate:raw.simulationDate,state:value(raw.state,raw.ufBeneficio),sex:raw.sex,
  term:number(offer?.term,raw.refinancing?.term,raw.term,raw.numberOfInstallments,raw.numero_parcelas_refin),
  remainingInstallments:number(raw.remainingTerm,raw.openedInstallmentNumber,contract.installmentsRemaining,contract.remaining),
  contractEndDate:raw.contractEndDate,benefitCategory:raw.benefitCategory,cipMember:raw.cipMember,
  debt:number(raw.debt,raw.lastDueBalance,raw.saldo_devedor,contract.dueBalanceValue,contract.balance),originalInstallment,installment,
  amount:number(offer?.amount),contractAmount:number(offer?.contractAmount),portRate:number(offer?.portRate,raw.portRate,operation==='PORT'?offer?.rate??raw.rate:undefined),portInstallment:number(offer?.portInstallment,raw.portInstallment),
  refinRate:number(offer?.rate,raw.refinancing?.rate,raw.refinanceRate,raw.refinancingRate,raw.taxa_mensal_refin,operation==='PORT'?undefined:raw.rate),
  negativeMargin:raw.negativeMargin===true,negativeMarginAmount:number(raw.negativeMarginAmount),
  additionalMargin:number(raw.additionalMargin,installment!=null&&originalInstallment!=null?Math.max(0,installment-originalInstallment):undefined),
  contractCount:raw.contracts?.length||1,originCategory:raw.originCategory,illiterate:parseIlliteracy(raw.illiterate),paymentOrder:raw.paymentOrder,
 };
 const origin=value(raw.originalBank,raw.originLenderCode,contract.lenderCode,contract.originBank);
 const paid=value(raw.paidInstallments,contract.paidInstallments,paidFromTerms(value(raw.originalTerm,contract.term),value(raw.remainingTerm,raw.openedInstallmentNumber,contract.installmentsRemaining,contract.remaining)));
 return portabilityEligibility(bank,origin,paid,input);
}

/** Every source contract is checked, not only the first one in a consolidation. */
export function simulationPortabilityCheck(bank:string,raw:any,offer?:any) {
 const contracts=Array.isArray(raw.contracts)&&raw.contracts.length?raw.contracts:[null];
 const checks=contracts.map((contract:any)=>checkContract(bank,contract?{...raw,originContract:contract,
  originalBank:contract.originBank??contract.lenderCode,originLenderCode:undefined,paidInstallments:contract.paidInstallments,
  originalTerm:contract.term,remainingTerm:contract.installmentsRemaining??contract.remaining,openedInstallmentNumber:undefined,
  debt:contract.dueBalanceValue??contract.balance,lastDueBalance:undefined,saldo_devedor:undefined,
  originalInstallment:contract.installmentValue??contract.installment,installmentFaceValue:undefined,valor_parcelas:undefined,
 }:raw,offer));
 const blocked=checks.some(check=>check.blocked),review=checks.some(check=>check.review);
 return {...checks[0],blocked,review,status:blocked?'NÃO ELEGÍVEL':review?'PENDENTE DE DADOS':'ELEGÍVEL',
  reason:checks.map((check,index)=>contracts.length>1?`Contrato ${index+1}: ${check.reason}`:check.reason).join(' '),contracts:checks};
}

/** Preserve the provider envelope while removing explicit financial offers that violate the roteiro. */
export function filterPortabilityResponse(bank:string,input:any,data:any):any {
 if(Array.isArray(data))return data.flatMap(row=>{try{return [filterPortabilityResponse(bank,input,row)];}catch{return [];}});
 if(!data||typeof data!=='object')return data;
 const amount=data.valor_cliente??data.valor_liquido??data.valor_liberado;
 if(amount!==undefined){const check=simulationPortabilityCheck(bank,input,{amount:Number(amount),contractAmount:data.valor_principal??data.valor_bruto,installment:data.valor_parcela??data.valor_parcelas,rate:data.taxa_mensal??data.taxa_nominal_am??input.taxa_mensal_refin});if(check.blocked)throw new Error(check.reason);}
 return Object.fromEntries(Object.entries(data).map(([key,value])=>[key,filterPortabilityResponse(bank,input,value)]));
}
