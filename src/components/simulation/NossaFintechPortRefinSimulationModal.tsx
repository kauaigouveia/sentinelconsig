import React, { useState } from 'react';
import { Activity, AlertCircle, LoaderCircle, X } from 'lucide-react';
import { getNossaFintechTroco } from '../../lib/nossaFintech';

type SimulationRow = { table?: any; success: boolean; status: number; data?: any };
type Props = { isOpen: boolean; onClose: () => void };
const currency = (value: unknown) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const NossaFintechPortRefinSimulationModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [form, setForm] = useState({ lastDueBalance: '', installmentFaceValue: '', openedInstallmentNumber: '', numberOfInstallments: '96', legalRepresentative: false });
  const [rows, setRows] = useState<SimulationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (!isOpen) return null;

  const calculate = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setRows([]); setError('');
    try {
      const response = await fetch('/api/integrations/nossa-fintech/port-refin/simulate-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, lastDueBalance: Number(form.lastDueBalance), installmentFaceValue: Number(form.installmentFaceValue), openedInstallmentNumber: Number(form.openedInstallmentNumber), numberOfInstallments: Number(form.numberOfInstallments) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar as tabelas Port/Refin.');
      if (data.success === false) throw new Error(data.data?.message || `Nossa Fintech respondeu com HTTP ${data.status}.`);
      setRows(data.data?.results || []);
      if (!data.data?.results?.length) setError(data.data?.message || 'A API não retornou tabelas compatíveis para esses dados.');
    } catch (err: any) { setError(err.message || 'Erro ao calcular as opções.'); }
    finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
    <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-bold text-slate-900 dark:text-white">Nossa Fintech · Portabilidade + Refinanciamento</h2><p className="mt-1 text-xs text-slate-500">O sistema compara as tabelas de refinanciamento retornadas pela API.</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></header>
      <div className="overflow-y-auto p-5"><form onSubmit={calculate} className="space-y-4">
        <div className="rounded-xl border border-violet-200 p-4 dark:border-violet-900"><h3 className="mb-3 text-sm font-bold">Dados do contrato atual</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([['Saldo devedor (R$)', 'lastDueBalance'], ['Parcela atual (R$)', 'installmentFaceValue'], ['Parcelas em aberto', 'openedInstallmentNumber']] as const).map(([label, key]) => <label key={key} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}<input required min="0.01" step={key === 'openedInstallmentNumber' ? '1' : '0.01'} type="number" value={form[key]} onChange={e => setForm(value => ({ ...value, [key]: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>)}
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Prazo do refinanciamento<select value={form.numberOfInstallments} onChange={e => setForm(value => ({ ...value, numberOfInstallments: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="84">84 meses</option><option value="96">96 meses</option><option value="108">108 meses</option></select></label>
        </div><label className="mt-3 inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={form.legalRepresentative} onChange={e => setForm(value => ({ ...value, legalRepresentative: e.target.checked }))} />Cliente possui representante legal</label></div>
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">A documentação não oferece consulta automática de saldo de contratos em todos os bancos. Informe o saldo, a parcela e as parcelas em aberto conforme o contrato/extrato do cliente. A API calcula a condição de Port/Refin por tabela.</p>
        {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
        <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Activity className="h-4 w-4" />{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" />Consultando e calculando…</> : 'Calcular em todas as tabelas elegíveis'}</button>
      </form>
      {rows.length > 0 && <section className="mt-6"><h3 className="mb-3 text-sm font-bold">Resultados de simulação</h3><div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-xs dark:bg-slate-800"><tr><th className="p-3">Tabela</th><th className="p-3">Código</th><th className="p-3">Juros</th><th className="p-3">Parcelas</th><th className="p-3">Troco retornado</th><th className="p-3">Estado</th></tr></thead><tbody>{rows.map((row, index) => { const amount = getNossaFintechTroco(row.data); return <tr key={`${row.table?.cod_tabela || 't'}-${index}`} className="border-t border-slate-200 dark:border-slate-800"><td className="p-3 font-medium">{row.table?.name || 'Tabela Port/Refin'}</td><td className="p-3">{row.table?.cod_tabela || '—'}</td><td className="p-3">{row.table?.amount != null ? `${row.table.amount}%` : '—'}</td><td className="p-3">{form.numberOfInstallments}</td><td className="p-3 font-semibold">{row.success && amount !== null ? currency(amount) : '—'}</td><td className="p-3">{row.success ? <span className="text-emerald-600">Calculada</span> : <span className="text-rose-600">Indisponível ({row.status})</span>}</td></tr>; })}</tbody></table></div><p className="mt-2 text-[11px] text-slate-500">O retorno é uma condição estimada por tabela; ele não cria proposta nem garante aprovação/desembolso.</p></section>}
      </div>
    </div>
  </div>;
};
