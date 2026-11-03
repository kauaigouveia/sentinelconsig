import {eligibilityPresentation,type EligibilityPresentationInput} from './eligibilityPresentation';

/** Display projection only. Unknown inputs remain pending and never activate a bank. */
export function eligibilityGroups(inputs:EligibilityPresentationInput[]){
 const rows=inputs.map(input=>{const row=eligibilityPresentation(input);return {...row,pending:input.check?.calculationAllowed===true?[]:input.check?.inputIssues?input.check.inputIssues:row.pending};});
 const counts=new Map<string,number>();
 for(const row of rows.filter(row=>row.status==='PENDENTE DE DADOS'))for(const text of new Set(row.pending))counts.set(text,(counts.get(text)||0)+1);
 const common=[...counts].filter(([,count])=>count>1).map(([message,count])=>({message,count}));
 const shared=new Set(common.map(item=>item.message));
 return {common,groups:([
  ['OFERTA CALCULADA','Ofertas calculadas'],
  ['ELEGÍVEL','Condições atendidas, sem oferta calculada'],
  ['APTO PARA CÁLCULO','Dados suficientes para calcular; análise para contratação pendente'],
  ['PENDENTE DE DADOS','Pendências que exigem ação'],
  ['NÃO ELEGÍVEL','Bancos não elegíveis'],
 ] as const).map(([status,title])=>({status,title,rows:rows.filter(row=>row.status===status).map(row=>({...row,pending:status==='NÃO ELEGÍVEL'?[]:row.pending.filter(text=>!shared.has(text))}))}))};
}
