import {activePortabilityReplacement as replacement,replacementSources} from './portabilityActiveRules';
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
 const reasons:string[]=[],notices:string[]=[],inputIssues:string[]=[];
 const requireInput=(message:string)=>{inputIssues.push(message);notices.push(message);};
 const pure=['PORT','PORTABILIDADE'].includes(input.operation||'PORT_REFIN');
 const code=resolveInstitutionCode(String(origin||'')),originNames=[clean(origin),clean(institutionLabel(code))];
 notices.push(...(pending.always||[]).filter(text=>!(bankId==='daycoval'&&/NBC Bank/i.test(text)&&code&&!originNames.some(name=>name.includes('nbcbank')))));
 if(!code)requireInput('Informe o banco de origem com identificador confirmado.');
 if(c.blocked.includes(code)||c.blockedNames.some((name:string)=>originNames.some(value=>value===clean(name)||value===clean('Banco '+name))))reasons.push(`${bank.name}: banco de origem não permitido pela fonte substitutiva.`);
 const paidValid=num(paid)&&Number.isInteger(Number(paid))&&Number(paid)>=0;
 if(!paidValid)requireInput('Informe parcelas pagas válidas.');
 let minimum=c.paid[code]??(input.originCategory==='CORBAN'?c.corbanPaid:input.originCategory==='NETWORK'?c.networkPaid:undefined)??c.otherPaid;
 // Satisfying both documented categories needs no guess about the creditor's category.
 if(minimum==null&&code&&paidValid&&num(c.corbanPaid)&&num(c.networkPaid)&&Number(paid)>=Math.max(c.corbanPaid,c.networkPaid))minimum=Math.max(c.corbanPaid,c.networkPaid);
 if(c.paidByBalance){
  const band=num(input.debt)?c.paidByBalance.find((row:any)=>Number(input.debt)>=row.min&&(row.max==null||Number(input.debt)<=row.max)):null;
  if(!band)notices.push('Faixa de saldo sem exigência de pagas individualizada na fonte substitutiva.');
  else minimum=Math.max(minimum??0,band.paid);
 }
 if(minimum==null)notices.push('Mínimo de pagas por origem/categoria não informado; validar sem presumir a regra antiga.');
 else if(paidValid&&Number(paid)<minimum)reasons.push(`${bank.name}: mínimo de ${minimum} parcelas pagas para a origem e condição informadas.`);
 for(const [key,label] of [['debt','saldo devedor'],['originalInstallment','parcela original'],['remainingInstallments','parcelas restantes'],['term','prazo']] as const){
  if(input[key]==null||String(input[key])==='')requireInput(`Informe ${label}.`);
  else if(!num(input[key])||Number(input[key])<=0||(['term','remainingInstallments'].includes(key)&&!Number.isInteger(Number(input[key]))))requireInput(`${label[0].toUpperCase()+label.slice(1)} inválido: informe valor positivo${['term','remainingInstallments'].includes(key)?' inteiro':''}.`);
 }
 if(!num(input.benefitType))requireInput('Informe a espécie do benefício.');
 const species=Number(input.benefitType),invalid=(c.invalidSpecies||[32,92]).includes(species);
 if(c.deniedSpecies?.includes(species))reasons.push(`${bank.name}: espécie ${species} não atendida.`);
 if([87,88].includes(species))reasons.push(`${bank.name}: portabilidade LOAS/BPC não atendida${bankId==='brb'?' (suspensa)':''}.`);
 if(pure&&c.pure===false)reasons.push(`${bank.name}: não atende portabilidade pura.`);
 if(pure&&c.pure==='conditional')notices.push('Portabilidade pura depende de condição de refinanciamento não detalhada.');
 if(!pure)notices.push(...(pending.refin||[]));
 const today=date(input.simulationDate||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const birth=date(input.birthDate),end=date(input.contractEndDate);
 if(!today)requireInput('Data de cálculo inválida.');
 if(!birth)requireInput('Informe nascimento válido.');
 if(birth&&today){
  if(birth>today)reasons.push('Data de nascimento inválida.');
  if(c.minAge!=null&&!(bankId==='quero-banking'&&invalid)&&today<months(birth,c.minAge*12))reasons.push(`${bank.name}: idade mínima de ${c.minAge} anos.`);
  if(c.portabilityAgeBands){
   const reference=c.ageReference==='START'?today:c.ageReference==='END'?end:null;
   if(!reference)notices.push(c.ageReference==='END'?'Confirme a data efetiva de término para enquadrar a faixa de idade Daycoval.':'Confirmar referência da idade na tabela Daycoval: contratação ou término.');
   else {
    const band=c.portabilityAgeBands.find((band:any)=>reference>=months(birth,band.minAge*12)&&reference<=months(birth,band.maxMonths,band.maxDays));
    if(!band)reasons.push(`${bank.name}: idade fora das faixas de portabilidade documentadas.`);
    else {
     const effectiveTerm=pure?input.remainingInstallments:input.term;
     if(num(effectiveTerm)&&Number(effectiveTerm)>band.maxTerm)reasons.push(`${bank.name}: prazo máximo de ${band.maxTerm} meses para esta faixa de idade.`);
     if(num(input.contractAmount)){if(Number(input.contractAmount)>band.maxContract)reasons.push(`${bank.name}: valor máximo do contrato de R$ ${band.maxContract.toFixed(2)} para esta faixa de idade.`);}
     else notices.push('Limite máximo do contrato: aguardando valor bruto calculado, sem confundir com saldo ou troco.');
    }
   }
  }
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
  const over60=today>months(birth,720);
  // Explicit operational correction: UF is not a simulation gate for INSS PORT/PORT_REFIN.
  if(c.formalizationConditional&&(over60||input.illiterate))notices.push('Formalização: conferir requisitos por idade ou alfabetização antes da contratação.');
  const speciesMinimum=c.speciesMinAge?.[String(species)],strictMinimum=c.strictSpeciesMinAge?.[String(species)],speciesMaximum=c.speciesMaxStartMonths?.[String(species)];
  if(speciesMinimum!=null&&today<months(birth,speciesMinimum*12))reasons.push(`${bank.name}: espécie ${species} exige a partir de ${speciesMinimum} anos.`);
  if(strictMinimum!=null&&today<=months(birth,strictMinimum*12))reasons.push(`${bank.name}: espécie ${species} exige idade acima de ${strictMinimum} anos.`);
  if(speciesMaximum!=null&&today>=months(birth,speciesMaximum+1))reasons.push(`${bank.name}: idade da espécie ${species} excede o limite no início.`);
  if(invalid){
   notices.push(...(pending.invalid||[]));
   if(c.invalidMinAge!=null&&(c.invalidStrictMin?today<=months(birth,c.invalidMinAge*12):today<months(birth,c.invalidMinAge*12))){
    const exception=c.invalidBenefitException;
    if(exception&&today>=months(birth,exception.minAge*12)){
     const grant=date(input.benefitStartDate);
     if(!grant)notices.push('Informe concessão do benefício para validar a exceção de invalidez.');
     else if(today<months(grant,exception.benefitMonths))reasons.push(`${bank.name}: exceção de invalidez exige ${exception.benefitMonths/12} anos de benefício.`);
    }else if(c.invalidExceptionMinAge!=null&&today>=months(birth,c.invalidExceptionMinAge*12))notices.push('Exceção de invalidez por idade depende de condição não individualizada na fonte.');
    else reasons.push(`${bank.name}: espécie ${species} exige ${c.invalidStrictMin?'idade acima de':'a partir de'} ${c.invalidExceptionMinAge??c.invalidMinAge} anos, observadas as exceções documentadas.`);
   }
   if(c.invalidEndMinMonths!=null||c.invalidEndMaxMonths!=null){
    if(!end)notices.push('Data efetiva de término necessária para validar a faixa de invalidez.');
    else if(c.invalidEndMinMonths!=null&&end<months(birth,c.invalidEndMinMonths)||c.invalidEndMaxMonths!=null&&end>=months(birth,c.invalidEndMaxMonths+1))reasons.push(`${bank.name}: idade final fora da faixa documentada para invalidez.`);
   }
  }
 }
 if(input.paymentOrder){
  if(c.paymentOrder===false)reasons.push(`${bank.name}: não permite ordem de pagamento.`);
  else {const rule=c.paymentOrderRules?.[input.paymentOrderBankCode||''];
   if(rule==null||!num(input.paymentOrderAmount))notices.push('Informe banco e valor da ordem de pagamento para validar as condições documentadas.');
   else if(Number(input.paymentOrderAmount)<rule)reasons.push(`${bank.name}: valor da ordem de pagamento abaixo do mínimo de R$ ${Number(rule).toFixed(2)}.`);
   else if(c.paymentOrderMaxRules?.[input.paymentOrderBankCode||'']!=null&&Number(input.paymentOrderAmount)>c.paymentOrderMaxRules[input.paymentOrderBankCode||''])reasons.push(`${bank.name}: valor da ordem de pagamento acima do máximo documentado.`);
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
 if(typeof c.reduce==='number'&&num(input.installment)&&num(input.originalInstallment)&&Number(input.installment)<Number(input.originalInstallment)*(1-c.reduce)-.005)reasons.push(`${bank.name}: redução limitada a ${c.reduce*100}% da parcela original.`);
 if(c.minInstallment!=null&&[input.originalInstallment,input.installment].some(value=>num(value)&&Number(value)<c.minInstallment))reasons.push(`${bank.name}: parcela mínima de R$ ${Number(c.minInstallment).toFixed(2)}.`);
 let minBalance=pure?(c.pureMinBalance??c.minBalance):c.minBalance;
 if(!pure&&c.balanceByRefinRate){
  minBalance=num(input.refinRate)?c.balanceByRefinRate[Number(input.refinRate).toFixed(2)]:undefined;
  if(minBalance==null)notices.push('Saldo mínimo depende da tabela/taxa: condição não individualizada para os parâmetros recebidos.');
 }
 if(!pure&&c.refinBalanceRange&&num(input.refinRate)&&Number(input.refinRate)>=c.refinBalanceRange.minRate-.00001&&Number(input.refinRate)<=c.refinBalanceRange.maxRate+.00001)minBalance=c.refinBalanceRange.minBalance;
 if(minBalance!=null&&num(input.debt)&&Number(input.debt)<minBalance)reasons.push(`${bank.name}: saldo mínimo de R$ ${Number(minBalance).toFixed(2)}.`);
 if(!pure){
  if(c.minTotal!=null){if(!num(input.amount))notices.push('Aguardando cálculo do total de saldo mais troco.');else if(num(input.debt)&&Number(input.debt)+Number(input.amount)<c.minTotal-.005)reasons.push(`${bank.name}: saldo mais troco deve atingir R$ ${c.minTotal.toFixed(2)}.`);}
  if(c.minGrossExclusive!=null){if(!num(input.contractAmount))notices.push('Bruto do refinanciamento necessário para validar o saldo mínimo condicional.');else if(Number(input.contractAmount)<=c.minGrossExclusive)reasons.push(`${bank.name}: bruto do refinanciamento deve ser superior a R$ ${c.minGrossExclusive.toFixed(2)}.`);}
  if(c.minCashPercent!=null){
   if(!num(input.term)||c.percentCashTermGap?.includes(Number(input.term)))notices.push('Regra percentual de troco não individualizada para este prazo.');
   else if(!num(input.contractAmount)||!num(input.amount))notices.push('Aguardando bruto do novo contrato e troco para validar o mínimo percentual.');
   else if(Number(input.amount)<Number(input.contractAmount)*c.minCashPercent-.005)reasons.push(`${bank.name}: troco mínimo de ${c.minCashPercent*100}% do novo endividamento.`);
  }
  if(c.cashFormulaPending)notices.push('Troco mínimo percentual/por idade sem regra completa; não calcular por suposição.');
  if(c.minCash!=null){if(!num(input.amount))notices.push('Aguardando cálculo do troco mínimo.');else if(Number(input.amount)<c.minCash-.005)reasons.push(`${bank.name}: troco mínimo de R$ ${Number(c.minCash).toFixed(2)}.`);}
 }
 // Banco do Brasil 001: membership explicitly confirmed by the responsible operator.
 if(c.requiresCip&&input.cipMember!==true&&code!=='001')notices.push('Confirme participação da origem na CIP.');
 if(pure){
  if(c.pureMinRate!=null&&num(input.portRate)&&Number(input.portRate)<c.pureMinRate-.00001)reasons.push(`${bank.name}: taxa mínima da portabilidade pura de ${c.pureMinRate}%.`);
  if(c.pureRateRange&&num(input.portRate)&&(Number(input.portRate)<c.pureRateRange[0]-.00001||Number(input.portRate)>c.pureRateRange[1]+.00001))reasons.push(`${bank.name}: taxa da portabilidade pura fora da faixa expressamente documentada.`);
 }else {
  if(c.portRateFixed!=null&&num(input.portRate)&&Math.abs(Number(input.portRate)-c.portRateFixed)>.00001)reasons.push(`${bank.name}: taxa da portabilidade incompatível com o valor documentado.`);
  if(c.refinRateFixed!=null&&num(input.refinRate)&&Math.abs(Number(input.refinRate)-c.refinRateFixed)>.00001)reasons.push(`${bank.name}: taxa do refin incompatível com o valor documentado.`);
 }
 if(c.portPonderationPending&&num(input.portRate))notices.push('Ponderação da taxa de portabilidade sem fórmula na nova fonte.');
 if((c.portRatesListed&&num(input.portRate)||!pure&&c.refinRatesListed&&num(input.refinRate)))notices.push('Taxas listadas sem associação inequívoca à tabela: confirmar enquadramento, sem presumir faixa contínua.');
 const finalReasons=unique(reasons),finalNotices=unique(notices),status=finalReasons.length?'NÃO ELEGÍVEL':finalNotices.length?'PENDENTE DE DADOS':'ELEGÍVEL';
 return {blocked:finalReasons.length>0,review:finalNotices.length>0,calculationAllowed:finalReasons.length===0&&inputIssues.length===0,inputIssues:unique(inputIssues),status,reason:[...finalReasons,...finalNotices].join(' ')||'Critérios documentados atendidos; sujeito à análise do banco.',reasons:finalReasons,notices:finalNotices,bankId,sources:replacementSources(bank)};
}
