import React from 'react';

export interface ActionBarProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  badgeColor?: string;
  badge?: string;
  count?: number;
  financialTotal?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  title,
  subtitle,
  badgeText,
  badgeColor,
  badge,
  count,
  financialTotal,
  children,
  actions,
  rightActions,
  className = '',
}) => {
  const finalRightActions = rightActions || actions;
  const finalBadge = badgeText || badge;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/90 bg-white dark:bg-slate-900 px-4 py-3.5 shadow-sm transition-colors ${className}`}
    >
      {/* Left side: Context / Title / Counts or Filter items */}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {title && (
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold leading-5 tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h2>
              {finalBadge && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  badgeColor || 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                }`}>
                  {finalBadge}
                </span>
              )}
              {count !== undefined && (
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 font-mono">
                  {count}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {financialTotal && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 pl-2 border-l border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 uppercase font-semibold">Total:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {financialTotal}
            </span>
          </div>
        )}

        {children}
      </div>

      {/* Right side: Primary & secondary actions */}
      {finalRightActions && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {finalRightActions}
        </div>
      )}
    </div>
  );
};
