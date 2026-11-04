import React, { useEffect, useState } from 'react';
import { toastService, ToastMessage } from './toastService';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return toastService.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const getStyle = () => {
          switch (toast.type) {
            case 'success':
              return {
                icon: CheckCircle2,
                color: 'text-[var(--success-text)]',
                border: 'border-[var(--success-border)] dark:border-[var(--success-border)]',
                bg: 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]',
                badge: 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)]',
              };
            case 'error':
              return {
                icon: AlertCircle,
                color: 'text-[var(--danger-text)]',
                border: 'border-[var(--danger-border)] dark:border-[var(--danger-border)]',
                bg: 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]',
                badge: 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)]',
              };
            case 'warning':
              return {
                icon: AlertTriangle,
                color: 'text-[var(--warning-text)]',
                border: 'border-[var(--warning-border)] dark:border-[var(--warning-border)]',
                bg: 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]',
                badge: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)]',
              };
            default:
              return {
                icon: Info,
                color: 'text-[var(--link)]',
                border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
                bg: 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]',
                badge: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)]',
              };
          }
        };

        const { icon: Icon, color, border, bg, badge } = getStyle();

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border ${border} ${bg}  transition-all transform translate-y-0`}
          >
            <Icon className={`h-4 w-4 ${color} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-tight">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] leading-relaxed break-words">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => toastService.dismiss(toast.id)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] p-0.5 rounded cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
