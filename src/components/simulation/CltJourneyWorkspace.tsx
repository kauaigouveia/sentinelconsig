import { cltRatePercent } from '../../lib/v8CltDisplay';
import { V8CltActions } from './V8CltActions';
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, ShieldCheck, X } from 'lucide-react';
import { CurrencyInput } from '../common/CurrencyInput';
import { formatCpf, isValidCpf } from '../../lib/utils';
import { journeyStatus, readJourneyStream, type JourneySnapshot, type JourneyProvider } from '../../lib/cltJourney';
import { cltPublicMessage, cltOutcome, cltOutcomeLabels } from '../../lib/cltSimulationOutcome';
import { BmgCustomerAuthorization } from './BmgCustomerAuthorization';
import { CltCustomerDataCard } from './CltCustomerDataCard';
import { V8CltConsultation } from './V8CltConsultation';
import type { Partner, SimulationRequest } from '../../types';

const Parana = lazy(() => import('./ParanaCltSimulation').then(m => ({ default: m.ParanaCltSimulation })));
const Presenca = lazy(() => import('./PresencaCltSimulation').then(m => ({ default: m.PresencaCltSimulation })));
const Happy = lazy(() => import('./HappyCltSimulationModal').then(m => ({ default: m.HappyCltSimulationModal })));
type Props = { isOpen: boolean; scope: string; onClose: () => void; onBack?: () => void; partners?: Partner[]; happyEnabled?: boolean; onSuccess?: (simulation: SimulationRequest) => void };
const control = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const money = (value?: number) => value === undefined ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const blank = { cpf: '', name: '', phone: '', employerDocument: '', value: '', term: '0', mode: 'Payment', factaRegistration: '', v8ConsultId: '', v8PromoterId: '', v8BirthDate: '', v8Gender: '', v8Email: '' };

