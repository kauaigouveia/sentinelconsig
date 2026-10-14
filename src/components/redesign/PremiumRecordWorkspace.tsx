import React, { useState } from 'react';
import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import type { RecordPresentation } from '../ui/RecordWorkspace';

export interface PremiumRecordWorkspaceProps {
  filters: React.ReactNode;
  summary?: React.ReactNode;
  count: number;
  mode: RecordPresentation;
  onMode: (mode: RecordPresentation) => void;
  children: React.ReactNode;
}

/** Presentation adapter. Filters, records and actions belong to the original module. */
export function PremiumRecordWorkspace({ filters, summary, count, mode, onMode, children }: PremiumRecordWorkspaceProps) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  return <section className="p2-operational-workspace" aria-label="Workspace de registros">
    {summary && <div className="p2-operational-summary">{summary}</div>}
    <div className="p2-operational-toolbar">
      <strong>{count} registros encontrados</strong>
      <div className="p2-actions">
        <button type="button" className="s2-button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={15} />Filtros</button>
        <button type="button" className="s2-button" aria-pressed={mode === 'list'} onClick={() => onMode('list')}><List size={15} />Tabela</button>
        <button type="button" className="s2-button" aria-pressed={mode === 'cards'} onClick={() => onMode('cards')}><LayoutGrid size={15} />Cartões</button>
      </div>
    </div>
    <div className="p2-operational-filters" hidden={!filtersOpen}>{filters}</div>
    <div className="p2-operational-results">{children}</div>
  </section>;
}
