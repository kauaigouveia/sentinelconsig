import type {JourneySnapshot} from './cltJourney';
import type {ProductSimulationRow} from '../../server/services/productSimulationService';
import {cltRatePercent} from './v8CltDisplay';
import {journeyStatus} from './cltJourney';
export const reportedNumber=(v:unknown):number|undefined=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v))?Number(v):undefined;
export type PresentedOffer={key:string;bank:string;row:ProductSimulationRow;rate?:number;insurance?:boolean;insuranceAmount?:number;iof?:number;issueAmount?:number;nominalTotal?:number;firstDueDate?:string};
export function presentedOffers(snapshot:JourneySnapshot|null):PresentedOffer[]{
  const result=new Map<string,PresentedOffer>();
  for(const [bank,state] of Object.entries(snapshot?.results||{})){
    if(bank==='finanto')continue;
    for(const row of state.rows.filter(r=>r.state==='OFFER')){
      const d=row.data as any,f=d?.v8||d?.vctex||d?.financial||{};
      const offer:PresentedOffer={key:'',bank,row,rate:cltRatePercent(row),insurance:typeof f.isInsured==='boolean'?f.isInsured:typeof f.withInsurance==='boolean'?f.withInsurance:undefined,insuranceAmount:reportedNumber(f.insuranceAmount),iof:reportedNumber(f.iofAmount??f.iof),issueAmount:reportedNumber(f.issueAmount)??row.contractAmount,nominalTotal:reportedNumber(f.operationAmount??f.totalAmount),firstDueDate:f.firstInstallmentDate||f.firstDueDate};
      offer.key=JSON.stringify([snapshot?.rootExecutionId||snapshot?.executionId,bank,row.institution,row.simulationId,row.table,row.term,row.amount,row.installment,offer.rate,offer.insurance,row.cetMonthly,row.cetAnnual]);
      if(!result.has(offer.key))result.set(offer.key,offer);
    }
  }return [...result.values()];
}
export function presentedMargins(snapshot:JourneySnapshot|null){
  const result=new Map<string,{key:string;bank:string;institution:string;status:string;authorization?:string;available?:number;used?:number;residual?:number;eligible?:boolean;consultId?:string;updatedAt?:string}>();
  for(const bank of snapshot?.banks||[]){
    if(bank.id==='finanto')continue;
    const state=snapshot!.results[bank.id];if(!state)continue;
    const rows=state.rows.filter(r=>r.state!=='OFFER');
    for(const row of rows.length?rows:[undefined]){
      const d=row?.data as any,m=d?.margin||{},v=d?.v8||{},x=d?.vctex||{},institution=row?.institution||bank.name;
      const key=JSON.stringify([bank.id,institution,d?.employment?.work_registration,d?.employment?.employer_cnpj,x.employmentId,v.consultId]);
      result.set(key,{key,bank:bank.id,institution,status:journeyStatus({...state,rows:row?[row]:[]}),authorization:d?.authorization?.status||(v.consentRecorded===true?'Confirmada pela API':v.status==='WAITING_CONSENT'?'Aguardando autorização':undefined),available:reportedNumber(m.available_balance),used:reportedNumber(m.used_balance),residual:reportedNumber(m.residual_balance),eligible:typeof m.can_continue==='boolean'?m.can_continue:typeof d?.eligible==='boolean'?d.eligible:undefined,consultId:v.consultId||x.preOperationId||d?.consultationId,updatedAt:d?.authorization?.observedAt||d?.observedAt});
    }
  }return [...result.values()];
}
