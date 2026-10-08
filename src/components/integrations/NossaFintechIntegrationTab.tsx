import React, { useEffect, useState } from 'react';
import { Activity, Eye, EyeOff, KeyRound, LoaderCircle, Save, ShieldCheck } from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

type Config = { isConfigured: boolean; enabled: boolean };
type ApiResult = { success?: boolean; status?: number; data?: any; error?: string; responseTimeMs?: number; message?: string };

const endpointOptions = [
  ['GET', '/nossa/v1/balance/history', 'FGTS · histórico de consultas'],
  ['POST', '/nossa/v1/balance', 'FGTS · consultar saldo'],
  ['POST', '/nossa/v2/simulation', 'FGTS · listar tabelas'],
  ['POST', '/nossa/v1/simulation', 'FGTS · simular'],
  ['POST', '/nossa/v1/proposal', 'FGTS · criar proposta'],
  ['GET', '/nossa/v1/proposal/{debt_key}', 'FGTS · consultar proposta'],
  ['GET', '/nossa/v1/proposal/link_form/{debt_key}', 'FGTS · link de formalização'],
  ['PUT', '/nossa/v1/update_bank_data/{debt_key}', 'FGTS · atualizar conta'],
  ['POST', '/nossa/v1/cancel_operation', 'FGTS · cancelar proposta'],
  ['POST', '/inss/v1/create_authorization', 'INSS · criar autorização SMS'],
  ['GET', '/inss/v1/check_authorization_status?cpf={cpf}&phone={phone}', 'INSS · consultar autorização'],
  ['POST', '/inss/v1/balance', 'INSS · consultar benefício'],
  ['GET', '/inss/v1/rebates_parceiro?op_type=NOVO&legal_rep=false', 'INSS · tabelas Novo'],
  ['POST', '/inss/v1/simulation', 'INSS · simular Novo'],
  ['POST', '/inss/v1/operation', 'INSS · criar operação'],
  ['GET', '/inss/v1/operation', 'INSS · listar operações'],
  ['GET', '/inss/v1/operation/{debt_key}', 'INSS · detalhes da operação'],
  ['POST', '/inss/v1/operation/change_disbursement_date', 'INSS · alterar conta/desembolso'],
  ['POST', '/inss/v1/cancel_permanently', 'INSS · cancelar permanentemente'],
  ['POST', '/inss/v1/audit/operation', 'INSS · aprovar/reprovar auditoria'],
  ['GET', '/inss/v1/rebates_parceiro?op_type=PORT-REFIN&legal_rep=false', 'Port/Refin · listar tabelas'],
  ['POST', '/port-refin/v1/simulation', 'Port/Refin · simular uma tabela'],
  ['POST', '/port-refin/v1/operation', 'Port/Refin · criar operação'],
  ['POST', '/port-refin/v1/operation/change_disbursement_date', 'Port/Refin · alterar dados bancários'],
  ['PATCH', '/port-refin/v1/delete_proposal', 'Port/Refin · cancelar proposta'],
  ['GET', '/clt-loan/v1/banking-institutions', 'CLT · listar bancarizadoras'],
  ['POST', '/clt-loan/v1/request-authorization', 'CLT · criar autorização'],
  ['POST', '/clt-loan/v1/check-authorization', 'CLT · consultar autorização'],
  ['POST', '/clt-loan/v1/check-employee-enrollment', 'CLT · consultar vínculo/CNPJ'],
  ['POST', '/clt-loan/v1/get-margin', 'CLT · consultar margem'],
  ['GET', '/clt-loan/v1/list-rebates', 'CLT · listar tabelas'],
  ['POST', '/clt-loan/v1/simulate-loan', 'CLT · simular crédito'],
  ['POST', '/clt-loan/v1/submit-proposal', 'CLT · criar proposta'],
  ['GET', '/clt-loan/v1/get-operations', 'CLT · listar operações'],
  ['GET', '/clt-loan/v1/get-operation-details/{debt_key}', 'CLT · detalhes da operação'],
  ['POST', '/clt-loan/v1/cancel-proposal', 'CLT · cancelar proposta'],
] as const;

