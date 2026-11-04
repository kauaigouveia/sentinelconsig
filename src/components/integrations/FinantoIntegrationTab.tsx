import { BankPromoterConnection, promoterApiUrl } from './BankPromoterConnection';
import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Save, ShieldCheck, XCircle } from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

type Config = { isConfigured: boolean; hasApiKey: boolean; enabled: boolean };
type CatalogResponse = { items?: Array<Record<string, any>>; messages?: Array<{ code?: string; text?: string }> };

const FinantoIntegrationTabContent: React.FC<{ promoterId: string }> = ({ promoterId }) => {
  const user = StorageService.getActiveUser();
  const canManage = ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN', 'GESTOR'].includes(user?.role || '') ||
    hasPermission(user?.role, user?.customPermissions, 'integrations.manage');
  const [config, setConfig] = useState<Config>({ isConfigured: false, hasApiKey: false, enabled: false });
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [operation, setOperation] = useState('1');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [requestMethod, setRequestMethod] = useState('GET');
  const [requestPath, setRequestPath] = useState('/v3/about');
  const [requestBody, setRequestBody] = useState('{}');
  const [requestResult, setRequestResult] = useState<unknown>(null);
  const [requestLoading, setRequestLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(promoterApiUrl('/api/integrations/finanto/config', promoterId));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a configuração.');
      setConfig(data);
    } catch (error: any) {
      setMessage({ ok: false, text: error.message || 'Erro ao carregar configuração.' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch(promoterApiUrl('/api/integrations/finanto/config', promoterId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), enabled: config.enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setConfig(data.config); setApiKey('');
      setMessage({ ok: true, text: 'Configuração FINANTO salva com segurança.' });
    } catch (error: any) { setMessage({ ok: false, text: error.message || 'Erro ao salvar.' }); }
    finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setMessage(null);
    try {
      const response = await fetch(promoterApiUrl('/api/integrations/finanto/test-connection', promoterId), { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || data.data?.message || `FINANTO respondeu HTTP ${data.status || response.status}.`);
      setMessage({ ok: true, text: `FINANTO conectada. Resposta em ${data.responseTimeMs} ms.` });
    } catch (error: any) { setMessage({ ok: false, text: error.message || 'Falha ao testar a conexão.' }); }
    finally { setTesting(false); }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true); setCatalog(null); setMessage(null);
    try {
      const response = await fetch(promoterApiUrl('/api/integrations/finanto/request', promoterId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST', endpoint: '/v3/loan-products/search/basic',
          body: { type: { code: { eq: 20 } }, operation: { code: { eq: Number(operation) } } },
        }),
      });
      const data: CatalogResponse = await response.json();
      if (!response.ok) throw new Error((data as any).error || (data as any).messages?.[0]?.text || 'Falha ao consultar produtos.');
      setCatalog(data);
      if (data.messages?.length) setMessage({ ok: false, text: data.messages.map(item => item.text).filter(Boolean).join(' ') });
    } catch (error: any) { setMessage({ ok: false, text: error.message || 'Falha ao consultar catálogo.' }); }
    finally { setCatalogLoading(false); }
  };

  const runApiRequest = async () => {
    setMessage(null); setRequestResult(null);
    let body: unknown;
    try { body = requestBody.trim() ? JSON.parse(requestBody) : undefined; }
    catch { setMessage({ ok: false, text: 'O corpo da requisição precisa ser um JSON válido.' }); return; }
    if (requestMethod !== 'GET' && !window.confirm('Esta operação pode criar ou alterar dados na FINANTO. Deseja continuar?')) return;
    setRequestLoading(true);
    try {
      const response = await fetch(promoterApiUrl('/api/integrations/finanto/request', promoterId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: requestMethod, endpoint: requestPath, body }),
      });
      const data = await response.json();
      setRequestResult(data);
      if (!response.ok) setMessage({ ok: false, text: data.error || data.messages?.[0]?.text || `FINANTO respondeu HTTP ${response.status}.` });
    } catch (error: any) { setMessage({ ok: false, text: error.message || 'Falha na chamada FINANTO.' }); }
    finally { setRequestLoading(false); }
  };

  return <div className="space-y-6">
    <section className="rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-6  dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-xl bg-[var(--info-bg)] p-3 text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]"><KeyRound className="h-6 w-6" /></div>
        <div><h2 className="text-lg font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">FINANTO / JoinBank</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Conexão API por empresa. A chave é criptografada no servidor e nunca retorna para o navegador.</p>
        </div>
      </div>
      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando...</div> : <>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Chave API FINANTO
            <div className="mt-2 flex rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
              <input disabled={!canManage} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={config.hasApiKey ? 'Chave cadastrada (preencha para substituir)' : 'Cole a chave API fornecida pela FINANTO'} className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2.5 text-sm outline-none disabled:opacity-60" autoComplete="new-password" />
              <button type="button" onClick={() => setShowKey(v => !v)} className="px-3 text-[var(--text-secondary)]" aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </label>
          <label className="flex items-center gap-3 self-end rounded-lg border border-[var(--field-border)] p-3 text-sm dark:border-[var(--field-border)]">
            <input type="checkbox" disabled={!canManage} checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} className="h-4 w-4 accent-[var(--field-border)]" />
            <span><strong className="block text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Ativar integração</strong><small className="text-[var(--text-secondary)]">Libera as chamadas FINANTO para esta empresa</small></span>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canManage && <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--action)] px-4 py-2.5 text-sm font-semibold text-[var(--action-ink)] hover:bg-[var(--action-hover)] disabled:opacity-90"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar configuração'}</button>}
          <button onClick={test} disabled={testing || !config.isConfigured} className="inline-flex items-center gap-2 rounded-lg border border-[var(--field-border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] disabled:opacity-90 dark:border-[var(--field-border)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--bg-surface-elevated)]"><Activity className="h-4 w-4" />{testing ? 'Testando...' : 'Testar conexão'}</button>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${config.isConfigured ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]'}`}><ShieldCheck className="h-4 w-4" />{config.isConfigured ? 'Chave configurada' : 'Aguardando chave'}</span>
        </div>
        {message && <div className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${message.ok ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]' : 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'}`}>{message.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}{message.text}</div>}
      </>}
    </section>
    <section className="rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-6 dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
      <div className="mb-4"><h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Operações da API FINANTO</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Acesse os endpoints documentados usando a chave guardada no servidor. Para operações diferentes de leitura, o sistema pede confirmação.</p></div>
      <div className="grid gap-3 md:grid-cols-[130px_minmax(0,1fr)]">
        <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Método<select value={requestMethod} onChange={e => setRequestMethod(e.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label>
        <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Endpoint (caminho relativo)<input value={requestPath} onChange={e => setRequestPath(e.target.value)} placeholder="/v3/..." className="mt-1 block w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2.5 font-mono text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]" /></label>
      </div>
      {requestMethod !== 'GET' && <label className="mt-3 block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Corpo JSON<textarea value={requestBody} onChange={e => setRequestBody(e.target.value)} rows={5} spellCheck={false} className="mt-1 block w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-canvas)] p-3 font-mono text-xs dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]" /></label>}
      <div className="mt-3 flex items-center gap-3"><button onClick={runApiRequest} disabled={requestLoading || !config.enabled || !config.isConfigured || (!canManage && requestMethod !== 'GET')} className="rounded-lg bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 dark:bg-[var(--action)] dark:hover:bg-[var(--action-hover)]">{requestLoading ? 'Enviando...' : 'Executar chamada'}</button>{requestMethod !== 'GET' && <span className="text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)]">Atenção: operações de escrita podem alterar propostas e contratos reais.</span>}</div>
      {requestResult !== null && <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-[var(--bg-canvas)] p-4 text-xs text-[var(--success-text)]">{JSON.stringify(requestResult, null, 2)}</pre>}
    </section>
    <section className="rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-6 dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Catálogo INSS FINANTO</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">Consulte produtos disponíveis por modalidade; as opções retornadas vêm diretamente da API.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Operação<select value={operation} onChange={e => setOperation(e.target.value)} className="mt-1 block rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]"><option value="1">Novo</option><option value="2">Portabilidade</option><option value="3">Refinanciamento</option><option value="4">Portabilidade + refinanciamento</option></select></label>
          <button onClick={loadCatalog} disabled={catalogLoading || !config.enabled || !config.isConfigured} className="rounded-lg bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 dark:bg-[var(--action)] dark:hover:bg-[var(--action-hover)]">{catalogLoading ? 'Consultando...' : 'Consultar produtos'}</button>
        </div>
      </div>
      {catalog && <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
        {catalog.items?.length ? <table className="w-full text-left text-sm"><thead className="bg-[var(--bg-canvas)] text-xs uppercase text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)]"><tr><th className="px-3 py-2">Produto</th><th className="px-3 py-2">Código</th><th className="px-3 py-2">Operação</th><th className="px-3 py-2">Referência</th></tr></thead><tbody>{catalog.items.map((item, index) => <tr key={item.id || index} className="border-t border-[var(--field-border)] dark:border-[var(--field-border)]"><td className="px-3 py-2 font-medium">{item.name || '—'}</td><td className="px-3 py-2">{item.code ?? '—'}</td><td className="px-3 py-2">{item.operation?.name || '—'}</td><td className="px-3 py-2">{item.referenceCode || '—'}</td></tr>)}</tbody></table> : <div className="p-4 text-sm text-[var(--text-secondary)]">Nenhum produto retornado para essa operação.</div>}
      </div>}
    </section>
    <section className="rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-6 dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
      <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Módulos planejados para operação</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">A configuração é a primeira etapa. Cada fluxo abaixo será conectado às telas de simulação e propostas sem expor a chave no cliente.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['Catálogo e tabelas', 'INSS: novo e portabilidade', 'Refinanciamento e multiprodutos', 'IN100 e cartão benefício', 'Consignado privado CLT', 'Seguro', 'Aprovação e reformalização', 'Documentos e arquivos', 'Status e cadastros FINANTO'].map(item => <div key={item} className="rounded-lg border border-[var(--field-border)] px-3 py-2.5 text-sm text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:text-[var(--text-primary)]">{item}</div>)}</div>
    </section>
  </div>;
};

export const FinantoIntegrationTab: React.FC<{ promoterId?: string }> = ({ promoterId }) => promoterId ? <FinantoIntegrationTabContent promoterId={promoterId} /> : <BankPromoterConnection>{id => <FinantoIntegrationTabContent promoterId={id} />}</BankPromoterConnection>;
