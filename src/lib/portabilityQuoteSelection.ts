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

// The site and Telegram use the same business presentation order for
// Daycoval combinations. Preserve one validated offer per combination.
// First the best table of the largest group, then the best table of each
// smaller group; afterwards order remaining options by estimated cash-out.
export function orderDaycovalUnifications<T>(
  items:readonly T[],
  details:(item:T)=>{contractCount:number;table:unknown;cashOut:unknown},
):T[]{
  const entries=items.map((item,index)=>{
    const detail=details(item),amount=Number(detail.cashOut);
    return {item,index,count:detail.contractCount,
      table:daycovalTablePosition(detail.table)??Number.POSITIVE_INFINITY,
      amount:Number.isFinite(amount)&&amount>0?amount:0};
  });
  const groupCounts=[...new Set(entries.filter(e=>Number.isInteger(e.count)&&e.count>=2&&e.amount>0).map(e=>e.count))]
    .sort((a,b)=>b-a);
  const selected=new Set<number>();
  const promoted:typeof entries=[];
  for(const count of groupCounts){
    const top=entries.filter(e=>e.count===count&&e.amount>0)
      .sort((a,b)=>a.table-b.table||b.amount-a.amount||a.index-b.index)[0];
    if(top){selected.add(top.index);promoted.push(top);}
  }
  const remaining=entries.filter(e=>!selected.has(e.index))
    .sort((a,b)=>b.amount-a.amount||a.table-b.table||b.count-a.count||a.index-b.index);
  return [...promoted,...remaining].map(e=>e.item);
}
