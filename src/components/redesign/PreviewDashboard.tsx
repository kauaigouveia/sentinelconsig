import React, { useState } from "react";
import {
  ArrowUpRight,
  FileText,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  Layers,
  Calculator,
  Headphones,
  ListChecks,
  Plus,
  ChevronRight,
  Activity,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import { hasPermission } from "../../lib/permissions";
import type { Role } from "../../types";
import type { BottlenecksResponse } from "../../types/analytics";
import type { PreviewRow } from "./PreviewData";
export function PreviewDashboard({
  rows,
  bottlenecks,
  role,
  permissions = [],
  name,
  navigate,
  openProposal,
  newProposal,
  error,
  openStatus,
  openBank,
}: {
  rows: PreviewRow[];
  bottlenecks: BottlenecksResponse | null;
  role?: Role;
  permissions?: string[];
  name: string;
  navigate: (path: string) => void;
  openProposal: (id: string) => void;
  newProposal?: () => void;
  error?: string;
  openStatus?: (id: string) => void;
  openBank?: (id: string) => void;
}) {
  const [tab, setTab] = useState("recent"),
    [days, setDays] = useState(14);
  const can = (p: string) => hasPermission(role, permissions, p),
    active = rows.filter((r) => r.active),
    paid = rows.filter((r) => r.paid),
    pending = active.filter((r) => r.pending);
  const recent = [...rows]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);
  const queue =
    tab === "pending"
      ? pending.slice(0, 6)
      : tab === "active"
        ? active.slice(0, 6)
        : recent;
  const points = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86400000),
      key = date.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
    return {
      day: key.slice(0, 5),
      count: rows.filter(
        (r) =>
          new Date(r.createdAt).toLocaleDateString("pt-BR", {
            timeZone: "America/Bahia",
          }) === key,
      ).length,
    };
  });
  const peak = Math.max(1, ...points.map((p) => p.count));
  const bankCounts = Array.from(new Set(active.map((r) => r.bankId || r.bank)))
    .map((id) => ({
      id,
      bank:
        active.find((r) => (r.bankId || r.bank) === id)?.bank ||
        "Não informado",
      count: active.filter((r) => (r.bankId || r.bank) === id).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const priorities = (bottlenecks?.byStatus || [])
    .filter((r) => r.overSlaCount > 0)
    .sort((a, b) => b.overSlaCount - a.overSlaCount)
    .slice(0, 4);
  const actions = [
    {
      label: "Nova simulação",
      path: "/simulacoes",
      permission: "simulations.view",
      icon: Calculator,
    },
    {
      label: "Central de pendências",
      path: "/central-pendencias",
      permission: "pendencies.view",
      icon: ListChecks,
    },
    {
      label: "Atender parceiros",
      path: "/central-atendimento",
      permission: "support.view",
      icon: Headphones,
    },
  ].filter((a) => can(a.permission));
  return (
    <div className="s2-dashboard">
      <header className="s2-page-heading">
        <div>
          <div className="s2-eyebrow">VISÃO DA OPERAÇÃO</div>
          <h1>Painel operacional</h1>
          <p>
            Olá, {name.split(" ")[0]}. Acompanhe a produção e encontre as
            próximas ações.
          </p>
        </div>
        {newProposal && (
          <button className="s2-button primary" onClick={newProposal}>
            <Plus size={16} />
            Nova proposta
          </button>
        )}
      </header>
      <div className="s2-kpis">
        {[
          {
            label: "Propostas em andamento",
            value: can("proposals.view") ? active.length : "—",
            detail: "Carteira disponível",
            icon: Layers,
            color: "blue",
          },
          {
            label: "Volume liberado · pagas",
            value: can("proposals.view")
              ? formatCurrency(
                  paid.reduce((sum, r) => sum + (r.amount || 0), 0),
                )
              : "—",
            detail: `${paid.length} propostas pagas`,
            icon: CircleDollarSign,
            color: "green",
          },
          {
            label: "Propostas fora do SLA",
            value: bottlenecks?.summary.totalOverSla ?? "—",
            detail: bottlenecks
              ? `${bottlenecks.summary.totalNearSla} próximas ao limite`
              : "Consulta de permanência",
            icon: Clock3,
            color: "amber",
          },
          {
            label: "Pendências em propostas",
            value: can("proposals.view") ? pending.length : "—",
            detail: "Status de pendência em operações ativas",
            icon: FileText,
            color: "violet",
          },
        ].map((item) => (
          <section key={item.label} className="s2-kpi">
            <div className="s2-kpi-caption">
              <span>{item.label}</span>
              <item.icon className={item.color} size={19} />
            </div>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </section>
        ))}
      </div>
      <div className="s2-dashboard-columns">
        <div className="s2-primary-column">
          <section className="s2-panel s2-worklist">
            <div className="s2-panel-title">
              <div>
                <h2>Seu centro de trabalho</h2>
                <p>Acesse o registro e continue a operação</p>
              </div>
              {can("proposals.view") && (
                <button
                  className="s2-text-button"
                  onClick={() => navigate("/propostas")}
                >
                  Ver propostas
                  <ArrowUpRight size={15} />
                </button>
              )}
            </div>
            <div
              className="s2-tabs"
              role="tablist"
              aria-label="Fila de propostas"
            >
              {[
                ["recent", "Recentes"],
                ["active", "Em andamento"],
                ["pending", "Com pendência"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  aria-controls="s2-work-panel"
                  id={`s2-tab-${key}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                  <span>
                    {
                      (key === "active"
                        ? active
                        : key === "pending"
                          ? pending
                          : rows
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="s2-work-panel"
              aria-labelledby={`s2-tab-${tab}`}
              className="s2-work-panel"
            >
              {queue.length ? (
                queue.map((row) => (
                  <button
                    key={row.id}
                    className="s2-work-row"
                    onClick={() => openProposal(row.id)}
                  >
                    <span className="s2-record-icon">
                      <FileText size={17} />
                    </span>
                    <span>
                      <strong>{row.client}</strong>
                      <small>
                        ADE {row.ade} · {row.bank}
                      </small>
                    </span>
                    <span className="s2-badge">{row.status}</span>
                    <b>
                      {row.amount == null ? "—" : formatCurrency(row.amount)}
                    </b>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <div className="s2-empty">
                  <ListChecks size={25} />
                  <h3>Nenhuma proposta nesta fila</h3>
                  <p>
                    Os registros reais serão exibidos conforme o acesso e a
                    carteira da empresa.
                  </p>
                </div>
              )}
            </div>
          </section>
          <section className="s2-panel">
            <div className="s2-panel-title">
              <div>
                <h2>Ritmo da produção</h2>
                <p>Propostas cadastradas por dia</p>
              </div>
              <select
                aria-label="Período do gráfico"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={14}>Últimos 14 dias</option>
                <option value={30}>Últimos 30 dias</option>
              </select>
            </div>
            <div
              className="s2-chart"
              role="img"
              aria-label={`${rows.length ? "Produção diária" : "Nenhuma proposta no conjunto disponível"}; período de ${days} dias`}
            >
              {points.map((point, i) => (
                <div key={i} className="s2-chart-day">
                  <div className="s2-chart-track">
                    <span
                      hidden={!rows.length}
                      title={`${point.day}: ${point.count} propostas`}
                      style={{
                        height: point.count
                          ? `${(point.count / peak) * 100}%`
                          : "2px",
                      }}
                    />
                  </div>
                  {(days <= 14 || i % 4 === 0) && <small>{point.day}</small>}
                </div>
              ))}
            </div>
            {!rows.length && (
              <p className="s2-chart-empty">
                A produção aparecerá quando houver propostas no ambiente
                autorizado.
              </p>
            )}
          </section>
        </div>
        <aside className="s2-secondary-column">
          <section className="s2-panel">
            <div className="s2-panel-title">
              <div>
                <h2>Prioridades da operação</h2>
                <p>Etapas além do SLA</p>
              </div>
              <span className="s2-icon-tile amber">
                <Clock3 size={18} />
              </span>
            </div>
            {priorities.length ? (
              priorities.map((row) => (
                <button
                  key={row.statusId}
                  className="s2-priority"
                  onClick={() => openStatus?.(row.statusId)}
                >
                  <span>
                    <strong>{row.statusName}</strong>
                    <small>{row.overSlaCount} propostas fora do prazo</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <div className="s2-small-empty">
                <Activity size={22} />
                <p>
                  {error ||
                    (bottlenecks
                      ? "Nenhuma etapa acima do SLA."
                      : "Os indicadores de SLA dependem da consulta do ambiente autorizado.")}
                </p>
              </div>
            )}
          </section>
          <section className="s2-panel">
            <div className="s2-panel-title">
              <div>
                <h2>Acesso rápido</h2>
                <p>Ferramentas do seu perfil</p>
              </div>
            </div>
            {actions.map((action) => (
              <button
                className="s2-quick-action"
                key={action.path}
                onClick={() => navigate(action.path)}
              >
                <action.icon size={18} />
                <span>{action.label}</span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!actions.length && (
              <p className="s2-muted">
                Nenhum atalho disponível no seu perfil.
              </p>
            )}
          </section>
          <section className="s2-panel">
            <div className="s2-panel-title">
              <div>
                <h2>Carteira por banco</h2>
                <p>Propostas em andamento</p>
              </div>
            </div>
            {bankCounts.map((b) => (
              <button
                type="button"
                className="s2-bank-row"
                key={b.id}
                disabled={!can("proposals.view") || !openBank}
                onClick={() => openBank?.(b.id)}
              >
                <span>
                  {b.bank}
                  <b>{b.count}</b>
                </span>
                <div>
                  <i
                    style={{
                      width: active.length
                        ? `${(b.count / active.length) * 100}%`
                        : "0",
                    }}
                  />
                </div>
              </button>
            ))}
            {!bankCounts.length && (
              <p className="s2-muted">
                Nenhuma proposta ativa vinculada a banco.
              </p>
            )}
          </section>
        </aside>
      </div>
      <footer className="s2-source-note">
        Indicadores da carteira disponível. O período aplica-se ao gráfico. Não
        é o Command Center de incidentes.
      </footer>
    </div>
  );
}
