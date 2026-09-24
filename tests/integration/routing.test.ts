import { describe, it, expect } from 'vitest';
import { matchRoute, canAccessRoute, APP_ROUTES } from '../../src/router/routes';
import { Role } from '../../src/types';

describe('Sentinel Frontend Routing Suite', () => {
  describe('1. Canonical Routes & View ID Resolution', () => {
    it('matches root / and /dashboard to Dashboard view', () => {
      const rootMatch = matchRoute('/');
      expect(rootMatch).not.toBeNull();
      expect(rootMatch?.route.viewId).toBe('torre-controle');
      expect(rootMatch?.route.category).toBe('Início');

      const dashMatch = matchRoute('/dashboard');
      expect(dashMatch).not.toBeNull();
      expect(dashMatch?.route.viewId).toBe('torre-controle');
    });

    it('matches /propostas to Propostas view', () => {
      const match = matchRoute('/propostas');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('producao');
      expect(match?.route.title).toBe('Propostas');
    });

    it('matches /portabilidade to Portabilidade view', () => {
      const match = matchRoute('/portabilidade');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('portabilidades');
      expect(match?.route.title).toBe('Portabilidade (CIP)');
    });

    it('matches /simulacoes to Simulações view', () => {
      const match = matchRoute('/simulacoes');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('simulacoes');
      expect(match?.route.title).toBe('Simulações');
    });

    it('matches /crm-parceiros to CRM de Parceiros view', () => {
      const match = matchRoute('/crm-parceiros');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('parceiros');
      expect(match?.route.title).toBe('CRM de Parceiros');
    });

    it('matches /bi to BI Operacional view', () => {
      const match = matchRoute('/bi');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('dashboard-executivo');
      expect(match?.route.title).toBe('BI Operacional');
    });

    it('matches /automacoes to Central de Automações view', () => {
      const match = matchRoute('/automacoes');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('central-automacao');
      expect(match?.route.title).toBe('Central de Automações');
    });

    it('matches /command-center to Command Center view', () => {
      const match = matchRoute('/command-center');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('command-center');
      expect(match?.route.title).toBe('Sentinel Command Center');
    });

    it('matches /intelligence to Sentinel Intelligence view', () => {
      const match = matchRoute('/intelligence');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('sentinela-ai');
      expect(match?.route.title).toBe('Sentinel Intelligence');
    });

    it('matches /central-pendencias to Central de Pendências view', () => {
      const match = matchRoute('/central-pendencias');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('central-pendencias');
      expect(match?.route.title).toBe('Central de Pendências');
    });

    it('matches /integracoes to Hub de Integrações view', () => {
      const match = matchRoute('/integracoes');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('hub-integracoes');
      expect(match?.route.title).toBe('Hub de Integrações');
    });

    it('matches /bancos-promotoras to Bancos & Promotoras view', () => {
      const match = matchRoute('/bancos-promotoras');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('promotoras');
      expect(match?.route.title).toBe('Bancos & Promotoras');
    });

    it('matches /saude-apis to Saúde das APIs view', () => {
      const match = matchRoute('/saude-apis');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('admin-c6-bank');
      expect(match?.route.title).toBe('Saúde das APIs');
    });

    it('matches /central-administracao to Central de Administração view', () => {
      const match = matchRoute('/central-administracao');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('central-administracao');
      expect(match?.route.title).toBe('Central de Administração');
    });

    it('matches /empresas-assinaturas to Empresas & Assinaturas view', () => {
      const match = matchRoute('/empresas-assinaturas');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('saas-tenants');
      expect(match?.route.title).toBe('Empresas & Assinaturas');
    });

    it('matches /meu-plano to Meu Plano & Consumo view', () => {
      const match = matchRoute('/meu-plano');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('admin-plano-consumo');
      expect(match?.route.title).toBe('Meu Plano & Consumo');
    });
  });

  describe('2. Dynamic Routes & Deep Linking with Parameters', () => {
    it('matches /propostas/:id and extracts proposal ID', () => {
      const match = matchRoute('/propostas/cmu_prop_88712');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('producao');
      expect(match?.params.id).toBe('cmu_prop_88712');
    });

    it('matches /command-center/incidents/:id and extracts incident ID', () => {
      const match = matchRoute('/command-center/incidents/INC-2026-001');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('command-center');
      expect(match?.params.id).toBe('INC-2026-001');
    });

    it('matches /intelligence/insights/:id and extracts insight ID', () => {
      const match = matchRoute('/intelligence/insights/INS-BOTTLENECK-01');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('sentinela-ai');
      expect(match?.params.id).toBe('INS-BOTTLENECK-01');
    });

    it('matches /integracoes/:slug and extracts bank slug', () => {
      const match = matchRoute('/integracoes/c6');
      expect(match).not.toBeNull();
      expect(match?.route.viewId).toBe('hub-integracoes');
      expect(match?.params.slug).toBe('c6');
    });
  });

  describe('3. Backward-Compatibility Aliases', () => {
    it('matches legacy /producao to Propostas', () => {
      const match = matchRoute('/producao');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/propostas');
      expect(match?.route.viewId).toBe('producao');
    });

    it('matches legacy /portabilidades to Portabilidade', () => {
      const match = matchRoute('/portabilidades');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/portabilidade');
    });

    it('matches legacy /parceiros to CRM de Parceiros', () => {
      const match = matchRoute('/parceiros');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/crm-parceiros');
    });

    it('matches legacy /dashboard-executivo to BI Operacional', () => {
      const match = matchRoute('/dashboard-executivo');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/bi');
    });

    it('matches legacy /central-automacao to Automações', () => {
      const match = matchRoute('/central-automacao');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/automacoes');
    });

    it('matches legacy /sentinela-ai to Sentinel Intelligence', () => {
      const match = matchRoute('/sentinela-ai');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/intelligence');
    });

    it('matches legacy /pendencias to Central de Pendências', () => {
      const match = matchRoute('/pendencias');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/central-pendencias');
    });

    it('matches legacy /hub-integracoes to Hub de Integrações', () => {
      const match = matchRoute('/hub-integracoes');
      expect(match).not.toBeNull();
      expect(match?.route.path).toBe('/integracoes');
    });
  });

  describe('4. 404 Unknown Route Handling', () => {
    it('returns null for non-existent frontend routes', () => {
      expect(matchRoute('/pagina-fantasma-xyz')).toBeNull();
      expect(matchRoute('/admin/unknown-section')).toBeNull();
    });
  });

  describe('5. RBAC Route Access Authorization', () => {
    const biRoute = APP_ROUTES.find((r) => r.path === '/bi')!;
    const autoRoute = APP_ROUTES.find((r) => r.path === '/automacoes')!;
    const commandRoute = APP_ROUTES.find((r) => r.path === '/command-center')!;
    const intelRoute = APP_ROUTES.find((r) => r.path === '/intelligence')!;
    const adminRoute = APP_ROUTES.find((r) => r.path === '/central-administracao')!;

    it('grants full access to PLATFORM_MASTER on all routes', () => {
      expect(canAccessRoute(biRoute, 'PLATFORM_MASTER')).toBe(true);
      expect(canAccessRoute(autoRoute, 'PLATFORM_MASTER')).toBe(true);
      expect(canAccessRoute(commandRoute, 'PLATFORM_MASTER')).toBe(true);
      expect(canAccessRoute(intelRoute, 'PLATFORM_MASTER')).toBe(true);
      expect(canAccessRoute(adminRoute, 'PLATFORM_MASTER')).toBe(true);
    });

    it('checks standard role permissions for TENANT_ADMIN', () => {
      expect(canAccessRoute(biRoute, 'TENANT_ADMIN')).toBe(true);
      expect(canAccessRoute(autoRoute, 'TENANT_ADMIN')).toBe(true);
      expect(canAccessRoute(commandRoute, 'TENANT_ADMIN')).toBe(true);
      expect(canAccessRoute(intelRoute, 'TENANT_ADMIN')).toBe(true);
      expect(canAccessRoute(adminRoute, 'TENANT_ADMIN')).toBe(true);
    });

    it('blocks DIGITADOR from restricted routes without custom permissions', () => {
      expect(canAccessRoute(biRoute, 'DIGITADOR')).toBe(false);
      expect(canAccessRoute(autoRoute, 'DIGITADOR')).toBe(false);
      expect(canAccessRoute(commandRoute, 'DIGITADOR')).toBe(false);
      expect(canAccessRoute(intelRoute, 'DIGITADOR')).toBe(false);
      expect(canAccessRoute(adminRoute, 'DIGITADOR')).toBe(false);
    });

    it('grants access to DIGITADOR if granted customPermission', () => {
      expect(canAccessRoute(biRoute, 'DIGITADOR', ['bi.view'])).toBe(true);
      expect(canAccessRoute(autoRoute, 'DIGITADOR', ['automations.view'])).toBe(true);
      expect(canAccessRoute(commandRoute, 'DIGITADOR', ['command.view'])).toBe(true);
      expect(canAccessRoute(intelRoute, 'DIGITADOR', ['intelligence.view'])).toBe(true);
    });
  });

  describe('6. Breadcrumbs Generation', () => {
    it('generates breadcrumbs for canonical routes', () => {
      const match = matchRoute('/propostas')!;
      const crumbs = match.route.getBreadcrumbs ? match.route.getBreadcrumbs({}) : [];
      expect(crumbs.length).toBeGreaterThan(1);
      expect(crumbs[0].label).toBe('Início');
      expect(crumbs[crumbs.length - 1].label).toBe('Propostas');
    });

    it('generates dynamic breadcrumbs for proposal details', () => {
      const match = matchRoute('/propostas/98765')!;
      const crumbs = match.route.getBreadcrumbs ? match.route.getBreadcrumbs(match.params) : [];
      expect(crumbs.some((c) => c.label === '#98765')).toBe(true);
    });

    it('generates dynamic breadcrumbs for command center incidents', () => {
      const match = matchRoute('/command-center/incidents/INC-100')!;
      const crumbs = match.route.getBreadcrumbs ? match.route.getBreadcrumbs(match.params) : [];
      expect(crumbs.some((c) => c.label.includes('INC-100'))).toBe(true);
    });
  });
});
