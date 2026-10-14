import { APP_ROUTES, canAccessRoute } from "../../router/routes";
import type { Role } from "../../types";
export const GROUPS = [
  "Início",
  "Produção",
  "Relacionamento",
  "Financeiro",
  "Integrações",
  "Gestão",
  "Administração",
  "Plataforma",
] as const;
export type NavigationGroup = (typeof GROUPS)[number];
export function navigationGroup(
  path: string,
  category: string,
): NavigationGroup {
  if (["/", "/dashboard", "/minha-fila", "/agenda-operacional"].includes(path))
    return "Início";
  if (["/clientes", "/crm-parceiros", "/central-atendimento"].includes(path))
    return "Relacionamento";
  if (path === "/financeiro-geral") return "Financeiro";
  if (
    [
      "/esteira",
      "/simulacoes",
      "/portabilidade",
      "/propostas",
      "/central-pendencias",
      "/central-operacoes",
    ].includes(path)
  )
    return "Produção";
  if (category === "Operação") return "Gestão";
  return GROUPS.includes(category as NavigationGroup)
    ? (category as NavigationGroup)
    : "Administração";
}
const preferred = [
  "/",
  "/minha-fila",
  "/agenda-operacional",
  "/propostas",
  "/simulacoes",
  "/portabilidade",
  "/central-pendencias",
  "/esteira",
  "/central-operacoes",
  "/clientes",
  "/crm-parceiros",
  "/central-atendimento",
];
export function visibleNavigation(
  role?: Role,
  customPermissions: string[] = [],
) {
  return APP_ROUTES.filter(
    (route) =>
      !route.isDynamic &&
      route.category !== "Portal do Parceiro" &&
      route.path !== "/dashboard" &&
      canAccessRoute(route, role, customPermissions),
  )
    .map((route) => ({
      ...route,
      group: navigationGroup(route.path, route.category),
    }))
    .sort(
      (a, b) =>
        GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
        (preferred.includes(a.path) ? preferred.indexOf(a.path) : 100) -
          (preferred.includes(b.path) ? preferred.indexOf(b.path) : 100),
    );
}
