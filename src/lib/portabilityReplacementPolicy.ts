import replacement from '../data/portabilityRulesReplacement20261030.json';
import {resolveInstitutionCode,institutionLabel} from './strParticipants';
import type {PortabilityContext} from './portabilityPolicy';
const clean=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const num=(v:unknown)=>v!==''&&v!=null&&typeof v!=='boolean'&&Number.isFinite(Number(v));
const date=(v:unknown)=>{const text=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const d=new Date(text+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===text?d:null;};
const months=(d:Date,n:number,days=0)=>{const target=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1));target.setUTCDate(Math.min(d.getUTCDate(),new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));target.setUTCDate(target.getUTCDate()+days);return target;};
const unique=(rows:string[])=>[...new Set(rows)];
/** Replacement applies only to INSS portability. No historical financial/age fallback is permitted. */
export function evaluateReplacementPolicy(bankId:string,origin:unknown,paid:unknown,input:PortabilityContext){
 const bank=replacement.banks.find(bank=>bank.id===bankId);if(!bank)return null;
 const c:Record<string,any>=bank.criteria,pending:Record<string,string[]>=bank.pending;
 const reasons:string[]=[],notices:string[]=[...(pending.always||[])];
 const pure=['PORT','PORTABILIDADE'].includes(input.operation||'PORT_REFIN');
 const code=resolveInstitutionCode(String(origin||'')),originNames=[clean(origin),clean(institutionLabel(code))];
 if(!code)notices.push('Informe o banco de origem com identificador confirmado.');
 if(c.blocked.includes(code)||c.blockedNames.some((name:string)=>originNames.some(value=>value===clean(name)||value===clean('Banco '+name))))reasons.push(`${bank.name}: banco de origem não permitido pela fonte substitutiva.`);
 const paidValid=num(paid)&&Number.isInteger(Number(paid))&&Number(paid)>=0;
 if(!paidValid)notices.push('Informe parcelas pagas válidas.');
 let minimum=c.paid[code]??(input.originCategory==='CORBAN'?c.corbanPaid:input.originCategory==='NETWORK'?c.networkPaid:undefined)??c.otherPaid;
 if(c.paidByBalance){
  const band=num(input.debt)?c.paidByBalance.find((row:any)=>Number(input.debt)>=row.min&&(row.max==null||Number(input.debt)<=row.max)):null;
  if(!band)notices.push('Faixa de saldo sem exigência de pagas individualizada na fonte substitutiva.');
  else minimum=Math.max(minimum??0,band.paid);
 }
 if(minimum==null)notices.push('Mínimo de pagas por origem/categoria não informado; validar sem presumir a regra antiga.');
 else if(paidValid&&Number(paid)<minimum)reasons.push(`${bank.name}: mínimo de ${minimum} parcelas pagas para a origem e condição informadas.`);
 for(const [key,label] of [['debt','saldo devedor'],['originalInstallment','parcela original'],['remainingInstallments','parcelas restantes'],['term','prazo']] as const){
  if(!num(input[key])||Number(input[key])<=0||(['term','remainingInstallments'].includes(key)&&!Number.isInteger(Number(input[key]))))notices.push(`Informe ${label} válido.`);
 }
 if(!num(input.benefitType))notices.push('Informe a espécie do benefício.');
 const species=Number(input.benefitType),invalid=[32,92].includes(species);
 if([87,88].includes(species))reasons.push(`${bank.name}: portabilidade LOAS/BPC não atendida${bankId==='brb'?' (suspensa)':''}.`);
 if(pure&&c.pure===false)reasons.push(`${bank.name}: não atende portabilidade pura.`);
 if(pure&&c.pure==='conditional')notices.push('Portabilidade pura depende de condição de refinanciamento não detalhada.');
 if(!pure)notices.push(...(pending.refin||[]));
 const today=date(input.simulationDate||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const birth=date(input.birthDate),end=date(input.contractEndDate);
 if(!today)notices.push('Data de cálculo inválida.');
 if(!birth)notices.push('Informe nascimento válido.');
 if(birth&&today){
  if(birth>today)reasons.push('Data de nascimento inválida.');
  if(c.minAge!=null&&!(bankId==='quero-banking'&&invalid)&&today<months(birth,c.minAge*12))reasons.push(`${bank.name}: idade mínima de ${c.minAge} anos.`);
  const maxAge=c.ageByTerm?.[String(input.term)]??c.maxAge;
  const maxMonths=c.startMonthsByTerm?.[String(input.term)]??c.maxStartMonths;
  if(maxAge!=null&&today>=months(birth,(maxAge+1)*12))reasons.push(`${bank.name}: idade máxima de ${maxAge} anos para o prazo.`);
  if(maxMonths!=null&&(c.maxStartDays==null?today>=months(birth,maxMonths+1):today>months(birth,maxMonths,c.maxStartDays)))reasons.push(`${bank.name}: idade no início excede o limite documentado.`);
  if((c.ageByTerm||c.startMonthsByTerm)&&maxAge==null&&maxMonths==null)notices.push('Idade para este prazo não informada; não utilizar faixas anteriores.');
  if(c.maxEndMonths!=null){
   if(!end)notices.push('Confirme a data efetiva de término para validar idade final.');
   else if(c.maxEndDays==null?end>=months(birth,c.maxEndMonths+1):end>months(birth,c.maxEndMonths,c.maxEndDays))reasons.push(`${bank.name}: idade no término excede o limite documentado.`);
  }
  if(end&&end<=today)notices.push('Término do contrato deve ser posterior à data de cálculo.');
  const over60=today>months(birth,720),state=String(input.state||'').toUpperCase();
  if(over60&&c.stateBlockedOver60){
   if(!'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(state))notices.push('UF não informada: validar restrições acima de 60 anos.');
   else if(['AP','PB','TO','RR','SC'].includes(state))reasons.push(`${bank.name}: não atende acima de 60 anos em ${state}.`);
  }
  if(c.formalizationConditional&&(over60||input.illiterate))notices.push('Formalização digital/figital: condições por idade, UF ou alfabetização não detalhadas na nova fonte.');
  if(invalid){
   notices.push(...(pending.invalid||[]));
   if(c.invalidMinAge!=null&&(c.invalidStrictMin?today<=months(birth,c.invalidMinAge*12):today<months(birth,c.invalidMinAge*12)))reasons.push(`${bank.name}: espécies 32/92 exigem ${c.invalidStrictMin?'idade acima de':'a partir de'} ${c.invalidMinAge} anos.`);
  }
 }
 if(input.paymentOrder){
  if(c.paymentOrder===false)reasons.push(`${bank.name}: não permite ordem de pagamento.`);
  else {const rule=c.paymentOrderRules?.[input.paymentOrderBankCode||''];
   if(rule==null||!num(input.paymentOrderAmount))notices.push('Informe banco e valor da ordem de pagamento para validar as condições documentadas.');
   else if(Number(input.paymentOrderAmount)<rule)reasons.push(`${bank.name}: valor da ordem de pagamento abaixo do mínimo de R$ ${Number(rule).toFixed(2)}.`);
  }
 }
 const negative=input.negativeMargin===true||num(input.negativeMarginAmount)&&Number(input.negativeMarginAmount)<0;
 if(negative&&c.negative===false)reasons.push(`${bank.name}: margem negativa não permitida.`);
 if(negative&&c.negative==='deduct'){
  if(!num(input.negativeMarginAmount)||!num(input.portInstallment))notices.push('Informe a margem negativa e a parcela da portabilidade para validar a dedução.');
  else if(num(input.originalInstallment)&&Number(input.portInstallment)>Number(input.originalInstallment)-Math.abs(Number(input.negativeMarginAmount))+.005)reasons.push(`${bank.name}: deduza margem negativa da parcela da portabilidade.`);
 }
 if(Number(input.additionalMargin)>0&&(c.aggregate===false||pure&&c.aggregate==='refinOnly'))reasons.push(`${bank.name}: agregação de margem não permitida nesta modalidade.`);
 if(Number(input.contractCount)>1&&(c.unify===false||pure&&c.unifyRefinOnly))reasons.push(`${bank.name}: unificação não permitida nesta modalidade.`);
 if(typeof c.unify==='number'&&Number(input.contractCount)>c.unify)reasons.push(`${bank.name}: unificação limitada a ${c.unify}.`);
 if(num(input.installment)&&num(input.originalInstallment)&&Number(input.installment)<Number(input.originalInstallment)-.005&&(c.reduce===false||c.reduce==='negativeOnly'&&!negative))reasons.push(`${bank.name}: redução de parcela não permitida neste caso.`);
 if(c.minInstallment!=null&&[input.originalInstallment,input.installment].some(value=>num(value)&&Number(value)<c.minInstallment))reasons.push(`${bank.name}: parcela mínima de R$ ${Number(c.minInstallment).toFixed(2)}.`);
 let minBalance=pure?(c.pureMinBalance??c.minBalance):c.minBalance;
 if(!pure&&c.balanceByRefinRate){
  minBalance=num(input.refinRate)?c.balanceByRefinRate[Number(input.refinRate).toFixed(2)]:undefined;
  if(minBalance==null)notices.push('Saldo mínimo depende da tabela/taxa: condição não individualizada para os parâmetros recebidos.');
 }
 if(minBalance!=null&&num(input.debt)&&Number(input.debt)<minBalance)reasons.push(`${bank.name}: saldo mínimo de R$ ${Number(minBalance).toFixed(2)}.`);
 if(!pure){
  if(c.cashFormulaPending)notices.push('Troco mínimo percentual/por idade sem regra completa; não calcular por suposição.');
  if(c.minCash!=null){if(!num(input.amount))notices.push('Aguardando cálculo do troco mínimo.');else if(Number(input.amount)<c.minCash-.005)reasons.push(`${bank.name}: troco mínimo de R$ ${Number(c.minCash).toFixed(2)}.`);}
 }
 if(c.requiresCip&&input.cipMember!==true)notices.push('Confirme participação da origem na CIP.');
 if(pure){
  if(c.pureMinRate!=null&&num(input.portRate)&&Number(input.portRate)<c.pureMinRate-.00001)reasons.push(`${bank.name}: taxa mínima da portabilidade pura de ${c.pureMinRate}%.`);
  if(c.pureRateRange&&num(input.portRate)&&(Number(input.portRate)<c.pureRateRange[0]-.00001||Number(input.portRate)>c.pureRateRange[1]+.00001))reasons.push(`${bank.name}: taxa da portabilidade pura fora da faixa expressamente documentada.`);
 }else {
  if(c.portRateFixed!=null&&num(input.portRate)&&Math.abs(Number(input.portRate)-c.portRateFixed)>.00001)reasons.push(`${bank.name}: taxa da portabilidade incompatível com o valor documentado.`);
  if(c.refinRateFixed!=null&&num(input.refinRate)&&Math.abs(Number(input.refinRate)-c.refinRateFixed)>.00001)reasons.push(`${bank.name}: taxa do refin incompatível com o valor documentado.`);
 }
 if(c.portPonderationPending&&num(input.portRate))notices.push('Ponderação da taxa de portabilidade sem fórmula na nova fonte.');
 if((c.portRatesListed&&num(input.portRate)||!pure&&c.refinRatesListed&&num(input.refinRate)))notices.push('Taxas separadas por barras sem associação inequívoca à tabela: confirmar enquadramento, sem presumir faixa contínua.');
 const finalReasons=unique(reasons),finalNotices=unique(notices),status=finalReasons.length?'NÃO ELEGÍVEL':finalNotices.length?'PENDENTE DE DADOS':'ELEGÍVEL';
 return {blocked:finalReasons.length>0,review:finalNotices.length>0,status,reason:[...finalReasons,...finalNotices].join(' ')||'Critérios documentados atendidos; sujeito à análise do banco.',reasons:finalReasons,notices:finalNotices,bankId,sources:[{file:replacement.sourceFile,receivedAt:replacement.receivedAt,effectiveAt:replacement.effectiveAt,page:bank.page,sha256:replacement.sourceSha256,precedence:replacement.precedence}]};
}
