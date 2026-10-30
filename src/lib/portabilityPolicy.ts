import { institutionLabel, resolveInstitutionCode } from './strParticipants';
import {portabilitySourceCatalog as source, portabilityRuleSources} from './portabilityRuleSources';
export const PORTABILITY_RULES = source;
const clean = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases: Record<string,string> = {bancodaycoval:'daycoval',c6bank:'c6',c6consig:'c6',factafinanceira:'facta',bancobrb:'brb',nossafintech:'nossa-fintech',happybyx:'happy',byx:'happy',qualibanking:'quali',pbconsignado:'parana',paranabanco:'parana',paranabancosa:'parana',bancoparana:'parana',bancoparanasa:'parana','254':'parana','041':'banrisul','149':'facta','336':'c6','626':'c6','335':'digio','422':'safra','707':'daycoval','623':'pan','555':'pan',bancobanrisul:'banrisul',banrisul:'banrisul',querocredito:'quero-credito',bancopan:'pan',bancosafra:'safra'};
export const portabilityBankId = (name: string) => aliases[clean(name)] || clean(name);
export type PortabilityContext = {
 operation?:string; birthDate?:string; simulationDate?:string; contractEndDate?:string; term?:number;
 benefitType?:string|number; benefitStartDate?:string; state?:string; sex?:string;
 originCategory?:'CORBAN'|'NETWORK'; debt?:number; originalInstallment?:number; installment?:number;
 amount?:number; contractAmount?:number; portRate?:number; refinRate?:number; portInstallment?:number;
 negativeMargin?:boolean; negativeMarginAmount?:number; additionalMargin?:number; contractCount?:number;
 medicalExamDate?:string; paymentOrder?:boolean; illiterate?:boolean; outputPhase?:boolean;
 remainingInstallments?:number; benefitCategory?:'retiree'|'pensioner'; cipMember?:boolean;
};
function date(v:unknown){const s=String(v||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?d:null;}
function months(d:Date,n:number){const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1));t.setUTCDate(Math.min(d.getUTCDate(),new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate()));return t;}
function bound(d:Date,n:number,days=0){const t=months(d,n);t.setUTCDate(t.getUTCDate()+days);return t;}
const has=(v:unknown)=>v!==undefined&&v!==null&&v!==''&&Number.isFinite(Number(v));

