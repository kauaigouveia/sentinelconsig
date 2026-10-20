import { Role } from '../types';
import type { TenantBranding } from '../hooks/useTenantBranding';

// Presentation fallback only: domain status and authentication checks stay intact.
export function resolveAuthenticatedBranding(
  branding: TenantBranding,
  authenticated: boolean,
  tenant: { name?: string; whiteLabel?: { logoUrl?: string | null } } | null,
  whiteLabel?: { logoUrl?: string | null } | null,
): TenantBranding {
  if (!authenticated || !tenant?.name || (branding.status !== 'DOMAIN_NOT_CONFIGURED' && branding.status !== 'PLATFORM_DEFAULT')) return branding;
  return { ...branding, companyName: tenant.name, logoUrl: tenant.whiteLabel?.logoUrl || whiteLabel?.logoUrl || null };
}

export interface EffectiveTenantBranding {
  tenantId: string;
  tenantName: string;
  logoUrl: string | null;
  plan?: string | null;
  tradeName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
}

export const SYSTEM_IDENTITY = {
  name: 'Sentinel Consig',
  displayName: 'SENTINEL CONSIG',
  tagline: 'Inteligência que antecipa. Controle que transforma.',
  shortTagline: 'Veja. Antecipe. Comande.',
  description: 'Sentinel Consig — inteligência operacional, controle e automação para sua operação.',
  title: 'Sentinel Consig | Inteligência que antecipa. Controle que transforma.',
  badge: 'ENTERPRISE',
  subtitle: 'Veja. Antecipe. Comande.',
  defaultLogo: '/branding/sentinel-icon-transparent-v3.png',
};

export function resolveEffectiveTenantBranding(
  activeUser: { role?: Role | string; tenantId?: string } | null,
  currentTenant: { id?: string; name?: string; tradeName?: string; whiteLabel?: any; plan?: string } | null,
  whiteLabel: any | null,
  adminContext?: { active: boolean; context?: { targetTenantId: string; targetTenantName: string } } | null
): EffectiveTenantBranding {
  let effectiveTenantId = activeUser?.tenantId || currentTenant?.id || 'sentinel-consig';
  let effectiveTenantName = currentTenant?.name || whiteLabel?.companyName || 'Sentinel Consig';
  let logoUrl: string | null = null;
  let tradeName: string | null = null;
  let primaryColor: string | null = null;
  let secondaryColor: string | null = null;
  let accentColor: string | null = null;

  if (activeUser?.role === 'PLATFORM_MASTER') {
    if (adminContext?.active && adminContext.context?.targetTenantName) {
      effectiveTenantId = adminContext.context.targetTenantId;
      effectiveTenantName = adminContext.context.targetTenantName;
      if (whiteLabel?.logoUrl && !whiteLabel.logoUrl.startsWith('/branding/sentinel-')) {
        logoUrl = whiteLabel.logoUrl;
      }
    } else {
      effectiveTenantId = 'platform';
      effectiveTenantName = 'PLATAFORMA';
      logoUrl = SYSTEM_IDENTITY.defaultLogo;
    }
  } else {
    effectiveTenantId = activeUser?.tenantId || currentTenant?.id || 'sentinel-consig';
    effectiveTenantName = currentTenant?.name || whiteLabel?.companyName || 'Sentinel Consig';
    if (whiteLabel?.logoUrl && !whiteLabel.logoUrl.startsWith('/branding/sentinel-')) {
      logoUrl = whiteLabel.logoUrl;
    }
  }

  // Fallback Rule for Logo
  const finalLogoUrl = logoUrl || SYSTEM_IDENTITY.defaultLogo;
  let plan = whiteLabel?.plan || currentTenant?.plan || null;

  return {
    tenantId: effectiveTenantId,
    tenantName: effectiveTenantName,
    logoUrl: finalLogoUrl,
    plan,
    tradeName: whiteLabel?.tradeName || currentTenant?.tradeName || null,
    primaryColor: whiteLabel?.primaryColor || currentTenant?.whiteLabel?.primaryColor || null,
    secondaryColor: whiteLabel?.secondaryColor || currentTenant?.whiteLabel?.secondaryColor || null,
    accentColor: whiteLabel?.accentColor || currentTenant?.whiteLabel?.accentColor || null,
  };
}
