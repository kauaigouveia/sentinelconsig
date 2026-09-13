import { PrismaClient } from '@prisma/client';
import express from 'express';

export type DomainResolutionType =
  | 'PLATFORM_DEFAULT'
  | 'PLATFORM_SUBDOMAIN'
  | 'CUSTOM_DOMAIN'
  | 'DOMAIN_NOT_CONFIGURED';

export interface ResolvedTenantBranding {
  status: 'CONFIGURED' | 'DOMAIN_NOT_CONFIGURED';
  domainType: DomainResolutionType;
  resolvedHost: string;
  tenantId?: string; // Mantido internamente no backend, não enviado em dados públicos sensíveis
  companyName: string;
  tradeName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  loginBannerUrl: string | null;
  footerText: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  themeMode: string;
}

export interface DomainResolutionResult {
  type: DomainResolutionType;
  resolvedHost: string;
  tenant: {
    id: string;
    name: string;
    tradeName: string | null;
    slug: string;
    customDomain: string | null;
    status: string;
    whiteLabel: {
      companyName: string;
      legalName: string | null;
      logoUrl: string | null;
      faviconUrl: string | null;
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      supportEmail: string | null;
      supportPhone: string | null;
      footerText: string | null;
      themeMode: string;
    } | null;
  } | null;
  branding: ResolvedTenantBranding;
}

interface CacheEntry {
  result: DomainResolutionResult;
  expiresAt: number;
}

export class TenantResolver {
  private static brandingCache: Map<string, CacheEntry> = new Map();
  private static CACHE_TTL_MS = 60 * 1000; // 60 segundos

  /**
   * Extrai e normaliza o Host a partir dos headers da requisição
   */
  public static extractHost(req: express.Request): string {
    // 1. Suporte a X-Forwarded-Host (Vercel, proxies reversos)
    const forwardedHost = req.headers['x-forwarded-host'];
    let host = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : (forwardedHost as string) || req.headers['host'] || '';

    // 2. Parâmetro opcional para testes/dev
    const queryHost = req.query?.host as string | undefined;
    if (queryHost && process.env.NODE_ENV !== 'production') {
      host = queryHost;
    }

    // 3. Normalização básica
    host = host.trim().toLowerCase();
    host = host.split(':')[0]; // Remove porta
    return host;
  }

  /**
   * Limpa o cache para um host específico ou invalida todo o cache
   */
  public static invalidateCache(host?: string): void {
    if (host) {
      this.brandingCache.delete(host.toLowerCase().trim());
    } else {
      this.brandingCache.clear();
    }
  }

