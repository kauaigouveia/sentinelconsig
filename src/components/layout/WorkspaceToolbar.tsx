import React from 'react';
import { Star, PanelTop, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { APP_ROUTES, canAccessRoute, type RouteConfig } from '../../router/routes';
import type { User } from '../../types';
import { useWorkspacePreferences } from '../../hooks/useWorkspacePreferences';

export function WorkspaceToolbar({ route, user, preferenceKey, onNavigate }: { route?: RouteConfig | null; user: User | null; preferenceKey: string; onNavigate: (path: string) => void }) {
  const workspace = useWorkspacePreferences(preferenceKey);
  const recent = workspace.recent.filter(path => path !== route?.path).map(path => APP_ROUTES.find(item => item.path === path)).filter((item): item is RouteConfig => !!item && !item.isDynamic && canAccessRoute(item, user?.role, user?.customPermissions || [])).slice(0, 3);
  return <div className="sentinel-workspace-toolbar"><div className="sentinel-workspace-location"><PanelTop size={15} /><span>{route?.category || 'Meu espaço'}</span>{recent.length > 0 && <><span className="sentinel-toolbar-separator" /><span className="sentinel-recent-label">Recentes</span>{recent.map(item => <button key={item.path} type="button" onClick={() => onNavigate(item.path)}>{item.title}<ArrowRight size={11} /></button>)}</>}</div><div className="sentinel-workspace-controls">{route && !route.isDynamic && <button type="button" onClick={() => workspace.toggleFavorite(route.path)} aria-pressed={workspace.favorites.includes(route.path)} title="Adicionar ou remover dos favoritos"><Star size={15} fill={workspace.favorites.includes(route.path) ? 'currentColor' : 'none'} /><span className="hidden sm:inline">{workspace.favorites.includes(route.path) ? 'Favorito' : 'Favoritar'}</span></button>}<button type="button" onClick={workspace.toggleDensity} title="Alternar densidade de todas as telas"><SlidersHorizontal size={15} /><span>{workspace.density === 'compact' ? 'Compacto' : 'Confortável'}</span></button></div></div>;
}
