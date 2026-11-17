import type {PrismaClient} from '@prisma/client';
import {PartnerSimulationService} from './partnerSimulationService.js';
import {PartnerSimulationTracking} from './partnerSimulationTracking.js';
import {selectPortabilityQuoteRows} from '../../src/lib/portabilityQuoteSelection.js';
import type {TelegramPdfReview} from './telegramInssPdfService.js';
export type InssMarginOffer={bank:string;table:string;amount:number;installment:number;term:number;rate:number|null};
export type TelegramInssMarginResult={
 status:'NO_MARGIN'|'MISSING_IDENTITY'|'NO_OFFER'|'ERROR'|'OFFERS';
 installment:number|null;offers:InssMarginOffer[];saved:boolean;
};
/** Simulate INSS NEW just once, using the positive loan-margin installment
 * returned in the authorized PDF; never invent the loan amount or bank approval.
 */
export async function calculateTelegramInssMarginQuotes(
 db:PrismaClient,tenantId:string,partner:{id:string;name:string;code:string},
 review:TelegramPdfReview,illiterate:'YES'|'NO',attemptKey:string,
 deps?:{run?:typeof PartnerSimulationService.run;record?:typeof PartnerSimulationTracking.record},
):Promise<TelegramInssMarginResult>{
 const installment=review.loanMargin;
 const empty=(status:TelegramInssMarginResult['status']):TelegramInssMarginResult=>
  ({status,installment,offers:[],saved:false});
 if(installment==null||!Number.isFinite(installment)||installment<=0)return empty('NO_MARGIN');
 const data=review.bankConsultation;
 if(!data||!data.cpf||!data.benefitNumber)return empty('MISSING_IDENTITY');
 if(!tenantId||!partner.id||!partner.code||!/^[a-zA-Z0-9-]{16,80}$/.test(attemptKey))return empty('ERROR');
 const input={
   product:'INSS',operation:'NEW',mode:'Payment',term:108,
   value:Math.round(installment*100)/100,cpf:data.cpf,
   benefitNumber:data.benefitNumber,name:data.name,phone:'',
   birthDate:review.birthDate,benefitType:review.benefitType,
   benefitStartDate:review.benefitStartDate,state:review.uf,
   income:data.income,legalRepresentative:data.legalRepresentative,
   illiterate,hasInsurance:false,eligibility:true,partnerId:partner.id,
 };
 let rows:any[];
 try{
  const response=await (deps?.run||PartnerSimulationService.run)(db,tenantId,input,'SIMULATE');
  rows=Array.isArray(response?.rows)?response.rows:[];
 }catch{return empty('ERROR');}
 const grouped=new Map<string,any[]>();
 for(const row of rows){
  if(row?.state!=='OFFER'||!(Number(row.amount)>0))continue;
  const bank=String(row.provider||row.institution||'').trim().slice(0,60);
  if(!bank)continue;
  const key=bank.toUpperCase();
  grouped.set(key,[...(grouped.get(key)||[]),row]);
 }
 const candidates=[...grouped.entries()].flatMap(([bank,items])=>
  selectPortabilityQuoteRows(items,bank,{
   name:r=>r.name||r.code,rate:r=>r.rate,amount:r=>r.amount,
  }).slice(0,1));
 const offers:InssMarginOffer[]=candidates.map(row=>({
  bank:String(row.provider||row.institution).slice(0,50),
  table:String(row.name||row.code||'Tabela não informada').slice(0,75),
  amount:Number(row.amount),
  installment:Number(row.installment)>0?Number(row.installment):input.value,
  term:Number(row.term)||input.term,
  rate:Number(row.rate)>0?Number(row.rate):null,
 })).sort((a,b)=>b.amount-a.amount||a.bank.localeCompare(b.bank));
 if(!offers.length)return empty('NO_OFFER');
 let saved=false;
 try{
  const record=deps?.record||PartnerSimulationTracking.record;
  saved=!!await record(db,{tenantId,partnerId:partner.id,partnerCode:partner.code,
   accessName:'Telegram PDF · Margem INSS'},attemptKey+'-margin',input,candidates);
 }catch{ /* A quote is still an estimate if history cannot be saved. */ }
 return {status:'OFFERS',installment,offers,saved};
}
