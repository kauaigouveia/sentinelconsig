import {EligibilityResult} from './EligibilityResult';
import {portabilityGuide} from '../../lib/portabilityGuide';
import {eligibilityGroups} from '../../lib/eligibilityGroups';
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
 const visible=rows.filter(({bank})=>destination==='ALL'||bank.id===destination);
 const projection=eligibilityGroups(visible.map(({bank,check})=>({bank:bank.name,product:'INSS',operation:input?.operation,check})));
 return <aside className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
  <h3 className="text-sm font-semibold">Roteiros dos bancos</h3>
  <p className="mt-2 text-sm text-slate-500">{portal?'As condições devem ser conferidas nos roteiros vigentes pela mesa.':'Critérios de enquadramento; não representam oferta nem aprovação bancária.'}</p>
  {rows.length>0&&<details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Conferir regras de portabilidade em {rows.length} bancos</summary>
   <p className="my-3 text-xs text-slate-500">Política substitutiva recebida em 30/10/2026 para os 13 bancos indicados. Demais bancos conservam suas fontes; Vigência comercial não informada.</p>
   <label className="mb-3 block text-sm">Banco de destino<select className="ml-2 rounded border border-slate-500/30 bg-transparent p-2" value={destination} onChange={event=>setDestination(event.target.value)}><option value="ALL">Todos os bancos</option>{rows.map(({bank})=><option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>
   {projection.common.length>0&&<section aria-label="Pendências comuns" className="mb-3 rounded-lg border border-amber-500/30 p-3 text-sm"><h4 className="font-semibold">Pendências comuns</h4><ul>{projection.common.map(({message,count})=><li key={message}>{message} <span className="text-xs text-slate-500">({count} bancos)</span></li>)}</ul></section>}
   <table aria-label="Enquadramento por banco" className="w-full text-left text-sm"><tbody>{projection.groups.filter(group=>group.rows.length).map(group=><React.Fragment key={group.status}><tr><th className="pt-4 pb-2">{group.title} ({group.rows.length}) · {group.status}</th></tr>{group.rows.map(row=><tr key={row.bank} className="border-t border-slate-500/20"><td className="py-2"><strong>{row.bank}</strong><ul>{[...row.restrictions,...row.pending].map(message=><li className="text-xs text-slate-500" key={message}>{message}</li>)}</ul></td></tr>)}</React.Fragment>)}</tbody></table>
   {canDiagnose&&<details className="mt-3"><summary className="cursor-pointer text-xs">Diagnósticos técnicos restritos à gestão</summary>{visible.map(({bank,check})=><EligibilityResult key={bank.id} input={{bank:bank.name,product:'INSS',operation:input?.operation,check,commercial:portabilityGuide(bank.id)?.summary}} canViewDiagnostics/>)}</details>}
  </details>}
  {!portal&&<a href="/roteiros" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-lg border border-blue-500/30 px-3 py-2 text-sm font-semibold text-blue-500">Pesquisar nos roteiros ↗</a>}
 </aside>;
}
