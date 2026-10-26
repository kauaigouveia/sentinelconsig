import React, { useEffect, useRef, useState } from 'react';
import { CurrencyInput } from '../common/CurrencyInput';
import { SimulationOfferCard } from './SimulationOfferCard';

type Props = { cpf: string; name: string; phone: string; onProgress?: (progress: { busy: boolean; message: string; offers: any[] }) => void };
type Consent = { link: string; receipt: string };
type Choice = { employer: string; registration: string; receipt: string };
type Offer = { id: number; name: string; amount: number; installment: number; term: number; rate: number; insuranceAmount: number | null };
const control = 'mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700';
export function PresencaCltSimulation(props: Props) {
  const [available, setAvailable] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [consents, setConsents] = useState<Consent[]>([]), [confirmed, setConfirmed] = useState(false), [choices, setChoices] = useState<Choice[]>([]), [selected, setSelected] = useState('');
  const [margin, setMargin] = useState<number | null>(null), [receipt, setReceipt] = useState(''), [installment, setInstallment] = useState(''), [email, setEmail] = useState(''), [offers, setOffers] = useState<Offer[]>([]);
  const current = useRef<AbortController | null>(null);
  useEffect(() => { if (busy || message || offers.length) props.onProgress?.({ busy, message, offers }); }, [busy, message, offers, props.onProgress]);
  useEffect(() => {
    const request = new AbortController(); current.current = request;
    setCheckingAvailability(true); setAvailabilityError('');
    const timeout = setTimeout(() => request.abort('timeout'), 20000);
    fetch('/api/integrations/presenca/availability', { signal: request.signal, credentials: 'include', cache: 'no-store' }).then(async response => {
      if (!response.ok) {
        const hint = response.status === 401 ? 'Entre novamente no sistema.' : response.status === 403 ? 'Seu perfil não tem acesso à simulação Presença.' : response.status === 429 ? 'Limite de consultas atingido. Aguarde um minuto e tente novamente.' : response.status === 404 ? 'Serviço Presença indisponível nesta versão. Atualize a página e tente novamente.' : 'Não foi possível ler a configuração Presença. Tente novamente; se persistir, confira a conexão em Integrações.';
        throw new Error(`Presença · HTTP ${response.status}: ${hint}`);
      }
      const data = await response.json();
      if (!request.signal.aborted) setAvailable(data.clt === true);
    }).catch(error => {
      if (!request.signal.aborted || request.signal.reason === 'timeout') setAvailabilityError(request.signal.reason === 'timeout' ? 'A verificação Presença demorou demais. Tente novamente.' : error instanceof Error && error.message.startsWith('Presença · HTTP') ? error.message : 'Falha de conexão ao verificar Presença. Confira sua conexão e tente novamente.');
    }).finally(() => { clearTimeout(timeout); if (!request.signal.aborted || request.signal.reason === 'timeout') setCheckingAvailability(false); });
    return () => { clearTimeout(timeout); request.abort(); current.current?.abort(); };
  }, [availabilityAttempt]);
  async function api(action: string, body: unknown, signal: AbortSignal) {
    const response = await fetch(`/api/integrations/presenca/clt/${action}`, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Consulta Presença não concluída.'); return data;
  }
  async function run(action: 'consent' | 'employments' | 'margin' | 'offers') {
    if (busy) return; current.current?.abort(); const request = new AbortController(); current.current = request;
    setBusy(true); setMessage(''); setFailed(false); setOffers([]);
    if (action !== 'offers') { setMargin(null); setReceipt(''); setInstallment(''); }
    if (action === 'consent' || action === 'employments') { setChoices([]); setSelected(''); }
    if (action === 'consent') { setConsents([]); setConfirmed(false); }
    try {
      if (action === 'employments') {
        const returned: Choice[] = [], failures: string[] = [];
        for (const consent of consents) {
          try { const data = await api(action, { receipt: consent.receipt, clientConfirmed: confirmed }, request.signal); returned.push(...data.choices); }
          catch (error) { if (request.signal.aborted) return; failures.push(error instanceof Error ? error.message : 'Falha na conexão Presença.'); }
        }
        if (request.signal.aborted) return; setChoices(returned); setFailed(failures.length > 0);
        setMessage([returned.length ? 'Selecione um vínculo para consultar a margem. Vínculo ativo não garante crédito.' : 'Nenhum vínculo ativo compatível retornado.', ...new Set(failures)].join(' '));
      } else {
        const body = action === 'consent' ? props : action === 'margin' ? { receipt: selected } : { receipt, installment: Number(installment), email };
        const data = await api(action, body, request.signal); if (request.signal.aborted) return;
        if (action === 'consent') { setConsents(data.results); setMessage(['Abra os links e aguarde o cliente assinar. Não confirme o aceite em nome dele.', ...(data.messages || [])].join(' ')); }
        if (action === 'margin') { setMargin(data.margin); setReceipt(data.receipt); setMessage('Margem consultada. Informe a parcela desejada para consultar ofertas.'); }
        if (action === 'offers') { setOffers(data.offers); setMessage(data.message); }
      }
    } catch (error) { if (!request.signal.aborted) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Falha na consulta Presença.'); } }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  if (!available) return availabilityError ? <div className="mt-5 space-y-2 text-sm"><p role="alert" className="text-amber-600 dark:text-amber-300">{availabilityError}</p><button type="button" onClick={() => setAvailabilityAttempt(value => value + 1)} className="rounded-lg border px-3 py-2">Verificar Presença novamente</button></div> : checkingAvailability && availabilityAttempt > 0 ? <p role="status">Verificando disponibilidade Presença…</p> : null;
  return <section className="mt-5 space-y-3 rounded-xl border border-cyan-200 p-4 dark:border-cyan-900" aria-label="Presença CLT">
    <h3 className="font-bold">Presença Bank · CLT</h3><p className="text-xs text-slate-500">Consentimento → vínculos → margem → ofertas. Consulta disponível nas conexões habilitadas da empresa. Não realiza contratação nem registra assinatura pelo cliente.</p>
    <fieldset disabled={busy} className="space-y-3">
      <button type="button" disabled={props.cpf.replace(/\D/g, '').length !== 11 || !props.name.trim() || props.phone.replace(/\D/g, '').length !== 11} onClick={() => void run('consent')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">1. Gerar consentimento Presença</button>
      {consents.map((consent, index) => <a key={consent.receipt} href={consent.link} target="_blank" rel="noopener noreferrer" className="block text-blue-500 underline">Abrir termo Presença{consents.length > 1 ? ` · ${index + 1}` : ''}</a>)}
      {!!consents.length && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setChoices([]); setSelected(''); setMargin(null); setReceipt(''); setOffers([]); }} />O cliente informou que concluiu a assinatura dos termos</label><button type="button" disabled={!confirmed} onClick={() => void run('employments')} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">2. Consultar vínculos Presença</button></>}
      {!!choices.length && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Vínculo ativo<select className={control} value={selected} onChange={event => { setSelected(event.target.value); setMargin(null); setReceipt(''); setInstallment(''); setOffers([]); }}><option value="">Selecione</option>{choices.map((choice, index) => <option key={choice.receipt} value={choice.receipt}>Empregador {choice.employer} · matrícula {choice.registration} · {index + 1}</option>)}</select></label><button type="button" disabled={!selected} onClick={() => void run('margin')} className="self-end rounded-lg border px-3 py-2 text-sm disabled:opacity-50">3. Consultar margem Presença</button></div>}
      {margin !== null && <><p className="text-sm">Margem disponível: <strong>{margin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">E-mail do cliente<input className={control} type="email" value={email} onChange={event => { setEmail(event.target.value); setOffers([]); }} /></label><label className="text-sm">Parcela desejada (R$)<CurrencyInput className={control} value={installment} min={0.01} max={margin} onValueChange={value => { setInstallment(value); setOffers([]); }} /></label></div><button type="button" disabled={!receipt || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || Number(installment) <= 0 || Number(installment) > margin} onClick={() => void run('offers')} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">4. Consultar ofertas Presença</button></>}
    </fieldset>
    {busy && <p role="status">Consultando Presença…</p>}{message && <p role={failed ? 'alert' : 'status'} className="text-sm text-slate-500">{message}</p>}
    {offers.map((offer, index) => <SimulationOfferCard key={`${offer.id}-${index}`} name={offer.name} description="Presença · CLT · condição retornada pelo banco" amount={offer.amount} installment={offer.installment} term={offer.term} rate={offer.rate}><p className="mt-2 text-xs text-slate-500">Seguro: {offer.insuranceAmount === null ? 'não informado' : offer.insuranceAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Contratação ainda não disponível nesta integração.</p></SimulationOfferCard>)}
  </section>;
}
