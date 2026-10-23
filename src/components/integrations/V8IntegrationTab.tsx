import React, { useEffect, useRef, useState } from 'react';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
import { promoterApiUrl } from './BankPromoterConnection';
import { readJsonResponse } from '../../lib/httpJson';

const empty = { environment: 'production', enabled: false, fgtsEnabled: false, cltEnabled: false, hasCredentials: false, configuredFields: {} as Record<string, boolean> };
const credentials = { username: '', password: '', clientId: '', audience: '' };
const fields = [['username', 'E-mail de acesso'], ['password', 'Senha'], ['clientId', 'client_id'], ['audience', 'audience']] as const;
const control = 'mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700';
type Check = { product: string; httpStatus: number | null; available: boolean; tableCount: number; reason?: string; accessDenied?: boolean };
export function V8IntegrationTab({ promoterId }: { promoterId: string }) {
  const [config, setConfig] = useState(empty), [active, setActive] = useState('production');
  const [values, setValues] = useState(credentials), [checks, setChecks] = useState<Check[]>([]);
  const [unsaved, setUnsaved] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const user = StorageService.getActiveUser(), canManage = hasPermission(user?.role, user?.customPermissions, 'integrations.manage');
  async function api(path: string, method: string, body: unknown, signal: AbortSignal) {
    const response = await fetch(promoterApiUrl(`/api/integrations/v8/${path}`, promoterId), { method, signal, cache: 'no-store', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação V8.');
    return data;
  }
  async function load(environment?: string) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setUnsaved(false); setLoading(true); setError(''); setMessage(''); setChecks([]); setValues(credentials); setConfig({ ...empty, environment: environment || 'production' });
    try {
      const data = await api(`config${environment ? `?environment=${environment}` : ''}`, 'GET', undefined, controller.signal);
      if (!controller.signal.aborted) { setConfig(data); setActive(data.activeEnvironment); }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha ao carregar a conexão.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { void load(); return () => request.current?.abort(); }, [promoterId]);
  async function run(test: boolean) {
    if (busy || loading || !canManage) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setMessage(''); setChecks([]);
    try {
      const data = await api(test ? 'test' : 'config', test ? 'POST' : 'PUT', test ? { environment: config.environment } : { environment: config.environment, enabled: config.enabled, fgtsEnabled: config.fgtsEnabled, cltEnabled: config.cltEnabled, ...values }, controller.signal);
      if (controller.signal.aborted) return;
      if (test) { setMessage(data.message); setChecks(data.checks || []); }
      else { setConfig(data); setActive(data.environment); setValues(credentials); setUnsaved(false); setMessage('Conexão salva. As credenciais de cada ambiente permanecem separadas.'); }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha na conexão.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const dirty = unsaved || Object.values(values).some(Boolean);
  return <section className="space-y-4" aria-label="Integração V8 Digital">
    <header><h2 className="text-xl font-bold">V8 Digital · FGTS e Crédito Trabalhador</h2><p className="mt-1 text-sm text-slate-500">Configure a conexão e confira o acesso às tabelas. O simulador CLT consulta consentimentos V8 já autorizados e calcula ofertas quando o acesso estiver habilitado. A criação e o aceite de novos termos e a contratação não estão disponíveis neste fluxo.</p></header>
    {loading && <p role="status">Carregando conexão V8…</p>}{error && <p role="alert" className="rounded-lg border border-rose-500 p-3 text-rose-500">{error}</p>}{message && <p role="status" className="rounded-lg border border-cyan-500 p-3">{message}</p>}
    <fieldset disabled={loading || busy || !canManage} className="space-y-4 rounded-xl border border-slate-300 p-4 dark:border-slate-700"><legend className="px-2 font-bold">Credenciais da conexão</legend>
      <div className="grid gap-4 sm:grid-cols-2"><label>Ambiente<select className={control} value={config.environment} onChange={e => void load(e.target.value)}><option value="production">Produção</option><option value="homologation">Homologação · endereço pendente</option></select></label><p className="self-end text-sm text-slate-500">Ambiente ativo: {active === 'production' ? 'Produção' : 'Homologação'}. A seleção só é ativada ao salvar.</p>
      {fields.map(([field, label]) => <label key={field}>{label}<input type="password" autoComplete="new-password" className={control} value={values[field]} placeholder={config.configuredFields?.[field] ? 'Cadastrado — preencha para alterar' : ''} onChange={e => { setValues(current => ({ ...current, [field]: e.target.value })); setChecks([]); }} /></label>)}</div>
      {config.environment === 'homologation' && <p className="text-sm text-amber-600">A V8 ainda precisa confirmar o endereço de homologação. Você pode guardar as credenciais deste ambiente desativado.</p>}
      <label className="flex items-center gap-2"><input type="checkbox" disabled={config.environment !== 'production'} checked={config.enabled} onChange={e => { setConfig(c => ({ ...c, enabled: e.target.checked })); setUnsaved(true); setChecks([]); }} />Habilitar conexão V8</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.fgtsEnabled} onChange={e => { setConfig(c => ({ ...c, fgtsEnabled: e.target.checked })); setUnsaved(true); setChecks([]); }} />Consultar disponibilidade FGTS</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={config.cltEnabled} onChange={e => { setConfig(c => ({ ...c, cltEnabled: e.target.checked })); setUnsaved(true); setChecks([]); }} />Consultar disponibilidade CLT</label>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void run(false)} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Salvar e usar este ambiente</button><button type="button" disabled={dirty || !config.enabled || !config.hasCredentials || config.environment !== 'production'} onClick={() => void run(true)} className="rounded-lg border px-4 py-2 disabled:opacity-50">{busy ? 'Processando…' : 'Testar conexão salva'}</button></div>
      <p className="text-xs text-slate-500">Campos vazios preservam os valores já cadastrados neste ambiente. O teste usa a configuração salva e não cria propostas.</p>
    </fieldset>
    {checks.length > 0 && <table className="w-full text-left text-sm"><caption className="mb-2 text-left font-bold">Disponibilidade retornada pela V8</caption><thead><tr><th className="p-2">Produto</th><th className="p-2">Resultado</th><th className="p-2">Tabelas</th></tr></thead><tbody>{checks.map(check => <tr key={check.product}><td className="p-2">{check.product}</td><td className="p-2">{check.available ? 'Consulta concluída' : `${check.accessDenied ? 'Sem permissão na V8' : 'Não confirmado'}${check.httpStatus ? ` · HTTP ${check.httpStatus}` : ' · sem resposta'}`}{check.reason && <span className="mt-1 block text-xs text-slate-500">{check.reason}</span>}</td><td className="p-2">{check.available ? check.tableCount : '—'}</td></tr>)}</tbody></table>}
    {!canManage && <p className="text-sm text-slate-500">Solicite a permissão de gerenciar integrações para configurar a V8.</p>}
  </section>;
}
