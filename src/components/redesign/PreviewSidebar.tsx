import React, { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Calculator,
  ArrowLeftRight,
  Users,
  Headphones,
  Wallet,
  Plug,
  BarChart3,
  Settings,
  Building2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
  ChevronDown,
  ListChecks,
  ShieldCheck,
  Workflow,
  CalendarDays,
  Star,
} from "lucide-react";
import { GROUPS, visibleNavigation } from "./navigation";
import type { Role } from "../../types";
const icons: Record<string, React.ElementType> = {
  "/": LayoutDashboard,
  "/propostas": FileText,
  "/simulacoes": Calculator,
  "/portabilidade": ArrowLeftRight,
  "/clientes": Users,
  "/central-atendimento": Headphones,
  "/financeiro-geral": Wallet,
  "/integracoes": Plug,
  "/bi": BarChart3,
  "/central-administracao": Settings,
  "/empresas-assinaturas": Building2,
  "/central-pendencias": ListChecks,
  "/esteira": Workflow,
  "/agenda-operacional": CalendarDays,
};
const colors = [
  "#2563eb",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#f43f5e",
  "#8b5cf6",
];
export function PreviewSidebar({
  role,
  permissions = [],
  path,
  navigate,
  mobileOpen = false,
  closeMobile,
  brandLogo = "/branding/sentinel-consig-symbol.svg",
  brandName = "Sentinel Consig",
  favorites = [],
  recent = [],
}: {
  role?: Role;
  permissions?: string[];
  path: string;
  navigate: (path: string) => void;
  mobileOpen?: boolean;
  closeMobile?: () => void;
  brandLogo?: string;
  brandName?: string;
  favorites?: string[];
  recent?: string[];
}) {
  const [compact, setCompact] = useState(false),
    [query, setQuery] = useState(""),
    [closed, setClosed] = useState<string[]>([
      "Gestão",
      "Administração",
      "Plataforma",
    ]),
    [hint, setHint] = useState<{ label: string; x: number; y: number } | null>(
      null,
    );
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width:767px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width:767px)"),
      sync = () => setNarrow(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const ref = useRef<HTMLElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const items = visibleNavigation(role, permissions).filter((route) =>
    route.title
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  useEffect(() => {
    if (!mobileOpen) return;
    opener.current = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile?.();
      if (e.key === "Tab") {
        const all = Array.from(
          ref.current?.querySelectorAll<HTMLElement>("button,input,a") || [],
        ).filter((n) => n.getClientRects().length);
        if (!all.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      opener.current?.focus();
    };
  }, [mobileOpen]);
  return (
    <>
      <aside
        id="app-sidebar"
        ref={ref}
        className="s2-sidebar"
        inert={narrow && !mobileOpen ? true : undefined}
        aria-hidden={narrow && !mobileOpen ? true : undefined}
        data-compact={compact && !mobileOpen}
        data-mobile-open={mobileOpen}
        aria-label="Navegação principal"
      >
        <div className="s2-brand">
          <img
            src={brandLogo}
            alt=""
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/branding/sentinel-consig-symbol.svg";
            }}
          />
          <div>
            <strong>{brandName}</strong>
            <small>OPERAÇÃO E GESTÃO</small>
          </div>
          <button
            className="s2-mobile-close"
            aria-label="Fechar navegação"
            onClick={closeMobile}
          >
            <X size={18} />
          </button>
        </div>
        <div className="s2-navigation-search">
          <Search size={14} />
          <input
            aria-label="Encontrar página"
            placeholder="Encontrar página"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <nav>
          {!compact &&
            !query &&
            [
              ["Favoritos", favorites],
              ["Recentes", recent.slice(0, 2)],
            ].map(([title, paths]) => {
              const shortcuts = (paths as string[])
                .map((p) => items.find((r) => r.path === p))
                .filter(Boolean);
              return shortcuts.length ? (
                <section className="p2-nav-shortcuts" key={title as string}>
                  <div className="s2-group">
                    <span>{title as string}</span>
                    <Star size={12} />
                  </div>
                  {shortcuts.map(
                    (route) =>
                      route && (
                        <a
                          key={route.path}
                          href={route.path}
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) return;
                            e.preventDefault();
                            navigate(route.path);
                            closeMobile?.();
                          }}
                        >
                          <Star size={14} />
                          <span>
                            {route.path === "/"
                              ? "Visão da Operação"
                              : route.title}
                          </span>
                        </a>
                      ),
                  )}
                </section>
              ) : null;
            })}
          {GROUPS.map((group, index) => {
            const entries = items.filter((item) => item.group === group);
            if (!entries.length) return null;
            return (
              <section
                key={group}
                style={{ "--nav-color": colors[index] } as React.CSSProperties}
              >
                <button
                  className="s2-group"
                  aria-expanded={!closed.includes(group)}
                  onClick={() =>
                    setClosed((current) =>
                      current.includes(group)
                        ? current.filter((v) => v !== group)
                        : [...current, group],
                    )
                  }
                >
                  <span>{group}</span>
                  <ChevronDown size={12} />
                </button>
                {(!closed.includes(group) || compact || query) &&
                  entries.map((route) => {
                    const Icon =
                      icons[route.path] ||
                      {
                        Integrações: Plug,
                        Gestão: BarChart3,
                        Administração: ShieldCheck,
                        Plataforma: Building2,
                      }[group] ||
                      Star;
                    const active =
                      route.path === "/"
                        ? path === "/" || path === "/dashboard"
                        : path === route.path ||
                          path.startsWith(route.path + "/");
                    return (
                      <a
                        key={route.path}
                        href={route.path}
                        title={route.title}
                        aria-label={route.title}
                        onMouseEnter={(e) => {
                          if (compact) {
                            const r = e.currentTarget.getBoundingClientRect();
                            setHint({
                              label: route.title,
                              x: r.right + 12,
                              y: r.top + 6,
                            });
                          }
                        }}
                        onMouseLeave={() => setHint(null)}
                        onFocus={(e) => {
                          if (compact) {
                            const r = e.currentTarget.getBoundingClientRect();
                            setHint({
                              label: route.title,
                              x: r.right + 12,
                              y: r.top + 6,
                            });
                          }
                        }}
                        onBlur={() => setHint(null)}
                        aria-current={active ? "page" : undefined}
                        onClick={(e) => {
                          if (e.ctrlKey || e.metaKey) return;
                          e.preventDefault();
                          navigate(route.path);
                          closeMobile?.();
                        }}
                      >
                        <Icon size={18} />
                        <span>
                          {route.title.replace(
                            "Dashboard / Início",
                            "Visão da operação",
                          )}
                        </span>
                        {active && <i />}
                      </a>
                    );
                  })}
              </section>
            );
          })}
          {!items.length && (
            <p className="s2-no-nav">Nenhuma página disponível.</p>
          )}
        </nav>
        <button
          className="s2-collapse"
          onClick={() => {
            setCompact((v) => !v);
            setHint(null);
          }}
          aria-label={compact ? "Expandir sidebar" : "Recolher sidebar"}
          aria-expanded={!compact}
        >
          {compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span>Recolher menu</span>
        </button>
      </aside>
      {hint && (
        <span
          role="tooltip"
          className="s2-nav-tooltip"
          style={{ left: hint.x, top: hint.y }}
        >
          {hint.label}
        </span>
      )}
      {mobileOpen && (
        <button
          className="s2-mobile-backdrop"
          onClick={closeMobile}
          aria-label="Fechar navegação"
        />
      )}
    </>
  );
}
