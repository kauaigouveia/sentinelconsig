import {portabilityRuleSources,portabilitySourceCatalog} from './portabilityRuleSources';
import {institutionLabel} from './strParticipants';

const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const names=(codes:string[])=>codes.map(code=>institutionLabel(code).replace(/^\d+\s*-\s*/,'')).join(', ');
export function portabilityGuide(bankId:string){
 const bank=portabilitySourceCatalog.find(bank=>bank.id===bankId);if(!bank)return null;
 const {criteria:c,conflicts,sources}=portabilityRuleSources(bankId,'');
 const summary:{label:string;value:string}[]=[];
 const add=(label:string,value:unknown)=>{if(value!==undefined&&value!==null&&value!=='')summary.push({label,value:String(value)});};
 add('Modalidade',c.pure===false?'Refinanciamento da portabilidade':c.pure===true?'Portabilidade e refinanciamento':'Conferir modalidades nos documentos');
 if(c.minAge!==undefined)add('Idade mínima',`${c.minAge} anos`);
 if(c.maxAge!==undefined)add('Idade máxima',`${c.maxAge} anos`);
 else if(c.maxStartMonths!==undefined)add('Idade máxima',`${Math.floor(c.maxStartMonths/12)} anos e ${c.maxStartMonths%12} meses${c.maxStartDays!==undefined?` e ${c.maxStartDays} dias`:''}`);
 if(c.minInstallment!==undefined)add('Parcela mínima',c.minInstallment===0?'Sem mínimo informado como obrigatório':money(c.minInstallment));
 if(c.minBalance!==undefined)add('Saldo mínimo',c.minBalance===0?'Sem mínimo documentado':money(c.minBalance));
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
  details:conflicts,agreements:Object.entries(c.paid).map(([code,paid])=>({origin:names([code]),paid})),
  status:'PENDENTE DE DADOS'};
}
