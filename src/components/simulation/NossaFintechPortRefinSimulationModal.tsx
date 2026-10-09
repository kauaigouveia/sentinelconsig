import React, { useState } from 'react';
import { Activity, AlertCircle, LoaderCircle, X } from 'lucide-react';
import { formatCpf, isValidCpf, normalizeCpf } from '../../lib/utils';
import { getNossaFintechTroco } from '../../lib/nossaFintech';
import { InssBenefitTypeSelect } from './InssBenefitTypeSelect';
import { ageAt, finantoAgeError, finantoInstallmentError, finantoRuleItem, finantoTableLabel, INSS_TERMS } from '../../lib/inssEligibility';

type SimulationRow = { provider: string; table?: any; success: boolean; status?: number; data?: any; error?: string; troco?: number | null; skipped?: boolean; term?: number; lender?: string };
type Props = { isOpen: boolean; onClose: () => void };
const currency = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950';
const labelClass = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const itemsOf = (data: any) => Array.isArray(data?.items) ? data.items : Array.isArray(data?.data?.items) ? data.data.items : [];
const messagesOf = (data: any) => Array.isArray(data?.messages) ? data.messages.map((item: any) => item?.text).filter(Boolean).join(' ') : '';
const finantoCashOut = (data: any): number | null => {
  const candidates = [data?.refinancing?.netValue, data?.refinancing?.additionalValue, data?.additionalValue, data?.netValue, data?.finalDisbursedAmount];
  const value = candidates.find(item => item !== null && item !== undefined && item !== '' && Number.isFinite(Number(item)));
  return value === undefined ? null : Number(value);
};

export const NossaFintechPortRefinSimulationModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [form, setForm] = useState({
    cpf: '', birthDate: '', benefitNumber: '', benefitType: '',
    originLenderCode: '', originContractNumber: '', originalTerm: '',
    lastDueBalance: '', installmentFaceValue: '', openedInstallmentNumber: '', numberOfInstallments: '108', legalRepresentative: false,
  });
  const [rows, setRows] = useState<SimulationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [providerNotes, setProviderNotes] = useState<string[]>([]);
  if (!isOpen) return null;

  const update = (key: keyof typeof form, value: string | boolean) => { setForm(current => ({ ...current, [key]: value })); setRows([]); setProviderNotes([]); setError(''); };
  const calculateNossaFintech = async (): Promise<SimulationRow[]> => {
    const response = await fetch('/api/integrations/nossa-fintech/port-refin/simulate-all', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastDueBalance: Number(form.lastDueBalance), installmentFaceValue: Number(form.installmentFaceValue), openedInstallmentNumber: Number(form.openedInstallmentNumber), numberOfInstallments: Number(form.numberOfInstallments), legalRepresentative: form.legalRepresentative, birthDate: form.birthDate }),
    });
    const result = await response.json();
    if (!response.ok || result.success === false) throw new Error(result.error || result.data?.message || `Nossa Fintech respondeu com HTTP ${result.status || response.status}.`);
    return [
      ...(result.data?.results || []).map((row: any) => ({ ...row, provider: 'Nossa Fintech', term: Number(form.numberOfInstallments), troco: row.success ? getNossaFintechTroco(row.data) : null })),
      ...(result.data?.excludedTables || []).map((row: any) => ({ provider: 'Nossa Fintech', table: row.table, term: Number(form.numberOfInstallments), success: false, skipped: true, error: row.reason })),
    ];
  };

  const calculateFinanto = async (): Promise<SimulationRow[]> => {
    const ageError = finantoAgeError(form.birthDate, Number(form.numberOfInstallments));
    if (ageError) throw new Error(ageError);
    const configResponse = await fetch('/api/integrations/finanto/config', { credentials: 'same-origin' });
    const config = configResponse.ok ? await configResponse.json() : null;
    if (!config?.isConfigured || !config?.enabled) throw new Error('FINANTO não está configurada e ativada para esta empresa.');
    const call = async (endpoint: string, body: any) => {
      const response = await fetch('/api/integrations/finanto/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'POST', endpoint, body, clientBirthDate: form.birthDate }) });
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
      const reason = finantoInstallmentError(rule.name || '', Number(form.installmentFaceValue));
      const termItem = finantoRuleItem(rule, Number(form.numberOfInstallments));
      if (reason || !termItem || !(Number(termItem.rate) > 0)) {
        results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule), originalName: rule.name, cod_tabela: rule.code || rule.id }, term: Number(form.numberOfInstallments), success: false, skipped: true, error: reason || 'A tabela não atende ao prazo escolhido.' });
        return [];
      }
      return [{ rule, item: termItem }];
    });
    let next = 0;
    const worker = async () => {
      while (next < eligible.length) {
        const { rule, item } = eligible[next++];
        try {
          const response = await call('/v3/loan-inss-simulations/calculation', {
            ruleId: rule.id, hasInsurance: false,
            loanValue: Number(form.lastDueBalance), installmentValue: Number(form.installmentFaceValue),
            rate: Number(item.rate), term: Number(form.openedInstallmentNumber),
            issueAmount: Number(form.lastDueBalance),
            originContract: { lenderCode: Number(form.originLenderCode), contractNumber: form.originContractNumber.trim(), term: Number(form.originalTerm), installmentsRemaining: Number(form.openedInstallmentNumber), installmentValue: Number(form.installmentFaceValue), dueBalanceValue: Number(form.lastDueBalance) },
            refinancing: { term: Number(form.numberOfInstallments), rate: Number(item.rate), installmentValue: Number(form.installmentFaceValue) },
          });
          results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule), originalName: rule.name, cod_tabela: rule.code || rule.id, amount: item.rate }, lender: response.lender?.name || response.fund?.name, term: Number(form.numberOfInstallments), success: true, data: response, troco: finantoCashOut(response) });
        } catch (err: any) {
          results.push({ provider: 'FINANTO', table: { name: finantoTableLabel(rule), originalName: rule.name, cod_tabela: rule.code || rule.id, amount: item.rate }, term: Number(form.numberOfInstallments), success: false, error: err.message || 'Falha nesta tabela FINANTO.' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, eligible.length) }, worker));
    return results;
  };

  const calculate = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setRows([]); setError(''); setProviderNotes([]);
    if (!isValidCpf(normalizeCpf(form.cpf))) { setError('Informe um CPF válido.'); setLoading(false); return; }
    if (ageAt(form.birthDate) === null) { setError('Informe uma data de nascimento válida.'); setLoading(false); return; }
    try {
      const calls = await Promise.allSettled([calculateNossaFintech(), calculateFinanto()]);
      const combined: SimulationRow[] = [];
      const notes: string[] = [];
      calls.forEach((result, index) => {
        const provider = index === 0 ? 'Nossa Fintech' : 'FINANTO';
        if (result.status === 'fulfilled') combined.push(...result.value);
        else notes.push(`${provider}: ${result.reason?.message || 'não foi possível simular'}`);
      });
      setRows(combined);
      setProviderNotes(notes);
      if (!combined.length) setError(notes.join(' · ') || 'Nenhum banco retornou tabelas para os dados informados.');
    } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-bold text-slate-900 dark:text-white">INSS · Portabilidade + Refinanciamento</h2><p className="mt-1 text-xs text-slate-500">Informe cliente e dívida. O Sentinel consulta as tabelas das integrações Nossa Fintech e FINANTO.</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></header>
      <div className="overflow-y-auto p-5"><form onSubmit={calculate} className="space-y-4">
        <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-3 text-sm font-bold">1. Cliente e benefício</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>CPF<input required value={form.cpf} onChange={e => update('cpf', formatCpf(e.target.value))} className={inputClass} /></label>
          <label className={labelClass}>Data de nascimento<input required type="date" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Número do benefício<input required value={form.benefitNumber} onChange={e => update('benefitNumber', e.target.value.replace(/\D/g, '').slice(0, 20))} className={inputClass} /></label>
          <InssBenefitTypeSelect className={labelClass} required value={form.benefitType} onChange={value => update('benefitType', value)} />
        </div></section>
        <section className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h3 className="mb-3 text-sm font-bold">2. Contrato de origem</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>Banco de origem (código)<input required type="number" min="1" value={form.originLenderCode} onChange={e => update('originLenderCode', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Número do contrato<input required value={form.originContractNumber} onChange={e => update('originContractNumber', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Prazo original (meses)<input required type="number" min="1" value={form.originalTerm} onChange={e => update('originalTerm', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Parcelas restantes<input required type="number" min="1" value={form.openedInstallmentNumber} onChange={e => update('openedInstallmentNumber', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Saldo devedor (R$)<input required type="number" min="0.01" step="0.01" value={form.lastDueBalance} onChange={e => update('lastDueBalance', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Parcela atual (R$)<input required type="number" min="0.01" step="0.01" value={form.installmentFaceValue} onChange={e => update('installmentFaceValue', e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Prazo do novo refinanciamento<select value={form.numberOfInstallments} onChange={e => update('numberOfInstallments', e.target.value)} className={inputClass}>{INSS_TERMS.map(term => <option key={term} value={term}>{term} meses</option>)}</select></label>
          <label className="mt-5 inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={form.legalRepresentative} onChange={e => update('legalRepresentative', e.target.checked)} />Possui representante legal</label>
        </div></section>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">As integrações retornam propostas de simulação separadas. Os dados pessoais são usados para identificar a modalidade; confirme autorização do cliente antes de consultar os bancos.</p>
        {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Activity className="h-4 w-4" />{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" />Consultando FINANTO e Nossa Fintech…</> : 'Simular nas integrações disponíveis'}</button>
      </form>
      {providerNotes.length > 0 && <div className="mt-4 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{providerNotes.map(note => <p key={note}>{note}</p>)}</div>}
      {rows.some(row => !row.skipped) && <section className="mt-6"><h3 className="mb-3 text-sm font-bold">Resultados por integração e tabela</h3><div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-xs dark:bg-slate-800"><tr><th className="p-3">Integração / instituição</th><th className="p-3">Tabela</th><th className="p-3">Prazo</th><th className="p-3">Troco retornado</th><th className="p-3">Estado</th></tr></thead><tbody>{rows.filter(row => !row.skipped).map((row, index) => <tr key={`${row.provider}-${row.table?.cod_tabela || index}`} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3">{row.provider}{row.lender && <span className="block text-xs text-slate-500">{row.lender}</span>}</td><td className="p-3 font-medium">{row.table?.name || row.table?.cod_tabela || 'Tabela Port/Refin'}<span className="block text-xs font-normal text-slate-500">Código: {row.table?.cod_tabela || '—'}{row.table?.originalName ? ` · API: ${row.table.originalName}` : ''}</span></td><td className="p-3">{row.term} meses</td><td className="p-3 font-semibold">{row.success && row.troco !== null && row.troco !== undefined ? currency(row.troco) : '—'}</td><td className="p-3">{row.success ? <span className="text-emerald-600">Calculada</span> : <span className="text-rose-600">Indisponível · {row.error || `HTTP ${row.status}`}</span>}</td></tr>)}</tbody></table></div></section>}
      {rows.some(row => row.skipped) && <details className="mt-4 rounded-xl border border-amber-200 p-4 text-sm dark:border-amber-900"><summary className="cursor-pointer font-semibold">Tabelas não elegíveis ({rows.filter(row => row.skipped).length})</summary><div className="mt-3 space-y-2">{rows.filter(row => row.skipped).map((row, index) => <p key={`${row.provider}-${row.table?.cod_tabela || index}`}><strong>{row.provider} · {row.table?.name || row.table?.cod_tabela}</strong><span className="block text-xs text-slate-500">{row.error}</span></p>)}</div></details>}
      </div>
    </div>
  </div>;
};
