import type { PrismaClient } from '@prisma/client';
import { PartnerSimulationService } from './partnerSimulationService.js';
import { PartnerSimulationTracking } from './partnerSimulationTracking.js';
import { formatTelegramBankSimulation } from './telegramBankResultPresentation.js';
import type { TelegramPdfReview } from './telegramInssPdfService.js';
import {selectPortabilityQuoteRows} from '../../src/lib/portabilityQuoteSelection.js';
type Runner=typeof PartnerSimulationService.run;
type RecordQuote=typeof PartnerSimulationTracking.record;
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export async function calculateTelegramInssOfficialQuotes(db:PrismaClient,tenantId:string,
  partner:{id:string;name:string;code:string},review:TelegramPdfReview,
  indices:readonly number[],illiterate:'YES'|'NO',attemptKey:string,
  deps?:{run?:Runner;record?:RecordQuote}){
  const privateData=review.bankConsultation;
  if(!tenantId||!partner.id||!partner.code||!/^[a-zA-Z0-9-]{16,80}$/.test(attemptKey)||
    !['YES','NO'].includes(illiterate)||indices.length<1||indices.length>13||
    new Set(indices).size!==indices.length||
    indices.some(i=>!Number.isInteger(i)||i<0||i>=review.contracts.length))
    throw Error('Consulta inválida.');
  if(!privateData||privateData.contracts.length!==review.contracts.length||
    privateData.contracts.some((c,i)=>!c.number||c.number.replace(/[^A-Za-z0-9]/g,'').slice(-4)!==review.contracts[i].numberSuffix))
    return {texts:['Integrações bancárias não consultadas: dados de origem não confirmados. Reenvie o PDF.'],consulted:0,positive:0,unavailableBanks:['Identificadores indisponíveis'],contracts:[]};
  const run=deps?.run||PartnerSimulationService.run;
  const record=deps?.record||PartnerSimulationTracking.record;
  const results:{index:number;rows:any[];saved:boolean;failed:boolean;completedWithoutOffer:boolean}[]=[];
  let next=0;
  const worker=async()=>{
    while(next<indices.length){
      const index=indices[next++],contract=review.contracts[index];
      const input={
        product:'INSS',operation:'PORT_REFIN',mode:'Payment',term:108,value:contract.installment,
        cpf:privateData.cpf,benefitNumber:privateData.benefitNumber,name:privateData.name,
        phone:'',income:privateData.income,legalRepresentative:privateData.legalRepresentative,
        birthDate:review.birthDate,benefitType:review.benefitType,benefitStartDate:review.benefitStartDate,
        state:review.uf,illiterate,hasInsurance:false,eligibility:true,partnerId:partner.id,
        originalContract:privateData.contracts[index].number,originalBank:contract.bank,
        originalTerm:contract.originalTerm,remainingTerm:contract.remaining,
        debt:contract.balance,originalInstallment:contract.installment,
      };
      try{
        const result=await run(db,tenantId,input,'SIMULATE');
        const rows=(Array.isArray(result?.rows)?result.rows:[]).filter((r:any)=>
          !['DAYCOVAL','PARANA','C6'].includes(String(r.provider||r.institution||'').toUpperCase()));
        const groups=new Map<string,any[]>();
        for(const row of rows.filter((r:any)=>r.state==='OFFER'&&Number(r.amount)>0)){
          const key=String(row.provider||row.institution||'').toUpperCase();
          groups.set(key,[...(groups.get(key)||[]),row]);
        }
        const offers=[...groups.entries()].flatMap(([bank,items])=>
          selectPortabilityQuoteRows(items,bank,{
            name:r=>r.name||r.code,rate:r=>r.rate,amount:r=>r.amount,
          }));
        const compact=[...rows.filter((r:any)=>r.state!=='OFFER'),...offers];
        let saved=false;
        if(offers.length){
          const history=await record(db,{tenantId,partnerId:partner.id,partnerCode:partner.code,
            accessName:'Telegram PDF'},attemptKey+'-'+(index+1),input,offers);
          saved=!!history;
        }
        results.push({index,rows:compact,saved,failed:false,
          completedWithoutOffer:result.operationalStatus==='NO_OFFERS'&&offers.length===0});
      }catch{results.push({index,rows:[],saved:false,failed:true,completedWithoutOffer:false});}
    }
  };
  await Promise.all(Array.from({length:Math.min(2,indices.length)},()=>worker()));
  results.sort((a,b)=>a.index-b.index);
  const texts=['🏦 Integrações bancárias — '+results.length+' de '+indices.length+' contratos consultados.'];
  let positive=0;
  for(const result of results){
    const contract=review.contracts[result.index];
    texts.push('📄 Contrato '+(result.index+1)+' · final '+contract.numberSuffix+
      '\nParcela original: '+money(contract.installment)+' · saldo: '+money(contract.balance));
    if(result.failed)texts.push('⚠️ A consulta deste contrato não foi concluída. Não significa recusa bancária.');
    else{
      positive+=result.rows.filter(row=>row.state==='OFFER'&&Number(row.amount)>0).length;
      texts.push(...formatTelegramBankSimulation(result.rows,'INSS','PORT_REFIN',result.saved));
    }
  }
  const available=results.flatMap(r=>r.rows.filter(x=>x.state==='OFFER'&&Number(x.amount)>0));
  for(const bank of ['FINANTO','Nossa Fintech']){
    if(!available.some(r=>String(r.provider||r.institution).toLowerCase()===bank.toLowerCase()))
      texts.push('ℹ️ '+bank+': nenhuma oferta positiva confirmada. Confira configuração, roteiro e autorização da instituição.');
  }
  texts.push('⚠️ Cotações preliminares sujeitas a autorização e análise. Nenhuma contratação foi realizada.');
  return {texts,consulted:results.length,positive,unavailableBanks:results.filter(r=>r.failed).map(r=>'Contrato '+(r.index+1)),contracts:results};
}
