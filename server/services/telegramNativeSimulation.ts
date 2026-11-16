import {isValidCpf} from '../../src/lib/utils.js';
import {normalizeTelegramMenuInput,type TelegramSimulationTarget} from './telegramProductMenu.js';

/**
 * Short-lived Telegram conversation for the *existing* Sentinel simulator.
 * Answers are encrypted by telegramNotificationService, never logged in this module.
 */
export type TelegramNativeProduct=TelegramSimulationTarget['product'];
export type TelegramNativeOperation='NEW'|'REFIN'|'PORT'|'PORT_REFIN';
export type TelegramNativeField='cpf'|'name'|'phone'|'mode'|'birthDate'|'benefitNumber'|'benefitType'|'state'|'benefitStartDate'|
  'value'|'term'|'income'|'illiterate'|'originalBank'|'originalContract'|'debt'|'originalTerm'|'remainingTerm'|'originalInstallment'|'c6Contract';
export type TelegramNativeDraft={
  product:TelegramNativeProduct;
  operation:TelegramNativeOperation;
  index:number;
  values:Partial<Record<TelegramNativeField,string>>;
  expires:number;
};
type Step={field:TelegramNativeField;prompt:string;optional?:boolean};
const CPF:Step={field:'cpf',prompt:'Informe o CPF do cliente (11 dígitos). Use apenas conversa privada e confirme que você tem autorização do titular.'};
const NAME:Step={field:'name',prompt:'Qual o nome completo do cliente?'};
const PHONE:Step={field:'phone',prompt:'Qual o telefone do cliente com DDD (10 ou 11 números)?'};
const INST:Step={field:'value',prompt:'Qual valor deseja simular como parcela mensal? Ex.: 350,00'};
const MODE:Step={field:'mode',prompt:'Como deseja simular? Responda PARCELA (mensalidade) ou VALOR (crédito líquido).'};
const BIRTH:Step={field:'birthDate',prompt:'Data de nascimento do beneficiário (DD/MM/AAAA).'};
const BENEFIT:Step={field:'benefitNumber',prompt:'Número do benefício INSS (apenas números).'};
const BENEFIT_TYPE:Step={field:'benefitType',prompt:'Código da espécie do benefício INSS (ex.: 32 ou 41).'};
const STATE:Step={field:'state',prompt:'UF do benefício (ex.: AL, SP, RJ).'};
const TERM:Step={field:'term',prompt:'Prazo desejado em meses (ex.: 108, 96, 84, 72 ou 60).'};
const LITERACY:Step={field:'illiterate',prompt:'O beneficiário é analfabeto? Responda SIM ou NÃO.'};
const OPTIONAL_PHONE:Step={...PHONE,optional:true,prompt:'Telefone com DDD para integrações que exigem contato. Digite o telefone ou PULAR.'};
const OPTIONAL_NAME:Step={...NAME,optional:true,prompt:'Nome completo do beneficiário para integrações que exigem identificação. Digite o nome ou PULAR.'};
const BENEFIT_START:Step={field:'benefitStartDate',optional:true,prompt:'Data de concessão/início do benefício (DD/MM/AAAA), se disponível. Digite PULAR se não souber.'};
const INCOME:Step={field:'income',optional:true,prompt:'Renda mensal do benefício (R$), se conhecida, para ampliar as consultas bancárias. Digite PULAR se não souber.'};
const C6CONTRACT:Step={field:'c6Contract',optional:true,prompt:'Número do contrato C6 a refinanciar, se for um contrato C6. Caso contrário, PULAR.'};

