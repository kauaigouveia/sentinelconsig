import React, { useEffect, useRef, useState } from 'react';
import type { InssStatement, ReviewedInssStatement } from '../../lib/inssStatement';
import { inssProjectedMargin, estimateProjectedInssLoan } from '../../lib/inssProjectedMargin';
import { emptyStatementQuotes, simulateInssStatementComplete, type StatementAutoQuotes } from '../../lib/inssStatementAutoQuotes';
import { parseCurrency } from '../../lib/utils';
import { StorageService } from '../../services/storageService';
import { NossaFintechPortRefinSimulationModal } from './NossaFintechPortRefinSimulationModal';
import { FinantoInssSimulationModal } from './FinantoInssSimulationModal';

type Props = Pick<React.ComponentProps<typeof NossaFintechPortRefinSimulationModal>, 'onClose' | 'happyEnabled' | 'onContinue'> &
  Pick<React.ComponentProps<typeof FinantoInssSimulationModal>, 'partners' | 'onSuccess'> & { scope: string };

const button = 'rounded-lg border border-[var(--field-border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50';
const amount = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (value: string) => {
  const number = parseCurrency(value);
  return number == null ? 'Não informada' : amount(number);
};
const quoteSource = (source: string) => source === 'API' ? 'API bancária' : 'Estimativa por planilha';

