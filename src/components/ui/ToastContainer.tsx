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
                color: 'text-emerald-500',
                border: 'border-emerald-200 dark:border-emerald-800',
                bg: 'bg-white dark:bg-slate-900',
                badge: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
              };
            case 'error':
              return {
                icon: AlertCircle,
                color: 'text-rose-500',
                border: 'border-rose-200 dark:border-rose-800',
                bg: 'bg-white dark:bg-slate-900',
                badge: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
              };
            case 'warning':
              return {
                icon: AlertTriangle,
                color: 'text-amber-500',
                border: 'border-amber-200 dark:border-amber-800',
                bg: 'bg-white dark:bg-slate-900',
                badge: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
              };
            default:
              return {
                icon: Info,
                color: 'text-sky-500',
                border: 'border-sky-200 dark:border-sky-800',
                bg: 'bg-white dark:bg-slate-900',
                badge: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300',
              };
          }
        };

        const { icon: Icon, color, border, bg, badge } = getStyle();

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border ${border} ${bg} shadow-lg transition-all transform translate-y-0`}
          >
            <Icon className={`h-4 w-4 ${color} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                {toast.title}
              </h4>
              {toast.message && (
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed break-words">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => toastService.dismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
