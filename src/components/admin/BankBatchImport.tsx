import React, { useState } from 'react';
import { BankImportRow, importBankRows, parseBankText, prepareBankRows } from '../../services/bankBatchImport';

export function BankBatchImport({ onCompleted }: { onCompleted: () => void }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const [matrix, setMatrix] = useState<unknown[][]>([]), [rows, setRows] = useState<BankImportRow[]>([]);
  const [error, setError] = useState(''), [progress, setProgress] = useState('');
  const prepare = async (values: unknown[][]) => {
    if (values.length > 1000) throw new Error('Use até 1.000 linhas por lote.');
    const response = await fetch('/api/banks', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível conferir os bancos cadastrados.');
    const banks = await response.json();
    if (!Array.isArray(banks)) throw new Error('Lista de bancos inválida.');
    return prepareBankRows(values, banks);
  };
  const preview = async (values: unknown[][]) => {
    setBusy(true); setError(''); setProgress(''); setRows([]);
    try { setRows(await prepare(values)); setMatrix(values); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ler o lote.'); }
    finally { setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Use arquivos de até 5 MB.'); return; }
    setBusy(true); setError(''); setRows([]);
    try {
      if (/\.csv$/i.test(file.name)) await preview(parseBankText(await file.text()));
      else if (/\.xlsx$/i.test(file.name)) {
        const { default: ExcelJS } = await import('exceljs'); const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0];
        if (!sheet || sheet.rowCount > 1000) throw new Error('Use até 1.000 linhas na primeira aba.');
        const values: unknown[][] = [];
        sheet.eachRow(row => { const cells: unknown[] = []; row.eachCell({ includeEmpty: true }, (cell, column) => { cells[column - 1] = cell.type === ExcelJS.ValueType.Number ? cell.value : cell.text; }); values.push(cells); });
        await preview(values);
      } else throw new Error('Selecione um arquivo .xlsx ou .csv.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Arquivo inválido.'); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    setBusy(true); setError('');
    try {
      const current = await prepare(matrix);
      const result = await importBankRows(current, (done, total) => setProgress(`Processando ${done}/${total} bancos…`));
      setRows(result); setMatrix([]); setProgress(`${result.filter(row => row.status === 'CREATED').length} bancos cadastrados; ${result.filter(row => row.status === 'FAILED').length} falhas.`); onCompleted();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o lote.'); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" onClick={() => { setOpen(true); setRows([]); setMatrix([]); setError(''); setProgress(''); }} className="rounded-xl border border-blue-300 dark:border-blue-700 px-3 py-2 text-xs font-bold text-blue-600 dark:text-blue-300">Cadastrar bancos em lote</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><section role="dialog" aria-modal="true" aria-labelledby="bank-import-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
      <h2 id="bank-import-title" className="text-lg font-bold">Cadastrar bancos em lote</h2>
      <p className="text-sm">Colunas: Nome e Código FEBRABAN. Bancos existentes serão ignorados. O cadastro não ativa APIs nem configura credenciais.</p>
      <label className="block text-sm">Arquivo Excel ou CSV<input disabled={busy} type="file" accept=".xlsx,.csv" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} className="mt-2 block w-full" /></label>
      <label className="block text-sm">Ou cole os dados da planilha<textarea disabled={busy} value={text} onChange={e => setText(e.target.value)} placeholder={'Nome\tCódigo FEBRABAN\nBANCO EXEMPLO\t999'} className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2" /></label>
      <button disabled={busy || !text.trim()} onClick={() => { try { void preview(parseBankText(text)); } catch (err) { setError((err as Error).message); } }} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Pré-visualizar dados colados</button>
      {!!rows.length && <div className="max-h-64 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Linha</th><th>Nome</th><th>Código</th><th>Resultado</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-t border-slate-200 dark:border-slate-700"><td className="py-2">{row.line}</td><td>{row.name}</td><td>{row.code}</td><td>{row.message}</td></tr>)}</tbody></table></div>}
      <p role="status">{progress}</p>{error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex justify-end gap-2"><button disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2">Fechar</button><button disabled={busy || !matrix.length || !rows.some(row => row.status === 'VALID')} onClick={execute} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-40">{busy ? 'Processando…' : `Cadastrar ${rows.filter(row => row.status === 'VALID').length} bancos`}</button></div>
    </section></div>}
  </>;
}
