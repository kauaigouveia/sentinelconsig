import {EligibilityResult} from './EligibilityResult';
import {portabilityGuide} from '../../lib/portabilityGuide';
import {eligibilityPresentation,eligibilityRank} from '../../lib/eligibilityPresentation';
import React, {useState,useEffect} from 'react';
import type { PlaybookInput } from '../../lib/bankPlaybooks';
import { PORTABILITY_RULES, evaluatePortabilityPolicy } from '../../lib/portabilityPolicy';
export function BankPlaybooksPanel({portal=false,input,onDiagnosticsPermission}:{input?:PlaybookInput;portal?:boolean;onDiagnosticsPermission?:(allowed:boolean)=>void}) {
 const [destination,setDestination]=useState('ALL');
 const [canDiagnose,setCanDiagnose]=useState(false);
 useEffect(()=>{
  if(portal)return;
  let controller:AbortController;
  const refresh=()=>{controller?.abort();controller=new AbortController();const request=controller;setCanDiagnose(false);onDiagnosticsPermission?.(false);
   void fetch('/api/bank-playbooks',{cache:'no-store',signal:request.signal}).then(async response=>{if(!response.ok)return;const data=await response.json();if(!request.signal.aborted){setCanDiagnose(data.canDiagnose===true);onDiagnosticsPermission?.(data.canDiagnose===true);}}).catch(()=>{});
  };
  refresh();window.addEventListener('tenantUpdated',refresh);
  return ()=>{controller?.abort();window.removeEventListener('tenantUpdated',refresh);};
 },[portal,onDiagnosticsPermission]);
 const rows=!portal&&input&&['PORT','PORT_REFIN'].includes(input.operation)?PORTABILITY_RULES.map(bank=>({bank,check:evaluatePortabilityPolicy(bank.id,input.originBank,input.paidInstallments,{...input,benefitType:input.species})!})):[];
 return <aside className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><h3 className="text-sm font-semibold">Roteiros dos bancos</h3><p className="mt-2 text-sm leading-6 text-slate-500">{portal?'As condições devem ser conferidas nos roteiros vigentes pela mesa.':'Pesquise critérios, tabelas e exceções por banco ou assunto.'}</p>{rows.length>0&&<details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Conferir regras de portabilidade em {rows.length} bancos</summary><p className="my-3 text-xs leading-6 text-slate-500">Fonte substitutiva Markdown colado(5).md para os 13 bancos indicados; demais bancos conservam suas fontes. Vigência comercial não informada. Inclui bancos sem API ativa; elegibilidade não ativa integração nem representa aprovação bancária.</p><label className="mb-3 block text-sm">Banco de destino<select className="ml-2 rounded border border-slate-500/30 bg-transparent p-2" value={destination} onChange={event=>setDestination(event.target.value)}><option value="ALL">Todos os bancos</option>{rows.map(({bank})=><option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label><div className="overflow-x-auto"><table aria-label="Enquadramento por banco" className="w-full text-left text-sm"><thead><tr><th className="p-2">Banco e enquadramento</th></tr></thead><tbody>{rows.filter(({bank})=>destination==='ALL'||bank.id===destination).sort((a,b)=>eligibilityRank(eligibilityPresentation({bank:a.bank.name,check:a.check}).status)-eligibilityRank(eligibilityPresentation({bank:b.bank.name,check:b.check}).status)).map(({bank,check})=><tr key={bank.id} className="border-t border-slate-500/20"><td className="p-2"><EligibilityResult input={{bank:bank.name,product:'INSS',operation:input?.operation,check,commercial:portabilityGuide(bank.id)?.summary}} canViewDiagnostics={canDiagnose}/></td></tr>)}</tbody></table></div></details>}{!portal&&<a href="/roteiros" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg border border-blue-500/30 px-3 py-2 text-sm font-semibold text-blue-500">Pesquisar nos roteiros ↗</a>}</aside>;
}
