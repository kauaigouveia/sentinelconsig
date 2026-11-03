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
  const content=<><div className="ui-metric-heading"><span>{label}</span>{Icon&&(React.isValidElement(Icon)?Icon:typeof Icon==='function'?<Icon size={16}/>:null)}</div><strong>{value}</strong>{subValue&&<p>{subValue}</p>}{trend&&<span className={`ui-metric-trend ui-tone-${trend.isPositive?'success':'danger'}`}>{trend.isPositive?'↑':'↓'} {trend.value}</span>}</>;
  const props={className:`ui-metric ui-tone-${variant==='primary'?'info':variant==='default'?'neutral':variant} ${className}`};
  return onClick?<button {...props} type="button" onClick={onClick}>{content}</button>:<section {...props}>{content}</section>;
};
