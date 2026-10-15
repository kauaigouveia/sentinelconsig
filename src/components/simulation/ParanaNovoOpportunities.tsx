import React, { useEffect, useRef, useState } from 'react';
import { SimulationRequest } from '../../types';
import { isValidCpf, normalizeCpf } from '../../lib/utils';
import type { ParanaNovoOffer } from '../../lib/paranaOffers';
import { BankPromoterConnection, promoterApiUrl } from '../integrations/BankPromoterConnection';
import { SimulationOfferCard } from './SimulationOfferCard';

type Condition = NonNullable<SimulationRequest['selectedCondition']>;
type Props = { cpf: string; benefit: string; species: string; selected?: Condition; onSelect: (condition: Condition) => void; onClear: () => void };
function ConnectionOffers({ promoterId, cpf, benefit, species, selected, onSelect, onClear }: Props & { promoterId: string }) {
  const [offers, setOffers] = useState<ParanaNovoOffer[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function consult() {
    if (busy) return;
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setOffers([]); setMessage(''); onClear();
    try {
      const response = await fetch(promoterApiUrl('/api/integrations/parana/opportunities', promoterId), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(cpf) }), signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o Paraná.');
      if (current.signal.aborted) return;
      const matching = (data.offers || []).filter((offer: ParanaNovoOffer) => offer.benefit === benefit.replace(/\D/g, '') && offer.species === Number(species));
      setOffers(matching.map((offer: ParanaNovoOffer) => ({ ...offer, environment: data.environment })));
      setMessage(matching.length ? data.message : 'Nenhuma oferta válida para o benefício e espécie informados. Verifique consentimento, margem e HISCON junto ao banco.');
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha ao consultar o Paraná.'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <div className="space-y-3">
    <button type="button" disabled={busy || !isValidCpf(normalizeCpf(cpf)) || !benefit || !species} onClick={consult} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Consultando Paraná…' : 'Consultar ofertas Novo · Paraná'}</button>
    {message && <p role="status" className="text-sm text-slate-500">{message}</p>}
    {offers.map((offer: ParanaNovoOffer & { environment?: string }, index) => <SimulationOfferCard key={`${offer.id}-${index}`} name={`Novo INSS · ${offer.insurance ? 'Com seguro' : 'Sem seguro'}`} description={`Condição do Paraná · benefício ${offer.benefit} · validade ${new Date(offer.expiresAt).toLocaleString('pt-BR')}`} amount={offer.amount} installment={offer.installment} contractAmount={offer.contractAmount} term={offer.term} rate={offer.rate} selected={selected?.provider === 'Paraná Banco' && selected.tableId === offer.id && selected.amount === offer.amount} disabled={Date.parse(offer.expiresAt) <= Date.now()} onSelect={() => {
      if (Date.parse(offer.expiresAt) <= Date.now()) { setMessage('Oferta vencida. Consulte novamente.'); return; }
      onSelect({ provider: 'Paraná Banco', tableId: offer.id, tableName: `Novo INSS · ${offer.insurance ? 'Com seguro' : 'Sem seguro'}`, amount: offer.amount, installment: offer.installment, term: offer.term, rate: offer.rate, promoterId, environment: offer.environment, expiresAt: offer.expiresAt, hasInsurance: offer.insurance });
    }}><p className="mt-2 text-xs text-slate-500">CET mensal: {offer.cetMonthly ?? 'Não informado'}% · CET anual: {offer.cetAnnual ?? 'Não informado'}%</p></SimulationOfferCard>)}
  </div>;
}
export function ParanaNovoOpportunities(props: Props) {
  return <section className="space-y-3 rounded-xl border border-blue-200 p-4 dark:border-blue-900"><h3 className="font-bold">Paraná Banco · Ofertas Novo INSS</h3><p className="text-xs text-slate-500">Consulta por CPF e benefício. Prazo, parcela e taxa são retornados pelo banco e não seguem os parâmetros dos outros simuladores. A consulta não contrata nem envia SMS.</p><BankPromoterConnection endpoint="/api/integrations/parana/connections">{promoterId => <ConnectionOffers key={`${promoterId}-${props.cpf}-${props.benefit}-${props.species}`} {...props} promoterId={promoterId} />}</BankPromoterConnection></section>;
}
