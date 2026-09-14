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
  const alçada = directAlcada || authority || responsible || 'NOSSA_EQUIPE';
  const getStyleAndLabel = () => {
    switch (alçada) {
      case 'BANCO':
        return {
          label: 'Banco',
          bg: 'bg-sky-50 dark:bg-sky-950/40',
          text: 'text-sky-700 dark:text-sky-300 font-medium',
          border: 'border-sky-200 dark:border-sky-800/80',
          indicator: 'bg-sky-500',
        };
      case 'CLIENTE':
        return {
          label: 'Cliente',
          bg: 'bg-amber-50 dark:bg-amber-950/40',
          text: 'text-amber-700 dark:text-amber-300 font-medium',
          border: 'border-amber-200 dark:border-amber-800/80',
          indicator: 'bg-amber-500',
        };
      case 'PARCEIRO':
        return {
          label: 'Parceiro',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40',
          text: 'text-emerald-700 dark:text-emerald-300 font-medium',
          border: 'border-emerald-200 dark:border-emerald-800/80',
          indicator: 'bg-emerald-500',
        };
      case 'NOSSA_EQUIPE':
        return {
          label: 'Alçada Interna',
          bg: 'bg-purple-50 dark:bg-purple-950/40',
          text: 'text-purple-700 dark:text-purple-300 font-semibold',
          border: 'border-purple-200 dark:border-purple-800/80',
          indicator: 'bg-purple-500',
        };
      case 'ORGAO_PAGADOR':
        return {
          label: 'Órgão Pagador',
          bg: 'bg-indigo-50 dark:bg-indigo-950/40',
          text: 'text-indigo-700 dark:text-indigo-300 font-medium',
          border: 'border-indigo-200 dark:border-indigo-800/80',
          indicator: 'bg-indigo-500',
        };
      default:
        return {
          label: alçada || 'Sistema',
          bg: 'bg-slate-100 dark:bg-slate-800/60',
          text: 'text-slate-700 dark:text-slate-300 font-medium',
          border: 'border-slate-200 dark:border-slate-700',
          indicator: 'bg-slate-400',
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
