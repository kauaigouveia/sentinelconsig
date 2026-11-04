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
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden bg-[var(--scrim)] backdrop-blur-xs" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="notifications-title" className="flex h-full w-full max-w-md flex-col border-l border-[var(--field-border)] bg-[var(--bg-surface)]  dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)]">

        {/* Header Tabs */}
        <div className="flex flex-col border-b border-[var(--field-border)] bg-[var(--bg-canvas)] px-4 pt-4 dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
          <div className="flex items-center justify-between mb-4">
            <h3 id="notifications-title" className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Central de notificações</h3>
            <button
              onClick={onClose}
              aria-label="Fechar notificações"
              className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-secondary)] dark:hover:bg-[var(--bg-surface-elevated)] dark:hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                activeTab === 'notifications'
                  ? 'border-[var(--field-border)] text-[var(--link)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
              }`}
            >
              <Bell className="h-4 w-4" />
              Notificações
              {unreadNotifCount > 0 && (
                <span className="bg-[var(--danger-bg)] text-[var(--text-primary)] text-[9px] px-1.5 py-0.5 rounded-full ml-1">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('announcements')}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                activeTab === 'announcements'
                  ? 'border-[var(--field-border)] text-[var(--link)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
              }`}
            >
              <Megaphone className="h-4 w-4" />
              Comunicados
              {unreadAnnounceCount > 0 && (
                <span className="bg-[var(--danger-bg)] text-[var(--text-primary)] text-[9px] px-1.5 py-0.5 rounded-full ml-1">
                  {unreadAnnounceCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Action Bar */}
        {activeTab === 'notifications' && unreadNotifCount > 0 && (
          <div className="flex justify-end border-b border-[var(--field-border)] bg-[var(--bg-canvas)] px-4 py-2 dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]">
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-[var(--link)] hover:text-[var(--link)] font-semibold flex items-center gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Marcar todas como lidas</span>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--bg-canvas)] p-4 dark:bg-[var(--bg-canvas)]">
          {isLoading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-12 text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
              <RefreshCw className="h-4 w-4 animate-spin" /> Carregando notificações e comunicados...
            </div>
          ) : <>
          {loadError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs text-[var(--warning-text)] dark:border-[var(--warning-border)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{loadError}</span>
              <button type="button" onClick={() => void fetchData()} className="shrink-0 font-bold underline">Tentar novamente</button>
            </div>
          )}

          {activeTab === 'notifications' && (
            <>
              {notifications.length === 0 ? (
                <p className="py-12 text-center text-xs italic text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                  Nenhuma notificação no momento.
                </p>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleNotifClick(n)}
                    className={`w-full rounded-xl border p-3 text-left text-xs transition-all  ${
                      n.read
                        ? 'border-[var(--field-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]'
                        : 'border-[var(--field-border)] bg-[var(--info-bg)] font-medium text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--info-bg)] dark:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{n.title}</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">{formatDate(n.createdAt)}</span>
                    </div>
                    <p className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{n.message}</p>
                    {n.proposalId && (
                      <span className="text-[10px] text-[var(--link)] font-bold block mt-1.5">
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
                <p className="py-12 text-center text-xs italic text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                  Nenhum comunicado disponível.
                </p>
              ) : (
                announcements.map(a => (
                  <div
                    key={a.id}
                    className={`p-4 rounded-xl border text-xs transition-all flex flex-col ${
                      a.read
                        ? 'border-[var(--field-border)] bg-[var(--bg-surface)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]'
                        : 'border-[var(--warning-border)] bg-[var(--warning-bg)]  dark:border-[var(--warning-border)] dark:bg-[var(--warning-bg)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        a.priority === 'URGENT' ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]' :
                        a.priority === 'HIGH' ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]' :
                        'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                      }`}>
                        {a.priority}
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                        {formatDate(a.publishedAt)}
                      </span>
                    </div>
                    <h4 className="mb-1.5 text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{a.title}</h4>
                    <p className="mb-3 leading-relaxed text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{a.content}</p>

                    <div className="mt-auto flex items-center gap-2 border-t border-[var(--field-border)] pt-2 dark:border-[var(--field-border)]">
                      {!a.read && (
                        <button
                          onClick={() => handleAnnounceRead(a)}
                          className="flex-1 cursor-pointer rounded-lg bg-[var(--info-bg)] px-3 py-1.5 font-bold text-[var(--link)] transition-colors hover:bg-[var(--info-bg)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] dark:hover:bg-[var(--info-bg)]"
                        >
                          Marcar Lida
                        </button>
                      )}
                      <button
                        onClick={() => handleAnnounceDismiss(a)}
                        className="flex-1 cursor-pointer rounded-lg bg-[var(--bg-surface-elevated)] px-3 py-1.5 font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--bg-surface-elevated)]"
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
