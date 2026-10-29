import type {ProductSimulationRow} from '../../server/services/productSimulationService';
/** IDs supplied by VCTEX, never financial values or employer names. Last observation wins. */
export function currentVctexEmployments<T extends {employmentId:string}>(items:T[]):T[]{return [...new Map(items.filter(e=>typeof e?.employmentId==='string'&&e.employmentId).map(e=>[e.employmentId,e])).values()];}
export function currentVctexRows(rows:ProductSimulationRow[]):ProductSimulationRow[]{
 const current=new Map<string,ProductSimulationRow>();const other:ProductSimulationRow[]=[];
 for(const row of rows){const v=(row.data as any)?.vctex;if(row.state!=='DATA'||!v?.preOperationId||!v?.employmentId){other.push(row);continue;}
 const key=JSON.stringify([row.origin?.connectionId,v.preOperationId,v.employmentId]);current.set(key,row);}
 return [...current.values(),...other];
}