export default function InssStatementWorkspace({ scope, onClose }: Props) {
  const [statement, setStatement] = useState<InssStatement>();
  const [illiterate, setIlliterate] = useState<ReviewedInssStatement['illiterate']>();
  const [clientAuthorized, setClientAuthorized] = useState(false);
  const [reading, setReading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [progress, setProgress] = useState<{completed:number;total:number}|null>(null);
  const [quotes, setQuotes] = useState<StatementAutoQuotes>(() => emptyStatementQuotes());
  const [error, setError] = useState('');
  const readController = useRef<AbortController | null>(null);
  const quoteController = useRef<AbortController | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const withinScope = () => scope === StorageService.getCurrentTenantId() + ':' + (StorageService.getActiveUser()?.id || '');

  useEffect(() => {
    const check = () => {
      if (!withinScope()) { readController.current?.abort(); quoteController.current?.abort(); onClose(); }
    };
    window.addEventListener('storage', check);
    window.addEventListener('credit_gestao_storage_update', check);
    return () => {
      readController.current?.abort();
      quoteController.current?.abort();
      window.removeEventListener('storage', check);
      window.removeEventListener('credit_gestao_storage_update', check);
    };
  }, [scope, onClose]);

  async function read(file: File) {
    readController.current?.abort();
    quoteController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setReading(true);
    setSimulating(false);
    setStatement(undefined);
    setIlliterate(undefined);
    setClientAuthorized(false);
    setProgress(null);
    setQuotes(emptyStatementQuotes());
    setError('');
    try {
      const { readInssStatement } = await import('../../lib/readInssStatement');
      const parsed = await readInssStatement(file, controller.signal);
      if (!controller.signal.aborted && withinScope()) setStatement(parsed);
    } catch (reason) {
      if (!controller.signal.aborted && withinScope()) {
        const message = reason instanceof Error ? reason.message : '';
        setError(/^(Use um extrato|Selecione um|Confira CPF|O PDF contém|Formato de extrato|Página fora)/.test(message)
          ? message : 'Não foi possível ler o PDF. Use um extrato textual, íntegro e sem senha.');
      }
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }

  async function runAll() {
    if (!statement || !illiterate || !clientAuthorized || simulating || !withinScope()) return;
    quoteController.current?.abort();
    const controller = new AbortController();
    quoteController.current = controller;
    const reviewed: ReviewedInssStatement = {
      ...statement, illiterate, benefitContractCount: statement.issues.length ? '' : String(statement.contracts.length),
    };
    setSimulating(true);
    setError('');
    setQuotes(emptyStatementQuotes());
    setProgress(null);
    try {
      const result = await simulateInssStatementComplete(reviewed, controller.signal, fetch, next => {
        if (controller.signal.aborted || !withinScope()) return;
        setProgress({ completed: next.completed, total: next.total });
        setQuotes(next.quotes);
      });
      if (!controller.signal.aborted && withinScope()) setQuotes(result);
    } catch (reason) {
      if (!controller.signal.aborted && withinScope())
        setError(reason instanceof Error ? reason.message : 'Falha ao executar a comparação dos bancos.');
    } finally {
      if (!controller.signal.aborted) setSimulating(false);
    }
  }

  if (!withinScope()) return null;
  const projected = statement ? inssProjectedMargin(statement.income, statement.loanMargin, statement.loanBlocked) : null;
  const canSimulate = !!statement && !!illiterate && clientAuthorized && !reading && !simulating && statement.contracts.length <= 40;
  const hasFinished = progress !== null && progress.completed === progress.total && !simulating;

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--scrim)] p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="statement-title" className="max-h-[92dvh] w-full max-w-5xl space-y-4 overflow-auto rounded-2xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)]"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); readController.current?.abort(); quoteController.current?.abort(); onClose(); }
        if (event.key !== 'Tab') return;
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button:enabled,input:enabled');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <header className="flex items-center justify-between gap-3">
        <div><h2 id="statement-title" className="text-xl font-semibold">Simulação completa por extrato INSS</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Uma única comparação da margem atual e de todos os contratos de empréstimo identificados.</p>
        </div>
        <button ref={closeButton} className={button} onClick={() => { readController.current?.abort(); quoteController.current?.abort(); onClose(); }}>Fechar</button>
      </header>
      <label className="block text-sm font-semibold">Extrato da consulta em PDF
        <input type="file" accept=".pdf,application/pdf" className="mt-2 block max-w-full" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (file) void read(file);
        }}/>
      </label>
      <p className="text-xs text-[var(--text-secondary)]">O PDF é lido neste navegador. As instituições são consultadas somente depois de sua confirmação no botão abaixo.</p>
      {reading && <p role="status">Lendo extrato…</p>}
      {error && <p role="alert" className="rounded-lg border border-[var(--danger-border)] p-3 text-sm text-[var(--danger-text)]">{error}</p>}

      {statement && <>
        <section className="space-y-2">
          <h3 className="font-semibold">{statement.customer.name || 'Benefício INSS'}</h3>
          <p className="text-sm">Benefício final {statement.customer.benefitNumber.slice(-4)} · Espécie {statement.customer.benefitType}{statement.reference && ' · Competência ' + statement.reference}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {([['Margem de empréstimo',statement.loanMargin],['Margem de cartão',statement.cardMargin],['Margem de cartão benefício',statement.benefitCardMargin]] as const).map(([name,value]) =>
              <div key={name} className="rounded-lg border border-[var(--field-border)] p-3"><dt className="text-xs text-[var(--text-secondary)]">{name}</dt><dd className="font-bold">{money(value)}</dd></div>)}
          </dl>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">Contratos detectados no extrato: {statement.contracts.length}</h3>
          {statement.issues.length > 0 && <div role="status" className="text-xs text-[var(--warning-text)]">{[...new Set(statement.issues)].map(issue=><p key={issue}>{issue}</p>)}</div>}
          <div className="grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">
            {statement.contracts.map((c,i) => <div key={i} className="rounded-lg border border-[var(--field-border)] p-3 text-xs">
              <strong>Contrato {i+1} · Banco {c.originLenderCode} · final {c.originContractNumber.slice(-4)}</strong>
              <div className="mt-1 text-[var(--text-secondary)]">Parcela {money(c.installmentFaceValue)} · Saldo {money(c.lastDueBalance)} · {c.openedInstallmentNumber}/{c.originalTerm} parcelas restantes</div>
            </div>)}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">Todos os contratos válidos serão consultados, sem escolher apenas três nem descartar contratos silenciosamente. Cartões não são portabilidades de empréstimo.</p>
        </section>
        <fieldset className="rounded-lg border border-[var(--field-border)] p-3">
          <legend className="px-1 font-semibold">O cliente é analfabeto?</legend>
          <div className="flex gap-6 text-sm">{(['YES','NO'] as const).map(value=>
            <label key={value} className="inline-flex items-center gap-2">
              <input type="radio" name="statement-illiterate" checked={illiterate===value} onChange={()=>setIlliterate(value)}/>
              {value==='YES'?'Sim':'Não'}
            </label>)}</div>
        </fieldset>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={clientAuthorized} onChange={e=>setClientAuthorized(e.target.checked)}/>
          <span>Confirmo que o cliente autorizou a consulta das condições nas instituições bancárias configuradas.</span>
        </label>
        <button type="button" className="w-full rounded-xl bg-[var(--action)] px-5 py-3 text-sm font-bold text-[var(--action-ink)] disabled:opacity-50" disabled={!canSimulate} onClick={()=>void runAll()}>
          {simulating ? 'Consultando bancos…' : `Simular margem e portabilidades — ${statement.contracts.length} contratos`}
        </button>
        {statement.contracts.length > 40 && <p role="alert" className="text-sm text-[var(--warning-text)]">O limite de segurança deste fluxo é 40 contratos. Nenhum contrato será ignorado parcialmente.</p>}
        {progress && <p role="status" className="text-sm">Consultas concluídas: {progress.completed} de {progress.total}. {simulating ? 'As demais continuam em processamento.' : 'Comparação finalizada.'}</p>}
        {(progress || quotes.marginQuotes.length > 0 || quotes.portabilityQuotes.length > 0) && <section className="space-y-4" aria-label="Resultado da simulação completa">
          <h3 className="text-lg font-semibold">Resultado consolidado</h3>
          <div className="rounded-xl border border-[var(--field-border)] p-4">
            <h4 className="font-bold">NOVO — margem atual de {money(statement.loanMargin)}</h4>
            {statement.loanBlocked && <p className="mt-2 text-sm text-[var(--warning-text)]">Benefício bloqueado no extrato. Nenhuma margem futura foi enviada às instituições.</p>}
            <div className="mt-3 space-y-2">{quotes.marginQuotes.map((q,i)=>
              <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--field-border)] p-3 text-sm">
                <div><strong>{q.institution}</strong><p className="text-xs text-[var(--text-secondary)]">{q.table} · {quoteSource(q.source)}{q.term ? ` · ${q.term} meses` : ''}{q.rate ? ` · ${q.rate.toLocaleString('pt-BR',{maximumFractionDigits:4})}% a.m.` : ''}</p></div>
                <div className="font-bold">{amount(q.amount)}</div>
              </div>)}</div>
            {hasFinished && !quotes.marginQuotes.length && <p className="mt-3 text-sm">Nenhuma oferta positiva de empréstimo novo retornada pelas integrações habilitadas.</p>}
          </div>
          {projected && <section className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm" aria-label="Prévia de aumento de margem 2027">
            <h4 className="font-bold text-[var(--warning-text)]">Aumento projetado de 2027 · R$ 42,00 (separado)</h4>
            <p className="mt-2 text-xs text-[var(--warning-text)]">Margem ainda não liberada pela Dataprev. Não foi enviada como margem vigente às APIs. Valores teóricos com taxas atuais retornadas pelos bancos, antes de IOF, CET e seguros.</p>
            {projected.loanBlocked && <p className="mt-2 text-xs font-semibold">Benefício bloqueado; prévia apenas informativa.</p>}
            <div className="mt-3 space-y-2">{quotes.projectedQuotes.map((q,i)=>
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--warning-border)] p-3">
                <span>{q.institution} · {q.monthlyRate.toLocaleString('pt-BR',{maximumFractionDigits:4})}% a.m. · {q.term} meses</span>
                <strong>Bruto teórico: {amount(q.gross)}</strong>
              </div>)}</div>
            {hasFinished && !quotes.projectedQuotes.length && <div className="mt-2 rounded-lg border border-[var(--warning-border)] p-3 text-xs">
              <span>Prévia matemática de referência (sem API): R$ 42,00 · 1,85% a.m. · 108 meses</span>
              <strong className="ml-2">Bruto teórico: {amount(estimateProjectedInssLoan(1.85,108) ?? 0)}</strong>
            </div>}
          </section>}
          <div className="space-y-3">
            <h4 className="font-bold">Portabilidades — todos os contratos do extrato</h4>
            {statement.contracts.map((contract,index)=>{
              const found=quotes.portabilityQuotes.filter(q=>q.contractIndex===index);
              return <section key={index} className="rounded-xl border border-[var(--field-border)] p-3">
                <h5 className="font-semibold">Contrato {index+1} · Banco {contract.originLenderCode} · final {contract.originContractNumber.slice(-4)}</h5>
                {found.length ? <div className="mt-2 space-y-2">{found.map((q,i)=>
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--field-border)] p-3 text-sm">
                    <div><strong>{q.institution}</strong><div className="text-xs text-[var(--text-secondary)]">{q.table} · {quoteSource(q.source)}{q.term ? ` · ${q.term} meses` : ''}{q.rate ? ` · ${q.rate.toLocaleString('pt-BR',{maximumFractionDigits:4})}% a.m.` : ''}</div></div>
                    <strong>Troco estimado: {amount(q.amount)}</strong>
                  </div>)}</div> : <p className="mt-2 text-xs text-[var(--text-secondary)]">{hasFinished ? 'Nenhuma cotação elegível retornada para este contrato.' : 'Aguardando consulta bancária…'}</p>}
              </section>;
            })}
          </div>
          {quotes.notes.length > 0 && <details className="rounded-xl border border-[var(--field-border)] p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Pendências e retornos dos bancos ({quotes.notes.length})</summary>
            <div className="mt-2 max-h-56 space-y-2 overflow-auto text-xs text-[var(--text-secondary)]">{quotes.notes.map((note,i)=><p key={i}>{note}</p>)}</div>
          </details>}
          <p className="text-xs text-[var(--text-secondary)]">API bancária indica cálculo retornado pela integração, não aprovação de crédito. Planilhas são identificadas como estimativas. A operação de portabilidade pode incluir refinanciamento associado conforme modalidade bancária; não há botão de refinanciamento isolado.</p>
        </section>}
      </>}
    </div>
  </div>;
}
