import React from 'react';
import { ArrowUpRight, Compass, Layers } from 'lucide-react';
import { APP_ROUTES, canAccessRoute, type RouteConfig } from '../../router/routes';
import type { User } from '../../types';
export function RouteContextPanel({ route, user, onNavigate }: { route: RouteConfig; user: User; onNavigate: (path: string) => void }) {
  const seen = new Set<string>();
  const related = APP_ROUTES.filter(item => {
    if (item.isDynamic || item.path === route.path || item.category !== route.category || !canAccessRoute(item, user.role, user.customPermissions || []) || seen.has(item.viewId)) return false;
    seen.add(item.viewId); return true;
  }).slice(0, 6);
  return <aside className="route-context-panel"><div className="route-context-illustration"><Compass size={29} /></div><span className="route-context-kicker">{route.category}</span><h2>Ferramentas<br />da área.</h2><p>Continue seu fluxo com as ferramentas disponíveis para o seu perfil.</p><div>{related.map(item => <button type="button" key={item.path} onClick={() => onNavigate(item.path)}><Layers size={15} /><span>{item.title}</span><ArrowUpRight size={13} /></button>)}</div></aside>;
}
