import React, { useEffect, useState } from 'react';
import { OrderedSimulationBanks } from '../simulation/OrderedSimulationBanks';
import { BmgCustomerAuthorization } from '../simulation/BmgCustomerAuthorization';
import { CltCustomerDataCard } from '../simulation/CltCustomerDataCard';
import { InssBenefitTypeSelect } from '../simulation/InssBenefitTypeSelect';
import { formatCpf } from '../../lib/utils';

const money = (value: unknown) => value == null ? 'Não informado' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const control = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950';
export function PartnerSimulationsView() {
  const [form, setForm] = useState({ product: 'INSS', operation: 'NEW', cpf: '', name: '', phone: '', birthDate: '', benefitNumber: '', benefitType: '', mode: 'Payment', term: '108', value: '', rate: '', debt: '', originalTerm: '', remainingTerm: '', originalInstallment: '', originalBank: '', originalContract: '', income: '', c6Contract: '', contract: '', happyPlan: '', employerDocument: '', legalRepresentative: false, hasInsurance: false });
  const [rows, setRows] = useState<any[]>([]), [clients, setClients] = useState<any[]>([]), [history, setHistory] = useState<any[]>([]), [contracts, setContracts] = useState<any[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const load = async () => {
    const response = await fetch('/api/partner-portal/simulations');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');
    setHistory(data.rows || []);
  };
  useEffect(() => { void load().catch(err => setError(err.message)); }, []);
  const update = (key: keyof typeof form, value: string | boolean) => { setForm(current => ({ ...current, [key]: value })); setRows([]); setMessage(''); setError(''); if (['cpf', 'product'].includes(key)) { setClients([]); setContracts([]); } };
  const run = async (action: 'simulate' | 'refresh' | 'authorize' | 'contracts') => {
    setBusy(true); setError(''); setMessage(''); setRows([]);
    try {
      const response = await fetch(`/api/partner-portal/simulations/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, employerDocument: action === 'refresh' ? '' : form.employerDocument, attemptKey: crypto.randomUUID() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a consulta.');
      if (action === 'contracts') setContracts(data.contracts || []);
      else if (action === 'refresh') { setClients((data.rows || []).filter((row: any) => row.state === 'DATA')); setRows((data.rows || []).filter((row: any) => row.state !== 'DATA')); }
      else setRows(data.rows || []);
      setMessage([data.simulationId ? 'Simulação registrada automaticamente e disponível para sua mesa. Prazo: 5 dias úteis.' : '', data.message].filter(Boolean).join(' '));
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const field = (label: string, key: keyof typeof form, type = 'text', required = false) => <label className="text-xs font-semibold">{label}<input className={control} type={type} step={type === 'number' ? 'any' : undefined} required={required} value={String(form[key])} onChange={event => update(key, key === 'cpf' ? formatCpf(event.target.value) : event.target.value)} /></label>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4">
    <header><h1 className="text-xl font-bold">Simulações</h1><p className="mt-1 text-sm text-slate-500">Consulte as condições dos bancos habilitados. As consultas com valor liberado são guardadas automaticamente com seu código de parceiro.</p></header>
    <form onSubmit={event => { event.preventDefault(); void run('simulate'); }} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold">Produto<select className={control} value={form.product} onChange={event => { update('product', event.target.value); setForm(current => ({ ...current, term: event.target.value === 'INSS' ? '108' : event.target.value === 'FGTS' ? '4' : '0' })); }}><option>INSS</option><option>CLT</option><option>FGTS</option></select></label>
        {form.product === 'INSS' && <label className="text-xs font-semibold">Modalidade<select className={control} value={form.operation} onChange={event => { update('operation', event.target.value); setForm(current => ({ ...current, mode: 'Payment' })); }}><option value="NEW">Novo</option><option value="PORT_REFIN">Portabilidade + Refinanciamento</option><option value="PORT">Portabilidade</option><option value="REFIN">Refinanciamento</option></select></label>}
        {field('CPF', 'cpf', 'text', true)}{form.product !== 'FGTS' && field('Nome do cliente', 'name')}{form.product !== 'FGTS' && field('Telefone com DDD', 'phone', 'tel', form.product === 'CLT')}
        {form.product === 'INSS' && <>{field('Data de nascimento', 'birthDate', 'date', true)}{field('Número do benefício', 'benefitNumber', 'text', true)}<InssBenefitTypeSelect value={form.benefitType} onChange={value => update('benefitType', value)} /></>}
        {form.product === 'CLT' && field('Inscrição do empregador (opcional)', 'employerDocument')}
        {form.product === 'INSS' && form.operation !== 'REFIN' && field('Renda mensal para C6 (R$)', 'income', 'number')}
        {form.product === 'INSS' && form.operation === 'REFIN' && field('Contrato C6 para refinanciamento', 'c6Contract')}
      </div>
      {form.product === 'INSS' && ['PORT', 'PORT_REFIN'].includes(form.operation) && <section><h2 className="mb-2 font-bold">Contrato de origem</h2><div className="grid gap-3 sm:grid-cols-3">{field('Banco de origem (código)', 'originalBank', 'text', true)}{field('Número do contrato', 'originalContract', 'text', true)}{field('Prazo original', 'originalTerm', 'number', true)}{field('Parcelas restantes', 'remainingTerm', 'number', true)}{field('Saldo devedor (R$)', 'debt', 'number', true)}{field('Parcela original (R$)', 'originalInstallment', 'number', true)}</div></section>}
      {form.product === 'INSS' && form.operation === 'REFIN' && <div className="grid gap-3 sm:grid-cols-3">{field('Renda (R$)', 'income', 'number')}<button disabled={busy} type="button" onClick={() => void run('contracts')} className={control}>Buscar contratos FACTA</button><label className="text-xs font-semibold">Contrato FACTA<select className={control} value={form.contract} onChange={event => update('contract', event.target.value)}><option value="">Selecione</option>{contracts.map(item => <option key={item.code} value={item.code}>{item.code} · saldo {money(item.debt)}</option>)}</select></label></div>}
      {form.product === 'CLT' && <section className="space-y-3"><div className="flex flex-wrap gap-2"><button disabled={busy} type="button" className="rounded-lg border p-2 text-sm" onClick={() => void run('authorize')}>Solicitar autorização nos bancos</button><button disabled={busy} type="button" className="rounded-lg border p-2 text-sm" onClick={() => void run('refresh')}>Consultar vínculos e margem</button></div>{clients.map((row, index) => <CltCustomerDataCard key={index} row={row} selectedEmployer={form.employerDocument} onSelectEmployer={document => update('employerDocument', document)} />)}</section>}
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold">Simular por<select className={control} value={form.mode} onChange={event => update('mode', event.target.value)}><option value="Payment">Valor da parcela</option>{!(form.product === 'INSS' && ['PORT', 'PORT_REFIN'].includes(form.operation)) && <option value="Liquid">Valor liberado</option>}</select></label>
        {form.product !== 'FGTS' && field(form.mode === 'Payment' ? 'Parcela desejada (R$)' : 'Valor desejado (R$)', 'value', 'number', true)}
        <label className="text-xs font-semibold">{form.product === 'FGTS' ? 'Saques a antecipar' : 'Prazo (meses)'}<select className={control} value={form.term} onChange={event => update('term', event.target.value)}>{form.product === 'CLT' && <option value="0">Todos os prazos disponíveis</option>}{(form.product === 'FGTS' ? [1, 2, 3, 4, 5] : [6, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 108]).map(term => <option key={term} value={term}>{term}</option>)}</select></label>
        {form.product === 'INSS' && field('Taxa mensal (opcional: todas)', 'rate', 'number')}
      </div>
      {form.product === 'INSS' && <div className="flex flex-wrap items-center gap-3"><label className="text-sm"><input type="checkbox" checked={form.legalRepresentative} onChange={event => update('legalRepresentative', event.target.checked)} /> Possui representante legal</label><label className="text-sm"><input type="checkbox" checked={form.hasInsurance} onChange={event => update('hasInsurance', event.target.checked)} /> Incluir seguro quando disponível</label><button type="button" disabled={busy} className="rounded-lg border p-2 text-sm" onClick={() => void run('authorize')}>Solicitar autorização Happy / IN100</button>{form.operation === 'PORT_REFIN' && field('Plano Happy (opcional)', 'happyPlan')}</div>}
      <BmgCustomerAuthorization input={{ ...form, cpf: form.cpf.replace(/\D/g, '') }} onRows={bmgRows => setRows(current => [...current.filter(row => row.provider !== 'BMG'), ...bmgRows])} />
      <button disabled={busy} className="rounded-lg bg-violet-600 px-5 py-2 font-bold text-white disabled:opacity-50">{busy ? 'Consultando e registrando…' : 'Simular nos bancos disponíveis'}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
    </form>
    <OrderedSimulationBanks key={form.product + form.operation} operation={form.operation} groups={[...new Set(rows.map(row => String(row.provider || row.institution || "Outros")))].map(bank => ({ bank, visible: true, content: <>{rows.filter(row => String(row.provider || row.institution || "Outros") === bank).map((row, index) => <article key={index} className="rounded-xl border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-bold">{row.name || row.table || row.institution}</h3><p className="text-xs text-slate-500">{row.provider} · {row.institution}</p>{row.state === 'OFFER' ? <dl className="mt-3 grid gap-3 sm:grid-cols-4"><div><dt className="text-xs">Valor liberado</dt><dd className="font-bold">{money(row.amount)}</dd></div><div><dt className="text-xs">Valor do contrato</dt><dd>{money(row.contractAmount)}</dd></div><div><dt className="text-xs">Parcela</dt><dd>{money(row.installment)}</dd></div><div><dt className="text-xs">Prazo / taxa</dt><dd>{row.term || '—'} meses · {row.rate ?? '—'}%</dd></div></dl> : <p className="mt-2 text-sm">{row.message || 'Nenhum valor liberado.'}{row.link && /^https:\/\//.test(row.link) && <a className="ml-2 underline" href={row.link} target="_blank" rel="noreferrer">Abrir autorização</a>}</p>}</article>)}</> }))} />
    <section className="rounded-xl border p-4 dark:border-slate-800"><h2 className="mb-3 font-bold">Simulações efetuadas</h2><p className="mb-3 text-xs text-slate-500">Últimas 200 simulações. Ofertas sem digitação em 5 dias úteis são marcadas como perdidas.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Data', 'CPF', 'Código do parceiro', 'Modalidade', 'Valor liberado', 'Status', 'Prazo para digitação'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{history.map(item => <tr key={item.id} className="border-t dark:border-slate-800"><td className="p-2">{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td className="p-2">{formatCpf(item.cpf)}</td><td className="p-2">{item.partnerCode}</td><td className="p-2">{item.operationType}</td><td className="p-2">{money(item.selectedCondition?.amount)}</td><td className="p-2">{item.status === 'DIGITADA PELA MESA' ? `DIGITADA — ${item.matchedProposalNumber || ''}` : item.status === 'PERDIDA (NÃO DIGITADA)' ? 'OFERTA PERDIDA' : item.status}{item.matchedAfterDeadline && <small className="block text-amber-600">Digitada após o prazo</small>}</td><td className="p-2">{item.offerExpiresAt ? new Date(item.offerExpiresAt).toLocaleString('pt-BR') : '—'}</td></tr>)}</tbody></table></div></section>
  </div>;
}
