import React from 'react';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral';

interface StatusBadgeProps {
  statusName?: string;
  status?: { name?: string; color?: string; colorHex?: string } | null;
  variant?: StatusVariant;
  colorHex?: string;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  statusName: directName,
  status,
  variant,
  colorHex: directColorHex,
  size = 'sm',
  showDot = true,
  className = '',
}) => {
  const statusName = directName || status?.name || 'Não Informado';
  const colorHex = directColorHex || status?.colorHex || status?.color;
  // Infer semantic variant from status name if not explicitly provided
  const inferVariant = (): StatusVariant => {
    if (variant) return variant;
    const lower = statusName.toLowerCase();
    if (lower.includes('pago') || lower.includes('concluí') || lower.includes('aprovad') || lower.includes('liquid')) {
      return 'success';
    }
    if (lower.includes('cip') || lower.includes('5º dia') || lower.includes('5 dia') || lower.includes('atenção') || lower.includes('aguardando')) {
      return 'warning';
    }
    if (lower.includes('estourado') || lower.includes('urgente') || lower.includes('cancelad') || lower.includes('reprovad') || lower.includes('recusad')) {
      return 'danger';
    }
    if (lower.includes('digit') || lower.includes('inclusão')) {
      return 'primary';
    }
    if (lower.includes('análise') || lower.includes('esteira') || lower.includes('averba')) {
      return 'info';
    }
    return 'neutral';
  };

  const currentVariant = inferVariant();

  // If custom colorHex is provided by tenant status definitions, use custom inline style
  if (colorHex) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap rounded-md px-2 py-0.5 border ${
          size === 'sm' ? 'text-[11px] leading-tight' : 'text-xs leading-normal'
        } ${className}`}
        style={{
          backgroundColor: `${colorHex}15`,
          color: colorHex,
          borderColor: `${colorHex}35`,
        }}
      >
        {showDot && (
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: colorHex }}
          />
        )}
        <span className="truncate">{statusName}</span>
      </span>
    );
  }

  const variantStyles: Record<StatusVariant, { bg: string; text: string; border: string; dot: string }> = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300 font-semibold',
      border: 'border-emerald-200 dark:border-emerald-800/80',
      dot: 'bg-emerald-500',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-300 font-semibold',
      border: 'border-amber-200 dark:border-amber-800/80',
      dot: 'bg-amber-500',
    },
    danger: {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-300 font-semibold',
      border: 'border-rose-200 dark:border-rose-800/80',
      dot: 'bg-rose-500',
    },
    info: {
      bg: 'bg-sky-50 dark:bg-sky-950/40',
      text: 'text-sky-700 dark:text-sky-300 font-medium',
      border: 'border-sky-200 dark:border-sky-800/80',
      dot: 'bg-sky-500',
    },
    primary: {
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      text: 'text-blue-700 dark:text-blue-300 font-medium',
      border: 'border-blue-200 dark:border-blue-800/80',
      dot: 'bg-blue-500',
    },
    neutral: {
      bg: 'bg-slate-100 dark:bg-slate-800/70',
      text: 'text-slate-700 dark:text-slate-300 font-medium',
      border: 'border-slate-200 dark:border-slate-700',
      dot: 'bg-slate-400 dark:bg-slate-500',
    },
  };

  const style = variantStyles[currentVariant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 border ${style.bg} ${style.text} ${style.border} ${
        size === 'sm' ? 'text-[11px] leading-tight' : 'text-xs leading-normal'
      } ${className}`}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />}
      <span className="truncate">{statusName}</span>
    </span>
  );
};
