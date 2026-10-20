import React, { useEffect, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { readJsonResponse } from '../../lib/httpJson';

export function DaycovalWorkbookSettings({ bank = 'DAYCOVAL' }: { bank?: 'DAYCOVAL' | 'C6' | 'PARANA' | 'NOSSA_FINTECH' }) {
  const label = { DAYCOVAL: 'Daycoval', C6: 'C6', PARANA: 'Paraná', NOSSA_FINTECH: 'Nossa Fintech' }[bank];
  const endpoint = bank === 'DAYCOVAL' ? '/api/daycoval' : `/api/${bank.toLowerCase()}-spreadsheet`;
  const [config, setConfig] = useState<any>(null), [file, setFile] = useState<File | null>(null), [versionDate, setVersionDate] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { const controller = new AbortController(); void fetch(endpoint, { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await readJsonResponse(response); if (!response.ok) throw new Error(data.error); setConfig(data); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }); return () => controller.abort(); }, [endpoint]);
  const importFile = async () => {
    if (!file) return; setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData(); body.append('workbook', file); body.append('versionDate', versionDate);
      const response = await fetch(`${endpoint}/import`, { method: 'POST', body }); const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível importar.');
      setConfig(data); setFile(null); setMessage('Planilha atualizada e ativada para as simulações de Portabilidade + Refinanciamento da empresa.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const activate = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${endpoint}/activation`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !config.enabled }) }); const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error); setConfig((current: any) => ({ ...current, enabled: data.enabled })); setMessage(data.enabled ? 'Planilha ativada.' : 'Planilha desativada.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950';
  return <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-700"><header><h2 className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet className="text-blue-500" />{label} · planilha INSS</h2><p className="mt-1 text-sm text-slate-500">Condições semanais para Portabilidade + Refinanciamento. Usuários com permissão de gerenciar integrações podem atualizar e ativar o arquivo.</p></header>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}{message && <p role="status" className="text-sm text-emerald-600">{message}</p>}
    {config && <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>{config.enabled ? 'Ativa' : config.configured ? 'Desativada' : 'Não configurada'}</strong>{config.configured && <><p>{config.fileName}</p><p className="mt-1 text-xs text-slate-500">Versão: {config.versionDate?.split('-').reverse().join('/') || '—'}</p></>}</div>}
    {config?.canImport && <form onSubmit={event => { event.preventDefault(); void importFile(); }} className="space-y-3"><fieldset disabled={busy} className="grid items-end gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Planilha XLSX<input className={input} type="file" accept={bank === "C6" ? ".xlsm,.xlsx" : ".xlsx"} required onChange={event => { const selected = event.target.files?.[0] || null; if (selected && selected.size > 3500000) { setError('Envie uma planilha de até 3,5 MB.'); setFile(null); return; } setError(''); setFile(selected); const match = selected?.name.match(/(\d{2})(\d{2})(\d{4})/); if (match) setVersionDate(`${match[3]}-${match[2]}-${match[1]}`); else { const shortDate=selected?.name.match(/(\d{2})[.](\d{2})[.](\d{2})/); if (shortDate) setVersionDate(`20${shortDate[3]}-${shortDate[2]}-${shortDate[1]}`); } }} /></label><label className="text-xs font-semibold">Data da versão<input className={input} type="date" required value={versionDate} onChange={event => setVersionDate(event.target.value)} /></label><button type="submit" disabled={!file || busy} className="rounded-lg bg-blue-600 p-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Processando…' : 'Importar e ativar'}</button></fieldset>{config.configured && <button type="button" disabled={busy} onClick={() => void activate()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">{config.enabled ? 'Desativar planilha' : 'Ativar planilha'}</button>}</form>}
    {config && !config.canImport && <p className="text-sm text-slate-500">Seu perfil não permite importar planilhas. Solicite ao administrador a permissão de gerenciar integrações nesta empresa.</p>}
    <p className="text-xs text-slate-500">Configuração exclusiva da empresa atual. Resultados já registrados permanecem no histórico quando a planilha é substituída.</p>
  </section>;
}

export function PortRefinWorkbookSettings() {
  const [bank, setBank] = useState<'DAYCOVAL' | 'C6' | 'PARANA' | 'NOSSA_FINTECH'>('DAYCOVAL');
  return <div className="space-y-4"><div className="flex flex-wrap gap-2" role="tablist" aria-label="Planilhas de Portabilidade + Refinanciamento">{(['DAYCOVAL', 'C6', 'PARANA', 'NOSSA_FINTECH'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={bank === item} onClick={() => setBank(item)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${bank === item ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{item === 'NOSSA_FINTECH' ? 'Nossa Fintech' : item === 'PARANA' ? 'Paraná' : item === 'DAYCOVAL' ? 'Daycoval' : 'C6'}</button>)}</div><DaycovalWorkbookSettings key={bank} bank={bank} /></div>;
}
