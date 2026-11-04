import {resolveInstitutionCode} from './strParticipants';
import {parseCurrency} from './utils';
export type PortabilityContractDraft={reviewMetadata?:Record<string,string>;originLenderCode:string;originContractNumber:string;originalTerm:string;openedInstallmentNumber:string;lastDueBalance:string;installmentFaceValue:string};
export const MAX_SIMULATION_CONTRACTS=13;
export function contractDraft(c:PortabilityContractDraft):PortabilityContractDraft{return {reviewMetadata:c.reviewMetadata?{...c.reviewMetadata}:undefined,originLenderCode:c.originLenderCode,originContractNumber:c.originContractNumber,originalTerm:c.originalTerm,openedInstallmentNumber:c.openedInstallmentNumber,lastDueBalance:c.lastDueBalance,installmentFaceValue:c.installmentFaceValue};}
export const contractKey=(c:Pick<PortabilityContractDraft,'originLenderCode'|'originContractNumber'>)=>`${resolveInstitutionCode(c.originLenderCode.trim())}:${c.originContractNumber.trim()}`;
export function validateSimulationContracts(contracts:PortabilityContractDraft[]){
 if(!contracts.length||contracts.length>MAX_SIMULATION_CONTRACTS)throw Error(`Informe de 1 a ${MAX_SIMULATION_CONTRACTS} contratos.`);
 const keys=new Set<string>();
 for(const c of contracts){
  const original=Number(c.originalTerm),remaining=Number(c.openedInstallmentNumber),balance=parseCurrency(c.lastDueBalance),installment=parseCurrency(c.installmentFaceValue);
  if(!c.originLenderCode.trim()||!c.originContractNumber.trim()||!Number.isInteger(original)||!Number.isInteger(remaining)||remaining<=0||remaining>original||balance==null||!Number.isFinite(balance)||balance<=0||installment==null||!Number.isFinite(installment)||installment<=0)throw Error('Revise banco, número, prazo, parcelas restantes, saldo e parcela de cada contrato.');
  const key=contractKey(c);if(keys.has(key))throw Error('Contrato repetido para o mesmo banco.');keys.add(key);
 }
}
export function daycovalContractGroups<T>(contracts:T[]):T[][]{
 const groups:T[][]=[];
 for(let a=0;a<contracts.length;a++)for(let b=a+1;b<contracts.length;b++){
  groups.push([contracts[a],contracts[b]]);
  for(let c=b+1;c<contracts.length;c++)groups.push([contracts[a],contracts[b],contracts[c]]);
 }
 return groups;
}

/** Only origin-contract fields are cleared; customer and shared calculation settings remain. */
export const EMPTY_ORIGIN_CONTRACT={originLenderCode:'',originContractNumber:'',originalTerm:'',openedInstallmentNumber:'',lastDueBalance:'',installmentFaceValue:''};
export function hasOriginContractDraft(contract:PortabilityContractDraft):boolean{return Object.keys(EMPTY_ORIGIN_CONTRACT).some(key=>String(contract[key as keyof typeof EMPTY_ORIGIN_CONTRACT]??'').trim()!=='');}
export function simulationContracts(queue:PortabilityContractDraft[],current:PortabilityContractDraft):PortabilityContractDraft[]{return hasOriginContractDraft(current)?[...queue.filter(c=>contractKey(c)!==contractKey(current)),contractDraft(current)]:[...queue];}
