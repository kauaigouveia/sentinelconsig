import React, { useEffect, useRef, useState } from 'react';

export type PresencaBenefitDetail = { cpf: string; name: string | null; birthDate: string | null; benefit: string; species: string; income: number | null; benefitStartDate: string | null; benefitState: string | null; margin: number | null; cardMargin: number | null; benefitCardMargin: number | null; sex: string | null };
type Benefit = { benefit: string; species: string; income: number | null; receipt: string };
const money = (value: number | null) => value === null ? 'Não informado' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function PresencaInssBenefits({ cpf, onApply, onUseMargin }: { cpf: string; onApply: (detail: PresencaBenefitDetail) => void; onUseMargin?: (detail: PresencaBenefitDetail) => void }) {
  const [available, setAvailable] = useState(false), [failedAvailability, setFailedAvailability] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [benefits, setBenefits] = useState<Benefit[]>([]), [selected, setSelected] = useState(''), [detail, setDetail] = useState<PresencaBenefitDetail | null>(null);
  const current = useRef<AbortController | null>(null);
  useEffect(() => {
    if (cpf.replace(/\D/g, '').length !== 11) return;
    const request = new AbortController(); current.current = request;
    fetch('/api/integrations/presenca/availability', { signal: request.signal, credentials: 'include', cache: 'no-store' }).then(async response => {
      if ([401, 403].includes(response.status)) return;
      const data = await response.json(); if (!response.ok) throw new Error(); if (!request.signal.aborted) setAvailable(data.inssLookup === true);
    }).catch(() => { if (!request.signal.aborted) setFailedAvailability(true); });
    return () => current.current?.abort();
  }, []);
  async function run(details: boolean) {
    if (busy) return; current.current?.abort(); const request = new AbortController(); current.current = request;
    setBusy(true); setMessage(''); setDetail(null);
    if (!details) { setBenefits([]); setSelected(''); }
    try {
      const response = await fetch(`/api/integrations/presenca/inss/${details ? 'benefit-detail' : 'benefits'}`, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details ? { receipt: selected } : { cpf }), signal: request.signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o benefício.'); if (request.signal.aborted) return;
      if (details) setDetail(data.detail);
      else { setBenefits(data.benefits); setMessage([data.benefits.length ? 'Selecione o benefício e consulte os detalhes.' : 'Nenhum benefício retornado para este CPF.', ...(data.messages || [])].join(' ')); }
    } catch (error) { if (!request.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha na consulta de benefícios.'); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  if (!available) return failedAvailability ? <p role="alert" className="text-sm text-amber-600 dark:text-amber-300">Consulta INSS Presença indisponível no momento. O preenchimento manual continua disponível.</p> : null;
  return <section aria-label="Consultar benefício INSS no Presença" className="space-y-3 rounded-xl border border-cyan-200 p-4 dark:border-cyan-900">
    <h3 className="font-bold">Presença · Dados e margem do benefício</h3><p className="text-xs text-slate-500">Consulte com autorização do cliente. Os dados preenchem o formulário após sua confirmação e permanecem editáveis. Margem não significa aprovação de crédito.</p>
    <fieldset disabled={busy} className="space-y-3"><button type="button" disabled={cpf.replace(/\D/g, '').length !== 11} onClick={() => void run(false)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Buscar benefícios pelo CPF</button>
      {!!benefits.length && <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Benefício retornado<select className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent p-2 dark:border-slate-700" value={selected} onChange={event => { setSelected(event.target.value); setDetail(null); setMessage(''); }}><option value="">Selecione</option>{benefits.map((item, index) => <option key={item.receipt} value={item.receipt}>{item.benefit} · espécie {item.species} · {money(item.income)} · {index + 1}</option>)}</select></label><button type="button" disabled={!selected} onClick={() => void run(true)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Consultar detalhes do benefício</button></div>}
      {detail && <><dl className="grid gap-3 text-sm sm:grid-cols-3"><div><dt>Cliente</dt><dd>{detail.name || 'Não informado'}</dd></div><div><dt>Benefício / espécie</dt><dd>{detail.benefit} · {detail.species}</dd></div><div><dt>Valor do benefício</dt><dd>{money(detail.income)}</dd></div><div><dt>Margem residual</dt><dd>{money(detail.margin)}</dd></div><div><dt>Margem cartão</dt><dd>{money(detail.cardMargin)}</dd></div><div><dt>Margem cartão benefício</dt><dd>{money(detail.benefitCardMargin)}</dd></div></dl><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { onApply(detail); setMessage('Dados disponíveis preenchidos. Revise antes de simular; os campos continuam editáveis.'); }} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">Preencher dados do cliente e benefício</button>{onUseMargin && detail.margin !== null && detail.margin > 0 && <button type="button" onClick={() => { onUseMargin(detail); setMessage('Dados preenchidos e margem residual aplicada à parcela desejada. Revise antes de simular.'); }} className="rounded-lg border px-3 py-2 text-sm">Usar margem residual como parcela</button>}</div></>}
    </fieldset>{busy && <p role="status" className="text-sm">Consultando benefício Presença…</p>}{message && <p role="status" className="text-sm text-slate-500">{message}</p>}
  </section>;
}
