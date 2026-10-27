import { V8ApiAuthorization } from './V8ApiAuthorization';
import React, { useEffect, useRef, useState } from 'react';

export function V8CltActions({ capabilities, form, setForm, start, busy, executionId, rows, onSnapshot }: any) {
  const connections = capabilities?.connections || [], selected = connections.find((c: any) => c.promoterId === form.v8PromoterId) || (connections.length === 1 ? connections[0] : null);
  const [trackingMessage, setTrackingMessage] = useState('');
  const observed = useRef(new Set<string>());
  const references = rows.filter((r: any) => r.data?.v8?.consentRecorded).map((r: any) => r.data.v8);
  const ref = references.find((r: any) => r.consultId === form.v8ConsultId && r.promoterId === form.v8PromoterId) || (references.length === 1 ? references[0] : null);
  const watchKey = ref ? [executionId, ref.consultId, ref.promoterId, ref.status].join(':') : '';
  useEffect(() => {
    if (!ref || busy || !['WAITING_CONSENT','CONSENT_APPROVED','WAITING_CONSULT','WAITING_CREDIT_ANALYSIS'].includes(ref.status)) return;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>, attempts = 0;
    const poll = async () => {
      try {
        attempts++;
        const query = new URLSearchParams({consultId: ref.consultId, promoterId: ref.promoterId});
        const r = await fetch('/api/simulations/clt/v8/consultations/' + executionId + '?' + query, {cache:'no-store',signal:abort.signal});
        const data = await r.json(); if(abort.signal.aborted)return; if(!r.ok)throw Error('Acompanhamento indisponível.');
        onSnapshot(data);
        const next = data.results.v8.rows.map((row:any)=>row.data?.v8).find((v:any)=>v?.consultId===ref.consultId);
        if(next?.status==='SUCCESS'&&next.simulationReady&&!observed.current.has(ref.consultId)) {observed.current.add(ref.consultId); start('v8','SIMULATE',{v8ConsultId:ref.consultId,v8PromoterId:ref.promoterId});return;}
        if(!next||['SUCCESS','REJECTED','FAILED'].includes(next.status))return;
        if(attempts<8)timer=setTimeout(poll,8000);else setTrackingMessage('Processamento ainda pendente. Use Atualizar consulta V8 para conferir novamente.');
      } catch {if(!abort.signal.aborted)setTrackingMessage('Acompanhamento interrompido. Use Atualizar consulta V8; nenhuma operação foi reenviada.');}
    };
    timer=setTimeout(poll,8000);return()=>{abort.abort();clearTimeout(timer);};
  },[watchKey,busy]);
  return <section className="mb-4 space-y-3 rounded-xl border p-3 text-sm"><p>A V8 consulta autorizações e margem antes de calcular. A autorização da consulta é processada pela API V8.</p>{connections.length > 1 && <label>Conexão V8<select className="ml-2 rounded border bg-transparent p-2" value={form.v8PromoterId} onChange={e => setForm((old: any) => ({ ...old, v8PromoterId: e.target.value, v8ConsultId: '' }))}><option value="">Selecione</option>{connections.map((c: any) => <option key={c.promoterId} value={c.promoterId}>{c.promoterId}</option>)}</select></label>}
    <button type="button" disabled={busy} className="rounded border p-2" onClick={() => start('v8', 'REFRESH')}>Atualizar consulta V8</button>
    <button type="button" disabled={busy || !selected?.simulationReady || !rows?.some((r: any) => r.data?.v8?.simulationReady)} className="ml-2 rounded border p-2" onClick={() => start('v8', 'SIMULATE')}>Simular condições elegíveis V8</button>
    {trackingMessage && <p role="status">{trackingMessage}</p>}
    {selected?.reasons?.length > 0 && <ul className="list-inside list-disc text-xs">{selected.reasons.map((reason: string) => <li key={reason}>{reason}</li>)}</ul>}
    <button type="button" disabled={busy || !form.v8BirthDate || !form.v8Email || !form.v8Gender || connections.length > 1 && !selected} onClick={() => start('v8', 'CREATE_CONSULT')} className="rounded border p-2">Criar consulta V8</button>
    {rows?.map((r: any, i: number) => r.data?.v8 && !r.data.v8.consentRecorded && ['WAITING_CONSENT', 'CONSENT_APPROVED', 'WAITING_CONSULT', 'WAITING_CREDIT_ANALYSIS', 'SUCCESS'].includes(r.data.v8.status) && <V8ApiAuthorization key={r.data.v8.consultId + ':' + i} executionId={executionId} reference={r.data.v8} onRecorded={() => start('v8', 'REFRESH', { v8ConsultId: r.data.v8.consultId, v8PromoterId: r.data.v8.promoterId })} />)}
  </section>;
}
