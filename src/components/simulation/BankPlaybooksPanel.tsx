import React, { useMemo, useState } from 'react';
import { BANK_PLAYBOOKS, evaluateBankPlaybooks, publicPlaybookText, searchBankPlaybooks, type PlaybookInput } from '../../lib/bankPlaybooks';

export function BankPlaybooksPanel({ input, portal = false }: { input?: PlaybookInput; portal?: boolean }) {
  const [query, setQuery] = useState(''), [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false);
  const [state, setState] = useState('');
  const findings = useMemo(() => input ? evaluateBankPlaybooks({ ...input, state: input.state || state }) : [], [input?.birthDate, input?.species, input?.operation, input?.term, input?.amount, input?.installment, input?.state, input?.benefitStartDate, input?.legalRepresentative, state]);
  const excerpts = useMemo(() => searchBankPlaybooks(query, true), [query]);
  async function ask() {
    if (!query.trim() || busy) return; setBusy(true); setAnswer('');
    try {
      const response = await fetch(portal ? '/api/partner-portal/bank-playbooks/query' : '/api/sentinela/query', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Consulte os roteiros bancários cadastrados para responder: ${query.slice(0, 500)}` }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a IA.'); setAnswer(data.answer || 'Nenhuma resposta retornada.');
    } catch { setAnswer('A IA está indisponível. Consulte os trechos e roteiros abaixo.'); }
    finally { setBusy(false); }
  }
  return <details className="min-w-0 rounded-xl border border-cyan-800/40 p-4">
    <summary className="cursor-pointer font-bold">Roteiros bancários INSS · alternativas e consulta</summary>
    <p className="mt-2 text-xs text-slate-500">Nove bancos · material recebido em 16/10/2026. Inclui bancos sem API ativa. Indicações para conferência operacional; não são ofertas ou aprovação. Os demais critérios dependem do roteiro e da análise do banco.</p>
    {input && !input.state && <label className="mt-3 block text-sm">UF do benefício para conferir o roteiro<select className="ml-2 rounded-lg border border-slate-500/40 bg-transparent p-2" value={state} onChange={event => setState(event.target.value)}><option value="">Não informada</option>{['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => <option key={uf}>{uf}</option>)}</select></label>}
    {!!findings.length && <div className="mt-3 grid gap-2 sm:grid-cols-2">{findings.map(row => <details key={row.bankId} className="min-w-0 rounded-lg border border-slate-500/30 p-3"><summary className="cursor-pointer text-sm"><strong>{row.bank}</strong> · {row.status === 'BLOCKED' ? 'Restrição identificada' : 'Possibilidade a conferir'}</summary><p className="mt-2 text-xs">Versão: {row.version}</p><ul className="ml-4 mt-2 list-disc text-xs">{[...row.blocked, ...row.review].map((text, index) => <li key={index}>{text}</li>)}</ul></details>)}</div>}
    <label className="mt-4 block text-sm">Pesquisar nos roteiros<input value={query} disabled={busy} maxLength={500} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void ask(); } }} onChange={event => { setQuery(event.target.value); setAnswer(''); }} placeholder="Ex.: FACTA idade máxima ou FINANTO troco" className="mt-1 w-full rounded-lg border border-slate-500/40 bg-transparent p-2" /></label>
    <button type="button" disabled={busy || !query.trim()} onClick={() => void ask()} className="mt-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{busy ? 'Consultando roteiros…' : 'Perguntar à IA sobre os roteiros'}</button>
    {answer && <p role="status" className="mt-3 whitespace-pre-wrap text-sm">{answer}</p>}
    {!!query.trim() && <div className="mt-3 space-y-2">{excerpts.length ? excerpts.map((row, index) => <blockquote key={index} className="rounded-lg border border-slate-500/30 p-3 text-xs"><strong>{row.bank} · versão {row.version} · {row.page ? `p. ${row.page}` : `seção ${row.section}`}</strong><p className="mt-1 whitespace-pre-wrap break-words">{row.excerpt}</p></blockquote>) : <p className="text-sm">Nenhum trecho localizado. Confira o roteiro completo.</p>}</div>}
    <details className="mt-3"><summary className="cursor-pointer text-sm">Consultar os nove roteiros cadastrados</summary>{BANK_PLAYBOOKS.map(book => <details key={book.id} className="mt-2 rounded-lg border border-slate-500/30 p-3"><summary className="cursor-pointer text-sm">{book.name} · {book.version}</summary><p className="mt-2 text-xs text-slate-500">{book.sourceFile || book.source}</p><p className="mt-2 whitespace-pre-wrap break-words text-xs">{publicPlaybookText(book.text)}</p></details>)}</details>
  </details>;
}
