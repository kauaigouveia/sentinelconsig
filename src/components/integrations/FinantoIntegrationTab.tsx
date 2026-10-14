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
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 flex items-start gap-4">
        <div className="rounded-xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><KeyRound className="h-6 w-6" /></div>
        <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">FINANTO / JoinBank</h2>
          <p className="mt-1 text-sm text-slate-500">Conexão API por empresa. A chave é criptografada no servidor e nunca retorna para o navegador.</p>
        </div>
      </div>
      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando...</div> : <>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Chave API FINANTO
            <div className="mt-2 flex rounded-lg border border-slate-300 dark:border-slate-700">
              <input disabled={!canManage} type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={config.hasApiKey ? 'Chave cadastrada (preencha para substituir)' : 'Cole a chave API fornecida pela FINANTO'} className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2.5 text-sm outline-none disabled:opacity-60" autoComplete="new-password" />
              <button type="button" onClick={() => setShowKey(v => !v)} className="px-3 text-slate-500" aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </label>
          <label className="flex items-center gap-3 self-end rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <input type="checkbox" disabled={!canManage} checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} className="h-4 w-4 accent-violet-600" />
            <span><strong className="block text-slate-800 dark:text-slate-100">Ativar integração</strong><small className="text-slate-500">Libera as chamadas FINANTO para esta empresa</small></span>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canManage && <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar configuração'}</button>}
          <button onClick={test} disabled={testing || !config.isConfigured} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><Activity className="h-4 w-4" />{testing ? 'Testando...' : 'Testar conexão'}</button>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${config.isConfigured ? 'text-emerald-600' : 'text-amber-600'}`}><ShieldCheck className="h-4 w-4" />{config.isConfigured ? 'Chave configurada' : 'Aguardando chave'}</span>
        </div>
        {message && <div className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>{message.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}{message.text}</div>}
      </>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4"><h3 className="font-bold text-slate-900 dark:text-white">Operações da API FINANTO</h3><p className="mt-1 text-sm text-slate-500">Acesse os endpoints documentados usando a chave guardada no servidor. Para operações diferentes de leitura, o sistema pede confirmação.</p></div>
      <div className="grid gap-3 md:grid-cols-[130px_minmax(0,1fr)]">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Método<select value={requestMethod} onChange={e => setRequestMethod(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Endpoint (caminho relativo)<input value={requestPath} onChange={e => setRequestPath(e.target.value)} placeholder="/v3/..." className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
      </div>
      {requestMethod !== 'GET' && <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">Corpo JSON<textarea value={requestBody} onChange={e => setRequestBody(e.target.value)} rows={5} spellCheck={false} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950" /></label>}
      <div className="mt-3 flex items-center gap-3"><button onClick={runApiRequest} disabled={requestLoading || !config.enabled || !config.isConfigured || (!canManage && requestMethod !== 'GET')} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600">{requestLoading ? 'Enviando...' : 'Executar chamada'}</button>{requestMethod !== 'GET' && <span className="text-xs text-amber-700 dark:text-amber-400">Atenção: operações de escrita podem alterar propostas e contratos reais.</span>}</div>
      {requestResult !== null && <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-300">{JSON.stringify(requestResult, null, 2)}</pre>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h3 className="font-bold text-slate-900 dark:text-white">Catálogo INSS FINANTO</h3><p className="mt-1 text-sm text-slate-500">Consulte produtos disponíveis por modalidade; as opções retornadas vêm diretamente da API.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Operação<select value={operation} onChange={e => setOperation(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="1">Novo</option><option value="2">Portabilidade</option><option value="3">Refinanciamento</option><option value="4">Portabilidade + refinanciamento</option></select></label>
          <button onClick={loadCatalog} disabled={catalogLoading || !config.enabled || !config.isConfigured} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-violet-700 dark:hover:bg-violet-600">{catalogLoading ? 'Consultando...' : 'Consultar produtos'}</button>
        </div>
      </div>
      {catalog && <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        {catalog.items?.length ? <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-2">Produto</th><th className="px-3 py-2">Código</th><th className="px-3 py-2">Operação</th><th className="px-3 py-2">Referência</th></tr></thead><tbody>{catalog.items.map((item, index) => <tr key={item.id || index} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-2 font-medium">{item.name || '—'}</td><td className="px-3 py-2">{item.code ?? '—'}</td><td className="px-3 py-2">{item.operation?.name || '—'}</td><td className="px-3 py-2">{item.referenceCode || '—'}</td></tr>)}</tbody></table> : <div className="p-4 text-sm text-slate-500">Nenhum produto retornado para essa operação.</div>}
      </div>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-bold text-slate-900 dark:text-white">Módulos planejados para operação</h3>
      <p className="mt-1 text-sm text-slate-500">A configuração é a primeira etapa. Cada fluxo abaixo será conectado às telas de simulação e propostas sem expor a chave no cliente.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{['Catálogo e tabelas', 'INSS: novo e portabilidade', 'Refinanciamento e multiprodutos', 'IN100 e cartão benefício', 'Consignado privado CLT', 'Seguro', 'Aprovação e reformalização', 'Documentos e arquivos', 'Status e cadastros FINANTO'].map(item => <div key={item} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">{item}</div>)}</div>
    </section>
  </div>;
};

export const FinantoIntegrationTab: React.FC<{ promoterId?: string }> = ({ promoterId }) => promoterId ? <FinantoIntegrationTabContent promoterId={promoterId} /> : <BankPromoterConnection>{id => <FinantoIntegrationTabContent promoterId={id} />}</BankPromoterConnection>;
