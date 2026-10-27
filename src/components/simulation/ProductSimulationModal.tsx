import { cltOutcome, cltOutcomeLabels, type CltOutcome } from '../../lib/cltSimulationOutcome';
import { SimulationSteps, SimulationBack, SimulationContinue, continueSimulation } from './SimulationSteps';
import { ParanaCltSimulation } from './ParanaCltSimulation';
import { PresencaCltSimulation } from './PresencaCltSimulation';
import { PresencaFgtsSimulation } from './PresencaFgtsSimulation';
import { HappyCltSimulationModal } from './HappyCltSimulationModal';
import type { Partner, SimulationRequest } from '../../types';
import { CurrencyInput } from '../common/CurrencyInput';
import React, { useState } from 'react';
import { X, LoaderCircle } from 'lucide-react';
import { formatCpf } from '../../lib/utils';
import { CltCustomerDataCard } from './CltCustomerDataCard';
import { BmgCustomerAuthorization } from './BmgCustomerAuthorization';

type Props = { partners?: Partner[]; onSuccess?: (simulation: SimulationRequest) => void; isOpen: boolean; onBack?: () => void; product: 'CLT' | 'FGTS'; onClose: () => void; onHappyClt?: () => void };
type Row = { provider: string; institution: string; table?: string; state: string; message?: string; link?: string; amount?: number; installment?: number; term?: number; rate?: number; simulationId?: string; outcome?: CltOutcome; selectionReceipt?: string; data?: any };
const money = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950';

