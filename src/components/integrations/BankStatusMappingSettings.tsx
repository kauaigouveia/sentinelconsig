import React, { useEffect, useState } from 'react';
import { promoterApiUrl } from './BankPromoterConnection';
const providers = [['facta', 'FACTA'], ['c6', 'C6'], ['bmg', 'BMG'], ['happy', 'Happy / BYX'], ['finanto', 'FINANTO'], ['nossa-fintech', 'Nossa Fintech'], ['workbank', 'WorkBank'], ['parana', 'Paraná Banco']];
export function BankStatusMappingSettings({ promoterId, initialProvider }: { promoterId: string; initialProvider: string }) {
  const [provider, setProvider] = useState(initialProvider);
  const [rows, setRows] = useState<{ externalStatus: string; internalStatusId: string }[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { setProvider(initialProvider); }, [initialProvider]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setRows([]); setStatuses([]); setError(''); setNotice('');
    fetch(promoterApiUrl(`/api/integrations/${provider}/status-mappings`, promoterId), { cache: 'no-store', signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) { setRows(data.mappings); setStatuses(data.statuses); } }).catch(err => { if (!controller.signal.aborted) setError(err.message || 'Não foi possível carregar o mapeamento.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [provider, promoterId]);
  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try { const response = await fetch(promoterApiUrl(`/api/integrations/${provider}/status-mappings`, promoterId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mappings: rows }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.mappings); setNotice('Mapeamento salvo. Será aplicado nas próximas consultas das propostas desta promotora.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); } finally { setSaving(false); }
  };
  return <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
    <summary className="cursor-pointer text-sm font-bold">Mapeamento de status bancários</summary>
    <div className="mt-4 space-y-3">
      <p>Vincule o código ou texto recebido do banco a um status ativo da empresa. Cada mapeamento pertence à conexão da promotora selecionada. O status interno deve permitir alteração automática.</p>
      <label className="block">Banco / integração<select aria-label="Banco do mapeamento" disabled={saving} value={provider} onChange={e => setProvider(e.target.value)} className="ml-2 rounded-lg border bg-transparent p-2">{providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {loading ? <p role="status">Carregando mapeamentos…</p> : <>
        {rows.map((row, index) => <div key={index} className="flex flex-wrap gap-2">
          <input aria-label={`Status do banco ${index + 1}`} disabled={saving} value={row.externalStatus} placeholder="Ex.: 215 ou 215 - AGUARDA AVERBAÇÃO" onChange={e => setRows(previous => previous.map((item, i) => i === index ? { ...item, externalStatus: e.target.value } : item))} className="min-w-0 flex-1 rounded-lg border bg-transparent p-2" />
          <select aria-label={`Status interno ${index + 1}`} disabled={saving} value={row.internalStatusId} onChange={e => setRows(previous => previous.map((item, i) => i === index ? { ...item, internalStatusId: e.target.value } : item))} className="min-w-0 flex-1 rounded-lg border bg-transparent p-2"><option value="">Selecione o status interno</option>{statuses.map(status => <option key={status.id} value={status.id} disabled={!status.automaticChangeAllowed}>{status.name}{status.automaticChangeAllowed ? '' : ' (automação desativada)'}</option>)}</select>
          <button disabled={saving} onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}>Remover</button>
        </div>)}
        <div className="flex gap-2"><button disabled={saving || !statuses.length} onClick={() => setRows(previous => [...previous, { externalStatus: '', internalStatusId: '' }])} className="rounded-lg border px-3 py-2">Adicionar mapeamento</button><button disabled={saving || !statuses.length} onClick={save} className="rounded-lg bg-blue-600 px-3 py-2 text-white">{saving ? 'Salvando…' : 'Salvar mapeamentos'}</button></div>
      </>}
      {error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}{notice && <p role="status" className="text-emerald-600 dark:text-emerald-400">{notice}</p>}
    </div>
  </details>;
}
