// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  renderHook,
  act,
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { useTaskSearch } from "../src/components/redesign/useTaskSearch";
import { PreviewSearch } from "../src/components/redesign/PreviewSearch";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Busca do Shell — fontes reais com transporte isolado", () => {
  it("não consulta tarefas quando a fonte está desabilitada", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTaskSearch("unit-A", false));
    expect(result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("descarta resposta antiga após troca de contexto", async () => {
    let resolveA: (v: any) => void = () => {},
      resolveB: (v: any) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveA = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveB = resolve;
            }),
        ),
    );
    const { result, rerender } = renderHook(
      ({ scope }) => useTaskSearch(scope, true),
      { initialProps: { scope: "unit-A" } },
    );
    rerender({ scope: "unit-B" });
    expect(result.current).toEqual([]);
    await act(async () => {
      resolveA({
        ok: true,
        json: async () => [{ id: "A", title: "Tarefa privada A" }],
      });
    });
    expect(result.current).toEqual([]);
    await act(async () => {
      resolveB({
        ok: true,
        json: async () => [{ id: "B", title: "Tarefa sintética B" }],
      });
    });
    expect(result.current.map((t) => t.id)).toEqual(["B"]);
  });
  it("retira os resultados ao fechar a busca e aborta o transporte anterior", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "A", title: "Tarefa teste" }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ enabled }) => useTaskSearch("unit-A", enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    const signal = fetchMock.mock.calls[0][1].signal;
    rerender({ enabled: false });
    expect(result.current).toEqual([]);
    expect(signal.aborted).toBe(true);
  });
  it("paleta não anuncia tarefas a quem não tem tasks.view", () => {
    render(
      <PreviewSearch
        role="MASTER"
        permissions={["proposals.view"]}
        rows={[]}
        tasks={[{ id: "test", title: "Tarefa privada de teste" }]}
        navigate={() => {}}
        openProposal={() => {}}
        close={() => {}}
      />,
    );
    const field = screen.getByLabelText(
      "Buscar páginas, cliente, CPF, ADE ou parceiro",
    );
    fireEvent.change(field, { target: { value: "Tarefa" } });
    expect(screen.queryByText("Tarefa privada de teste")).toBeNull();
  });
  it("tarefa autorizada abre a rota real de agenda", () => {
    const navigate = vi.fn();
    render(
      <PreviewSearch
        role="MASTER"
        permissions={["tasks.view"]}
        rows={[]}
        tasks={[{ id: "unit", title: "Tarefa sintética autorizada" }]}
        navigate={navigate}
        openProposal={() => {}}
        close={() => {}}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("Buscar páginas, cliente, CPF, ADE ou parceiro"),
      { target: { value: "sintética" } },
    );
    fireEvent.click(screen.getByText("Tarefa sintética autorizada"));
    expect(navigate).toHaveBeenCalledWith("/agenda-operacional");
  });
});
