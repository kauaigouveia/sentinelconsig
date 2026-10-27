import React from 'react';
import { cltRatePercent } from '../../lib/v8CltDisplay';

const statuses: Record<string, string> = {
  WAITING_CONSENT: 'Aguardando consentimento do trabalhador', CONSENT_APPROVED: 'Consentimento registrado; aguardando processamento',
  WAITING_CONSULT: 'Aguardando consulta à base competente', WAITING_CREDIT_ANALYSIS: 'Aguardando análise de crédito',
  SUCCESS: 'Consulta concluída', REJECTED: 'Cliente não elegível', FAILED: 'Falha na consulta',
};
export function V8CltConsultation({ row, selected, onSelect }: { row: any; selected: boolean; onSelect: () => void }) {
  const v8 = row.data?.v8;
  if (!v8?.consultId) return null;
  return <article className="mb-3 space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
    <h3 className="font-semibold">{row.state === 'OFFER' ? 'Oferta disponível' : v8.status === 'SUCCESS' && v8.simulationReady ? 'Margem disponível · Simulação habilitada' : statuses[v8.status] || 'Status V8 não reconhecido'}</h3>
    <p className="break-all text-xs text-slate-500">Consulta: {v8.consultId}</p>
    {row.state === 'OFFER' && <dl className="grid gap-2 sm:grid-cols-2"><div>Valor liberado: {row.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div><div>Parcela: {row.installment.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div><div>Prazo: {row.term} parcelas</div><div>Taxa mensal: {cltRatePercent(row) === undefined ? 'Não informado' : `${cltRatePercent(row)!.toLocaleString('pt-BR', { maximumFractionDigits: 8 })}%`}</div><div>Seguro: {v8.isInsured === undefined ? 'Não informado' : v8.isInsured ? 'Com seguro' : 'Sem seguro'}</div>{v8.insuranceAmount !== undefined && <div>Valor do seguro: {v8.insuranceAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>}{v8.issueAmount !== undefined && <div>Emissão: {v8.issueAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>}{v8.operationAmount !== undefined && <div>Total nominal: {v8.operationAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>}<div>Provider solicitado: {v8.requestedProvider || 'Não informado'} · retornado: {v8.returnedProvider || 'Não informado'}</div></dl>}
    {v8.firstInstallmentDate && <p className="text-xs">Primeiro vencimento informado: {v8.firstInstallmentDate}</p>}
    {v8.iofAmount !== undefined && <p className="text-xs">IOF retornado: {v8.iofAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
    {v8.rawCet?.length > 0 && <ul className="text-xs">{v8.rawCet.map((c: any) => <li key={c.field}>CET retornado ({c.field}): {c.value} · valor bruto, unidade não confirmada</li>)}</ul>}
    {row.state === 'OFFER' && !v8.rawCet?.length && <p className="text-xs">CET: Não informado</p>}
    {row.data?.margin?.available_balance !== undefined && <p>Margem disponível: {Number(row.data.margin.available_balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
    <button type="button" onClick={onSelect} className="rounded-lg border px-3 py-2 text-xs">{selected ? 'Consulta V8 selecionada' : 'Selecionar consulta para acompanhamento'}</button>
    {v8.configurations?.length > 0 && <details><summary className="cursor-pointer text-xs font-semibold">Configurações retornadas pela V8</summary><ul className="mt-2 space-y-2">{v8.configurations.map((c: any) => <li key={c.id} className="rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800"><strong>{c.name}</strong><p className="break-all">ID: {c.id}</p><p>Prazos: {c.terms.join(', ')} parcelas</p><p>Taxa mensal bruta: {c.rawMonthlyRate ?? 'Não informada'} · unidade não confirmada</p></li>)}</ul></details>}
  </article>;
}
