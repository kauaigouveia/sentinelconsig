import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storageService';
import { ActionBar } from '../ui/ActionBar';
import { Plus, Megaphone, CheckCircle2, AlertTriangle, Archive, Trash2, Send } from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { toastService } from '../ui/toastService';

export const AnnouncementsManagement: React.FC = () => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const activeUser = StorageService.getActiveUser();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [isGlobal, setIsGlobal] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/announcements/manage');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          priority,
          isGlobal,
          scheduledAt: scheduledAt || null,
          expiresAt: expiresAt || null
        })
      });

      if (res.ok) {
        toastService.success('Comunicado criado com sucesso (DRAFT)');
        setIsModalOpen(false);
        resetForm();
        fetchAnnouncements();
      } else {
        const err = await res.json();
        toastService.error(err.error || 'Erro ao criar');
      }
    } catch (e) {
      toastService.error('Erro de conexão');
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setPriority('MEDIUM');
    setIsGlobal(false);
    setScheduledAt('');
    setExpiresAt('');
  };

  const handlePublish = async (id: string) => {
    if (confirm('Deseja realmente publicar este comunicado agora?')) {
      try {
        await fetch(`/api/announcements/${id}/publish`, { method: 'POST' });
        toastService.success('Publicado');
        fetchAnnouncements();
      } catch (e) {
        toastService.error('Erro ao publicar');
      }
    }
  };

  const handleCancel = async (id: string) => {
    if (confirm('Deseja cancelar este comunicado?')) {
      try {
        await fetch(`/api/announcements/${id}/cancel`, { method: 'POST' });
        toastService.success('Cancelado');
        fetchAnnouncements();
      } catch (e) {
        toastService.error('Erro ao cancelar');
      }
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await fetch(`/api/announcements/${id}/archive`, { method: 'POST' });
      toastService.success('Arquivado');
      fetchAnnouncements();
    } catch (e) {}
  };

  const handleDelete = async (id: string) => {
    if (confirm('Excluir definitivamente?')) {
      try {
        await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
        toastService.success('Excluído');
        fetchAnnouncements();
      } catch (e) {}
    }
  };

  return (
    <div className="space-y-6">
      <ActionBar
        title="Gestão de Comunicados"
        subtitle="Publique anúncios para sua equipe ou para todos os tenants (MASTER OP)"
        badgeText="COMMUNICATION HUB"
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Comunicado</span>
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {announcements.map(a => (
          <div key={a.id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                a.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' :
                a.status === 'DRAFT' ? 'bg-slate-100 text-slate-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {a.status}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {a.tenantId ? 'Tenant Local' : 'Global'}
              </span>
            </div>
            
            <h4 className="font-bold text-slate-900 text-sm mb-1">{a.title}</h4>
            <p className="text-xs text-slate-600 line-clamp-2 mb-4 flex-1">{a.content}</p>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 flex-wrap">
              {a.status === 'DRAFT' && (
                <button 
                  onClick={() => handlePublish(a.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[10px] font-bold"
                >
                  <Send className="h-3 w-3" /> Publicar
                </button>
              )}
              {a.status === 'PUBLISHED' && (
                <button 
                  onClick={() => handleCancel(a.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-[10px] font-bold"
                >
                  <AlertTriangle className="h-3 w-3" /> Cancelar
                </button>
              )}
              {a.status !== 'ARCHIVED' && (
                <button 
                  onClick={() => handleArchive(a.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-lg text-[10px] font-bold"
                >
                  <Archive className="h-3 w-3" /> Arquivar
                </button>
              )}
              <button 
                onClick={() => handleDelete(a.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-bold ml-auto"
              >
                <Trash2 className="h-3 w-3" /> Excluir
              </button>
            </div>
          </div>
        ))}
        {announcements.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 text-sm">
            Nenhum comunicado criado.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-blue-600" />
                Novo Comunicado
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={handleCreate} className="p-4 overflow-y-auto space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Título</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Ex: Manutenção Programada" />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Conteúdo</label>
                <textarea required rows={4} value={content} onChange={e => setContent(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="Escreva o aviso aqui..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Prioridade</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                    <option value="LOW">Baixa (Low)</option>
                    <option value="MEDIUM">Normal (Medium)</option>
                    <option value="HIGH">Alta (High)</option>
                    <option value="URGENT">Urgente (Urgent)</option>
                  </select>
                </div>
                {activeUser?.role === 'PLATFORM_MASTER' && (
                  <div className="space-y-1 flex flex-col justify-center">
                    <label className="flex items-center gap-2 cursor-pointer mt-6">
                      <input type="checkbox" checked={isGlobal} onChange={e => setIsGlobal(e.target.checked)} className="rounded text-blue-600" />
                      <span className="text-sm font-bold text-slate-700">Anúncio GLOBAL (Todos os Tenants)</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Agendar Publicação (Opcional)</label>
                  <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Data de Expiração (Opcional)</label>
                  <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl">Criar Rascunho</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
