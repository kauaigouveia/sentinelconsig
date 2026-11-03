import {Badge} from './DesignSystem';
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

  return <span style={colorHex?{'--status-color':colorHex} as React.CSSProperties:undefined}><Badge tone={currentVariant==='primary'?'info':currentVariant} dot={showDot} className={className}>{statusName}</Badge></span>;
};
