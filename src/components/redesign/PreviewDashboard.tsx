import React, { useState } from "react";
import {
  Layers,
  CircleDollarSign,
  FileText,
  CheckCircle2,
  ListChecks,
  Clock3,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  ArrowUpRight,
  Calculator,
  Headphones,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatCurrency } from "../../lib/utils";
import { hasPermission } from "../../lib/permissions";
import type { Role } from "../../types";
import type { BottlenecksResponse } from "../../types/analytics";
import type { PreviewRow } from "./PreviewData";
import {
  PremiumStatCard,
  SectionHeader,
  StatusBadge,
  EmptyState,
} from "./PremiumPrimitives";
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
  demo = false,
  onRefresh,
  loading = false,
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
  demo?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  const [tab, setTab] = useState("Recentes"),
    [days, setDays] = useState("14"),
    [series, setSeries] = useState("count"),
    [customize, setCustomize] = useState(false),
    [filters, setFilters] = useState(false),
    [bankFilter, setBankFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [hidden, setHidden] = useState<string[]>([]),
    [reversed, setReversed] = useState(false),
    [displayState, setDisplayState] = useState<
      "ready" | "loading" | "empty" | "error"
    >("ready");
  const can = (p: string) => hasPermission(role, permissions, p);
  const sourceRows = can("proposals.view") ? rows : [];
  const permittedRows = sourceRows.filter(
    (r) =>
      (!bankFilter || (r.bankId || r.bank) === bankFilter) &&
      (!statusFilter || r.statusId === statusFilter),
  );
  const active = permittedRows.filter((r) => r.active),
    paid = permittedRows.filter((r) => r.paid),
    pending = active.filter((r) => r.pending);
  const now = demo ? new Date("2026-10-13T18:00:00Z") : new Date();
  const countDays = days === "month" ? now.getDate() : Number(days);
  const firstDay = new Date(now);
  firstDay.setDate(now.getDate() - countDays + 1);
  firstDay.setHours(0, 0, 0, 0);
  const periodRows = permittedRows.filter(
    (r) =>
      Date.parse(r.createdAt) >= firstDay.getTime() &&
      Date.parse(r.createdAt) <= now.getTime(),
  );
  const total = (items: PreviewRow[], field: "amount" | "contract") =>
    items.some((r) => r[field] !== null)
      ? formatCurrency(items.reduce((sum, r) => sum + (r[field] ?? 0), 0))
      : "—";
  const points = Array.from({ length: countDays }, (_, i) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + i);
    const key = date.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
    const group = periodRows.filter(
      (r) =>
        new Date(r.createdAt).toLocaleDateString("pt-BR", {
          timeZone: "America/Bahia",
        }) === key,
    );
    return {
      day: key.slice(0, 5),
      count: group.length,
      contract: group.reduce((s, r) => s + (r.contract ?? 0), 0),
      amount: group.reduce((s, r) => s + (r.amount ?? 0), 0),
      paid: group
        .filter((r) => r.paid)
        .reduce((s, r) => s + (r.amount ?? 0), 0),
    };
  });
  const stats = [
    {
      label: "Propostas em andamento",
      value: active.length,
      detail: "Carteira disponível",
      definition: "Propostas operacionais ativas no conjunto carregado.",
      icon: Layers,
      color: "#3b82f6",
    },
    {
      label: "Volume liberado · pagas",
      value: total(paid, "amount"),
      detail: "Carteira disponível · pagas",
      definition:
        "Soma dos valores liberados das propostas com status pago. Não representa data de pagamento.",
      icon: CircleDollarSign,
      color: "#06b6d4",
    },
    {
      label: "Produção do período",
      value: total(periodRows, "contract"),
      detail: "Valor contratado · por criação",
      definition:
        "Valor de contrato das propostas criadas no período escolhido.",
      icon: FileText,
      color: "#8b5cf6",
    },
    {
      label: "Propostas pagas",
      value: paid.length,
      detail: "Status pago · carteira disponível",
      definition:
        "Quantidade de propostas atualmente pagas no conjunto carregado.",
      icon: CheckCircle2,
      color: "#10b981",
    },
    {
      label: "Pendências abertas",
      value: demo ? 12 : "—",
      detail: "Fixture · 12 registros de pendência",
      definition:
        "Entidades de pendência abertas. Fonte não conectada na prévia autenticada; não confundir com status pendente.",
      icon: ListChecks,
      color: "#f59e0b",
    },
    {
      label: "Propostas fora do SLA",
      value: demo ? 7 : (bottlenecks?.summary.totalOverSla ?? "—"),
      detail: demo
        ? "Fixture · permanência excedida"
        : "Consulta de permanência",
      definition:
        "Contagem fornecida pela análise de permanência existente, sem recalcular regras de SLA.",
      icon: Clock3,
      color: "#f43f5e",
    },
  ];
  const bankCounts = Array.from(
    new Set(periodRows.map((r) => r.bankId || r.bank)),
  )
    .map((id) => {
      const group = periodRows.filter((r) => (r.bankId || r.bank) === id);
      return {
        id,
        name: group[0].bank,
        count: group.length,
        amount: total(group, "contract"),
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const statuses = Array.from(
    new Set(permittedRows.map((r) => r.statusId)),
  ).map((id) => {
    const group = permittedRows.filter((r) => r.statusId === id);
    return {
      id,
      name: group[0].status,
      color: group[0].color,
      count: group.length,
    };
  });
  const queue = [
    ...(tab === "Pendentes"
      ? pending
      : tab === "Em andamento"
        ? active
        : permittedRows),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 4);
  const radar = demo
    ? [
        {
          label: "Pendências documentais críticas",
          count: 3,
          path: "/central-pendencias",
          color: "#f43f5e",
        },
        {
          label: "Propostas fora do SLA",
          count: 7,
          path: "/relatorio-gargalos",
          color: "#f59e0b",
        },
        {
          label: "Aguardando retorno CIP",
          count: 9,
          path: "/portabilidade",
          color: "#06b6d4",
        },
        {
          label: "Fila de formalização",
          count: 9,
          path: "/propostas",
          color: "#8b5cf6",
        },
      ]
    : (bottlenecks?.byStatus || [])
        .filter((s) => s.overSlaCount > 0)
        .slice(0, 4)
        .map((s) => ({
          label: s.statusName,
          count: s.overSlaCount,
          path: "/propostas",
          color: "#f59e0b",
          id: s.statusId,
        }));
  const refresh = () => {
    if (demo) {
      setDisplayState("loading");
      window.setTimeout(() => setDisplayState("ready"), 450);
    } else onRefresh?.();
  };
  return (
    <div className="p2-dashboard">
      <header className="p2-page-header">
        <div>
          <div className="s2-eyebrow">SENTINEL / OPERAÇÃO</div>
          <h1>Visão da Operação</h1>
          <p>
            Olá, {name.split(" ")[0]}.{" "}
            {demo
              ? "Uma visão inteligente da sua produção · cenário fictício"
              : "Carteira carregada e prioridades operacionais"}
          </p>
        </div>
        <div className="p2-actions">
          <select
            aria-label="Período do dashboard"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="7">Últimos 7 dias</option>
            <option value="14">Últimos 14 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="month">Mês atual</option>
          </select>
          {can("proposals.view") && (
            <button
              className="s2-button"
              aria-expanded={filters}
              onClick={() => setFilters((v) => !v)}
            >
              <SlidersHorizontal size={15} />
              Filtros
            </button>
          )}
          <button
            className="s2-button"
            title="Atualizar fontes carregadas"
            onClick={refresh}
          >
            <RefreshCw size={15} />
            Atualizar
          </button>
          <button
            className="s2-button"
            aria-expanded={customize}
            onClick={() => setCustomize((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            Personalizar
          </button>
          {newProposal && (
            <button className="s2-button primary" onClick={newProposal}>
              <Plus size={15} />
              Nova proposta
            </button>
          )}
        </div>
      </header>
      {filters && (
        <section className="p2-customize" aria-label="Filtros do dashboard">
          <label>
            Banco
            <select
              aria-label="Banco do dashboard"
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {Array.from(
                new Set(sourceRows.map((r) => r.bankId || r.bank)),
              ).map((id) => (
                <option key={id} value={id}>
                  {sourceRows.find((r) => (r.bankId || r.bank) === id)?.bank}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Status do dashboard"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {Array.from(new Set(sourceRows.map((r) => r.statusId))).map(
                (id) => (
                  <option key={id} value={id}>
                    {sourceRows.find((r) => r.statusId === id)?.status}
                  </option>
                ),
              )}
            </select>
          </label>
          <small>
            Filtra carteira, gráfico e análises. Pendências e SLA mantêm a base
            geral da fonte.
          </small>
          <button
            className="s2-text-button"
            onClick={() => {
              setBankFilter("");
              setStatusFilter("");
            }}
          >
            Limpar filtros
          </button>
        </section>
      )}
      {customize && (
        <section className="p2-customize" aria-label="Personalizar indicadores">
          {stats.map((s) => (
            <label key={s.label}>
              <input
                type="checkbox"
                checked={!hidden.includes(s.label)}
                onChange={() =>
                  setHidden((v) =>
                    v.includes(s.label)
                      ? v.filter((k) => k !== s.label)
                      : [...v, s.label],
                  )
                }
              />
              {s.label}
            </label>
          ))}
          <button className="s2-button" onClick={() => setReversed((v) => !v)}>
            Inverter ordem
          </button>
          {demo && (
            <select
              aria-label="Estado visual dos indicadores"
              value={displayState}
              onChange={(e) =>
                setDisplayState(e.target.value as typeof displayState)
              }
            >
              {["ready", "loading", "empty", "error"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <small>
            Preferência temporária desta prévia · sem dados pessoais
          </small>
        </section>
      )}
      {error && (
        <p role="alert" className="p2-warning">
          Não foi possível consultar o SLA. {error}
        </p>
      )}
      <div className="p2-stats">
        {(reversed ? [...stats].reverse() : stats)
          .filter((s) => !hidden.includes(s.label))
          .map((s) => (
            <PremiumStatCard
              key={s.label}
              {...s}
              state={
                demo
                  ? displayState
                  : !can("proposals.view") || s.label === "Pendências abertas"
                    ? "empty"
                    : s.label === "Propostas fora do SLA"
                      ? error
                        ? "error"
                        : loading
                          ? "loading"
                          : !bottlenecks
                            ? "empty"
                            : "ready"
                      : "ready"
              }
            />
          ))}
      </div>
      <div className="p2-intelligence">
        <section className="p2-panel p2-chart">
          <SectionHeader
            title="Evolução da Produção"
            subtitle="Por data de criação · valores da carteira carregada"
          >
            <select
              aria-label="Série da evolução"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
            >
              <option value="count">Quantidade de propostas</option>
              <option value="contract">Valor digitado / contratado</option>
              <option value="amount">Valor liberado</option>
              {demo && <option value="paid">Valor pago · fixture</option>}
            </select>
          </SectionHeader>
          <div className="p2-chart-summary">
            <strong>
              {series === "count"
                ? periodRows.length
                : total(
                    series === "paid"
                      ? periodRows.filter((r) => r.paid)
                      : periodRows,
                    series === "contract" ? "contract" : "amount",
                  )}
            </strong>
            <span>
              {countDays} dias ·{" "}
              {demo ? "dados demonstrativos" : "base carregada"}
            </span>
            <i />
            <small>Produção</small>
          </div>
          {periodRows.length ? (
            <div className="p2-chart-canvas">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={points}
                  margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="production-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0" stopColor="#06b6d4" stopOpacity={0.38} />
                      <stop offset="1" stopColor="#2563eb" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--s2-border)"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--s2-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={35}
                  />
                  <YAxis
                    tick={{ fill: "var(--s2-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                    tickFormatter={(v) =>
                      series === "count" ? String(v) : `${Number(v) / 1000}k`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--s2-surface)",
                      borderColor: "var(--s2-border)",
                      color: "var(--s2-text)",
                    }}
                    formatter={(v) => [
                      series === "count"
                        ? String(v)
                        : formatCurrency(Number(v)),
                      "Produção",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={series}
                    stroke="#06b6d4"
                    strokeWidth={3}
                    fill="url(#production-fill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Sem produção no período"
              detail="Nenhuma série financeira foi inventada."
            />
          )}
        </section>
        <section className="p2-panel p2-radar">
          <SectionHeader
            title="Radar Operacional"
            subtitle="Prioridades da operação"
          />
          <p className="p2-radar-note">
            Prioridades da operação · Não é o Command Center de incidentes
          </p>
          {radar.length ? (
            radar.map((item, i) => (
              <button
                key={item.label}
                onClick={() =>
                  "id" in item && item.id
                    ? openStatus?.(item.id)
                    : navigate(item.path)
                }
              >
                <span className="p2-radar-icon" style={{ color: item.color }}>
                  <Clock3 size={16} />
                </span>
                <span>
                  {item.label}
                  <small>
                    {i === 0 ? "Requer atenção da mesa" : "Acompanhar fila"}
                  </small>
                </span>
                <strong>{item.count}</strong>
                <ArrowUpRight size={14} />
              </button>
            ))
          ) : (
            <EmptyState
              title="Nenhum alerta disponível"
              detail="Alertas reais dependem da fonte de permanência."
            />
          )}
          <div className="p2-radar-foot">
            <span className="p2-live-dot" />
            {demo
              ? "Cenário ilustrativo · sem realtime"
              : "Fontes existentes · atualizações do sistema"}
          </div>
        </section>
      </div>
      <section className="p2-panel p2-my-operation">
        <SectionHeader
          title="Minha Operação"
          subtitle="Acesse o registro e continue o atendimento"
        >
          {can("proposals.view") && (
            <button
              className="s2-text-button"
              onClick={() => navigate("/propostas")}
            >
              Ver propostas
              <ArrowUpRight size={14} />
            </button>
          )}
        </SectionHeader>
        <div className="p2-tabs" role="tablist" aria-label="Minha operação">
          {["Recentes", "Em andamento", "Pendentes", "Minhas tarefas"].map(
            (t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ),
          )}
        </div>
        {tab === "Minhas tarefas" ? (
          <EmptyState
            title={
              demo
                ? "Conferir documentos · tarefa de exemplo"
                : "Consulte sua agenda operacional"
            }
            detail="Tarefas não são inferidas a partir de propostas."
          />
        ) : queue.length ? (
          <div className="p2-operation-list">
            {queue.map((r) => (
              <button key={r.id} onClick={() => openProposal(r.id)}>
                <span className="p2-avatar">{r.client.slice(0, 1)}</span>
                <span>
                  <strong>{r.client}</strong>
                  <small>
                    {r.ade} · {r.product}
                  </small>
                </span>
                <span>
                  {r.bank}
                  <small>{r.partner}</small>
                </span>
                <strong>
                  {r.amount === null ? "—" : formatCurrency(r.amount)}
                </strong>
                <StatusBadge label={r.status} color={r.color} />
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhuma proposta nesta fila" />
        )}
        <div className="p2-quick-actions">
          {can("simulations.view") && (
            <button onClick={() => navigate("/simulacoes")}>
              <Calculator size={16} />
              Nova simulação
              <ArrowRight size={13} />
            </button>
          )}
          {can("pendencies.view") && (
            <button onClick={() => navigate("/central-pendencias")}>
              <ListChecks size={16} />
              Tratar pendências
              <ArrowRight size={13} />
            </button>
          )}
          {can("support.view") && (
            <button onClick={() => navigate("/central-atendimento")}>
              <Headphones size={16} />
              Atender parceiros
              <ArrowRight size={13} />
            </button>
          )}
          {can("tasks.view") && (
            <button onClick={() => navigate("/agenda-operacional")}>
              <Clock3 size={16} />
              Abrir minha agenda
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </section>
      <div className="p2-analysis">
        <section className="p2-panel">
          <SectionHeader
            title="Produção por Banco"
            subtitle="Quantidade e participação no período"
          />
          {bankCounts.length ? (
            bankCounts.map((b, i) => (
              <button
                className="p2-bank-row"
                key={b.id}
                onClick={() =>
                  openBank ? openBank(b.id) : navigate("/propostas")
                }
              >
                <span className="p2-bank-rank">0{i + 1}</span>
                <strong>{b.name}</strong>
                <div className="p2-progress">
                  <i
                    style={{ width: `${(b.count / periodRows.length) * 100}%` }}
                  />
                </div>
                <span>{b.count} propostas</span>
                <strong>{b.amount}</strong>
                <small>
                  {Math.round((b.count / periodRows.length) * 100)}%
                </small>
              </button>
            ))
          ) : (
            <EmptyState title="Sem produção por banco" />
          )}
        </section>
        <section className="p2-panel">
          <SectionHeader
            title="Distribuição por Status"
            subtitle="Status da carteira disponível"
          />
          <div className="p2-status-distribution">
            {statuses.length ? (
              <>
                <div
                  className="p2-donut"
                  role="img"
                  aria-label={`${permittedRows.length} propostas distribuídas por status`}
                  style={{
                    background: `conic-gradient(${statuses.map((s, i) => `${s.color} ${(statuses.slice(0, i).reduce((a, v) => a + v.count, 0) / permittedRows.length) * 100}% ${(statuses.slice(0, i + 1).reduce((a, v) => a + v.count, 0) / permittedRows.length) * 100}%`).join(",")})`,
                  }}
                >
                  <div>
                    <strong>{permittedRows.length}</strong>
                    <small>propostas</small>
                  </div>
                </div>
                <div>
                  {statuses.map((s) => (
                    <button
                      key={s.id}
                      onClick={() =>
                        openStatus ? openStatus(s.id) : navigate("/propostas")
                      }
                    >
                      <i style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <strong>{s.count}</strong>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState title="Sem distribuição disponível" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
