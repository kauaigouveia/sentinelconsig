import { useState, useEffect, useCallback } from 'react';

export interface TenantBranding {
  status: 'ACTIVE' | 'SUSPENDED' | 'DOMAIN_NOT_CONFIGURED' | 'PLATFORM_DEFAULT';
  domainType: 'PLATFORM_DEFAULT' | 'PLATFORM_SUBDOMAIN' | 'CUSTOM_DOMAIN' | 'DOMAIN_NOT_CONFIGURED';
  companyName: string;
  legalName?: string;
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
  companyName: 'Sentinel Consig',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#3b82f6',
  footerText: '© 2026 Sentinel Consig. Plataforma Multitenant de Crédito Consignado.',
  themeMode: 'LIGHT',
};

export function useTenantBranding() {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyBrandingToDOM = useCallback((b: TenantBranding) => {
    // 1. Update Title
    if (b.companyName) {
      document.title = `${b.companyName} | Central de Consignados`;
    }

    // 2. Update Favicon if provided
    if (b.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = b.faviconUrl;
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
      });

      if (!response.ok) {
        throw new Error('Falha ao carregar configurações de marca.');
      }

      const data: TenantBranding = await response.json();
      setBranding(data);
      applyBrandingToDOM(data);
    } catch (err: any) {
      console.warn('[useTenantBranding] Fallback para branding padrão:', err);
      setError(err.message || 'Erro de conexão');
      applyBrandingToDOM(DEFAULT_BRANDING);
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
