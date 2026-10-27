import React, { useEffect, useRef, useState } from 'react';

export function V8ApiAuthorization({ executionId, reference, onRecorded }: { executionId: string; reference: any; onRecorded: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [device, setDevice] = useState({ operationalSystem: navigator.platform || '', deviceModel: '', deviceName: '', deviceType: '' });
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function authorize() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/simulations/clt/v8/authorize', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ executionId, consultId: reference.consultId, promoterId: reference.promoterId, ...device }) });
      const data = await r.json();
      if (!alive.current) return;
      if (!r.ok) throw Error(data.error || 'Não foi possível processar a autorização.');
      setMessage(data.message); onRecorded();
    } catch (e) { if (alive.current) setMessage(e instanceof Error ? e.message : 'Resultado incerto. Confira o acompanhamento antes de repetir.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border p-3 text-sm" aria-label="Autorização V8 pela API">
    <p>A autorização da consulta é processada pela API V8. Informe o dispositivo utilizado; não é necessário colher assinatura nesta etapa.</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      {(['operationalSystem', 'deviceModel', 'deviceName'] as const).map(k => <label key={k}>{({ operationalSystem: 'Sistema operacional do dispositivo', deviceModel: 'Modelo do dispositivo', deviceName: 'Nome do dispositivo' })[k]}<input className="block w-full rounded border bg-transparent p-2" value={device[k]} onChange={e => setDevice({ ...device, [k]: e.target.value })} /></label>)}
      <label>Tipo do dispositivo<select value={device.deviceType} onChange={e => setDevice({ ...device, deviceType: e.target.value })} className="block rounded border bg-transparent p-2"><option value="">Selecione</option><option value="mobile">Celular</option><option value="desktop">Computador</option><option value="tablet">Tablet</option></select></label>
      <button type="button" disabled={busy || !device.operationalSystem.trim() || !device.deviceModel.trim() || !device.deviceName.trim() || !device.deviceType} onClick={() => void authorize()} className="rounded bg-cyan-700 p-3 text-white">Autorizar consulta V8</button>
    </fieldset>{message && <p role="status">{message}</p>}
  </section>;
}
