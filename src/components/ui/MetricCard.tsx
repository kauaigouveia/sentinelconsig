import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label?: string;
  title?: string;
  value: string | number;
  subValue?: string;
  subtitle?: string;
  helperText?: string;
  subtext?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  icon?: LucideIcon | React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  tone?: string;
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label: directLabel,
  title,
  value,
  subValue: directSubValue,
  subtitle,
  helperText,
  subtext,
  trend,
  icon: Icon,
  variant: directVariant,
  tone,
  onClick,
  className = '',
}) => {
  const label = directLabel || title || '';
  const subValue = directSubValue || subtitle || helperText || subtext;
  const mapToneToVariant = (t?: string): 'default' | 'primary' | 'success' | 'warning' | 'danger' => {
    if (!t) return 'default';
    if (t === 'emerald' || t === 'green') return 'success';
    if (t === 'amber' || t === 'yellow') return 'warning';
    if (t === 'rose' || t === 'red') return 'danger';
    if (t === 'blue' || t === 'indigo') return 'primary';
    return (t as any) || 'default';
  };
  const variant = directVariant || mapToneToVariant(tone);
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20';
      case 'success':
        return 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20';
      case 'warning':
        return 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20';
      case 'danger':
        return 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20';
      default:
        return 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'primary':
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50';
      case 'success':
        return 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50';
      case 'warning':
        return 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50';
      case 'danger':
        return 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/50';
      default:
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';
    }
  };

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
          {label}
        </span>
        {Icon && (
          <div className={`p-1.5 rounded-md shrink-0 ${getIconColor()}`}>
            {React.isValidElement(Icon) ? (
              Icon
            ) : typeof Icon === 'function' ? (
              <Icon className="h-4 w-4" />
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-[22px] font-bold font-mono tracking-tight text-slate-900 dark:text-slate-50 truncate">
          {value}
        </div>

        {trend && (
          <span
            className={`text-[11px] font-semibold whitespace-nowrap ${
              trend.isPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {trend.isPositive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>

      {subValue && (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {subValue}
        </p>
      )}
    </>
  );

  const cardClassName = `rounded-lg border px-3.5 py-3 transition-colors ${getVariantStyles()} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cardClassName} w-full cursor-pointer text-left hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:border-slate-700`}
      >
        {content}
      </button>
    );
  }

  return <div className={cardClassName}>{content}</div>;
};
