import {cltOutcome,cltPublicMessage} from '../../src/lib/cltSimulationOutcome.js';
import {selectPortabilityQuoteRows} from '../../src/lib/portabilityQuoteSelection.js';

type Product='CLT'|'FGTS'|'INSS';
type Mode='SIMULATION'|'MARGIN';
export type TelegramMarginSummary={messages:string[];hasMargin:boolean;positiveBanks:string[]};
const amount=(value:unknown):number|null=>{
  if(value==null||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0&&n<2_000_000?n:null;
};
const cash=(value:unknown)=>amount(value)==null?'Não informado':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const clean=(input:unknown,limit=210):string=>{
  if(typeof input!=='string')return '';
  const normalized=cltPublicMessage(input)||'';
  return normalized.replace(/[\x00-\x1f\x7f]/g,' ')
    .replace(/\b\d{11}\b/g,'[documento omitido]')
    .replace(/\b\d{10}\b/g,'[benefício omitido]')
    .replace(/\s+/g,' ').trim().slice(0,limit);
};
/** Only a public HTTPS URL returned by a bank adapter, never constructed by the bot. */
export function verifiedTelegramAuthorizationUrl(raw:unknown):string|undefined{
  if(typeof raw!=='string'||raw.length>1500)return;
  try{
    const url=new URL(raw);
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!host.includes('.')||
      host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
      /^(\d+\.){3}\d+$/.test(host)||host.startsWith('[')||/[\s<>]/.test(raw))return;
    url.hash='';
    return url.toString();
  }catch{return;}
}
export function telegramBankName(row:any):string{
  const provider=clean(row?.provider,40)||'Banco não identificado';
  const institution=clean(row?.institution,45);
  return institution&&institution.toLowerCase()!==provider.toLowerCase()
    ?provider+' · '+institution:provider;
}
function normalizedOutcome(row:any):string{
  if(row?.state==='OFFER'&&amount(row.amount)!=null&&Number(row.amount)>0)return 'OFFER';
  if(row?.state==='DATA')return 'DATA';
  if(row?.outcome&&typeof row.outcome==='string')return row.outcome;
  const result=cltOutcome({state:String(row?.state||'PENDING'),message:String(row?.message||'')});
  return result==='OFFER'?'PENDING':result;
}
function permissionDetails(row:any,product:Product):string[]{
  const status=String(row?.data?.authorization?.status||'').toUpperCase();
  const mechanism=String(row?.data?.authorization?.mechanism||'').toUpperCase();
  const link=verifiedTelegramAuthorizationUrl(row?.link);
  const details:string[]=[];
  if(link){
    details.push('🔗 Link de autorização fornecido pela integração: '+link);
    details.push('Confira se o domínio pertence à instituição antes de compartilhar com o cliente.');
  }else if(product==='FGTS'){
    details.push('📱 Orientação: conferir no aplicativo FGTS a autorização de consulta para a instituição indicada; depois atualizar a consulta. O bot não autorizou automaticamente.');
  }else if(mechanism==='SMS'||status==='WAITING_OTP'||status==='REQUESTED'){
    details.push('📲 Autorizar por SMS/OTP ou no canal indicado pelo banco. Se ainda não houve envio, solicite à mesa; o bot não disparou nova autorização.');
  }else if(row?.data?.v8?.nextAction==='CREATE_CONSULT'||row?.data?.v8?.status==='WAITING_CONSENT'){
    details.push('⚙️ A consulta V8 exige autorização pela integração/mesa. Nenhum link foi disponibilizado nesta resposta.');
  }else{
    details.push('🔐 A instituição não disponibilizou um link nesta resposta. Confira a autorização na plataforma do banco ou solicite à mesa.');
  }
  return details;
}
function statusBlock(row:any,product:Product):string[]{
  const name=telegramBankName(row);
  const outcome=normalizedOutcome(row);
  const desc=clean(row.message);
  const header=outcome==='AUTHORIZATION_REQUIRED'?'🔐 Autorização pendente':
    outcome==='INELIGIBLE'?'⛔ Não elegível / restrição da instituição':
    outcome==='MISSING_DATA'?'🧩 Dados/consulta incompletos':
    outcome==='UNSUPPORTED'?'🚫 Modalidade indisponível':
    outcome==='TECHNICAL_ERROR'||row.state==='ERROR'?'⚠️ Falha na integração':'⏳ Aguardando retorno';
  const lines=['\n'+header+' — '+name];
  if(desc)lines.push('Motivo: '+desc);
  if(outcome==='AUTHORIZATION_REQUIRED')lines.push(...permissionDetails(row,product));
  else if(outcome==='TECHNICAL_ERROR'||row.state==='ERROR')lines.push('Próxima ação: tente atualizar a consulta ou acione a mesa; não é recusa de crédito.');
  else if(outcome==='MISSING_DATA')lines.push('Próxima ação: confirme vínculo, dados e eventuais seleções no Portal/mesa.');
  else if(outcome==='PENDING')lines.push('Próxima ação: aguarde o banco e atualize; não há autorização ou recusa confirmada.');
  return lines;
}
const limitMessages=(lines:readonly string[]):string[]=>{
  const messages:string[]=[];let body='';
  for(const line of lines){
    const part=line.slice(0,3250)+'\n';
    if(body.length+part.length>3550&&body){messages.push(body.trimEnd());body='';}
    body+=part;
  }
  if(body)messages.push(body.trimEnd());
  return messages;
};
export function formatTelegramBankSimulation(
  rows:readonly any[],product:Product,operation:string,saved:boolean,
):string[]{
  const grouped=new Map<string,any[]>();
  for(const row of rows){
    if(normalizedOutcome(row)!=='OFFER')continue;
    const bank=telegramBankName(row);
    grouped.set(bank,[...(grouped.get(bank)||[]),row]);
  }
  const offerMap=new Map<string,any>();
  for(const [bank,items] of grouped){
    const selected=product==='INSS'&&['PORT','PORT_REFIN'].includes(operation)?
      selectPortabilityQuoteRows(items,String(items[0]?.provider||bank),{
        name:r=>r.name||r.code,rate:r=>r.rate,amount:r=>r.amount,
      })[0]:[...items].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];
    if(selected)offerMap.set(bank,selected);
  }
  const ordered=[...offerMap.entries()].sort((a,b)=>Number(b[1].amount)-Number(a[1].amount));
  const lines=['📊 SIMULAÇÃO '+product+(product==='INSS'?' · '+operation:'')];
  if(ordered.length){
    lines.push('\n✅ Melhor oferta encontrada por instituição:');
    for(const [bank,row] of ordered.slice(0,15)){
      const valueLabel=product==='FGTS'?'Líquido FGTS estimado':
        product==='INSS'&&['PORT','PORT_REFIN'].includes(operation)?'Troco estimado':
        operation==='REFIN'?'Valor liberado estimado':'Crédito estimado';
      const terms=['\n🏦 '+bank,valueLabel+': '+cash(row.amount)];
      if(amount(row.installment)!=null&&Number(row.installment)>0)terms.push('Parcela: '+cash(row.installment));
      if(amount(row.term)!=null&&Number(row.term)>0)
        terms.push((product==='FGTS'?'Saques: ':'Prazo: ')+Math.trunc(Number(row.term))+(product==='FGTS'?'':' meses'));
      if(amount(row.rate)!=null&&Number(row.rate)>0)terms.push('Taxa: '+Number(row.rate).toLocaleString('pt-BR',{maximumFractionDigits:3})+'% a.m.');
      if(typeof row.name==='string'&&row.name.trim())terms.push('Tabela: '+clean(row.name,70));
      lines.push(terms.join(' · '));
    }
    if(ordered.length>15)lines.push('Outras '+(ordered.length-15)+' instituição(ões) com cotação constam no histórico.');
  }else lines.push('\nNão houve oferta positiva nesta consulta. Confira o retorno de cada banco abaixo.');
  const statusRows=rows.filter(row=>row&&normalizedOutcome(row)!=='OFFER'&&normalizedOutcome(row)!=='DATA');
  const seen=new Set<string>();
  const statuses:string[][]=[];
  for(const row of statusRows){
    const outcome=normalizedOutcome(row);
    const key=[telegramBankName(row),outcome,clean(row.message,120)].join('|');
    if(seen.has(key))continue;
    seen.add(key);statuses.push(statusBlock(row,product));
  }
  if(statuses.length){
    lines.push('\n📋 Situação dos bancos sem oferta:');
    for(const block of statuses.slice(0,30))lines.push(...block);
    if(statuses.length>30)lines.push('\nMais '+(statuses.length-30)+' ocorrências disponíveis no acompanhamento da mesa.');
  }
  if(saved)lines.push('\n✅ Cotações positivas registradas no histórico do parceiro.');
  lines.push('\n⚠️ Estimativas sujeitas à validade, elegibilidade e aprovação bancária. Nenhuma contratação foi realizada.');
  return limitMessages(lines);
}
function availableMargin(row:any):number|null {
  if(row?.state!=='DATA')return null;
  const margin=row?.data?.margin;
  if(!margin||margin.can_continue===false)return null;
  const usable=amount(margin.utilizable_balance);
  const available=amount(margin.available_balance);
  if(usable!=null&&available!=null)return Math.min(usable,available);
  return usable??available;
}
export function formatTelegramCltMargin(rows:readonly any[]):TelegramMarginSummary{
  const lines=['🏛️ CONSULTA CLT · vínculos e margem por instituição',
    'Esta consulta utiliza os canais bancários habilitados e os retornos autorizados. Margem de um banco não é margem confirmada para todos os outros.'];
  const banks:string[]=[];const margins=new Set<string>();
  for(const row of rows){
    const value=availableMargin(row);
    if(value==null)continue;
    const bank=telegramBankName(row),key=bank+'|'+value;
    if(margins.has(key))continue;
    margins.add(key);
    if(value>0)banks.push(bank);
    lines.push('\n✅ '+bank+' · Margem disponível informada: '+cash(value)+
      (value===0?' (sem margem positiva)':'')+
      '\nFonte: retorno da consulta do banco. Nenhuma margem foi presumida.');
  }
  const seen=new Set<string>();
  const statuses:string[][]=[];
  for(const row of rows){
    if(!row||row.state==='OFFER'||(row.state==='DATA'&&availableMargin(row)!=null))continue;
    const key=telegramBankName(row)+'|'+normalizedOutcome(row)+'|'+clean(row.message,110);
    if(seen.has(key))continue;seen.add(key);
    statuses.push(statusBlock(row,'CLT'));
  }
  if(statuses.length){
    lines.push('\n📋 Outros retornos e autorizações:');
    for(const block of statuses.slice(0,25))lines.push(...block);
  }
  lines.push(banks.length?
    '\n✅ Há pelo menos uma margem positiva. Você pode solicitar a simulação pela margem cheia dos bancos que a permitem ou informar um valor e prazo.':
    '\nℹ️ Nenhuma margem positiva foi confirmada nesta etapa. Revise as autorizações e atualize antes de calcular.');
  return {messages:limitMessages(lines),hasMargin:banks.length>0,positiveBanks:[...new Set(banks)]};
}
