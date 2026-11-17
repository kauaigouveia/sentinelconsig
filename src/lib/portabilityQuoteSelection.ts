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
