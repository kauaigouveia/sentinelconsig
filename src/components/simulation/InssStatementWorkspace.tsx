import React, { useEffect, useRef, useState } from 'react';
import type { InssStatement, ReviewedInssStatement } from '../../lib/inssStatement';
import { MAX_SIMULATION_CONTRACTS } from '../../lib/multiContractSimulation';
import { inssProjectedMargin } from '../../lib/inssProjectedMargin';
import { parseCurrency } from '../../lib/utils';
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
  const [flow, setFlow] = useState<'multi'>();
  const [clientAuthorized, setClientAuthorized] = useState(false);
  const [contractCount, setContractCount] = useState(0);
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
    setLoading(true); setError(''); setStatement(undefined); setSelected([]); setIlliterate(undefined); setClientAuthorized(false); setContractCount(0);
    try {
      const { readInssStatement } = await import('../../lib/readInssStatement');
      const result = await readInssStatement(file, controller.signal);
      if (controller.signal.aborted || !withinScope()) return;
      setStatement(result);
      setContractCount(result.contracts.length);
      setSelected(result.contracts.slice(0, MAX_SIMULATION_CONTRACTS).map((_, i) => i));
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
  const canSimulateNovo = Boolean(statement && !statement.loanBlocked && (parseCurrency(statement.loanMargin) ?? 0) > 0);
  const projected = statement ? inssProjectedMargin(statement.income, statement.loanMargin, statement.loanBlocked) : null;
  if (flow && statement && illiterate) {
    const reviewed: ReviewedInssStatement = { ...statement, contracts: chosen, illiterate,
      benefitContractCount: contractCount >= 1 && contractCount <= 13 ? String(contractCount) : '' };
    const props = { statement: reviewed, partners, happyEnabled, isOpen: true, onClose, onSuccess, onBack: () => setFlow(undefined) };
    return <NossaFintechPortRefinSimulationModal {...props} onContinue={onContinue} autoRunFromStatement/>;
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
      <p className="text-xs text-[var(--text-secondary)]">Confira a margem e selecione os empréstimos. Uma única consulta compara os bancos, as unificações Daycoval e a margem disponível.</p>
      {loading && <p role="status">Lendo extrato…</p>}{error && <p role="alert">{error}</p>}
      {statement && <>
        <section><h3 className="font-semibold">{statement.customer.name || 'Benefício INSS'}</h3>
          <p className="text-sm">Benefício final {statement.customer.benefitNumber.slice(-4)} · Espécie {statement.customer.benefitType}{statement.reference && ' · Competência ' + statement.reference}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">{[['Margem de empréstimo',statement.loanMargin],['Margem de cartão',statement.cardMargin],['Margem de cartão benefício',statement.benefitCardMargin]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{money(value)}</dd></div>)}</dl>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">As margens de cartão são exibidas para conferência. As simulações abaixo utilizam empréstimos.</p>
          {projected && <aside className="mt-3 rounded-lg border border-[var(--warning-border)] px-3 py-2 text-xs text-[var(--warning-text)]" aria-label="Aumento de margem INSS projetado">
            <strong>Prévia 2027: +R$ 42,00 de parcela, ainda não liberada.</strong>
            <details className="mt-1"><summary className="cursor-pointer">Ver origem da projeção</summary>
              <p className="mt-1">Renda identificada R$ 1.621,00, projeção para R$ 1.741,00. O adicional não compõe a margem atual e não é proposta bancária.</p>
              {projected.loanBlocked && <p>Benefício bloqueado para empréstimos conforme o extrato.</p>}
            </details>
          </aside>}
        </section>
        <fieldset className="rounded-lg border border-[var(--field-border)] p-3">
          <legend className="px-1 font-semibold">O cliente é analfabeto?</legend>
          <div className="flex gap-6">{(['YES','NO'] as const).map(value =>
            <label key={value} className="inline-flex items-center gap-2">
              <input type="radio" name="statement-illiterate" required checked={illiterate === value} onChange={() => setIlliterate(value)} />
              {value === 'YES' ? 'Sim' : 'Não'}
            </label>)}</div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Empréstimos do extrato ({statement.contracts.length})</h3>
          {statement.contracts.length>0 && <div className="flex gap-2 text-xs">
            <button type="button" className={button} onClick={()=>setSelected(statement.contracts.slice(0, MAX_SIMULATION_CONTRACTS).map((_,i)=>i))}>Selecionar todos</button>
            <button type="button" className={button} onClick={()=>setSelected([])}>Limpar seleção</button>
          </div>}
        </div>
        {statement.issues.length > 0 && <div role="status" className="text-sm">{[...new Set(statement.issues)].map(issue => <p key={issue}>{issue}</p>)}</div>}
        {statement.contracts.length > MAX_SIMULATION_CONTRACTS && <p>Escolha até {MAX_SIMULATION_CONTRACTS} contratos por comparação.</p>}
        {statement.contracts.length===0 && <p role="status" className="rounded-lg border border-[var(--info-border)] bg-[var(--info-bg)] px-3 py-3 text-sm text-[var(--info-text)]">
          Nenhum empréstimo ativo identificado. {canSimulateNovo ? 'Você pode simular NOVO utilizando a margem de empréstimo disponível, sem selecionar contratos.' : 'Não há portabilidade para comparar; confira a margem atual e a situação do benefício.'}
        </p>}
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
        {statement.contracts.map((c,i) => <label key={i} className={'flex items-center gap-3 rounded-lg border p-3 text-xs '+(selected.includes(i) ? 'border-[var(--action)] bg-[var(--bg-surface-elevated)]' : 'border-[var(--field-border)]')}>
          <input type="checkbox" checked={selected.includes(i)} disabled={!selected.includes(i) && selected.length >= MAX_SIMULATION_CONTRACTS}
            onChange={e => setSelected(e.target.checked ? [...selected, i] : selected.filter(index => index !== i))}/>
          <span>Banco {c.originLenderCode} · Contrato final {c.originContractNumber.slice(-4)}<br/>
          Parcela {money(c.installmentFaceValue)} · Saldo {money(c.lastDueBalance)} · {c.openedInstallmentNumber} de {c.originalTerm} restantes</span>
        </label>)}
        </div>
        {statement.contracts.length>0 && <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="font-medium">Total de contratos no benefício (Paraná)
            <input type="number" min="1" max="13" value={contractCount || ''} onChange={event=>setContractCount(Number(event.target.value)||0)}
              className="ml-2 w-16 rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-2 py-1.5"/>
          </label>
          <span className="text-[var(--text-secondary)]">Confirme o total mesmo se simular apenas alguns contratos.</span>
        </div>}
        <label className="flex items-start gap-2 rounded-lg border border-[var(--field-border)] p-3 text-xs">
          <input type="checkbox" className="mt-0.5" checked={clientAuthorized} onChange={e=>setClientAuthorized(e.target.checked)}/>
          Confirmo que o cliente autorizou esta consulta às instituições bancárias.
        </label>
        <button type="button" className="w-full rounded-xl bg-[var(--action)] px-5 py-3 text-sm font-bold text-[var(--action-ink)] disabled:opacity-50"
          disabled={!illiterate || !clientAuthorized || (!chosen.length && !canSimulateNovo)}
          onClick={() => setFlow('multi')}>
          {chosen.length===0 ? 'Simular NOVO pela margem disponível' : `Simular margem e portabilidades (${chosen.length} ${chosen.length===1?'contrato':'contratos'})`}
        </button>
        <p className="text-xs text-[var(--text-secondary)]">{chosen.length>0 ? 'As portabilidades e unificações Daycoval usam os contratos selecionados; a margem atual é simulada separadamente.' : 'Sem contratos selecionados, a consulta é exclusiva para NOVO pela margem atual.'} Prévia de aumento não é margem liberada. Cotação não equivale à aprovação bancária.</p>
      </>}
    </div>
  </div>;
}
