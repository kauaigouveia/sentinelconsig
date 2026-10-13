import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { Partner } from '../../types';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';
import { formatCpf } from '../../lib/utils';

type Contract = { balance: string; installment: string; remaining: string; cipInstallment: string };
const blank = (): Contract => ({ balance: '', installment: '', remaining: '', cipInstallment: '' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const control = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950';
export function DaycovalSimulationModal({ partners = [], portal = false, onClose, onSuccess }: { partners?: Partner[]; portal?: boolean; onClose: () => void; onSuccess: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const [meta, setMeta] = useState<any>(null), [result, setResult] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ cpf: '', partnerId: '', name: '', birthDate: '', simulationDate: today(), term: '108', additionalMargin: '', requestedRefinAmount: '' });
  const [contracts, setContracts] = useState<Contract[]>([blank()]);
  const [file, setFile] = useState<File | null>(null), [versionDate, setVersionDate] = useState(today());
  const attempt = useRef(crypto.randomUUID());
  const endpoint = portal ? '/api/partner-portal/daycoval' : '/api/daycoval';
  const simulationDate = new Date(`${form.simulationDate}T00:00:00Z`), birthDate = new Date(`${form.birthDate}T00:00:00Z`);
  const age = simulationDate.getUTCFullYear() - birthDate.getUTCFullYear() - (simulationDate.getUTCMonth() < birthDate.getUTCMonth() || simulationDate.getUTCMonth() === birthDate.getUTCMonth() && simulationDate.getUTCDate() < birthDate.getUTCDate() ? 1 : 0);
  const maxTerm = Number.isFinite(age) ? age >= 74 ? 0 : age === 73 ? 84 : age === 72 ? 96 : 108 : 108;
  const availableTerms: number[] = (meta?.terms || [108, 96, 84]).filter((term: number) => term <= maxTerm);
  useEffect(() => { if (availableTerms.length && !availableTerms.includes(Number(form.term))) { setForm(current => ({ ...current, term: String(availableTerms[0]) })); setResult(null); attempt.current = crypto.randomUUID(); } }, [maxTerm, meta?.hash]);
  useEffect(() => { let active = true; void fetch(endpoint).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (active) setMeta(data); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [endpoint]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.focus(); return () => previous?.focus(); }, []);
  useEffect(() => { const listener = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') {
      const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || [])].filter(node => node.getClientRects().length && !node.closest('fieldset:disabled'));
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }
  }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [busy, onClose]);
  const changed = () => { setResult(null); setError(''); attempt.current = crypto.randomUUID(); };
  const update = (key: keyof typeof form, value: string) => { setForm(previous => ({ ...previous, [key]: value })); changed(); };
  const input = (label: string, key: keyof typeof form, type = 'text', required = false) => <label className="text-xs font-semibold">{label}<input className={control} type={type} required={required} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? 0 : undefined} value={form[key]} onChange={event => update(key, key === 'cpf' ? formatCpf(event.target.value) : event.target.value)} /></label>;
  const run = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`${endpoint}/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, contracts, convenio: 'INSS', attemptKey: attempt.current }) });
      const data = await response.json(); if (!response.ok) { if (response.status === 409) attempt.current = crypto.randomUUID(); throw new Error(data.error || 'Não foi possível simular.'); }
      setResult(data); if (data.simulationId) onSuccess();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const upload = async () => {
    if (!file) return; setBusy(true); setError('');
    try {
      const body = new FormData(); body.append('workbook', file); body.append('versionDate', versionDate);
      const response = await fetch('/api/daycoval/import', { method: 'POST', body });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível importar.');
      setMeta(data); setFile(null); changed();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="daycoval-title" className="flex max-h-[94dvh] w-full max-w-6xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-700"><div><h2 id="daycoval-title" className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet className="text-blue-500" />Daycoval · INSS</h2><p className="mt-1 text-xs text-slate-500">Portabilidade + refinanciamento · condições da planilha semanal</p></div><button aria-label="Fechar simulador Daycoval" disabled={busy} onClick={onClose}><X /></button></header>
      <div className="space-y-5 overflow-y-auto p-5">
        {error && <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
        {!meta && !error && <p className="text-sm">Carregando versão da planilha…</p>}
        {meta && <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">{meta.configured ? <><strong>Planilha ativa:</strong> {meta.fileName}<span className="ml-3 text-xs text-slate-500">Versão {meta.versionDate?.split('-').reverse().join('/') || '—'}</span>{meta.versionDate && Date.parse(`${form.simulationDate}T00:00:00Z`) - Date.parse(`${meta.versionDate}T00:00:00Z`) > 7 * 86400000 && <p className="mt-2 text-amber-600">A versão tem mais de 7 dias. Confira se existe uma planilha mais recente.</p>}</> : <p>A empresa ainda não importou a planilha Daycoval.{!meta.canImport && ' Solicite a importação ao gestor.'}</p>}
          {meta.canImport && <details className="mt-3" open={!meta.configured}><summary className="cursor-pointer font-semibold">Importar / atualizar planilha semanal</summary><div className="mt-3 grid items-end gap-3 sm:grid-cols-3"><label className="text-xs">Arquivo XLSX<input className={control} type="file" accept=".xlsx" disabled={busy} onChange={event => { const selected = event.target.files?.[0] || null; if (selected && selected.size > 3500000) { setError('Envie uma planilha de até 3,5 MB.'); setFile(null); return; } setFile(selected); const match = selected?.name.match(/(\d{2})(\d{2})(\d{4})/); if (match) setVersionDate(`${match[3]}-${match[2]}-${match[1]}`); }} /></label><label className="text-xs">Data da versão<input className={control} type="date" value={versionDate} onChange={e => setVersionDate(e.target.value)} /></label><button className="rounded-lg bg-blue-600 p-2 text-sm font-bold text-white disabled:opacity-50" disabled={!file || busy} onClick={() => void upload()}>Ativar planilha</button></div><p className="mt-2 text-xs text-slate-500">A atualização vale para esta empresa. Simulações anteriores mantêm seus resultados e a versão utilizada.</p></details>}
        </div>}
        <form onSubmit={event => { event.preventDefault(); void run(); }} className="space-y-5">
          <fieldset disabled={busy || !meta?.configured} className="space-y-5 disabled:opacity-60">
            <div className="grid gap-3 sm:grid-cols-3">{input('CPF do cliente', 'cpf', 'text', true)}{input('Nome do cliente', 'name')}{input('Nascimento', 'birthDate', 'date', true)}{!portal && <PartnerSearchSelect partners={partners} selectedPartnerId={form.partnerId} onSelectPartner={id => update('partnerId', id)} required />}{input('Data da simulação', 'simulationDate', 'date', true)}<label className="text-xs font-semibold">Prazo do refinanciamento<select className={control} value={form.term} onChange={e => update('term', e.target.value)}>{availableTerms.map((term: number) => <option key={term} value={term}>{term} meses</option>)}</select></label></div>
            <p className="rounded-lg bg-blue-50 p-3 text-xs dark:bg-blue-950">Convênio: <strong>INSS</strong> · até 71 anos: 108 meses · 72 anos: 96 meses · 73 anos: 84 meses · a partir de 74 anos: não atende. O cálculo também verifica a idade no término.</p>
            {maxTerm === 0 && <p role="alert" className="text-sm font-semibold text-rose-600">A partir de 74 anos, portabilidade Daycoval não está disponível.</p>}<div><h3 className="mb-3 font-semibold">Contratos de origem</h3><div className="space-y-3">{contracts.map((contract, i) => <div key={i} className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] dark:border-slate-700">{(['balance','installment','remaining','cipInstallment'] as const).map((key, k) => <label key={key} className="text-xs font-semibold">{['Saldo devedor (R$)','Parcela atual (R$)','Parcelas restantes','Parcela origem CIP (opcional)'][k]}<input className={control} type="number" required={key !== 'cipInstallment'} step={key === 'remaining' ? '1' : '0.01'} min={key === 'cipInstallment' ? '0' : key === 'remaining' ? '1' : '0.01'} max={key === 'remaining' ? '144' : undefined} value={contract[key]} onChange={e => { setContracts(current => current.map((row, j) => i === j ? { ...row, [key]: e.target.value } : row)); changed(); }} /></label>)}<button type="button" className="p-2 text-rose-500" aria-label={`Remover contrato ${i+1}`} disabled={contracts.length === 1} onClick={() => { setContracts(current => current.filter((_, j) => j !== i)); changed(); }}><Trash2 size={17} /></button></div>)}</div><button type="button" className="mt-3 flex items-center gap-1 text-sm font-semibold text-blue-600" disabled={contracts.length >= 17} onClick={() => { setContracts(current => [...current, blank()]); changed(); }}><Plus size={16} />Adicionar contrato</button></div>
            <div className="grid gap-3 sm:grid-cols-2">{input('Margem adicional (R$) · opcional', 'additionalMargin', 'number')}{input('Valor solicitado no refin (R$) · opcional, para reassinatura', 'requestedRefinAmount', 'number')}</div>
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white" type="submit" disabled={maxTerm === 0 || !availableTerms.length}>{busy && <LoaderCircle className="animate-spin" size={16} />}Simular Daycoval</button>
          </fieldset>
        </form>
        {result && <section className="space-y-4"><div className="rounded-xl bg-blue-50 p-3 text-sm dark:bg-blue-950"><strong>{result.simulationId ? 'Simulação registrada automaticamente. Prazo de digitação: 5 dias úteis.' : 'Nenhuma oferta elegível com valor liberado; a consulta não gerou uma solicitação.'}</strong><p className="mt-1 text-xs">1º vencimento: {result.firstDue.split('-').reverse().join('/')} · taxa ponderada: {result.weightedRate.toFixed(3)}%</p></div><div className="grid gap-2 sm:grid-cols-3">{result.contracts.map((row: any, i: number) => <div key={i} className="rounded-lg border p-3 text-xs dark:border-slate-700"><strong>Contrato {i+1}</strong><p>Taxa retorno: {row.returnRate.toFixed(3)}%</p><p>Nova parcela: {money(row.newInstallment)}</p></div>)}</div><div className="grid gap-3 sm:grid-cols-2">{result.offers.map((offer: any) => <article key={offer.tableId} className={`rounded-xl border p-4 ${offer.eligible ? 'border-emerald-400 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700'}`}><h4 className="font-bold">{offer.tableName}</h4><p className={`mt-1 text-xs ${offer.eligible ? 'text-emerald-600' : 'text-amber-600'}`}>{offer.status}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{[['Líquido cliente',money(offer.amount)],['Valor contrato',money(offer.contractAmount)],['Saldo devedor',money(offer.balance)],['Parcela refin',money(offer.installment)],['Prazo / taxa',`${offer.term} meses · ${offer.rate.toFixed(2)}%`],['Coeficiente',offer.coefficient.toFixed(5)]].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>{offer.reSignature && <p className="mt-3 text-xs">{offer.reSignature}</p>}</article>)}</div></section>}
      </div>
    </section>
  </div>;
}
