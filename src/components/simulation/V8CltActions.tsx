import React, { useState } from 'react';

export function V8CltActions({ capabilities, form, setForm, start, busy, executionId, rows }: any) {
  const [link, setLink] = useState(''), [error, setError] = useState('');
  const connections = capabilities?.connections || [], selected = connections.find((c: any) => c.promoterId === form.v8PromoterId) || (connections.length === 1 ? connections[0] : null);
  async function requestLink(reference: any) {
    setError(''); setLink('');
    try {
      const r = await fetch('/api/simulations/clt/v8/consent-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ executionId, consultId: reference.consultId, promoterId: reference.promoterId }) });
      const data = await r.json(); if (!r.ok) throw Error(data.error);
      setLink(data.path);
    } catch (e) { setError(e instanceof Error ? e.message : 'Consentimento indisponível.'); }
  }
  return <section className="mb-4 space-y-3 rounded-xl border p-3 text-sm"><p>A V8 consulta autorizações e margem antes de calcular. Nenhum aceite é realizado pelo operador.</p>{connections.length > 1 && <label>Conexão V8<select className="ml-2 rounded border bg-transparent p-2" value={form.v8PromoterId} onChange={e => setForm((old: any) => ({ ...old, v8PromoterId: e.target.value, v8ConsultId: '' }))}><option value="">Selecione</option>{connections.map((c: any) => <option key={c.promoterId} value={c.promoterId}>{c.promoterId}</option>)}</select></label>}
    <button type="button" disabled={busy} className="rounded border p-2" onClick={() => start('v8', 'REFRESH')}>Atualizar consulta V8</button>
    <button type="button" disabled={busy || !selected?.simulationReady || !rows?.some((r: any) => r.data?.v8?.simulationReady)} className="ml-2 rounded border p-2" onClick={() => start('v8', 'SIMULATE')}>Simular condições elegíveis V8</button>
    {selected?.reasons?.length > 0 && <ul className="list-inside list-disc text-xs">{selected.reasons.map((reason: string) => <li key={reason}>{reason}</li>)}</ul>}
    <details><summary>Criar consulta · dados adicionais exigidos pela V8</summary><div className="my-3 grid gap-3 sm:grid-cols-2">{[['v8BirthDate', 'Nascimento do trabalhador', 'date'], ['v8Email', 'E-mail do trabalhador', 'email']].map(([key, label, type]) => <label key={key}>{label}<input type={type} className="block w-full rounded border bg-transparent p-2" value={form[key]} onChange={e => setForm((old: any) => ({ ...old, [key]: e.target.value }))} /></label>)}<label>Sexo informado pelo trabalhador<select value={form.v8Gender} className="block rounded border bg-transparent p-2" onChange={e => setForm((old: any) => ({ ...old, v8Gender: e.target.value }))}><option value="">Selecione</option><option value="male">Masculino</option><option value="female">Feminino</option></select></label></div><button type="button" disabled={busy || !form.v8BirthDate || !form.v8Email || !form.v8Gender || connections.length > 1 && !selected} onClick={() => start('v8', 'CREATE_CONSULT')} className="rounded border p-2">Criar consulta V8</button></details>
    {rows?.map((r: any, i: number) => r.data?.v8?.status === 'WAITING_CONSENT' && <button key={i} type="button" disabled={busy || !selected?.consentReady} onClick={() => void requestLink(r.data.v8)} className="block rounded border p-2">Preparar acesso do trabalhador ao termo vigente</button>)}
    {error && <p role="alert">{error}</p>}{link && <a href={link} target="_blank" rel="noreferrer" className="block break-all underline">Abrir acesso para o próprio trabalhador</a>}
  </section>;
}
