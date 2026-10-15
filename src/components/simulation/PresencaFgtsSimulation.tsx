import React, { useEffect, useRef, useState } from 'react';

type Offer = { id: number; tableId: number; name: string; amount: number; balance: number; rate: number; term: number; payments: { date: string; amount: number }[] };
type Table = { id: number; name: string; rate: number; receipt: string; status: 'pending' | 'done' | 'error'; offers: Offer[]; message?: string };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function pause(ms: number, signal: AbortSignal) { return new Promise<void>((resolve, reject) => { if (signal.aborted) return reject(new Error('Cancelado')); const abort = () => { clearTimeout(timer); reject(new Error('Cancelado')); }; const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms); signal.addEventListener('abort', abort, { once: true }); }); }

export function PresencaFgtsSimulation({ cpf }: { cpf: string }) {
  const [available, setAvailable] = useState(false), [availabilityError, setAvailabilityError] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [tables, setTables] = useState<Table[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const stored = useRef<Table[]>([]), controller = useRef<AbortController | null>(null), running = useRef(false);
  useEffect(() => {
    const request = new AbortController(); controller.current = request;
    fetch('/api/integrations/presenca/availability', { signal: request.signal, credentials: 'include', cache: 'no-store' }).then(async response => {
      if ([401, 403].includes(response.status)) return;
      const data = await response.json(); if (!response.ok) throw new Error(); if (!request.signal.aborted) setAvailable(data.fgts === true);
    }).catch(() => { if (!request.signal.aborted) setAvailabilityError(true); });
    return () => controller.current?.abort();
  }, []);
  function replace(rows: Table[]) { stored.current = rows; setTables(rows); }
  function update(receipt: string, change: Partial<Table>) { replace(stored.current.map(row => row.receipt === receipt ? { ...row, ...change } : row)); }
  async function api(action: string, body: unknown, signal: AbortSignal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`/api/integrations/presenca/fgts/${action}`, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]) });
      if (response.status === 429 && attempt < 2) {
        const header = response.headers.get('Retry-After'), seconds = Number(header);
        const wait = header && Number.isFinite(seconds) ? seconds * 1000 : header && Number.isFinite(Date.parse(header)) ? Date.parse(header) - Date.now() : 60000;
        setMessage('Limite de consultas atingido. Aguardando a janela do banco para continuar…');
        await pause(Math.max(1000, Math.min(wait, 120000)), signal); continue;
      }
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Consulta FGTS Presença não concluída.'); return data;
    }
    throw new Error('Limite de consultas FGTS Presença atingido. Tente novamente depois.');
  }
  async function run(fresh = false) {
    if (running.current) return; running.current = true; controller.current?.abort();
    const request = new AbortController(); controller.current = request; setBusy(true); setMessage('');
    try {
      if (fresh) {
        replace([]); setNotices([]); const data = await api('tables', { cpf }, request.signal); if (request.signal.aborted) return;
        replace(data.tables.map((row: Table) => ({ ...row, status: 'pending', offers: [] })));
        setMessage(data.message || ''); setNotices(data.messages || []);
      }
      const remaining = stored.current.filter(row => row.status !== 'done');
      for (const table of remaining) {
        if (request.signal.aborted) return;
        try { const result = await api('simulate', { receipt: table.receipt }, request.signal); if (request.signal.aborted) return; update(table.receipt, { status: 'done', offers: result.offers, message: result.message }); }
        catch (error) { if (request.signal.aborted) return; update(table.receipt, { status: 'error', message: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'A tabela não respondeu dentro do prazo. Você pode tentar novamente.' }); }
      }
      if (remaining.length) setMessage('Consulta finalizada. Confira os resultados e eventuais falhas por tabela.');
    } catch (error) { if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : 'Não foi possível consultar FGTS Presença.'); }
    finally { running.current = false; if (!request.signal.aborted) setBusy(false); }
  }
  if (!available) return availabilityError ? <p role="alert" className="mt-5 text-sm text-amber-600 dark:text-amber-300">Não foi possível verificar a disponibilidade FGTS Presença. Reabra o simulador para tentar novamente.</p> : null;
  const processed = tables.filter(row => row.status !== 'pending').length, failures = tables.filter(row => row.status === 'error').length;
  const offers = tables.flatMap(table => table.offers.map((offer, index) => ({ ...offer, key: `${table.receipt}:${index}` }))).sort((a, b) => b.amount - a.amount);
  return <section className="mt-5 min-w-0 space-y-3 rounded-xl border border-cyan-200 p-4 dark:border-cyan-900" aria-label="Presença FGTS">
    <h3 className="font-bold">Presença Bank · Antecipação FGTS</h3><p className="text-xs text-slate-500">Autorize a instituição no aplicativo FGTS antes da consulta. Todas as tabelas retornadas serão consultadas individualmente, com CDC desativado. Nenhuma operação será contratada.</p>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || cpf.replace(/\D/g, '').length !== 11} onClick={() => void run(true)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Consultar ofertas FGTS · Presença</button>{!busy && tables.some(row => row.status !== 'done') && <button type="button" onClick={() => void run()} className="rounded-lg border px-3 py-2 text-sm">Retomar tabelas pendentes ou com falha</button>}{busy && <button type="button" onClick={() => { controller.current?.abort(); setBusy(false); setMessage('Consulta interrompida. Resultados concluídos preservados; você pode retomar as tabelas restantes.'); }} className="rounded-lg border px-3 py-2 text-sm">Interromper consulta FGTS</button>}</div>
    {message && <p role="status" className="text-sm text-slate-500">{message}</p>}{notices.map(notice => <p key={notice} role="alert" className="text-sm text-amber-600 dark:text-amber-300">{notice}</p>)}{!!tables.length && <p role="status" className="text-sm">{processed}/{tables.length} tabelas processadas · {offers.length} ofertas · {failures} falhas.{tables.some(row => row.status !== 'done') && ' Comparação incompleta: existem tabelas pendentes ou com falha.'}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{offers.map(offer => <article key={offer.key} className="min-w-0 rounded-lg border border-slate-300 p-3 dark:border-slate-700"><strong className="text-sm">{offer.name}</strong><dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-slate-500">Valor liberado</dt><dd className="font-semibold">{money(offer.amount)}</dd></div><div><dt className="text-xs text-slate-500">Saldo total</dt><dd>{money(offer.balance)}</dd></div><div><dt className="text-xs text-slate-500">Saques antecipados</dt><dd>{offer.term}</dd></div><div><dt className="text-xs text-slate-500">Taxa da tabela</dt><dd>{offer.rate.toLocaleString('pt-BR')}%</dd></div></dl><details className="mt-2 text-sm"><summary className="cursor-pointer">Repasses por saque</summary><ul>{offer.payments.map((part, index) => <li key={index}>{part.date.split('-').reverse().join('/')} · {money(part.amount)}</li>)}</ul></details><p className="mt-2 text-xs text-slate-500">Consulta sem contratação. Valores retornados pelo Presença.</p></article>)}</div>
    {!!tables.length && <details className="text-sm"><summary className="cursor-pointer">Resultado por tabela</summary><ul className="mt-2 space-y-2">{tables.map(table => <li key={table.receipt}><strong>{table.name}</strong> · {table.status === 'pending' ? 'Pendente de consulta' : table.status === 'error' ? 'Falha' : 'Consultada'}{table.message && <p className={table.status === 'error' ? 'text-rose-500' : 'text-slate-500'}>{table.message}</p>}</li>)}</ul></details>}
  </section>;
}
