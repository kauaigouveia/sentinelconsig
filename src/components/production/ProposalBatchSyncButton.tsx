import React, { useState } from 'react';
import type { Bank, Proposal } from '../../types';
import { syncProposalBatch } from '../../services/proposalBatchSync';
export function ProposalBatchSyncButton({ proposals, banks, onCompleted }: { proposals: Proposal[]; banks: Bank[]; onCompleted: () => Promise<void> }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [progress, setProgress] = useState(0);
  const [targets, setTargets] = useState<Proposal[]>([]), [result, setResult] = useState<Awaited<ReturnType<typeof syncProposalBatch>> | null>(null), [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { const rows = await syncProposalBatch(targets, banks, done => setProgress(done)); setResult(rows); await onCompleted(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir.'); } finally { setBusy(false); }
  };
  return <>
    <button disabled={!proposals.length || busy} onClick={() => { setTargets([...proposals]); setProgress(0); setResult(null); setError(''); setOpen(true); }} className="rounded-lg border border-blue-300 dark:border-blue-700 px-3 py-2 text-xs font-bold text-blue-600 dark:text-blue-300 disabled:opacity-40">Atualizar propostas via APIs</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><section role="dialog" aria-modal="true" aria-labelledby="proposal-batch-title" className="w-full max-w-2xl space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
      <h2 id="proposal-batch-title" className="text-lg font-bold">Atualizar propostas via APIs</h2>
      <p className="text-sm">{targets.length} propostas da carteira carregada. Cada consulta usa o banco e a promotora da própria proposta. Consulta os status e dados das operações existentes.</p>
      <p role="status" className="text-sm">{busy ? `Consultando ${progress}/${targets.length}… Mantenha esta tela aberta.` : result ? `${result.filter(row => row.state === 'OK').length} consultadas, ${result.filter(row => row.state === 'FAILED').length} falhas e ${result.filter(row => row.state === 'SKIPPED').length} ignoradas.` : 'Confirme para consultar os status e atualizar os dados retornados pelas integrações disponíveis.'}</p>
      {result && <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">{result.map(row => <li key={row.id}>ADE {row.ade} · {row.provider || 'Sem conexão'}: {row.message}</li>)}</ul>}
      {error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex justify-end gap-2"><button disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2">{result ? 'Fechar' : 'Cancelar'}</button>{!result && <button disabled={busy} onClick={run} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-40">Atualizar {targets.length} propostas</button>}</div>
    </section></div>}
  </>;
}
