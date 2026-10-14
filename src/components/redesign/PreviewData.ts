import { useEffect, useState } from "react";
import { StorageService } from "../../services/storageService";
import { AnalyticsApiService } from "../../services/analyticsApiService";
import { realtimeHub } from "../../services/realtimeService";
import { isProposalOperationalActive } from "../../lib/statusUtils";
import { hasPermission } from "../../lib/permissions";
import type { Proposal } from "../../types";
import type { BottlenecksResponse } from "../../types/analytics";
export type PreviewRow = {
  id: string;
  ade: string;
  client: string;
  cpf: string;
  bank: string;
  bankId?: string;
  partner: string;
  product: string;
  status: string;
  statusId: string;
  color: string;
  amount: number | null;
  contract: number | null;
  createdAt: string;
  active: boolean;
  paid: boolean;
  pending: boolean;
};
export function readPreviewRows(): PreviewRow[] {
  const user = StorageService.getActiveUser();
  if (!hasPermission(user?.role, user?.customPermissions, "proposals.view"))
    return [];
  const clients = StorageService.getClients(),
    banks = StorageService.getBanks(),
    partners = StorageService.getPartners(),
    statuses = StorageService.getStatuses(),
    products = StorageService.getProducts();
  return StorageService.getProposals().map((proposal: Proposal) => {
    const client =
        proposal.client || clients.find((v) => v.id === proposal.clientId),
      status =
        proposal.status || statuses.find((v) => v.id === proposal.statusId);
    return {
      id: proposal.id,
      ade: proposal.proposalNumber,
      client:
        client?.fullName || proposal.clientName || "Cliente não informado",
      cpf: client?.cpf || proposal.clientCpf || "",
      bankId: proposal.bankId,
      bank:
        banks.find((v) => v.id === proposal.bankId)?.name ||
        proposal.bankName ||
        "Não informado",
      partner:
        proposal.partnerName ||
        partners.find((v) => v.id === proposal.partnerId)?.fullName ||
        proposal.partnerCode ||
        "Não informado",
      product:
        proposal.productName ||
        products.find((v) => v.id === proposal.productId)?.name ||
        proposal.type ||
        "Não informado",
      status: status?.name || proposal.statusName || "Não informado",
      statusId: proposal.statusId,
      color: status?.color || "#64748b",
      amount:
        proposal.disbursedValue == null
          ? null
          : Number(proposal.disbursedValue),
      contract:
        proposal.contractValue == null ? null : Number(proposal.contractValue),
      createdAt: proposal.createdAt,
      active: isProposalOperationalActive(proposal, statuses),
      paid: status?.standardCategory === "PAGO" || status?.code === "PAGO",
      pending:
        status?.standardCategory === "PENDENTE" ||
        String(status?.code).startsWith("PENDENTE"),
    };
  });
}
export function usePreviewData(scope: string, enabled = true) {
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    rows: PreviewRow[];
    bottlenecks: BottlenecksResponse | null;
    error: string;
  }>({ scope: "", rows: [], bottlenecks: null, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setSnapshot({
      scope,
      rows: readPreviewRows(),
      bottlenecks: null,
      error: "",
    });
    const user = StorageService.getActiveUser(),
      allowed = hasPermission(
        user?.role,
        user?.customPermissions,
        "proposals.view",
      );
    setLoading(allowed);
    const sync = () => {
      if (alive)
        setSnapshot((current) => ({
          ...current,
          scope,
          rows: readPreviewRows(),
        }));
    };
    if (allowed)
      void AnalyticsApiService.fetchBottlenecks()
        .then((v) => {
          if (alive) setSnapshot((current) => ({ ...current, bottlenecks: v }));
        })
        .catch(() => {
          if (alive)
            setSnapshot((current) => ({
              ...current,
              error: "Não foi possível consultar os indicadores de SLA.",
            }));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    const off = realtimeHub.subscribe("*", sync);
    window.addEventListener("credit_gestao_storage_update", sync);
    return () => {
      alive = false;
      off();
      window.removeEventListener("credit_gestao_storage_update", sync);
    };
  }, [scope, enabled, revision]);
  const refresh = () => setRevision((value) => value + 1);
  return enabled && snapshot.scope === scope
    ? { ...snapshot, loading, refresh }
    : { rows: [], bottlenecks: null, error: "", loading: false, refresh };
}
