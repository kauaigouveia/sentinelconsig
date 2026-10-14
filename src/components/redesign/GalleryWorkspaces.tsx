import React, { useState } from "react";
import {
  Plus,
  Upload,
  Download,
  Columns3,
  List,
  LayoutGrid,
  Workflow,
  SlidersHorizontal,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  Clock3,
  ShieldCheck,
  FileText,
  Users,
  CircleDollarSign,
} from "lucide-react";
import {
  galleryRows,
  galleryStatuses,
  type GalleryRow,
} from "./galleryFixtures";
import { filterPreviewRows } from "./PreviewProposals";
import {
  DetailDrawer,
  SectionHeader,
  StatusBadge,
  EmptyState,
} from "./PremiumPrimitives";
import { formatCurrency } from "../../lib/utils";
const money = (v: number | null) => (v === null ? "—" : formatCurrency(v));
const detailTabs = [
  "Resumo",
  "Cliente",
  "Operação",
  "Histórico",
  "Documentos",
  "Pendências",
  "Integrações",
  "Observações",
];
export function GalleryDetail({
  row,
  close,
}: {
  row: GalleryRow;
  close: () => void;
}) {
  const [tab, setTab] = useState("Resumo");
  return (
    <DetailDrawer title={row.ade} close={close}>
      <div className="p2-detail-hero">
        <span className="p2-avatar">{row.client[0]}</span>
        <div>
          <h2>{row.client}</h2>
          <p>CPF: ***.***.***-** · cadastro fictício</p>
          <StatusBadge label={row.status} color={row.color} />
        </div>
      </div>
      <div className="p2-tabs" role="tablist" aria-label="Seções da proposta">
        {detailTabs.map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p2-detail-body">
        {tab === "Resumo" || tab === "Operação" ? (
          <>
            <div className="p2-detail-metrics">
              <div>
                <small>Valor liberado</small>
                <strong>{money(row.amount)}</strong>
              </div>
              <div>
                <small>Valor contratado</small>
                <strong>{money(row.contract)}</strong>
              </div>
              <div>
                <small>Parcela</small>
                <strong>{money(row.installment)}</strong>
              </div>
            </div>
            <SectionHeader title="Dados da operação" />
            <dl className="p2-description">
              <dt>Banco</dt>
              <dd>{row.bank}</dd>
              <dt>Produto</dt>
              <dd>{row.product}</dd>
              <dt>Parceiro</dt>
              <dd>{row.partner}</dd>
              <dt>ADE</dt>
              <dd>{row.ade}</dd>
              <dt>Formalização</dt>
              <dd>Digital · demonstração</dd>
            </dl>
            <ActivityTimeline />
          </>
        ) : tab === "Cliente" ? (
          <>
            <h2>{row.client}</h2>
            <p>CPF mascarado · cliente fictício</p>
            <p>Cadastro e edição preservados na implementação atual.</p>
          </>
        ) : tab === "Histórico" ? (
          <ActivityTimeline />
        ) : (
          <EmptyState
            title={`${tab} · demonstração visual`}
            detail="O fluxo real e seus registros permanecem no componente atual. Nenhuma comunicação, upload ou alteração é realizada aqui."
          />
        )}
      </div>
    </DetailDrawer>
  );
}
export function ActivityTimeline() {
  return (
    <div className="p2-timeline">
      {[
        ["13:42", "Proposta registrada", "Mesa de produção · cenário fictício"],
        ["14:05", "Condições confirmadas", "Banco · exemplo de evento"],
        [
          "14:21",
          "Aguardando próxima etapa",
          "Atendimento · sem integração ativa",
        ],
      ].map(([time, title, detail]) => (
        <div key={time}>
          <time>{time}</time>
          <i />
          <span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
export function GalleryProposals({
  navigate,
  open,
  explain,
}: {
  navigate: (p: string) => void;
  open: (r: GalleryRow) => void;
  explain: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [bank, setBank] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [cards, setCards] = useState(
      () =>
        typeof window !== "undefined" &&
        window.matchMedia("(max-width:767px)").matches,
    ),
    [advanced, setAdvanced] = useState(false),
    [columns, setColumns] = useState(false),
    [compact, setCompact] = useState(true),
    [hidden, setHidden] = useState<string[]>([]),
    [state, setState] = useState("ready");
  const filtered = filterPreviewRows(galleryRows, query, bank, status).sort(
    (a, b) =>
      (Date.parse(b.createdAt) - Date.parse(a.createdAt)) * (sort ? -1 : 1),
  ) as GalleryRow[];
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(filtered.length / 8) - 1),
    ),
    shown = filtered.slice(currentPage * 8, currentPage * 8 + 8);
  const select = (id: string) =>
    setSelected((v) =>
      v.includes(id) ? v.filter((k) => k !== id) : [...v, id],
    );
  const display = (name: string) => !hidden.includes(name);
  const exportDemo = () => {
    const content =
      "ADE;Cliente fictício;Banco;Valor liberado\n" +
      filtered
        .map((r) => `${r.ade};${r.client};${r.bank};${r.amount}`)
        .join("\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "sentinel-demonstracao-ficticia.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <header className="p2-page-header">
        <div>
          <div className="s2-eyebrow">PRODUÇÃO / DATA WORKSPACE</div>
          <h1>Propostas</h1>
          <p>Da contratação à liberação. Toda a operação em um lugar.</p>
        </div>
        <div className="p2-actions">
          <button
            className="s2-button"
            onClick={() =>
              explain(
                "Importação demonstrativa. O importador real e suas validações não foram migrados.",
              )
            }
          >
            <Upload size={15} />
            Importar Excel
          </button>
          <button className="s2-button" onClick={exportDemo}>
            <Download size={15} />
            Exportar exemplos
          </button>
          <button
            className="s2-button primary"
            onClick={() =>
              explain(
                "Nova proposta: representação visual. A criação real continua no formulário existente.",
              )
            }
          >
            <Plus size={15} />
            Nova proposta
          </button>
        </div>
      </header>
      <div className="p2-production-summary">
        {[
          ["Carteira", "36"],
          ["Em andamento", "27"],
          [
            "Volume contratado",
            money(galleryRows.reduce((s, r) => s + (r.contract || 0), 0)),
          ],
          ["Pagas", "9"],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
        <span>FIXTURE · SEM API</span>
      </div>
      <section className="p2-panel p2-production">
        <div className="p2-filterbar">
          <label>
            <Search size={15} />
            <input
              aria-label="Buscar propostas demonstrativas"
              placeholder="Buscar cliente, ADE, banco ou parceiro"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <select
            aria-label="Filtrar banco"
            value={bank}
            onChange={(e) => {
              setBank(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os bancos</option>
            {Array.from(new Set(galleryRows.map((r) => r.bankId))).map((id) => (
              <option key={id} value={id}>
                {galleryRows.find((r) => r.bankId === id)?.bank}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os status</option>
            {galleryStatuses.map((s, i) => (
              <option key={s.name} value={`demo-status-${i}`}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="s2-button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            Filtros avançados
          </button>
        </div>
        {advanced && (
          <div className="p2-customize">
            <label>
              Estado demonstrativo
              <select
                aria-label="Estado da tabela"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {["ready", "loading", "empty", "error"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <small>
              Os filtros reais adicionais e as validações permanecem no módulo
              legado.
            </small>
            <button
              className="s2-text-button"
              onClick={() => {
                setBank("");
                setStatus("");
                setQuery("");
                setState("ready");
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}
        <div className="p2-table-tools">
          <span>
            {filtered.length} propostas
            {selected.length ? ` · ${selected.length} selecionadas` : ""}
          </span>
          <div className="p2-actions">
            <button
              className="s2-button"
              disabled={!selected.length}
              onClick={() =>
                explain(
                  `${selected.length} exemplos selecionados. A ação em lote não grava dados.`,
                )
              }
            >
              Ações em lote
            </button>
            <button className="s2-button" onClick={() => setColumns((v) => !v)}>
              <Columns3 size={14} />
              Colunas
            </button>
            <button className="s2-button" onClick={() => setCompact((v) => !v)}>
              {compact ? "Compacta" : "Confortável"}
            </button>
            <button
              className="s2-button"
              aria-label="Alternar tabela e cartões"
              onClick={() => setCards((v) => !v)}
            >
              {cards ? <List size={15} /> : <LayoutGrid size={15} />}
            </button>
            <button className="s2-button" onClick={() => navigate("/esteira")}>
              <Workflow size={14} />
              Kanban
            </button>
          </div>
        </div>
        {columns && (
          <div className="p2-customize">
            {["Parceiro", "Parcela", "Data"].map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={display(c)}
                  onChange={() =>
                    setHidden((v) =>
                      v.includes(c) ? v.filter((k) => k !== c) : [...v, c],
                    )
                  }
                />
                {c}
              </label>
            ))}
          </div>
        )}
        {state === "error" ? (
          <EmptyState
            title="Não foi possível carregar a tabela"
            detail="Estado de erro demonstrativo."
          />
        ) : state === "empty" || !shown.length ? (
          <EmptyState title="Nenhuma proposta encontrada" />
        ) : state === "loading" ? (
          <div className="p2-loading" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div className="p2-skeleton" key={i} />
            ))}
          </div>
        ) : cards ? (
          <div className="p2-card-grid">
            {shown.map((r) => (
              <ProposalCard key={r.id} row={r} open={() => open(r)} />
            ))}
          </div>
        ) : (
          <div className={`p2-table-scroll ${compact ? "compact" : ""}`}>
            <table className="p2-table">
              <thead>
                <tr>
                  <th>
                    <input
                      aria-label="Selecionar página"
                      type="checkbox"
                      checked={
                        shown.length > 0 &&
                        shown.every((r) => selected.includes(r.id))
                      }
                      onChange={(e) =>
                        setSelected((v) =>
                          e.target.checked
                            ? Array.from(
                                new Set([...v, ...shown.map((r) => r.id)]),
                              )
                            : v.filter((id) => !shown.some((r) => r.id === id)),
                        )
                      }
                    />
                  </th>
                  <th>Proposta / ADE</th>
                  <th>Cliente / CPF</th>
                  <th>Banco / Produto</th>
                  {display("Parceiro") && <th>Parceiro</th>}
                  <th>Valor liberado</th>
                  {display("Parcela") && <th>Parcela</th>}
                  <th>Status</th>
                  {display("Data") && (
                    <th>
                      <button onClick={() => setSort((v) => !v)}>
                        Data {sort ? "↑" : "↓"}
                      </button>
                    </th>
                  )}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${r.ade}`}
                        checked={selected.includes(r.id)}
                        onChange={() => select(r.id)}
                      />
                    </td>
                    <td>
                      <button className="p2-ade" onClick={() => open(r)}>
                        {r.ade}
                      </button>
                      <small>{r.elapsed} na etapa</small>
                    </td>
                    <td>
                      <strong>{r.client}</strong>
                      <small>{r.cpf}</small>
                    </td>
                    <td>
                      <strong>{r.bank}</strong>
                      <small>{r.product}</small>
                    </td>
                    {display("Parceiro") && <td>{r.partner}</td>}
                    <td>
                      <strong className="p2-money">{money(r.amount)}</strong>
                      <small>Contrato {money(r.contract)}</small>
                    </td>
                    {display("Parcela") && <td>{money(r.installment)}</td>}
                    <td>
                      <StatusBadge label={r.status} color={r.color} />
                    </td>
                    {display("Data") && (
                      <td>
                        {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    )}
                    <td>
                      <button
                        className="s2-button"
                        aria-label={`Abrir detalhes ${r.ade}`}
                        onClick={() => open(r)}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="p2-pagination">
          <span>
            {filtered.length ? currentPage * 8 + 1 : 0}–
            {Math.min((currentPage + 1) * 8, filtered.length)} de{" "}
            {filtered.length} · registros fictícios
          </span>
          <div className="p2-actions">
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
              disabled={(currentPage + 1) * 8 >= filtered.length}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
function ProposalCard({ row: r, open }: { row: GalleryRow; open: () => void }) {
  return (
    <button className="p2-proposal-card" onClick={open}>
      <div>
        <strong>{r.ade}</strong>
        <span className={r.priority === "Alta" ? "p2-warning" : ""}>
          {r.priority}
        </span>
      </div>
      <h3>{r.client}</h3>
      <p>
        {r.bank} · {r.product}
      </p>
      <StatusBadge label={r.status} color={r.color} />
      <strong className="p2-money">{money(r.amount)}</strong>
      <footer>
        <span>{r.partner}</span>
        <span>
          <Clock3 size={12} />
          {r.elapsed}
        </span>
      </footer>
    </button>
  );
}
export function GalleryKanban({ open }: { open: (r: GalleryRow) => void }) {
  return (
    <div>
      <header className="p2-page-header">
        <div>
          <div className="s2-eyebrow">PRODUÇÃO / OPERATION FLOW</div>
          <h1>Esteira Operacional</h1>
          <p>
            Etapas ilustrativas do fluxo de contratação · movimentação
            desativada
          </p>
        </div>
        <StatusBadge label="Demonstração · sem persistência" color="#06b6d4" />
      </header>
      <div className="p2-kanban">
        {galleryStatuses.map((s, i) => {
          const rows = galleryRows.filter(
            (r) => r.statusId === `demo-status-${i}`,
          );
          return (
            <section
              key={s.name}
              style={{ "--accent": s.color } as React.CSSProperties}
            >
              <header>
                <h2>
                  <i />
                  {s.name}
                </h2>
                <strong>{rows.length}</strong>
                <p>
                  {money(rows.reduce((sum, r) => sum + (r.amount || 0), 0))}
                </p>
              </header>
              {rows.slice(0, 4).map((r) => (
                <ProposalCard row={r} key={r.id} open={() => open(r)} />
              ))}
              <small>+ {rows.length - 4} propostas de exemplo</small>
            </section>
          );
        })}
      </div>
    </div>
  );
}
export function GalleryClient({ open }: { open: (r: GalleryRow) => void }) {
  const [tab, setTab] = useState("Visão geral");
  const rows = galleryRows.filter((r) => r.client === "Marina Exemplo");
  return (
    <div>
      <header className="p2-page-header">
        <div>
          <div className="s2-eyebrow">
            RELACIONAMENTO / CUSTOMER INTELLIGENCE
          </div>
          <h1>Cliente 360°</h1>
          <p>Relacionamentos, carteira e histórico em uma única visão.</p>
        </div>
      </header>
      <section className="p2-panel p2-customer">
        <div className="p2-detail-hero">
          <span className="p2-avatar large">ME</span>
          <div>
            <h2>Marina Exemplo</h2>
            <p>***.***.***-** · pessoa fictícia</p>
            <StatusBadge label="Carteira demonstrativa" color="#06b6d4" />
          </div>
          <div className="p2-customer-totals">
            <span>
              <small>Propostas / ADEs</small>
              <strong>
                {rows.length} / {rows.length}
              </strong>
            </span>
            <span>
              <small>Carteira contratada</small>
              <strong>
                {money(rows.reduce((s, r) => s + (r.contract || 0), 0))}
              </strong>
            </span>
          </div>
        </div>
        <div className="p2-tabs" role="tablist" aria-label="Cliente 360">
          {[
            "Visão geral",
            "Propostas",
            "Contratos",
            "Timeline",
            "Documentos",
            "Comunicações",
            "Notas",
          ].map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </section>
      <div className="p2-customer-content">
        <section className="p2-panel">
          <SectionHeader
            title={
              tab === "Visão geral" ? "Propostas e contratos vinculados" : tab
            }
          />
          {["Visão geral", "Propostas", "Contratos"].includes(tab) ? (
            rows.map((r) => (
              <button
                className="p2-client-proposal"
                key={r.id}
                onClick={() => open(r)}
              >
                <FileText size={20} />
                <span>
                  <strong>{r.ade}</strong>
                  <small>
                    {r.bank} · {r.product}
                  </small>
                </span>
                <strong>{money(r.contract)}</strong>
                <StatusBadge label={r.status} color={r.color} />
                <ArrowUpRight size={15} />
              </button>
            ))
          ) : tab === "Timeline" ? (
            <ActivityTimeline />
          ) : (
            <EmptyState
              title={`${tab} · prévia visual`}
              detail="Sem alteração de cadastro, documentos ou comunicações."
            />
          )}
        </section>
        <section className="p2-panel">
          <SectionHeader
            title="Linha do relacionamento"
            subtitle="Eventos de exemplo"
          />
          <ActivityTimeline />
          <div className="p2-security-note">
            <ShieldCheck size={19} />
            <span>
              Dados fictícios e CPF mascarado
              <br />
              <small>Nenhum cadastro real consultado</small>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
export function GallerySimulations({
  explain,
}: {
  explain: (s: string) => void;
}) {
  const [tab, setTab] = useState("Solicitações"),
    [step, setStep] = useState(1),
    [bank, setBank] = useState("Daycoval"),
    [state, setState] = useState("Ofertas");
  return (
    <div>
      <header className="p2-page-header">
        <div>
          <div className="s2-eyebrow">PRODUÇÃO / FINANCIAL SIMULATION</div>
          <h1>Central de Simulações</h1>
          <p>Solicitações, condições e resultados com contexto operacional.</p>
        </div>
        <button className="s2-button primary" onClick={() => setStep(1)}>
          <Plus size={15} />
          Nova simulação · demo
        </button>
      </header>
      <div className="p2-tabs" role="tablist" aria-label="Áreas de simulação">
        {[
          "Solicitações",
          "Fila de Digitação",
          "Resultados e Parceiros",
          "PORT + REFIN — Planilhas",
          "Simuladores bancários",
        ].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Fila de Digitação" || tab === "Resultados e Parceiros" ? (
        <section className="p2-panel">
          <SectionHeader
            title={tab}
            subtitle="Registros ilustrativos · nenhum envio bancário"
          />
          {galleryRows.slice(0, 5).map((r) => (
            <div className="p2-client-proposal" key={r.id}>
              <Users size={18} />
              <span>
                <strong>{r.client}</strong>
                <small>
                  {r.partner} · {r.product}
                </small>
              </span>
              <StatusBadge
                label={
                  tab === "Fila de Digitação"
                    ? "Aguardando digitação"
                    : "Condições disponíveis"
                }
                color="#06b6d4"
              />
            </div>
          ))}
        </section>
      ) : (
        <div className="p2-simulation">
          <section className="p2-panel">
            <SectionHeader
              title={
                tab === "PORT + REFIN — Planilhas"
                  ? "Portabilidade + Refinanciamento"
                  : "Simulação INSS"
              }
              subtitle="Formulário demonstrativo · sem cálculo financeiro"
            />
            {tab === "PORT + REFIN — Planilhas" && (
              <div className="p2-tabs">
                {["Daycoval", "C6", "Paraná"].map((b) => (
                  <button
                    key={b}
                    aria-pressed={bank === b}
                    onClick={() => setBank(b)}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
            <div className="p2-stepper">
              {["Cliente", "Contratos", "Condições"].map((s, i) => (
                <button
                  key={s}
                  aria-pressed={step === i + 1}
                  onClick={() => setStep(i + 1)}
                >
                  <b>{i + 1}</b>
                  {s}
                </button>
              ))}
            </div>
            <div className="p2-form-grid">
              {step === 1 ? (
                <>
                  <label>
                    Cliente
                    <input value="Marina Exemplo" readOnly />
                  </label>
                  <label>
                    CPF
                    <input value="***.***.***-**" readOnly />
                  </label>
                  <label>
                    Parceiro
                    <select>
                      <option>Parceiro Aurora · exemplo</option>
                    </select>
                  </label>
                  <label>
                    Convênio
                    <select>
                      <option>INSS</option>
                    </select>
                  </label>
                </>
              ) : step === 2 ? (
                <>
                  <label>
                    Saldo devedor (exemplo)
                    <input defaultValue="6.900,00" />
                  </label>
                  <label>
                    Parcela atual (exemplo)
                    <input defaultValue="182,40" />
                  </label>
                  <label>
                    Parcelas restantes
                    <input defaultValue="42" />
                  </label>
                  <label>
                    Contrato
                    <input value="CONTRATO DEMO" readOnly />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Prazo
                    <select>
                      <option>108 meses · exemplo</option>
                    </select>
                  </label>
                  <label>
                    Taxa (exemplo)
                    <select>
                      {Array.from({ length: 26 }, (_, i) => (
                        <option key={i}>
                          {(1.85 - i / 100).toFixed(2).replace(".", ",")}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estado do resultado
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    >
                      <option>Ofertas</option>
                      <option>Inviável</option>
                      <option>Carregando</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="p2-security-note">
              <ShieldCheck size={19} />
              <span>
                {tab === "PORT + REFIN — Planilhas"
                  ? `${bank} · planilha ilustrativa`
                  : "Regras e integrações preservadas"}
                <br />
                <small>
                  Não altera taxas, elegibilidade ou versões de planilhas.
                </small>
              </span>
            </div>
            <button
              className="s2-button primary"
              onClick={() =>
                step < 3
                  ? setStep(step + 1)
                  : explain(
                      "Comparação de ofertas fictícias. Nenhuma simulação bancária ou fórmula de planilha foi executada.",
                    )
              }
            >
              {step < 3 ? "Continuar" : "Comparar exemplos"}
              <ArrowUpRight size={15} />
            </button>
            <div className="p2-simulation-history">
              <SectionHeader
                title="Histórico da simulação"
                subtitle="Eventos ilustrativos · sem transmissão ao banco"
              />
              <ActivityTimeline />
            </div>
          </section>
          <section className="p2-panel">
            <SectionHeader
              title="Comparação de ofertas"
              subtitle="Exemplos visuais · não são condições de contratação"
            />
            {state === "Inviável" ? (
              <EmptyState
                title="Nenhuma condição elegível"
                detail="Estado demonstrativo de inviabilidade; não é uma decisão de crédito."
              />
            ) : state === "Carregando" ? (
              <div className="p2-loading" aria-busy="true">
                <div className="p2-skeleton" />
                <div className="p2-skeleton" />
              </div>
            ) : (
              ["C6 Bank", "FACTA", "FINANTO"].map((b, i) => (
                <div className="p2-offer" key={b}>
                  <div>
                    <strong>{b}</strong>
                    <StatusBadge
                      label="Exemplo"
                      color={["#06b6d4", "#8b5cf6", "#10b981"][i]}
                    />
                  </div>
                  <strong>{money(6900 + i * 250)}</strong>
                  <div>
                    <span>
                      Parcela
                      <br />
                      <b>{money(182.4 + i * 8)}</b>
                    </span>
                    <span>
                      Prazo
                      <br />
                      <b>108 meses</b>
                    </span>
                    <span>
                      Taxa
                      <br />
                      <b>1,85% · demo</b>
                    </span>
                  </div>
                  <button
                    className="s2-button"
                    onClick={() =>
                      explain(
                        "Oferta fictícia selecionada. Não inclui ou contrata proposta.",
                      )
                    }
                  >
                    Selecionar exemplo
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
