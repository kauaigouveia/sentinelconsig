import { portabilityReviewMetadata } from '../../lib/portabilitySimulationPolicy';
import { PortabilityReviewFields } from './PortabilityReviewFields';
import { SimulationCustomerSummary } from './SimulationCustomerSummary';
import { SimulationSteps, SimulationBack, SimulationContinue, continueSimulation } from './SimulationSteps';
import { paidFromTerms, portabilityEligibility } from '../../lib/portabilityEligibility';
import { BankCodeSelect } from '../common/BankCodeSelect';
import { HappyInssSimulationModal } from './HappyInssSimulationModal';
import { BankPlaybooksPanel } from './BankPlaybooksPanel';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useEffect, useState } from 'react';
import { Activity, AlertCircle, LoaderCircle, X } from 'lucide-react';
import { Partner, SimulationRequest } from '../../types';
import { readJsonResponse } from '../../lib/httpJson';
import { formatCpf, isValidCpf, normalizeCpf } from '../../lib/utils';
import { getNossaFintechTroco } from '../../lib/nossaFintech';
import { InssBenefitTypeSelect } from './InssBenefitTypeSelect';
import { nossaFintechTableRate, ageAt, finantoAgeError, finantoBenefitError, finantoCashOut, finantoCashOutError, finantoInstallmentError, finantoRefinancingChoices, finantoTableLabel, INSS_TERMS, INSS_REFINANCING_RATES } from '../../lib/inssEligibility';

type SimulationRow = { provider: string; table?: any; success: boolean; status?: number; data?: any; error?: string; troco?: number | null; skipped?: boolean; term?: number; lender?: string };
type Props = { onBack?: () => void; happyEnabled?: boolean; isOpen: boolean; onClose: () => void; partners?: Partner[]; onSuccess?: (simulation: SimulationRequest) => void; onContinue?: (draft: { condition: NonNullable<SimulationRequest['selectedCondition']>; values: Record<string, string>; calculation?: any }) => void };
const currency = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950';
const labelClass = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const itemsOf = (data: any) => Array.isArray(data?.items) ? data.items : Array.isArray(data?.data?.items) ? data.data.items : [];
const messagesOf = (data: any) => Array.isArray(data?.messages) ? data.messages.map((item: any) => item?.text).filter(Boolean).join(' ') : '';

