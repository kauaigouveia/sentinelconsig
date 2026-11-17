import type {TelegramPdfReview,TelegramSpreadsheetQuote} from './telegramInssPdfService.js';
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
/** Consolidated, privacy-preserving Telegram INSS report. Each chunk fits sendMessage. */
export function formatTelegramInssPortfolio(
  review:TelegramPdfReview,indices:readonly number[],
  sheets:readonly TelegramSpreadsheetQuote[],official:readonly Official[],
):string[]{
  const blocks:string[]=['✅ ANÁLISE INSS · PORTABILIDADE + REFINANCIAMENTO\n'+
    'Espécie do benefício: '+review.benefitType+' · Contratos selecionados: '+indices.length+
    '\nIdentificadores pessoais omitidos por segurança.'];
  const chosenAmounts:number[]=[];
  for(const index of indices){
    const contract=review.contracts[index];
    if(!contract)continue;
    const sourceCode=resolveInstitutionCode(contract.bank);
    const origin=short(institutionLabel(sourceCode)||contract.bank,55);
    const individual=sheets.filter(s=>s.indices.length===1&&s.indices[0]===index);
    const officialResult=official.find(item=>item.index===index);
    const api=(officialResult?.rows||[]).filter(row=>row.state==='OFFER'&&Number(row.amount)>0)
      .map(row=>({
        bank:short(row.institution||row.provider,45),table:short(row.name||row.code||'Condição informada',85),
        amount:Number(row.amount),installment:Number(row.installment),
        term:Number(row.term),rate:Number(row.rate),
      }));
    const offers=[...individual.map(s=>({
      bank:s.bank,table:s.table,amount:s.amount,installment:s.installment,
      term:s.term,rate:s.rate,
    })),...api].filter(o=>Number.isFinite(o.amount)&&o.amount>0);
    const best=[...offers].sort((a,b)=>b.amount-a.amount)[0];
    if(best)chosenAmounts.push(best.amount);
    const lines=['📄 Contrato '+(index+1)+' · final '+contract.numberSuffix,
      '🏦 Origem: '+origin,
      '💵 Parcela: '+money(contract.installment)+' · restantes: '+contract.remaining,
      '💰 Saldo do extrato: '+money(contract.balance)];
    if(best)lines.push('🎯 Melhor troco individual estimado: '+money(best.amount)+' · '+best.bank);
    if(offers.length){
      lines.push('📊 Uma condição prioritária por banco:');
      for(const offer of offers){
        lines.push('  • '+offer.bank+' | '+money(offer.amount)+
          ' | Tabela: '+offer.table+' | '+pct(offer.rate)+
          ' | '+(Number.isFinite(offer.term)&&offer.term>0?offer.term+'x':'prazo não informado')+
          ' | Refin: '+money(offer.installment));
      }
    }else lines.push('⚠️ Sem troco positivo confirmado pelas simulações disponíveis.');
    if(officialResult?.failed)lines.push('⚠️ Integração não concluída; não significa recusa de crédito.');
    else if(!officialResult)lines.push('ℹ️ Integrações sem resposta nesta consulta.');
    const others=otherEligibleBanks(review,contract);
    lines.push('🎯 Outros bancos (roteiro compatível, sem simulação): '+(others.length?others.join(' / '):'nenhum confirmado com os dados disponíveis'));
    blocks.push(lines.join('\n'));
  }
  const groups=orderDaycovalUnifications(
    sheets.filter(row=>row.bank==='DAYCOVAL'&&row.indices.length>1),
    row=>({contractCount:row.indices.length,table:row.table,cashOut:row.amount}),
  );
  if(groups.length){
    blocks.push('🔄 DAYCOVAL · UNIFICAÇÕES POSSÍVEIS\nPrimeiro: melhor tabela entre as unificações com mais contratos; segundo: melhor tabela do agrupamento menor. Depois: maior troco estimado.\n⚠️ Alternativas aos contratos individuais; não somar aos respectivos trocos.');
    for(const group of groups){
      const lines=['Unificação '+group.indices.map(i=>i+1).join('+'),
        'Tabela: '+group.table];
      for(const change of group.changes)
        lines.push('  Contrato '+(change.index+1)+': '+money(change.original)+' → '+
          (change.adjusted==null?'recalculo não informado':money(change.adjusted)));
      lines.push('Parcela do refin: '+money(group.installment)+
        ' | Troco: '+money(group.amount)+' | '+group.term+'x | '+pct(group.rate));
      blocks.push(lines.join('\n'));
    }
  }
  const total=chosenAmounts.reduce((sum,value)=>sum+value,0);
  blocks.push('💰 RESUMO FINANCEIRO\n'+
    'Troco potencial (melhor oferta individual por contrato): '+money(total)+
    '\nMargem livre do extrato, em valor de parcela: '+money(review.loanMargin)+
    '\nCrédito da margem não calculado; não incluído no total.'+
    '\nUnificações Daycoval não foram somadas ao troco individual.'+
    '\n⚠️ Estimativas sujeitas a elegibilidade, vigência, autorização e aprovação. Nenhuma contratação realizada.');
  const messages:string[]=[];let current='';
  for(const block of blocks){
    // Never silently truncate a contract or union; oversized blocks are split by lines.
    for(const line of block.split('\n')){
      const piece=line+'\n';
      if(current.length+piece.length>3750&&current){messages.push(current.trimEnd());current='';}
      if(piece.length>3750)continue;
      current+=piece;
    }
    current+='\n';
  }
  if(current.trim())messages.push(current.trimEnd());
  return messages;
}
