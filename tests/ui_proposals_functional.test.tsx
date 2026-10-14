// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { hasPermission } from "../src/lib/permissions";
import {
  ProductionWorkspace,
  paginateProduction,
} from "../src/components/production/ProductionWorkspace";
const fx = vi.hoisted(() => {
  const statuses = [
    {
      id: "s",
      name: "Aguardar formalização",
      code: "FORMAL",
      color: "#06b6d4",
      responsible: "BANCO",
    },
  ];
  return {
    scope: "unit-A",
    user: { id: "unit-user", role: "MASTER", customPermissions: [] } as any,
    rows: Array.from({ length: 30 }, (_, i) => ({
      id: `unit-${i}`,
      proposalNumber: `UNIT-${1000 + i}`,
      clientId: "unit-client",
      tenantId: "unit-A",
      bankId: i % 2 ? "b2" : "b1",
      promoterId: "pr",
      productId: "prod",
      partnerId: "pa",
      statusId: "s",
      disbursedValue: 100 + i,
      contractBalance: 40,
      installmentValue: 20,
      installmentsCount: 84,
      currentResponsible: "BANCO",
      createdAt: "2026-10-14T12:00:00Z",
    })),
    statuses,
    clients: [
      {
        id: "unit-client",
        fullName: "Pessoa sintética do teste",
        cpf: "00000000000",
      },
    ],
    banks: [
      { id: "b1", name: "Banco Local A" },
      { id: "b2", name: "Banco Local B" },
    ],
    products: [{ id: "prod", name: "Produto de teste" }],
    promoters: [{ id: "pr", name: "Promotora de teste" }],
    partners: [{ id: "pa", login: "UNIT-P", fullName: "Parceiro sintético" }],
    users: [{ id: "unit-user", name: "Operador de teste" }],
    deleteProposal: vi.fn(),
    deleteProposals: vi.fn(),
  };
});
vi.mock("../src/services/storageService", () => ({
  StorageService: {
    getActiveUser: () => fx.user,
    getCurrentTenantId: () => fx.scope,
    getProposals: () => fx.rows,
    getClients: () => fx.clients,
    getBanks: () => fx.banks,
    getPromoters: () => fx.promoters,
    getProducts: () => fx.products,
    getPartners: () => fx.partners,
    getStatuses: () => fx.statuses,
    getUsers: () => fx.users,
    fetchAndSyncStatuses: () => Promise.resolve(fx.statuses),
    deleteProposal: fx.deleteProposal,
    deleteProposals: fx.deleteProposals,
  },
}));
vi.mock("../src/components/production/BulkStatusModal", () => ({
  BulkStatusModal: ({ selectedProposalIds }: any) => (
    <div data-testid="bulk-ids">{selectedProposalIds.join(",")}</div>
  ),
}));
vi.mock("../src/components/production/ExcelExportModal", () => ({
  ExcelExportModal: ({ proposals }: any) => (
    <div data-testid="export-ids">
      {proposals.map((p: any) => p.id).join(",")}
    </div>
  ),
}));
vi.mock("../src/components/production/ProposalDetailModal", () => ({
  ProposalDetailModal: ({ proposalId, proposalIdsList }: any) => (
    <div data-testid="detail-ids">
      {proposalId}|{proposalIdsList.join(",")}
    </div>
  ),
}));
vi.mock("../src/components/common/DeleteConfirmationModal", () => ({
  DeleteConfirmationModal: () => null,
}));
import { ProductionList } from "../src/components/production/ProductionList";
const newAction = vi.fn(),
  importAction = vi.fn();
