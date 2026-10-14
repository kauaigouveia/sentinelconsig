import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  Sun,
  Moon,
  Search,
  Menu,
  ChevronDown,
  Star,
  Plus,
  Settings,
} from "lucide-react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { PreviewSidebar } from "./components/redesign/PreviewSidebar";
import { PreviewDashboard } from "./components/redesign/PreviewDashboard";
import { PreviewSearch } from "./components/redesign/PreviewSearch";
import { WorkTabs } from "./components/redesign/WorkTabs";
import { DetailDrawer } from "./components/redesign/PremiumPrimitives";
import {
  GalleryProposals,
  GalleryKanban,
  GalleryClient,
  GallerySimulations,
  GalleryDetail,
} from "./components/redesign/GalleryWorkspaces";
import {
  galleryRows,
  type GalleryRow,
} from "./components/redesign/galleryFixtures";
import { visibleNavigation } from "./components/redesign/navigation";
import "./index.css";
import "./styles/sentinel-2-preview.css";
function currentPath() {
  const path = new URLSearchParams(window.location.search).get("view") || "/";
  return visibleNavigation("PLATFORM_MASTER").some((r) => r.path === path)
    ? path
    : "/";
}
function Preview() {
  const { isDark, toggleTheme } = useTheme();
  const [path, setPath] = useState(currentPath),
    [search, setSearch] = useState(false),
    [mobile, setMobile] = useState(false),
    [message, setMessage] = useState(""),
    [favorites, setFavorites] = useState(["/propostas"]),
    [recent, setRecent] = useState([
      "/",
      "/propostas",
      "/simulacoes",
      "/clientes",
      "/esteira",
    ]),
    [detail, setDetail] = useState<GalleryRow | null>(null);
  const navigate = (next: string) => {
    if (!visibleNavigation("PLATFORM_MASTER").some((r) => r.path === next))
      return;
    setPath(next);
    setRecent((v) => [next, ...v.filter((p) => p !== next)].slice(0, 6));
    setMessage("");
    setDetail(null);
    setSearch(false);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState({}, "", url);
  };
  useEffect(() => {
    const pop = () => {
      setPath(currentPath());
      setDetail(null);
      setMessage("");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const open = (row: GalleryRow) => setDetail(row);
  useEffect(() => {
    document.getElementById("sentinel-main")?.scrollTo({ top: 0 });
  }, [path]);
  const title = visibleNavigation("PLATFORM_MASTER").find(
    (r) => r.path === path,
  )?.title;
  return (
    <div className="sentinel-app s2-root flex w-screen overflow-hidden">
      <PreviewSidebar
        role="PLATFORM_MASTER"
        path={path}
        navigate={navigate}
        mobileOpen={mobile}
        closeMobile={() => setMobile(false)}
        favorites={favorites}
        recent={recent}
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
            <span>AMBIENTE DEMONSTRATIVO</span>
            <select aria-label="Selecionar empresa">
              <option>Sentinel Consig · galeria</option>
            </select>
          </label>
          <div className="flex-1 min-w-0 max-w-xl">
            <button
              className="s2-global-search"
              aria-label="Abrir busca universal"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Buscar páginas, clientes, ADE ou parceiros</span>
              <kbd>Ctrl K</kbd>
            </button>
          </div>
          <div className="p2-actions">
            <button
              className="s2-button p2-desktop-only"
              aria-label="Ações rápidas"
              onClick={() =>
                setMessage(
                  "Ações rápidas demonstrativas: novas propostas e simulações preservam os formulários reais.",
                )
              }
            >
              <Plus size={16} />
            </button>
            <button
              className="s2-button"
              aria-label="Notificações"
              onClick={() =>
                setMessage(
                  "Galeria sem sessão e sem notificações reais. Nenhum incidente é apresentado como alerta operacional.",
                )
              }
            >
              <Bell size={16} />
            </button>
            <button
              className="s2-button"
              aria-label="Favoritar página"
              aria-pressed={favorites.includes(path)}
              onClick={() =>
                setFavorites((v) =>
                  v.includes(path)
                    ? v.filter((p) => p !== path)
                    : [...v, path].slice(-12),
                )
              }
            >
              <Star size={16} />
            </button>
            <button
              className="s2-button"
              aria-label="Alternar tema"
              onClick={toggleTheme}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="s2-button p2-desktop-only"
              aria-label="Preferências da galeria"
              onClick={() =>
                setMessage(
                  "Tema, favoritos, abas e densidade podem ser avaliados nesta galeria. As preferências aqui não representam uma sessão de empresa.",
                )
              }
            >
              <Settings size={16} />
            </button>
            <button
              className="s2-button p2-profile"
              aria-label="Menu do usuário (prévia)"
              onClick={() =>
                setMessage(
                  "Identidade ilustrativa. Nenhum usuário ou perfil real foi autenticado.",
                )
              }
            >
              <span className="p2-avatar">PV</span>
              <span>Prévia visual</span>
              <ChevronDown size={12} />
            </button>
          </div>
        </header>
        <WorkTabs
          path={path}
          recent={recent}
          role="PLATFORM_MASTER"
          navigate={navigate}
        />
        <main
          id="sentinel-main"
          className="sentinel-main flex-1 overflow-y-auto"
        >
          <div className="s2-preview-notice">
            <span>
              <b>PRÉVIA VISUAL V2</b> · Dados, pessoas, valores e estados
              fictícios · sem sessão / sem APIs
            </span>
            <span className="p2-desktop-only">{title}</span>
          </div>
          {path === "/" || path === "/dashboard" ? (
            <PreviewDashboard
              demo
              rows={galleryRows}
              bottlenecks={null}
              role="PLATFORM_MASTER"
              name="equipe"
              navigate={navigate}
              openProposal={(id) => {
                const row = galleryRows.find((r) => r.id === id);
                if (row) open(row);
              }}
              newProposal={() =>
                setMessage(
                  "Criação demonstrativa. Nenhum registro será incluído.",
                )
              }
            />
          ) : path === "/propostas" ? (
            <GalleryProposals
              navigate={navigate}
              open={open}
              explain={setMessage}
            />
          ) : path === "/esteira" ? (
            <GalleryKanban open={open} />
          ) : path === "/clientes" ? (
            <GalleryClient open={open} />
          ) : path === "/simulacoes" ? (
            <GallerySimulations explain={setMessage} />
          ) : (
            <section className="p2-panel">
              <div className="s2-eyebrow">FLUXO AINDA NÃO MIGRADO</div>
              <h1>{title}</h1>
              <p className="s2-muted">
                Este destino mantém sua implementação atual na aplicação
                autenticada. A migração depende da aprovação visual.
              </p>
              <button className="s2-button" onClick={() => navigate("/")}>
                Visão da Operação
              </button>
            </section>
          )}
        </main>
        <footer className="s2-preview-footer">
          <span className="p2-live-dot" />
          GALERIA DE DESENVOLVIMENTO · DADOS FICTÍCIOS · sem realtime ou
          operações financeiras
        </footer>
      </div>
      {search && (
        <PreviewSearch
          role="PLATFORM_MASTER"
          rows={galleryRows}
          recent={recent}
          favorites={favorites}
          navigate={navigate}
          openProposal={(id) => {
            const row = galleryRows.find((r) => r.id === id);
            if (row) open(row);
            setSearch(false);
          }}
          close={() => setSearch(false)}
        />
      )}
      {detail && (
        <GalleryDetail
          key={detail.id}
          row={detail}
          close={() => setDetail(null)}
        />
      )}
      {message && (
        <DetailDrawer title="Demonstração visual" close={() => setMessage("")}>
          <div className="p2-detail-body">
            <p>{message}</p>
            <button className="s2-button" onClick={() => setMessage("")}>
              Entendido
            </button>
          </div>
        </DetailDrawer>
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
