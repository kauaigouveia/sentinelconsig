import {MetricCard} from '../ui/MetricCard';
import {Badge,Drawer} from '../ui/DesignSystem';
import {EmptyState as SharedEmptyState} from '../ui/EmptyState';
import React from "react";
export function SectionHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p2-section-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="p2-actions">{children}</div>
    </div>
  );
}
export function StatusBadge({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return <span style={{'--status-color':color} as React.CSSProperties}><Badge>{label}</Badge></span>;
}

export function PremiumStatCard({
  label,
  value,
  detail,
  color,
  icon: Icon,
  definition,
  state = "ready",
}: {
  label: string;
  value: string | number;
  detail: string;
  color: string;
  icon: React.ElementType;
  definition: string;
  state?: "ready" | "loading" | "empty" | "error";
}) {
  return <div aria-busy={state==='loading'} title={definition}><MetricCard label={label} value={state==='loading'?'…':state==='error'||state==='empty'?'—':value} subValue={state==='error'?'Não foi possível carregar':state==='empty'?'Fonte indisponível nesta prévia':detail} icon={<Icon size={16}/>}/></div>;
}

export function DetailDrawer({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return <Drawer open title={title} onClose={close} closeLabel="Fechar detalhes">{children}</Drawer>;
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return <SharedEmptyState title={title} description={detail || ""}/>;
}
