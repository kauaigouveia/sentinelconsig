import React, { useEffect, useRef, useState } from 'react';
import type { InssStatement, ReviewedInssStatement } from '../../lib/inssStatement';
import { MAX_SIMULATION_CONTRACTS } from '../../lib/multiContractSimulation';
import { StorageService } from '../../services/storageService';
import { NossaFintechPortRefinSimulationModal } from './NossaFintechPortRefinSimulationModal';
import { FinantoInssSimulationModal } from './FinantoInssSimulationModal';

type Props = Pick<React.ComponentProps<typeof NossaFintechPortRefinSimulationModal>, 'onClose' | 'happyEnabled' | 'onContinue'> &
  Pick<React.ComponentProps<typeof FinantoInssSimulationModal>, 'partners' | 'onSuccess'> & { scope: string };
const button = 'rounded-lg border border-[var(--field-border)] px-3 py-2 text-sm disabled:opacity-50';
const money = (value: string) => value ? Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Não informada';

export default function InssStatementWorkspace({ scope, partners, happyEnabled, onClose, onSuccess, onContinue }: Props) {
  const [statement, setStatement] = useState<InssStatement>();
  const [illiterate, setIlliterate] = useState<ReviewedInssStatement['illiterate']>();
  const [selected, setSelected] = useState<number[]>([]);
  const [flow, setFlow] = useState<'multi' | '1' | '2' | '3'>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeRead = useRef<AbortController | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const withinScope = () => scope === StorageService.getCurrentTenantId() + ':' + (StorageService.getActiveUser()?.id || '');
  useEffect(() => {
    const check = () => { if (!withinScope()) { activeRead.current?.abort(); onClose(); } };
    window.addEventListener('storage', check);
    window.addEventListener('credit_gestao_storage_update', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('credit_gestao_storage_update', check);
    };
  }, [scope, onClose]);
  useEffect(() => () => activeRead.current?.abort(), []);
  useEffect(() => { if (!flow) closeButton.current?.focus(); }, [flow]);

  async function read(file: File) {
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    setLoading(true); setError(''); setStatement(undefined); setSelected([]); setIlliterate(undefined);
    try {
      const { readInssStatement } = await import('../../lib/readInssStatement');
      const result = await readInssStatement(file, controller.signal);
      if (controller.signal.aborted || !withinScope()) return;
      setStatement(result);
      setSelected(result.contracts.length <= MAX_SIMULATION_CONTRACTS ? result.contracts.map((_, i) => i) : []);
    } catch (reason) {
      if (!controller.signal.aborted && withinScope()) {
        const msg = reason instanceof Error ? reason.message : '';
        setError(/^(Use um extrato|Selecione um|Confira CPF|O PDF contém|Formato de extrato|Página fora)/.test(msg) ? msg : 'Não foi possível ler o PDF. Use um extrato textual, íntegro e sem senha.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  if (!withinScope()) return null;
  const chosen = statement?.contracts.filter((_, i) => selected.includes(i)) ?? [];
  if (flow && statement && illiterate) {
    const reviewed: ReviewedInssStatement = { ...statement, contracts: chosen, illiterate,
      benefitContractCount: statement.issues.length ? '' : String(statement.contracts.length) };
    const props = { statement: reviewed, partners, happyEnabled, isOpen: true, onClose, onSuccess, onBack: () => setFlow(undefined) };
    if (flow === 'multi') return <NossaFintechPortRefinSimulationModal {...props} onContinue={onContinue}/>;
    return <FinantoInssSimulationModal {...props} operationCode={flow}/>;
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--scrim)] p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="statement-title" className="max-h-[92dvh] w-full max-w-4xl space-y-4 overflow-auto rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)]"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button:enabled,input:enabled');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <header className="flex items-center justify-between gap-3"><h2 id="statement-title" className="text-xl font-semibold">Simulação por extrato INSS</h2><button ref={closeButton} className={button} onClick={onClose}>Fechar</button></header>
      <label className="block text-sm font-semibold">Extrato da consulta em PDF
        <input type="file" accept=".pdf,application/pdf" className="mt-2 block max-w-full" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file); }}/>
      </label>
      <p className="text-sm text-[var(--text-secondary)]">O arquivo é lido neste navegador. Confira os dados e escolha o que simular.</p>
      {loading && <p role="status">Lendo extrato…</p>}{error && <p role="alert">{error}</p>}
      {statement && <>
        <section><h3 className="font-semibold">{statement.customer.name || 'Benefício INSS'}</h3>
          <p className="text-sm">Benefício final {statement.customer.benefitNumber.slice(-4)} · Espécie {statement.customer.benefitType}{statement.reference && ' · Competência ' + statement.reference}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">{[['Margem de empréstimo',statement.loanMargin],['Margem de cartão',statement.cardMargin],['Margem de cartão benefício',statement.benefitCardMargin]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{money(value)}</dd></div>)}</dl>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">As margens de cartão são exibidas para conferência. As simulações abaixo utilizam empréstimos.</p>
        </section>
        <fieldset className="rounded-lg border border-[var(--field-border)] p-3">
          <legend className="px-1 font-semibold">O cliente é analfabeto?</legend>
          <div className="flex gap-6">{(['YES','NO'] as const).map(value =>
            <label key={value} className="inline-flex items-center gap-2">
              <input type="radio" name="statement-illiterate" required checked={illiterate === value} onChange={() => setIlliterate(value)} />
              {value === 'YES' ? 'Sim' : 'Não'}
            </label>)}</div>
        </fieldset>
        <h3 className="font-semibold">Empréstimos para comparação ({statement.contracts.length})</h3>
        {statement.issues.length > 0 && <div role="status" className="text-sm">{[...new Set(statement.issues)].map(issue => <p key={issue}>{issue}</p>)}</div>}
        {statement.contracts.length > MAX_SIMULATION_CONTRACTS && <p>Escolha até {MAX_SIMULATION_CONTRACTS} contratos por comparação.</p>}
        {statement.contracts.map((c,i) => <label key={i} className="flex items-center gap-3 rounded-lg border border-[var(--field-border)] p-2 text-sm">
          <input type="checkbox" checked={selected.includes(i)} disabled={!selected.includes(i) && selected.length >= MAX_SIMULATION_CONTRACTS}
            onChange={e => setSelected(e.target.checked ? [...selected, i] : selected.filter(index => index !== i))}/>
          <span>Banco {c.originLenderCode} · Contrato final {c.originContractNumber.slice(-4)}<br/>
          Parcela R$ {c.installmentFaceValue} · Saldo do extrato R$ {c.lastDueBalance} · {c.openedInstallmentNumber} de {c.originalTerm} parcelas restantes</span>
        </label>)}
        <p className="text-sm text-[var(--text-secondary)]">Os saldos e margens refletem a consulta de origem. Confira a competência e a autorização do cliente antes de consultar as instituições. A portabilidade individual usa um contrato por vez.</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={!illiterate || !chosen.length} onClick={() => setFlow('multi')}>Comparar portabilidade + refinanciamento ({chosen.length})</button>
          <button className={button} disabled={!illiterate || chosen.length !== 1} onClick={() => setFlow('2')}>Portabilidade individual</button>
          <button className={button} disabled={!illiterate || !chosen.length} onClick={() => setFlow('3')}>Consultar refinanciamento</button>
          <button className={button} disabled={!illiterate || Number(statement.loanMargin) <= 0} onClick={() => setFlow('1')}>Simular novo pela margem</button>
        </div>
      </>}
    </div>
  </div>;
}
