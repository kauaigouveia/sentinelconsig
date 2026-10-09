import React from 'react';

type Props = {
  name: string;
  description: string;
  amount?: number | null;
  contractAmount?: number | null;
  installment?: number | null;
  term?: number | null;
  rate?: number | null;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children?: React.ReactNode;
};

const numeric = (value?: number | null) => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const money = (value?: number | null) => numeric(value) != null
  ? Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Não informado';

export function SimulationOfferCard({ name, description, amount, contractAmount, installment, term, rate, selected, disabled, onSelect, children }: Props) {
  return <article className={`rounded-lg border p-3 ${selected ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
    <strong className="block text-sm">{name}</strong>
    <p className="mt-1 text-xs text-slate-500">{description}</p>
    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-slate-500">Valor líquido</dt><dd className="font-semibold">{money(amount)}</dd></div>
      <div><dt className="text-xs text-slate-500">Valor do contrato</dt><dd className="font-semibold">{money(contractAmount)}</dd></div>
      <div><dt className="text-xs text-slate-500">Parcela</dt><dd className="font-semibold">{money(installment)}</dd></div>
      <div><dt className="text-xs text-slate-500">Prazo / taxa mensal</dt><dd className="font-semibold">{numeric(term) != null && Number(term) > 0 ? `${Number(term)} meses` : '—'} · {numeric(rate) != null ? `${Number(rate).toLocaleString('pt-BR')}%` : '—'}</dd></div>
    </dl>
    {children}
    {onSelect && <button type="button" aria-pressed={Boolean(selected)} disabled={disabled} onClick={onSelect} className="mt-3 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">{selected ? 'Oferta selecionada' : 'Selecionar oferta'}</button>}
  </article>;
}
