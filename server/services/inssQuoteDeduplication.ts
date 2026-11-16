/**
 * Restricts pending quote overlap to contracts of the SAME tenant, partner and CPF
 * (the caller enforces those DB predicates). Never compare CPF alone.
 */
const norm=(value:unknown)=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const lender=(value:unknown)=>{
  const normalized=norm(value);
  return /^\d+$/.test(normalized) ? String(Number(normalized)) : normalized;
};
export function quoteOriginKeys(data:any):string[]{
  const sources=Array.isArray(data?.originContracts) && data.originContracts.length
    ? data.originContracts.slice(0,3) : data?.originContract ? [data.originContract] : [];
  const benefit=norm(data?.benefitNumber);
  if(!benefit)return [];
  return [...new Set(sources.map((contract:any)=>{
    const bank=lender(contract?.lenderCode),number=norm(contract?.contractNumber);
    return bank && number ? [benefit,bank,number].join('|') : '';
  }).filter(Boolean))];
}
export function hasPendingOriginOverlap(keys:string[], rows:{customerData:unknown}[]):boolean{
  if(!keys.length)return false;
  const set=new Set(keys);
  return rows.some(row=>quoteOriginKeys(row.customerData).some(key=>set.has(key)));
}
