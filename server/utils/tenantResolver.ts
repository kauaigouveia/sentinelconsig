import { PrismaClient } from '@prisma/client';
import express from 'express';

export type DomainResolutionType =
  | 'PLATFORM_DEFAULT'
  | 'PLATFORM_SUBDOMAIN'
  | 'CUSTOM_DOMAIN'
  | 'DOMAIN_NOT_CONFIGURED';

export interface ResolvedTenantBranding {
  status: 'CONFIGURED' | 'DOMAIN_NOT_CONFIGURED' | 'SUSPENDED';
  domainType: DomainResolutionType;
  resolvedHost: string;
  tenantId?: string; // Mantido internamente no backend, não enviado em dados públicos sensíveis
  plan?: string;
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
  plan?: string;
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
    // Hardening: Para evitar o risco de spoofing por Host Header de fontes não confiáveis,
    // preferimos o header 'host' padrão, a menos que TRUST_PROXY esteja explicitamente definido como 'true'.
    const useForwarded = process.env.TRUST_PROXY === 'true';
    const forwardedHost = req.headers['x-forwarded-host'];
    
    let host = '';
    if (useForwarded && forwardedHost) {
      host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
    } else {
      host = req.headers['host'] || '';
    }

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

  private static isValidHostname(host: string): boolean {
    if (!host) return false;
    if (host.length > 253) return false;
    
    // Rejeitar localhost ou IPs literais (IPv4 e IPv6 simplificado)
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
    if (host.includes(':')) return false; // IPs IPv6 ou portas residuais

    // Apenas caracteres FQDN válidos (letras, números, hífens, pontos)
    const hostRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;
    if (!hostRegex.test(host)) return false;

    // Reservados do sistema ou da plataforma diretamente
    const reserved = [
      'admin',
      'api',
      'app',
      'auth',
      'cdn',
      'dashboard',
      'dev',
      'login',
      'mail',
      'master',
      'platform',
      'root',
      'saas',
      'sentinel',
      'sentinelconsig',
      'stage',
      'staging',
      'status',
      'support',
      'suporte',
      'system',
      'test',
      'www',
    ];
    const parts = host.split('.');
    if (parts.length > 0 && reserved.includes(parts[0])) {
      // Se for subdomínio direto da plataforma (ex: admin.sentinelconsig.com.br), rejeitar de custom resolution
      if (host.endsWith('sentinelconsig.com.br')) {
        return false;
      }
    }

    return true;
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
   * Resolve a identidade visual/branding diretamente pelo ID do Tenant
   */
  public static async resolveByTenantId(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<ResolvedTenantBranding> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { whiteLabel: true },
      });

