import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Link2, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Proposal } from '../../types';

type Props = { proposal: Proposal; onProposalUpdated: (proposal: Proposal) => void; showFinanto?: boolean; showNossa?: boolean };
type Provider = 'finanto' | 'nossa-fintech';

export const ProviderProposalSyncCard: React.FC<Props> = ({ proposal, onProposalUpdated, showFinanto = true, showNossa = true }) => {
  const [finantoId, setFinantoId] = useState(proposal.finantoSimulationId || '');
  const [debtKey, setDebtKey] = useState(proposal.nossaFintechDebtKey || '');
  const [product, setProduct] = useState<NonNullable<Proposal['nossaFintechProduct']>>(proposal.nossaFintechProduct || 'PORT_REFIN');
  const [busy, setBusy] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<{ provider: Provider; ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setFinantoId(proposal.finantoSimulationId || '');
    setDebtKey(proposal.nossaFintechDebtKey || '');
    setProduct(proposal.nossaFintechProduct || 'PORT_REFIN');
    setNotice(null);
  }, [proposal.id, proposal.finantoSimulationId, proposal.nossaFintechDebtKey, proposal.nossaFintechProduct]);

  const run = async (provider: Provider, action: 'link' | 'sync') => {
    setBusy(provider); setNotice(null);
    try {
      const endpoint = `/api/proposals/${encodeURIComponent(proposal.id)}/${provider}-${action}`;
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: action === 'link' ? JSON.stringify(provider === 'finanto' ? { simulationId: finantoId.trim() } : { debtKey: debtKey.trim(), product }) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `Falha ao ${action === 'link' ? 'vincular' : 'sincronizar'} ${provider}.`);
      if (data.proposal) onProposalUpdated(data.proposal);
      setNotice({ provider, ok: true, message: action === 'link' ? 'Operação vinculada à proposta.' : 'Proposta atualizada com o retorno da API.' });
    } catch (error) {
      setNotice({ provider, ok: false, message: error instanceof Error ? error.message : 'Falha na operação.' });
    } finally { setBusy(null); }
  };

  const date = (value?: string) => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não sincronizada';
  const cardClass = 'rounded-xl border border-[var(--field-border)] p-4 dark:border-[var(--field-border)]';
  const inputClass = 'min-w-0 flex-1 rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]';
  const buttonClass = 'inline-flex items-center gap-2 rounded-lg bg-[var(--info-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-90';

  return <div className="space-y-4">
    <p className="text-sm text-[var(--text-secondary)]">A sincronização usa automaticamente o identificador da operação vinculada. Os campos abaixo permitem cadastrar ou alterar esse vínculo.</p>
    {showFinanto && <section className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">FINANTO / JoinBank</h4><p className="mt-1 text-xs text-[var(--text-secondary)]">{proposal.finantoSimulationId ? `ID ${proposal.finantoSimulationId} · ${proposal.finantoStatus || 'Sem status retornado'}` : 'Nenhuma simulação FINANTO vinculada.'}</p><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Última atualização: {date(proposal.finantoLastSyncAt)}</p></div>{proposal.finantoSimulationId && <button type="button" onClick={() => void run('finanto', 'sync')} disabled={busy !== null} className={buttonClass}><RefreshCw className={`h-3.5 w-3.5 ${busy === 'finanto' ? 'animate-spin' : ''}`} />Sincronizar agora</button>}</div>
      <div className="mt-3 flex flex-wrap gap-2"><input value={finantoId} onChange={e => setFinantoId(e.target.value)} placeholder="ID local ou ID FINANTO da simulação" className={inputClass} /><button type="button" onClick={() => void run('finanto', 'link')} disabled={busy !== null || !finantoId.trim()} className={buttonClass}><Link2 className="h-3.5 w-3.5" />Vincular</button></div>
      {proposal.finantoSyncError && <p className="mt-2 text-xs text-[var(--danger-text)]">Último erro: {proposal.finantoSyncError}</p>}
      {notice?.provider === 'finanto' && <p role="status" className={`mt-2 text-xs ${notice.ok ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}`}>{notice.message}</p>}
    </section>}
    {showNossa && <section className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">Nossa Fintech</h4><p className="mt-1 text-xs text-[var(--text-secondary)]">{proposal.nossaFintechDebtKey ? `Operação ${proposal.nossaFintechDebtKey} · ${proposal.nossaFintechStatus || 'Sem status retornado'}` : 'Nenhuma operação Nossa Fintech vinculada.'}</p><p className="mt-1 text-[11px] text-[var(--text-secondary)]">Última atualização: {date(proposal.nossaFintechLastSyncAt)}</p></div>{proposal.nossaFintechDebtKey && <button type="button" onClick={() => void run('nossa-fintech', 'sync')} disabled={busy !== null} className={buttonClass}><RefreshCw className={`h-3.5 w-3.5 ${busy === 'nossa-fintech' ? 'animate-spin' : ''}`} />Sincronizar agora</button>}</div>
      <div className="mt-3 flex flex-wrap gap-2"><input value={debtKey} onChange={e => setDebtKey(e.target.value)} aria-label="Identificador da operação Nossa Fintech" placeholder="Identificador da operação Nossa Fintech (debt_key)" className={inputClass} /><select value={product} onChange={e => setProduct(e.target.value as typeof product)} className="rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]"><option value="PORT_REFIN">Portabilidade + Refin</option><option value="INSS">INSS</option><option value="FGTS">FGTS</option><option value="CLT">CLT</option></select><button type="button" onClick={() => void run('nossa-fintech', 'link')} disabled={busy !== null || !debtKey.trim()} className={buttonClass}><Link2 className="h-3.5 w-3.5" />{proposal.nossaFintechDebtKey ? 'Alterar vínculo' : 'Vincular'}</button></div>
      {proposal.nossaFintechSyncError && <p className="mt-2 text-xs text-[var(--danger-text)]">Último erro: {proposal.nossaFintechSyncError}</p>}
      {proposal.nossaFintechStatusDescription && <p className="mt-2 text-xs text-[var(--text-secondary)]">{proposal.nossaFintechStatusDescription}</p>}
      {notice?.provider === 'nossa-fintech' && <p role="status" className={`mt-2 text-xs ${notice.ok ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}`}>{notice.message}</p>}
    </section>}
    {busy && <p className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /><Activity className="h-3.5 w-3.5" />Consultando a API…</p>}
    {notice?.ok && <CheckCircle2 className="hidden" aria-hidden="true" />}
  </div>;
};
