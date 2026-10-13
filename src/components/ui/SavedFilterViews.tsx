import React, { useEffect, useState } from 'react';
import { Bookmark, Plus, Check, Trash2, X } from 'lucide-react';
type SavedView = { id: string; name: string; filters: Record<string, string> };
function readViews(key: string): SavedView[] {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter(row => typeof row?.id === 'string' && typeof row?.name === 'string' && row.filters && typeof row.filters === 'object').slice(0, 8) : []; } catch { return []; }
}
export function SavedFilterViews({ storageKey, filters, onApply }: { storageKey: string; filters: Record<string, string>; onApply: (filters: Record<string, string>) => void }) {
  const [views, setViews] = useState(() => readViews(storageKey)), [selected, setSelected] = useState(''), [editing, setEditing] = useState(false), [name, setName] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { setViews(readViews(storageKey)); setSelected(''); setMessage(''); }, [storageKey]);
  useEffect(() => {
    if (!selected) return;
    const view = views.find(item => item.id === selected);
    if (!view || Object.keys(filters).some(key => filters[key] !== view.filters[key])) setSelected('');
  }, [JSON.stringify(filters), selected, views]);
  function persist(next: SavedView[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setViews(next); return true; }
    catch { setMessage('O navegador não permitiu salvar esta visualização.'); return false; }
  }
  function save() {
    const label = name.trim(); if (!label) return;
    const existing = views.find(view => view.name.toLowerCase() === label.toLowerCase());
    if (!existing && views.length >= 8) { setMessage('Limite de 8 visualizações. Remova uma para salvar outra.'); return; }
    const view = { id: existing?.id || crypto.randomUUID(), name: label, filters };
    if (persist([...views.filter(item => item.id !== view.id), view])) { setSelected(view.id); setEditing(false); setName(''); setMessage('Filtros salvos neste navegador para sua empresa e seu usuário.'); }
  }
  return <div className="sentinel-saved-views"><Bookmark size={15} className="text-teal-700 dark:text-teal-300" /><span className="font-semibold">Minhas visualizações</span><select aria-label="Aplicar visualização salva de propostas" value={selected} onChange={event => { setSelected(event.target.value); const view = views.find(item => item.id === event.target.value); if (view) { onApply(view.filters); setMessage(`Visualização “${view.name}” aplicada.`); } }}><option value="">Escolha os filtros salvos</option>{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select>{editing ? <><input value={name} maxLength={40} aria-label="Nome da visualização de propostas" placeholder="Ex.: Pendências FACTA" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} /><button type="button" className="sentinel-secondary-button !py-1.5" disabled={!name.trim()} onClick={save}><Check size={14} />Salvar</button><button type="button" onClick={() => setEditing(false)} aria-label="Cancelar criação de visualização"><X size={15} /></button></> : <button type="button" className="sentinel-secondary-button !py-1.5" onClick={() => { setEditing(true); setMessage(''); }}><Plus size={14} />Salvar filtros atuais</button>}{selected && <button type="button" className="ml-auto text-slate-500" aria-label="Remover visualização salva" onClick={() => { if (persist(views.filter(view => view.id !== selected))) { setSelected(''); setMessage('Visualização removida.'); } }}><Trash2 size={15} /></button>}{message && <p role="status" className="w-full">{message}</p>}</div>;
}