  /**
   * Resolve o Tenant a partir do Host com cache seguro indexado por host
   */
  public static async resolveByHost(
    prisma: PrismaClient,
    host: string
  ): Promise<DomainResolutionResult> {
    const cleanHost = host.trim().toLowerCase().split(':')[0];

    // Checa cache em memória
    const cached = this.brandingCache.get(cleanHost);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const defaultPlatformBranding: ResolvedTenantBranding = {
      status: 'CONFIGURED',
      domainType: 'PLATFORM_DEFAULT',
      resolvedHost: cleanHost,
      companyName: 'Sentinel Consig',
      tradeName: 'Sentinel Consig',
      logoUrl: null,
      faviconUrl: null,
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      accentColor: '#3b82f6',
      loginBannerUrl: null,
      footerText: '© 2026 Sentinel Consig. Todos os direitos reservados.',
      supportEmail: 'suporte@sentinelconsig.com.br',
      supportPhone: null,
      themeMode: 'LIGHT',
    };

    // 1. Verifica se é o domínio padrão da plataforma ou ambiente local
    const isLocalOrPlatformHost =
      !cleanHost ||
      cleanHost === 'localhost' ||
      cleanHost === '127.0.0.1' ||
      cleanHost.includes('run.app') ||
      cleanHost.includes('vercel.app') ||
      cleanHost === 'sentinelconsig.com.br' ||
      cleanHost === 'app.sentinelconsig.com.br' ||
      cleanHost === 'www.sentinelconsig.com.br';

    if (isLocalOrPlatformHost) {
      const defaultResult: DomainResolutionResult = {
        type: 'PLATFORM_DEFAULT',
        resolvedHost: cleanHost,
        tenant: null,
        branding: defaultPlatformBranding,
      };

      this.brandingCache.set(cleanHost, {
        result: defaultResult,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return defaultResult;
    }

    // 2. Verifica se é um Subdomínio da plataforma ({slug}.sentinelconsig.com.br)
    const platformSubdomainMatch = cleanHost.match(/^([a-z0-9-]+)\.sentinelconsig\.com\.br$/);
    if (platformSubdomainMatch) {
      const slug = platformSubdomainMatch[1];
      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        include: { whiteLabel: true },
      });

      if (tenant && tenant.status === 'ACTIVE') {
        const wl = tenant.whiteLabel;
        const result: DomainResolutionResult = {
          type: 'PLATFORM_SUBDOMAIN',
          resolvedHost: cleanHost,
          tenant,
          branding: {
            status: 'CONFIGURED',
            domainType: 'PLATFORM_SUBDOMAIN',
            resolvedHost: cleanHost,
            tenantId: tenant.id,
            companyName: wl?.companyName || tenant.name,
            tradeName: wl?.legalName || tenant.tradeName || tenant.name,
            logoUrl: wl?.logoUrl || null,
            faviconUrl: wl?.faviconUrl || null,
            primaryColor: wl?.primaryColor || '#2563eb',
            secondaryColor: wl?.secondaryColor || '#1e40af',
            accentColor: wl?.accentColor || '#3b82f6',
            loginBannerUrl: null,
            footerText: wl?.footerText || `© ${new Date().getFullYear()} ${wl?.companyName || tenant.name}`,
            supportEmail: wl?.supportEmail || null,
            supportPhone: wl?.supportPhone || null,
            themeMode: wl?.themeMode || 'LIGHT',
          },
        };

        this.brandingCache.set(cleanHost, {
          result,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });

        return result;
      }
    }

    // 3. Verifica se é um Domínio Personalizado (Custom Domain) exato
    const customTenant = await prisma.tenant.findUnique({
      where: { customDomain: cleanHost },
      include: { whiteLabel: true },
    });

    if (customTenant && customTenant.status === 'ACTIVE') {
      const wl = customTenant.whiteLabel;
      const result: DomainResolutionResult = {
        type: 'CUSTOM_DOMAIN',
        resolvedHost: cleanHost,
        tenant: customTenant,
        branding: {
          status: 'CONFIGURED',
          domainType: 'CUSTOM_DOMAIN',
          resolvedHost: cleanHost,
          tenantId: customTenant.id,
          companyName: wl?.companyName || customTenant.name,
          tradeName: wl?.legalName || customTenant.tradeName || customTenant.name,
          logoUrl: wl?.logoUrl || null,
          faviconUrl: wl?.faviconUrl || null,
          primaryColor: wl?.primaryColor || '#2563eb',
          secondaryColor: wl?.secondaryColor || '#1e40af',
          accentColor: wl?.accentColor || '#3b82f6',
          loginBannerUrl: null,
          footerText: wl?.footerText || `© ${new Date().getFullYear()} ${wl?.companyName || customTenant.name}`,
          supportEmail: wl?.supportEmail || null,
          supportPhone: wl?.supportPhone || null,
          themeMode: wl?.themeMode || 'LIGHT',
        },
      };

      this.brandingCache.set(cleanHost, {
        result,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return result;
    }

    // 4. Domínio não configurado ou desconhecido
    const notConfiguredResult: DomainResolutionResult = {
      type: 'DOMAIN_NOT_CONFIGURED',
      resolvedHost: cleanHost,
      tenant: null,
      branding: {
        status: 'DOMAIN_NOT_CONFIGURED',
        domainType: 'DOMAIN_NOT_CONFIGURED',
        resolvedHost: cleanHost,
        companyName: 'Domínio Não Configurado',
        tradeName: 'Domínio Não Configurado',
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '#64748b',
        secondaryColor: '#475569',
        accentColor: '#94a3b8',
        loginBannerUrl: null,
        footerText: 'Sentinel Consig SaaS',
        supportEmail: 'suporte@sentinelconsig.com.br',
        supportPhone: null,
        themeMode: 'LIGHT',
      },
    };

    this.brandingCache.set(cleanHost, {
      result: notConfiguredResult,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return notConfiguredResult;
  }
}