function mount(premium = true) {
  return render(
    <ProductionList
      premium={premium}
      onOpenNewProduction={
        hasPermission(
          fx.user.role,
          fx.user.customPermissions,
          "proposals.create",
        )
          ? newAction
          : undefined
      }
      onOpenImportExcel={
        hasPermission(
          fx.user.role,
          fx.user.customPermissions,
          "proposals.create",
        )
          ? importAction
          : undefined
      }
    />,
  );
}
beforeEach(() => {
  fx.scope = "unit-A";
  fx.user = { id: "unit-user", role: "MASTER", customPermissions: [] };
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Network forbidden in local test"))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Propostas operacional V2 — serviços inteiramente isolados", () => {
  it("renderiza todas as colunas originais e parcela/prazo, sem dados da galeria", async () => {
    mount();
    await waitFor(() => expect(screen.getByText("UNIT-1000")).toBeTruthy());
    for (const label of [
      "ADE / Proposta",
      "Cliente",
      "CPF",
      "Produto",
      "Banco / Promotora",
      "Valores (R$)",
      "Parceiro",
      "Alçada",
      "Status Atual",
      "Data",
      "Ações",
      "Parcela / prazo",
    ])
      expect(screen.getByRole("columnheader", { name: label })).toBeTruthy();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(25);
    expect(document.body.textContent).not.toContain("Marina Exemplo");
    expect(document.body.textContent).not.toContain("Todas as ações e campos");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
  it("pagina apenas a apresentação e permite mostrar todas", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Próxima página de propostas" }),
    );
    expect(document.querySelectorAll("tbody tr")).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("Propostas por página"), {
      target: { value: "0" },
    });
    expect(document.querySelectorAll("tbody tr")).toHaveLength(30);
  });
  it("seleciona todas as filtradas, inclusive além da página, para o mesmo modal", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Selecionar todas as propostas que você pode operar",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ALTERAR STATUS EM LOTE" }),
    );
    expect(screen.getByTestId("bulk-ids").textContent?.split(",")).toHaveLength(
      30,
    );
    expect(fx.deleteProposal).not.toHaveBeenCalled();
  });
  it("o filtro remove da seleção os IDs que ficaram invisíveis", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Selecionar todas as propostas que você pode operar",
      }),
    );
    const bankSelect = document.querySelector<HTMLSelectElement>(
      'select:has(option[value="b1"])',
    )!;
    fireEvent.change(bankSelect, { target: { value: "b1" } });
    await waitFor(() =>
      expect(document.querySelectorAll("tbody tr")).toHaveLength(15),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "ALTERAR STATUS EM LOTE" }),
    );
    expect(screen.getByTestId("bulk-ids").textContent?.split(",")).toHaveLength(
      15,
    );
  });
  it("exportação e navegação do detalhe recebem a lista filtrada completa", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
    expect(
      screen.getByTestId("export-ids").textContent?.split(","),
    ).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "UNIT-1000" }));
    expect(screen.getByTestId("detail-ids").textContent).toContain("unit-29");
  });
  it("reutiliza os callbacks reais de criação/importação e alterna cartões", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Nova Proposta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Importar" }));
    expect(newAction).toHaveBeenCalledOnce();
    expect(importAction).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
    expect(document.querySelectorAll(".operation-card")).toHaveLength(25);
  });
  it.each(["MASTER", "GESTOR", "DIGITADOR"] as const)(
    "respeita permissões reais de %s",
    async (role) => {
      fx.user.role = role;
      mount();
      expect(
        screen.queryAllByRole("button", { name: "Excluir proposta" }).length >
          0,
      ).toBe(hasPermission(role, [], "proposals.delete"));
      const all = screen.getByRole("button", {
        name: "Selecionar todas as propostas que você pode operar",
      }) as HTMLButtonElement;
      expect(all.disabled).toBe(
        !hasPermission(role, [], "proposals.update") &&
          !hasPermission(role, [], "proposals.delete"),
      );
    },
  );
  it("custom permissions de leitura não ganham ações de MASTER", () => {
    fx.user.customPermissions = ["proposals.view"];
    mount();
    expect(screen.queryByRole("button", { name: /Nova Proposta/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Importar" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Excluir proposta" }),
    ).toBeNull();
  });
  it("rollback mantém workspace e cartões legados", () => {
    mount(false);
    expect(document.querySelector(".record-workspace")).toBeTruthy();
    expect(document.querySelectorAll(".operation-card")).toHaveLength(30);
    expect(document.querySelector(".p2-production-live")).toBeNull();
  });
  it("colunas podem ser ocultadas/restauradas sem remover os campos da tabela", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Configurar colunas" }));
    fireEvent.click(screen.getByLabelText("CPF", { exact: true }));
    expect(
      document
        .querySelector(".p2-live-results")
        ?.getAttribute("data-hidden-columns"),
    ).toContain("4");
    expect(screen.getByRole("columnheader", { name: "CPF" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar todas" }));
    expect(
      document
        .querySelector(".p2-live-results")
        ?.getAttribute("data-hidden-columns"),
    ).toBe("");
  });
  it("as expressões operacionais permanecem idênticas ao baseline", () => {
    const baseline = JSON.parse(
      readFileSync("docs/ui-redesign/proposals-baseline-controls.json", "utf8"),
    );
    const text = readFileSync(
        "src/components/production/ProductionList.tsx",
        "utf8",
      ),
      tree = ts.createSourceFile(
        "ProductionList.tsx",
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
      printer = ts.createPrinter({ removeComments: true });
    const found: Record<string, string> = {};
    function walk(n: ts.Node) {
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        baseline.operationalExpressions[n.name.getText(tree)]
      )
        found[n.name.getText(tree)] = createHash("sha256")
          .update(
            printer.printNode(ts.EmitHint.Unspecified, n.initializer, tree),
          )
          .digest("hex");
      ts.forEachChild(n, walk);
    }
    walk(tree);
    expect(found).toEqual(baseline.operationalExpressions);
  });
  it("todos os formulários/modais originais permanecem byte a byte iguais", () => {
    const baseline = JSON.parse(
      readFileSync("docs/ui-redesign/proposals-baseline-controls.json", "utf8"),
    );
    for (const file of baseline.files.filter(
      (f: any) => !f.path.endsWith("/ProductionList.tsx"),
    ))
      expect(
        createHash("sha256")
          .update(readFileSync(file.path, "utf8"))
          .digest("hex"),
      ).toBe(file.sha256);
  });
  it("o grafo autenticado não importa fixtures ou componentes da galeria", () => {
    for (const path of [
      "src/App.tsx",
      "src/components/production/ProductionList.tsx",
      "src/components/production/ProductionWorkspace.tsx",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toMatch(/import.*(?:galleryFixtures|GalleryWorkspaces)/);
      if (path.endsWith("App.tsx"))
        expect(text).not.toContain("<PreviewProposals");
    }
  });
  it("paginação não muda o conjunto original e limita página inválida", () => {
    const rows = Array.from({ length: 31 }, (_, i) => i);
    expect(paginateProduction(rows, 99, 25)).toEqual({
      current: 1,
      pages: 2,
      rows: rows.slice(25),
    });
    expect(paginateProduction(rows, 1, 0).rows).toHaveLength(31);
    expect(rows).toHaveLength(31);
  });
  it("remontagem com contexto B não reutiliza filtro nem colunas de A (mock local)", async () => {
    const original = fx.rows;
    const view = render(<ProductionList key={fx.scope} premium />);
    fireEvent.change(
      screen.getByPlaceholderText("Buscar CPF, Nome, ADE ou Parceiro..."),
      { target: { value: "UNIT-1000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Configurar colunas" }));
    fireEvent.click(screen.getByLabelText("CPF", { exact: true }));
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    try {
      fx.scope = "unit-B";
      fx.rows = original.map((row, i) => ({
        ...row,
        tenantId: "unit-B",
        id: `B-${i}`,
        proposalNumber: `B-ONLY-${i}`,
      }));
      view.rerender(<ProductionList key={fx.scope} premium />);
      expect(
        (
          screen.getByPlaceholderText(
            "Buscar CPF, Nome, ADE ou Parceiro...",
          ) as HTMLInputElement
        ).value,
      ).toBe("");
      expect(
        document
          .querySelector(".p2-live-results")
          ?.getAttribute("data-hidden-columns"),
      ).toBe("");
      expect(screen.queryByText("UNIT-1000")).toBeNull();
      fx.scope = "unit-A";
      fx.rows = original;
      view.rerender(<ProductionList key={fx.scope} premium />);
      expect(
        (
          screen.getByPlaceholderText(
            "Buscar CPF, Nome, ADE ou Parceiro...",
          ) as HTMLInputElement
        ).value,
      ).toBe("UNIT-1000");
      expect(
        document
          .querySelector(".p2-live-results")
          ?.getAttribute("data-hidden-columns"),
      ).toBe("4");
    } finally {
      fx.scope = "unit-A";
      fx.rows = original;
    }
  });
  it("preserva os bindings de cada controle da lista inventariado", () => {
    const baseline = JSON.parse(
      readFileSync("docs/ui-redesign/proposals-baseline-controls.json", "utf8"),
    );
    const before = baseline.files.find((file: any) =>
      file.path.endsWith("/ProductionList.tsx"),
    ).controls;
    const text = readFileSync(
      "src/components/production/ProductionList.tsx",
      "utf8",
    );
    const tree = ts.createSourceFile(
      "ProductionList.tsx",
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const controls: { tag: string; attributes: string[] }[] = [];
    function walk(n: ts.Node) {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))
        controls.push({
          tag: n.tagName.getText(tree),
          attributes: n.attributes.properties.map((a) => a.getText(tree)),
        });
      ts.forEachChild(n, walk);
    }
    walk(tree);
    for (const control of before)
      expect(
        controls.some(
          (current) =>
            current.tag === control.tag &&
            control.attributes.every((attribute: string) =>
              current.attributes.includes(attribute),
            ),
        ),
      ).toBe(true);
  });
});