export const NossaFintechPortRefinSimulationModal: React.FC<Props> = ({ isOpen, onBack, happyEnabled = false, onClose, partners = [], onSuccess, onContinue }) => {
  const [portabilityContext,setPortabilityContext]=useState<Record<string,string>>({});
  const [form, setForm] = useState({
    name: '', cpf: '', birthDate: '', benefitNumber: '', benefitType: '',
    originLenderCode: '', originContractNumber: '', originalTerm: '',
    lastDueBalance: '', installmentFaceValue: '', openedInstallmentNumber: '', numberOfInstallments: '108', refinancingRate: '', legalRepresentative: false,
  });
  const [step,setStep]=useState(0);
  const [rows, setRows] = useState<SimulationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providerNotes, setProviderNotes] = useState<string[]>([]);
  const [selected, setSelected] = useState<SimulationRow | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(()=>{setPortabilityContext({});},[form.cpf]);
  if (!isOpen) return null;

  const update = (key: keyof typeof form, value: string | boolean) => { setForm(current => ({ ...current, [key]: value })); setRows([]); setSelected(null); setProviderNotes([]); setError(''); };
  const calculateNossaFintech = async (): Promise<SimulationRow[]> => {
    const response = await fetch('/api/integrations/nossa-fintech/port-refin/simulate-all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...portabilityContext,originalBank:form.originLenderCode,originalTerm:Number(form.originalTerm),lastDueBalance: Number(form.lastDueBalance), installmentFaceValue: Number(form.installmentFaceValue), openedInstallmentNumber: Number(form.openedInstallmentNumber), numberOfInstallments: Number(form.numberOfInstallments), legalRepresentative: form.legalRepresentative, birthDate: form.birthDate, benefitType: Number(form.benefitType), refinancingRate: form.refinancingRate ? Number(form.refinancingRate) : undefined }),
    });
    const result = await readJsonResponse(response);
    if (response.status === 422) return [];
    if (!response.ok || result.success === false) throw new Error(result.error || result.data?.message || `Nossa Fintech respondeu com HTTP ${result.status || response.status}.`);
    if (result.data?.noEligibleTables) return [];
    if (!result.data?.results?.length && !result.data?.excludedTables?.length) throw new Error('Nossa Fintech não retornou tabelas compatíveis com a taxa, o prazo e o saldo escolhidos.');
    return [
      ...(result.data?.results || []).map((row: any) => ({ ...row, provider: 'Nossa Fintech', term: Number(form.numberOfInstallments), troco: row.success ? getNossaFintechTroco(row.data) : null })),
      ...(result.data?.excludedTables || []).map((row: any) => ({ provider: 'Nossa Fintech', table: row.table, term: Number(form.numberOfInstallments), success: false, skipped: true, error: row.reason })),
    ];
  };

  const calculateFacta = async (): Promise<SimulationRow[]> => {
    const agreement = portabilityEligibility('facta', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)); if (agreement.blocked) throw new Error(agreement.reason);
    const response = await fetch('/api/integrations/facta/inss/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...portabilityContext,cpf: normalizeCpf(form.cpf), birthDate: form.birthDate, benefitNumber: form.benefitNumber, benefitType: Number(form.benefitType), operation: 'PORT_REFIN', mode: 'INSTALLMENT', value: Number(form.installmentFaceValue), term: Number(form.numberOfInstallments), rate: form.refinancingRate ? Number(form.refinancingRate) : undefined, debt: Number(form.lastDueBalance), originalBank: form.originLenderCode, originalTerm: Number(form.originalTerm), remainingTerm: Number(form.openedInstallmentNumber), originalInstallment: Number(form.installmentFaceValue) }) });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || 'Falha ao consultar FACTA.');
    if (result.message) throw new Error(result.message);
    return (result.offers || []).map((offer: any) => ({ provider: 'FACTA', table: { name: offer.name, cod_tabela: offer.code, amount: offer.rate }, success: Boolean(offer.amount), term: offer.term, troco: offer.amount, data: offer, error: offer.amount ? undefined : 'O banco não informou troco nesta condição.' }));
  };

  const calculateFinanto = async (): Promise<SimulationRow[]> => {
    const agreement = portabilityEligibility('finanto', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)); if (agreement.blocked) throw new Error(agreement.reason);
    const ageError = finantoAgeError(form.birthDate, Number(form.numberOfInstallments));
    if (ageError) throw new Error(ageError);
    const configResponse = await fetch('/api/integrations/finanto/config', { credentials: 'same-origin' });
    const config = configResponse.ok ? await configResponse.json() : null;
    if (!config?.isConfigured || !config?.enabled) throw new Error('FINANTO não está configurada e ativada para esta empresa.');
    const call = async (endpoint: string, body: any) => {
      const response = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint, body, clientBirthDate: form.birthDate, benefitType: Number(form.benefitType),portabilityContext }) });
      const data = await response.json();
      if (!response.ok || messagesOf(data)) throw new Error(data.error || messagesOf(data) || 'Falha na consulta FINANTO.');
      return data;
    };
    const products = itemsOf(await call('/v3/loan-products/search/basic', { type: { code: { eq: 20 } }, operation: { code: { eq: 4 } } }))
      .filter((item: any) => Number(item?.type?.code ?? item?.typeCode) === 20);
    const productIds = new Set(products.map((item: any) => String(item.id)));
    if (!productIds.size) throw new Error('FINANTO não retornou produtos INSS Portabilidade + Refinanciamento.');
    const allRules: any[] = [];
    for (let offset = 0; offset < 2000; offset += 20) {
      const page = itemsOf(await call('/v3/loan-product-rules/search/basic', { offset, limit: 20, operation: { code: { eq: 4 } } }));
      allRules.push(...page.filter((rule: any) => productIds.has(String(rule?.product?.id))));
      if (page.length < 20) break;
    }
    const results: SimulationRow[] = [];
    const eligible = allRules.flatMap(rule => {
      const choices = finantoRefinancingChoices(rule, Number(form.numberOfInstallments), form.refinancingRate ? Number(form.refinancingRate) : undefined);
      const reason = finantoBenefitError(rule.name || '', form.benefitType) || finantoInstallmentError(rule.name || '', Number(form.installmentFaceValue));
      if (reason || !choices.length) {
        results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule), originalName: rule.name, id: rule.id, cod_tabela: rule.code || rule.id }, term: Number(form.numberOfInstallments), success: false, skipped: true, error: reason || 'A tabela não atende à taxa e ao prazo escolhidos.' });
        return [];
      }
      return choices.map(({ item, rate }) => ({ rule, item, rate }));
    });
    let next = 0;
    const worker = async () => {
      while (next < eligible.length) {
        const { rule, rate: selectedRate } = eligible[next++];
        try {
          const response = await call('/v3/loan-inss-simulations/calculation', {
            ruleId: rule.id, hasInsurance: false,
            loanValue: Number(form.lastDueBalance), installmentValue: Number(form.installmentFaceValue),
            rate: selectedRate, term: Number(form.openedInstallmentNumber),
            issueAmount: Number(form.lastDueBalance),
            originContract: { lenderCode: Number(form.originLenderCode), contractNumber: form.originContractNumber.trim(), term: Number(form.originalTerm), installmentsRemaining: Number(form.openedInstallmentNumber), installmentValue: Number(form.installmentFaceValue), dueBalanceValue: Number(form.lastDueBalance) },
            refinancing: { term: Number(form.numberOfInstallments), rate: selectedRate, installmentValue: Number(form.installmentFaceValue) },
          });
          const cashOutError = finantoCashOutError(rule.name || '', response);
          results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule), originalName: rule.name, id: rule.id, cod_tabela: rule.code || rule.id, amount: selectedRate }, lender: response.lender?.name || response.fund?.name, term: Number(form.numberOfInstallments), success: !cashOutError, skipped: Boolean(cashOutError), error: cashOutError || undefined, data: response, troco: finantoCashOut(response) });
        } catch (err: any) {
          results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule), originalName: rule.name, id: rule.id, cod_tabela: rule.code || rule.id, amount: selectedRate }, term: Number(form.numberOfInstallments), success: false, error: err.message || 'Falha nesta tabela FINANTO.' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, eligible.length) }, worker));
    return results;
  };

  const calculate = async (event: React.FormEvent) => {
    event.preventDefault(); setSelected(null); setSaved(false); setLoading(true); setRows([]); setError(''); setProviderNotes([]);
    if (!isValidCpf(normalizeCpf(form.cpf))) { setError('Informe um CPF válido.'); setLoading(false); return; }
    if (ageAt(form.birthDate) === null) { setError('Informe uma data de nascimento válida.'); setLoading(false); return; }
    try {
      const calls = await Promise.allSettled([calculateNossaFintech(), calculateFinanto(), calculateFacta()]);
      const combined: SimulationRow[] = [];
      const notes: string[] = [];
      calls.forEach((result, index) => {
        const provider = ['Nossa Fintech', 'FINANTO', 'FACTA'][index];
        if (result.status === 'fulfilled') combined.push(...result.value);
        else notes.push(`${provider}: ${result.reason?.message || 'não foi possível simular'}`);
      });
      const eligible = combined.filter(row => row.troco == null || row.troco >= 0);
      setRows(eligible);
      setProviderNotes(notes);
      if (!eligible.length) setError('Nenhuma simulação elegível com troco não negativo foi retornada para os dados informados.');
    } finally { setLoading(false); }
  };

  const conditionFor = (row: SimulationRow): NonNullable<SimulationRequest['selectedCondition']> => ({ provider: row.provider, tableId: String(row.table?.id || row.table?.cod_tabela || ''), tableName: row.table?.name || 'Portabilidade + refinanciamento', amount: Number(row.troco), installment: row.data?.installment || row.data?.refinancing?.installmentValue || Number(form.installmentFaceValue), term: Number(row.term), rate: row.provider === 'FINANTO' ? Number(row.table?.amount) : row.provider === 'FACTA' ? row.data?.rate ?? null : nossaFintechTableRate(row.table || {}) });
  const draftValues = () => ({ ...Object.fromEntries(Object.entries(form).filter(([, value]) => typeof value === 'string')) as Record<string, string>, partnerId, rate: String(selected ? conditionFor(selected).rate || form.refinancingRate : form.refinancingRate), term: form.numberOfInstallments });
  const save = async () => {
    if (!selected || !Number.isFinite(selected.troco) || !(Number(selected.troco) > 0) || !partnerId) { setError('Selecione uma oferta e o parceiro responsável.'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/simulations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(form.cpf), partnerId, simulationType: 'INSS_MULTI', operationType: 'PORT_REFIN', selectedCondition: conditionFor(selected), customerData: { birthDate: form.birthDate, benefitNumber: form.benefitNumber, benefitType: Number(form.benefitType), originContract: { lenderCode: form.originLenderCode, contractNumber: form.originContractNumber, term: form.originalTerm, installmentsRemaining: form.openedInstallmentNumber, installmentValue: form.installmentFaceValue, dueBalanceValue: form.lastDueBalance } } }) });
      const data = await readJsonResponse(response); if (!response.ok) throw new Error(data.error);
      setSaved(true); onSuccess?.(data);
    } catch (error: any) { setError(error.message); } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="port-refin-simulation-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><SimulationBack onBack={onBack} disabled={loading}/><h2 id="port-refin-simulation-title" className="text-xl font-bold text-slate-900 dark:text-white">INSS · Portabilidade + Refinanciamento</h2><p className="mt-1 text-xs text-slate-500">Informe cliente e dívida para comparar as condições nas integrações habilitadas.</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></header>
      <SimulationSteps labels={['Cliente','Contrato','Ofertas']} step={step} onChange={setStep} disabled={loading}/>{step===2 && <SimulationCustomerSummary name={form.name} cpf={form.cpf} birthDate={form.birthDate} installment={Number(form.installmentFaceValue)} term={Number(form.numberOfInstallments)} rate={form.refinancingRate?Number(form.refinancingRate):undefined}/>}<div className="overflow-y-auto p-5 sm:p-7"><form onSubmit={event=>{if(step!==1){event.preventDefault();return;}setStep(2);void calculate(event);}} className="space-y-4">
        <fieldset data-simulation-step hidden={step!==0} disabled={step!==0} className="space-y-4"><section className="rounded-xl border border-slate-200 p-5 dark:border-slate-700"><h3 className="mb-3 text-sm font-bold">1. Cliente e benefício</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>CPF<input required value={form.cpf} onChange={e => update('cpf', formatCpf(e.target.value))} className={inputClass} /></label>
          <label className={labelClass}>Nome do cliente (opcional)<input value={form.name} onChange={e=>update('name',e.target.value)} className={inputClass}/></label>
          <label className={labelClass}>Data de nascimento<input required type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Número do benefício<input required value={form.benefitNumber} onChange={e => update('benefitNumber', e.target.value.replace(/\D/g, '').slice(0, 20))} className={inputClass} /></label>
          <InssBenefitTypeSelect className={labelClass} required value={form.benefitType} onChange={value => update('benefitType', value)} />
        </div></section>
        <PortabilityReviewFields value={portabilityContext} onChange={value=>{setPortabilityContext(value);setRows([]);setSelected(null);}}/>
        <SimulationContinue onClick={event=>continueSimulation(event,()=>setStep(1))}/></fieldset><fieldset hidden={step!==1} disabled={step!==1} className="space-y-5"><section className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h3 className="mb-3 text-sm font-bold">2. Contrato de origem</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <BankCodeSelect label="Banco de origem" value={form.originLenderCode} onChange={value => update('originLenderCode', value)} className={inputClass} labelClassName={labelClass} />
          <label className={labelClass}>Número do contrato<input required value={form.originContractNumber} onChange={e => update('originContractNumber', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Prazo original (meses)<input required type="number" min="1" value={form.originalTerm} onChange={e => update('originalTerm', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Parcelas restantes<input required type="number" min="1" value={form.openedInstallmentNumber} onChange={e => update('openedInstallmentNumber', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Saldo devedor (R$)<CurrencyInput required min="0.01" step="0.01" value={form.lastDueBalance} onValueChange={value => update('lastDueBalance', value)} className={inputClass} /></label>
          <label className={labelClass}>Parcela atual (R$)<CurrencyInput required min="0.01" step="0.01" value={form.installmentFaceValue} onValueChange={value => update('installmentFaceValue', value)} className={inputClass} /></label>
          <label className={labelClass}>Prazo do novo refinanciamento<select value={form.numberOfInstallments} onChange={e => update('numberOfInstallments', e.target.value)} className={inputClass}>{INSS_TERMS.map(term => <option key={term} value={term}>{term} meses</option>)}</select></label>
          <label className={labelClass}>Taxa do refinanciamento<select value={form.refinancingRate} onChange={e => update('refinancingRate', e.target.value)} className={inputClass}><option value="">Todas as taxas disponíveis</option>{INSS_REFINANCING_RATES.map(rate => <option key={rate} value={rate}>{rate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% ao mês</option>)}</select></label>
          <label className="mt-5 inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={form.legalRepresentative} onChange={e => update('legalRepresentative', e.target.checked)} />Possui representante legal</label>
        </div></section>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">As integrações retornam propostas de simulação separadas. Os dados pessoais são usados para identificar a modalidade; confirme autorização do cliente antes de consultar os bancos.</p>
        {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        <SimulationBack onBack={()=>setStep(0)} disabled={loading} label="Voltar ao cliente"/><button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Activity className="h-4 w-4" />{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" />Calculando…</> : 'Comparar ofertas'}</button>
      </fieldset></form>
      {step===2 && <SimulationBack onBack={()=>setStep(1)} disabled={loading} label="Voltar ao contrato"/>}
      {step===2 && error && <p role="alert" className="my-3 rounded-lg bg-rose-500/10 p-4 text-sm text-rose-500">{error}</p>}
      <div hidden={step!==2}>{loading && <p role="status" className="my-4 rounded-xl bg-blue-500/10 p-5 text-sm">Consultando as condições disponíveis…</p>}
      <BankPlaybooksPanel input={{ ...portabilityReviewMetadata(portabilityContext),originBank: form.originLenderCode, paidInstallments: paidFromTerms(form.originalTerm, form.openedInstallmentNumber), birthDate: form.birthDate, species: String(form.benefitType), operation: 'PORT_REFIN', term: Number(form.numberOfInstallments) }} />
      {happyEnabled && portabilityEligibility('happy', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)).blocked && <p role="status" className="mt-3 text-sm text-amber-600">{portabilityEligibility('happy', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)).reason}</p>}
      {happyEnabled && !portabilityEligibility('happy', form.originLenderCode, paidFromTerms(form.originalTerm, form.openedInstallmentNumber)).blocked && <details className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer font-bold">Happy INSS · autorização e simulação</summary><HappyInssSimulationModal embedded initialOperation="PORTABILIDADE_REFIN" isOpen key={`happy-${form.cpf}-${form.benefitNumber}`} initialData={{ cpf: form.cpf, birthDate: form.birthDate, benefit: form.benefitNumber, partnerId }} partners={partners} onClose={() => {}} onSuccess={simulation => onSuccess?.(simulation)} /></details>}
      {providerNotes.length > 0 && <div className="mt-4 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{providerNotes.map(note => <p key={note}>{note}</p>)}</div>}
      {rows.some(row => !row.skipped) && <section className="mt-6"><h3 className="mb-3 text-sm font-bold">Resultados por integração e tabela</h3><div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-xs dark:bg-slate-800"><tr><th className="p-3">Integração / instituição</th><th className="p-3">Tabela</th><th className="p-3">Taxa refin.</th><th className="p-3">Prazo</th><th className="p-3">Troco retornado</th><th className="p-3">Estado / seleção</th></tr></thead><tbody>{rows.filter(row => !row.skipped).map((row, index) => <tr key={`${row.provider}-${row.table?.cod_tabela || index}-${row.table?.amount || index}`} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{row.provider}{row.lender && <span className="block text-xs text-slate-500">{row.lender}</span>}</td><td className="p-3 font-medium">{row.table?.name || row.table?.cod_tabela || 'Tabela Port/Refin'}<span className="block text-xs font-normal text-slate-500">Código: {row.table?.cod_tabela || '—'}{row.table?.originalName ? ` · API: ${row.table.originalName}` : ''}</span></td><td className="p-3">{row.provider === 'FINANTO' ? `${Number(row.table?.amount).toLocaleString('pt-BR')}%` : row.table?.name?.match(/([12][.,]\d+)\s*%/)?.[0] || '—'}</td><td className="p-3">{row.term} meses</td><td className="p-3 font-semibold">{row.success && row.troco !== null && row.troco !== undefined ? currency(row.troco) : '—'}</td><td className="p-3">{row.success ? <button type="button" disabled={!(Number(row.troco) > 0)} onClick={() => { setSelected(row); setSaved(false); }} className="rounded-lg border px-3 py-2 text-emerald-600">{selected === row ? 'Selecionada' : 'Selecionar'}</button> : <span className="text-rose-600">Indisponível · {row.error || `HTTP ${row.status}`}</span>}</td></tr>)}</tbody></table></div></section>}
      {selected && <section className="mt-4 space-y-3 rounded-xl border p-4"><p className="font-semibold">Oferta selecionada: {selected.table?.name} · {selected.provider}</p><label className={labelClass}>Parceiro responsável<select className={inputClass} value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Selecione</option>{partners.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name || p.fullName}</option>)}</select></label>{saved ? <p role="status" className="text-emerald-600">Simulação salva na esteira, aguardando digitação pela mesa.</p> : <div className="flex gap-3"><button type="button" disabled={loading} onClick={save} className="rounded-lg border px-4 py-2">{loading ? 'Salvando...' : 'Salvar simulação'}</button>{onContinue && <button type="button" disabled={loading} onClick={() => { if (!partnerId) { setError('Selecione o parceiro responsável.'); return; } onContinue({ condition: conditionFor(selected), values: draftValues(), calculation: selected.provider === 'FINANTO' ? selected.data : undefined }); }} className="rounded-lg bg-violet-700 px-4 py-2 text-white">Seguir para digitação</button>}</div>}</section>}
      {rows.some(row => row.skipped) && <details className="mt-4 rounded-xl border border-amber-200 p-4 text-sm dark:border-amber-900"><summary className="cursor-pointer font-semibold">Tabelas não elegíveis ({rows.filter(row => row.skipped).length})</summary><div className="mt-3 space-y-2">{rows.filter(row => row.skipped).map((row, index) => <p key={`${row.provider}-${row.table?.cod_tabela || index}-${row.table?.amount || index}`}><strong>{row.provider} · {row.table?.name || row.table?.cod_tabela}</strong><span className="block text-xs text-slate-500">{row.error}</span></p>)}</div></details>}
      </div>
      </div>
    </div>
  </div>;
};
