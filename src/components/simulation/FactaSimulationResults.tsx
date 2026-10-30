import {EligibilityResult} from './EligibilityResult';
import React from 'react';
import { SimulationOfferCard } from './SimulationOfferCard';

export type FactaComparisonOffer = { policyStatus?:string;policyReview?:string; code: string; name: string; amount?: number; contractAmount?: number; installment?: number; term?: number; rate?: number; portabilityCode?: string };
export function FactaSimulationResults({ offers, message, canViewDiagnostics=false, onSelect, selectedCode }: { canViewDiagnostics?:boolean; offers: FactaComparisonOffer[]; message: string; onSelect?: (offer: FactaComparisonOffer) => void; selectedCode?: string }) {
  if (!offers.length && !message) return null;
  return <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <h4 className="text-sm font-bold">Ofertas FACTA</h4>

    {offers.map((offer, index) => <SimulationOfferCard key={`${offer.code}-${offer.portabilityCode || ''}-${index}`} name={offer.name} description={`Integração: FACTA · tabela ${offer.code}${offer.portabilityCode ? ` · portabilidade ${offer.portabilityCode}` : ''}`} amount={offer.amount} contractAmount={offer.contractAmount} installment={offer.installment} term={offer.term} rate={offer.rate} selected={selectedCode === offer.code} disabled={!(offer.amount || offer.contractAmount) || !offer.installment || !offer.term || !offer.rate} onSelect={onSelect ? () => onSelect(offer) : undefined}>{offer.policyStatus&&<EligibilityResult canViewDiagnostics={canViewDiagnostics} input={{bank:'FACTA',product:'INSS',table:offer.name,check:{status:offer.policyStatus,reason:offer.policyReview}}}/>}</SimulationOfferCard>)}
    {message && <EligibilityResult canViewDiagnostics={canViewDiagnostics} input={{bank:'FACTA',product:'INSS',message}}/>}
  </section>;
}
