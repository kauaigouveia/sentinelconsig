import replacement from '../data/portabilityRulesReplacement20261030.json';
import historical from '../data/portabilityRules20261019.json';
import supplement from '../data/portabilityRulesSupplement.json';

export const PORTABILITY_SOURCE_SUPPLEMENT = supplement;
const previousCatalog: any[] = [
 ...historical,
 ...supplement.banks.filter(bank => !historical.some(old => old.id === bank.id)).map(bank => ({
  ...bank, receivedAt: supplement.receivedAt, version: 'Documento complementar · vigência não informada',
  source: supplement.source, sourceFile: supplement.sourceFile,
 })),
];
export const PORTABILITY_REPLACEMENT = replacement;
export const replacementBankIds = new Set(replacement.banks.map(bank=>bank.id));
const replacementRows=replacement.banks.map(bank=>({...bank,receivedAt:replacement.receivedAt,version:replacement.id,source:replacement.source,sourceFile:replacement.sourceFile}));
export const portabilitySourceCatalog:any[]=[...previousCatalog.filter(bank=>!replacementBankIds.has(bank.id)),...replacementRows];
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** No documentary precedence was provided. Disputed criteria cannot definitively reject or approve. */
export function portabilityRuleSources(id: string, origin: string, category?:'CORBAN'|'NETWORK') {
 const current=replacement.banks.find(bank=>bank.id===id);
 if(current)return {criteria:JSON.parse(JSON.stringify(current.criteria)),conflicts:[] as string[],sources:[{file:replacement.sourceFile,receivedAt:replacement.receivedAt,effectiveAt:replacement.effectiveAt,page:current.page,sha256:replacement.sourceSha256,precedence:replacement.precedence}],ageAlternatives:[] as Record<string,any>[]};
 const old = historical.find(bank => bank.id === id);
 const next = supplement.banks.find(bank => bank.id === id);
 const conflicts: string[] = [], criteria: Record<string, any> = {...old?.criteria};
 const sources = [old && {file:old.sourceFile,receivedAt:old.receivedAt,effectiveAt:null}, next && {
  file:supplement.sourceFile,receivedAt:supplement.receivedAt,effectiveAt:supplement.effectiveAt,page:next.page,
 }].filter(Boolean);
 if (!next) return {criteria,conflicts,sources,ageAlternatives:[] as Record<string,any>[]};
 const incoming: Record<string, any> = next.criteria;
 // These fields express the same restriction in different representations.
 const groups = [
  ['maxAge','maxStartMonths','maxStartDays','startMonthsByTerm','ageByTerm'],
  ['portRates','portRatesByBenefit','portRatesByBalance','pureMinRate'],
  ['refinRates','refinRateOptions','refinRatesByBalance','balanceByRefinRate'],
  ['minBalance','minBalanceByBenefit'],
 ];
 const handled = new Set(['blocked','blockedNames','paid']);
 for (const group of groups) {
  if (!group.some(key => incoming[key] !== undefined)) continue;
  group.forEach(key => handled.add(key));
  const before=Object.fromEntries(group.filter(key=>criteria[key]!==undefined).map(key=>[key,criteria[key]]));
  const after=Object.fromEntries(group.filter(key=>incoming[key]!==undefined).map(key=>[key,incoming[key]]));
  group.forEach(key=>delete criteria[key]);
  if (Object.keys(before).length && !equal(before,after)) conflicts.push(`Divergência documental em ${group.join('/')}: 19/10/2026 e documento complementar sem vigência/prioridade.`);
  else Object.assign(criteria,after);
 }
 for (const [key,value] of Object.entries(incoming)) {
  if (handled.has(key)) continue;
  // A previously unquantified permission is compatible with an explicit numeric limit.
  if((key==='unify'||key==='reduce')&&criteria[key]===true&&typeof value==='number') {criteria[key]=value;continue;}
  if (criteria[key]!==undefined && !equal(criteria[key],value)) {
   const previous=criteria[key];delete criteria[key];
   // The weaker common lower bound is still a confirmed exclusion in both sources.
   if(['minAge','minInstallment','minCash'].includes(key)&&typeof previous==='number'&&typeof value==='number')criteria[key]=Math.min(previous,value);
   conflicts.push(`Divergência documental em ${key}: 19/10/2026 e documento complementar sem prioridade.`);
  } else criteria[key]=value;
 }
 // Both lists are retained in the source documents; only agreed exclusions are definitive.
 const previousBlocked=old?.criteria.blocked;
 criteria.blocked=previousBlocked ? incoming.blocked.filter((code:string)=>previousBlocked.includes(code)) : incoming.blocked;
 criteria.blockedNames=[];
 if(previousBlocked && previousBlocked.includes(origin)!==incoming.blocked.includes(origin))
  conflicts.push(`Banco de origem ${origin}: listas de exclusão divergem entre os dois documentos.`);
 criteria.paid={...(old?.criteria.paid||{})};
 const previousCriteria:Record<string,any>=old?.criteria||{};
 const defaultPaid=(rule:Record<string,any>)=>(category==='CORBAN'?rule.corbanPaid:category==='NETWORK'?rule.networkPaid:undefined)??rule.otherPaid;
 const before=previousCriteria.paid?.[origin]??defaultPaid(previousCriteria), after=incoming.paid[origin]??defaultPaid(incoming);
 if(after!==undefined){
  if(Array.isArray(after) || (before!==undefined && before!==after)) {
   criteria.paid[origin]=Math.min(...[before,after].flat().filter((v:any)=>typeof v==='number'));
   // No fallback category may silently decide a disputed individual agreement.
   delete criteria.corbanPaid; delete criteria.networkPaid; delete criteria.otherPaid;
   conflicts.push(`Origem ${origin}: mínimo de pagas conflitante (${before??'não individualizado'} / ${Array.isArray(after)?after.join(' ou '):after}).`);
  } else criteria.paid[origin]=after;
 }
 return {criteria,conflicts,sources,ageAlternatives:(old?[old.criteria,incoming]:[]) as Record<string,any>[]};
}
