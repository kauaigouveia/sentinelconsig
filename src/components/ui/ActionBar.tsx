import {PageHeader,Badge} from './DesignSystem';
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

  return <div className={`sentinel-action-bar ${className}`}><PageHeader title={<>{title}{finalBadge&&<Badge>{finalBadge}</Badge>}</>} description={subtitle} count={count}>{finalRightActions}{children}{financialTotal&&<span className="ui-header-total">{financialTotal}</span>}</PageHeader></div>;
};
