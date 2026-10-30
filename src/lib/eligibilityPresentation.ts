export type EligibilityStatus = 'OFERTA CALCULADA' | 'ELEGÍVEL' | 'PENDENTE DE DADOS' | 'NÃO ELEGÍVEL';
export type EligibilityEvidence = {blocked?:boolean;review?:boolean;status?:string;reason?:string;reasons?:string[];notices?:string[];sources?:unknown[]};
export type EligibilityPresentationInput = {bank:string;product?:string;operation?:string;table?:string;check?:EligibilityEvidence;message?:string;calculated?:boolean;commercial?:{label:string;value:string}[]};
const unique=(items:string[])=>[...new Set(items.map(value=>value.trim()).filter(Boolean))];
const money=(value:string)=>Number(value.includes(',')?value.replace(/\./g,'').replace(',','.'):value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function eligibilityPresentation(input:EligibilityPresentationInput,audience:'internal'|'partner'='internal'){
 const {bank,check}=input;
 const prefix=bank.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const clean=(text:string)=>text.replace(new RegExp('^(?:'+prefix+'\\s*:\\s*)+','i'),'').trim();
 const fragments=(text:string)=>text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).map(clean);
 const supplied=[...(check?.reasons||[]),...(check?.notices||[])];
 const evidence=unique((supplied.length?supplied:fragments(input.message||check?.reason||'')).map(clean));
 const conflicts=evidence.filter(text=>/diverg|conflit|sem prioridade/i.test(text));
 const publicLine=(text:string)=>{
  if(/diverg|conflit|sem prioridade/i.test(text))return /maxAge|maxStart|idade|ageByTerm|startMonths/i.test(text)?'Regras de idade e prazo: validação documental pendente.':'Regras aplicáveis: validação documental pendente.';
  if(/\bUF\b|estado do benefício/i.test(text))return 'UF: confirmar informação.';
  if(/valor bruto|contractAmount/i.test(text))return 'Valor bruto: conferir informação.';
  if(/troco.*(?:aguard|calcul)|aguard.*troco/i.test(text))return 'Troco mínimo: aguardando cálculo.';
  if(/document|formaliza/i.test(text))return 'Documentação: verificar requisitos com a mesa.';
  if(audience==='partner'){
   if(/nascimento/i.test(text))return 'Nascimento: conferir informação.';
   if(/saldo.*(?:informe|válid)|informe.*saldo/i.test(text))return 'Saldo devedor: informar valor válido.';
   if(/parcelas restantes/i.test(text))return 'Parcelas restantes: conferir informação.';
   if(/prazo/i.test(text))return 'Prazo: conferir informação.';
   if(/parcela/i.test(text))return 'Parcela: conferir informação.';
   return 'Validação pendente: solicite orientação à mesa.';
  }
  // Financial strings are formatted only; thresholds are never inferred or changed here.
  const financial=clean(text).replace(/R\$\s*(\d+(?:[.,]\d+)*)/g,(_,number)=>money(number));
  if(/[{}]|maxAge|maxStart|[a-z]+[A-Z][a-z]+|(?:token|password|authorization|consult_id|ruleId)/.test(financial))return 'Dados ou condições: solicitar conferência à mesa.';
  return financial;
 };
 const restrictions=unique((check?.reasons||[]).map(clean).map(publicLine));
 const pending=unique((check?.notices?.length?check.notices:evidence.filter(text=>!(check?.reasons||[]).includes(text))).map(clean).map(publicLine));
 const explicitBlocked=check?.blocked===true||check?.status==='NÃO ELEGÍVEL';
 const requiresReview=check?.review===true||check?.status==='PENDENTE DE DADOS'||conflicts.length>0;
 const status:EligibilityStatus=explicitBlocked?'NÃO ELEGÍVEL':requiresReview?'PENDENTE DE DADOS':input.calculated?'OFERTA CALCULADA':check?.status==='ELEGÍVEL'?'ELEGÍVEL':'PENDENTE DE DADOS';
 return {bank,product:input.product||'Produto não informado',operation:input.operation,table:input.table,status,
  commercial:audience==='partner'?[]:input.commercial||[],restrictions,pending,conflicts:unique(conflicts.map(publicLine)),
  met:check?.status==='ELEGÍVEL'&&!requiresReview&&!explicitBlocked?['Critérios informados atendidos; sujeito à análise do banco.']:[],
  original:input,diagnostics:{evidence,conflicts,sources:check?.sources||[]}};
}
export const eligibilityRank=(status:EligibilityStatus)=>['OFERTA CALCULADA','ELEGÍVEL','PENDENTE DE DADOS','NÃO ELEGÍVEL'].indexOf(status);
