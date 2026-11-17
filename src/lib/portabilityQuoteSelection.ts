/** Common, deterministic display policy for INSS portability + refinancing.
 * Never upgrades an ineligible quote or manufactures a rate / table.
 * Daycoval: nearest confirmed numbered table to 1 (1..9), preserving every tie.
 * Other banks: one offer per bank and contract; prefer 1.85%, then next lower rate.
 */
export function daycovalTablePosition(label:unknown):number|null {
  const text=String(label??'').trim().toUpperCase();
  if(!/INSS|RFN|REFIN|TAB(?:ELA)?/.test(text))return null;
  const match=/(?:^|[\s-])([1-9])\s*$/.exec(text);
  return match?Number(match[1]):null;
}
const rateNumber=(value:unknown):number|null=>{
  if(value==null||value==='')return null;
  const n=typeof value==='number'?value:Number(String(value).trim().replace('%','').replace(',','.'));
  return Number.isFinite(n)&&n>=0?n:null;
};
export type QuotePresentationAccess<T>={
  name:(row:T)=>unknown;
  rate:(row:T)=>unknown;
  amount:(row:T)=>unknown;
  valid?:(row:T)=>boolean;
};
export function selectPortabilityQuoteRows<T>(
  rows:readonly T[],bank:string,access:QuotePresentationAccess<T>,
):T[]{
  const eligible=rows.filter(row=>access.valid?.(row)!==false&&
    Number.isFinite(Number(access.amount(row)))&&Number(access.amount(row))>0);
  if(!eligible.length)return rows.length?[rows[0]]:[];
  const money=(row:T)=>Number(access.amount(row));
  if(bank.trim().toUpperCase()==='DAYCOVAL'){
    const ranked=eligible.map(row=>({row,rank:daycovalTablePosition(access.name(row))}));
    const numeric=ranked.filter(item=>item.rank!=null);
    if(numeric.length){
      const best=Math.min(...numeric.map(item=>item.rank!));
      return numeric.filter(item=>item.rank===best).map(item=>item.row)
        .sort((a,b)=>money(b)-money(a));
    }
    // Unknown table number is never labelled "Tabela 1".
    return [...eligible].sort((a,b)=>money(b)-money(a)).slice(0,1);
  }
  const rank=(row:T)=>{
    const rate=rateNumber(access.rate(row));
    if(rate===null)return 10000;
    return rate<=1.85?Math.abs(1.85-rate):100+rate-1.85;
  };
  return [...eligible].sort((a,b)=>rank(a)-rank(b)||money(b)-money(a)).slice(0,1);
}

/** Group order: three contracts, then two; table 1..9; greater cash on ties. */
export function orderDaycovalUnifications<T>(
 items:readonly T[],details:(item:T)=>{contractCount:number;table:unknown;cashOut:unknown},
):T[]{
 return items.map((item,index)=>{
  const d=details(item),n=Number(d.cashOut);
  return {item,index,count:d.contractCount,
    rank:daycovalTablePosition(d.table)??Number.POSITIVE_INFINITY,
    amount:Number.isFinite(n)&&n>0?n:0};
 }).sort((a,b)=>b.count-a.count||a.rank-b.rank||b.amount-a.amount||a.index-b.index)
   .map(row=>row.item);
}
/** Select up to three disjoint loans per output. Try eligible triples first;
 * where creditor policy blocks all triples, try pairs. Find the best Daycoval
 * table in a bounded window (at most 6 inputs / 20 triple calculations).
 * Do NOT emit all tested combinations as customer-facing simulations.
 */
export function planDaycovalUnifications<T,R extends {offers?:readonly any[]}>(
 contracts:readonly T[],calculate:(indices:readonly number[])=>R,
):Array<{indices:number[];result:R&{offers:any[]}}>{
 const remaining=contracts.map((_,index)=>index);
 const selected:Array<{indices:number[];result:R&{offers:any[]}}>=[];
 while(remaining.length>=2){
  const size=Math.min(3,remaining.length);
  const window=remaining.slice(0,Math.min(6,remaining.length));
  let best:{indices:number[];result:R&{offers:any[]};rank:number;cash:number}|null=null;
  for(const target of size===3?[3,2]:[2]){
   const candidates:number[][]=[];
   const walk=(start:number,chosen:number[])=>{
    if(chosen.length===target){candidates.push(chosen);return;}
    for(let i=start;i<window.length;i++)walk(i+1,[...chosen,window[i]]);
   };
   walk(0,[]);
   for(const indices of candidates){
    let result:R;
    try{result=calculate(indices);}catch{continue;}
    const offer=selectPortabilityQuoteRows(result.offers||[],'DAYCOVAL',{
      name:(row:any)=>row.name||row.tableName||row.code||row.tableId,
      rate:(row:any)=>row.rate,
      amount:(row:any)=>row.amount,
    }).find(row=>Number.isFinite(Number(row.amount))&&Number(row.amount)>0);
    if(!offer)continue;
    const rank=daycovalTablePosition(offer.name||offer.tableName||offer.code||offer.tableId)??Number.POSITIVE_INFINITY;
    const cash=Number(offer.amount);
    if(!best||rank<best.rank||rank===best.rank&&cash>best.cash)
     best={indices,result:{...result,offers:[offer]},rank,cash};
   }
   if(best)break;
  }
  if(!best){if(size===2)break;remaining.shift();continue;}
  selected.push({indices:best.indices,result:best.result});
  for(const index of best.indices){const i=remaining.indexOf(index);if(i>=0)remaining.splice(i,1);}
 }
 return selected;
}
