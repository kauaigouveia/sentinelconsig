import React, { useEffect, useRef, useState } from 'react';
import { SimulationRequest } from '../../types';
import { isValidCpf, normalizeCpf } from '../../lib/utils';
import type { ParanaNovoOffer } from '../../lib/paranaOffers';
import { SimulationOfferCard } from './SimulationOfferCard';

type Condition = NonNullable<SimulationRequest['selectedCondition']>;
type Props = { name: string; phone: string; onNameChange: (value: string) => void; onPhoneChange: (value: string) => void; cpf: string; benefit: string; species: string; selected?: Condition; onSelect: (condition: Condition) => void; onClear: () => void };
function ConnectionOffers({ name, phone, onNameChange, onPhoneChange, cpf, benefit, species, selected, onSelect, onClear }: Props) {
  const [links, setLinks] = useState<string[]>([]), [active, setActive] = useState(false);
  const [offers, setOffers] = useState<(ParanaNovoOffer & { promoterId: string; environment: string })[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function consult(action: 'consent' | 'consent-status' | 'offers') {
    if (busy) return;
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setOffers([]); setMessage(''); onClear();
    try {
      const response = await fetch(`/api/integrations/parana/novo/${action}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: normalizeCpf(cpf), name, phone }), signal: current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o Paraná.');
      if (current.signal.aborted) return;
      if (action === 'consent') { setLinks(data.links || []); setActive(false); setMessage('Abra o link e aguarde o cliente concluir o aceite. Entre 22h e 06h, o banco pode agendar o processamento para após as 06h.'); return; }
      if (action === 'consent-status') { setActive(data.active === true); setMessage(data.active ? 'Consentimento confirmado. Agora consulte as ofertas.' : 'O banco ainda não confirmou o aceite do cliente.'); return; }
      const matching = (data.offers || []).filter((offer: ParanaNovoOffer) => offer.benefit === benefit.replace(/\D/g, '') && offer.species === Number(species));
      setOffers(matching);
      setMessage([matching.length ? data.message : 'Nenhuma oferta válida para o benefício e espécie informados. Verifique margem e HISCON junto ao banco.', ...(data.messages || [])].filter(Boolean).join(' '));
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha ao consultar o Paraná.'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Nome completo para consentimento<input value={name} onChange={event => onNameChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700" /></label><label className="text-xs font-semibold">Telefone com DDD para consentimento<input type="tel" value={phone} onChange={event => onPhoneChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700" /></label></div>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !isValidCpf(normalizeCpf(cpf)) || name.trim().length < 3 || phone.replace(/\D/g, '').length !== 11} onClick={() => consult('consent')} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">1. Gerar link de consentimento</button><button type="button" disabled={busy || !links.length} onClick={() => consult('consent-status')} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">2. Confirmar aceite do cliente</button><button type="button" disabled={busy || !active || !benefit || !species} onClick={() => consult('offers')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Consultando Paraná…' : '3. Consultar ofertas Novo · Paraná'}</button></div>
    {links.map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-500 underline">Abrir consentimento Paraná{links.length > 1 ? ` · ${index + 1}` : ''}</a>)}
    {message && <p role="status" className="text-sm text-slate-500">{message}</p>}
    {offers.map((offer, index) => <SimulationOfferCard key={`${offer.id}-${index}`} name={`Novo INSS · ${offer.insurance ? 'Com seguro' : 'Sem seguro'}`} description={`Condição do Paraná · benefício ${offer.benefit} · validade ${new Date(offer.expiresAt).toLocaleString('pt-BR')}`} amount={offer.amount} installment={offer.installment} contractAmount={offer.contractAmount} term={offer.term} rate={offer.rate} selected={selected?.provider === 'Paraná Banco' && selected.tableId === offer.id && selected.amount === offer.amount} disabled={Date.parse(offer.expiresAt) <= Date.now()} onSelect={() => {
      if (Date.parse(offer.expiresAt) <= Date.now()) { setMessage('Oferta vencida. Consulte novamente.'); return; }
      onSelect({ provider: 'Paraná Banco', tableId: offer.id, tableName: `Novo INSS · ${offer.insurance ? 'Com seguro' : 'Sem seguro'}`, amount: offer.amount, installment: offer.installment, term: offer.term, rate: offer.rate, promoterId: offer.promoterId, environment: offer.environment, expiresAt: offer.expiresAt, hasInsurance: offer.insurance });
    }}><p className="mt-2 text-xs text-slate-500">CET mensal: {offer.cetMonthly ?? 'Não informado'}% · CET anual: {offer.cetAnnual ?? 'Não informado'}%</p></SimulationOfferCard>)}
  </div>;
}
export function ParanaNovoOpportunities(props: Props) {
  return <section className="space-y-3 rounded-xl border border-blue-200 p-4 dark:border-blue-900"><h3 className="font-bold">Paraná Banco · Ofertas Novo INSS</h3><p className="text-xs text-slate-500">Consulta por CPF e benefício. Prazo, parcela e taxa são retornados pelo banco e não seguem os parâmetros dos outros simuladores. Primeiro gere o consentimento, aguarde o aceite e confirme a autorização. Sem envio automático de SMS.</p><ConnectionOffers key={`${props.cpf}-${props.benefit}-${props.species}`} {...props} /></section>;
}
