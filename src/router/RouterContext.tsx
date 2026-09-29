import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { RouteConfig, matchRoute, APP_ROUTES } from './routes';

interface RouterContextType {
  pathname: string;
  search: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
  activeRoute: RouteConfig | null;
  currentView: string;
  is404: boolean;
  navigate: (
    to: string,
    options?: { replace?: boolean; preserveSearch?: boolean }
  ) => void;
  goBack: () => void;
  goForward: () => void;
  redirectTarget: string | null;
  setRedirectTarget: (target: string | null) => void;
}

const RouterContext = createContext<RouterContextType | null>(null);

// Map view IDs to their canonical path for backward compatibility
const VIEW_ID_TO_CANONICAL_PATH: Record<string, string> = {
  'torre-controle': '/dashboard',
  'home-digitador': '/dashboard',
  'producao': '/propostas',
  'esteira': '/esteira',
  'portabilidades': '/portabilidade',
  'simulacoes': '/simulacoes',
  'parceiros': '/crm-parceiros',
  'dashboard-executivo': '/bi',
  'central-automacao': '/automacoes',
  'command-center': '/command-center',
  'sentinela-ai': '/intelligence',
  'sentinel-intelligence': '/intelligence',
  'central-pendencias': '/central-pendencias',
  'hub-integracoes': '/integracoes',
  'promotoras': '/bancos-promotoras',
  'admin-c6-bank': '/saude-apis',
  'central-administracao': '/central-administracao',
  'saas-tenants': '/empresas-assinaturas',
  'admin-plano-consumo': '/meu-plano',
  'clientes': '/clientes',
  'tv-monitor': '/tv-monitor',
  'radar-comercial': '/radar-comercial',
  'agenda-operacional': '/agenda-operacional',
  'gamificacao': '/gamificacao',
  'financeiro-geral': '/financeiro-geral',
  'relatorio-gargalos': '/relatorio-gargalos',
  'central-operacoes': '/central-operacoes',
  'admin-usuarios': '/admin-usuarios',
  'admin-produtos': '/admin-produtos',
  'admin-status': '/admin-status',
  'admin-calendario': '/admin-calendario',
  'admin-auditoria': '/admin-auditoria',
  'admin-comunicados': '/admin-comunicados',
  'admin-import-status': '/admin-import-status',
};

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locationState, setLocationState] = useState<{
    pathname: string;
    search: string;
  }>(() => {
    if (typeof window !== 'undefined') {
      return {
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      };
    }
    return { pathname: '/', search: '' };
  });

  const [redirectTarget, setRedirectTarget] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        return sessionStorage.getItem('sentinel_auth_redirect');
      } catch {
        return null;
      }
    }
    return null;
  });

  // Save redirect target into sessionStorage to survive unexpected reloads
  const updateRedirectTarget = useCallback((target: string | null) => {
    setRedirectTarget(target);
    try {
      if (target) {
        sessionStorage.setItem('sentinel_auth_redirect', target);
      } else {
        sessionStorage.removeItem('sentinel_auth_redirect');
      }
    } catch {}
  }, []);

  // Listen to browser Back/Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      setLocationState({
        pathname: window.location.pathname || '/',
        search: window.location.search || '',
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Resolve matching route
  const match = useMemo(() => {
    return matchRoute(locationState.pathname);
  }, [locationState.pathname]);

  const activeRoute = match?.route || null;
  const params = match?.params || {};
  const is404 = !match;

  // Derive current view ID from route or fallback
  const currentView = useMemo(() => {
    if (activeRoute) {
      return activeRoute.viewId;
    }
    return '404';
  }, [activeRoute]);

  const searchParams = useMemo(() => {
    return new URLSearchParams(locationState.search);
  }, [locationState.search]);

  // Core navigation function
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; preserveSearch?: boolean }) => {
      if (typeof window === 'undefined') return;

      let targetPath = to.trim();
      let targetSearch = '';

      // If `to` was passed as a view ID (e.g. 'producao'), map to canonical path
      if (!targetPath.startsWith('/') && !targetPath.startsWith('?')) {
        const canonical = VIEW_ID_TO_CANONICAL_PATH[targetPath];
        if (canonical) {
          targetPath = canonical;
        } else {
          targetPath = `/${targetPath}`;
        }
      }

      // Handle query parameters if in `to`
      if (targetPath.includes('?')) {
        const parts = targetPath.split('?');
        targetPath = parts[0] || '/';
        targetSearch = `?${parts[1]}`;
      } else if (options?.preserveSearch && locationState.search) {
        targetSearch = locationState.search;
      }

      // If `to` is just query params (e.g. '?period=MES_ATUAL')
      if (to.startsWith('?')) {
        targetPath = locationState.pathname;
        targetSearch = to;
      }

      // Normalize pathname
      if (!targetPath.startsWith('/')) {
        targetPath = `/${targetPath}`;
      }
      if (targetPath.length > 1 && targetPath.endsWith('/')) {
        targetPath = targetPath.slice(0, -1);
      }

      const fullUrl = `${targetPath}${targetSearch}`;

      if (options?.replace) {
        window.history.replaceState(null, '', fullUrl);
      } else {
        window.history.pushState(null, '', fullUrl);
      }

      setLocationState({
        pathname: targetPath,
        search: targetSearch,
      });

      // Dispatch custom event for telemetry or external listeners if necessary
      try {
        window.dispatchEvent(
          new CustomEvent('sentinel_navigate', {
            detail: { pathname: targetPath, search: targetSearch },
          })
        );
      } catch {}
    },
    [locationState]
  );

  const goBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }, []);

  const goForward = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.forward();
    }
  }, []);

  const value = useMemo<RouterContextType>(
    () => ({
      pathname: locationState.pathname,
      search: locationState.search,
      searchParams,
      params,
      activeRoute,
      currentView,
      is404,
      navigate,
      goBack,
      goForward,
      redirectTarget,
      setRedirectTarget: updateRedirectTarget,
    }),
    [
      locationState.pathname,
      locationState.search,
      searchParams,
      params,
      activeRoute,
      currentView,
      is404,
      navigate,
      goBack,
      goForward,
      redirectTarget,
      updateRedirectTarget,
    ]
  );

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
};

export function useRouter(): RouterContextType {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}

export function useNavigate() {
  const { navigate } = useRouter();
  return navigate;
}

export function useLocation() {
  const { pathname, search, searchParams } = useRouter();
  return { pathname, search, searchParams };
}

export function useParams(): Record<string, string> {
  const { params } = useRouter();
  return params;
}

export function useSearchParams(): [
  URLSearchParams,
  (params: Record<string, string | number | boolean | null | undefined>) => void
] {
  const { searchParams, pathname, navigate } = useRouter();

  const setSearchParams = useCallback(
    (newParams: Record<string, string | number | boolean | null | undefined>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(newParams)) {
        if (value === null || value === undefined || value === '') {
          sp.delete(key);
        } else {
          sp.set(key, String(value));
        }
      }
      const qs = sp.toString();
      navigate(`${pathname}${qs ? `?${qs}` : ''}`);
    },
    [searchParams, pathname, navigate]
  );

  return [searchParams, setSearchParams];
}
