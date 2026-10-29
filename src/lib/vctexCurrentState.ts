import type {ProductSimulationRow} from '../../server/services/productSimulationService';
/** IDs supplied by VCTEX, never financial values or employer names. Last observation wins. */
export function currentVctexEmployments<T extends {employmentId:string}>(items:T[]):T[]{return [...new Map(items.filter(e=>typeof e?.employmentId==='string'&&e.employmentId).map(e=>[e.employmentId,e])).values()];}
export function currentVctexRows(rows:ProductSimulationRow[]):ProductSimulationRow[]{
 const current=new Map<string,ProductSimulationRow>();const other:ProductSimulationRow[]=[];
 for(const row of rows){const v=(row.data as any)?.vctex;if(row.state!=='DATA'||!v?.preOperationId||!v?.employmentId){other.push(row);continue;}
 const key=JSON.stringify([row.origin?.connectionId,v.preOperationId,v.employmentId]);current.set(key,row);}
 return [...current.values(),...other];
}

/** Official query data only. Financial quotes and attempts are separate records. */
export function vctexConsultationRows(value:any,connectionId:string):ProductSimulationRow[]{
 const origin={providerId:'vctex',connectionId,consultationId:value.preOperationId};
 const rows:ProductSimulationRow[]=currentVctexEmployments<any>(value.employments||[]).map(e=>({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',origin,state:'DATA',data:{vctex:{connectionId,preOperationId:value.preOperationId,employmentId:e.employmentId,employerName:e.employer?.name,registrationNumber:e.registrationNumber},authorization:{status:value.authorizationValid?'AUTHORIZED':undefined},margin:{available_balance:e.availableMarginValue,can_continue:e.eligible},observedAt:new Date().toISOString()}}));
 if(value.expiredPreOperationId)rows.push({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',origin:{...origin,consultationId:value.expiredPreOperationId},state:'PENDING',outcome:'INELIGIBLE',message:'Consulta anterior expirada.',data:{vctex:{connectionId,preOperationId:value.expiredPreOperationId,authorizationValid:false}}});
 rows.push({provider:'VCTEX DIGITAL',institution:'VCTEX DIGITAL',origin,state:'PENDING',outcome:value.authorizationValid?(value.status==='finished'?undefined:'PENDING'):'AUTHORIZATION_REQUIRED',message:value.label,link:value.link,data:{vctex:{connectionId,preOperationId:value.preOperationId,authorizationValid:value.authorizationValid},authorization:{status:value.authorizationValid?'AUTHORIZED':undefined},observedAt:new Date().toISOString()}});return rows;
}
