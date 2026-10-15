import React, { useEffect, useRef, useState } from 'react';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
import { promoterApiUrl } from './BankPromoterConnection';

const empty = { environment: 'production', enabled: false, cltEnabled: false, fgtsEnabled: false, hasCredentials: false };
const control = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700';
export function PresencaIntegrationTab({ promoterId }: { promoterId: string }) {
  const [config, setConfig] = useState(empty), [active, setActive] = useState('production');
  const [login, setLogin] = useState(''), [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const current = useRef<AbortController | null>(null);
  const user = StorageService.getActiveUser(), canManage = hasPermission(user?.role, user?.customPermissions, 'integrations.manage');
  async function api(path: string, method: string, body: unknown, signal: AbortSignal) {
    const response = await fetch(promoterApiUrl(`/api/integrations/presenca/${path}`, promoterId), { method, credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, signal, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha na conexão Presença.'); return data;
  }
  async function load(environment?: string) {
    current.current?.abort(); const request = new AbortController(); current.current = request;
    setLoading(true); setError(''); setMessage(''); setLogin(''); setPassword(''); setConfig({ ...empty, environment: environment || 'production' });
    try { const data = await api(`config${environment ? `?environment=${environment}` : ''}`, 'GET', undefined, request.signal); if (!request.signal.aborted) { setConfig(data); setActive(data.activeEnvironment); } }
    catch (err) { if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'Falha ao carregar conexão.'); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => current.current?.abort(); }, [promoterId]);
  async function run(test: boolean) {
    if (busy || loading || !canManage) return;
    current.current?.abort(); const request = new AbortController(); current.current = request;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(test ? 'test' : 'config', test ? 'POST' : 'PUT', test ? { environment: config.environment } : { ...config, login, password }, request.signal);
      if (request.signal.aborted) return;
      if (!test) { setConfig(result); setActive(result.environment); setLogin(''); setPassword(''); }
      setMessage(test ? result.message : 'Conexão salva. Credenciais protegidas e separadas por ambiente.');
    } catch (err) { if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'Falha na operação.'); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <section className="min-w-0 space-y-4" aria-label="Integração Presença Bank">
    <header><h2 className="text-xl font-bold">Presença Bank · CLT e FGTS</h2><p className="text-sm text-slate-500">Consentimento, vínculos, margem e ofertas CLT. Consulta de tabelas e valores FGTS no simulador existente. Nesta etapa não há assinatura automática, contratação ou sincronização de propostas.</p></header>
    {loading && <p role="status">Carregando conexão Presença…</p>}{error && <p role="alert" className="rounded-lg border border-rose-500 p-3 text-rose-500">{error}</p>}{message && <p role="status" className="rounded-lg border border-cyan-500 p-3">{message}</p>}
    <fieldset disabled={loading || busy || !canManage} className="space-y-3 rounded-xl border border-slate-300 p-4 dark:border-slate-700"><legend className="px-2 font-bold">Credenciais da conexão</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Ambiente<select className={control} value={config.environment} onChange={event => void load(event.target.value)}><option value="production">Produção</option><option value="homologation">Homologação · endereço pendente</option></select></label>
        <p className="self-end text-sm text-slate-500">Ambiente salvo como ativo: {active === 'production' ? 'Produção' : 'Homologação'}. Apenas alternar a seleção não ativa o ambiente.</p>
        <label>Login do agente<input className={control} autoComplete="off" value={login} placeholder={config.hasCredentials ? 'Cadastrado — preencha para alterar' : ''} onChange={event => setLogin(event.target.value)} /></label>
        <label>Senha<input className={control} type="password" autoComplete="new-password" value={password} placeholder={config.hasCredentials ? 'Cadastrada — preencha para alterar' : ''} onChange={event => setPassword(event.target.value)} /></label>
      </div>
      {config.environment === 'homologation' && <p className="text-sm text-amber-600 dark:text-amber-300">O endereço atual de homologação não foi confirmado. Salve as credenciais desativadas; não usaremos produção como substituto.</p>}
      <label className="flex items-center gap-2"><input type="checkbox" disabled={config.environment === 'homologation'} checked={config.enabled} onChange={event => setConfig(value => ({ ...value, enabled: event.target.checked }))} />Habilitar conexão Presença</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.cltEnabled} onChange={event => setConfig(value => ({ ...value, cltEnabled: event.target.checked }))} />Habilitar consulta CLT · requer liberação no banco</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.fgtsEnabled === true} onChange={event => setConfig(value => ({ ...value, fgtsEnabled: event.target.checked }))} />Habilitar consulta FGTS · requer liberação no banco</label>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void run(false)} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Salvar e usar este ambiente</button><button type="button" disabled={config.environment !== 'production' || !config.hasCredentials || !config.enabled} onClick={() => void run(true)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Testar autenticação salva</button></div>
      <p className="text-xs text-slate-500">O token fica somente no servidor, com cache até o expireAt retornado. Nenhuma senha é devolvida ao navegador. INSS, SIAPE e Hapvida não foram ativados nesta etapa.</p>
    </fieldset>
  </section>;
}
