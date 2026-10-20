import { useState, useEffect, useCallback } from 'react';
import { SYSTEM_IDENTITY } from '../lib/branding';

export interface TenantBranding {
  status: 'ACTIVE' | 'SUSPENDED' | 'DOMAIN_NOT_CONFIGURED' | 'PLATFORM_DEFAULT';
  domainType: 'PLATFORM_DEFAULT' | 'PLATFORM_SUBDOMAIN' | 'CUSTOM_DOMAIN' | 'DOMAIN_NOT_CONFIGURED';
  resolvedHost?: string;
  companyName: string;
  legalName?: string;
  plan?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  footerText?: string | null;
  themeMode?: 'LIGHT' | 'DARK';
  message?: string;
}

const DEFAULT_BRANDING: TenantBranding = {
  status: 'PLATFORM_DEFAULT',
  domainType: 'PLATFORM_DEFAULT',
  companyName: SYSTEM_IDENTITY.name,
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#3b82f6',
  footerText: `© 2026 ${SYSTEM_IDENTITY.name}. ${SYSTEM_IDENTITY.tagline}`,
  themeMode: 'LIGHT',
};

export function useTenantBranding() {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyBrandingToDOM = useCallback((b: TenantBranding) => {
    // 1. Update Title (Fixed format: ${tenantName} | Sentinel Consig)
    const tenantName = b.companyName || SYSTEM_IDENTITY.name;
    document.title = `${tenantName} | Sentinel Consig`;

    // Use the company's logo when no separate favicon was registered.
    const tenantDomain = b.domainType === 'PLATFORM_SUBDOMAIN' || b.domainType === 'CUSTOM_DOMAIN';
    const favicon = tenantDomain ? b.faviconUrl || b.logoUrl : b.faviconUrl;
    {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.removeAttribute('type');
      link.href = !favicon || favicon.startsWith('/branding/sentinel-') ? '/branding/sentinel-icon-transparent-v3.png' : favicon;
    }

    // 3. Inject CSS Variables for Dynamic Color Theming
    const root = document.documentElement;
    if (b.primaryColor) {
      root.style.setProperty('--primary-color', b.primaryColor);
    }
    if (b.secondaryColor) {
      root.style.setProperty('--secondary-color', b.secondaryColor);
    }
    if (b.accentColor) {
      root.style.setProperty('--accent-color', b.accentColor);
    }
  }, []);

  const fetchBranding = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/public/tenant-branding', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Falha ao carregar configurações de marca.');
      }

      const data: TenantBranding = await response.json();
      if (data.logoUrl?.startsWith('/branding/sentinel-consig-')) data.logoUrl = SYSTEM_IDENTITY.defaultLogo;
      setBranding(data);
      applyBrandingToDOM(data);
    } catch (err: any) {
      console.warn('[useTenantBranding] Fallback de marca:', err);
      setError(err.message || 'Erro de conexão');

      const host = window.location.hostname.toLowerCase();
      const isSubdomain =
        host.endsWith('.sentinelconsig.com.br') &&
        host !== 'sentinelconsig.com.br' &&
        host !== 'app.sentinelconsig.com.br' &&
        host !== 'www.sentinelconsig.com.br';

      if (isSubdomain) {
        const unconfiguredBranding: TenantBranding = {
          status: 'DOMAIN_NOT_CONFIGURED',
          domainType: 'DOMAIN_NOT_CONFIGURED',
          companyName: 'Domínio Não Configurado',
          primaryColor: '#64748b',
          secondaryColor: '#475569',
          accentColor: '#94a3b8',
          footerText: 'Sentinel Consig SaaS',
        };
        setBranding(unconfiguredBranding);
        applyBrandingToDOM(unconfiguredBranding);
      } else {
        applyBrandingToDOM(DEFAULT_BRANDING);
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyBrandingToDOM]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  return {
    branding,
    isLoading,
    error,
    reloadBranding: fetchBranding,
  };
}
