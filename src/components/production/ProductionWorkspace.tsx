import React, { useState } from "react";
import {
  Columns3,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Workflow,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { RecordPresentation } from "../ui/RecordWorkspace";
export const PRODUCTION_COLUMNS = [
  "Seleção",
  "ADE / Proposta",
  "Cliente",
  "CPF",
  "Produto",
  "Banco / Promotora",
  "Valores (R$)",
  "Parceiro",
  "Alçada",
  "Status Atual",
  "Data",
  "Parcela / prazo",
  "Ações",
] as const;
export function readProductionColumns(key: string): number[] {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data)
      ? Array.from(
          new Set(
            data.filter(
              (value) => Number.isInteger(value) && value >= 2 && value <= 12,
            ),
          ),
        )
      : [];
  } catch {
    return [];
  }
}
export function paginateProduction<T>(rows: T[], page: number, size: number) {
  const pages = size ? Math.max(1, Math.ceil(rows.length / size)) : 1;
  const current = Math.min(Math.max(0, page), pages - 1);
  return {
    current,
    pages,
    rows: size ? rows.slice(current * size, (current + 1) * size) : rows,
  };
}
export function ProductionWorkspace({
  filters,
  summary,
  count,
  mode,
  onMode,
  children,
  page,
  pages,
  onPage,
  pageSize,
  onPageSize,
  hiddenColumns,
  onHiddenColumns,
  onKanban,
}: {
  filters: React.ReactNode;
  summary?: React.ReactNode;
  count: number;
  mode: RecordPresentation;
  onMode: (mode: RecordPresentation) => void;
  children: React.ReactNode;
  page: number;
  pages: number;
  onPage: (page: number) => void;
  pageSize: number;
  onPageSize: (size: number) => void;
  hiddenColumns: number[];
  onHiddenColumns: (columns: number[]) => void;
  onKanban?: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(true),
    [columnsOpen, setColumnsOpen] = useState(false);
  return (
    <section
      className="p2-panel p2-production-live"
      aria-label="Workspace operacional de propostas"
    >
      <div className="p2-live-summary">{summary}</div>
      <div className="p2-table-tools">
        <span>{count} propostas · carteira carregada</span>
        <div className="p2-actions">
          <button
            className="s2-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            Filtros avançados
          </button>
          <button
            className="s2-button"
            aria-expanded={columnsOpen}
            onClick={() => setColumnsOpen((v) => !v)}
          >
            <Columns3 size={15} />
            Configurar colunas
          </button>
          <button
            className="s2-button"
            aria-pressed={mode === "list"}
            onClick={() => onMode("list")}
          >
            <List size={15} />
            Tabela
          </button>
          <button
            className="s2-button"
            aria-pressed={mode === "cards"}
            onClick={() => onMode("cards")}
          >
            <LayoutGrid size={15} />
            Cartões
          </button>
          {onKanban && (
            <button className="s2-button" onClick={onKanban}>
              <Workflow size={15} />
              Kanban
            </button>
          )}
        </div>
      </div>
      {columnsOpen && (
        <div className="p2-customize" aria-label="Colunas de propostas">
          {PRODUCTION_COLUMNS.map(
            (label, i) =>
              i > 0 &&
              i < 12 && (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.includes(i + 1)}
                    onChange={() =>
                      onHiddenColumns(
                        hiddenColumns.includes(i + 1)
                          ? hiddenColumns.filter((k) => k !== i + 1)
                          : [...hiddenColumns, i + 1],
                      )
                    }
                  />
                  {label}
                </label>
              ),
          )}
          <button className="s2-button" onClick={() => onHiddenColumns([])}>
            Restaurar todas
          </button>
        </div>
      )}
      <div hidden={!filtersOpen} className="p2-live-filters">
        {filters}
      </div>
      <div
        className="p2-live-results"
        data-hidden-columns={hiddenColumns.join(" ")}
      >
        {children}
      </div>
      <footer className="p2-pagination">
        <label>
          Por página{" "}
          <select
            aria-label="Propostas por página"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 0].map((size) => (
              <option key={size} value={size}>
                {size || "Todas"}
              </option>
            ))}
          </select>
        </label>
        <span>Seleção em lote considera todas as propostas filtradas.</span>
        <div className="p2-actions">
          <button
            className="s2-button"
            aria-label="Página anterior de propostas"
            disabled={!page}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            {page + 1} / {pages}
          </span>
          <button
            className="s2-button"
            aria-label="Próxima página de propostas"
            disabled={page + 1 >= pages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </footer>
    </section>
  );
}
