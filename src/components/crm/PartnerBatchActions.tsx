import React, { useEffect, useState } from 'react';
import { runPartnerBatch, PartnerBatchAction, PartnerBatchResult } from '../../services/partnerBatchActions';

export function PartnerBatchActions({ partners, selected, onSelection, canDelete, canReset, onCompleted }: {
  partners: any[]; selected: Set<string>; onSelection: (ids: Set<string>) => void;
  canDelete: boolean; canReset: boolean; onCompleted: () => void;
}) {
  const [action, setAction] = useState<PartnerBatchAction | null>(null);
  const [targets, setTargets] = useState<any[]>([]);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<PartnerBatchResult[] | null>(null);
  const [error, setError] = useState('');
  const [excel, setExcel] = useState<typeof import('exceljs') | null>(null);
  useEffect(() => {
    if (!busy) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [busy]);
  useEffect(() => { if (action === 'reset') import('exceljs').then(module => setExcel(() => module.default)).catch(() => setError('Não foi possível carregar o gerador da planilha. Feche e tente novamente.')); }, [action]);
  const open = (mode: PartnerBatchAction) => { setTargets(partners.filter(p => selected.has(p.id))); setAction(mode); setConfirmation(''); setResults(null); setProgress(0); setError(''); };
  const download = async (rows: PartnerBatchResult[]) => {
    if (!excel) throw new Error('Gerador da planilha indisponível.');
    const workbook = new excel.Workbook();
    const sheet = workbook.addWorksheet('Acessos ao portal');
    sheet.addRow(['Nome', 'Código', 'Usuário (e-mail)', 'Senha temporária', 'Portal', 'Resultado']);
    rows.forEach(row => sheet.addRow([row.name, row.code, row.email, row.password, row.portalUrl, row.status]));
    sheet.columns.forEach(column => { column.width = 32; }); sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ACESSOS_PARCEIROS_REDEFINIDOS.xlsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const execute = async () => {
    if (!action || busy || results) return;
    setBusy(true); setError('');
    try {
      const rows = await runPartnerBatch(action, targets, done => setProgress(done));
      setResults(rows); onSelection(new Set(rows.filter(row => !row.success).map(row => row.id))); onCompleted();
      if (action === 'reset') await download(rows);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível concluir o lote.'); }
    finally { setBusy(false); }
  };
  if (!canDelete && !canReset) return null;
  return <>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || !partners.length} checked={partners.length > 0 && partners.every(p => selected.has(p.id))} onChange={e => onSelection(e.target.checked ? new Set(partners.map(p => p.id)) : new Set())} />Selecionar todos os resultados carregados ({partners.length})</label>
      <span>{selected.size} selecionados</span>
      {canReset && <button disabled={!selected.size || busy} onClick={() => open('reset')} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-40">Redefinir senhas em lote</button>}
      {canDelete && <button disabled={!selected.size || busy} onClick={() => open('delete')} className="rounded-lg bg-rose-600 px-3 py-2 text-white disabled:opacity-40">Excluir selecionados</button>}
    </div>
    {action && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="partner-batch-title" className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
        <h2 id="partner-batch-title" className="text-lg font-bold">{action === 'delete' ? 'Excluir parceiros em massa' : 'Redefinir senhas em lote'}</h2>
        <p>{targets.length} parceiros. {action === 'delete' ? 'Os acessos serão revogados. O histórico das propostas será preservado.' : 'As senhas anteriores deixarão de funcionar e as sessões serão encerradas. A planilha terá as novas senhas, com troca obrigatória no primeiro acesso.'}</p>
        <ul className="max-h-32 overflow-y-auto text-sm">{targets.map(p => <li key={p.id}>{p.name || p.fullName} — {p.code || p.login}</li>)}</ul>
        {!results && <label className="block text-sm">Digite {action === 'delete' ? 'EXCLUIR' : 'REDEFINIR'} para confirmar<input disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2" /></label>}
        <p role="status">{busy ? `Processando ${progress}/${targets.length}… Mantenha esta tela aberta até concluir.` : results ? `${results.filter(row => row.success).length} concluídos; ${results.filter(row => !row.success).length} falhas.` : ''}</p>
        {results?.some(row => !row.success) && <ul className="max-h-28 overflow-y-auto text-sm text-rose-600 dark:text-rose-400">{results.filter(row => !row.success).map(row => <li key={row.id}>{row.name}: {row.status}</li>)}</ul>}
        {error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button disabled={busy} onClick={() => { setAction(null); setResults(null); }} className="rounded-lg border px-3 py-2">{results ? 'Fechar' : 'Cancelar'}</button>
          {results && action === 'reset' && <button onClick={() => download(results).catch(err => setError(err.message))} className="rounded-lg bg-blue-600 px-3 py-2 text-white">Baixar planilha de acessos</button>}
          {!results && <button disabled={busy || confirmation !== (action === 'delete' ? 'EXCLUIR' : 'REDEFINIR') || (action === 'reset' && !excel)} onClick={execute} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-40">Confirmar</button>}
        </div>
      </section>
    </div>}
  </>;
}
