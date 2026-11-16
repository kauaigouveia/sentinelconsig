import React, { useEffect, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { readJsonResponse } from '../../lib/httpJson';

export function DaycovalWorkbookSettings({ bank = 'DAYCOVAL' }: { bank?: 'DAYCOVAL' | 'C6' | 'PARANA' | 'NOSSA_FINTECH' }) {
  const label = { DAYCOVAL: 'Daycoval', C6: 'C6', PARANA: 'Paraná', NOSSA_FINTECH: 'Nossa Fintech' }[bank];
  const endpoint = bank === 'DAYCOVAL' ? '/api/daycoval' : `/api/${bank.toLowerCase()}-spreadsheet`;
  const [config, setConfig] = useState<any>(null), [file, setFile] = useState<File | null>(null), [versionDate, setVersionDate] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [metadataDate,setMetadataDate] = useState('');
  const [confirmMetadataOnly,setConfirmMetadataOnly] = useState(false);
  useEffect(() => { const controller = new AbortController(); void fetch(endpoint, { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await readJsonResponse(response); if (!response.ok) throw new Error(data.error); setConfig(data); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }); return () => controller.abort(); }, [endpoint]);
  const importFile = async () => {
    if (!file) return; setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData(); body.append('workbook', file); body.append('versionDate', versionDate);
      const response = await fetch(`${endpoint}/import`, { method: 'POST', body }); const data = await readJsonResponse(response);
      if (!response.ok) {
        const detail=String(data.error||'Não foi possível importar.');
        throw new Error(/fórmulas ou a estrutura mudaram/i.test(detail)
          ? detail+' O arquivo novo NÃO foi ativado. A correção de data abaixo altera somente o cadastro da planilha já ativa; não importa taxas ou fórmulas do arquivo novo.'
          : detail);
      }
      setConfig(data); setFile(null); setMessage('Planilha atualizada e ativada para as simulações de Portabilidade + Refinanciamento da empresa.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const correctDateOnly = async () => {
    if (!confirmMetadataOnly || !metadataDate) return;
    setBusy(true);setError('');setMessage('');
    try {
      const response = await fetch('/api/daycoval/version-date',{
        method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({versionDate:metadataDate,confirmMetadataOnly:true}),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error||'Não foi possível corrigir a data.');
      setConfig((current:any)=>({...current,...data}));
      setMessage('Data do cadastro atualizada. As fórmulas, tabelas, valores e o arquivo XLSX anterior foram preservados. Isto não homologa um novo arquivo.');
      setConfirmMetadataOnly(false);setMetadataDate('');
    } catch (err:any) {setError(err.message||'Não foi possível corrigir a data.');}
    finally {setBusy(false);}
  };
  const activate = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${endpoint}/activation`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !config.enabled }) }); const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error); setConfig((current: any) => ({ ...current, enabled: data.enabled })); setMessage(data.enabled ? 'Planilha ativada.' : 'Planilha desativada.');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  const input = 'mt-1 w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] p-2 text-sm dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]';
  return <section className="space-y-4 rounded-xl border border-[var(--field-border)] p-5 dark:border-[var(--field-border)]"><header><h2 className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet className="text-[var(--link)]" />{label} · planilha INSS</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Condições semanais para Portabilidade + Refinanciamento. Usuários com permissão de gerenciar integrações podem atualizar e ativar o arquivo.</p></header>
    {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}{message && <p role="status" className="text-sm text-[var(--success-text)]">{message}</p>}
    {config && <div className="rounded-lg bg-[var(--bg-canvas)] p-3 text-sm dark:bg-[var(--bg-surface-elevated)]"><strong>{config.enabled ? 'Ativa' : config.configured ? 'Desativada' : 'Não configurada'}</strong>{config.configured && <><p>{config.fileName}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Versão: {config.versionDate?.split('-').reverse().join('/') || '—'}</p></>}</div>}
    {config?.canImport && <form onSubmit={event => { event.preventDefault(); void importFile(); }} className="space-y-3"><fieldset disabled={busy} className="grid items-end gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Planilha XLSX<input className={input} type="file" accept={bank === "C6" ? ".xlsm,.xlsx" : ".xlsx"} required onChange={event => { const selected = event.target.files?.[0] || null; if (selected && selected.size > 3500000) { setError('Envie uma planilha de até 3,5 MB.'); setFile(null); return; } setError(''); setFile(selected); const match = selected?.name.match(/(\d{2})(\d{2})(\d{4})/); if (match) setVersionDate(`${match[3]}-${match[2]}-${match[1]}`); else { const shortDate=selected?.name.match(/(\d{2})[.](\d{2})[.](\d{2})/); if (shortDate) setVersionDate(`20${shortDate[3]}-${shortDate[2]}-${shortDate[1]}`); } }} /></label><label className="text-xs font-semibold">Data da versão<input className={input} type="date" required value={versionDate} onChange={event => setVersionDate(event.target.value)} /></label><button type="submit" disabled={!file || busy} className="rounded-lg bg-[var(--action)] p-2 text-sm font-bold text-[var(--action-ink)] disabled:opacity-90">{busy ? 'Processando…' : 'Importar e ativar'}</button></fieldset>{config.configured && <button type="button" disabled={busy} onClick={() => void activate()} className="rounded-lg border border-[var(--field-border)] px-3 py-2 text-sm dark:border-[var(--field-border)]">{config.enabled ? 'Desativar planilha' : 'Ativar planilha'}</button>}</form>}
    {bank === 'DAYCOVAL' && config?.configured && config.canImport && <section className="space-y-3 rounded-xl border border-[var(--border-default)] p-4">
      <h3 className="font-semibold text-sm">Corrigir somente a data da planilha cadastrada</h3>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">Use exclusivamente quando for necessário corrigir a data informada para o <strong>mesmo arquivo já homologado</strong>. Esta operação não importa o XLSX selecionado acima e não atualiza fórmulas, tabelas, taxas ou valores comerciais. Se o novo arquivo mudou, ele precisa de validação específica.</p>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Nova data de referência<input className={input} type="date" value={metadataDate} onChange={event=>setMetadataDate(event.target.value)}/></label></div>
      <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"><input className="mt-0.5" type="checkbox" checked={confirmMetadataOnly} onChange={event=>setConfirmMetadataOnly(event.target.checked)}/><span>Confirmo que quero alterar <strong>apenas a data cadastral</strong> da planilha ativa, mantendo integralmente o arquivo e as condições existentes. Entendo que isso não aprova o XLSX novo nem comprova sua vigência comercial.</span></label>
      <button type="button" disabled={busy || !metadataDate || !confirmMetadataOnly} onClick={()=>void correctDateOnly()} className="rounded-lg border border-[var(--field-border)] px-3 py-2 text-xs font-semibold disabled:opacity-50">Corrigir data, sem substituir arquivo</button>
    </section>}
    {config && !config.canImport && <p className="text-sm text-[var(--text-secondary)]">Seu perfil não permite importar planilhas. Solicite ao administrador a permissão de gerenciar integrações nesta empresa.</p>}
    <p className="text-xs text-[var(--text-secondary)]">Configuração exclusiva da empresa atual. Resultados já registrados permanecem no histórico quando a planilha é substituída.</p>
  </section>;
}

export function PortRefinWorkbookSettings() {
  const [bank, setBank] = useState<'DAYCOVAL' | 'C6' | 'PARANA' | 'NOSSA_FINTECH'>('DAYCOVAL');
  return <div className="space-y-4"><div className="flex flex-wrap gap-2" role="tablist" aria-label="Planilhas de Portabilidade + Refinanciamento">{(['DAYCOVAL', 'C6', 'PARANA', 'NOSSA_FINTECH'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={bank === item} onClick={() => setBank(item)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${bank === item ? 'border-[var(--field-border)] bg-[var(--action)] text-[var(--action-ink)]' : 'border-[var(--field-border)] dark:border-[var(--field-border)]'}`}>{item === 'NOSSA_FINTECH' ? 'Nossa Fintech' : item === 'PARANA' ? 'Paraná' : item === 'DAYCOVAL' ? 'Daycoval' : 'C6'}</button>)}</div><DaycovalWorkbookSettings key={bank} bank={bank} /></div>;
}