/** Explicit company rules only. Missing information is review, never automatic approval. */
export function evaluatePortabilityPolicy(destination:string,origin:unknown,paid:unknown,input:PortabilityContext={}){
 const bankId=portabilityBankId(destination),entry=source.find(r=>r.id===bankId);
 if(!entry)return null;
 const originId=portabilityBankId(String(origin??''));
 const originCodes:Record<string,string>={parana:'254',banrisul:'041',facta:'149',c6:'626',digio:'335',safra:'422',daycoval:'707',pan:'623'};
 const code=resolveInstitutionCode(String(origin??''))||originCodes[originId]||'',name=clean(institutionLabel(code));
 const resolved=portabilityRuleSources(bankId,code,input.originCategory);
 const c:Record<string,any>=resolved.criteria,reasons:string[]=[],notices:string[]=[...resolved.conflicts];
 const pure=['PORT','PORTABILIDADE'].includes(input.operation||'PORT_REFIN');
 if(!code)notices.push('Informe o banco de origem para conferir a portabilidade.');
 if(c.blocked.includes(code)||c.blockedNames.some((n:string)=>{const key=clean(n.replace(/^Banco\s+/i,''));return key.length>3&&name.includes(key);}))reasons.push(`${entry.name}: não aceita portabilidade de ${institutionLabel(code)}.`);
 const validPaid=paid!==''&&paid!=null&&Number.isInteger(Number(paid))&&Number(paid)>=0;
 if(!validPaid)notices.push('Informe uma quantidade válida de parcelas pagas.');
 let minimum=c.paid[code]??(input.originCategory==='CORBAN'?c.corbanPaid:input.originCategory==='NETWORK'?c.networkPaid:undefined)??c.otherPaid;
 if(bankId==='quali'&&has(input.debt)&&Number(input.debt)<6000)minimum=Math.max(minimum??0,c.lowBalancePaid);
 if(bankId==='quali'&&has(input.debt)&&Number(input.debt)>=6000&&c.paid[code]==null){minimum=0;notices.push('Faixa de saldo a partir de R$ 6.000 admite 0 pagas no quadro; confirmar divergência com a regra geral de demais bancos (1 paga).');}
 if(minimum!=null&&validPaid&&Number(paid)<minimum)reasons.push(`${entry.name}: origem ${code} exige ${minimum} parcelas pagas; informadas ${paid}.`);
 if(minimum==null)notices.push('Conferir classificação da origem como banco de rede ou CORBAN e o mínimo de pagas.');
 if(c.specificBanksReview&&c.paid[code]==null)notices.push('PB Consignado: lista dos bancos específicos com 13 pagas não foi enviada; conferir.');
 if(pure&&c.pure===false)reasons.push(`${entry.name}: não atende portabilidade pura.`);
 if(!has(input.remainingInstallments)||!Number.isInteger(Number(input.remainingInstallments))||Number(input.remainingInstallments)<1)notices.push('Informe parcelas restantes válidas.');
 if(!has(input.term)||!Number.isInteger(Number(input.term))||Number(input.term)<1)notices.push('Informe o prazo da operação para conferir idade e condições.');
 if(!has(input.benefitType))notices.push('Informe a espécie do benefício para conferir restrições.');
 if(!has(input.debt)||Number(input.debt)<=0)notices.push('Informe saldo devedor válido.');
 if(!has(input.originalInstallment)||Number(input.originalInstallment)<=0)notices.push('Informe a parcela original válida.');
 if(c.requiresCip&&input.cipMember!==true)notices.push('Confirme participação do banco de origem na CIP.');
 const species=Number(input.benefitType),disability=c.invalidCodes?c.invalidCodes.includes(species):[32,92].includes(species);
 if([87,88].includes(species))reasons.push(`${entry.name}: portabilidade LOAS/BPC não atendida${bankId==='brb'?' (suspensa)':''}.`);
 if(c.deniedSpecies?.includes(species))reasons.push(`${entry.name}: espécie ${species} não atendida.`);
 if(input.paymentOrder&&bankId!=='parana')reasons.push(`${entry.name}: não atende ordem de pagamento.`);
 const today=date(input.simulationDate)||date(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))!;
 const birth=date(input.birthDate),grant=date(input.benefitStartDate),end=date(input.contractEndDate)||(has(input.term)?months(today,Number(input.term)):null);
 if(c.maxEndMonths!=null&&!date(input.contractEndDate))notices.push('Confirme a data efetiva de término do contrato para validar a idade final.');
 if(!birth)notices.push('Informe nascimento para conferir idade.');
 else{
  if(birth>today)reasons.push('Data de nascimento inválida.');
  if(today<months(birth,c.minAge*12))reasons.push(`${entry.name}: idade mínima de ${c.minAge} anos.`);
  const maxYears=c.ageByTerm?.[String(input.term)]??c.maxAge,maxMonths=c.startMonthsByTerm?.[String(input.term)]??c.maxStartMonths;
  if(maxYears!=null&&today>=months(birth,(maxYears+1)*12))reasons.push(`${entry.name}: idade máxima de ${maxYears} anos para o prazo informado.`);
  if(maxMonths!=null&&(c.maxStartDays==null?today>=months(birth,maxMonths+1):today>bound(birth,maxMonths,c.maxStartDays)))reasons.push(`${entry.name}: idade no início excede o limite deste prazo.`);
  if(resolved.ageAlternatives.length&&resolved.ageAlternatives.every(alternative=>{
   const years=alternative.ageByTerm?.[String(input.term)]??alternative.maxAge;
   const limit=alternative.startMonthsByTerm?.[String(input.term)]??alternative.maxStartMonths;
   return (years!=null&&today>=months(birth,(years+1)*12))||(limit!=null&&(alternative.maxStartDays==null?today>=months(birth,limit+1):today>bound(birth,limit,alternative.maxStartDays)));
  }))reasons.push(`${entry.name}: idade no início excede os limites de ambas as fontes documentais.`);
  if((c.ageByTerm||c.startMonthsByTerm)&&maxYears==null&&maxMonths==null)notices.push('Conferir idade: prazo não individualizado no trecho enviado.');
  if(c.maxEndMonths!=null&&end&&(c.maxEndDays==null?end>=months(birth,c.maxEndMonths+1):end>bound(birth,c.maxEndMonths,c.maxEndDays)))reasons.push(`${entry.name}: idade no término excede o limite do roteiro.`);
  if(c.endExclusive&&c.maxEndMonths!=null&&end&&end>=bound(birth,c.maxEndMonths,c.maxEndDays||0))reasons.push(`${entry.name}: contrato deve terminar antes do limite de idade documentado.`);
  if(end&&resolved.ageAlternatives.length&&resolved.ageAlternatives.every(alternative=>alternative.maxEndMonths!=null&&
   (alternative.endExclusive?end>=bound(birth,alternative.maxEndMonths,alternative.maxEndDays||0):alternative.maxEndDays==null?end>=months(birth,alternative.maxEndMonths+1):end>bound(birth,alternative.maxEndMonths,alternative.maxEndDays))))reasons.push(`${entry.name}: idade final excede os limites de ambas as fontes documentais.`);
  const state=String(input.state||'').toUpperCase(),over60=today>months(birth,720);
  if(over60&&c.figitalStates?.includes(state))notices.push(state==='MG'?'Confirmar município (Poço de Caldas no documento) e formalização figital.':'Aplicar formalização figital indicada no documento complementar.');
  if(c.blockedStates?.includes(state))reasons.push(`${entry.name}: não atende residentes em ${state}.`);
  if(over60&&['AP','PB','TO','RR','SC'].includes(state)){
   if(c.stateBlockedOver60)reasons.push(`${entry.name}: não atende acima de 60 anos em ${state}.`);
   else notices.push(bankId==='quali'?'Exige foto do cliente com CCB assinada.':'Aplicar formalização figital conforme roteiro.');
  }
  if(bankId==='havecred'&&state==='GO'&&today>=months(birth,600))notices.push('Goiás, a partir de 50 anos: exige e-mail válido do cliente na formalização.');
  const special=c.speciesMinAge?.[String(species)];
  if(special!=null&&today<months(birth,special*12))reasons.push(`${entry.name}: espécie ${species} exige a partir de ${special} anos.`);
  if(disability&&!c.deniedSpecies?.includes(species)){
   if(c.invalidDenied)reasons.push(`${entry.name}: invalidez não atendida.`);
   if(c.invalidMaxMonths!=null&&today>bound(birth,c.invalidMaxMonths,29))reasons.push(`${entry.name}: idade de invalidez excede limite no início.`);
   if(c.invalidMaxEndMonths!=null&&end&&end>bound(birth,c.invalidMaxEndMonths,29))reasons.push(`${entry.name}: invalidez exige finalizar antes de completar 65 anos.`);
   if(c.invalidEndMinMonths!=null&&end&&(end<bound(birth,c.invalidEndMinMonths)||end>bound(birth,c.invalidEndMaxMonths)))reasons.push(`${entry.name}: término de invalidez fora da faixa de 65 anos e 9 meses a 74 anos e 9 meses.`);
   if(c.invalidMinAge!=null&&today<months(birth,c.invalidMinAge*12))reasons.push(`${entry.name}: invalidez exige a partir de ${c.invalidMinAge} anos.`);
   const free=c.invalidFreeAge||60;
   if(c.invalidYears&&today<months(birth,free*12)){
    if(today<months(birth,660)||(grant&&today<months(grant,c.invalidYears*12))){
     if(c.medicalReview)notices.push('Conferir perícia/Comunicação de Decisão para enquadramento excepcional, conforme roteiro.');
     else reasons.push(`${entry.name}: invalidez abaixo de ${free} anos exige 55 anos completos e ${c.invalidYears} anos de benefício.`);
    }else if(!grant)notices.push(`Informe concessão para confirmar ${c.invalidYears} anos de benefício.`);
   }
   if(bankId==='icred'&&today>=months(birth,720))notices.push(input.sex==='M'?'Homem: Tabela Diferenciada.':input.sex==='F'?'Mulher: Tabela Normal, comissão cheia.':'Confirmar sexo para enquadrar Tabela Diferenciada (homem) ou Normal (mulher).');
  }
 }
 if(!input.state)notices.push('UF não informada: conferir residência e formalização.');
 if(input.illiterate)notices.push('Conferir formalização e documentos do cliente analfabeto.');
 const negative=input.negativeMargin===true||Number(input.negativeMarginAmount)<0;
 if(negative&&c.negative===false)reasons.push(`${entry.name}: margem negativa não permitida.`);
 if(negative&&c.negative==='refinOnly'&&pure)reasons.push(`${entry.name}: margem negativa permitida somente no refinanciamento da portabilidade.`);
 if(negative&&c.negative==='deduct'){
  if(!has(input.negativeMarginAmount))notices.push('Informe valor da margem negativa para conferir dedução da parcela.');
  else {const installment=input.portInstallment??(pure?input.installment:undefined);if(has(installment)&&has(input.originalInstallment)&&Number(installment)>Number(input.originalInstallment)-Math.abs(Number(input.negativeMarginAmount))+0.005)reasons.push(`${entry.name}: deduza margem negativa da parcela da portabilidade.`);else if(!has(installment))notices.push('Conferir dedução da margem negativa na parcela da portabilidade, separada da parcela do refin.');}
 }
 if(Number(input.additionalMargin)>0&&(c.aggregate===false||(c.aggregate==='refinOnly'&&pure)))reasons.push(`${entry.name}: não permite agregar margem nesta operação.`);
 if(typeof c.aggregate==='number'&&Number(input.additionalMargin)>c.aggregate)reasons.push(`${entry.name}: agregação limitada a R$ ${c.aggregate.toFixed(2)}.`);
 if(Number(input.contractCount)>1&&c.unify===false)reasons.push(`${entry.name}: não permite unificar contratos.`);
 if(Number(input.contractCount)>1&&c.unify==='refinOnly'&&pure)reasons.push(`${entry.name}: unificação somente no refinanciamento da portabilidade.`);
 if(typeof c.unify==='number'&&Number(input.contractCount)>c.unify)reasons.push(`${entry.name}: permite unificar até ${c.unify} contratos.`);
 if(has(input.installment)&&has(input.originalInstallment)&&Number(input.installment)<Number(input.originalInstallment)-0.005){
  if(c.reduce===false||(c.reduce==='negativeOnly'&&!negative))reasons.push(`${entry.name}: redução de parcela não permitida neste caso.`);
  if(typeof c.reduce==='number'&&Number(input.installment)<Number(input.originalInstallment)*(1-c.reduce)-0.005)reasons.push(`${entry.name}: redução limitada a ${c.reduce*100}% da parcela original.`);
 }
 if(has(input.installment)&&Number(input.installment)<(c.minInstallment||0))reasons.push(`${entry.name}: parcela mínima de R$ ${c.minInstallment.toFixed(2)}.`);
 let minBalance=pure?(c.pureMinBalance??c.minBalance):c.minBalance;
 if(c.minBalanceByBenefit){if(input.benefitCategory)minBalance=c.minBalanceByBenefit[input.benefitCategory];else notices.push('Informe categoria aposentado/pensionista para conferir saldo mínimo.');}
 if(!pure&&c.balanceByRefinRate&&has(input.refinRate))minBalance=c.balanceByRefinRate[Number(input.refinRate).toFixed(2)]??minBalance;
 if(bankId==='havecred'&&!pure&&has(input.refinRate)&&Number(input.refinRate)>=1.65&&Number(input.refinRate)<=1.70)minBalance=10000;
 if(minBalance!=null&&has(input.debt)&&Number(input.debt)<minBalance)reasons.push(`${entry.name}: saldo mínimo de R$ ${minBalance.toFixed(2)}.`);
 if(!pure&&c.minTotal&&has(input.debt)){
  if(!has(input.amount))notices.push(`Conferir saldo + troco: mínimo total de R$ ${c.minTotal.toFixed(2)}.`);
  else if(Number(input.debt)+Number(input.amount)<c.minTotal-0.005)reasons.push(`${entry.name}: saldo + troco deve atingir R$ ${c.minTotal.toFixed(2)}.`);
 }
 if(!pure&&c.minGrossExclusive){
  if(!has(input.contractAmount))notices.push(`Conferir bruto: deve ser maior que R$ ${c.minGrossExclusive.toFixed(2)}.`);
  else if(Number(input.contractAmount)<=c.minGrossExclusive)reasons.push(`${entry.name}: bruto deve ser maior que R$ ${c.minGrossExclusive.toFixed(2)}.`);
 }
 if(!pure&&has(input.amount)&&c.minCash!=null&&!c.cashReview&&Number(input.amount)<c.minCash-0.005)reasons.push(`${entry.name}: troco mínimo de R$ ${c.minCash.toFixed(2)}.`);
 if(!pure&&c.minCash!=null&&!has(input.amount))notices.push('Aguardando retorno financeiro para conferir o troco mínimo.');
 if(c.portRatesByBenefit&&!input.benefitCategory)notices.push('Informe categoria aposentado/pensionista para conferir taxa de portabilidade.');
 if(c.portRatesByBenefit&&input.benefitCategory&&has(input.portRate)&&Math.abs(Number(input.portRate)-c.portRatesByBenefit[input.benefitCategory])>.00001)reasons.push(`${entry.name}: taxa de portabilidade incompatível com a categoria informada.`);
 if(c.refinRateOptions&&!pure&&has(input.refinRate)&&!c.refinRateOptions.some((rate:number)=>Math.abs(rate-Number(input.refinRate))<.00001))reasons.push(`${entry.name}: taxa do refin não consta nas opções documentadas.`);
 if(c.conditionalRefinRatesReview&&!pure)notices.push('Confirmar o enquadramento financeiro das taxas condicionadas a 10 mil/20 mil com o banco.');
 if(c.portRatesByBalance||c.refinRatesByBalance)notices.push('Confirmar base operacional de TKT 20 mil antes de aplicar taxas condicionais.');
 if(c.pureRateReview&&pure)notices.push('Conferir faixa de taxa da portabilidade pura e condição acima de 500; a base deste limite não foi individualizada.');
 if(has(input.portRate)){
  if(c.portRates&&(Number(input.portRate)<c.portRates[0]-0.00001||Number(input.portRate)>c.portRates[1]+0.00001))reasons.push(`${entry.name}: taxa de portabilidade fora da faixa do roteiro.`);
  if(pure&&c.pureMinRate&&Number(input.portRate)<c.pureMinRate-0.00001)reasons.push(`${entry.name}: portabilidade pura exige taxa mínima de ${c.pureMinRate}%.`);
 }
 if(!pure&&has(input.refinRate)&&c.balanceByRefinRate?.[Number(input.refinRate).toFixed(2)]&&Number(input.refinRate)<c.refinRates[0])notices.push('Taxa consta na tabela de saldos, mas diverge da faixa geral do refin; confirmar tabela com o banco.');
 if(!pure&&has(input.refinRate)&&c.refinRates&&!c.balanceByRefinRate?.[Number(input.refinRate).toFixed(2)]&&(Number(input.refinRate)<c.refinRates[0]-0.00001||Number(input.refinRate)>c.refinRates[1]+0.00001))reasons.push(`${entry.name}: taxa do refin fora da faixa ${c.refinRates[0]}% a ${c.refinRates[1]}%.`);
 if(bankId==='nossa-fintech')notices.push('Confirmar participação do banco de origem na CIP e acordo com o gerente comercial, conforme roteiro.');
 if(bankId==='digio'&&!c.minBalanceByBenefit)notices.push('Saldo mínimo sem prioridade comprovada entre documentos DIGIO; conferir antes de contratar.');
 if(bankId==='icred')notices.push('Taxa da portabilidade obedece ponderação; a fórmula não foi fornecida nesta transcrição.');
 if(bankId==='facta'&&c.paid[code]==null)notices.push('A lista adicional de origens com 15 pagas não foi individualizada; conferir o acordo específico.');
 if(c.balanceByRefinRate&&has(input.refinRate)&&c.balanceByRefinRate[Number(input.refinRate).toFixed(2)]==null)notices.push('Saldo mínimo não individualizado para esta taxa na tabela enviada; conferir com o banco.');
 if(c.cashReview)notices.push('Conferir regra percentual de troco com o comercial; não presumir equivalência ao mínimo fixo.');
 if(c.incomplete)notices.push('Trecho FINANTO incompleto: taxa do refin e mínimos financeiros não foram enviados.');
 const status=reasons.length?'NÃO ELEGÍVEL':notices.length?'PENDENTE DE DADOS':'ELEGÍVEL';
 return {blocked:reasons.length>0,review:notices.length>0,status,reason:[...reasons,...notices].join(' ')||'Critérios informados atendidos; sujeito à análise do banco.',reasons,notices,bankId,sources:resolved.sources};
}
