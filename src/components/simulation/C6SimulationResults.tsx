import React from 'react';
import type { SimulationRequest } from '../../types';
import { SimulationOfferCard } from './SimulationOfferCard';
export type C6Offer = { id: string; name?: string; tableName?: string; amount: number; contractAmount?: number; installment: number; term: number; rate: number };
type Condition = NonNullable<SimulationRequest['selectedCondition']>;
export function c6SelectedCondition(offer: C6Offer): Condition | null {
  if (!offer.id || ![offer.amount, offer.installment, offer.rate].every(value => Number.isFinite(value) && value > 0) || !Number.isInteger(offer.term) || offer.term < 1 || offer.term > 120) return null;
  return { provider: 'C6', tableId: offer.id, tableName: offer.name || offer.tableName || 'Oferta C6 INSS', amount: offer.amount, installment: offer.installment, term: offer.term, rate: offer.rate };
}
export function C6SimulationResults({ offers, message, selected, onSelect }: { offers: C6Offer[]; message?: string; selected?: Condition; onSelect: (condition: Condition) => void }) {
  return <section className="space-y-2"><h4 className="font-bold">Ofertas C6</h4>{message && <p role="status" className="text-sm text-amber-600">C6: {message}</p>}{offers.map((offer, index) => {
    const condition = c6SelectedCondition(offer);
    const isSelected = !!condition && selected?.provider === 'C6' && selected.tableId === condition.tableId && selected.amount === condition.amount && selected.installment === condition.installment && selected.term === condition.term && selected.rate === condition.rate;
    return <SimulationOfferCard key={`${offer.id}-${index}`} name={offer.name || offer.tableName || 'Oferta C6 INSS'} description="C6 Bank · condição retornada pelo banco" amount={offer.amount} contractAmount={offer.contractAmount} installment={offer.installment} term={offer.term} rate={offer.rate} selected={isSelected} disabled={!condition} onSelect={() => { if (condition) onSelect(condition); }}>{!condition && <p className="mt-2 text-xs text-amber-600">Condição incompleta ou inválida; seleção indisponível.</p>}</SimulationOfferCard>;
  })}</section>;
}
