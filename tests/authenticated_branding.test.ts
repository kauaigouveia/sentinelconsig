import { describe, expect, it } from 'vitest';
import { resolveAuthenticatedBranding } from '../src/lib/branding';
import type { TenantBranding } from '../src/hooks/useTenantBranding';
const unresolved: TenantBranding = { status: 'DOMAIN_NOT_CONFIGURED', domainType: 'DOMAIN_NOT_CONFIGURED', companyName: 'Domínio Não Configurado', primaryColor: '#64748b', secondaryColor: '#475569', accentColor: '#94a3b8' };
describe('authenticated tenant branding fallback', () => {
  it('uses the signed-in company and logo without changing the domain verdict', () => {
    expect(resolveAuthenticatedBranding(unresolved, true, { name: 'Empresa Exemplo' }, { logoUrl: '/company.svg' })).toMatchObject({ companyName: 'Empresa Exemplo', logoUrl: '/company.svg', status: 'DOMAIN_NOT_CONFIGURED', domainType: 'DOMAIN_NOT_CONFIGURED' });
  });
  it('does not replace the public login identity with stored company data', () => {
    expect(resolveAuthenticatedBranding(unresolved, false, { name: 'Empresa Exemplo' })).toBe(unresolved);
  });
  it('preserves resolved and suspended branding', () => {
    for (const status of ['ACTIVE', 'SUSPENDED'] as const) {
      const branding = { ...unresolved, status, companyName: 'Marca Oficial' };
      expect(resolveAuthenticatedBranding(branding, true, { name: 'Razão Social' })).toBe(branding);
    }
  });
  it('uses current company on platform fallback and follows company switches', () => {
    const branding = { ...unresolved, status: 'PLATFORM_DEFAULT' as const };
    expect(resolveAuthenticatedBranding(branding, true, { name: 'Empresa A' }).companyName).toBe('Empresa A');
    expect(resolveAuthenticatedBranding(branding, true, { name: 'Empresa B' }).companyName).toBe('Empresa B');
  });
});
