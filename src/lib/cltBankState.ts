import type {ProductSimulationRow} from '../../server/services/productSimulationService';
import {canonicalNossaInstitution} from './cltInstitution';
type Result={request?:{value?:number};originalOffers?:ProductSimulationRow[];simulation?:{status:'RUNNING'|'OFFERS'|'NO_OFFERS'|'FAILED'|'UNKNOWN';message?:string};rows:ProductSimulationRow[];consultations?:ProductSimulationRow[];consultationRevision?:number};
function reference(bank:string,row:ProductSimulationRow){const d=row.data as any;return [bank,row.origin?.subInstitutionId||(bank==='nossa'?canonicalNossaInstitution(row.institution):undefined),row.origin?.connectionId||d?.v8?.promoterId||d?.vctex?.connectionId,row.origin?.consultationId||d?.v8?.consultId||d?.vctex?.preOperationId,d?.vctex?.employmentId||d?.employment?.work_registration,d?.employment?.employer_cnpj];}
function eligibleQuote(bank:string,row:ProductSimulationRow,queries:ProductSimulationRow[]){return queries.some(query=>{const a=reference(bank,row),b=reference(bank,query),m=(query.data as any)?.margin;return (!a[3]||a[3]===b[3])&&(!a[2]||a[2]===b[2])&&(!a[4]||a[4]===b[4])&&m?.can_continue!==false&&(typeof m?.available_balance!=='number'||typeof row.installment!=='number'||row.installment<=m.available_balance+0.005);});}
/** Normalize the stored data, not just the DOM. Provider labels never identify an offer. */
export function normalizeBankRows(bank:string,rows:ProductSimulationRow[]){
 const seen=new Map<string,ProductSimulationRow>();
 rows.forEach((row,index)=>{const d=row.data as any,ref=reference(bank,row);let key:string;
 if(row.state==='OFFER')key=JSON.stringify(['offer',...ref,row.origin?.executionId,row.simulationId,d?.v8?.simulationConfigId||d?.vctex?.offerId||row.table,row.term,row.installment,row.amount,row.rate,d?.v8?.monthlyInterestRate,row.cetMonthly,row.cetAnnual,...(bank==='v8'?[d?.v8?.requestedMode,d?.v8?.requestedValue]:[]),d?.v8?.isInsured??d?.vctex?.withInsurance,d?.v8?.insuranceAmount??d?.vctex?.insuranceAmount]);
 else if(row.state==='DATA'&&(bank==='v8'?!!ref[3]:bank==='vctex'?!!ref[3]&&!!ref[4]:!!ref[4]||!!ref[3]))key=JSON.stringify(['query',...ref]);
 else key=JSON.stringify(['other',index]);
 seen.set(key,row);});return [...seen.values()];
}
/** Financial replies cannot replace an official margin; only a query observation can update it. */
export function applyBankRows(bank:string,result:Result,incoming:ProductSimulationRow[],calculation=false){
 if(!result.originalOffers)result.originalOffers=result.request?.value?[]:normalizeBankRows(bank,result.rows.filter(r=>r.state==='OFFER'));
 if(!result.request?.value)result.originalOffers=normalizeBankRows(bank,[...result.originalOffers,...incoming.filter(r=>r.state==='OFFER')]);
 const before=result.consultations||result.rows.filter(r=>r.state==='DATA');
 const invalid=incoming.filter(r=>r.outcome==='INELIGIBLE'||r.state==='DATA'&&(r.data as any)?.margin?.can_continue===false||bank==='vctex'&&(r.data as any)?.vctex?.authorizationValid===false||['FAILED','REJECTED'].includes((r.data as any)?.v8?.status)||['EXPIRED','REJECTED','DENIED'].includes((r.data as any)?.authorization?.status));
 const retained=before.filter(old=>!invalid.some(row=>{const a=reference(bank,old),b=reference(bank,row);return b[3]&&(!a[2]||a[2]===b[2])&&a[3]===b[3]&&(!b[4]||a[4]===b[4]);}));
 if(!calculation&&(incoming.some(r=>r.state==='DATA')||invalid.length))result.consultationRevision=(result.consultationRevision||0)+1;
 result.consultations=normalizeBankRows(bank,calculation&&before.length?retained:[...retained,...incoming.filter(r=>r.state==='DATA')]);
 result.originalOffers=result.originalOffers.filter(offer=>!invalid.some(row=>{const a=reference(bank,offer),b=reference(bank,row);return b[3]&&(!a[2]||a[2]===b[2])&&a[3]===b[3]&&(!b[4]||a[4]===b[4]);}));
 if(result.consultations.length)result.originalOffers=result.originalOffers.filter(row=>eligibleQuote(bank,row,result.consultations!));
 result.rows=normalizeBankRows(bank,[...result.consultations,...incoming.filter(r=>r.state!=='DATA'&&(r.state!=='OFFER'||!invalid.some(row=>{const a=reference(bank,r),b=reference(bank,row);return b[3]&&(!a[2]||a[2]===b[2])&&a[3]===b[3]&&(!b[4]||a[4]===b[4]);})))]);
}

/** A later query observation survives an in-flight pricing response. Revisions are persisted, not clock-based. */
export function keepNewerConsultations(bank:string,result:Result,current:Result){
 if((current.consultationRevision||0)>(result.consultationRevision||0)){
 result.consultationRevision=current.consultationRevision;result.consultations=structuredClone(current.consultations||current.rows.filter(r=>r.state==='DATA'));
 result.originalOffers=(result.originalOffers||[]).filter(r=>eligibleQuote(bank,r,result.consultations!));
 const before=result.rows.filter(r=>r.state==='OFFER').length;
 const financial=result.rows.filter(r=>r.state!=='DATA'&&(r.state!=='OFFER'||eligibleQuote(bank,r,result.consultations!)));
 result.rows=normalizeBankRows(bank,[...result.consultations,...financial]);
 if(before>financial.filter(r=>r.state==='OFFER').length)result.simulation={status:'NO_OFFERS',message:'Consulta atualizada. Recalcule as condições disponíveis.'};}
}
