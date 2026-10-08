import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Archive,
  Trash2,
  Eye,
  Check,
  Filter,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { toastService } from '../ui/toastService';
import { StorageService } from '../../services/storageService';
import { ApiIncident } from './ApiMonitoringTab';

export interface AnnouncementItem {
  id: string;
  tenantId?: string | null;
  createdById: string;
  title: string;
  content: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'EXPIRED' | 'ARCHIVED' | 'CANCELLED';
  publishedAt?: string | null;
  scheduledAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  read?: boolean;
  reads?: {
    id: string;
    userId: string;
    readAt: string;
    user?: { name: string; email: string; role: string };
  }[];
}

interface AnnouncementsTabProps {
  initialIncidentToPublish?: ApiIncident | null;
  onClearInitialIncident?: () => void;
}

export const AnnouncementsTab: React.FC<AnnouncementsTabProps> = ({
  initialIncidentToPublish,
  onClearInitialIncident,
}) => {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementItem | null>(null);

  // Modal de Criação / Edição
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [isGlobal, setIsGlobal] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Modal de Métricas de Leitura
  const [readingMetricsItem, setReadingMetricsItem] = useState<AnnouncementItem | null>(null);

  const activeUser = StorageService.getActiveUser();
  const isManager =
    activeUser?.role === 'MASTER' ||
    activeUser?.role === 'PLATFORM_MASTER';

  // Se veio pré-preenchido de um incidente de API
  useEffect(() => {
    if (initialIncidentToPublish) {
      setTitle(`[ALERTA OPERACIONAL] ${initialIncidentToPublish.title}`);
      setContent(
        `Atenção equipe,\n\nIdentificamos uma instabilidade no serviço **${
          initialIncidentToPublish.service?.name || 'Integração de API'
        }**.\n\n**Gravidade:** ${initialIncidentToPublish.severity}\n**Descrição:** ${
          initialIncidentToPublish.description
        }\n${
          initialIncidentToPublish.impactDetails
            ? `**Impacto:** ${initialIncidentToPublish.impactDetails}\n\n`
            : '\n'
        }A equipe técnica já está acompanhando e novas atualizações serão postadas neste canal.`
      );
      setPriority(initialIncidentToPublish.severity === 'CRITICAL' ? 'URGENT' : 'HIGH');
      setIsCreateModalOpen(true);
      if (onClearInitialIncident) onClearInitialIncident();
    }
  }, [initialIncidentToPublish, onClearInitialIncident]);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      // Para gestores, trazemos a lista de gerenciamento (inclui drafts e reads count)
      const endpoint = isManager ? '/api/announcements/manage' : '/api/announcements';
      const res = await fetch(endpoint, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setAnnouncements(list);
      }
    } catch (e) {
      console.error('Erro ao carregar comunicados:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toastService.error('Preencha o título e o conteúdo do comunicado.');
      return;
    }

    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          priority,
          isGlobal,
          scheduledAt: scheduledAt || null,
          expiresAt: expiresAt || null,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        toastService.success('Comunicado criado como RASCUNHO com sucesso.');
        setIsCreateModalOpen(false);
        resetForm();
        fetchAnnouncements();

        // Opcionalmente publica de imediato se o usuário confirmar
        if (confirm('Deseja publicar este comunicado para a equipe agora mesmo?')) {
          await handlePublish(created.id);
        }
      } else {
        const err = await res.json();
        toastService.error(err.error || 'Erro ao criar comunicado.');
      }
    } catch {
      toastService.error('Erro de conexão.');
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const res = await fetch(`/api/announcements/${id}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toastService.success('Comunicado publicado com sucesso para a equipe!');
        fetchAnnouncements();
      } else {
        const err = await res.json();
        toastService.error(err.error || 'Erro ao publicar.');
      }
    } catch {
      toastService.error('Erro de conexão ao publicar comunicado.');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Deseja realmente cancelar este comunicado?')) return;
    try {
      const res = await fetch(`/api/announcements/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toastService.success('Comunicado cancelado.');
        fetchAnnouncements();
      } else {
        const err = await res.json().catch(() => ({}));
        toastService.error(err.error || 'Não foi possível cancelar o comunicado.');
      }
    } catch {
      toastService.error('Erro de rede.');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/announcements/${id}/archive`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toastService.success('Comunicado arquivado.');
        fetchAnnouncements();
      } else {
        const err = await res.json().catch(() => ({}));
        toastService.error(err.error || 'Não foi possível arquivar o comunicado.');
      }
    } catch {
      toastService.error('Erro de rede.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir permanentemente este comunicado?')) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        toastService.success('Comunicado excluído.');
        fetchAnnouncements();
      } else {
        const err = await res.json().catch(() => ({}));
        toastService.error(err.error || 'Não foi possível excluir o comunicado.');
      }
    } catch {
      toastService.error('Erro ao excluir.');
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/announcements/${id}/read`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toastService.success('Leitura confirmada.');
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === id ? { ...a, read: true } : a))
        );
        window.dispatchEvent(new Event('sentinel:announcements-updated'));
        if (selectedAnnouncement?.id === id) {
          setSelectedAnnouncement((prev) => (prev ? { ...prev, read: true } : null));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toastService.error(err.error || 'Não foi possível registrar a leitura.');
      }
    } catch {
      toastService.error('Erro ao registrar leitura.');
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

  const filteredAnnouncements = announcements.filter((a) => {
    const matchesSearch =
      a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.content.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority = priorityFilter === 'ALL' || a.priority === priorityFilter;

    const matchesRead =
      readFilter === 'ALL' ||
      (readFilter === 'UNREAD' && !a.read) ||
      (readFilter === 'READ' && a.read);

    return matchesSearch && matchesPriority && matchesRead;
  });

  const getPriorityBadge = (p: AnnouncementItem['priority']) => {
    switch (p) {
      case 'URGENT':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse">
            Urgente
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Alta
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            Média
          </span>
        );
      case 'LOW':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            Informativo
          </span>
        );
    }
  };

  const getStatusBadge = (status: AnnouncementItem['status']) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            Publicado
          </span>
        );
      case 'DRAFT':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Rascunho
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            Agendado
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            Cancelado
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300">
            Arquivado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior com Controles de Busca e Filtros */}
      <div className="bg-white dark:bg-[#080d18] rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar comunicado por título ou palavra-chave..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Filtro Prioridade */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-2"
            >
              <option value="ALL">Todas as Prioridades</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Informativa</option>
            </select>

            {/* Filtro Leitura */}
            <select
              value={readFilter}
              onChange={(e) => setReadFilter(e.target.value as any)}
              className="text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-2"
            >
              <option value="ALL">Lidos e Não Lidos</option>
              <option value="UNREAD">Apenas Não Lidos</option>
              <option value="READ">Já Confirmados</option>
            </select>

            {isManager && (
              <button
                onClick={() => {
                  resetForm();
                  setIsCreateModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Comunicado
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid de Comunicados */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs">
          Carregando comunicados da operação...
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="bg-white dark:bg-[#080d18] rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs">
          <Megaphone className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Nenhum comunicado encontrado
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Não há comunicados vigentes correspondentes aos filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAnnouncements.map((announcement) => {
            const isUnread = !announcement.read;
            return (
              <div
                key={announcement.id}
                className={`bg-white dark:bg-[#080d18] rounded-xl border transition-all flex flex-col justify-between p-4 shadow-xs ${
                  isUnread
                    ? 'border-blue-300 dark:border-blue-800/80 ring-1 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getPriorityBadge(announcement.priority)}
                      {getStatusBadge(announcement.status)}
                      {isUnread && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500 text-white animate-pulse">
                          Não Lido
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(announcement.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
                    {announcement.title}
                  </h3>

                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line line-clamp-4">
                    {announcement.content}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedAnnouncement(announcement)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visualizar Completo
                    </button>

                    {announcement.status === 'PUBLISHED' && isUnread && (
                      <button
                        onClick={() => handleMarkAsRead(announcement.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                      >
                        <Check className="h-3 w-3" />
                        Marcar como Lido
                      </button>
                    )}
                  </div>

                  {/* Ações de Gestão */}
                  {isManager && (
                    <div className="flex items-center gap-1">
                      {announcement.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePublish(announcement.id)}
                          className="px-2.5 py-1 rounded text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                          title="Publicar agora para a equipe"
                        >
                          Publicar
                        </button>
                      )}

                      {announcement.status === 'PUBLISHED' && (
                        <button
                          onClick={() => handleCancel(announcement.id)}
                          className="p-1 rounded text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Cancelar comunicado"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleArchive(announcement.id)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Arquivar comunicado"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(announcement.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="Excluir comunicado"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Visualizar Comunicado Completo */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                {getPriorityBadge(selectedAnnouncement.priority)}
                {getStatusBadge(selectedAnnouncement.status)}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {new Date(selectedAnnouncement.createdAt).toLocaleString('pt-BR')}
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              {selectedAnnouncement.title}
            </h2>

            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed max-h-96 overflow-y-auto border border-slate-200/60 dark:border-slate-700/60">
              {selectedAnnouncement.content}
            </div>

            <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <div>
                {!selectedAnnouncement.read && selectedAnnouncement.status === 'PUBLISHED' && (
                  <button
                    onClick={() => handleMarkAsRead(selectedAnnouncement.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar Leitura
                  </button>
                )}
                {selectedAnnouncement.read && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Leitura confirmada
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedAnnouncement(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Novo Comunicado */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              Novo Comunicado Operacional
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Publique comunicados, avisos de esteira, regras de bancos ou diretrizes urgentes para a equipe.
            </p>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Título do Comunicado *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Atenção: Banco Pan altera tabela de coeficientes para Refin"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nível de Prioridade *
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                  >
                    <option value="LOW">Informativo (Baixa)</option>
                    <option value="MEDIUM">Média (Avisos Gerais)</option>
                    <option value="HIGH">Alta (Atenção na Digitação)</option>
                    <option value="URGENT">Urgente (Ação Imediata)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Agendamento (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Conteúdo do Comunicado *
                </label>
                <textarea
                  rows={6}
                  placeholder="Escreva as orientações detalhadas, procedimentos a seguir e contatos de apoio..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 font-sans"
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  Criar Comunicado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
