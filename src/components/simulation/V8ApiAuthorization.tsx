import React, { useEffect, useRef, useState } from 'react';
import {readV8Device} from '../../lib/v8Device';

export function V8ApiAuthorization({ executionId, reference, onRecorded }: { executionId: string; reference: any; onRecorded: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [device, setDevice] = useState({ operationalSystem: navigator.platform || '', deviceModel: '', deviceName: '', deviceType: '' });
  const lock = useRef(false), alive = useRef(true);
  const [detected,setDetected]=useState<string[]>([]);
  useEffect(()=>{let active=true;void readV8Device(navigator).then(value=>{if(active){setDevice(value);setDetected(Object.keys(value).filter(k=>!!value[k as keyof typeof value]));}});return()=>{active=false;};},[]);
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
    <p>Dados técnicos disponíveis foram preenchidos pelo navegador. Informe apenas os campos que ele não disponibiliza. Isso registra a operação da API, não uma assinatura ou um aceite humano presumido.</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      {(['operationalSystem', 'deviceModel', 'deviceName'] as const).map(k => <label key={k}>{({ operationalSystem: 'Sistema operacional do dispositivo', deviceModel: 'Modelo do dispositivo', deviceName: 'Nome do dispositivo' })[k]}<input className="block w-full rounded border bg-transparent p-2" readOnly={detected.includes(k)} value={device[k]} onChange={e => setDevice({ ...device, [k]: e.target.value })} /></label>)}
      <label>Tipo do dispositivo<select disabled={detected.includes('deviceType')} value={device.deviceType} onChange={e => setDevice({ ...device, deviceType: e.target.value })} className="block rounded border bg-transparent p-2"><option value="">Selecione</option><option value="mobile">Celular</option><option value="desktop">Computador</option><option value="tablet">Tablet</option></select></label>
      <button type="button" disabled={busy || !device.operationalSystem.trim() || !device.deviceModel.trim() || !device.deviceName.trim() || !device.deviceType} onClick={() => void authorize()} className="rounded bg-cyan-700 p-3 text-white">Autorizar consulta V8</button>
    </fieldset>{detected.length>0&&<p className="text-xs text-slate-500">Os campos preenchidos automaticamente são somente leitura. Nome do dispositivo não é exposto pelo navegador.</p>}{message && <p role="status">{message}</p>}
  </section>;
}
