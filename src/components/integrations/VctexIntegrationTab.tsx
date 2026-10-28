import React, {useCallback, useEffect, useRef, useState} from 'react';
import {promoterApiUrl} from './BankPromoterConnection';

type Diagnostic = {timestamp:string;httpStatus:number|null;authenticationSucceeded:boolean;tokenRecognized:boolean;permissionsClt:'CONFIRMED'|'DENIED'|'UNPROVEN';transportAvailable:boolean;error:string|null};
type Metadata = {enabled:boolean;hasCredentials:boolean;gatewayReady:boolean;status:string;lastDiagnostic:Diagnostic|null;history:Diagnostic[];metrics:{requests24h:number;errors24h:number;complete:boolean}};
const permissionLabel = (state?:string) => state==='CONFIRMED'?'Confirmadas':state==='DENIED'?'Negadas':'Não comprovadas';
export function VctexIntegrationTab({promoterId}:{promoterId:string}) {
  const [meta,setMeta]=useState<Metadata|null>(null),[cpf,setCpf]=useState(''),[password,setPassword]=useState(''),[enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  const load=useCallback(async(signal:AbortSignal)=>{
    const response=await fetch(promoterApiUrl('/api/integrations/vctex/config',promoterId),{cache:'no-store',signal});
    if(!response.ok)throw Error(response.status===403?'Permissão administrativa necessária para esta conexão.':'Não foi possível carregar a conexão VCTEX.');
    const data=await response.json();if(!signal.aborted){setMeta(data);setEnabled(data.enabled);}
  },[promoterId]);
  useEffect(()=>{
    const c=new AbortController();controller.current=c;setMeta(null);setCpf('');setPassword('');setError('');setMessage('');setBusy(true);
    void load(c.signal).catch(()=>{if(!c.signal.aborted)setError('Conexão indisponível. Confira sua permissão administrativa e atualize o estado.');}).finally(()=>{if(!c.signal.aborted)setBusy(false);});
    return()=>c.abort();
  },[load]);
  async function action(kind:'refresh'|'config'|'diagnostic') {
    if(busy)return;controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);setError('');setMessage('');
    try {
      if(kind!=='refresh'){
        const response=await fetch(promoterApiUrl('/api/integrations/vctex/'+kind,promoterId),{method:kind==='config'?'PUT':'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(kind==='config'?{cpf,password,enabled,environment:'production'}:{})});
        if(!response.ok)throw Error(response.status===403?'Permissão administrativa necessária.':'Operação não concluída. Atualize o estado antes de tentar novamente.');
        await response.json();if(c.signal.aborted)return;
        if(kind==='config'){setCpf('');setPassword('');setMessage('Conexão salva. Diagnósticos anteriores não validam credenciais alteradas.');}
        else setMessage('Diagnóstico concluído. Confira os estados abaixo; login não comprova permissão CLT.');
      }
      await load(c.signal);
      if(!c.signal.aborted)window.dispatchEvent(new Event('sentinel-integration-status-updated'));
    }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Operação indisponível.');}
    finally{if(!c.signal.aborted)setBusy(false);}
  }
  // The controller used by actions must also be aborted on unmount/promoter changes.
  useEffect(()=>()=>controller.current?.abort(),[promoterId]);
  const last=meta?.lastDiagnostic;
  const states=[['Configuração',meta?.hasCredentials?'Credenciais cadastradas':'Não configurada'],['Habilitação',meta?.enabled?'Habilitada':'Desabilitada'],['Transporte Oracle',!meta?.gatewayReady?'Não configurado':!last?'Não verificado':last.transportAvailable?'Disponível no último diagnóstico':'Indisponível no último diagnóstico'],['Autenticação',!last?'Não verificada':last.authenticationSucceeded?'HTTP de login bem-sucedido':'Não validada'],['Token',!last?'Não verificado':last.tokenRecognized?'Reconhecido':'Não reconhecido'],['Permissões CLT',permissionLabel(last?.permissionsClt)]];
  return <section aria-label="Conexão VCTEX CLT" className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">VCTEX CLT</h2><p className="text-sm text-slate-500 dark:text-slate-400">Produção · Oracle · /vctex · mesma conexão da configuração bancária</p></div><button type="button" disabled={busy} onClick={()=>void action('refresh')} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-700 dark:text-cyan-300 disabled:opacity-50">Atualizar estado</button></header>
    {error&&<p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
    {!meta&&!error&&<p role="status">Carregando conexão…</p>}
    {meta&&<><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{states.map(([label,value])=><div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd></div>)}</dl>
      <p className="text-sm text-amber-700 dark:text-amber-300">{meta.status==='ONLINE'?'Operacional para CLT conforme evidência vigente.':'Operação CLT não comprovada. A existência do produto consignado e o sucesso do login não confirmam permissões.'}</p>
      <p className="text-xs text-slate-500">Último diagnóstico: {last?new Date(last.timestamp).toLocaleString('pt-BR'):'Ainda não realizado'}. Evidência operacional expira após 15 minutos; atualizar estado não realiza login.</p>
      {last?.error&&<p role="status" className="text-sm text-amber-700 dark:text-amber-300">{last.error}</p>}
      <button type="button" disabled={busy||!meta.hasCredentials||!meta.gatewayReady} onClick={()=>void action('diagnostic')} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white disabled:opacity-50">Diagnóstico de autenticação pela Oracle</button>
      <p className="text-xs text-slate-500">Ação administrativa: somente login, sem consultas de trabalhadores ou operações de crédito. Para confirmar CLT, obtenha da VCTEX o significado das permissões e restrições retornadas.</p>
      <details><summary className="cursor-pointer text-sm font-medium">Configuração da conexão existente</summary><form onSubmit={e=>{e.preventDefault();void action('config');}} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">CPF de login<input type="password" autoComplete="off" value={cpf} onChange={e=>setCpf(e.target.value)} placeholder={meta.hasCredentials?'Manter credencial cadastrada':''} className="block w-full rounded border bg-transparent p-2" /></label><label className="text-sm">Senha<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={meta.hasCredentials?'Manter senha cadastrada':''} className="block w-full rounded border bg-transparent p-2" /></label><label className="text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} /> Habilitar conexão CLT</label><button disabled={busy} className="rounded bg-cyan-700 p-2 text-white disabled:opacity-50">Salvar conexão</button></form></details>
      <details><summary className="cursor-pointer text-sm font-medium">Histórico de verificações ({meta.history?.length||0})</summary><p className="my-2 text-xs text-slate-500">Diagnósticos observados nas últimas 24h: {meta.metrics?.requests24h||0}. Erros: {meta.metrics?.errors24h||0}. {meta.metrics?.complete===false?'Amostra limitada; contagem parcial.':'Somente evidências desta configuração.'}</p><ul className="space-y-2 text-sm">{meta.history?.map((h,i)=><li key={h.timestamp+':'+i} className="rounded border border-slate-200 p-2 dark:border-slate-700">{new Date(h.timestamp).toLocaleString('pt-BR')} · HTTP {h.httpStatus??'indisponível'} · Token {h.tokenRecognized?'reconhecido':'não reconhecido'} · CLT {permissionLabel(h.permissionsClt)}</li>)}</ul></details>
    </>}{message&&<p role="status" className="text-sm">{message}</p>}
  </section>;
}
