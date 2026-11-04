import {parseCurrency} from '../../src/lib/utils.js';
import {resolveInstitutionCode} from '../../src/lib/strParticipants.js';
import {portabilityReviewMetadata,simulationPortabilityCheck} from '../../src/lib/portabilitySimulationPolicy.js';
import {paidFromTerms} from '../../src/lib/portabilityEligibility.js';
import {parseDate} from './daycovalWorkbook.js';
import {calculatePortRefin,isPortRefinModelCompatible,portRefinRatePolicies,type SpreadsheetBank} from './portRefinWorkbooks.js';
import {selectablePortRefinRates} from '../../src/lib/portRefinRates.js';

class DocumentaryRestriction extends Error {}

export function previewPortRefin(bank:SpreadsheetBank,book:any,raw:any,today:string){
 if(bank!=='DAYCOVAL')return previewAtTerm(bank,book,raw,today);
 const requested=Number(raw.term);
 if(!Number.isInteger(requested)||requested<1||requested>120)throw Error('Informe prazo válido.');
 if(!book||!Array.isArray(book.terms))return previewAtTerm(bank,book,raw,today);
 const terms=[...new Set<number>(book.terms.filter((term:any)=>Number.isInteger(term)&&term>0&&term<=requested))].sort((a,b)=>b-a);
 if(!terms.length)throw Error('Nenhum prazo da planilha está disponível até o prazo solicitado.');
 let lastResult:ReturnType<typeof previewAtTerm>|undefined,lastRestriction:Error|undefined;
 for(const term of terms){
  try{
   const result=previewAtTerm(bank,book,{...raw,term},today);
   if(result.offers.length)return {...result,requestedTerm:requested,calculatedTerm:term};
   lastResult=result;
  }catch(error){if(!(error instanceof DocumentaryRestriction))throw error;lastRestriction=error;}
 }
 if(lastResult)return {...lastResult,requestedTerm:requested,calculatedTerm:null};
 throw lastRestriction||Error('Nenhuma condição calculável nos prazos disponíveis.');
}

/** Read-only calculation: no customer lookup, persistence, events or external API. */
function previewAtTerm(bank:SpreadsheetBank,book:any,raw:any,today:string){
 if(!book||book.enabled===false)throw Error('Planilha ausente ou desativada para esta empresa.');
 if(!isPortRefinModelCompatible(bank,book.formulaHash))throw Error('Estrutura da planilha incompatível com o modelo validado.');
 const term=Number(raw.term),benefitType=Number(raw.benefitType);
 if(!Number.isInteger(term)||term<1||term>120||!Number.isInteger(benefitType)||benefitType<1||benefitType>99)throw Error('Informe prazo e espécie válidos.');
 parseDate(raw.birthDate);parseDate(today);
 if(book.validFrom)parseDate(book.validFrom);if(book.validUntil)parseDate(book.validUntil);
 if((book.validFrom&&today<book.validFrom)||(book.validUntil&&today>book.validUntil)||(book.validFrom&&book.validUntil&&book.validFrom>book.validUntil))throw Error('Planilha fora da vigência comercial informada.');
 if(!Array.isArray(book.terms)||!book.terms.includes(term))throw Error(`Prazo ${term} meses não disponível nesta planilha. Prazos disponíveis: ${(book.terms||[]).join(', ')}.`);
 if(!Array.isArray(raw.contracts)||!raw.contracts.length||raw.contracts.length>3)throw Error('Informe de 1 a 3 contratos.');
 const contracts=raw.contracts.map((contract:any)=>{
  const originBank=resolveInstitutionCode(String(contract.originBank||'')),originalTerm=Number(contract.originalTerm),remaining=Number(contract.remaining),balance=parseCurrency(contract.balance),installment=parseCurrency(contract.installment);
  const paidInstallments=paidFromTerms(originalTerm,remaining);
  if(!originBank||!Number.isInteger(originalTerm)||!Number.isInteger(remaining)||remaining<1||remaining>originalTerm||paidInstallments==null||!Number.isFinite(balance)||balance==null||balance<=0||!Number.isFinite(installment)||installment==null||installment<=0)throw Error('Revise banco de origem, prazo original, restantes, saldo e parcela.');
  return {originBank,term:originalTerm,paidInstallments,remaining,balance,installment,...(contract.reviewMetadata?{reviewMetadata:portabilityReviewMetadata(contract.reviewMetadata)}:{})};
 });
 const input={...portabilityReviewMetadata(raw),product:'INSS',operation:'PORT_REFIN',birthDate:raw.birthDate,benefitType,simulationDate:today,term,contracts,additionalMargin:0,benefitContractCount:Number(raw.benefitContractCount),refinanceRate:raw.refinanceRate==null||raw.refinanceRate===''?undefined:parseCurrency(raw.refinanceRate)};
 const check=simulationPortabilityCheck(bank,input);if(check.blocked)throw new DocumentaryRestriction(check.contracts.filter(contract=>contract.blocked).map(contract=>contract.reason).join(' ')||'Restrição confirmada no roteiro deste banco.');
 if(bank==='PARANA'&&(!Number.isInteger(input.benefitContractCount)||input.benefitContractCount<1||input.benefitContractCount>13))throw Error('Paraná: informe a quantidade total de contratos no benefício (1 a 13), sem presumir que existe apenas um.');
 const rates=bank==='PARANA'?selectablePortRefinRates(portRefinRatePolicies(bank,book),term,contracts.reduce((sum,c)=>sum+c.installment!,0),[32,92].includes(benefitType)?15:undefined):[input.refinanceRate];
 const selectedRates=bank==='PARANA'&&input.refinanceRate!=null?rates.filter(rate=>Math.abs(rate-input.refinanceRate!)<0.000001):rates;
 if(!selectedRates.length)throw Error('Paraná: nenhuma taxa da planilha atende ao prazo e à parcela informados.');
 let result:ReturnType<typeof calculatePortRefin>;
 try{const results=selectedRates.map(refinanceRate=>calculatePortRefin(bank,book,{...input,refinanceRate}));result={...results[0],offers:results.flatMap(row=>row.offers)};}catch{throw Error('A planilha não conseguiu calcular esta condição. Verifique o modelo, os dados e o prazo selecionado.');}
 const offers=result.offers.filter(offer=>offer.calculated&&Number.isFinite(offer.amount)&&offer.amount>0).map(offer=>({code:offer.tableId,name:offer.tableName,amount:offer.amount,contractAmount:offer.contractAmount,installment:offer.installment,term:offer.term,rate:offer.rate,policyStatus:offer.policyStatus,requiresReview:!offer.eligible||!book.validFrom||!book.validUntil,quoteKind:'ESTIMATE',provider:bank,...(bank==='DAYCOVAL'?{installmentChanges:contracts.map((contract,index)=>({originalInstallment:contract.installment,newInstallment:Number.isFinite((result as any).contracts?.[index]?.newInstallment)&&(result as any).contracts[index].newInstallment>0?(result as any).contracts[index].newInstallment:null}))}:{})}));
 return {offers,paidInstallments:contracts.map(contract=>contract.paidInstallments),message:offers.length?'Estimativa calculada pela planilha; não constitui aprovação ou contratação.':'A planilha não retornou condição financeira calculável para estes dados.',version:{hash:book.hash,versionDate:book.versionDate||null}};
}
