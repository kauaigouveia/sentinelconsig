import React, { useEffect, useState } from "react";
import { X, LayoutDashboard } from "lucide-react";
import { visibleNavigation } from "./navigation";
import type { Role } from "../../types";
export function permittedWorkTabs(
  paths: string[],
  role?: Role,
  permissions: string[] = [],
) {
  const routes = visibleNavigation(role, permissions);
  return Array.from(new Set(paths))
    .map((path) => routes.find((r) => r.path === path))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .slice(0, 6);
}
export function WorkTabs({
  path,
  recent,
  role,
  permissions = [],
  navigate,
}: {
  path: string;
  recent: string[];
  role?: Role;
  permissions?: string[];
  navigate: (path: string) => void;
}) {
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    setClosed((items) => items.filter((item) => item !== path));
  }, [path]);
  const tabs = permittedWorkTabs(
    ["/", path, ...recent],
    role,
    permissions,
  ).filter((r) => !closed.includes(r.path));
  return (
    <div className="s2-work-tabs" aria-label="Abas de navegação">
      {tabs.map((route) => (
        <div
          key={route.path}
          className={
            path === route.path || (route.path === "/" && path === "/dashboard")
              ? "active"
              : ""
          }
        >
          <button
            onClick={() => navigate(route.path)}
            aria-current={path === route.path ? "page" : undefined}
          >
            {route.path === "/" && <LayoutDashboard size={14} />}
            {route.path === "/" ? "Visão da Operação" : route.title}
          </button>
          {route.path !== "/" && (
            <button
              aria-label={`Fechar aba ${route.title}`}
              onClick={() => setClosed((items) => [...items, route.path])}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <span>ATALHOS DE NAVEGAÇÃO</span>
    </div>
  );
}
