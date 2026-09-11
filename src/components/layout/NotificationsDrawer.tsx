import React from 'react';
import {
  X,
  Bell,
  CheckCheck,
  AlertCircle,
  Clock,
  ArrowLeftRight,
  Info,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatDate } from '../../lib/utils';
import { SystemNotification } from '../../types';

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
  if (!isOpen) return null;

  const notifications = StorageService.getNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    StorageService.markAllNotificationsRead();
    window.location.reload();
  };

  const handleItemClick = (n: SystemNotification) => {
    StorageService.markNotificationRead(n.id);
    if (n.proposalId) {
      onSelectProposal(n.proposalId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full border-l border-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Central de Notificações</h3>
            {unreadCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Marcar lidas</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-12">
              Nenhuma notificação no momento.
            </p>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`p-3 rounded-lg border text-xs transition-all cursor-pointer ${
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
        </div>
      </div>
    </div>
  );
};
