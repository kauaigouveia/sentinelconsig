import React from 'react';

export type FactaComparisonOffer = { code: string; name: string; amount?: number; contractAmount?: number; installment?: number; term?: number; rate?: number; portabilityCode?: string };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function FactaSimulationResults({ offers, message }: { offers: FactaComparisonOffer[]; message: string }) {
  if (!offers.length && !message) return null;
  return <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <h4 className="text-sm font-bold">Condições retornadas</h4>
    {message && <p role="status" className="text-sm text-amber-600">FACTA: {message}</p>}
    {offers.map((offer, index) => <article key={`${offer.code}-${offer.portabilityCode || ''}-${index}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <strong className="block text-sm">{offer.name}</strong><p className="mt-1 text-xs text-slate-500">Integração: FACTA · tabela {offer.code}{offer.portabilityCode ? ` · portabilidade ${offer.portabilityCode}` : ''}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
        <div><dt className="text-xs text-slate-500">Valor líquido</dt><dd className="font-semibold">{offer.amount ? money(offer.amount) : 'Não informado'}</dd></div>
        <div><dt className="text-xs text-slate-500">Valor do contrato</dt><dd>{offer.contractAmount ? money(offer.contractAmount) : 'Não informado'}</dd></div>
        <div><dt className="text-xs text-slate-500">Parcela</dt><dd>{offer.installment ? money(offer.installment) : 'Não informada'}</dd></div>
        <div><dt className="text-xs text-slate-500">Prazo / taxa mensal</dt><dd>{offer.term ? `${offer.term} meses` : '—'} · {offer.rate ? `${offer.rate.toLocaleString('pt-BR')}%` : '—'}</dd></div>
      </dl>
    </article>)}
  </section>;
}
