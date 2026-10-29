import { V8ApiAuthorization } from './V8ApiAuthorization';
import {uniqueV8Reference,v8References} from '../../lib/cltV8Selection';
import React from 'react';
import {isCltBirthDate,isCltEmail,isCltGender,parseCltBirthDate} from '../../lib/cltCustomerData';

export function V8CltActions({ capabilities, form, setForm, start, busy, executionId, rows, onCompleteData }: any) {
  const references=v8References(rows),unique=uniqueV8Reference(rows);
  const connections = capabilities?.connections || [], selected = connections.find((c: any) => c.promoterId === (unique?.promoterId||form.v8PromoterId)) || (connections.length === 1 ? connections[0] : null);
  const missing=[!(parseCltBirthDate(form.v8BirthDate||'')||isCltBirthDate(form.v8BirthDate))&&'nascimento válido',!isCltEmail(form.v8Email||'')&&'e-mail válido',!isCltGender(form.v8Gender)&&'sexo informado pelo trabalhador'].filter(Boolean);
  const createReasons=[busy&&'Aguarde a consulta em andamento.',missing.length&&`Complete na etapa Cliente: ${missing.join(', ')}.`,!selected&&(connections.length>1?'Selecione a conexão V8 autorizada.':'Aguarde a conferência das conexões V8 disponíveis.')].filter(Boolean);
  const simulateReasons=[busy&&'Aguarde a consulta em andamento.',!selected?.simulationReady&&'A conexão ainda não está habilitada para cálculo; confira as pendências abaixo.',!rows?.some((r:any)=>r.data?.v8?.simulationReady)&&'Aguarde consulta própria SUCCESS, autorização registrada, margem positiva e configurações elegíveis.'].filter(Boolean);
  return <details className="mb-4 space-y-3 rounded-xl border p-3 text-sm"><summary className="cursor-pointer text-xs font-semibold">Ações específicas V8</summary><p>A V8 consulta autorizações e margem antes de calcular. A autorização da consulta é processada pela API V8.</p>{connections.length > 1 && <label>Conexão V8<select className="ml-2 rounded border bg-transparent p-2" value={form.v8PromoterId} onChange={e => setForm((old: any) => ({ ...old, v8PromoterId: e.target.value, v8ConsultId: '' }))}><option value="">Selecione</option>{connections.map((c: any) => <option key={c.promoterId} value={c.promoterId}>{c.promoterId}</option>)}</select></label>}
    {selected?.reasons?.length > 0 && <ul className="list-inside list-disc text-xs">{selected.reasons.map((reason: string) => <li key={reason}>{reason}</li>)}</ul>}
    {!references.length&&<button type="button" title={createReasons.join(' ')} disabled={createReasons.length>0} onClick={() => start('v8', 'CREATE_CONSULT')} className="rounded border p-2">Criar consulta V8</button>}
    {createReasons.length>0&&<p className="text-xs text-slate-500">{createReasons.join(' ')}</p>}
    {missing.length>0&&onCompleteData&&<button type="button" disabled={busy} onClick={onCompleteData} className="rounded border p-2">Completar dados na etapa Cliente</button>}

  </details>;
}
