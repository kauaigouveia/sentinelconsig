import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_ROUTES, canAccessRoute } from "../src/router/routes";
import {
  visibleNavigation,
  navigationGroup,
} from "../src/components/redesign/navigation";
import { PreviewDashboard } from "../src/components/redesign/PreviewDashboard";
import {
  PreviewProposals,
  filterPreviewRows,
} from "../src/components/redesign/PreviewProposals";
import { PreviewSidebar } from "../src/components/redesign/PreviewSidebar";
import { PreviewSearch } from "../src/components/redesign/PreviewSearch";
import type { PreviewRow } from "../src/components/redesign/PreviewData";
import type { Role } from "../src/types";
const rows: PreviewRow[] = [
  {
    id: "fixture-a",
    ade: "ADE-100",
    client: "Fixture Alfa",
    cpf: "00000000000",
    bank: "C6",
    partner: "Parceiro A",
    product: "Novo",
    status: "Pendente",
    statusId: "pending",
    color: "#f59e0b",
    amount: null,
    contract: 100,
    createdAt: "2026-10-13T12:00:00Z",
    active: true,
    paid: false,
    pending: true,
  },
  {
    id: "fixture-b",
    ade: "ADE-200",
    client: "Fixture Beta",
    cpf: "11111111111",
    bank: "FACTA",
    partner: "Parceiro B",
    product: "Refin",
    status: "Pago",
    statusId: "paid",
    color: "#10b981",
    amount: 50,
    contract: 200,
    createdAt: "2026-10-12T12:00:00Z",
    active: false,
    paid: true,
    pending: false,
  },
];
const noop = () => {};
describe("Prévia visual 2.0 sem banco ou APIs", () => {
  it("aplica a marca oficial e mantém a sidebar renderizável sem sessão de navegador", () => {
    const html = renderToStaticMarkup(
      <PreviewSidebar role="DIGITADOR" path="/propostas" navigate={noop} />,
    );
    expect(html).toContain("/branding/sentinel-consig-symbol.svg");
    expect(html).not.toContain("sentinel-mark-v2");
    expect(html).toContain("Recolher sidebar");
    expect(html).not.toContain("Central de Administração");
  });

  it("mantém cada destino estático autorizado do catálogo em todos os papéis", () => {
    const roles: Role[] = [
      "PLATFORM_MASTER",
      "MASTER",
      "TENANT_ADMIN",
      "GESTOR",
      "GERENTE",
      "SUPORTE",
      "DIGITADOR",
      "SIMULACAO",
    ];
    for (const role of roles) {
      const expected = APP_ROUTES.filter(
        (r) =>
          !r.isDynamic &&
          r.category !== "Portal do Parceiro" &&
          r.path !== "/dashboard" &&
          canAccessRoute(r, role, []),
      ).map((r) => r.path);
      expect(
        visibleNavigation(role)
          .map((r) => r.path)
          .sort(),
      ).toEqual(expected.sort());
    }
  });
  it("permissões customizadas substituem o perfil sem liberar administração", () => {
    const paths = visibleNavigation("MASTER", ["proposals.view"]).map(
      (r) => r.path,
    );
    expect(paths).toContain("/propostas");
    expect(paths).not.toContain("/central-administracao");
    expect(paths).not.toContain("/integracoes");
  });
  it("mantém o portal separado e os grupos aprovados", () => {
    expect(
      visibleNavigation("PLATFORM_MASTER").some((r) =>
        r.path.startsWith("/parceiro"),
      ),
    ).toBe(false);
    expect(navigationGroup("/central-atendimento", "Operação")).toBe(
      "Relacionamento",
    );
    expect(navigationGroup("/financeiro-geral", "Gestão")).toBe("Financeiro");
    expect(navigationGroup("/command-center", "Gestão")).toBe("Gestão");
  });
  it("filtra por cliente, CPF, ADE, banco e status sem mutar dados", () => {
    expect(filterPreviewRows(rows, "ADE-100", "", "").map((r) => r.id)).toEqual(
      ["fixture-a"],
    );
    expect(
      filterPreviewRows(rows, "111.111.111-11", "", "").map((r) => r.id),
    ).toEqual(["fixture-b"]);
    expect(filterPreviewRows(rows, "", "C6", "pending")).toHaveLength(1);
    expect(filterPreviewRows(rows, "", "C6", "paid")).toHaveLength(0);
    expect(rows).toHaveLength(2);
  });
  it("não inventa valor liberado ausente e mantém acesso completo ao legado", () => {
    const html = renderToStaticMarkup(
      <PreviewProposals rows={[rows[0]]} openProposal={noop} fullView={noop} />,
    );
    expect(html).toContain("ADE-100");
    expect(html).toContain("Todas as ações e campos");
    expect(html).toContain("Abrir proposta ADE-100");
    expect(html).toContain("100,00");
    expect(html).toContain("—");
    expect(html).not.toContain("R$ 0,00");
  });
  it("usa indicadores da carteira e distingue volume de propostas pagas", () => {
    const html = renderToStaticMarkup(
      <PreviewDashboard
        rows={rows}
        bottlenecks={null}
        role="MASTER"
        name="Fixture"
        navigate={noop}
        openProposal={noop}
      />,
    );
    expect(html).toContain("Volume liberado · pagas");
    expect(html).toContain("50,00");
    expect(html).toContain("Prioridades da operação");
    expect(html).toContain("Não é o Command Center de incidentes");
    expect(html).toContain("Fixture");
  });
  it("mantém vazio explicativo e não oferece ação sem permissão", () => {
    const html = renderToStaticMarkup(
      <PreviewDashboard
        rows={[]}
        bottlenecks={null}
        role="DIGITADOR"
        name="Fixture"
        navigate={noop}
        openProposal={noop}
      />,
    );
    expect(html).toContain("Nenhuma proposta nesta fila");
    expect(html).not.toContain("Nova simulação");
    expect(html).not.toContain("Atender parceiros");
  });
  it("filtra favoritos e recentes pela permissão atual da paleta", () => {
    const html = renderToStaticMarkup(
      <PreviewSearch
        role="MASTER"
        permissions={["proposals.view"]}
        rows={[]}
        favorites={["/central-administracao", "/propostas"]}
        recent={["/integracoes"]}
        navigate={noop}
        openProposal={noop}
        close={noop}
      />,
    );
    expect(html).toContain("Propostas");
    expect(html).not.toContain("Central de Administração");
    expect(html).not.toContain("Hub de Integrações");
    expect(html).toContain("dialog");
  });
});
