export const PLAYBOOK_TOPICS = [
 {id:'portability',label:'Portabilidade e parcelas pagas',description:'Bancos de origem, restrições e acordos de pagas.'},
 {id:'eligibility',label:'Quem pode contratar',description:'Idade, benefício, espécie e representação.'},
 {id:'amounts',label:'Valores, taxas e prazos',description:'Parcela, saldo, troco, taxas e limites.'},
 {id:'documents',label:'Documentos e formalização',description:'Documentação, assinatura, evidências e autorização.'},
 {id:'payments',label:'Conta e pagamento',description:'Dados bancários, crédito e reapresentação.'},
 {id:'attention',label:'Pontos de atenção',description:'Divergências, exceções e informações a confirmar.'},
 {id:'general',label:'Outras orientações',description:'Contexto e demais informações do roteiro.'},
] as const;
export type PlaybookTopic = typeof PLAYBOOK_TOPICS[number]['id'];
const clean=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function organizePlaybook(text:string) {
 // Group complete source passages. Do not split semicolon clauses: restrictions may scope subsequent clauses.
 let explicitTopic:PlaybookTopic|undefined;
 return text.split(/\r?\n|\s{3,}/).filter(value=>value.trim()).flatMap(paragraph=>{
  const heading=PLAYBOOK_TOPICS.find(topic=>clean(paragraph).replace(/:$/,'')===clean(topic.label));
  if(heading){explicitTopic=heading.id;return [];}
  const reference=/^\[PDF pp?\. [^\]]+\]/.exec(paragraph)?.[0] || '';
  const conditional=!!reference && paragraph.length<2500 && /especie|pensa|\bufs?\b/.test(clean(paragraph)) && /anos|concess|pericia|formaliza|representa/.test(clean(paragraph));
  return (conditional?[paragraph]:paragraph.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/)).map(value=>value.trim()).filter(Boolean).map(value=>{
   const normalized=clean(value);
   let topic:PlaybookTopic='general';
   if(/diverge|confirmar|nao esclarec|lacuna|sobrepo|historica|nao generalizar|nao substituir|excecao/.test(normalized))topic='attention';
   else if(/pagas|nao porta|porta bancos|bancos de origem|credores|cip|portabilidade pura|port pura/.test(normalized))topic='portability';
   else if(/idade|anos|especie|beneficio|pension|representa|analfabet|iletrad/.test(normalized))topic='eligibility';
   else if(/document|formaliza|assin|evidencia|whatsapp|autoriz|anuencia|ccb|testemunh/.test(normalized))topic='documents';
   else if(/conta|bancari|ted|pagamento|credito em|reapresenta/.test(normalized))topic='payments';
   else if(/valor|saldo|parcela|troco|taxa|prazo|margem|limite|ticket|refin|portabilidade|%|r\$|\d+x/.test(normalized))topic='amounts';
   return {topic:explicitTopic || topic,context:paragraph.trim(),text:value.replace(/^\[PDF pp?\. [^\]]+\]\s*/,''),reference};
  });
 });
}
