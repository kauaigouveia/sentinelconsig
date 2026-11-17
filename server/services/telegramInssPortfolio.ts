import type {TelegramPdfReview,TelegramSpreadsheetQuote} from './telegramInssPdfService.js';
import type {TelegramInssMarginResult} from './telegramInssMarginQuotes.js';
import {activePortabilityReplacement} from '../../src/lib/portabilityActiveRules.js';
import {evaluateReplacementPolicy} from '../../src/lib/portabilityReplacementPolicy.js';
import {institutionLabel,resolveInstitutionCode} from '../../src/lib/strParticipants.js';
import {orderDaycovalUnifications} from '../../src/lib/portabilityQuoteSelection.js';

type Official={index:number;rows:any[];saved:boolean;failed:boolean};
const money=(value:unknown)=>value!=null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0
  ?Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'não informado';
const pct=(value:unknown)=>Number.isFinite(Number(value))&&Number(value)>0
  ?Number(value).toLocaleString('pt-BR',{maximumFractionDigits:3})+'% a.m.':'taxa não informada';
const short=(value:unknown,max=80)=>String(value??'').replace(/[\r\n\t]/g,' ').trim().slice(0,max);
const unavailable=new Set(['daycoval','c6','parana','facta','finanto','nossa-fintech','happy','bmg']);
function otherEligibleBanks(review:TelegramPdfReview,contract:TelegramPdfReview['contracts'][number]):string[]{
  const paid=contract.originalTerm-contract.remaining;
  if(!Number.isInteger(paid)||paid<0)return [];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const result:string[]=[];
  for(const bank of activePortabilityReplacement.banks){
    if(unavailable.has(bank.id))continue;
    const eligibility=evaluateReplacementPolicy(bank.id,contract.bank,paid,{
      operation:'PORT_REFIN',birthDate:review.birthDate,benefitType:review.benefitType,
      benefitStartDate:review.benefitStartDate,simulationDate:today,
      debt:contract.balance,originalInstallment:contract.installment,
      installment:contract.installment,remainingInstallments:contract.remaining,
      term:108,contractCount:1,
    });
    // A pending or incomplete rule is NOT presented as eligible.
    if(eligibility&&!eligibility.blocked&&!eligibility.review&&eligibility.calculationAllowed)
      result.push(short(bank.name,45));
  }
  return [...new Set(result)].slice(0,12);
}
/** Concise partner message; no complete CPF, benefit number or contract number. */
export function formatTelegramInssPortfolio(
 review:TelegramPdfReview,indices:readonly number[],sheets:readonly TelegramSpreadsheetQuote[],
 official:readonly Official[],margin?:TelegramInssMarginResult,
):string[]{
 const blocks:string[]=['📊 INSS · SIMULAÇÕES\nEspécie '+review.benefitType+
   ' · '+indices.length+' contratos selecionados'];
 let totalIndividual=0;
 for(const index of indices){
  const contract=review.contracts[index];if(!contract)continue;
  const code=resolveInstitutionCode(contract.bank);
  const origin=short(institutionLabel(code)||contract.bank,37);
  const integration=official.find(row=>row.index===index);
  const offers=[
   ...sheets.filter(row=>row.indices.length===1&&row.indices[0]===index).map(row=>({
    bank:row.bank,table:row.table,amount:row.amount,term:row.term,rate:row.rate,
   })),
   ...(integration?.rows||[]).filter(row=>row.state==='OFFER'&&Number(row.amount)>0)
    .map(row=>({bank:String(row.provider||row.institution||''),
      table:String(row.name||row.code||''),amount:Number(row.amount),
      term:Number(row.term),rate:Number(row.rate)})),
  ];
  const byBank=new Map<string,(typeof offers)[number]>();
  for(const offer of offers){
   if(!(offer.amount>0)||!offer.bank)continue;
   const key=offer.bank.toUpperCase();
   if(!byBank.has(key)||offer.amount>byBank.get(key)!.amount)byBank.set(key,offer);
  }
  const options=[...byBank.values()].sort((a,b)=>b.amount-a.amount);
  if(options.length)totalIndividual+=options[0].amount;
  const lines=['📄 CONTRATO '+(index+1)+' · '+origin+' · final '+contract.numberSuffix,
   'Parcela '+money(contract.installment)+' | saldo '+money(contract.balance)+
   ' | restantes '+contract.remaining];
  for(const offer of options)lines.push('🏦 '+short(offer.bank,22)+
   ' | troco '+money(offer.amount)+' | '+offer.term+'x | '+pct(offer.rate)+
   (offer.bank.toUpperCase()==='DAYCOVAL'?' | '+short(offer.table,45):''));
  if(!options.length)lines.push('⚠️ Sem cotação positiva neste contrato');
  if(integration?.failed)lines.push('⚠️ Integrações pendentes (não significa recusa)');
  const others=otherEligibleBanks(review,contract);
  if(others.length)lines.push('Outros bancos sem cotação: '+others.join(' / '));
  blocks.push(lines.join('\n'));
 }
 const groups=orderDaycovalUnifications(
  sheets.filter(row=>row.bank==='DAYCOVAL'&&row.indices.length>1),
  row=>({contractCount:row.indices.length,table:row.table,cashOut:row.amount}));
 if(groups.length){
  const lines=['🔄 DAYCOVAL · UNIFICAÇÕES'];
  for(const group of groups){
   lines.push('Contratos '+group.indices.map(i=>i+1).join('+')+
    ' | '+short(group.table,50)+
    '\nTroco '+money(group.amount)+' | parcela '+money(group.installment)+
    ' | '+group.term+'x | '+pct(group.rate));
   for(const change of group.changes){
    const old=change.original,next=change.adjusted;
    const label=next==null?'recalculo não informado':
      Math.abs(next-old)<.005?'mantida':next<old?'reduzida':'aumentada';
    const contract=review.contracts[change.index];
    lines.push('↳ Contrato '+(change.index+1)+
      (contract?' (final '+contract.numberSuffix+')':'')+': '+
      money(old)+' → '+(next==null?'não informado':money(next))+' ('+label+')');
   }
   const complete=group.changes.every(change=>change.adjusted!=null);
   const before=group.changes.reduce((sum,change)=>sum+change.original,0);
   const after=complete?group.changes.reduce((sum,change)=>sum+(change.adjusted||0),0):null;
   lines.push('Total das portadas: '+money(before)+' → '+money(after));
   lines.push('Parcela do NOVO refin: '+money(group.installment)+' (não somar ao total das portadas)');
  }
  blocks.push(lines.join('\n'));
 }
 const marginLines=['💳 NOVO PELA MARGEM',
  'Margem do extrato (valor da parcela): '+money(review.loanMargin)];
 if(!margin)marginLines.push('⚠️ Consulta não concluída');
 else if(margin.status==='OFFERS')
  for(const offer of margin.offers)marginLines.push('🏦 '+short(offer.bank,22)+
   ' | libera '+money(offer.amount)+' | '+offer.term+'x | parcela '+
   money(offer.installment)+' | '+pct(offer.rate)+' | '+short(offer.table,42));
 else if(margin.status==='NO_MARGIN')marginLines.push('Não há margem positiva para simulação de NOVO');
 else if(margin.status==='NO_OFFER')marginLines.push('Nenhuma oferta positiva retornada pelos bancos disponíveis');
 else if(margin.status==='MISSING_IDENTITY')marginLines.push('⚠️ Identificação insuficiente para consulta bancária');
 else marginLines.push('⚠️ Integrações indisponíveis; verificar novamente');
 blocks.push(marginLines.join('\n'));
 blocks.push('💰 RESUMO\nTroco individual de referência: '+money(totalIndividual)+
  '\nMargem livre (parcela): '+money(review.loanMargin)+
  '\nNão somar trocos de unificações nem ofertas alternativas.'+
  '\n⚠️ Simulações sujeitas a vigência, autorização e aprovação. Nenhuma contratação realizada.');
 const messages:string[]=[];let current='';
 for(const block of blocks){
  for(const line of block.split('\n')){
   const value=line+'\n';
   if(current.length+value.length>3700&&current){messages.push(current.trimEnd());current='';}
   if(value.length>3700)continue;
   current+=value;
  }
  current+='\n';
 }
 if(current.trim())messages.push(current.trimEnd());
 return messages;
}