export function CltJourneyWorkspace({ isOpen, scope, onClose, onBack, partners = [], happyEnabled = false, onSuccess }: Props) {
  const [form, setForm] = useState(blank), [page, setPage] = useState<'CLIENT' | 'TRACKING'>('CLIENT');
  const [snapshot, setSnapshot] = useState<JourneySnapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selectedBank, setSelectedBank] = useState(''), [compared, setCompared] = useState<string[]>([]), [selectedOffer, setSelectedOffer] = useState(''), [compareMode, setCompareMode] = useState(false);
  const [v8Pilot, setV8Pilot] = useState<any>(null);
  const [bmgMessage, setBmgMessage] = useState('');
  const [bmgPhase, setBmgPhase] = useState('');
  const [openedPanels, setOpenedPanels] = useState<string[]>([]);
  const active = useRef<AbortController | null>(null), locked = useRef(false), currentScope = useRef(scope), last = useRef<{ id: string; fingerprint: string } | null>(null);
  const uncertainTransport = useRef(false);
  currentScope.current = scope;
  const dialog = useRef<HTMLDivElement>(null), previous = useRef<HTMLElement | null>(null);
  useEffect(() => { active.current?.abort(); last.current = null; locked.current = false; uncertainTransport.current = false; setForm(blank); setSnapshot(null); setPage('CLIENT'); setBusy(false); setError(''); setCompared([]); setCompareMode(false); setOpenedPanels([]); setSelectedOffer(''); setBmgMessage(''); setBmgPhase('');   try {
      const id = sessionStorage.getItem('sentinel:clt-execution:' + scope);
      if (id && /^[a-f\d-]{36}$/i.test(id)) {
        last.current = { id, fingerprint: '' }; uncertainTransport.current = true; setPage('TRACKING');
        const requestedScope = scope, recovery = new AbortController(); active.current = recovery;
        void fetch('/api/simulations/clt/journey/' + id, { cache: 'no-store', credentials: 'include', signal: recovery.signal }).then(async r => {
          if (!r.ok) throw Error('Não foi possível recuperar a execução. Nenhuma operação será repetida automaticamente.');
          const saved = await r.json(); if (currentScope.current !== requestedScope || recovery.signal.aborted) return;
          setSnapshot(saved); restoreCustomer(saved); uncertainTransport.current = saved.running || Object.values(saved.results).some((r: any) => r.status === 'UNKNOWN');
        }).catch(() => { if (currentScope.current === requestedScope && !recovery.signal.aborted) setError('Recuperação indisponível. Confira o estado antes de outra operação.'); });
      }
    } catch { /* Storage disabled: current execution still uses the persistent backend. */ }
  }, [scope]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { if (!isOpen) return; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = overflow; }; }, [isOpen]);
  useEffect(() => { if (!isOpen) return; previous.current = document.activeElement as HTMLElement; dialog.current?.focus(); return () => previous.current?.focus(); }, [isOpen]);
  const merge = useCallback((next: JourneySnapshot) => setSnapshot(old => {
    const results = { ...old?.results, ...next.results };
    for (const bank of next.banks) if (bank.contextual && next.results[bank.id]?.status === 'CONTEXTUAL' && old?.results[bank.id] && old.results[bank.id].status !== 'CONTEXTUAL') results[bank.id] = old.results[bank.id];
    return { ...next, banks: [...new Map([...(old?.banks || []), ...next.banks].map(bank => [bank.id, bank])).values()], results };
  }), []);
  const bmgRows = useCallback((rows: any[]) => { if (!rows.length) return; setSnapshot(old => old ? { ...old, results: { ...old.results, bmg: { executionId: old.results.bmg?.executionId, status: 'RETURNED', rows } } } : old); }, []);
  const bmgStatus = useCallback((message: string, completedAction?: string) => {
    setBmgMessage(cltPublicMessage(message) || '');
    if (completedAction === 'send-otp' || completedAction === 'verify-otp') {
      setBmgPhase(completedAction === 'send-otp' ? 'Aguardando código SMS' : 'Cliente autorizado');
      setSnapshot(old => old ? { ...old, results: { ...old.results, bmg: { executionId: old.results.bmg?.executionId, status: 'RETURNED', rows: [] } } } : old);
    }
  }, []);
  const contextProgress = useCallback((id: string, name: string, progress: { busy: boolean; message: string; offers: any[] }) => setSnapshot(old => old ? { ...old, results: { ...old.results, [id]: { executionId: old.results[id]?.executionId, status: progress.busy ? 'QUERYING' : 'RETURNED', message: cltPublicMessage(progress.message), rows: progress.offers.map(offer => ({ provider: name, institution: name, state: 'OFFER', table: offer.name, amount: offer.amount, installment: offer.installment, term: offer.term, rate: offer.rate, cetMonthly: typeof offer.cetMonthly === 'number' && Number.isFinite(offer.cetMonthly) ? offer.cetMonthly : undefined, cetAnnual: typeof offer.cetAnnual === 'number' && Number.isFinite(offer.cetAnnual) ? offer.cetAnnual : undefined, simulationId: String(offer.id || '') })) } } } : old), []);
  const paranaProgress = useCallback((progress: { busy: boolean; message: string; offers: any[] }) => contextProgress('parana', 'Paraná Banco', progress), [contextProgress]);
  const presencaProgress = useCallback((progress: { busy: boolean; message: string; offers: any[] }) => contextProgress('presenca', 'Presença Bank', progress), [contextProgress]);
  const happyProgress = useCallback((progress: { busy: boolean; message: string; offers: any[] }) => contextProgress('happy', 'Happy CLT', progress), [contextProgress]);

  function restoreCustomer(saved: JourneySnapshot) {
    const c = saved.customer;
    if (c) setForm(old => ({ ...old, cpf: formatCpf(c.cpf), name: c.name, phone: c.phone, employerDocument: c.employerDocument || '', value: c.value ? String(c.value) : '', term: String(c.term || 0), mode: c.mode, factaRegistration: c.factaRegistration || '', v8ConsultId: c.v8ConsultId || '', v8PromoterId: c.v8PromoterId || '' }));
  }
  async function recover() {
    if (!last.current || locked.current) return;
    locked.current = true; setBusy(true); setError(''); const requestedScope = scope;
    try {
      const response = await fetch(`/api/simulations/clt/journey/${last.current.id}`, { cache: 'no-store', credentials: 'include' });
      const data = await response.json(); if (currentScope.current !== requestedScope) return;
      if (!response.ok) throw new Error(data.error || 'Execução indisponível.'); merge(data); restoreCustomer(data); uncertainTransport.current = data.running === true || Object.values(data.results).some((r: any) => r.status === 'UNKNOWN');
    } catch (e) { if (currentScope.current === requestedScope) setError(cltPublicMessage(e instanceof Error ? e.message : 'Falha no acompanhamento.') || 'Falha no acompanhamento.'); }
    finally { if (currentScope.current === requestedScope) { locked.current = false; setBusy(false); } }
  }
  async function start(provider?: JourneyProvider, action = 'REFRESH', selection?: { v8ConsultId: string; v8PromoterId: string }) {
    if (locked.current) return;
    if (uncertainTransport.current) { setPage('TRACKING'); setError('Recupere o acompanhamento e confira o estado antes de iniciar outra operação.'); return; }
    const cpf = form.cpf.replace(/\D/g, ''), phone = form.phone.replace(/\D/g, '');
    const financial = action === 'SIMULATE';
    if (!isValidCpf(cpf) || !form.name.trim() || !/^\d{10,11}$/.test(phone) || financial && form.value && (!Number.isFinite(Number(form.value)) || Number(form.value) <= 0) || form.employerDocument && ![8, 14].includes(form.employerDocument.replace(/\D/g, '').length)) { setError('Revise CPF, nome, telefone e empregador. Se informar um filtro de valor para calcular, use um valor positivo.'); return; }
    const body = { ...form, ...selection, cpf, phone, name: form.name.trim(), employerDocument: form.employerDocument.replace(/\D/g, ''), value: financial && form.value ? Number(form.value) : undefined, term: financial ? Number(form.term) || undefined : undefined, provider, action };
    const fingerprint = JSON.stringify(body);
    if (!provider && last.current?.fingerprint === fingerprint) { setPage('TRACKING'); await recover(); return; }
    const parentExecutionId = provider ? last.current?.id : undefined;
    const executionId = crypto.randomUUID(); last.current = { id: executionId, fingerprint };
    try { sessionStorage.setItem('sentinel:clt-execution:' + scope, executionId); } catch { /* No customer data is stored in the browser. */ }
    locked.current = true; setBusy(true); setError(''); setPage('TRACKING'); if (!provider) { setSnapshot(null); setSelectedBank(''); setCompared([]); setCompareMode(false); setOpenedPanels([]); setSelectedOffer(''); setBmgMessage(''); setBmgPhase(''); }
    active.current?.abort(); const controller = new AbortController(); active.current = controller; const requestedScope = scope;
    let rejectedBeforeExecution = false;
    uncertainTransport.current = true;
    try {
      const response = await fetch('/api/simulations/clt/journey', { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, executionId, parentExecutionId }), signal: controller.signal });
      rejectedBeforeExecution = !response.ok && response.status < 500 && response.status !== 409;
      let finished = false;
      await readJourneyStream(response, next => { if (currentScope.current !== requestedScope || controller.signal.aborted) return; finished = !next.running && !Object.values(next.results).some(r => r.status === 'UNKNOWN');
        last.current = { id: next.executionId, fingerprint };
        try { sessionStorage.setItem('sentinel:clt-execution:' + scope, next.executionId); } catch { /* Storage is optional. */ }
        merge(next); });
      if (finished) uncertainTransport.current = false;
      if (!finished && !controller.signal.aborted) setError('A conexão de acompanhamento terminou. Recupere o estado da execução; não repita operações bancárias.');
    } catch (e) { if (rejectedBeforeExecution) { uncertainTransport.current = false; last.current = null; try { sessionStorage.removeItem('sentinel:clt-execution:' + scope); } catch { /* Optional storage. */ } } if (!controller.signal.aborted && currentScope.current === requestedScope) setError(cltPublicMessage(e instanceof Error ? e.message : 'Falha na consulta. Confira o estado antes de repetir.') || 'Falha no acompanhamento.'); }
    finally { if (currentScope.current === requestedScope) { locked.current = false; setBusy(false); } }
  }
  useEffect(() => {
    setV8Pilot(null);
    if (selectedBank !== 'v8' || !isOpen) return;
    const controller = new AbortController();
    void fetch('/api/simulations/clt/v8/capabilities', { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('Unavailable');
      const data = await response.json(); if (!controller.signal.aborted) setV8Pilot(data);
    }).catch(() => { if (!controller.signal.aborted) setV8Pilot(null); });
    return () => controller.abort();
  }, [selectedBank, scope, isOpen]);
  const allOffers = Object.entries(snapshot?.results || {}).flatMap(([bank, result]) => result.rows.filter(row => row.state === 'OFFER').map((row, i) => ({ bank, row, key: `${bank}:${row.simulationId || row.table || ''}:${i}` })));
  const offers = compareMode ? allOffers.filter(item => compared.includes(item.key)) : allOffers.filter(item => !selectedBank || item.bank === selectedBank);
  const focused = snapshot?.banks.find(bank => bank.id === selectedBank), focusedResult = snapshot?.results[selectedBank];
  const clientInput = { ...form, cpf: form.cpf.replace(/\D/g, ''), phone: form.phone.replace(/\D/g, ''), term: Number(form.term), value: Number(form.value), product: 'CLT', eligibility: true };
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/70 p-2 text-slate-900 backdrop-blur-sm dark:text-slate-100 sm:p-5">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="clt-journey-title" tabIndex={-1} className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-950" onKeyDown={event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') { const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]') || []).filter(node => node.getClientRects().length); const first = nodes[0], end = nodes.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); end?.focus(); } else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); } }
    }}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-8">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-700 dark:text-cyan-400">Sentinel · Crédito do trabalhador</p><h1 id="clt-journey-title" className="mt-1 text-xl font-semibold">Simulação multibancos</h1></div>
        <button type="button" aria-label="Fechar simulador CLT" onClick={onClose} className="rounded-lg border border-slate-300 p-2 dark:border-slate-700"><X size={18} /></button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 text-xs dark:border-slate-800 sm:px-8"><span>1 · Cliente</span><ArrowRight size={14} /><span className={page === 'TRACKING' ? 'font-semibold text-cyan-700 dark:text-cyan-300' : 'text-slate-500'}>2 · Consulta e autorização</span><ArrowRight size={14} /><span>3 · Margem e ofertas</span></div>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        {error && <p role="alert" className="mb-4 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-sm">{error}</p>}
        {page === 'CLIENT' ? <form className="mx-auto max-w-4xl space-y-6" onSubmit={event => { event.preventDefault(); void start(); }}>
          <div><h2 className="text-xl font-semibold">Consulte os bancos com um cadastro</h2><p className="mt-2 text-sm text-slate-500">Primeiro, consulta e autorização. Após margem e elegibilidade válidas, calculamos as condições disponíveis de cada instituição.</p></div>
          <fieldset disabled={busy} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2">
            <legend className="px-2 text-sm font-semibold">Dados do cliente</legend>
            {([['cpf', 'CPF'], ['name', 'Nome completo'], ['phone', 'Telefone com DDD'], ['employerDocument', 'CNPJ do empregador (quando aplicável)']] as const).map(([key, title]) => <label key={key} className="text-xs font-semibold">{title}<input required={key !== 'employerDocument'} maxLength={key === 'name' ? 200 : 20} inputMode={key === 'name' ? 'text' : 'tel'} className={control} value={form[key]} onChange={event => setForm(old => ({ ...old, [key]: key === 'cpf' ? formatCpf(event.target.value) : event.target.value, factaRegistration: '', v8ConsultId: '', v8PromoterId: '' }))} /></label>)}
          </fieldset>
          <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="shrink-0" />Consultar não significa aprovar crédito. SMS, termos e outras autorizações exigem ação específica; nenhuma contratação será iniciada.</p>
          <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={busy} onClick={onBack || onClose} className="flex items-center gap-2 text-sm"><ArrowLeft size={16} />Voltar</button><button disabled={busy} className="rounded-xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-cyan-600 disabled:opacity-50">CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES</button></div>
        </form> : <div className="mx-auto max-w-[1500px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Acompanhamento das instituições</h2><p className="mt-1 text-xs text-slate-500">{snapshot?.banks.length ?? 0} integrações identificadas · {allOffers.length} ofertas retornadas</p></div><div className="flex gap-3"><button disabled={busy} onClick={() => { setPage('CLIENT'); setCompared([]); }} className="text-sm text-cyan-700 dark:text-cyan-300">Editar dados</button><button disabled={busy || !last.current} onClick={() => void recover()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700">Recuperar acompanhamento</button></div></div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
            <section aria-label="Instituições CLT" className="flex gap-3 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible">
              {!snapshot?.banks.length && <p role="status" className="rounded-xl border border-slate-300 p-4 text-sm dark:border-slate-700">{busy ? 'Identificando integrações habilitadas…' : 'Nenhuma integração disponível nesta execução.'}</p>}
              {snapshot?.banks.map(bank => { const result = snapshot.results[bank.id], count = result?.rows.filter(row => row.state === 'OFFER').length || 0; return <article key={bank.id} className={`w-64 shrink-0 rounded-xl border bg-white p-4 dark:bg-slate-900 lg:w-auto ${selectedBank === bank.id ? 'border-cyan-500' : 'border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold">{bank.name}</h3>{count > 0 ? <Check size={16} className="text-emerald-600" /> : <Clock size={16} className="text-slate-400" />}</div>
                <p role="status" className={`mt-2 text-xs font-semibold ${count ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>{count ? 'Ofertas disponíveis' : bank.id === 'bmg' && bmgPhase || (result ? journeyStatus(result) : 'Aguardando consulta')}</p>
                <p className="mt-1 text-xs text-slate-500">{bank.id === 'bmg' && bmgMessage || result?.message || result?.rows[0]?.message}</p>
                {result?.executionId && <p title={result.executionId} className="mt-1 text-[10px] text-slate-400">Execução {result.executionId.slice(0, 8)}</p>}
                <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{count} ofertas</span><button onClick={() => { setSelectedBank(bank.id); setCompared([]); setCompareMode(false); setOpenedPanels(old => old.includes(bank.id) ? old : [...old, bank.id]); }} className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{count ? 'VER OFERTAS' : 'Abrir detalhes'}</button></div>
              </article>; })}
            </section>
            <section aria-label="Ofertas e ações da instituição" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{compareMode ? 'Comparação de condições' : focused?.name || 'Ofertas disponíveis'}</h2><div className="flex gap-3">{compared.length > 1 && !compareMode && <button className="text-xs text-cyan-700 dark:text-cyan-300" onClick={() => setCompareMode(true)}>Comparar selecionadas ({compared.length})</button>}{compared.length > 0 && <button className="text-xs text-cyan-700 dark:text-cyan-300" onClick={() => { setCompared([]); setCompareMode(false); }}>Limpar comparação</button>}</div></div>
              {selectedBank === 'v8' && <V8CltActions key={scope + ':' + (snapshot?.executionId || '')} capabilities={v8Pilot} form={form} setForm={setForm} start={start} busy={busy} executionId={snapshot?.executionId} rows={focusedResult?.rows || []} onSnapshot={merge} />}
              {focusedResult?.rows.filter(row => row.provider === 'V8 DIGITAL').map((row, i) => <V8CltConsultation key={i} row={row} selected={form.v8ConsultId === (row.data as any)?.v8?.consultId && form.v8PromoterId === (row.data as any)?.v8?.promoterId} onSelect={() => setForm(old => ({ ...old, v8ConsultId: (row.data as any).v8.consultId, v8PromoterId: (row.data as any).v8.promoterId }))} />)}
              {focusedResult?.rows.some(row => row.state !== 'OFFER' && row.state !== 'DATA') && <ul aria-label="Retornos por instituição" className="mb-4 space-y-2">{focusedResult.rows.filter(row => row.state !== 'OFFER' && row.state !== 'DATA').map((row, index) => <li key={index} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><strong>{row.institution}</strong><span className="ml-2 text-xs text-slate-500">{cltOutcomeLabels[cltOutcome(row)]}</span>{row.message && <p className="mt-1 text-xs text-slate-500">{row.message}</p>}</li>)}</ul>}
              {focusedResult?.rows.filter(row => row.state === 'DATA' && row.provider !== 'V8 DIGITAL').map((row, i) => <CltCustomerDataCard key={i} row={row} selectedEmployer={form.employerDocument} selectedFactaRegistration={form.factaRegistration} selectedV8ConsultId={form.v8ConsultId} selectedV8PromoterId={form.v8PromoterId} onSelectEmployer={(doc, registration) => setForm(old => ({ ...old, employerDocument: doc, factaRegistration: registration || '' }))} onSelectV8={(id, promoter) => setForm(old => ({ ...old, v8ConsultId: id, v8PromoterId: promoter }))} />)}
              {focused && <details className="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer text-xs font-semibold">Filtros opcionais de simulação</summary><p className="my-2 text-xs text-slate-500">Sem valor informado, utilizamos somente o limite efetivamente retornado por cada banco. Prazos vêm das tabelas da instituição.</p><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs">Simular por<select className={control} value={form.mode} onChange={e => setForm(old => ({ ...old, mode: e.target.value }))}><option value="Payment">Valor da parcela</option><option value="Liquid">Valor liberado</option></select></label><label className="text-xs">{form.mode === 'Payment' ? 'Parcela desejada (R$)' : 'Valor liberado desejado (R$)'}<CurrencyInput min={0.01} className={control} value={form.value} onValueChange={value => setForm(old => ({ ...old, value }))} /></label><label className="text-xs">Prazo (meses)<input type="number" min="0" max="120" className={control} value={form.term} onChange={e => setForm(old => ({ ...old, term: e.target.value }))} /><span className="text-slate-500">0 = todos os prazos retornados</span></label></div></details>}
              {focusedResult?.rows.map((row, i) => row.link && /^https:\/\//i.test(row.link) ? <a key={i} href={row.link} target="_blank" rel="noopener noreferrer" className="my-3 block text-sm text-cyan-700 underline dark:text-cyan-300">Abrir autorização oficial · {row.institution}</a> : null)}
              {focused && !focused.contextual && focused.id !== 'bmg' && <div className="mb-4 flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => void start(focused.id, 'REFRESH')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700">Atualizar consulta desta instituição</button>
                {['facta', 'nossa', 'finanto'].includes(focused.id) && <button disabled={busy} onClick={() => void start(focused.id, 'AUTHORIZE')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs dark:border-slate-700">Solicitar autorização nesta integração</button>}
                {focused.id !== 'v8' && <button disabled={busy} onClick={() => void start(focused.id, 'SIMULATE')} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs text-white">Consultar condições selecionadas</button>}
              </div>}
              {focused && ['nossa', 'finanto'].includes(focused.id) && <p className="mb-3 text-xs text-slate-500">A solicitação abrange as instituições retornadas por esta integração. O aceite cabe ao cliente.</p>}
              {openedPanels.includes('bmg') && <div hidden={selectedBank !== 'bmg'}><BmgCustomerAuthorization input={clientInput} onRows={bmgRows} onStatus={bmgStatus} reusePhone allowProposal={false} /></div>}
              <Suspense fallback={<p role="status" className="p-3 text-sm">Abrindo etapa específica…</p>}>
                {openedPanels.includes('parana') && <div hidden={selectedBank !== 'parana'}><Parana cpf={form.cpf} name={form.name} phone={form.phone} onProgress={paranaProgress} /></div>}
                {openedPanels.includes('presenca') && <div hidden={selectedBank !== 'presenca'}><Presenca cpf={form.cpf} name={form.name} phone={form.phone} onProgress={presencaProgress} /></div>}
                {openedPanels.includes('happy') && happyEnabled && <div hidden={selectedBank !== 'happy'}><Happy embedded sharedIdentity isOpen initialData={form} partners={partners} onClose={() => {}} onSuccess={simulation => onSuccess?.(simulation)} onProgress={happyProgress} /></div>}
              </Suspense>
              {!offers.length && <p className="py-8 text-center text-sm text-slate-500">{busy ? 'As ofertas aparecerão assim que cada instituição responder.' : 'Nenhuma oferta disponível nesta seleção. Confira os retornos e ações da instituição.'}</p>}
              {offers.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left text-xs text-slate-500">Selecione até três condições para comparar. Selecionar não contrata.</caption><thead><tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700">{['Comparar', 'Instituição / tabela', 'Liberado', 'Parcela', 'Prazo', 'Taxa', 'CET mensal', 'CET anual', 'Seleção'].map(label => <th key={label} className="px-2 py-3">{label}</th>)}</tr></thead><tbody>{offers.map(({ row, key }) => <tr key={key} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-2"><input type="checkbox" aria-label={`Comparar ${row.table || row.institution}`} checked={compared.includes(key)} disabled={compared.length >= 3 && !compared.includes(key)} onChange={() => setCompared(old => old.includes(key) ? old.filter(item => item !== key) : [...old, key])} /></td>
                <td className="p-2"><span className="block font-semibold">{row.institution}</span><span className="text-xs text-slate-500">{row.table || row.provider}</span>{(row.data as any)?.v8?.cached && <p className="text-xs text-amber-600">Oferta recuperada; confirme a validade no banco.</p>}</td><td className="whitespace-nowrap p-2 font-semibold">{money(row.amount)}</td><td className="whitespace-nowrap p-2">{money(row.installment)}</td><td className="p-2">{row.term || '—'}</td><td className="p-2">{cltRatePercent(row) === undefined ? '—' : `${cltRatePercent(row)!.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}%`}</td><td className="p-2">{row.cetMonthly === undefined ? 'Não informado' : `${row.cetMonthly.toLocaleString('pt-BR')}%`}</td><td className="p-2">{row.cetAnnual === undefined ? 'Não informado' : `${row.cetAnnual.toLocaleString('pt-BR')}%`}</td><td className="p-2"><button aria-pressed={selectedOffer === key} onClick={() => setSelectedOffer(key)} className="rounded-lg border border-cyan-600 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-300">{selectedOffer === key ? 'Selecionada' : 'Selecionar'}</button></td>
              </tr>)}</tbody></table></div>}
              {compared.length === 0 && allOffers.length > 0 && selectedBank && <button className="mt-3 text-xs text-cyan-700 dark:text-cyan-300" onClick={() => setSelectedBank('')}>Ver ofertas de todas as instituições</button>}
            </section>
          </div>
          <footer className="mt-5 text-[11px] text-slate-500">Execução {snapshot?.executionId || last.current?.id} · Sem contratação automática · Sem repetição automática após falha</footer>
        </div>}
      </main>
    </div>
  </div>;
}
