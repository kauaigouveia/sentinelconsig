import React, { useEffect, useRef, useState } from 'react';

export function V8NativeConsent({ executionId, reference, onRecorded }: { executionId: string; reference: any; onRecorded: () => void }) {
  const [challenge, setChallenge] = useState<any>(null), [worker, setWorker] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [name, setName] = useState(''), [accepted, setAccepted] = useState(false), [signed, setSigned] = useState(false);
  const [device, setDevice] = useState({ operationalSystem: navigator.platform || '', deviceModel: '', deviceName: '', deviceType: '' });
  const points = useRef<number[][]>([]), drawing = useRef(false), lock = useRef(false), canvas = useRef<HTMLCanvasElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function api(action: string, body: any) {
    const r = await fetch(`/api/simulations/clt/v8/consent/native/${action}`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json(); if (!r.ok) throw Error(data.error || 'Não foi possível registrar o consentimento.'); return data;
  }
  async function prepare() {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage('');
    try { const data = await api('prepare', { executionId, consultId: reference.consultId, promoterId: reference.promoterId }); if (alive.current) setChallenge(data); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Termo indisponível.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || points.current.length >= 512) return;
    const r = event.currentTarget.getBoundingClientRect(); if (!r.width || !r.height) return;
    const p = [Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (event.clientY - r.top) / r.height))];
    const before = points.current.at(-1); points.current.push(p);
    const ctx = event.currentTarget.getContext('2d'); if (ctx) { ctx.strokeStyle = '#0891b2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo((before || p)[0] * 400, (before || p)[1] * 120); ctx.lineTo(p[0] * 400, p[1] * 120); ctx.stroke(); }
    setSigned(new Set(points.current.map(p => p.join(':'))).size >= 4);
  }
  async function accept() {
    if (lock.current || !worker || !accepted || !signed) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const data = await api('accept', { challengeToken: challenge.challengeToken, termsHash: challenge.termsHash, workerTookControl: true, workerName: name, signature: points.current, accepted: true, ...device });
      if (!alive.current) return;
      setMessage(data.message); setChallenge(null); setWorker(false); points.current = []; onRecorded();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Resultado incerto. Confira o acompanhamento antes de repetir.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border p-3 text-sm" aria-label="Consentimento nativo V8"><button type="button" disabled={busy} onClick={() => void prepare()} className="rounded border p-2">Autorizar consulta com o trabalhador</button>{message && <p role="status">{message}</p>}{challenge && <><p className="text-xs">Consulta {challenge.consultId} · Termo {challenge.version}</p><article className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border p-3">{challenge.terms}</article>{!worker ? <><p>Entregue os controles ao próprio trabalhador para leitura, preenchimento do nome e assinatura. O operador não deve aceitar em seu lugar.</p><button type="button" onClick={() => setWorker(true)} className="rounded border p-2">Passar controles ao trabalhador</button></> : <fieldset disabled={busy} className="grid gap-3"><legend>Aceite pessoal do trabalhador</legend><label>Meu nome completo<input className="block w-full rounded border bg-transparent p-2" value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label><label>Minha assinatura<canvas ref={canvas} width={400} height={120} aria-label="Assinatura do trabalhador" className="block h-32 w-full touch-none rounded border bg-white" onPointerDown={e => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); point(e); }} onPointerMove={point} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} /></label><button type="button" onClick={() => { canvas.current?.getContext('2d')?.clearRect(0, 0, 400, 120); points.current = []; setSigned(false); }} className="text-left text-xs underline">Limpar assinatura</button>{(['operationalSystem', 'deviceModel', 'deviceName'] as const).map(k => <label key={k}>{({ operationalSystem: 'Sistema operacional real', deviceModel: 'Modelo real do dispositivo', deviceName: 'Nome real do dispositivo' })[k]}<input className="block w-full rounded border bg-transparent p-2" value={device[k]} onChange={e => setDevice({ ...device, [k]: e.target.value })} /></label>)}<label>Tipo real do dispositivo<select value={device.deviceType} onChange={e => setDevice({ ...device, deviceType: e.target.value })} className="block rounded border bg-transparent p-2"><option value="">Selecione</option><option value="mobile">Celular</option><option value="desktop">Computador</option><option value="tablet">Tablet</option></select></label><label><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Sou o trabalhador, li o termo e autorizo pessoalmente esta consulta.</label><button type="button" disabled={!accepted || !signed || !name.trim() || !device.operationalSystem || !device.deviceName || !device.deviceModel || !device.deviceType} onClick={() => void accept()} className="rounded bg-cyan-700 p-3 text-white">Registrar meu aceite e autorizar na V8</button></fieldset>}</>}</section>;
}
