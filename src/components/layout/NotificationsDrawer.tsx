import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  Megaphone,
  AlertCircle,
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
    try {
      const resNotif = await fetch('/api/notifications');
      if (resNotif.ok) {
        const data = await resNotif.json();
        setNotifications(data.items || data || []);
      }
      
      const unreadResNotif = await fetch('/api/notifications/unread-count');
      if (unreadResNotif.ok) {
        const unreadData = await unreadResNotif.json();
        setUnreadNotifCount(unreadData.count || 0);
      }

      const resAnn = await fetch('/api/announcements');
      if (resAnn.ok) {
        const data = await resAnn.json();
        setAnnouncements(data.data || []);
      }

      const unreadResAnn = await fetch('/api/announcements/unread-count');
      if (unreadResAnn.ok) {
        const unreadDataAnn = await unreadResAnn.json();
        setUnreadAnnounceCount(unreadDataAnn.count || 0);
      }
    } catch (err) {
      console.error('Erro ao buscar notificacoes', err);
    }
  };

  const handleMarkAllRead = async () => {
    if (activeTab === 'notifications') {
      try {
        await fetch('/api/notifications/read-all', { method: 'POST' });
        toastService.success('Todas lidas');
        fetchData();
      } catch (e) {
        toastService.error('Erro ao marcar lidas');
      }
    }
  };

  const handleNotifClick = async (n: any) => {
    if (!n.read) {
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
        setUnreadNotifCount(prev => Math.max(0, prev - 1));
      } catch (e) {}
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
        await fetch(`/api/announcements/${a.id}/read`, { method: 'POST' });
        setAnnouncements(prev => prev.map(x => x.id === a.id ? { ...x, read: true } : x));
        setUnreadAnnounceCount(prev => Math.max(0, prev - 1));
      } catch (e) {}
    }
  };

  const handleAnnounceDismiss = async (a: any) => {
    try {
      await fetch(`/api/announcements/${a.id}/dismiss`, { method: 'POST' });
      setAnnouncements(prev => prev.filter(x => x.id !== a.id));
      if (!a.read) {
        setUnreadAnnounceCount(prev => Math.max(0, prev - 1));
      }
    } catch (e) {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-slate-200">
        
        {/* Header Tabs */}
        <div className="pt-4 px-4 bg-slate-50 border-b border-slate-200 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">Communication Center</h3>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-4 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`pb-3 text-xs font-bold flex items-center gap-1.5 transition-colors border-b-2 ${
                activeTab === 'notifications' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
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
                  : 'border-transparent text-slate-500 hover:text-slate-800'
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
          <div className="px-4 py-2 bg-slate-50 flex justify-end">
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          
          {activeTab === 'notifications' && (
            <>
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-12">
                  Nenhuma notificação no momento.
                </p>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className={`p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                      n.read
                        ? 'border-slate-100 bg-white text-slate-600'
                        : 'border-blue-200 bg-blue-50/50 text-slate-900 font-medium'
                    } hover:shadow-xs`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800 text-[11px]">{n.title}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(n.createdAt)}</span>
                    </div>
                    <p className="text-slate-600">{n.message}</p>
                    {n.proposalId && (
                      <span className="text-[10px] text-blue-600 font-bold block mt-1.5">
                        → Clique para abrir a proposta
                      </span>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {activeTab === 'announcements' && (
            <>
              {announcements.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-12">
                  Nenhum comunicado disponível.
                </p>
              ) : (
                announcements.map(a => (
                  <div
                    key={a.id}
                    className={`p-4 rounded-xl border text-xs transition-all flex flex-col ${
                      a.read
                        ? 'border-slate-200 bg-white'
                        : 'border-amber-200 bg-amber-50/50 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        a.priority === 'URGENT' ? 'bg-rose-100 text-rose-800' :
                        a.priority === 'HIGH' ? 'bg-amber-100 text-amber-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {a.priority}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDate(a.publishedAt)}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 mb-1.5 text-sm">{a.title}</h4>
                    <p className="text-slate-600 leading-relaxed mb-3">{a.content}</p>
                    
                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-100">
                      {!a.read && (
                        <button 
                          onClick={() => handleAnnounceRead(a)}
                          className="flex-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold transition-colors cursor-pointer"
                        >
                          Marcar Lida
                        </button>
                      )}
                      <button 
                        onClick={() => handleAnnounceDismiss(a)}
                        className="flex-1 px-3 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors cursor-pointer"
                      >
                        Ocultar (Dismiss)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
};