export const ProductSimulationModal: React.FC<Props> = ({ isOpen, product, onClose, onBack, onHappyClt, partners = [], onSuccess }) => {
  const [form, setForm] = useState({ cpf: '', name: '', phone: '', employerDocument: '', factaRegistration: '', v8ConsultId: '', v8PromoterId: '', term: product === 'FGTS' ? '4' : '0', value: '', mode: 'Payment', eligibility: true });
  const [rows, setRows] = useState<Row[]>([]);
  const [clientRows, setClientRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [step,setStep]=useState(0);
  const [selectedOffer, setSelectedOffer] = useState<Row | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [saved, setSaved] = useState(false);
  if (!isOpen) return null;
  const update = (key: keyof typeof form, value: string | boolean) => { setForm(current => ({ ...current, [key]: value, ...(['cpf', 'product'].includes(key) ? { employerDocument: '', v8ConsultId: '', v8PromoterId: '' } : {}), ...(['cpf', 'employerDocument', 'name', 'phone'].includes(key) ? { factaRegistration: '' } : {}) })); setRows([]); setSelectedOffer(null); setSaved(false); setMessage(''); if (key === 'cpf' || key === 'name' || key === 'phone') setClientRows([]); };
  const run = async (action: 'authorize' | 'simulate' | 'refresh') => {
    if(action==='simulate' || action==='authorize')setStep(2);
    setLoading(true); setRows([]); setSelectedOffer(null); setSaved(false); setMessage('');
    try {
      const response = await fetch(`/api/simulations/products/${product.toLowerCase()}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, employerDocument: action === 'refresh' ? '' : form.employerDocument, factaRegistration: action === 'refresh' ? '' : form.factaRegistration, v8ConsultId: action === 'refresh' ? undefined : form.v8ConsultId || undefined, v8PromoterId: action === 'refresh' ? undefined : form.v8PromoterId || undefined, term: Number(form.term), value: Number(form.value) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a consulta.');
      const returned: Row[] = result.rows || [];
      setRows(returned.filter(row => row.state !== 'DATA')); setMessage(result.message || '');
      if (action === 'refresh') {
        const updated = returned.filter(row => row.state === 'DATA');
        setClientRows(updated);
        const employers = [...new Set(updated.flatMap(row => [row.data?.employment?.employer_cnpj, row.data?.margin?.employer?.document, ...(Array.isArray(row.data?.items) ? row.data.items.map((item: any) => item.employerDocument) : [])].filter(Boolean).map(value => String(value).replace(/\D/g, ''))))];
        const customerName = updated.map(row => row.data?.margin?.name || row.data?.borrower?.name).find(Boolean);
        setForm(current => ({ ...current, employerDocument: employers.length === 1 ? employers[0] : current.employerDocument, factaRegistration: '', v8ConsultId: '', v8PromoterId: '', name: customerName || current.name }));
      }
    } catch (error: any) { setMessage(error.message); }
    finally { setLoading(false); }
  };
  const submitOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOffer?.selectionReceipt || !partnerId || loading || saved) return;
    setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/simulations/fgts/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: selectedOffer.selectionReceipt, partnerId, name: form.name, phone: form.phone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a oferta.');
      setSaved(true); setMessage('Oferta enviada para a fila de digitação da mesa. Nenhum contrato foi criado automaticamente no banco.'); onSuccess?.(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao enviar a oferta.'); }
    finally { setLoading(false); }
  };
  const field = (title: string, key: 'name' | 'phone' | 'employerDocument' | 'value', required = true, type = 'text') => <label className="text-xs font-semibold">{title}{key === 'value' ? <CurrencyInput required={required} min={0.01} value={form[key]} onValueChange={value => update(key, value)} className={inputClass} /> : <input required={required} type={type} min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? '0.01' : undefined} value={form[key]} onChange={event => update(key, event.target.value)} className={inputClass} />}</label>;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby={`product-simulation-${product}`} className="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><SimulationBack onBack={onBack} disabled={loading}/><h2 id={`product-simulation-${product}`} className="text-xl font-bold">{product === 'FGTS' ? 'FGTS · Antecipação do saque-aniversário' : 'CLT · Crédito do trabalhador'}</h2><p className="mt-1 text-xs text-slate-500">Consulte as instituições e tabelas disponíveis nas integrações habilitadas.</p></div><button type="button" aria-label="Fechar" onClick={onClose}><X className="h-5 w-5" /></button></header>
    <SimulationSteps labels={['Cliente','Condições','Resultados']} step={step} onChange={setStep} disabled={loading}/><div className="overflow-y-auto p-5 sm:p-7"><form className="space-y-4" onSubmit={event => { event.preventDefault(); if(step===1)void run('simulate'); }}>
      <fieldset data-simulation-step hidden={step!==0} disabled={step!==0} className="space-y-5"><section><h3 className="mb-3 text-base font-bold">1. Dados do cliente</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-xs font-semibold">CPF<input required value={form.cpf} onChange={event => update('cpf', formatCpf(event.target.value))} className={inputClass} /></label>{product === 'CLT' && <>{field('Nome completo', 'name')}{field('Telefone com DDD', 'phone')}{field('CNPJ do empregador (opcional: consulta automática dos vínculos)', 'employerDocument', false)}</>}</div></section>
      <SimulationContinue disabled={loading} onClick={event=>continueSimulation(event,()=>setStep(1))}/></fieldset>
      <fieldset hidden={step!==1} disabled={step!==1} className="space-y-5">{clientRows.length > 0 && <section className="space-y-3"><h3 className="text-sm font-bold">Dados do cliente e vínculos consultados</h3>{clientRows.map((row, index) => <CltCustomerDataCard key={`${row.provider}-${row.institution}-${index}`} row={row} selectedEmployer={form.employerDocument} selectedFactaRegistration={form.factaRegistration} selectedV8ConsultId={form.v8ConsultId} selectedV8PromoterId={form.v8PromoterId} onSelectV8={(consultId, promoterId) => setForm(current => ({ ...current, v8ConsultId: consultId, v8PromoterId: promoterId }))} onSelectEmployer={(cnpj, registration) => { update('employerDocument', cnpj); setForm(current => ({ ...current, factaRegistration: registration ?? '' })); }} />)}</section>}
      <section><h3 className="mb-3 text-sm font-bold">2. Condições da simulação</h3><div className="grid gap-3 sm:grid-cols-3">
        {product === 'CLT' && <><label className="text-xs font-semibold">Simular por<select value={form.mode} onChange={event => update('mode', event.target.value)} className={inputClass}><option value="Payment">Valor da parcela</option><option value="Liquid">Valor liberado</option></select></label>{field(form.mode === 'Payment' ? 'Parcela desejada (R$)' : 'Valor liberado desejado (R$)', 'value', true, 'number')}</>}
        <label className="text-xs font-semibold">{product === 'FGTS' ? 'Saques a antecipar' : 'Prazo (meses)'}{product === 'CLT' ? <select value={form.term} onChange={event => update('term', event.target.value)} className={inputClass}><option value="0">Todos os prazos disponíveis</option>{[6, 12, 18, 24, 30, 36, 48, 60, 72, 84].map(term => <option key={term} value={term}>{term} meses</option>)}</select> : <input required type="number" min="1" max="120" value={form.term} onChange={event => update('term', event.target.value)} className={inputClass} />}</label>
        {product === 'FGTS' && <label className="text-xs font-semibold">Modalidade da tabela<select value={String(form.eligibility)} onChange={event => update('eligibility', event.target.value === 'true')} className={inputClass}><option value="true">Com tarifa de contrato</option><option value="false">Com seguro</option></select></label>}
      </div></section>
      <p className="text-xs text-slate-500">{product === 'FGTS' ? 'O cliente precisa autorizar as instituições no aplicativo FGTS. Consultas pendentes ou sem saldo aparecem separadas das ofertas.' : 'A consulta de margem depende da autorização do cliente. Solicite a autorização, aguarde a assinatura e depois simule.'}</p>
      <div className="flex flex-wrap gap-3"><SimulationBack onBack={()=>setStep(0)} disabled={loading} label="Voltar ao cliente"/>{product === 'CLT' && <button type="button" disabled={loading} onClick={() => void run('authorize')} className="rounded-lg border border-indigo-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">Solicitar autorização nas instituições</button>}{product === 'CLT' && <button type="button" disabled={loading} onClick={() => void run('refresh')} className="rounded-lg border border-emerald-500 px-4 py-2 text-sm font-semibold disabled:opacity-50">Atualizar dados do cliente</button>}<button disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? 'Consultando instituições…' : 'Consultar ofertas'}</button></div>
      {product === 'CLT' && <BmgCustomerAuthorization input={{ ...form, product, cpf: form.cpf.replace(/\D/g, '') }} onRows={bmgRows => setRows(current => [...current.filter(row => row.provider !== 'BMG'), ...bmgRows])} />}
    </fieldset></form>
    <div hidden={step!==1}>
    {product === 'CLT' && <ParanaCltSimulation key={form.cpf} cpf={form.cpf} name={form.name} phone={form.phone} />}
    {product === 'CLT' && <PresencaCltSimulation key={`${form.cpf}:${form.name}:${form.phone}`} cpf={form.cpf} name={form.name} phone={form.phone} />}
    {product === 'FGTS' && <PresencaFgtsSimulation key={form.cpf} cpf={form.cpf} />}
    {product === 'CLT' && onHappyClt && <details className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer font-bold">Happy CLT · autorização e simulação</summary><HappyCltSimulationModal embedded isOpen key={form.cpf} initialData={{ cpf: form.cpf, name: form.name, phone: form.phone }} partners={partners} onClose={() => {}} onSuccess={simulation => onSuccess?.(simulation)} /></details>}
    </div><div hidden={step!==2}><SimulationBack onBack={()=>setStep(1)} disabled={loading} label="Voltar às condições"/>{step===2 && loading && <p role="status" className="my-4 rounded-xl bg-blue-500/10 p-5 text-sm">Consultando ofertas e retornos dos bancos…</p>}{step===2 && !rows.length && !loading && <p className="py-5 text-sm text-slate-500">Nenhuma oferta disponível. Confira os retornos abaixo ou volte para ajustar os dados.</p>}</div>
    {message && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{message}</p>}
    {step===2 && rows.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100 dark:bg-slate-800"><tr>{['Integração / instituição', 'Tabela', 'Valor liberado', 'Parcela', 'Prazo', 'Taxa mensal', 'Resultado', ...(product === 'FGTS' ? ['Selecionar'] : [])].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-200 dark:border-slate-800"><td className="p-3">{row.institution}<span className="block text-xs text-slate-500">Via {row.provider}</span></td><td className="p-3">{row.table || '—'}</td><td className="p-3 font-semibold">{money(row.amount)}</td><td className="p-3">{money(row.installment)}</td><td className="p-3">{row.term || '—'}</td><td className="p-3">{row.rate === undefined ? '—' : `${row.rate.toLocaleString('pt-BR')}%`}</td><td className="p-3"><span className={row.state === 'OFFER' ? 'text-emerald-600' : 'text-amber-600'}>{product === 'CLT' ? cltOutcomeLabels[cltOutcome(row)] : row.state === 'OFFER' ? 'Calculada' : row.message || 'Consulta pendente'}</span>{product === 'CLT' && row.message && <p className="mt-1 text-xs">{row.message}</p>}{row.link && /^https:\/\//i.test(row.link) && <a href={row.link} target="_blank" rel="noopener noreferrer" className="mt-1 block text-indigo-500 underline">Abrir autorização do cliente</a>}</td>{product === 'FGTS' && <td className="p-3">{row.state === 'OFFER' && Number(row.amount) > 0 && row.selectionReceipt && <button type="button" disabled={loading || saved} onClick={() => { setSelectedOffer(row); setMessage(''); }} className="rounded-lg border border-blue-500 px-3 py-2 text-xs font-semibold text-blue-500 disabled:opacity-50">{selectedOffer === row ? 'Selecionada' : 'Selecionar oferta'}</button>}</td>}</tr>)}</tbody></table></div>}
    {product === 'FGTS' && step === 2 && selectedOffer && <form onSubmit={event => void submitOffer(event)} className="mt-5 space-y-4 rounded-xl border border-blue-500/40 p-4">
      <h3 className="font-bold">Oferta selecionada · {selectedOffer.institution}</h3>
      <p className="text-sm">{selectedOffer.table} · {money(selectedOffer.amount)} · {selectedOffer.term || '—'} saques</p>
      <p className="text-xs text-slate-500">Complete os dados e envie para a mesa continuar a digitação. O envio não contrata a operação automaticamente.</p>
      <fieldset disabled={loading || saved} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Nome completo<input required maxLength={200} className={inputClass} value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} /></label>
        <label className="text-xs font-semibold">Telefone com DDD (opcional)<input type="tel" className={inputClass} value={form.phone} onChange={e => setForm(current => ({ ...current, phone: e.target.value }))} /></label>
        <label className="text-xs font-semibold">Parceiro responsável<select required className={inputClass} value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Selecione o parceiro</option>{partners.filter(partner => partner.active).map(partner => <option key={partner.id} value={partner.id}>{partner.login} · {partner.fullName}</option>)}</select></label>
      </fieldset>
      <button type="submit" disabled={loading || saved || !partnerId} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saved ? 'Enviada para digitação' : loading ? 'Enviando…' : 'Enviar para digitação'}</button>
    </form>}
    </div>
  </div></div>;
};
