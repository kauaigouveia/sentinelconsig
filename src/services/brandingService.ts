export interface TenantBranding {
  companyName: string;
  tradeName?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  footerText?: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;
  domain?: string | null;
}

export class BrandingService {
  private static cachedBranding: TenantBranding | null = null;

  public static async resolveEffectiveTenantBranding(): Promise<TenantBranding> {
    try {
      const res = await fetch('/api/public/tenant-branding', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        this.cachedBranding = {
          companyName: data.companyName || 'Sentinel Consig',
          tradeName: data.tradeName || data.companyName || 'Sentinel Consig',
          logoUrl: data.logoUrl || null,
          faviconUrl: data.faviconUrl || null,
          primaryColor: data.primaryColor || '#2563eb',
          secondaryColor: data.secondaryColor || '#1e40af',
          accentColor: data.accentColor || '#3b82f6',
          supportEmail: data.supportEmail || null,
          supportPhone: data.supportPhone || null,
          footerText: data.footerText || null,
          termsUrl: data.termsUrl || null,
          privacyUrl: data.privacyUrl || null,
          domain: data.resolvedHost || null,
        };

        this.applyBrandingToDocument(this.cachedBranding);
        return this.cachedBranding;
      }
    } catch (e) {
      console.warn('[BrandingService] Erro ao carregar branding do servidor:', e);
    }

    const fallback: TenantBranding = {
      companyName: 'Sentinel Consig',
      tradeName: 'Sentinel Consig',
      primaryColor: '#2563eb',
      footerText: '© 2026 Sentinel Consig. Todos os direitos reservados.',
    };
    this.applyBrandingToDocument(fallback);
    return fallback;
  }

  public static applyBrandingToDocument(branding: TenantBranding): void {
    if (branding.companyName) {
      document.title = `${branding.companyName} | Gestão Consignada`;
    }

    if (branding.faviconUrl) {
      let iconLink = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!iconLink) {
        iconLink = document.createElement('link');
        iconLink.rel = 'icon';
        document.head.appendChild(iconLink);
      }
      iconLink.href = branding.faviconUrl;
    }
  }
}