const UFS=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const dateValue=(raw:string):string|null=>{
  let year='',month='',day='';
  const a=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const b=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(a){[,day,month,year]=a;}else if(b){[,year,month,day]=b;}else return null;
  const iso=year+'-'+month+'-'+day;
  const d=new Date(iso+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso&&d.getTime()<Date.now()?iso:null;
};
const currency=(s:string):number|null=>{
  const raw=s.trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if(!/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$|^\d+(?:\.\d{1,2})?$/.test(raw))return null;
  const n=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);
  return Number.isFinite(n)&&n>0&&n<=2_000_000?Math.round(n*100)/100:null;
};
export function telegramNativeSteps(target:Pick<TelegramNativeDraft,'product'|'operation'>):Step[]{
  if(target.product==='CLT')return [CPF,NAME,PHONE,MODE,INST];
  if(target.product==='FGTS')return [CPF,{field:'term',prompt:'Quantos saques-aniversário deseja antecipar? Informe de 1 a 10.'}];
  const basic=[CPF,BIRTH,BENEFIT,BENEFIT_TYPE,STATE,BENEFIT_START,OPTIONAL_NAME,OPTIONAL_PHONE];
  if(['PORT','PORT_REFIN'].includes(target.operation))return [
    ...basic,
    {field:'originalBank',prompt:'Código do banco de origem (3 dígitos, ex.: 237).'},
    {field:'originalContract',prompt:'Número do contrato de origem (não envie fotos nem documentos).'},
    {field:'debt',prompt:'Saldo devedor atualizado da portabilidade (R$).'},
    {field:'originalTerm',prompt:'Prazo original do contrato em meses (ex.: 84).'},
    {field:'remainingTerm',prompt:'Quantas parcelas ainda estão em aberto?'},
    {field:'originalInstallment',prompt:'Valor original da parcela portada (R$).'},
    ...(target.operation==='PORT_REFIN'?[INST,TERM]:[]),
    LITERACY,
  ];
  return [...basic,MODE,INST,TERM,LITERACY,INCOME,...(target.operation==='REFIN'?[C6CONTRACT]:[])];
}
export function beginTelegramNativeSimulation(
  target:TelegramSimulationTarget,now=Date.now(),
):TelegramNativeDraft {
  const operation:TelegramNativeOperation=target.product==='INSS'?target.operation||'NEW':'NEW';
  const draft={product:target.product,operation,index:0,values:{},expires:now+10*60_000};
  if(!telegramNativeSteps(draft).length)throw Error('Produto não disponível.');
  return draft;
}
const masked=(raw:string,suffix=4)=>raw.length>suffix?'••••'+raw.slice(-suffix):'••••';
export function telegramNativePrompt(draft:TelegramNativeDraft):string {
  const steps=telegramNativeSteps(draft);
  const step=steps[draft.index];
  if(!step)return telegramNativeSummary(draft);
  const title=draft.product==='INSS'?'INSS '+({NEW:'Novo',REFIN:'Refinanciamento',PORT:'Portabilidade',PORT_REFIN:'Portabilidade + Refin'}[draft.operation]):draft.product;
  return '💬 Simulação '+title+' · etapa '+(draft.index+1)+'/'+steps.length+
    '\n\n'+(step.field==='value'&&draft.values.mode==='Liquid'?'Qual valor líquido de crédito deseja solicitar? Ex.: 5.000,00':step.prompt)+
    (step.optional?'\n\nCampo opcional: utilize PULAR.':'')+
    '\n\nEnvie somente o dado solicitado. Use 🏠 Menu principal para cancelar.';
}
export function acceptTelegramNativeAnswer(draft:TelegramNativeDraft,answer:string):
  {ok:true;draft:TelegramNativeDraft;finished:boolean}|{ok:false;error:string} {
  if(Date.now()>draft.expires)return {ok:false,error:'Esta consulta expirou. Abra a modalidade novamente para iniciar uma nova simulação.'};
  const step=telegramNativeSteps(draft)[draft.index];
  if(!step)return {ok:false,error:'Esta consulta já está pronta para confirmação.'};
  const input=String(answer||'').trim().slice(0,200);
  const normalized=normalizeTelegramMenuInput(input);
  if(step.optional&&['pular','nao sei','não sei','ignorar'].includes(normalized)){
    const next={...draft,index:draft.index+1,expires:Date.now()+10*60_000,values:{...draft.values}};
    return {ok:true,draft:next,finished:next.index===telegramNativeSteps(next).length};
  }
  let value=input,ok=true;
  switch(step.field){
    case 'mode':value=['parcela','mensalidade','payment'].includes(normalized)?'Payment':
      ['valor','liquido','valor liquido','liquid'].includes(normalized)?'Liquid':'';ok=!!value;break;
    case 'cpf':value=input.replace(/\D/g,'');ok=/^\d{11}$/.test(value)&&isValidCpf(value);break;
    case 'name':value=input.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();ok=value.length>=3&&value.length<=120&&!/\d{7,}/.test(value);break;
    case 'phone':value=input.replace(/\D/g,'');ok=/^\d{10,11}$/.test(value);break;
    case 'birthDate':case 'benefitStartDate':{const v=dateValue(input);ok=!!v;value=v||'';break;}
    case 'benefitNumber':value=input.replace(/\D/g,'');ok=/^\d{6,12}$/.test(value);break;
    case 'benefitType':value=input.replace(/\D/g,'');ok=/^\d{1,3}$/.test(value)&&Number(value)>0;break;
    case 'state':value=input.toUpperCase();ok=UFS.has(value);break;
    case 'illiterate':value=['sim','yes','s'].includes(normalized)?'YES':['nao','no','n'].includes(normalized)?'NO':'';ok=!!value;break;
    case 'originalBank':value=input.replace(/\D/g,'');ok=/^\d{1,3}$/.test(value);break;
    case 'originalContract':value=input;ok=value.length>=3&&value.length<=100&&!/[\x00-\x1f\x7f]/.test(value);break;
    case 'value':case 'debt':case 'originalInstallment':case 'income':{
      const v=currency(input);ok=v!=null;value=v==null?'':String(v);break;
    }
    case 'term':case 'originalTerm':case 'remainingTerm':{
      const v=Number(input);const max=draft.product==='FGTS'?10:120;
      ok=/^\d{1,3}$/.test(input)&&Number.isInteger(v)&&v>=1&&v<=max;value=String(v);break;
    }
    case 'c6Contract':ok=value.length>=3&&value.length<=100&&!/[\x00-\x1f\x7f]/.test(value);break;
  }
  if(!ok)return {ok:false,error:'Valor inválido para este campo. Confira o formato e tente novamente.\n\n'+telegramNativePrompt(draft)};
  const next={...draft,index:draft.index+1,expires:Date.now()+10*60_000,values:{...draft.values,[step.field]:value}};
  if(next.values.originalTerm&&next.values.remainingTerm&&
    Number(next.values.remainingTerm)>Number(next.values.originalTerm))
    return {ok:false,error:'As parcelas em aberto não podem superar o prazo original. Corrija o valor.\n\n'+telegramNativePrompt(draft)};
  return {ok:true,draft:next,finished:next.index===telegramNativeSteps(next).length};
}
const money=(value:unknown)=>Number.isFinite(Number(value))&&Number(value)>0
  ?Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
