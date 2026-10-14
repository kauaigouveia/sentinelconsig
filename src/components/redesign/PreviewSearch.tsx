import React, { useEffect, useRef, useState } from "react";
import { Search, ArrowUpRight, X, Star, Clock } from "lucide-react";
import { visibleNavigation } from "./navigation";
import type { PreviewRow } from "./PreviewData";
import type { Role } from "../../types";
export function PreviewSearch({
  role,
  permissions = [],
  rows,
  partners = [],
  clients = [],
  openClient,
  recent = [],
  favorites = [],
  navigate,
  openProposal,
  close,
}: {
  role?: Role;
  permissions?: string[];
  rows: PreviewRow[];
  partners?: { name: string; code: string }[];
  clients?: { id: string; name: string; cpf: string }[];
  openClient?: (cpf: string) => void;
  recent?: string[];
  favorites?: string[];
  navigate: (path: string) => void;
  openProposal: (id: string) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    ref = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDivElement>(null);
  const routes = visibleNavigation(role, permissions),
    q = query.toLocaleLowerCase("pt-BR").trim(),
    digits = q.replace(/\D/g, "");
  const results = [
    ...routes
      .filter((r) =>
        q
          ? r.title.toLocaleLowerCase("pt-BR").includes(q)
          : favorites.includes(r.path) || recent.includes(r.path),
      )
      .map((r) => ({
        id: r.path,
        title: r.title,
        detail: favorites.includes(r.path) ? "Favorito" : "Página",
        run: () => navigate(r.path),
        icon: favorites.includes(r.path) ? Star : Clock,
      })),
    ...(q
      ? rows
          .filter(
            (r) =>
              [r.client, r.ade].some((v) =>
                v.toLocaleLowerCase("pt-BR").includes(q),
              ) ||
              (!!digits && r.cpf.replace(/\D/g, "").includes(digits)),
          )
          .slice(0, 8)
          .map((r) => ({
            id: r.id,
            title: r.client,
            detail: `ADE ${r.ade} · ${r.bank}`,
            run: () => openProposal(r.id),
            icon: ArrowUpRight,
          }))
      : []),
    ...(q && openClient
      ? clients
          .filter(
            (c) =>
              c.name.toLocaleLowerCase("pt-BR").includes(q) ||
              (!!digits && c.cpf.replace(/\D/g, "").includes(digits)),
          )
          .slice(0, 4)
          .map((c) => ({
            id: "client:" + c.id,
            title: c.name,
            detail: "Cliente 360°",
            run: () => openClient(c.cpf),
            icon: ArrowUpRight,
          }))
      : []),
    ...(q
      ? partners
          .filter(
            (p) =>
              p.name.toLocaleLowerCase("pt-BR").includes(q) ||
              p.code.toLocaleLowerCase("pt-BR").includes(q),
          )
          .slice(0, 4)
          .map((p) => ({
            id: "partner:" + p.code,
            title: p.name,
            detail: "Parceiro " + p.code,
            run: () => navigate("/crm-parceiros"),
            icon: ArrowUpRight,
          }))
      : []),
  ].slice(0, 15);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="s2-search-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        className="s2-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Busca universal"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          }
          if (
            e.key === "Enter" &&
            document.activeElement === ref.current &&
            results[index]
          ) {
            e.preventDefault();
            results[index].run();
            close();
          }
          if (e.key === "Tab") {
            const all = Array.from(
                dialog.current?.querySelectorAll<HTMLElement>("input,button") ||
                  [],
              ),
              first = all[0],
              last = all[all.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="s2-search-input">
          <Search size={20} />
          <input
            ref={ref}
            aria-label="Buscar páginas, cliente, CPF, ADE ou parceiro"
            placeholder="O que você precisa encontrar?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
          />
          <button aria-label="Fechar busca" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <p className="s2-search-note">
          {q
            ? "Registros carregados e autorizados nesta empresa."
            : "Seus favoritos e páginas recentes."}
        </p>
        <div className="s2-search-results">
          {results.map((r, i) => (
            <button
              key={r.id}
              data-selected={index === i}
              onClick={() => {
                r.run();
                close();
              }}
            >
              <r.icon size={17} />
              <span>
                <strong>{r.title}</strong>
                <small>{r.detail}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!results.length && (
            <div className="s2-empty">
              <Search size={25} />
              <h3>
                {q
                  ? "Nenhum resultado autorizado"
                  : "Comece por uma página ou registro"}
              </h3>
              <p>
                A busca utiliza os dados carregados. Não consulta outras
                empresas.
              </p>
            </div>
          )}
        </div>
        <footer>↑ ↓ navegar · Enter abrir · Esc fechar</footer>
      </div>
    </div>
  );
}
