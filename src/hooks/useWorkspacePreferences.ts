import { useCallback, useEffect, useState } from 'react';

type Preferences = { favorites: string[]; recent: string[]; density: 'comfortable' | 'compact' };
const defaults: Preferences = { favorites: [], recent: [], density: 'comfortable' };
export function workspaceKey(tenantId?: string, userId?: string) {
  return `sentinel:workspace:v2:${window.location.hostname}:${tenantId || 'none'}:${userId || 'guest'}`;
}
function read(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    const paths = (items: unknown) => Array.isArray(items) ? items.filter(item => typeof item === 'string' && /^\/[a-z0-9/-]*$/i.test(item)).slice(0, 12) : [];
    return { favorites: paths(value.favorites), recent: paths(value.recent), density: value.density === 'compact' ? 'compact' : 'comfortable' };
  } catch { return defaults; }
}
export function useWorkspacePreferences(key: string) {
  const [preferences, setPreferences] = useState(() => read(key));
  useEffect(() => {
    setPreferences(read(key));
    const sync = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== key) return;
      if (event instanceof CustomEvent && event.detail !== key) return;
      setPreferences(read(key));
    };
    window.addEventListener('storage', sync);
    window.addEventListener('sentinel:workspace-updated', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('sentinel:workspace-updated', sync); };
  }, [key]);
  const update = useCallback((transform: (value: Preferences) => Preferences) => {
    const next = transform(read(key));
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    setPreferences(next); window.dispatchEvent(new CustomEvent('sentinel:workspace-updated', { detail: key }));
  }, [key]);
  return {
    ...preferences,
    toggleFavorite: useCallback((path: string) => update(value => ({ ...value, favorites: value.favorites.includes(path) ? value.favorites.filter(item => item !== path) : [...value.favorites, path].slice(-12) })), [update]),
    recordRoute: useCallback((path: string) => update(value => ({ ...value, recent: [path, ...value.recent.filter(item => item !== path)].slice(0, 6) })), [update]),
    toggleDensity: useCallback(() => update(value => ({ ...value, density: value.density === 'compact' ? 'comfortable' : 'compact' })), [update]),
  };
}