export function telegramNativeSummary(draft:TelegramNativeDraft):string {
  const v=draft.values;
  const entries=[
    '📋 Confira antes de consultar os bancos',
    'Produto: '+draft.product+(draft.product==='INSS'?' · '+draft.operation:''),
    'Cliente: CPF '+masked(v.cpf||''),
    ...(v.benefitNumber?['Benefício: '+masked(v.benefitNumber)]:[]),
    ...(v.birthDate?['Nascimento: '+v.birthDate.split('-').reverse().join('/')]:[]),
    ...(v.benefitType?['Espécie: '+v.benefitType]:[]),
    ...(v.state?['UF: '+v.state]:[]),
    ...(v.value?[(v.mode==='Liquid'?'Crédito líquido solicitado: ':'Parcela solicitada: ')+money(v.value)]:[]),
    ...(v.originalInstallment?['Parcela original: '+money(v.originalInstallment)]:[]),
    ...(v.debt?['Saldo devedor: '+money(v.debt)]:[]),
    ...(v.originalBank?['Banco origem: '+v.originalBank]:[]),
    ...(v.term?['Prazo/saques: '+v.term]:[]),
    ...(v.illiterate?['Analfabeto: '+(v.illiterate==='YES'?'Sim':'Não')]:[]),
    '',
    'Ao confirmar, declaro ter autorização do titular para consultar as instituições habilitadas da empresa. A consulta pode transmitir os dados informados aos bancos integrados. Cálculo não é aprovação nem contratação.',
    '',
    'Selecione ✅ Confirmar simulação ou 🏠 Menu principal para cancelar.',
  ];
  return entries.join('\n').slice(0,3900);
}
export function toTelegramNativeInput(draft:TelegramNativeDraft,partnerId:string):Record<string,unknown>{
  const v=draft.values;
  const product=draft.product,operation=product==='INSS'?draft.operation:'NEW';
  const input:Record<string,unknown>={
    product,operation,cpf:v.cpf,name:v.name||'',phone:v.phone||'',
    mode:v.mode||'Payment',term:Number(v.term??(product==='CLT'?'0':product==='FGTS'?'4':'108')),
    value:Number(v.value??v.originalInstallment??'0'),
    eligibility:true,autoConditions:false,automaticAuthorization:false,observeOnly:true,
    partnerId,
  };
  if(product==='INSS'){
    Object.assign(input,{
      birthDate:v.birthDate,benefitNumber:v.benefitNumber,benefitType:Number(v.benefitType),
      state:v.state,benefitStartDate:v.benefitStartDate||'',
      income:Number(v.income||0),illiterate:v.illiterate||'NO',
      rate:undefined,legalRepresentative:false,hasInsurance:false,
      ...(v.c6Contract?{c6Contract:v.c6Contract}:{}),
    });
    if(['PORT','PORT_REFIN'].includes(operation))Object.assign(input,{
      originalBank:v.originalBank,originalContract:v.originalContract,
      debt:Number(v.debt),originalTerm:Number(v.originalTerm),
      remainingTerm:Number(v.remainingTerm),originalInstallment:Number(v.originalInstallment),
    });
  }
  return input;
}
export function formatTelegramNativeResults(
  rows:readonly any[],product:TelegramNativeProduct,operation:TelegramNativeOperation,
  saved:boolean,
):string[]{
  const candidates=rows.filter(r=>r&&r.state==='OFFER'&&Number.isFinite(Number(r.amount))&&Number(r.amount)>0);
  const best=new Map<string,any>();
  for(const offer of candidates){
    const bank=String(offer.provider||offer.institution||'Banco').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,45);
    const prior=best.get(bank);
    if(!prior||Number(offer.amount)>Number(prior.amount))best.set(bank,offer);
  }
  const offers=[...best.entries()].sort((a,b)=>Number(b[1].amount)-Number(a[1].amount)).slice(0,12);
  const totalBanks=best.size;
  const lines=['📊 Simulação '+product+(product==='INSS'?' · '+operation:'')];
  if(!offers.length)lines.push('\nNenhuma cotação com valor positivo foi retornada nesta consulta.');
  else{
    lines.push('\nMelhor condição calculada por banco:');
    for(const [bank,offer] of offers){
      const values=['🏦 '+bank];
      const valueLabel=product==='FGTS'?'Líquido estimado':product==='INSS'&&['PORT','PORT_REFIN'].includes(operation)?'Troco estimado':
        operation==='REFIN'?'Valor liberado estimado':'Valor do crédito estimado';
      values.push(valueLabel+': '+money(offer.amount));
      if(Number.isFinite(Number(offer.installment))&&Number(offer.installment)>0)values.push('Parcela: '+money(offer.installment));
      if(Number.isFinite(Number(offer.term))&&Number(offer.term)>0)values.push((product==='FGTS'?'Antecipação: ':'Prazo: ')+Math.trunc(offer.term)+(product==='FGTS'?' saques':' meses'));
      if(Number.isFinite(Number(offer.rate))&&Number(offer.rate)>0)values.push('Taxa informada: '+Number(offer.rate).toLocaleString('pt-BR',{maximumFractionDigits:3})+'% a.m.');
      lines.push('\n'+values.join(' · '));
    }
    if(totalBanks>offers.length)lines.push('\n'+(totalBanks-offers.length)+' outros bancos retornaram resultados. Consulte o histórico para ver todas as condições.');
  }
  const pending=rows.filter(r=>r&&(r.state==='PENDING'||r.outcome==='AUTHORIZATION_REQUIRED'));
  if(pending.length){
    lines.push('\n⏳ '+pending.length+' retorno(s) dependem de autorização, elegibilidade ou processamento bancário. A mesa poderá conferir os detalhes.');
  }
  const errors=rows.filter(r=>r?.state==='ERROR');
  if(errors.length)lines.push('\n⚠️ '+errors.length+' instituição(ões) não concluíram a consulta. Não foram criadas ofertas fictícias.');
  if(saved)lines.push('\n✅ Resultados positivos registrados no histórico de simulações da empresa e do parceiro.');
  lines.push('\n⚠️ Condições preliminares, sujeitas a política, validade, biometria, autorização e aprovação bancária. Nenhuma contratação foi realizada.');
  const output:string[]=[];let current='';
  for(const line of lines){
    if(current.length+line.length>3500){output.push(current);current='';}
    current+=line+'\n';
  }
  if(current)output.push(current);
  return output;
}
