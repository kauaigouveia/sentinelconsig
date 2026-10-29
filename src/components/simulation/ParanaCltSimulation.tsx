import React, { useEffect, useRef, useState } from 'react';
import { CurrencyInput } from '../common/CurrencyInput';
import { SimulationOfferCard } from './SimulationOfferCard';
import { normalizeCpf } from '../../lib/utils';
type Props = { sharedResults?:boolean; cpf: string; name: string; phone: string; onProgress?: (progress: { busy: boolean; message: string; offers: any[] }) => void };
const control = 'mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700';
function options(min: number, max: number, scale = 1) { const first = Math.ceil(min * scale), last = Math.floor(max * scale); return Number.isFinite(first) && Number.isFinite(last) && last >= first && last - first <= 2000 ? Array.from({ length: last - first + 1 }, (_, index) => (first + index) / scale) : []; }
export function ParanaCltSimulation(props: Props) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [links, setLinks] = useState<string[]>([]), [requests, setRequests] = useState<string[]>([]), [choices, setChoices] = useState<any[]>([]), [selected, setSelected] = useState(''), [offers, setOffers] = useState<any[]>([]);
  const [term, setTerm] = useState(''), [rate, setRate] = useState(''), [rule, setRule] = useState(''), [mode, setMode] = useState('INSTALLMENT'), [value, setValue] = useState(''), [margin, setMargin] = useState(''), [insurance, setInsurance] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { if (busy || message || offers.length) props.onProgress?.({ busy, message, offers }); }, [busy, message, offers, props.onProgress]);
  useEffect(() => () => controller.current?.abort(), []);
  const choice = choices.find(row => row.receipt === selected), limits = choice?.limits;
  async function api(action: string, body: any, signal: AbortSignal) {
    const response = await fetch(`/api/integrations/parana/clt/${action}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Consulta Paraná CLT não concluída.'); return data;
  }
  async function run(action: string) {
    if (busy) return; controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setBusy(true); setMessage(''); setOffers([]);
    try {
      if (action === 'assessment') {
        const assessments = [];
        for (const receipt of requests) assessments.push(await api(action, { receipt }, current.signal));
        if (current.signal.aborted) return;
        setChoices(assessments.flatMap(row => row.choices || [])); setSelected(''); setTerm(''); setRate('');
        setMessage(assessments.map(row => row.message || `Elegibilidade: ${row.status}`).join(' ')); return;
      }
      const data = await api(action, action === 'simulate' ? { receipt: selected, mode, value: Number(value), margin: Number(margin), term: Number(term), rate: Number(rate), rule, insurance } : { ...props, cpf: normalizeCpf(props.cpf) }, current.signal);
      if (current.signal.aborted) return;
      const results = data.results || [];
      if (action === 'consent') { setLinks([...new Set<string>(results.map((row: any) => row.link).filter(Boolean))]); setRequests([]); setChoices([]); setSelected(''); }
      if (action === 'eligibility') { setRequests(results.map((row: any) => row.receipt).filter(Boolean)); setChoices([]); setSelected(''); }
      if (action === 'simulate') setOffers(data.offers || []);
      const statuses = results.flatMap((row: any) => row.statuses || [row]).map((row: any) => row.status).filter(Boolean);
      setMessage([action === 'consent' ? 'Abra o link e aguarde o aceite do cliente.' : '', ...statuses, data.message, ...(data.messages || []), action === 'simulate' && !data.offers?.length ? 'Nenhuma oferta válida retornada pelo banco.' : ''].filter(Boolean).join(' · '));
    } catch (error) { if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha no Paraná CLT.'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  const ready = normalizeCpf(props.cpf).length === 11;
  return <section className="mt-5 space-y-3 rounded-xl border border-blue-200 p-4 dark:border-blue-900" aria-label="Paraná Crédito Trabalhador"><h3 className="font-bold">Paraná Banco · Crédito Trabalhador</h3><p className="text-xs text-slate-500">Gere o consentimento, acompanhe o aceite e solicite a elegibilidade. O Paraná valida a autorização e retorna os vínculos e limites disponíveis. Não há envio automático de SMS.</p>
    <div className="flex flex-wrap gap-2">{[['consent', 'Gerar consentimento CLT'], ['status', 'Consultar status do consentimento'], ['eligibility', 'Solicitar elegibilidade CLT'], ['assessment', 'Atualizar elegibilidade CLT']].map(([action, title]) => <button key={action} type="button" disabled={busy || !ready || action === 'consent' && (!props.name.trim() || props.phone.replace(/\D/g, '').length !== 11) || action === 'assessment' && !requests.length} onClick={() => run(action)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{title}</button>)}</div>
    {links.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block text-blue-500 underline">Abrir consentimento CLT{links.length > 1 ? ` · ${index + 1}` : ''}</a>)}
    {message && <p role="status" className="text-sm text-slate-500">{message}</p>}{busy && <p role="status">Consultando Paraná CLT…</p>}
    {choices.length > 0 && <label className="block text-xs font-semibold">Vínculo e condição elegíveis<select className={control} value={selected} disabled={busy} onChange={event => { const row = choices.find(item => item.receipt === event.target.value); setSelected(event.target.value); setTerm(''); setRate(''); setValue(''); setMargin(''); setOffers([]); setInsurance(row?.limits.tipoCondicao === 'SeguroPrestamista'); }}><option value="">Selecione</option>{choices.map((row, index) => <option key={row.receipt} value={row.receipt}>{row.employerName || row.employer} · matrícula {row.registration} · {row.limits.tipoCondicao || `Condição ${index + 1}`}</option>)}</select></label>}
    {limits && <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="mb-2 text-sm font-semibold">Condição retornada pelo Paraná</legend>
      <label className="text-xs font-semibold">Prazo<select required className={control} value={term} onChange={event => { setTerm(event.target.value); setOffers([]); }}><option value="">Selecione</option>{options(limits.quantidadeMinimaDeParcelas, limits.quantidadeMaximaDeParcelas).map(item => <option key={item} value={item}>{item} meses</option>)}</select></label>
      <label className="text-xs font-semibold">Taxa mensal<select required className={control} value={rate} onChange={event => { setRate(event.target.value); setOffers([]); }}><option value="">Selecione</option>{options(limits.taxaMinima, limits.taxaMaxima, 100).map(item => <option key={item} value={item}>{item.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</option>)}</select></label>
      <label className="text-xs font-semibold">Simular por<select className={control} value={mode} onChange={event => { setMode(event.target.value); setValue(''); setOffers([]); }}><option value="INSTALLMENT">Valor da parcela</option><option value="AMOUNT">Valor liberado</option></select></label>
      <label className="text-xs font-semibold">{mode === 'INSTALLMENT' ? 'Parcela desejada (R$)' : 'Valor solicitado (R$)'}<CurrencyInput className={control} value={value} onValueChange={item => { setValue(item); setOffers([]); }} min={mode === 'INSTALLMENT' ? limits.valorMinimoDaParcela : limits.valorMinimoLiberado} max={mode === 'INSTALLMENT' ? limits.valorMaximoDaParcela : limits.valorMaximoLiberado} /></label>
      {mode === 'AMOUNT' && <label className="text-xs font-semibold">Margem disponível (R$)<CurrencyInput className={control} value={margin} onValueChange={item => { setMargin(item); setOffers([]); }} min={0.01} /></label>}
      <label className="text-xs font-semibold">Código da regra Paraná<input className={control} value={rule} onChange={event => { setRule(event.target.value); setOffers([]); }} /><span className="font-normal text-slate-500">Informe o código fornecido pelo banco; não é preenchido por estimativa.</span></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={insurance} onChange={event => { setInsurance(event.target.checked); setOffers([]); }} />Gerar com seguro</label>
      <button type="button" disabled={!term || !rate || !rule.trim() || !(Number(value) > 0) || mode === 'AMOUNT' && !(Number(margin) > 0)} onClick={() => run('simulate')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Simular Paraná CLT</button>
    </fieldset>}
    {!props.sharedResults&&offers.map((offer, index) => <SimulationOfferCard key={`${offer.id}-${index}`} name="Paraná · Novo CLT" description={`Simulação ${offer.id} · ${offer.insurance ? 'Com seguro' : 'Sem seguro'}`} amount={offer.amount} installment={offer.installment} term={offer.term} rate={offer.rate}><p className="mt-2 text-xs text-slate-500">CET mensal: {offer.cetMonthly ?? 'Não informado'}% · CET anual: {offer.cetAnnual ?? 'Não informado'}%</p></SimulationOfferCard>)}
  </section>;
}