const defaultBody: Record<string, string> = {
  '/nossa/v1/balance': '{\n  "cpf": "",\n  "service_type": "qi"\n}',
  '/nossa/v2/simulation': '{\n  "cpf": "",\n  "key": "",\n  "number_of_installments": 4,\n  "eligibility": true,\n  "service_type": "qi"\n}',
  '/nossa/v1/simulation': '{\n  "cpf": "",\n  "key": "",\n  "number_of_installments": 4,\n  "eligibility": true,\n  "cod_produto": 0,\n  "service_type": "qi"\n}',
  '/inss/v1/create_authorization': '{\n  "cpf": "",\n  "name": "",\n  "email": "",\n  "phone": ""\n}',
  '/inss/v1/balance': '{\n  "cpf": "",\n  "beneficio": ""\n}',
  '/inss/v1/simulation': '{\n  "installment_face_value": 0,\n  "number_of_installments": 84,\n  "cod_produto": 0\n}',
  '/inss/v1/operation': '{\n  "operation": {},\n  "client": {}\n}',
  '/port-refin/v1/simulation': '{\n  "last_due_balance": 0,\n  "installment_face_value": 0,\n  "portability": { "opened_installment_number": "0" },\n  "refinancing": { "number_of_installments": "96", "cod_tabela": "" }\n}',
  '/port-refin/v1/operation': '{\n  "operation": {},\n  "client": {}\n}',
  '/clt-loan/v1/get-margin': '{\n  "document_number": "",\n  "employer_document": "",\n  "service_type": "QITECH"\n}',
  '/clt-loan/v1/simulate-loan': '{\n  "margin_key": "",\n  "simulation_type": "Payment",\n  "employer_document": "",\n  "requested_amount": 0,\n  "service_type": "QITECH",\n  "cod_tabela": ""\n}',
};

