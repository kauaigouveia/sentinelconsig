import {estimateProjectedInssLoan} from './inssProjectedMargin';
/**
 * Cálculo de cenário bancário (sem chamada com margem ainda não liberada).
 * Usa a taxa/prazo devolvidos na consulta vigente a cada banco/tabela.
 * Não determina CET, IOF, líquido, aprovação ou validade futura da tabela.
 */
export type InssCurrentBankQuote = {
  provider:string; institution:string; table:string;
  amount:number; installment:number|null; term:number|null; rate:number|null;
  source:'API'|'PLANILHA';
};
export type InssProjectedBankQuote = InssCurrentBankQuote & { projectedGross:number; scenario:'FUTURE_NOT_AVAILABLE' };
export function inssBankProjectedQuotes(quotes:readonly InssCurrentBankQuote[], enabled:boolean):InssProjectedBankQuote[]{
  if(!enabled)return [];
  const seen=new Set<string>();
  const result:InssProjectedBankQuote[]=[];
  for(const quote of quotes){
    const rate=quote.rate,term=quote.term;
    if(rate==null||term==null||rate<=0||!Number.isFinite(rate)||!Number.isInteger(term))continue;
    const projectedGross=estimateProjectedInssLoan(rate,term);
    if(projectedGross==null)continue;
    const id=[quote.provider,quote.institution,quote.table,rate,term].join('|').toLowerCase();
    if(seen.has(id))continue;
    seen.add(id);
    result.push({...quote,projectedGross,scenario:'FUTURE_NOT_AVAILABLE'});
  }
  return result.sort((a,b)=>a.provider.localeCompare(b.provider)||b.projectedGross-a.projectedGross);
}
