import React, { useEffect, useRef, useState } from 'react';
import { promoterApiUrl } from './BankPromoterConnection';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

type Choice = { id: string; name: string; code?: string };
type Received = { id: string; row: { id: string; proposalNumber: string; agent: string; bank: string; product: string; agreement: string; operation: string; status: string; clientName: string; releasedValue: number; contractValue: number; installmentsCount: number; installmentValue: number }; partnerId?: string; proposalId?: string; message?: string; state: string; lastSyncAt: string };
const empty = { enabled: false, username: '', authOrigin: 'https://go-api.workbankvirtual.com.br', extractOrigin: 'https://goapi.workbankvirtual.com.br', hasClientKey: false, hasPublicKey: false };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function WorkbankIntegrationTab({ promoterId }: { promoterId: string }) {
  const [config, setConfig] = useState(empty), [clientKey, setClientKey] = useState(''), [publicKey, setPublicKey] = useState('');
  const [items, setItems] = useState<Received[]>([]), [options, setOptions] = useState<{ partners: Choice[]; banks: Choice[]; products: Choice[]; convenios: Choice[] }>({ partners: [], banks: [], products: [], convenios: [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requests = useRef(new AbortController());
  const [start, setStart] = useState(''), [end, setEnd] = useState(''), [page, setPage] = useState(1), [hasNextPage, setHasNextPage] = useState(false), [batchId, setBatchId] = useState('');
  const [selections, setSelections] = useState<Record<string, { partnerId?: string; bankId?: string; productId?: string; convenioId?: string; type?: string }>>({});
  const user = StorageService.getActiveUser();
  const can = (permission: string) => hasPermission(user?.role, user?.customPermissions, permission);
  const canManage = can('integrations.manage'), canSync = canManage || can('integrations.sync');
  async function api(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    const response = await fetch(promoterApiUrl(`/api/integrations/workbank/${path}`, promoterId), { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || requests.current.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'A WorkBank não confirmou a operação.');
    return data;
  }
  async function load(cursor?: string, signal?: AbortSignal) {
    const data = await api(`records${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, signal);
    setItems(data.items); setNextCursor(data.nextCursor);
  }
  useEffect(() => {
    const controller = new AbortController();
    requests.current = controller;
    Promise.all([api('config', 'GET', undefined, controller.signal), api('options', 'GET', undefined, controller.signal), load(undefined, controller.signal)])
      .then(([saved, choices]) => { if (!controller.signal.aborted) { setConfig(saved); setOptions(choices); } })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha ao carregar WorkBank.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [promoterId]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir.'); } finally { setBusy(false); }
  }
  function select(id: string, field: string, value: string) { setSelections(previous => ({ ...previous, [id]: { ...previous[id], [field]: value } })); }
  async function processBatch(id: string) {
    for (;;) {
      const result = await api(`batches/${encodeURIComponent(id)}/step`, 'POST', {});
      setNotice(`Processando página: ${result.processed}/${result.total}. Propostas sem vínculo permanecem na fila interna.`);
      if (result.done) break;
    }
    setBatchId(''); await load(); await StorageService.syncSpecificEntity('Proposal');
  }
  const field = 'w-full min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent p-2';
  return <section className="space-y-4 min-w-0" aria-label="Integração WorkBank">
    <header><h2 className="text-xl font-bold">WorkBank · Consulta de propostas</h2><p className="text-sm text-slate-500">Conexão exclusiva da empresa e promotora selecionadas. Sem simulação ou contratação nesta API.</p></header>
    {error && <p role="alert" className="rounded-lg border border-rose-500 p-3 text-rose-500">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-cyan-600 p-3">{notice}</p>}
    {loading && <p role="status">Carregando a conexão WorkBank…</p>}
    <fieldset disabled={loading || busy || !canManage} className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-3">
      <legend className="px-2 font-bold">Credenciais</legend>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label>Login do agente<input autoComplete="off" className={field} value={config.username} onChange={e => setConfig({ ...config, username: e.target.value })} /></label>
        <label>clientKey<input type="password" autoComplete="new-password" className={field} value={clientKey} placeholder={config.hasClientKey ? 'Cadastrada — preencha para alterar' : ''} onChange={e => setClientKey(e.target.value)} /></label>
        <label>publicKey<input type="password" autoComplete="new-password" className={field} value={publicKey} placeholder={config.hasPublicKey ? 'Cadastrada — preencha para alterar' : ''} onChange={e => setPublicKey(e.target.value)} /></label>
      </div>
      <p className="text-sm text-slate-500">A documentação recebida usa dois domínios. Confirme os destinos oficiais autorizados para a sua conexão.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{(['authOrigin', 'extractOrigin'] as const).map(key => <label key={key}>{key === 'authOrigin' ? 'Domínio de autenticação' : 'Domínio do extrato'}<select className={field} value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })}>{['https://go-api.workbankvirtual.com.br', 'https://goapi.workbankvirtual.com.br'].map(origin => <option key={origin}>{origin}</option>)}</select></label>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />Habilitar WorkBank</label>
      <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => run(async () => { setConfig(await api('config', 'PUT', { ...config, clientKey, publicKey })); setClientKey(''); setPublicKey(''); setNotice('Configuração salva para esta promotora.'); })}>Salvar conexão</button><button type="button" className="rounded-lg border px-4 py-2" onClick={() => run(async () => setNotice((await api('test', 'POST', {})).message))}>Testar autenticação salva</button></div>
    </fieldset>
    <fieldset disabled={loading || busy || !canSync} className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-3">
      <legend className="px-2 font-bold">Consultar por DataOperacao</legend>
      <div className="flex flex-wrap items-end gap-3"><label>Início<input type="date" className={field} value={start} onChange={e => { setStart(e.target.value); setPage(1); setHasNextPage(false); }} /></label><label>Término<input type="date" className={field} value={end} onChange={e => { setEnd(e.target.value); setPage(1); setHasNextPage(false); }} /></label><span>Página {page}</span><button type="button" disabled={!start || !end || !!batchId} className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => run(async () => {
        const result = await api('extract', 'POST', { datainicio: start.replaceAll('-', ''), datatermino: end.replaceAll('-', ''), pageNumber: page });
        setBatchId(result.batchId); setHasNextPage(result.hasNextPage); await processBatch(result.batchId);
        setNotice(`Página ${page} consultada: ${result.count} registros processados, ${result.invalid} inválidos. ${result.hasNextPage ? 'Consulte a próxima página.' : 'Última página.'}`);
      })}>Consultar / atualizar página</button>
      {hasNextPage && !batchId && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => { setPage(value => value + 1); setHasNextPage(false); }}>Próxima página do extrato</button>}
      {batchId && <button type="button" className="rounded-lg border px-4 py-2" onClick={() => run(() => processBatch(batchId))}>Retomar processamento</button>}</div>
      <p className="text-sm text-slate-500">A consulta atualiza apenas propostas já importadas por esta conexão. Novas propostas exigem revisão e vínculo explícito antes de entrar em Produção.</p>
    </fieldset>
    <section className="space-y-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">Recebidas · Aguardando vínculo / revisão</h3><button disabled={busy} type="button" onClick={() => run(() => load())}>Atualizar fila / voltar ao início</button></div>
      {!items.length && <p className="rounded-lg border border-dashed p-6 text-center">Nenhum registro recebido nesta conexão.</p>}
      {items.map(item => <article key={item.id} className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-3">
        <header className="flex flex-wrap justify-between gap-2"><strong>#{item.row.proposalNumber} · {item.row.clientName}</strong><span>{item.state === 'IMPORTED' ? 'Enviada à Produção' : item.state === 'WAITING_AGENT' ? 'Aguardando vínculo do agente' : 'Agente vinculado · aguarda revisão'}</span></header>
        <p><strong>Agente WorkBank: {item.row.agent || 'Não informado'}</strong></p><p className="text-sm">{item.row.bank} · {item.row.product} · {item.row.agreement} · {item.row.operation}</p>
        <p className="text-sm">Status: {item.row.status} · Liberado: {money(item.row.releasedValue)} · Parcela: {money(item.row.installmentValue)} · {item.row.installmentsCount} meses</p>
        {item.message && <p role="alert" className="text-amber-600 dark:text-amber-400">{item.message}</p>}
        {!item.proposalId && <fieldset disabled={busy || !canManage} className="space-y-3"><div className="flex flex-wrap gap-2"><label className="flex-1 min-w-0">Parceiro interno<select className={field} value={selections[item.id]?.partnerId || item.partnerId || ''} onChange={e => select(item.id, 'partnerId', e.target.value)}><option value="">Selecione o parceiro correto</option>{options.partners.map(partner => <option key={partner.id} value={partner.id}>{partner.code} · {partner.name}</option>)}</select></label><button type="button" className="rounded-lg border px-4 py-2 self-end" disabled={!item.row.agent || !(selections[item.id]?.partnerId || item.partnerId)} onClick={() => run(async () => { await api('agents', 'POST', { name: item.row.agent, partnerId: selections[item.id]?.partnerId || item.partnerId }); await load(); setNotice('Nome do agente vinculado. Confira banco, produto, convênio e status antes de enviar à Produção.'); })}>Vincular este nome ao parceiro</button></div>
          {item.partnerId && <><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">{([['bankId', 'Banco interno', options.banks], ['productId', 'Produto interno', options.products], ['convenioId', 'Convênio interno', options.convenios]] as const).map(([key, title, choices]) => <label key={key}>{title}<select className={field} value={selections[item.id]?.[key] || ''} onChange={e => select(item.id, key, e.target.value)}><option value="">Selecione</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>)}<label>Tipo da operação<select className={field} value={selections[item.id]?.type || ''} onChange={e => select(item.id, 'type', e.target.value)}><option value="">Selecione</option>{['NOVO', 'REFIN', 'PORTABILIDADE', 'REFIN_PORTABILIDADE', 'CARTAO_RMC', 'CARTAO_RCC', 'SAQUE_COMPLEMENTAR'].map(type => <option key={type}>{type}</option>)}</select></label></div><button type="button" disabled={!can('proposals.create') || !['bankId', 'productId', 'convenioId', 'type'].every(key => (selections[item.id] as any)?.[key])} className="rounded-lg bg-emerald-600 px-4 py-2 text-white" onClick={() => run(async () => { await api(`records/${encodeURIComponent(item.id)}/publish`, 'POST', selections[item.id]); await load(); await StorageService.syncSpecificEntity('Proposal'); setNotice('Proposta vinculada e enviada à Produção.'); })}>Confirmar revisão e enviar à Produção</button></>}
        </fieldset>}
      </article>)}
      {nextCursor && <button disabled={busy} type="button" className="rounded-lg border px-4 py-2" onClick={() => run(() => load(nextCursor))}>Próximos registros da fila</button>}
    </section>
  </section>;
}
