import React from 'react';
import { ResponsibleAlçada } from '../../types';

interface AuthorityBadgeProps {
  alçada?: ResponsibleAlçada | string;
  authority?: ResponsibleAlçada | string;
  responsible?: ResponsibleAlçada | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const AuthorityBadge: React.FC<AuthorityBadgeProps> = ({
  alçada: directAlcada,
  authority,
  responsible,
  size = 'sm',
  className = '',
}) => {
  const alçada = (directAlcada || authority || responsible || '').toUpperCase().trim();
  const getStyleAndLabel = () => {
    switch (alçada) {
      case 'BANCO':
        return {
          label: 'Banco',
          bg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]',
          text: 'text-[var(--link)] dark:text-[var(--link)] font-medium',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          indicator: 'bg-[var(--info-bg)]',
        };
      case 'CLIENTE':
        return {
          label: 'Cliente',
          bg: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]',
          text: 'text-[var(--warning-text)] dark:text-[var(--warning-text)] font-medium',
          border: 'border-[var(--warning-border)] dark:border-[var(--warning-border)]',
          indicator: 'bg-[var(--warning-bg)]',
        };
      case 'PARCEIRO':
        return {
          label: 'Parceiro',
          bg: 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)]',
          text: 'text-[var(--success-text)] dark:text-[var(--success-text)] font-medium',
          border: 'border-[var(--success-border)] dark:border-[var(--success-border)]',
          indicator: 'bg-[var(--success-bg)]',
        };
      case 'NOSSA EQUIPE':
      case 'NOSSA_EQUIPE':
        return {
          label: 'Alçada Interna',
          bg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]',
          text: 'text-[var(--link)] dark:text-[var(--link)] font-semibold',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          indicator: 'bg-[var(--info-bg)]',
        };
      case 'SISTEMA':
        return {
          label: 'Sistema',
          bg: 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)]',
          text: 'text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          indicator: 'bg-[var(--bg-surface-elevated)]',
        };
      case 'ORGAO_PAGADOR':
      case 'ORGAO PAGADOR':
        return {
          label: 'Órgão Pagador',
          bg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)]',
          text: 'text-[var(--link)] dark:text-[var(--link)] font-medium',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          indicator: 'bg-[var(--info-bg)]',
        };
      default:
        return {
          label: alçada || 'Cliente',
          bg: 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)]',
          text: 'text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          indicator: 'bg-[var(--bg-surface-elevated)]',
        };
    }
  };

  const { label, bg, text, border, indicator } = getStyleAndLabel();

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 border ${bg} ${text} ${border} ${
        size === 'sm' ? 'text-[11px] leading-tight' : 'text-xs leading-normal'
      } ${className}`}
      title={`Alçada de Responsabilidade: ${label}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${indicator}`} />
      <span className="truncate">{label}</span>
    </span>
  );
};
