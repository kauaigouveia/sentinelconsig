import React, { useMemo, useState } from "react";
import {
  Search,
  Plus,
  SlidersHorizontal,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  ArrowDownUp,
} from "lucide-react";
import { formatCpf, formatCurrency } from "../../lib/utils";
import type { PreviewRow } from "./PreviewData";
export function filterPreviewRows(
  rows: PreviewRow[],
  query: string,
  bank: string,
  status: string,
) {
  const q = query.trim().toLocaleLowerCase("pt-BR"),
    digits = q.replace(/\D/g, "");
  return rows.filter(
    (r) =>
      (!bank || (r.bankId || r.bank) === bank) &&
      (!status || r.statusId === status) &&
      (!q ||
        [r.client, r.ade, r.bank, r.partner].some((v) =>
          v.toLocaleLowerCase("pt-BR").includes(q),
        ) ||
        (!!digits && r.cpf.replace(/\D/g, "").includes(digits))),
  );
}
export function PreviewProposals({
  rows,
  openProposal,
  newProposal,
  fullView,
}: {
  rows: PreviewRow[];
  openProposal: (id: string) => void;
  newProposal?: () => void;
  fullView: () => void;
}) {
  const [query, setQuery] = useState(""),
    [bank, setBank] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0),
    [descending, setDescending] = useState(true);
  const filtered = useMemo(
    () =>
      filterPreviewRows(rows, query, bank, status).sort(
        (a, b) =>
          (Date.parse(b.createdAt) - Date.parse(a.createdAt)) *
          (descending ? 1 : -1),
      ),
    [rows, query, bank, status, descending],
  );
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 12) - 1),
    ),
    shown = filtered.slice(currentPage * 12, currentPage * 12 + 12);
  const update = (fn: () => void) => {
    fn();
    setPage(0);
  };
  return (
    <div>
      <header className="s2-page-heading">
        <div>
          <div className="s2-eyebrow">PRODUÇÃO</div>
          <h1>Propostas</h1>
          <p>
            Consulta compacta da carteira disponível, com acesso ao detalhe
            existente.
          </p>
        </div>
        <div className="s2-actions">
          <button className="s2-button" onClick={fullView}>
            <SlidersHorizontal size={15} />
            Todas as ações e campos
          </button>
          {newProposal && (
            <button className="s2-button primary" onClick={newProposal}>
              <Plus size={16} />
              Nova proposta
            </button>
          )}
        </div>
      </header>
      <section className="s2-panel s2-proposals">
        <div className="s2-table-toolbar">
          <label className="s2-query">
            <Search size={17} />
            <input
              aria-label="Buscar propostas"
              placeholder="Cliente, CPF, ADE ou parceiro"
              value={query}
              onChange={(e) => update(() => setQuery(e.target.value))}
            />
          </label>
          <select
            aria-label="Filtrar banco"
            value={bank}
            onChange={(e) => update(() => setBank(e.target.value))}
          >
            <option value="">Todos os bancos</option>
            {Array.from(
              new Map(rows.map((r) => [r.bankId || r.bank, r.bank])).entries(),
            ).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar status"
            value={status}
            onChange={(e) => update(() => setStatus(e.target.value))}
          >
            <option value="">Todos os status</option>
            {Array.from(
              new Map(rows.map((r) => [r.statusId, r.status])).entries(),
            ).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="s2-button"
            onClick={() => update(() => setDescending((v) => !v))}
          >
            <ArrowDownUp size={14} />
            {descending ? "Mais recentes" : "Mais antigas"}
          </button>
        </div>
        <div className="s2-table-scroll">
          <table>
            <caption className="sr-only">
              Propostas — {filtered.length} registros
            </caption>
            <thead>
              <tr>
                {[
                  "ADE / Proposta",
                  "Cliente / CPF",
                  "Banco / Produto",
                  "Parceiro",
                  "Valor liberado",
                  "Valor contrato",
                  "Status",
                  "Cadastro",
                  "",
                ].map((label, i) => (
                  <th key={i} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className="s2-table-link"
                      onClick={() => openProposal(row.id)}
                    >
                      {row.ade}
                    </button>
                  </td>
                  <td>
                    <strong>{row.client}</strong>
                    <small>{formatCpf(row.cpf)}</small>
                  </td>
                  <td>
                    <strong>{row.bank}</strong>
                    <small>{row.product}</small>
                  </td>
                  <td>{row.partner}</td>
                  <td className="s2-currency">
                    {row.amount == null ? "—" : formatCurrency(row.amount)}
                  </td>
                  <td className="s2-currency">
                    {row.contract == null ? "—" : formatCurrency(row.contract)}
                  </td>
                  <td>
                    <span className="s2-badge">
                      <i style={{ background: row.color }} />
                      {row.status}
                    </span>
                  </td>
                  <td>{new Date(row.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td>
                    <button
                      aria-label={`Abrir proposta ${row.ade}`}
                      className="s2-table-open"
                      onClick={() => openProposal(row.id)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && (
          <div className="s2-empty">
            <FileText size={27} />
            <h3>
              {rows.length
                ? "Nenhuma proposta corresponde aos filtros"
                : "Sua carteira aparecerá aqui"}
            </h3>
            <p>Sem dados de demonstração no ambiente operacional.</p>
          </div>
        )}
        <footer className="s2-pagination">
          <span>
            {filtered.length} registros ·{" "}
            {shown.length ? currentPage * 12 + 1 : 0}–
            {Math.min((currentPage + 1) * 12, filtered.length)}
          </span>
          <div>
            <button
              className="s2-button"
              aria-label="Página anterior"
              disabled={!currentPage}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span>Página {currentPage + 1}</span>
            <button
              className="s2-button"
              aria-label="Próxima página"
              disabled={(currentPage + 1) * 12 >= filtered.length}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      </section>
      <p className="s2-source-note">
        Prévia de consulta. Importação, exportação, edição, seleção em lote e
        demais campos permanecem em “Todas as ações e campos”.
      </p>
    </div>
  );
}
