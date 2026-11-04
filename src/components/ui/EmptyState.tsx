import React from 'react';
import { LucideIcon, FileSearch } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FileSearch,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`sentinel-empty-state flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-[var(--border-default)] border-[var(--border-default)] bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] transition-colors ${className}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-surface-elevated)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] text-[var(--text-secondary)] mb-3 ">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="text-sm font-semibold text-[var(--text-secondary)] text-[var(--text-secondary)]">
        {title}
      </h3>

      <p className="mt-1 text-xs text-[var(--text-secondary)] text-[var(--text-secondary)] max-w-sm leading-relaxed">
        {description}
      </p>

      {(onAction || onSecondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className="inline-flex items-center justify-center rounded-md bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]  transition-colors cursor-pointer"
            >
              {actionLabel}
            </button>
          )}

          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="inline-flex items-center justify-center rounded-md border border-[var(--border-default)] border-[var(--border-default)] bg-[var(--bg-surface)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
