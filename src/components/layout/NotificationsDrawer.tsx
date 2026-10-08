import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  Megaphone,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { toastService } from '../ui/toastService';
import { realtimeHub } from '../../services/realtimeService';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProposal: (proposalId: string) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  onSelectProposal,
}) => {
  const [activeTab, setActiveTab] = useState<'notifications' | 'announcements'>('notifications');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadAnnounceCount, setUnreadAnnounceCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchRequestRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  useEffect(() => {
    const unsub = realtimeHub.subscribe('*', (event) => {
      if (
        event?.type === 'ANNOUNCEMENT_PUBLISHED' ||
        event?.type === 'ANNOUNCEMENT_UPDATED' ||
        event?.type === 'NOTIFICATION_CREATED'
      ) {
        if (event?.type === 'ANNOUNCEMENT_PUBLISHED') {
           toastService.info('Novo comunicado publicado.');
        }
        if (isOpen) {
          fetchData();
        }
      }
    });
    return () => unsub();
  }, [isOpen]);

  const fetchData = async () => {
    const requestId = ++fetchRequestRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const fetchJson = async (url: string) => {
        const response = await fetch(url, { credentials: 'include' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `Falha ao carregar dados (HTTP ${response.status}).`);
        return data;
      };
      const [notificationsResult, unreadNotificationsResult, announcementsResult, unreadAnnouncementsResult] = await Promise.allSettled([
        fetchJson('/api/notifications'),
        fetchJson('/api/notifications/unread-count'),
        fetchJson('/api/announcements'),
        fetchJson('/api/announcements/unread-count'),
      ]);
      if (requestId !== fetchRequestRef.current) return;
      const errors: string[] = [];
      if (notificationsResult.status === 'fulfilled') {
        const items = notificationsResult.value;
        setNotifications(Array.isArray(items) ? items : items?.items || []);
      } else {
        errors.push(`Notificações: ${notificationsResult.reason instanceof Error ? notificationsResult.reason.message : 'falha ao carregar.'}`);
      }
      if (unreadNotificationsResult.status === 'fulfilled') {
        setUnreadNotifCount(Number(unreadNotificationsResult.value?.count) || 0);
      } else {
        errors.push(`Contador de notificações: ${unreadNotificationsResult.reason instanceof Error ? unreadNotificationsResult.reason.message : 'falha ao carregar.'}`);
      }
      if (announcementsResult.status === 'fulfilled') {
        const items = announcementsResult.value;
        setAnnouncements(Array.isArray(items) ? items : items?.data || []);
      } else {
        errors.push(`Comunicados: ${announcementsResult.reason instanceof Error ? announcementsResult.reason.message : 'falha ao carregar.'}`);
      }
      if (unreadAnnouncementsResult.status === 'fulfilled') {
        setUnreadAnnounceCount(Number(unreadAnnouncementsResult.value?.count) || 0);
      } else {
        errors.push(`Contador de comunicados: ${unreadAnnouncementsResult.reason instanceof Error ? unreadAnnouncementsResult.reason.message : 'falha ao carregar.'}`);
      }
      setLoadError(errors.length ? errors.join(' ') : null);
    } catch (err) {
      if (requestId !== fetchRequestRef.current) return;
      const message = err instanceof Error ? err.message : 'Erro ao buscar notificações.';
      setLoadError(message);
      console.error('Erro ao buscar notificações', err);
    } finally {
      if (requestId === fetchRequestRef.current) setIsLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (activeTab === 'notifications') {
      try {
        const response = await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Erro ao marcar notificações como lidas.');
        setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
        setUnreadNotifCount(0);
        window.dispatchEvent(new Event('sentinel:notifications-updated'));
        toastService.success('Todas lidas');
      } catch (e) {
        toastService.error(e instanceof Error ? e.message : 'Erro ao marcar lidas');
      }
    }
  };

  const handleNotifClick = async (n: any) => {
    if (!n.read) {
      try {
        const response = await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH', credentials: 'include' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Não foi possível marcar a notificação como lida.');
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
        setUnreadNotifCount(prev => Math.max(0, prev - 1));
        window.dispatchEvent(new Event('sentinel:notifications-updated'));
      } catch (e) {
        toastService.error(e instanceof Error ? e.message : 'Não foi possível marcar a notificação como lida.');
      }
    }
    const propId = n.proposalId || (n.linkUrl && n.linkUrl.includes('/proposals/') ? n.linkUrl.split('/').pop() : null);
    if (propId) {
      onSelectProposal(propId);
      onClose();
    }
  };

  const handleAnnounceRead = async (a: any) => {
    if (!a.read) {
      try {
        const response = await fetch(`/api/announcements/${a.id}/read`, { method: 'POST', credentials: 'include' });
        if (!response.ok) throw new Error('Não foi possível marcar o comunicado como lido.');
        setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, read: true } : x));
        setUnreadAnnounceCount(prev => Math.max(0, prev - 1));
        window.dispatchEvent(new Event('sentinel:notifications-updated'));
      } catch (e) {
        toastService.error(e instanceof Error ? e.message : 'Não foi possível marcar o comunicado como lido.');
      }
    }
  };

  const handleAnnounceDismiss = async (a: any) => {
    try {
      const response = await fetch(`/api/announcements/${a.id}/dismiss`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível ocultar o comunicado.');
      setAnnouncements(prev => prev.filter(x => x.id !== a.id));
      if (!a.read) {
        setUnreadAnnounceCount(prev => Math.max(0, prev - 1));
      }
      window.dispatchEvent(new Event('sentinel:notifications-updated'));
    } catch (e) {
      toastService.error(e instanceof Error ? e.message : 'Não foi possível ocultar o comunicado.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden bg-slate-900/30 backdrop-blur-xs" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="notifications-title" className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        
        {/* Header Tabs */}
        <div className="flex flex-col border-b border-slate-200 bg-slate-50 px-4 pt-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h3 id="notifications-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">Central de notificações</h3>
            <button
              onClick={onClose}
              aria-label="Fechar notificações"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                activeTab === 'notifications' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Bell className="h-4 w-4" />
              Notificações
              {unreadNotifCount > 0 && (
                <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full ml-1">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('announcements')}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                activeTab === 'announcements' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              <Megaphone className="h-4 w-4" />
              Comunicados
              {unreadAnnounceCount > 0 && (
                <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full ml-1">
                  {unreadAnnounceCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Action Bar */}
        {activeTab === 'notifications' && unreadNotifCount > 0 && (
          <div className="flex justify-end border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/70">
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Marcar todas como lidas</span>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4 dark:bg-slate-950">
          {isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw className="h-4 w-4 animate-spin" /> Carregando notificações e comunicados...
            </div>
          ) : <>
          {loadError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{loadError}</span>
              <button type="button" onClick={() => void fetchData()} className="shrink-0 font-bold underline">Tentar novamente</button>
            </div>
          )}
          
          {activeTab === 'notifications' && (
            <>
              {notifications.length === 0 ? (
                <p className="py-12 text-center text-xs italic text-slate-400 dark:text-slate-500">
                  Nenhuma notificação no momento.
                </p>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleNotifClick(n)}
                    className={`w-full rounded-xl border p-3 text-left text-xs transition-all hover:shadow-xs ${
                      n.read
                        ? 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                        : 'border-blue-200 bg-blue-50/70 font-medium text-slate-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{n.title}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(n.createdAt)}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">{n.message}</p>
                    {n.proposalId && (
                      <span className="text-[10px] text-blue-600 font-bold block mt-1.5">
                        → Clique para abrir a proposta
                      </span>
                    )}
                  </button>
                ))
              )}
            </>
          )}

          {activeTab === 'announcements' && (
            <>
              {announcements.length === 0 ? (
                <p className="py-12 text-center text-xs italic text-slate-400 dark:text-slate-500">
                  Nenhum comunicado disponível.
                </p>
              ) : (
                announcements.map(a => (
                  <div
                    key={a.id}
                    className={`p-4 rounded-xl border text-xs transition-all flex flex-col ${
                      a.read
                        ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                        : 'border-amber-200 bg-amber-50/70 shadow-xs dark:border-amber-900/70 dark:bg-amber-950/25'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        a.priority === 'URGENT' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                        a.priority === 'HIGH' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {a.priority}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDate(a.publishedAt)}
                      </span>
                    </div>
                    <h4 className="mb-1.5 text-sm font-black text-slate-900 dark:text-slate-100">{a.title}</h4>
                    <p className="mb-3 leading-relaxed text-slate-600 dark:text-slate-300">{a.content}</p>
                    
                    <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                      {!a.read && (
                        <button 
                          onClick={() => handleAnnounceRead(a)}
                          className="flex-1 cursor-pointer rounded-lg bg-blue-50 px-3 py-1.5 font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
                        >
                          Marcar Lida
                        </button>
                      )}
                      <button 
                        onClick={() => handleAnnounceDismiss(a)}
                        className="flex-1 cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Ocultar (Dismiss)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
          </>}
        </div>
      </div>
    </div>
  );
};
