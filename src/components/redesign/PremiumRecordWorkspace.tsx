import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { RecordPresentationButtons } from '../ui/RecordPresentationButtons';
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  return <section className="p2-operational-workspace internal-record-workspace" aria-label="Workspace de registros">
    <div className="p2-operational-toolbar">
      <div className="p2-operational-heading">
        <strong>Registros</strong>
        <span role="status">{count} {count === 1 ? 'registro encontrado' : 'registros encontrados'}</span>
      </div>
      <div className="p2-actions">
        <button type="button" className="s2-button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={15} />Filtros</button>
        <RecordPresentationButtons mode={mode} onMode={onMode} />
      </div>
    </div>
    {summary && <details className="ui-operational-insights"><summary>Visão operacional</summary><div className="p2-operational-summary">{summary}</div></details>}
    <div className="internal-record-layout" data-filters-open={filtersOpen}>
    <aside className="p2-operational-filters internal-filter-rail" hidden={!filtersOpen}><div className="internal-rail-heading"><strong>Encontre uma solicitação</strong><span>Refine a lista pelos critérios abaixo.</span></div>{filters}</aside>
    <div className="p2-operational-results">{children}</div></div>
  </section>;
}
