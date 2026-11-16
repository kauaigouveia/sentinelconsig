/** Contract-by-contract portability payment amounts returned by the calculation engine. */
export type PortedInstallmentChange={
  label:string;
  bankCode?:string;
  contractSuffix?:string;
  originalInstallment:number;
  newInstallment:number|null;
  returnRate?:number|null;
};
export type PortRefinPaymentBreakdown={
  contracts:PortedInstallmentChange[];
  originalPortabilityTotal:number;
  adjustedPortabilityTotal:number|null;
  refinanceInstallment:number|null;
};

const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export const cents=(value:number)=>Math.round((value+Number.EPSILON)*100);
export const money=(value:number|null|undefined)=>valid(value)
  ? value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : 'Não informada';

/** Never report a ported installment as "maintained" when the bank did not return an adjusted installment. */
export function portabilityInstallmentStatus(change:PortedInstallmentChange):{
  label:'Mantida'|'Reduzida'|'Aumentada'|'Não informada';
  difference:number|null;
} {
  if(!valid(change.originalInstallment)||!valid(change.newInstallment))return {label:'Não informada',difference:null};
  const delta=cents(change.newInstallment)-cents(change.originalInstallment);
  if(delta===0)return {label:'Mantida',difference:0};
  return {label:delta<0?'Reduzida':'Aumentada',difference:Math.abs(delta)/100};
}
export function originContractSuffix(number:unknown):string {
  const digits=String(number||'').replace(/[^a-zA-Z0-9]/g,'');
  return digits?digits.slice(-4):'';
}
export function buildPortRefinBreakdown(
  changes:readonly PortedInstallmentChange[]|undefined,
  refinanceInstallment:unknown,
):PortRefinPaymentBreakdown|undefined {
  if(!changes?.length||changes.length>3)return undefined;
  const contracts=changes.map((change,index):PortedInstallmentChange=>({
    label:String(change.label||'Contrato '+(index+1)).slice(0,80),
    bankCode:String(change.bankCode||'').replace(/[^a-zA-Z0-9]/g,'').slice(0,12),
    contractSuffix:originContractSuffix(change.contractSuffix),
    originalInstallment:valid(change.originalInstallment)?change.originalInstallment:0,
    newInstallment:valid(change.newInstallment)?change.newInstallment:null,
    ...(valid(change.returnRate)?{returnRate:change.returnRate}:{}),
  }));
  const originalPortabilityTotal=contracts.reduce((sum,change)=>sum+cents(change.originalInstallment),0)/100;
  const adjustedPortabilityTotal=contracts.every(change=>valid(change.newInstallment))
    ? contracts.reduce((sum,change)=>sum+cents(change.newInstallment!),0)/100
    : null;
  return {contracts,originalPortabilityTotal,adjustedPortabilityTotal,
    refinanceInstallment:valid(refinanceInstallment)?Number(refinanceInstallment):null};
}
export function portabilityBreakdownText(detail:PortRefinPaymentBreakdown):string {
  const lines=['CONTRATOS PORTADOS (parcela original → parcela ajustada):'];
  for(const [index,contract]of detail.contracts.entries()){
    const {label,difference}=portabilityInstallmentStatus(contract);
    const origin=contract.bankCode?' · Banco '+contract.bankCode:'';
    const suffix=contract.contractSuffix?' · final '+contract.contractSuffix:'';
    const adjustment=label==='Reduzida'?' (redução de '+money(difference)+')'
      :label==='Aumentada'?' (aumento de '+money(difference)+')'
      :label==='Mantida'?' (sem alteração)':' (ajuste não informado)';
    lines.push(String(index+1)+'. '+contract.label+origin+suffix
      +' — '+money(contract.originalInstallment)+' → '+money(contract.newInstallment)+adjustment);
  }
  lines.push('Total das parcelas originais: '+money(detail.originalPortabilityTotal));
  lines.push('Total das parcelas após ajustes: '+money(detail.adjustedPortabilityTotal));
  lines.push('PARCELA DO NOVO REFINANCIAMENTO: '+money(detail.refinanceInstallment));
  return lines.join('\n');
}
