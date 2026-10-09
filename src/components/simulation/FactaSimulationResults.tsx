import React from 'react';
import { SimulationOfferCard } from './SimulationOfferCard';

export type FactaComparisonOffer = { code: string; name: string; amount?: number; contractAmount?: number; installment?: number; term?: number; rate?: number; portabilityCode?: string };
export function FactaSimulationResults({ offers, message, onSelect, selectedCode }: { offers: FactaComparisonOffer[]; message: string; onSelect?: (offer: FactaComparisonOffer) => void; selectedCode?: string }) {
  if (!offers.length && !message) return null;
  return <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <h4 className="text-sm font-bold">Condições retornadas</h4>
    {message && <p role="status" className="text-sm text-amber-600">FACTA: {message}</p>}
    {offers.map((offer, index) => <SimulationOfferCard key={`${offer.code}-${offer.portabilityCode || ''}-${index}`} name={offer.name} description={`Integração: FACTA · tabela ${offer.code}${offer.portabilityCode ? ` · portabilidade ${offer.portabilityCode}` : ''}`} amount={offer.amount} contractAmount={offer.contractAmount} installment={offer.installment} term={offer.term} rate={offer.rate} selected={selectedCode === offer.code} disabled={!(offer.amount || offer.contractAmount) || !offer.installment || !offer.term || !offer.rate} onSelect={onSelect ? () => onSelect(offer) : undefined} />)}
  </section>;
}
