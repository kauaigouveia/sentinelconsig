import React, { useEffect, useState } from 'react';
export function BmgProposalCard({ proposalId, proposalNumber }: { proposalId: string; proposalNumber: string }) {
  const [data, setData] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setData(null); setError(''); }, [proposalId]);
  async function consult() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/integrations/bmg/proposals/${encodeURIComponent(proposalId)}`, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Falha ao consultar BMG.'); setData(result);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao consultar BMG.'); }
    finally { setBusy(false); }
  }
  return <section className="mb-4 space-y-2 rounded-xl border border-[var(--warning-border)] p-4 dark:border-[var(--warning-border)]"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">BMG · Proposta {proposalNumber}</h3><button type="button" disabled={busy} className="rounded bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)] disabled:opacity-90" onClick={() => void consult()}>{busy ? 'Consultando...' : 'Consultar BMG'}</button></div>{data && <><p className="text-sm">Status no BMG: <strong>{data.status || 'Não informado'}</strong></p>{data.formalizationLink ? <a className="text-sm text-[var(--warning-text)] underline" href={data.formalizationLink} target="_blank" rel="noopener noreferrer">Abrir formalização</a> : <p className="text-xs text-[var(--text-secondary)]">Link de formalização ainda não disponível.</p>}</>}{error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}</section>;
}