const money = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const NossaFintechIntegrationTab: React.FC = () => {
  const user = StorageService.getActiveUser();
  const canManage = ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN', 'GESTOR'].includes(user?.role || '') || hasPermission(user?.role, user?.customPermissions, 'integrations.manage');
  const [config, setConfig] = useState<Config>({ isConfigured: false, enabled: false });
  const [cpf, setCpf] = useState('');
  const [promoterId, setPromoterId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [endpointIndex, setEndpointIndex] = useState(0);
  const [path, setPath] = useState(endpointOptions[0][1] as string);
  const [body, setBody] = useState('{}');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [portInput, setPortInput] = useState({ lastDueBalance: '', installmentFaceValue: '', openedInstallmentNumber: '', numberOfInstallments: '96', legalRepresentative: false });
  const [portResults, setPortResults] = useState<ApiResult | null>(null);

  useEffect(() => {
    fetch('/api/integrations/nossa-fintech/config').then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha ao carregar configuração.'); setConfig(data);
    }).catch(error => setNotice(error.message)).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/integrations/nossa-fintech/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(cpf ? { cpf } : {}), ...(promoterId ? { promoterId } : {}), ...(password ? { password } : {}), enabled: config.enabled }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha ao salvar.');
      setConfig(data.config); setCpf(''); setPromoterId(''); setPassword(''); setNotice('Configuração salva. As credenciais ficam criptografadas no servidor.');
    } catch (error: any) { setNotice(error.message || 'Erro ao salvar configuração.'); } finally { setBusy(false); }
  };

  const testConnection = async () => {
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/integrations/nossa-fintech/test-connection', { method: 'POST' }); const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Falha de autenticação.');
      setNotice(`Acesso autenticado com sucesso (${data.responseTimeMs} ms).`);
    } catch (error: any) { setNotice(error.message || 'Falha na conexão.'); } finally { setBusy(false); }
  };

  const runRequest = async () => {
    setBusy(true); setResult(null); setNotice('');
    let parsed: unknown;
    try { parsed = body.trim() ? JSON.parse(body) : undefined; } catch { setNotice('O corpo da requisição não é um JSON válido.'); setBusy(false); return; }
    const method = endpointOptions[endpointIndex][0];
    if (method !== 'GET' && !window.confirm('Esta chamada pode criar, alterar ou cancelar uma autorização, proposta ou operação real. Deseja continuar?')) { setBusy(false); return; }
    try {
      const response = await fetch('/api/integrations/nossa-fintech/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, endpoint: path, body: parsed }) });
      const data = await response.json(); setResult(data); if (!response.ok) setNotice(data.error || `A API respondeu com HTTP ${data.status || response.status}.`);
    } catch (error: any) { setNotice(error.message || 'Falha na chamada.'); } finally { setBusy(false); }
  };

  const simulatePortRefin = async () => {
    setBusy(true); setPortResults(null); setNotice('');
    try {
      const response = await fetch('/api/integrations/nossa-fintech/port-refin/simulate-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...portInput, lastDueBalance: Number(portInput.lastDueBalance), installmentFaceValue: Number(portInput.installmentFaceValue), openedInstallmentNumber: Number(portInput.openedInstallmentNumber), numberOfInstallments: Number(portInput.numberOfInstallments) }) });
      const data = await response.json(); setPortResults(data); if (!response.ok) throw new Error(data.error || 'Falha na simulação.');
    } catch (error: any) { setNotice(error.message || 'Falha na simulação Port/Refin.'); } finally { setBusy(false); }
  };

  const selectedMethod = endpointOptions[endpointIndex][0];
  const rows = Array.isArray(portResults?.data?.results) ? portResults!.data.results : [];
  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando Nossa Fintech…</div>;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-indigo-100 p-3 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><KeyRound className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900 dark:text-white">Nossa Fintech</h2><p className="text-sm text-slate-500">Acesso por CPF, código da promotora e senha. Credenciais guardadas criptografadas no servidor e isoladas por empresa.</p></div></div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold">CPF de acesso<input value={cpf} onChange={e => setCpf(e.target.value)} placeholder={config.isConfigured ? 'Configurado; preencha para substituir' : 'CPF cadastrado na Nossa Fintech'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
        <label className="text-xs font-semibold">Código da promotora<input value={promoterId} onChange={e => setPromoterId(e.target.value)} placeholder={config.isConfigured ? 'Configurado; preencha para substituir' : 'promot_id'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>
        <label className="text-xs font-semibold">Senha<div className="mt-1 flex rounded-lg border border-slate-300 dark:border-slate-700"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={config.isConfigured ? 'Configurada; preencha para substituir' : 'Senha da API'} className="min-w-0 flex-1 bg-transparent p-2.5 text-sm outline-none" /><button type="button" onClick={() => setShowPassword(v => !v)} className="px-3 text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.enabled} onChange={e => setConfig(v => ({ ...v, enabled: e.target.checked }))} disabled={!canManage} />Ativar integração</label>{canManage && <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Salvar configuração</button>}<button onClick={testConnection} disabled={busy || !config.isConfigured} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50 dark:border-slate-700"><Activity className="h-4 w-4" />Testar autenticação</button><span className="inline-flex items-center gap-1 text-xs text-emerald-600"><ShieldCheck className="h-4 w-4" />{config.isConfigured ? 'Credenciais cadastradas' : 'Aguardando credenciais'}</span></div>
      {notice && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{notice}</p>}
    </section>

    <section className="rounded-2xl border border-indigo-200 bg-white p-6 dark:border-indigo-950 dark:bg-slate-900">
      <div className="mb-4"><h3 className="font-bold">Simular Portabilidade + Refinanciamento em todas as tabelas elegíveis</h3><p className="mt-1 text-sm text-slate-500">A API não documenta consulta automática de dívida em qualquer banco. Preencha os dados do contrato atual; o Sentinel consulta as tabelas Port/Refin e executa uma simulação por tabela compatível.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([['Saldo devedor atual (R$)', 'lastDueBalance'], ['Parcela atual (R$)', 'installmentFaceValue'], ['Parcelas em aberto', 'openedInstallmentNumber']] as const).map(([label, key]) => <label key={key} className="text-xs font-semibold">{label}<input type="number" min="0.01" step={key === 'openedInstallmentNumber' ? '1' : '0.01'} value={portInput[key]} onChange={e => setPortInput(v => ({ ...v, [key]: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 text-sm dark:border-slate-700" /></label>)}
        <label className="text-xs font-semibold">Prazo do refinanciamento<select value={portInput.numberOfInstallments} onChange={e => setPortInput(v => ({ ...v, numberOfInstallments: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 text-sm dark:border-slate-700"><option value="84">84 meses</option><option value="96">96 meses</option><option value="108">108 meses</option></select></label>
        <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={portInput.legalRepresentative} onChange={e => setPortInput(v => ({ ...v, legalRepresentative: e.target.checked }))} />Possui representante legal</label>
      </div>
      <button onClick={simulatePortRefin} disabled={busy || !config.enabled || !config.isConfigured || !portInput.lastDueBalance || !portInput.installmentFaceValue || !portInput.openedInstallmentNumber || !portInput.numberOfInstallments} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Activity className="h-4 w-4" />{busy ? 'Consultando tabelas e simulando…' : 'Calcular em todas as tabelas'}</button>
      {portResults?.data?.message && <p className="mt-3 text-sm text-amber-700">{portResults.data.message}</p>}
      {rows.length > 0 && <div className="mt-4 overflow-x-auto rounded-lg border dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-xs dark:bg-slate-800"><tr><th className="p-2">Tabela/produto</th><th className="p-2">Prazo</th><th className="p-2">Resultado</th></tr></thead><tbody>{rows.map((row: any, index: number) => { const amount = row.data?.refinancing_credit_operation?.disbursement_options?.final_disbursement_amount; return <tr key={`${row.table?.cod_tabela || index}`} className="border-t dark:border-slate-800"><td className="p-2">{row.table?.name || row.table?.cod_tabela || 'Tabela'}</td><td className="p-2">{portInput.numberOfInstallments} meses</td><td className="p-2">{row.success ? <span className="font-semibold text-emerald-600">Troco estimado {amount != null ? money(amount) : 'calculado'}</span> : <span className="text-rose-600">Indisponível (HTTP {row.status})</span>}</td></tr>; })}</tbody></table></div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4"><h3 className="font-bold">Operações documentadas da API</h3><p className="mt-1 text-sm text-slate-500">Consultas, autorizações, tabelas, simulações, propostas, acompanhamento, atualização de conta e cancelamento para FGTS, INSS, Port/Refin e CLT.</p></div>
      <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_2fr]"><label className="text-xs font-semibold">Operação<select value={endpointIndex} onChange={e => { const index = Number(e.target.value); setEndpointIndex(index); setPath(endpointOptions[index][1]); setBody(defaultBody[endpointOptions[index][1]] || '{}'); setResult(null); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 text-sm dark:border-slate-700">{endpointOptions.map(([method, endpoint, label], index) => <option key={`${method}:${endpoint}:${index}`} value={index}>{label}</option>)}</select></label><label className="text-xs font-semibold">Caminho e parâmetros<input value={path} onChange={e => setPath(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-transparent p-2.5 font-mono text-xs dark:border-slate-700" /></label></div>
      {selectedMethod !== 'GET' && <label className="mt-3 block text-xs font-semibold">Corpo JSON<textarea rows={8} spellCheck={false} value={body} onChange={e => setBody(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950" /></label>}
      <button onClick={runRequest} disabled={busy || !config.enabled || !config.isConfigured} className="mt-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-violet-700">{busy ? 'Enviando…' : `Executar ${selectedMethod}`}</button>
      {result && <pre className="mt-4 max-h-[32rem] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-300">{JSON.stringify(result, null, 2)}</pre>}
    </section>
  </div>;
};
