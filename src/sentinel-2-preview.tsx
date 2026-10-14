import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, Sun, Moon, Search, Menu, ChevronDown, Star } from "lucide-react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { PreviewSidebar } from "./components/redesign/PreviewSidebar";
import { PreviewDashboard } from "./components/redesign/PreviewDashboard";
import { PreviewProposals } from "./components/redesign/PreviewProposals";
import { PreviewSearch } from "./components/redesign/PreviewSearch";
import type { PreviewRow } from "./components/redesign/PreviewData";
import "./index.css";
import "./styles/sentinel-2-preview.css";
const exampleRows: PreviewRow[] = [
  {
    id: "design-example-1",
    ade: "EXEMPLO 001",
    client: "Cliente de exemplo",
    cpf: "",
    bank: "C6 Bank",
    partner: "Parceiro de exemplo",
    product: "Novo",
    status: "Aguardar formalização",
    statusId: "visual-formalizacao",
    color: "#8b5cf6",
    amount: null,
    contract: null,
    createdAt: "2026-10-13T12:00:00Z",
    active: true,
    paid: false,
    pending: false,
  },
  {
    id: "design-example-2",
    ade: "EXEMPLO 002",
    client: "Segundo exemplo visual",
    cpf: "",
    bank: "FACTA",
    partner: "Parceiro de exemplo",
    product: "Portabilidade",
    status: "Aguardar retorno CIP",
    statusId: "visual-cip",
    color: "#06b6d4",
    amount: null,
    contract: null,
    createdAt: "2026-10-12T12:00:00Z",
    active: true,
    paid: false,
    pending: false,
  },
];
function Preview() {
  const { isDark, toggleTheme } = useTheme(),
    [path, setPath] = useState("/"),
    [search, setSearch] = useState(false),
    [mobile, setMobile] = useState(false),
    [message, setMessage] = useState(""),
    [examples, setExamples] = useState(false),
    [favorite, setFavorite] = useState(false);
  const navigate = (next: string) => {
    setPath(next);
    setMessage("");
    setSearch(false);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
      if (e.key === "Escape") setMessage("");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="sentinel-app s2-root flex w-screen overflow-hidden">
      <PreviewSidebar
        role="PLATFORM_MASTER"
        path={path}
        navigate={navigate}
        mobileOpen={mobile}
        closeMobile={() => setMobile(false)}
      />
      <div className="sentinel-stage flex flex-1 flex-col min-w-0 overflow-hidden">
        <header className="sentinel-header flex items-center justify-between shrink-0">
          <button
            className="s2-button s2-mobile-trigger"
            aria-label="Abrir navegação"
            onClick={() => setMobile(true)}
          >
            <Menu size={17} />
          </button>
          <label className="s2-company-selector">
            <span>EMPRESA ATUAL</span>
            <select aria-label="Selecionar empresa">
              <option>Sentinel Consig · prévia</option>
            </select>
          </label>
          <div className="flex-1 min-w-0 max-w-xl">
            <button
              className="s2-global-search"
              aria-label="Abrir busca universal"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Buscar páginas, cliente, CPF ou ADE</span>
              <kbd>Ctrl K</kbd>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="s2-button"
              aria-label="Notificações"
              onClick={() =>
                setMessage(
                  "As notificações reais dependem da sessão autenticada.",
                )
              }
            >
              <Bell size={16} />
            </button>
            <button
              className="s2-button"
              aria-label="Alternar tema"
              onClick={toggleTheme}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="s2-button"
              aria-label="Menu do usuário (prévia)"
              onClick={() =>
                setMessage(
                  "Prévia visual local, sem login nem acesso ao banco.",
                )
              }
            >
              <span>Prévia visual</span>
              <ChevronDown size={12} />
            </button>
          </div>
        </header>
        <main
          id="sentinel-main"
          className="sentinel-main flex-1 overflow-y-auto"
        >
          <div className="s2-preview-notice">
            <span>AVALIAÇÃO VISUAL · SEM SESSÃO · SEM CONSULTAS À API</span>
            <button
              className="s2-text-button"
              aria-pressed={favorite}
              onClick={() => setFavorite((v) => !v)}
            >
              <Star size={13} />
              {favorite ? "Favoritado" : "Favoritar página"}
            </button>
          </div>
          {path === "/" || path === "/dashboard" ? (
            <PreviewDashboard
              rows={[]}
              bottlenecks={null}
              name="equipe"
              navigate={navigate}
              openProposal={() => {}}
            />
          ) : path === "/propostas" ? (
            <>
              <div className="s2-preview-notice">
                <label>
                  <input
                    type="checkbox"
                    checked={examples}
                    onChange={(e) => setExamples(e.target.checked)}
                  />{" "}
                  Mostrar exemplos visuais, sem dados financeiros ou cadastro no
                  sistema
                </label>
              </div>
              <PreviewProposals
                rows={examples ? exampleRows : []}
                openProposal={() =>
                  setMessage(
                    "Este registro é um exemplo visual. No sistema autenticado, a ação abre o detalhe existente da proposta.",
                  )
                }
                fullView={() =>
                  setMessage(
                    "Na aplicação autenticada, este botão abre a tela atual, com todos os campos, importação, exportação e ações em lote.",
                  )
                }
              />
            </>
          ) : (
            <section className="s2-panel">
              <div className="s2-eyebrow">DESTINO PRESERVADO</div>
              <h1>{path}</h1>
              <p className="s2-muted">
                Este módulo mantém sua implementação atual no ambiente
                autenticado. A migração visual aguarda aprovação.
              </p>
              <button className="s2-button" onClick={() => navigate("/")}>
                Voltar ao dashboard
              </button>
            </section>
          )}
        </main>
        <footer className="s2-preview-footer">
          Branch de desenvolvimento · catálogo de navegação ilustrativo ·
          nenhuma sessão simulada
        </footer>
      </div>
      {search && (
        <PreviewSearch
          role="PLATFORM_MASTER"
          rows={[]}
          recent={["/", "/propostas", "/simulacoes"]}
          favorites={favorite ? [path] : []}
          navigate={navigate}
          openProposal={() => {}}
          close={() => setSearch(false)}
        />
      )}{" "}
      {message && (
        <div className="s2-search-backdrop">
          <div className="s2-search-dialog">
            <div className="s2-empty">
              <h3>Avaliação visual</h3>
              <p>{message}</p>
              <button className="s2-button mt-4" onClick={() => setMessage("")}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
if ((import.meta as any).env.DEV) {
  const hot = (import.meta as any).hot;
  const root = hot?.data.root || createRoot(document.getElementById("root")!);
  if (hot) hot.data.root = root;
  root.render(
    <ThemeProvider>
      <Preview />
    </ThemeProvider>,
  );
} else
  document.getElementById("root")!.textContent =
    "Prévia disponível somente em desenvolvimento.";
