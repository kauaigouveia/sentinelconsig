import React, { useEffect, useRef, useState } from 'react';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
import { promoterApiUrl } from './BankPromoterConnection';
const empty = { enabled: false, environment: 'homologation', clientId: '', hasClientSecret: false, bankId: '', promoterCode: '' };
export function ParanaIntegrationTab({ promoterId }: { promoterId: string }) {
  const [config, setConfig] = useState(empty), [secret, setSecret] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [rows, setRows] = useState<any[]>([]), [next, setNext] = useState<string | null>(null), [number, setNumber] = useState('');
  const requests = useRef(new AbortController());
  const user = StorageService.getActiveUser(), canManage = hasPermission(user?.role, user?.customPermissions, 'integrations.manage');
  const banks = StorageService.getBanks().filter(bank => bank.code === '254' || /PARAN[AÁ]/i.test(bank.name));
  const field = 'w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent p-2';
  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(promoterApiUrl(`/api/integrations/parana/${path}`, promoterId), { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: requests.current.signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'A consulta Paraná não foi concluída.'); return data;
  }
  useEffect(() => {
    const controller = new AbortController(); requests.current = controller;
    api('config').then(data => { if (!controller.signal.aborted) setConfig(data); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [promoterId]);
  async function run(action: () => Promise<void>) { if (busy || loading) return; setBusy(true); setError(''); setNotice(''); try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir.'); } finally { setBusy(false); } }
  async function list(cursor?: string) {
    const query = new URLSearchParams({ quantidadeDeItens: '100', ...(number ? { numeroDaProposta: number } : {}), ...(cursor ? { indiceDaPagina: cursor } : {}) });
    const data = await api(`proposals?${query}`); setRows(data.propostas); setNext(data.indiceDaPagina); setNotice(`${data.propostas.length} propostas retornadas para o código do promotor configurado.${data.ignoredCount ? ` ${data.ignoredCount} registros de outros códigos foram excluídos desta visualização.` : ''}`);
  }
  return <section className="space-y-4 min-w-0" aria-label="Integração API Paraná Banco">
    <header><h2 className="text-xl font-bold">Paraná Banco · API de propostas</h2><p className="text-sm text-slate-500">Conexão da empresa e promotora selecionadas. O simulador PORT + REFIN por planilha continua separado.</p></header>
    {loading && <p role="status">Carregando conexão Paraná…</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-500 p-3 text-rose-500">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-cyan-600 p-3">{notice}</p>}
    <fieldset disabled={loading || busy || !canManage} className="space-y-3 rounded-xl border border-slate-300 dark:border-slate-700 p-4"><legend className="px-2 font-bold">Credenciais e ambiente</legend>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label>Ambiente<select className={field} value={config.environment} onChange={e => setConfig({ ...config, environment: e.target.value })}><option value="homologation">Homologação</option><option value="production">Produção</option></select></label>
        <label>Banco interno<select className={field} value={config.bankId} onChange={e => setConfig({ ...config, bankId: e.target.value })}><option value="">Selecione o cadastro do Paraná Banco</option>{banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}</select></label>
        <label>client_id<input className={field} autoComplete="off" value={config.clientId} onChange={e => setConfig({ ...config, clientId: e.target.value })} /></label>
        <label>client_secret<input className={field} type="password" autoComplete="new-password" value={secret} placeholder={config.hasClientSecret ? 'Cadastrada — preencha para alterar' : ''} onChange={e => setSecret(e.target.value)} /></label>
        <label>Código do promotor no Paraná<input className={field} value={config.promoterCode} onChange={e => setConfig({ ...config, promoterCode: e.target.value })} /></label>
      </div>
      <label className="flex gap-2"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Habilitar API Paraná</label>
      <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => run(async () => { setConfig(await api('config', 'PUT', { ...config, clientSecret: secret })); setSecret(''); setNotice('Conexão Paraná salva nesta promotora.'); })}>Salvar conexão</button><button type="button" className="rounded-lg border px-4 py-2" onClick={() => run(async () => setNotice((await api('test', 'POST', {})).message))}>Testar autenticação salva</button></div>
      <p className="text-sm text-slate-500">O token é reutilizado somente durante o expires_in retornado pelo banco. Todas as consultas enviam Bearer e X-Client-Id.</p>
    </fieldset>
    <section className="space-y-3 rounded-xl border border-slate-300 dark:border-slate-700 p-4"><h3 className="font-bold">Listagem de propostas</h3><p className="text-sm text-slate-500">O GET retorna a janela de até sete dias disponibilizada pelo banco. A listagem não cadastra propostas nem atribui parceiros. Para atualizar o cadastro existente, use “Atualizar propostas via APIs” na tela de Propostas.</p>
      <div className="flex flex-wrap items-end gap-2"><label className="flex-1 min-w-0">Número da proposta (opcional)<input className={field} value={number} onChange={e => { setNumber(e.target.value); setNext(null); }} /></label><button disabled={loading || busy} type="button" className="rounded-lg border px-4 py-2" onClick={() => run(() => list())}>Consultar primeira página</button>{next && <button disabled={busy} type="button" className="rounded-lg border px-4 py-2" onClick={() => run(() => list(next))}>Próxima página</button>}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Proposta / código', 'Status Paraná', 'Tipo', 'Valor liberado', 'Parcela / prazo'].map(title => <th key={title} className="p-2 text-left whitespace-nowrap">{title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.codigoDaProposta || index} className="border-t border-slate-300 dark:border-slate-700"><td className="p-2">{row.numeroDaProposta || row.codigoDaProposta}</td><td className="p-2">{row.status}</td><td className="p-2">{row.tipoDaOperacao}</td><td className="p-2">{row.valorLiberadoParaOCliente == null ? '—' : Number(row.valorLiberadoParaOCliente).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td className="p-2">{row.valorDaParcela == null ? '—' : Number(row.valorDaParcela).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · {row.quantidadeDeParcelas ?? '—'} meses</td></tr>)}</tbody></table></div>
    </section>
  </section>;
}
