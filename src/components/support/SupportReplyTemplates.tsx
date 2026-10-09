import React, { useEffect, useState } from 'react';

type Template = { id: string; title: string; message: string };
export function SupportReplyTemplates({ onInsert, canInsert }: { onInsert: (message: string) => void; canInsert: boolean }) {
  const [rows, setRows] = useState<Template[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = async (path = '', options?: RequestInit) => {
    const response = await fetch(`/api/support/reply-templates${path}`, { cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível acessar os modelos.');
    return data;
  };
  const load = async () => setRows(await request());
  useEffect(() => { void load().catch(err => setError(err.message)); }, []);
  const clear = () => { setEditingId(null); setTitle(''); setMessage(''); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request(editingId ? `/${encodeURIComponent(editingId)}` : '', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message }) });
      clear(); await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true); setError('');
    try { await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (editingId === id) clear(); await load(); }
    catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const control = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-950';
  return <details className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
    <summary className="cursor-pointer text-sm font-bold">Minhas mensagens modelo ({rows.length})</summary>
    <p className="my-2 text-xs text-slate-500">Cadastre respostas para reutilizar. Usar modelo preenche o campo de resposta; você pode editar antes de enviar.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="max-h-64 space-y-2 overflow-y-auto">{rows.map(row => <article key={row.id} className="rounded-lg border p-2 dark:border-slate-700">
        <strong className="text-xs">{row.title}</strong><p className="my-1 whitespace-pre-wrap break-words text-xs text-slate-500">{row.message}</p>
        <div className="flex gap-3 text-xs"><button type="button" disabled={!canInsert || busy} onClick={() => onInsert(row.message)} className="font-bold text-blue-600 disabled:opacity-40">Usar modelo</button><button type="button" disabled={busy} onClick={() => { setEditingId(row.id); setTitle(row.title); setMessage(row.message); }}>Editar</button><button type="button" disabled={busy} onClick={() => void remove(row.id)} className="text-red-600">Excluir</button></div>
      </article>)}{!rows.length && <p className="text-xs text-slate-500">Nenhum modelo cadastrado.</p>}</div>
      <form onSubmit={save} className="space-y-2"><h4 className="text-xs font-bold">{editingId ? 'Editar modelo' : 'Novo modelo'}</h4>
        <label className="block text-xs">Título<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} className={control} /></label>
        <label className="block text-xs">Mensagem<textarea required maxLength={5000} rows={3} value={message} onChange={event => setMessage(event.target.value)} className={control} /></label>
        <div className="flex gap-3"><button disabled={busy || !title.trim() || !message.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? 'Salvando…' : 'Salvar modelo'}</button>{editingId && <button disabled={busy} type="button" onClick={clear} className="text-xs">Cancelar edição</button>}</div>
      </form>
    </div>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </details>;
}
