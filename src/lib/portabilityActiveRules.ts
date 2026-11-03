import historicalReplacement from '../data/portabilityRulesReplacement20261030.json';

export const daycovalAmendment={
 id:'DAYCOVAL_PORTABILITY_AMENDMENT_20261030',
 source:'Esclarecimento substitutivo do responsável · Daycoval',
 sourceFile:'docs/sources/daycoval-portability-amendment-20261030.md',
 receivedAt:'2026-10-30',effectiveAt:null,
 ageReference:'START' as 'START'|'END'|null,
 bands:[
  {minAge:21,maxMonths:62*12+11,maxDays:29,maxTerm:108,maxContract:400000},
  {minAge:63,maxMonths:65*12+11,maxDays:29,maxTerm:96,maxContract:350000},
  {minAge:66,maxMonths:72*12+11,maxDays:29,maxTerm:84,maxContract:300000},
 ],
};
/** One active projection for policy, guides and simulation. Original source stays archived intact. */
export const activePortabilityReplacement={...historicalReplacement,banks:historicalReplacement.banks.map((bank:any)=>{
 if(bank.id!=='daycoval')return bank;
 const {maxEndMonths:_oldMonths,maxEndDays:_oldDays,...criteria}=bank.criteria;
 const fields=bank.fields.map(([label,value]:string[])=>[label,label==='Limite de idade'?'21–62a11m29d: 108x / R$ 400.000; 63–65a11m29d: 96x / R$ 350.000; 66–72a11m29d: 84x / R$ 300.000. Idade na contratação.':label==='Portabilidade pura'?'Permitida pela atualização substitutiva':value]);
 return {...bank,criteria:{...criteria,pure:true,portabilityAgeBands:daycovalAmendment.bands,ageReference:daycovalAmendment.ageReference},fields,
  text:fields.map(([label,value]:string[])=>`${label}: ${value}`).join('\n'),amendment:daycovalAmendment};
})};
export function replacementSources(bank:any){
 return [{file:historicalReplacement.sourceFile,receivedAt:historicalReplacement.receivedAt,effectiveAt:historicalReplacement.effectiveAt,page:bank.page,sha256:historicalReplacement.sourceSha256,precedence:historicalReplacement.precedence},
  ...(bank.amendment?[{file:bank.amendment.sourceFile,receivedAt:bank.amendment.receivedAt,effectiveAt:bank.amendment.effectiveAt,page:null,precedence:'Substituição expressa para modalidades, faixas e tetos Daycoval'}]:[])];
}
