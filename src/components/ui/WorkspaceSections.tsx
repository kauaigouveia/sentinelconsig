import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export interface WorkspaceSection {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  count?: number;
}

export function WorkspaceSections({ items, value, onChange, label }: {
  items: WorkspaceSection[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return <nav className="internal-section-navigation" aria-label={label}>
    {items.map(item => <button type="button" key={item.id} aria-current={item.id === value ? 'page' : undefined} onClick={() => onChange(item.id)}>
      <span className="internal-section-icon">{item.icon}</span>
      <span><strong>{item.title}{item.count !== undefined && <small>{item.count}</small>}</strong><span>{item.description}</span></span>
      <ArrowUpRight size={16} aria-hidden="true"/>
    </button>)}
  </nav>;
}
