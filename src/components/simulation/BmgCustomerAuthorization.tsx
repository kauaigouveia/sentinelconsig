import React, { useEffect, useRef, useState } from 'react';
import { BmgCltProposalForm } from './BmgCltProposalForm';
export function BmgCustomerAuthorization({ input, onRows }: { input: any; onRows: (rows: any[]) => void }) {
  const [enabled, setEnabled] = useState(false), [phone, setPhone] = useState(''), [code, setCode] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [contract, setContract] = useState(''), [amount, setAmount] = useState('');
  const [rows, setRows] = useState<any[]>([]), [canCreateClt, setCanCreateClt] = useState(false);
  const scope = `${input.cpf}:${input.product}:${input.operation}:${input.benefitNumber}:${input.birthDate}:${input.value}:${input.term}`, currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => { let alive = true; void fetch('/api/integrations/bmg/config', { cache: 'no-store' }).then(async response => { if (response.ok && alive) { const data = await response.json(); setEnabled(data.enabled === true); setCanCreateClt(data.canCreateClt === true); } }).catch(() => {}); return () => { alive = false; }; }, []);
  useEffect(() => { setCode(''); setMessage(''); setContract(''); setAmount(''); setRows([]); onRows([]); }, [scope]);
  async function act(action: string) {
    setBusy(true); setMessage(''); const requestedScope = scope;
    try {
      const response = await fetch(`/api/integrations/bmg/customer/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, phone: phone || input.phone, code, bmgContract: contract, bmgRequestedAmount: amount }), signal: AbortSignal.timeout(60000) });
      const data = await response.json(); if (currentScope.current !== requestedScope) return;
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação BMG.');
      setMessage(data.message || (data.simulationId ? 'Simulação BMG registrada para acompanhamento pela mesa.' : 'Consulta BMG concluída.'));
      if (data.rows) { onRows(data.rows); setRows(data.rows); }
      if (action === 'send-otp' || action === 'verify-otp') { setRows([]); onRows([]); }
      if (action === 'verify-otp') setCode('');
    } catch (error) { if (currentScope.current === requestedScope) setMessage(error instanceof Error ? error.message : 'Falha na consulta BMG.'); } finally { setBusy(false); }
  }
  if (!enabled || !['INSS', 'CLT'].includes(input.product)) return null;
  const control = 'rounded-lg border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700';
  return <section className="space-y-3 rounded-xl border border-orange-300 p-3 dark:border-orange-900"><h3 className="font-bold">BMG — autorização do cliente</h3><p className="text-xs text-slate-500">Com a autorização do cliente, envie o código por SMS e informe o código recebido para consultar as ofertas.</p><div className="flex flex-wrap gap-2"><input className={control} type="tel" aria-label="Telefone do cliente para SMS BMG" placeholder="Telefone com DDD" value={phone} onChange={event => setPhone(event.target.value)} /><button type="button" className={control} disabled={busy || !input.cpf} onClick={() => void act('send-otp')}>Enviar código por SMS</button><input className={control} inputMode="numeric" autoComplete="one-time-code" aria-label="Código SMS BMG" placeholder="Código recebido" value={code} onChange={event => setCode(event.target.value)} /><button type="button" className={control} disabled={busy || !code} onClick={() => void act('verify-otp')}>Validar código</button></div>{input.product === 'INSS' && input.operation !== 'NEW' && <div className="flex flex-wrap gap-2"><input className={control} placeholder="Contrato para consulta BMG" aria-label="Contrato BMG" value={contract} onChange={event => setContract(event.target.value)} /><input className={control} type="number" min="0.01" step="0.01" aria-label="Valor liberado desejado BMG" placeholder="Valor liberado desejado (R$)" value={amount} onChange={event => setAmount(event.target.value)} /></div>}<button type="button" className="rounded bg-orange-600 px-4 py-2 text-sm text-white disabled:opacity-40" disabled={busy || !input.cpf} onClick={() => void act('simulate')}>{busy ? 'Aguarde...' : 'Consultar ofertas BMG'}</button>{message && <p role="status" className="text-sm">{message}</p>}{canCreateClt && input.product === 'CLT' && <BmgCltProposalForm key={scope} input={input} rows={rows} />}</section>;
}
