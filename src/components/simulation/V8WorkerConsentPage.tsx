import React, { useEffect, useState } from 'react';

export function V8WorkerConsentPage() {
  const [token] = useState(() => location.hash.slice(1));
  const [view, setView] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [accepted, setAccepted] = useState(false);
  const [device, setDevice] = useState({ operationalSystem: navigator.platform || '', deviceModel: '', deviceName: '', deviceType: '' });
  useEffect(() => {
    // Fragment is not sent in HTTP URLs, access logs or referrers.
    history.replaceState(null, '', location.pathname);
    const abort = new AbortController();
    void fetch('/api/public/v8/clt/consent/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store', signal: abort.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error); if (!abort.signal.aborted) setView(data); }).catch(() => { if (!abort.signal.aborted) setError('Link indisponível ou expirado. Solicite um novo acesso.'); });
    return () => abort.abort();
  }, [token]);
  async function accept() {
    if (busy || !view?.workerVerified || !accepted) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/public/v8/clt/consent/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, termsHash: view.termsHash, accepted: true, ...device }), cache: 'no-store' });
      const data = await r.json(); if (!r.ok) throw Error(data.error);
      setView({ ...view, registered: true, message: data.message });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível confirmar o registro. Não repita sem conferir o estado.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-2xl space-y-4 p-5 text-slate-900 dark:text-slate-100"><h1 className="text-xl font-semibold">Consentimento do trabalhador · V8 DIGITAL</h1>{error && <p role="alert">{error}</p>}{view && <><p className="break-all text-xs">Consulta {view.consultId} · Termo {view.version}</p><article className="max-h-[45dvh] overflow-y-auto whitespace-pre-wrap rounded-xl border p-4">{view.terms}</article>{view.registered ? <p role="status">{view.message}</p> : <>{!view.workerVerified && <p role="status">A identificação independente do titular ainda não foi confirmada. O operador não pode aceitar este termo pelo trabalhador.</p>}<fieldset disabled={!view.workerVerified || busy} className="grid gap-3"><legend>Dados reais do seu dispositivo</legend>{(['operationalSystem', 'deviceModel', 'deviceName'] as const).map(k => <label key={k}>{({ operationalSystem: 'Sistema operacional', deviceModel: 'Modelo real do dispositivo', deviceName: 'Nome real do dispositivo' })[k]}<input className="block w-full rounded border bg-transparent p-2" value={device[k]} onChange={e => setDevice({ ...device, [k]: e.target.value })} /></label>)}<label>Tipo do dispositivo<select className="block rounded border bg-transparent p-2" value={device.deviceType} onChange={e => setDevice({ ...device, deviceType: e.target.value })}><option value="">Selecione seu dispositivo</option><option value="mobile">Celular</option><option value="desktop">Computador</option><option value="tablet">Tablet</option></select></label><label><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> Li o termo e autorizo pessoalmente esta consulta.</label><button type="button" disabled={!accepted || !device.deviceName || !device.deviceModel || !device.operationalSystem || !device.deviceType} onClick={() => void accept()} className="rounded bg-cyan-700 p-3 text-white">Registrar meu consentimento</button></fieldset></>}</>}</main>;
}
