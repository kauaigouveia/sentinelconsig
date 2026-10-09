import React, { useEffect, useState } from 'react';

export function SimulationWhatsAppConnection() {
  const [config, setConfig] = useState({ baseUrl: '', instance: '', enabled: false, hasApiKey: false, companyName: '' });
  const [apiKey, setApiKey] = useState('');
  const [qr, setQr] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`/api/support/whatsapp/${path}`, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível acessar a conexão.');
    return data;
  }
  useEffect(() => { let alive = true; void request('config').then(data => { if (alive) setConfig(data); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, []);
  async function act(action: 'save' | 'connect' | 'state') {
    setBusy(true); setError('');
    try {
      if (action === 'save') { setConfig(await request('config', 'PUT', { ...config, apiKey })); setApiKey(''); setStatus('Configuração salva. Clique em conectar para registrar o canal.'); setQr(''); }
      if (action === 'connect') { const data = await request('connect', 'POST', {}); const image = data.base64 || data.qrcode?.base64 || ''; setQr(typeof image === 'string' && image.startsWith('data:image/png;base64,') ? image : ''); setStatus(image ? 'Leia o QR Code em Aparelhos conectados no WhatsApp.' : 'Consulte o estado da conexão. Se necessário, gere outro QR Code.'); }
      if (action === 'state') { const data = await request('state'); const state = data.instance?.state || data.state; setStatus(state === 'open' ? 'WhatsApp conectado.' : state === 'disabled' ? 'Conexão desabilitada.' : `WhatsApp ainda não conectado (${state || 'indisponível'}).`); if (state === 'open') setQr(''); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na conexão.'); }
    finally { setBusy(false); }
  }
  const inputClass = 'rounded-lg border border-slate-300 bg-transparent p-2 text-xs dark:border-slate-700';
  return <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
    <summary className="cursor-pointer text-sm font-bold">WhatsApp do canal de simulação</summary>
    <div className="mt-3 space-y-3 text-xs">
      {config.companyName && <p className="font-bold text-blue-600 dark:text-blue-400">Conexão da empresa: {config.companyName}</p>}
      <p>Alterar o nome da instância não troca a empresa. Esta conexão e os atendimentos pertencem ao ambiente atual.</p>
      <p>Nas conversas individuais, o parceiro informa seu código cadastrado no Sentinel antes de escolher o convênio. Grupos não recebem respostas automáticas.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">URL da Evolution API<input type="url" className={inputClass} value={config.baseUrl} placeholder="https://whatsapp.sentinelconsig.com.br" onChange={e => setConfig({ ...config, baseUrl: e.target.value })} /></label>
        <label className="flex flex-col gap-1">Instância<input className={inputClass} value={config.instance} onChange={e => setConfig({ ...config, instance: e.target.value })} /></label>
        <label className="flex flex-col gap-1">Chave da API<input type="password" autoComplete="new-password" className={inputClass} value={apiKey} placeholder={config.hasApiKey ? 'Cadastrada — preencha para alterar' : 'Chave da Evolution'} onChange={e => setApiKey(e.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Habilitar canal de simulação</label>
      <div className="flex flex-wrap gap-2">{([['save', 'Salvar'], ['connect', 'Conectar / gerar QR Code'], ['state', 'Consultar conexão']] as const).map(([action, label]) => <button type="button" key={action} disabled={busy} onClick={() => void act(action)} className="rounded-lg bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-50">{label}</button>)}</div>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className="text-rose-500">{error}</p>}
      {qr && <img src={qr} alt="QR Code para conectar o WhatsApp de simulação" className="h-64 w-64 rounded-lg bg-white p-3" />}
    </div>
  </details>;
}
