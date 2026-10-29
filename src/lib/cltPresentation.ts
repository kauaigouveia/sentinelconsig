import type {JourneySnapshot} from './cltJourney';
import type {ProductSimulationRow} from '../../server/services/productSimulationService';
import {cltRatePercent} from './v8CltDisplay';
import {rowsOfBank,canonicalNossaInstitution,nossaInstitutionName} from './cltInstitution';
import {journeyStatus} from './cltJourney';
export const reportedNumber=(v:unknown):number|undefined=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v))?Number(v):undefined;
export type PresentedOffer={key:string;bank:string;row:ProductSimulationRow;rate?:number;insurance?:boolean;insuranceAmount?:number;iof?:number;issueAmount?:number;nominalTotal?:number;firstDueDate?:string};
export function presentedOffers(snapshot:JourneySnapshot|null):PresentedOffer[]{
  const result=new Map<string,PresentedOffer>();
  for(const [bank,state] of Object.entries(snapshot?.results||{})){
    if(bank==='finanto')continue;
    for(const row of rowsOfBank(snapshot,bank).filter(r=>r.state==='OFFER')){
      const d=row.data as any,f=d?.v8||d?.vctex||d?.financial||{};
      const offer:PresentedOffer={key:'',bank,row,rate:cltRatePercent(row),insurance:typeof f.isInsured==='boolean'?f.isInsured:typeof f.withInsurance==='boolean'?f.withInsurance:undefined,insuranceAmount:reportedNumber(f.insuranceAmount),iof:reportedNumber(f.iofAmount??f.iof),issueAmount:reportedNumber(f.issueAmount)??row.contractAmount,nominalTotal:reportedNumber(f.operationAmount??f.totalAmount),firstDueDate:f.firstInstallmentDate||f.firstDueDate};
      offer.key=JSON.stringify([row.origin?.executionId||state.executionId||snapshot?.rootExecutionId||snapshot?.executionId,bank,row.origin?.subInstitutionId||row.institution,row.origin?.connectionId,row.origin?.consultationId,row.simulationId,row.table,row.term,row.amount,row.installment,offer.rate,offer.insurance,row.cetMonthly,row.cetAnnual]);
      if(!result.has(offer.key))result.set(offer.key,offer);
    }
  }return [...result.values()];
}
export function presentedMargins(snapshot:JourneySnapshot|null){
  const result=new Map<string,{key:string;bank:string;institution:string;status:string;authorization?:string;available?:number;used?:number;residual?:number;eligible?:boolean;consultId?:string;updatedAt?:string;subInstitutionId?:string;connectionId?:string;executionId?:string;explanation?:string}>();
  for(const bank of snapshot?.banks||[]){
    if(bank.id==='finanto')continue;
    const state=snapshot!.results[bank.id];if(!state)continue;
    const bankRows=rowsOfBank(snapshot,bank.id),rows=bankRows.filter(r=>r.state!=='OFFER');
    for(const row of rows.length?rows:bank.id==='nossa'?[]:[undefined]){
      const d=row?.data as any,m=d?.margin||{},v=d?.v8||{},x=d?.vctex||{},institution=row?.institution||bank.name;
      if(bank.id==='vctex'&&!x.employmentId&&x.preOperationId&&rows.some(other=>{const detail=(other.data as any)?.vctex;return detail?.employmentId&&detail.preOperationId===x.preOperationId&&other.origin?.connectionId===row?.origin?.connectionId;}))continue;
      const subInstitutionId=bank.id==='nossa'?row?.origin?.subInstitutionId||canonicalNossaInstitution(institution):undefined;
      const key=JSON.stringify([bank.id,subInstitutionId||institution,row?.origin?.connectionId,row?.origin?.consultationId||v.consultId||x.preOperationId||d?.consultationId,d?.employment?.work_registration,d?.employment?.employer_cnpj,x.employmentId,v.consultId]);
      const previous=result.get(key), observed=d?.authorization?.observedAt||d?.observedAt;
      if(previous?.updatedAt&&observed&&Date.parse(previous.updatedAt)>Date.parse(observed))continue;
      const next={key,bank:bank.id,institution:bank.id==='nossa'&&subInstitutionId?nossaInstitutionName(subInstitutionId):institution,subInstitutionId,connectionId:row?.origin?.connectionId,executionId:row?.origin?.executionId||state.executionId,status:row?(reportedNumber(m.available_balance)!>0&&m.can_continue!==false?'Margem disponível':journeyStatus({...state,status:'RETURNED',rows:[row]})):'Não informado',authorization:d?.authorization?.status||(v.consentRecorded===true?'Confirmada pela API':v.status==='WAITING_CONSENT'?'Aguardando autorização':undefined),available:reportedNumber(m.available_balance),used:reportedNumber(m.used_balance),residual:reportedNumber(m.residual_balance),eligible:typeof m.can_continue==='boolean'?m.can_continue:typeof d?.eligible==='boolean'?d.eligible:undefined,consultId:v.consultId||x.preOperationId||d?.consultationId,updatedAt:observed};
      result.set(key,next);
    }
    if(bank.id==='nossa')for(const id of ['qi','uy3'])if(![...result.values()].some(r=>r.bank==='nossa'&&r.subInstitutionId===id)){
      const returned=bankRows.some(r=>(r.origin?.subInstitutionId||canonicalNossaInstitution(r.institution))===id);
      const status=state.status==='QUERYING'?'Consulta em andamento':returned?'Dados da consulta não informados':'Não disponibilizada nesta resposta';
      const key='nossa:unreported:'+id;result.set(key,{key,bank:'nossa',subInstitutionId:id,institution:nossaInstitutionName(id),status,explanation:state.status==='QUERYING'?'Aguardando retorno da integração.':returned?'Há resultado da instituição, mas os dados de margem não vieram nesta resposta.':'Esta subinstituição não foi retornada ou identificada pela API. Nenhuma consulta foi criada para preencher esta linha.'});
    }
  }return [...result.values()];
}

/** Operator-facing status comes from current canonical evidence, never internal error text. */
export function bankSummary(snapshot:JourneySnapshot|null,bank:string){
  const scoped=snapshot?{...snapshot,banks:snapshot.banks.filter(b=>b.id===bank),results:{[bank]:snapshot.results[bank]}}:null;
  const rows=rowsOfBank(snapshot,bank),count=presentedOffers(scoped).length;
  const margin=presentedMargins(scoped).some(r=>r.available!==undefined&&r.available>0&&r.eligible!==false);
  const result=snapshot?.results[bank];
  const pending=rows.some(r=>r.outcome==='AUTHORIZATION_REQUIRED'||['PENDING','WAITING_OTP','REQUESTED','WAITING_CONSENT'].includes((r.data as any)?.authorization?.status||(r.data as any)?.v8?.status));
  return {count,status:count?'Ofertas disponíveis':margin?'Margem disponível':pending?'Aguardando autorização':result?.status==='QUERYING'?'Consultando':result?.status==='ERROR'||result?.status==='UNKNOWN'?'Não foi possível consultar':result?.status==='CONTEXTUAL'?'Aguardando autorização':result?'Sem ofertas':'Aguardando consulta'};
}
