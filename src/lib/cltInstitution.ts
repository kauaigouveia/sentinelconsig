import type {JourneySnapshot} from './cltJourney';
import type {ProductSimulationRow} from '../../server/services/productSimulationService';
const nossaIds:Record<string,string>={qi:'qi',qitech:'qi','qi tech':'qi',qi_tech:'qi',uy3:'uy3'};
/** Explicit contract aliases only; never match bank names by substring. */
export function canonicalNossaInstitution(value:unknown){return typeof value==='string'?nossaIds[value.trim().toLowerCase()]:undefined;}
export function nossaInstitutionName(id:string){return id==='qi'?'QI Tech':id==='uy3'?'UY3':id;}
export function rowsOfBank(snapshot:JourneySnapshot|null,bank:string):ProductSimulationRow[]{
  return (snapshot?.results[bank]?.rows||[]).filter(row=>!row.origin?.providerId||row.origin.providerId===bank);
}
export function snapshotOfBank(snapshot:JourneySnapshot|null,bank:string):JourneySnapshot|null{
  if(!snapshot||!snapshot.banks.some(item=>item.id===bank))return null;
  return {...snapshot,banks:snapshot.banks.filter(item=>item.id===bank),results:{[bank]:{...snapshot.results[bank],rows:rowsOfBank(snapshot,bank)}}};
}
