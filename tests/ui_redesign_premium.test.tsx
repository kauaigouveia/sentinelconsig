import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  permittedWorkTabs,
  WorkTabs,
} from "../src/components/redesign/WorkTabs";
import { PreviewDashboard } from "../src/components/redesign/PreviewDashboard";
import { PreviewSidebar } from "../src/components/redesign/PreviewSidebar";
import {
  GalleryProposals,
  GalleryKanban,
  GalleryClient,
  GallerySimulations,
} from "../src/components/redesign/GalleryWorkspaces";
import { galleryRows } from "../src/components/redesign/galleryFixtures";
import { PremiumStatCard } from "../src/components/redesign/PremiumPrimitives";
import { FileText } from "lucide-react";
const noop = () => {};
describe("Premium V2 isolado de APIs e banco", () => {
  it("limita abas a seis rotas autorizadas e não inclui detalhes ou portal", () => {
    const tabs = permittedWorkTabs(
      [
        "/propostas",
        "/empresas-assinaturas",
        "/propostas/cliente-id",
        "/parceiro",
        "/simulacoes",
        "/clientes",
        "/esteira",
        "/portabilidade",
        "/central-pendencias",
        "/minha-fila",
      ],
      "MASTER",
    );
    expect(tabs).toHaveLength(6);
    expect(
      tabs.some(
        (t) =>
          t.path.startsWith("/parceiro") ||
          t.path === "/empresas-assinaturas" ||
          t.isDynamic,
      ),
    ).toBe(false);
    expect(
      permittedWorkTabs(["/integracoes", "/propostas"], "MASTER", [
        "proposals.view",
      ]).map((t) => t.path),
    ).toEqual(["/propostas"]);
  });
  it("não apresenta fontes fictícias no dashboard autenticado", () => {
    const html = renderToStaticMarkup(
      <PreviewDashboard
        rows={[]}
        bottlenecks={null}
        role="MASTER"
        name="Teste"
        navigate={noop}
        openProposal={noop}
      />,
    );
    expect(html).toContain("Pendências abertas");
    expect(html).toContain("Fonte indisponível nesta prévia");
    expect(html).not.toContain("12 registros de pendência");
    expect(html).not.toContain("Valor pago · fixture");
    expect(html).not.toContain("Marina Exemplo");
  });
  it("preserva filtros de permissão nos atalhos da sidebar e nas abas", () => {
    const html = renderToStaticMarkup(
      <PreviewSidebar
        role="MASTER"
        permissions={["proposals.view"]}
        path="/propostas"
        navigate={noop}
        favorites={["/empresas-assinaturas", "/propostas"]}
        recent={["/integracoes"]}
      />,
    );
    expect(html).toContain("Favoritos");
    expect(html).not.toContain("Empresas &amp; Assinaturas");
    expect(html).not.toContain("Hub de Integrações");
    const tabs = renderToStaticMarkup(
      <WorkTabs
        path="/propostas"
        recent={["/integracoes"]}
        role="MASTER"
        permissions={["proposals.view"]}
        navigate={noop}
      />,
    );
    expect(tabs).not.toContain("Integrações");
  });
  it("mostra controles de produção demonstrativos sem encaminhar ao legado", () => {
    const html = renderToStaticMarkup(
      <GalleryProposals navigate={noop} open={noop} explain={noop} />,
    );
    for (const label of [
      "Importar Excel",
      "Exportar exemplos",
      "Ações em lote",
      "Filtros avançados",
      "Colunas",
      "Kanban",
      "Nova proposta",
      "Página 1",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("Todas as ações e campos");
    expect(html).toContain("***.***.***-**");
  });
  it("kanban, cliente e simulação são representações sem handlers de escrita", () => {
    const kanban = renderToStaticMarkup(<GalleryKanban open={noop} />);
    expect(kanban).toContain("sem persistência");
    expect(kanban).not.toContain("draggable");
    const client = renderToStaticMarkup(<GalleryClient open={noop} />);
    expect(client).toContain("Marina Exemplo");
    expect(client).toContain("Timeline");
    expect(client).toContain("DEMO 1031");
    const simulation = renderToStaticMarkup(
      <GallerySimulations explain={noop} />,
    );
    expect(simulation).toContain("sem cálculo financeiro");
    expect(simulation).toContain("Planilhas");
  });
  it("fixtures são explícitas, mascaradas e não usadas como documentos reais", () => {
    expect(galleryRows).toHaveLength(36);
    expect(
      galleryRows.every(
        (r) =>
          r.id.startsWith("visual-") &&
          r.ade.startsWith("DEMO") &&
          r.cpf === "***.***.***-**",
      ),
    ).toBe(true);
  });
  it("indicadores oferecem estados de erro, vazio e loading", () => {
    const props = {
      label: "Teste",
      value: 42,
      detail: "Contexto",
      color: "#06b6d4",
      icon: FileText,
      definition: "Fonte",
    };
    expect(
      renderToStaticMarkup(<PremiumStatCard {...props} state="error" />),
    ).toContain("Não foi possível carregar");
    expect(
      renderToStaticMarkup(<PremiumStatCard {...props} state="empty" />),
    ).not.toContain(">42<");
    expect(
      renderToStaticMarkup(<PremiumStatCard {...props} state="loading" />),
    ).toContain('aria-busy="true"');
  });
});
