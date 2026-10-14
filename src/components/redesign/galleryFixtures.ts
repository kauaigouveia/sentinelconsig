// Gallery-only fixtures. Never import into the authenticated application.
import type { PreviewRow } from "./PreviewData";
export type GalleryRow = PreviewRow & {
  installment: number;
  priority: string;
  elapsed: string;
};
export const galleryStatuses = [
  { name: "Aguardar formalização", color: "#8b5cf6" },
  { name: "Aguardar retorno CIP", color: "#06b6d4" },
  { name: "Pendência documental", color: "#f59e0b" },
  { name: "Proposta paga", color: "#10b981" },
];
export const galleryRows: GalleryRow[] = Array.from({ length: 36 }, (_, i) => {
  const status = galleryStatuses[i % 4];
  return {
    id: `visual-${i + 1}`,
    ade: `DEMO ${String(1001 + i)}`,
    client: [
      "Marina Exemplo",
      "Rafael Demonstração",
      "Clara Modelo",
      "Lucas Ilustrativo",
      "Ana Exemplo",
      "Pedro Modelo",
    ][i % 6],
    cpf: "***.***.***-**",
    bank: ["C6 Bank", "FACTA", "FINANTO", "Nossa Fintech", "BMG"][i % 5],
    bankId: `demo-bank-${i % 5}`,
    partner: ["Parceiro Aurora", "Parceiro Horizonte", "Parceiro Atlas"][i % 3],
    product: i % 2 ? "Portabilidade + Refin" : "INSS Novo",
    status: status.name,
    statusId: `demo-status-${i % 4}`,
    color: status.color,
    amount: 6900 + i * 430,
    contract: 8500 + i * 490,
    installment: 182.4 + i * 8.3,
    createdAt: `2026-10-${String(13 - ((i * i + i * 3) % 13)).padStart(2, "0")}T12:00:00Z`,
    active: i % 4 !== 3,
    paid: i % 4 === 3,
    pending: i % 4 === 2,
    priority: i % 5 === 0 ? "Alta" : "Normal",
    elapsed: `${1 + (i % 18)}h`,
  };
});