      if (!tenant) {
        return {
          status: 'DOMAIN_NOT_CONFIGURED',
          domainType: 'PLATFORM_DEFAULT',
          resolvedHost: 'default',
          tenantId,
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
      }

      const wl = tenant.whiteLabel;
      return {
        status: tenant.status === 'SUSPENDED' ? 'SUSPENDED' : 'CONFIGURED',
        domainType: tenant.customDomain ? 'CUSTOM_DOMAIN' : 'PLATFORM_SUBDOMAIN',
        resolvedHost: tenant.customDomain || `${tenant.slug}.sentinelconsig.com.br`,
        tenantId: tenant.id,
        plan: tenant.plan,
              companyName: wl?.companyName || tenant.name,
        tradeName: tenant.tradeName || tenant.name,
        logoUrl: wl?.logoUrl || null,
        faviconUrl: wl?.faviconUrl || null,
        primaryColor: wl?.primaryColor || '#2563eb',
        secondaryColor: wl?.secondaryColor || '#1e40af',
        accentColor: wl?.accentColor || '#3b82f6',
        loginBannerUrl: null,
        footerText: wl?.footerText || `© 2026 ${wl?.companyName || tenant.name}. Todos os direitos reservados.`,
        supportEmail: wl?.supportEmail || null,
        supportPhone: wl?.supportPhone || null,
        themeMode: wl?.themeMode || 'LIGHT',
      };
    } catch (err) {
      console.error('[TenantResolver.resolveByTenantId ERROR]', err);
      return {
        status: 'DOMAIN_NOT_CONFIGURED',
        domainType: 'PLATFORM_DEFAULT',
        resolvedHost: 'default',
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

    if (!cleanHost) {
      const emptyResult: DomainResolutionResult = {
        type: 'DOMAIN_NOT_CONFIGURED',
        resolvedHost: '',
        tenant: null,
        branding: {
          status: 'DOMAIN_NOT_CONFIGURED',
          domainType: 'DOMAIN_NOT_CONFIGURED',
          resolvedHost: '',
          companyName: 'Host Inválido',
          tradeName: 'Host Inválido',
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
      return emptyResult;
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

      // Slugs reservados da plataforma que não sejam os de acesso administrativo
      const reservedSlugs = [
        'api',
        'auth',
        'cdn',
        'dev',
        'login',
        'mail',
        'master',
        'saas',
        'sentinel',
        'sentinelconsig',
        'stage',
        'staging',
        'status',
        'support',
        'suporte',
        'system',
        'test',
      ];
      if (reservedSlugs.includes(slug)) {
        const notConfiguredResult: DomainResolutionResult = {
          type: 'DOMAIN_NOT_CONFIGURED',
          resolvedHost: cleanHost,
          tenant: null,
          branding: {
            status: 'DOMAIN_NOT_CONFIGURED',
            domainType: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            companyName: 'Subdomínio Reservado',
            tradeName: 'Subdomínio Reservado',
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

      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        include: { whiteLabel: true, domains: true },
      });

      if (!tenant) {
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

      if (tenant.status === 'SUSPENDED') {
          const wl = tenant.whiteLabel;
          const suspendedResult: DomainResolutionResult = {
            type: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            tenant: null,
            branding: {
              status: 'SUSPENDED',
              domainType: 'PLATFORM_SUBDOMAIN',
              resolvedHost: cleanHost,
              companyName: wl?.companyName || tenant.name,
              tradeName: wl?.legalName || tenant.tradeName || tenant.name,
              logoUrl: wl?.logoUrl || null,
              faviconUrl: wl?.faviconUrl || null,
              primaryColor: wl?.primaryColor || '#64748b',
              secondaryColor: wl?.secondaryColor || '#475569',
              accentColor: wl?.accentColor || '#94a3b8',
              loginBannerUrl: null,
              footerText: wl?.footerText || `© ${new Date().getFullYear()} ${wl?.companyName || tenant.name}`,
              supportEmail: wl?.supportEmail || 'suporte@sentinelconsig.com.br',
              supportPhone: wl?.supportPhone || null,
              themeMode: wl?.themeMode || 'LIGHT',
            },
          };
          this.brandingCache.set(cleanHost, {
            result: suspendedResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          return suspendedResult;
        }

        if (tenant.deletedAt || tenant.status !== 'ACTIVE') {
          // CANCELLED, PENDING_DELETION, etc.
          const inactiveResult: DomainResolutionResult = {
            type: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            tenant: null,
            branding: {
              status: 'DOMAIN_NOT_CONFIGURED',
              domainType: 'DOMAIN_NOT_CONFIGURED',
              resolvedHost: cleanHost,
              companyName: 'Organização Inativa',
              tradeName: 'Organização Inativa',
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
            result: inactiveResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          return inactiveResult;
        }

        // Se houver registro de TenantDomain específico para esse subdomínio, verificar status estrito
        const subdomainDomainRecord = tenant.domains?.find(
          (d) => d.domain.toLowerCase().trim() === cleanHost
        );
        if (subdomainDomainRecord && subdomainDomainRecord.status !== 'VERIFIED') {
          const unverifiedResult: DomainResolutionResult = {
            type: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            tenant: null,
            branding: {
              status: 'DOMAIN_NOT_CONFIGURED',
              domainType: 'DOMAIN_NOT_CONFIGURED',
              resolvedHost: cleanHost,
              companyName: 'Domínio Não Verificado',
              tradeName: 'Domínio Não Verificado',
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
            result: unverifiedResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          return unverifiedResult;
        }

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

    // Validação estrita do host antes de prosseguir com a busca do domínio customizado
    if (!this.isValidHostname(cleanHost)) {
      // Retorna domínio não configurado/inválido
      const invalidResult: DomainResolutionResult = {
        type: 'DOMAIN_NOT_CONFIGURED',
        resolvedHost: cleanHost,
        tenant: null,
        branding: {
          status: 'DOMAIN_NOT_CONFIGURED',
          domainType: 'DOMAIN_NOT_CONFIGURED',
          resolvedHost: cleanHost,
          companyName: 'Domínio Inválido',
          tradeName: 'Domínio Inválido',
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
        result: invalidResult,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return invalidResult;
    }

    // 3. Verifica se é um Domínio Personalizado (Custom Domain) verificado via TenantDomain
    const tenantDomain = await prisma.tenantDomain.findUnique({
      where: { domain: cleanHost },
      include: { 
        tenant: {
          include: { whiteLabel: true }
        }
      },
    });

    if (tenantDomain) {
      if (tenantDomain.status === 'VERIFIED') {
        if (tenantDomain.tenant.status === 'SUSPENDED') {
          const wl = tenantDomain.tenant.whiteLabel;
          const suspendedResult: DomainResolutionResult = {
            type: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            tenant: null,
            branding: {
              status: 'SUSPENDED',
              domainType: 'CUSTOM_DOMAIN',
              resolvedHost: cleanHost,
              plan: tenantDomain.tenant.plan,
              companyName: wl?.companyName || tenantDomain.tenant.name,
              tradeName: wl?.legalName || tenantDomain.tenant.tradeName || tenantDomain.tenant.name,
              logoUrl: wl?.logoUrl || null,
              faviconUrl: wl?.faviconUrl || null,
              primaryColor: wl?.primaryColor || '#64748b',
              secondaryColor: wl?.secondaryColor || '#475569',
              accentColor: wl?.accentColor || '#94a3b8',
              loginBannerUrl: null,
              footerText: wl?.footerText || `© ${new Date().getFullYear()} ${wl?.companyName || tenantDomain.tenant.name}`,
              supportEmail: wl?.supportEmail || 'suporte@sentinelconsig.com.br',
              supportPhone: wl?.supportPhone || null,
              themeMode: wl?.themeMode || 'LIGHT',
            },
          };
          this.brandingCache.set(cleanHost, {
            result: suspendedResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          return suspendedResult;
        }

        if (tenantDomain.tenant.deletedAt || tenantDomain.tenant.status !== 'ACTIVE') {
          const inactiveResult: DomainResolutionResult = {
            type: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            tenant: null,
            branding: {
              status: 'DOMAIN_NOT_CONFIGURED',
              domainType: 'DOMAIN_NOT_CONFIGURED',
              resolvedHost: cleanHost,
              companyName: 'Organização Inativa',
              tradeName: 'Organização Inativa',
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
            result: inactiveResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          return inactiveResult;
        }

        const tenant = tenantDomain.tenant;
        const wl = tenant.whiteLabel;
        const result: DomainResolutionResult = {
          type: 'CUSTOM_DOMAIN',
          resolvedHost: cleanHost,
          tenant,
          branding: {
            status: 'CONFIGURED',
            domainType: 'CUSTOM_DOMAIN',
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
    } else {
      // 3.1 Compatibilidade Controlada com customDomain Legado
      const legacyTenant = await prisma.tenant.findUnique({
        where: { customDomain: cleanHost },
        include: { whiteLabel: true },
      });

      if (legacyTenant) {
        if (legacyTenant.status === 'SUSPENDED') {
          const wl = legacyTenant.whiteLabel;
          const suspendedResult: DomainResolutionResult = {
            type: 'DOMAIN_NOT_CONFIGURED',
            resolvedHost: cleanHost,
            tenant: null,
            branding: {
              status: 'SUSPENDED',
              domainType: 'CUSTOM_DOMAIN',
              resolvedHost: cleanHost,
              plan: legacyTenant.plan,
              companyName: wl?.companyName || legacyTenant.name,
              tradeName: wl?.legalName || legacyTenant.tradeName || legacyTenant.name,
              logoUrl: wl?.logoUrl || null,
              faviconUrl: wl?.faviconUrl || null,
              primaryColor: wl?.primaryColor || '#64748b',
              secondaryColor: wl?.secondaryColor || '#475569',
              accentColor: wl?.accentColor || '#94a3b8',
              loginBannerUrl: null,
              footerText: wl?.footerText || `© ${new Date().getFullYear()} ${wl?.companyName || legacyTenant.name}`,
              supportEmail: wl?.supportEmail || 'suporte@sentinelconsig.com.br',
              supportPhone: wl?.supportPhone || null,
              themeMode: wl?.themeMode || 'LIGHT',
            },
          };
          this.brandingCache.set(cleanHost, {
            result: suspendedResult,
            expiresAt: Date.now() + this.CACHE_TTL_MS,
          });
          return suspendedResult;
        }

        if (legacyTenant.status === 'ACTIVE') {
          const wl = legacyTenant.whiteLabel;
          const result: DomainResolutionResult = {
            type: 'CUSTOM_DOMAIN',
            resolvedHost: cleanHost,
            tenant: legacyTenant,
            branding: {
              status: 'CONFIGURED',
              domainType: 'CUSTOM_DOMAIN',
              resolvedHost: cleanHost,
              tenantId: legacyTenant.id,
              plan: legacyTenant.plan,
              companyName: wl?.companyName || legacyTenant.name,
              tradeName: wl?.legalName || legacyTenant.tradeName || legacyTenant.name,
              logoUrl: wl?.logoUrl || null,
              faviconUrl: wl?.faviconUrl || null,
              primaryColor: wl?.primaryColor || '#2563eb',
              secondaryColor: wl?.secondaryColor || '#1e40af',
              accentColor: wl?.accentColor || '#3b82f6',
              loginBannerUrl: null,
              footerText: wl?.footerText || `© ${new Date().getFullYear()} ${wl?.companyName || legacyTenant.name}`,
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
