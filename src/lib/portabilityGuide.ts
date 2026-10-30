import {portabilityRuleSources,portabilitySourceCatalog,PORTABILITY_REPLACEMENT} from './portabilityRuleSources';
import {institutionLabel} from './strParticipants';

const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const names=(codes:string[])=>codes.map(code=>institutionLabel(code).replace(/^\d+\s*-\s*/,'')).join(', ');
export function portabilityGuide(bankId:string){
 const bank=portabilitySourceCatalog.find(bank=>bank.id===bankId);if(!bank)return null;
 const {criteria:c,conflicts,sources}=portabilityRuleSources(bankId,'');
 const replacement=PORTABILITY_REPLACEMENT.banks.find(bank=>bank.id===bankId);
 const unresolved=replacement?Object.values(replacement.pending).flat():[];
 const summary:{label:string;value:string}[]=[];
 const add=(label:string,value:unknown)=>{if(value!==undefined&&value!==null&&value!=='')summary.push({label,value:String(value)});};
 add('Modalidade',c.pure===false?'Refinanciamento da portabilidade':c.pure===true?'Portabilidade e refinanciamento':'Conferir modalidades nos documentos');
 if(c.minAge!==undefined)add('Idade mínima',`${c.minAge} anos`);
 if(c.maxAge!==undefined)add('Idade máxima',`${c.maxAge} anos`);
 else if(c.maxStartMonths!==undefined)add('Idade máxima',`${Math.floor(c.maxStartMonths/12)} anos e ${c.maxStartMonths%12} meses${c.maxStartDays!==undefined?` e ${c.maxStartDays} dias`:''}`);
 if(c.maxEndMonths!=null)add('Idade máxima no término',`${Math.floor(c.maxEndMonths/12)} anos e ${c.maxEndMonths%12} meses${c.maxEndDays!=null?` e ${c.maxEndDays} dias`:''}`);
 if(c.ageByTerm)add('Idade por prazo',Object.entries(c.ageByTerm).map(([term,age])=>`${term} meses: até ${age} anos`).join(' / '));
 if(c.startMonthsByTerm)add('Idade por prazo',Object.entries(c.startMonthsByTerm).map(([term,age])=>`${term} meses: até ${Math.floor(Number(age)/12)} anos e ${Number(age)%12} meses`).join(' / '));
 if(c.portRateFixed!=null)add('Taxa de portabilidade',`${Number(c.portRateFixed).toLocaleString('pt-BR')}%`);
 if(c.refinRateFixed!=null)add('Taxa de refinanciamento',`${Number(c.refinRateFixed).toLocaleString('pt-BR')}%`);
 if(c.minInstallment!==undefined)add('Parcela mínima',c.minInstallment===0?'Sem parcela mínima':money(c.minInstallment));
 if(c.minBalance!==undefined)add('Saldo mínimo',c.minBalance===0?'Sem saldo mínimo geral':money(c.minBalance));
 if(typeof c.pureMinBalance==='number')add('Saldo mínimo · portabilidade pura',money(c.pureMinBalance));
 if(typeof c.minCash==='number')add('Troco mínimo',money(c.minCash));
 if(Array.isArray(c.portRatesListed??c.portRates)&&(c.portRatesListed??c.portRates).every((value:unknown)=>typeof value==='number'))add('Taxas de portabilidade documentadas',(c.portRatesListed??c.portRates).map((value:number)=>`${value.toLocaleString('pt-BR')}%`).join(' / '));
 if(Array.isArray(c.refinRatesListed??c.refinRates)&&(c.refinRatesListed??c.refinRates).every((value:unknown)=>typeof value==='number'))add('Taxas de refinanciamento documentadas',(c.refinRatesListed??c.refinRates).map((value:number)=>`${value.toLocaleString('pt-BR')}%`).join(' / '));
 add('Parcelas pagas',c.otherPaid!==undefined?`A partir de ${c.otherPaid}, com exceções por origem`:'Conforme banco de origem');
 if(c.negative!==undefined)add('Margem negativa',c.negative===false?'Não aceita':c.negative==='refinOnly'?'Somente no refinanciamento':c.negative==='deduct'?'Com dedução na parcela':'Aceita, conforme condições');
 if(c.pure!==undefined)add('Portabilidade pura',c.pure?'Permitida':'Não permitida');
 const restrictions=c.blocked.length?[`Origens bloqueadas confirmadas: ${names(c.blocked)}.`]:[];
 if(c.unify===false)restrictions.push('Não permite unificação de contratos.');
 if(typeof c.unify==='number')restrictions.push(`Unificação limitada a ${c.unify} contratos.`);
 if(c.reduce===false)restrictions.push('Não permite redução de parcela.');
 if(c.reduce==='negativeOnly')restrictions.push('Redução de parcela somente com margem negativa.');
 if(typeof c.reduce==='number')restrictions.push(`Redução limitada a ${c.reduce*100}% da parcela original.`);
 return {convenio:'INSS',summary,restrictions,hasConflicts:conflicts.length>0,sources,
  details:[...conflicts,...unresolved],agreements:Object.entries(c.paid).map(([code,paid])=>({origin:names([code]),paid})),
  status:'PENDENTE DE DADOS'};
}
