import { Role } from '../types';
import { Permission, hasPermission } from '../lib/permissions';

export interface RouteBreadcrumb {
  label: string;
  path?: string;
}

export interface RouteConfig {
  path: string;
  viewId: string;
  title: string;
  category: 'Início' | 'Operação' | 'Integrações' | 'Gestão' | 'Administração' | 'Plataforma' | 'Sistema' | 'Portal do Parceiro';
  requiredPermission?: Permission | Permission[];
  requiredRoles?: Role[];
  aliases?: string[];
  isDynamic?: boolean;
  getBreadcrumbs?: (params: Record<string, string>) => RouteBreadcrumb[];
}

export const APP_ROUTES: RouteConfig[] = [
  { path: '/roteiros', viewId: 'roteiros', title: 'Roteiros', category: 'Operação', requiredPermission: 'simulations.view' },
  // 1. INÍCIO
  {
    path: '/',
    viewId: 'torre-controle',
    title: 'Dashboard / Início',
    category: 'Início',
    requiredPermission: 'dashboard.view',
    aliases: ['/torre-controle'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Dashboard' },
    ],
  },
  {
    path: '/dashboard',
    viewId: 'torre-controle',
    title: 'Dashboard',
    category: 'Início',
    requiredPermission: 'dashboard.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Dashboard' },
    ],
  },

  // 2. OPERAÇÃO
  {
    path: '/central-pendencias',
    viewId: 'central-pendencias',
    title: 'Central de Pendências',
    category: 'Operação',
    requiredPermission: 'pendencies.view',
    aliases: ['/pendencias', '/pendencias-central'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Central de Pendências', path: '/central-pendencias' },
    ],
  },
  {
    path: '/propostas',
    viewId: 'producao',
    title: 'Propostas',
    category: 'Operação',
    requiredPermission: 'proposals.view',
    aliases: ['/producao'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Propostas', path: '/propostas' },
    ],
  },
  {
    path: '/propostas/:id',
    viewId: 'producao',
    title: 'Detalhes da Proposta',
    category: 'Operação',
    requiredPermission: 'proposals.view',
    isDynamic: true,
    getBreadcrumbs: (params) => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Propostas', path: '/propostas' },
      { label: `#${params.id || 'Detalhes'}` },
    ],
  },
  {
    path: '/portabilidade',
    viewId: 'portabilidades',
    title: 'Portabilidade (CIP)',
    category: 'Operação',
    requiredPermission: 'proposals.view',
    aliases: ['/portabilidades'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Portabilidade (CIP)', path: '/portabilidade' },
    ],
  },
  {
    path: '/simulacoes',
    viewId: 'simulacoes',
    title: 'Simulações',
    category: 'Operação',
    requiredPermission: 'simulations.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Simulações', path: '/simulacoes' },
    ],
  },
  {
    path: '/crm-parceiros',
    viewId: 'parceiros',
    title: 'CRM de Parceiros',
    category: 'Operação',
    requiredPermission: ['partners.crm.view', 'partners.view'],
    aliases: ['/parceiros'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'CRM de Parceiros', path: '/crm-parceiros' },
    ],
  },

  // 3. INTEGRAÇÕES
  {
    path: '/integracoes',
    viewId: 'hub-integracoes',
    title: 'Hub de Integrações',
    category: 'Integrações',
    requiredPermission: 'integrations.view',
    aliases: ['/hub-integracoes', '/integracoes-hub'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Integrações' },
      { label: 'Hub de Integrações', path: '/integracoes' },
    ],
  },
  {
    path: '/integracoes/:slug',
    viewId: 'hub-integracoes',
    title: 'Integração Bancária',
    category: 'Integrações',
    requiredPermission: 'integrations.view',
    isDynamic: true,
    getBreadcrumbs: (params) => [
      { label: 'Início', path: '/' },
      { label: 'Integrações' },
      { label: 'Hub de Integrações', path: '/integracoes' },
      { label: params.slug?.toUpperCase() || 'Banco' },
    ],
  },
  {
    path: '/bancos-promotoras',
    viewId: 'promotoras',
    title: 'Bancos & Promotoras',
    category: 'Integrações',
    requiredPermission: ['promoters.view', 'banks.view', 'integrations.view'],
    aliases: ['/promotoras', '/admin-bancos'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Integrações' },
      { label: 'Bancos & Promotoras', path: '/bancos-promotoras' },
    ],
  },
  {
    path: '/saude-apis',
    viewId: 'admin-c6-bank',
    title: 'Saúde das APIs',
    category: 'Integrações',
    requiredPermission: ['integrations.health', 'integrations.view'],
    aliases: ['/admin-c6-bank'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Integrações' },
      { label: 'Saúde das APIs', path: '/saude-apis' },
    ],
  },

  // 4. GESTÃO
  {
    path: '/bi',
    viewId: 'dashboard-executivo',
    title: 'BI Operacional',
    category: 'Gestão',
    requiredPermission: 'bi.view',
    aliases: ['/dashboard-executivo'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'BI Operacional', path: '/bi' },
    ],
  },
  {
    path: '/automacoes',
    viewId: 'central-automacao',
    title: 'Central de Automações',
    category: 'Gestão',
    requiredPermission: 'automations.view',
    aliases: ['/central-automacao'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Central de Automações', path: '/automacoes' },
    ],
  },
  {
    path: '/command-center',
    viewId: 'command-center',
    title: 'Sentinel Command Center',
    category: 'Gestão',
    requiredPermission: 'command.view',
    aliases: ['/command'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Command Center', path: '/command-center' },
    ],
  },
  {
    path: '/command-center/incidents/:id',
    viewId: 'command-center',
    title: 'Incidente — Command Center',
    category: 'Gestão',
    requiredPermission: 'command.view',
    isDynamic: true,
    getBreadcrumbs: (params) => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Command Center', path: '/command-center' },
      { label: `Incidente ${params.id || ''}` },
    ],
  },
  {
    path: '/intelligence',
    viewId: 'sentinela-ai',
    title: 'Sentinel Intelligence',
    category: 'Gestão',
    requiredPermission: 'intelligence.view',
    aliases: ['/sentinela-ai', '/sentinel-intelligence'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Sentinel Intelligence', path: '/intelligence' },
    ],
  },
  {
    path: '/intelligence/insights/:id',
    viewId: 'sentinela-ai',
    title: 'Insight — Sentinel Intelligence',
    category: 'Gestão',
    requiredPermission: 'intelligence.view',
    isDynamic: true,
    getBreadcrumbs: (params) => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Sentinel Intelligence', path: '/intelligence' },
      { label: `Insight ${params.id || ''}` },
    ],
  },

  // 5. ADMINISTRAÇÃO
  {
    path: '/central-administracao',
    viewId: 'central-administracao',
    title: 'Central de Administração',
    category: 'Administração',
    // This page aggregates modules beyond user management. Users with only
    // users.view have a dedicated /admin-usuarios route.
    requiredPermission: 'admin.view',
    aliases: ['/administracao'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração' },
      { label: 'Central de Administração', path: '/central-administracao' },
    ],
  },

  // 6. PLATAFORMA
  {
    path: '/empresas-assinaturas',
    viewId: 'saas-tenants',
    title: 'Empresas & Assinaturas',
    category: 'Plataforma',
    requiredPermission: 'tenants.view',
    aliases: ['/saas-tenants'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Plataforma' },
      { label: 'Empresas & Assinaturas', path: '/empresas-assinaturas' },
    ],
  },
  {
    path: '/meu-plano',
    viewId: 'admin-plano-consumo',
    title: 'Meu Plano & Consumo',
    category: 'Plataforma',
    requiredPermission: 'tenants.view',
    aliases: ['/admin-plano-consumo'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Plataforma' },
      { label: 'Meu Plano & Consumo', path: '/meu-plano' },
    ],
  },

  // 7. SUB-ROTAS OPERACIONAIS E ADMIN EXISTENTES
  {
    path: '/esteira',
    viewId: 'esteira',
    title: 'Esteira Kanban',
    category: 'Operação',
    requiredPermission: 'proposals.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação', path: '/propostas' },
      { label: 'Esteira Kanban' },
    ],
  },
  {
    path: '/clientes',
    viewId: 'clientes',
    title: 'Clientes 360º & CRM',
    category: 'Operação',
    requiredPermission: 'clients.view',
    aliases: ['/busca-cpf', '/pesquisa-cpf'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Clientes 360º & CRM' },
    ],
  },
  {
    path: '/tv-monitor',
    viewId: 'tv-monitor',
    title: 'Monitor TV Operações',
    category: 'Operação',
    requiredPermission: 'dashboard.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Monitor TV' },
    ],
  },
  {
    path: '/radar-comercial',
    viewId: 'radar-comercial',
    title: 'Radar Comercial & BI',
    category: 'Gestão',
    requiredPermission: 'bi.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Radar Comercial' },
    ],
  },
  {
    path: '/agenda-operacional',
    viewId: 'agenda-operacional',
    title: 'Agenda & Tarefas',
    category: 'Operação',
    requiredPermission: 'tasks.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Agenda & Tarefas' },
    ],
  },
  {
    path: '/minha-fila',
    viewId: 'minha-fila',
    title: 'Minha Fila',
    category: 'Operação',
    requiredPermission: ['tasks.view', 'partners.crm.view', 'partners.crm.tasks', 'partners.crm.admin'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Rotina' },
      { label: 'Minha Fila' },
    ],
  },
  {
    path: '/gamificacao',
    viewId: 'gamificacao',
    title: 'Conquistas & Metas',
    category: 'Operação',
    requiredPermission: 'proposals.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Conquistas & Metas' },
    ],
  },
  {
    path: '/financeiro-geral',
    viewId: 'financeiro-geral',
    title: 'Fluxo Financeiro',
    category: 'Gestão',
    requiredPermission: 'financial.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Fluxo Financeiro' },
    ],
  },
  {
    path: '/relatorio-gargalos',
    viewId: 'relatorio-gargalos',
    title: 'Gargalos & Permanência',
    category: 'Gestão',
    requiredPermission: 'bi.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Gestão' },
      { label: 'Gargalos & Permanência' },
    ],
  },
  {
    path: '/central-operacoes',
    viewId: 'central-operacoes',
    title: 'Central de Operações',
    category: 'Operação',
    requiredPermission: 'proposals.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Central de Operações' },
    ],
  },
  {
    path: '/admin-usuarios',
    viewId: 'admin-usuarios',
    title: 'Usuários & Permissões',
    category: 'Administração',
    requiredPermission: ['admin.view', 'users.view'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Usuários' },
    ],
  },
  {
    path: '/admin-produtos',
    viewId: 'admin-produtos',
    title: 'Produtos & Regras',
    category: 'Administração',
    requiredPermission: ['admin.view', 'products.view'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Produtos' },
    ],
  },
  {
    path: '/admin-status',
    viewId: 'admin-status',
    title: 'Status & Regras',
    category: 'Administração',
    requiredPermission: 'statuses.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Status' },
    ],
  },
  {
    path: '/admin-calendario',
    viewId: 'admin-calendario',
    title: 'Feriados & Prazos SLA',
    category: 'Administração',
    requiredPermission: 'admin.view',
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Calendário' },
    ],
  },
  {
    path: '/admin-auditoria',
    viewId: 'admin-auditoria',
    title: 'Auditoria & Logs',
    category: 'Administração',
    requiredPermission: ['users.view', 'audit_logs.view'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Auditoria' },
    ],
  },
  {
    path: '/admin-comunicados',
    viewId: 'admin-comunicados',
    title: 'Comunicados do Sistema',
    category: 'Administração',
    requiredPermission: ['admin.view', 'settings.manage', 'admin.manage'],
    requiredRoles: ['MASTER', 'PLATFORM_MASTER'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Comunicados' },
    ],
  },
  {
    path: '/admin-import-status',
    viewId: 'admin-import-status',
    title: 'Importação de Status',
    category: 'Administração',
    requiredPermission: ['statuses.manage', 'proposals.update'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Administração', path: '/central-administracao' },
      { label: 'Importação de Status' },
    ],
  },

  // 8. ATENDIMENTO ADMINISTRATIVO
  {
    path: '/central-atendimento',
    viewId: 'central-atendimento',
    title: 'Central de Atendimento',
    category: 'Operação',
    requiredPermission: 'support.view',
    aliases: ['/suporte-central', '/atendimento-parceiros'],
    getBreadcrumbs: () => [
      { label: 'Início', path: '/' },
      { label: 'Operação' },
      { label: 'Central de Atendimento', path: '/central-atendimento' },
    ],
  },

  // 9. PORTAL DO PARCEIRO (ÁREA EXTERNA ISOLADA)
  {
    path: '/parceiro',
    viewId: 'portal-parceiro',
    title: 'Portal do Parceiro',
    category: 'Portal do Parceiro',
    aliases: ['/parceiro/dashboard'],
    getBreadcrumbs: () => [
      { label: 'Portal do Parceiro', path: '/parceiro' },
      { label: 'Dashboard' },
    ],
  },
  {
    path: '/parceiro/propostas',
    viewId: 'portal-parceiro-propostas',
    title: 'Minhas Propostas',
    category: 'Portal do Parceiro',
    getBreadcrumbs: () => [
      { label: 'Portal do Parceiro', path: '/parceiro' },
      { label: 'Propostas' },
    ],
  },
  {
    path: '/parceiro/propostas/:id',
    viewId: 'portal-parceiro-propostas',
    title: 'Detalhes da Proposta',
    category: 'Portal do Parceiro',
    isDynamic: true,
    getBreadcrumbs: (params) => [
      { label: 'Portal do Parceiro', path: '/parceiro' },
      { label: 'Propostas', path: '/parceiro/propostas' },
      { label: `#${params.id || 'Detalhes'}` },
    ],
  },
  {
    path: '/parceiro/atendimento',
    viewId: 'portal-parceiro-atendimento',
    title: 'Atendimento & Suporte',
    category: 'Portal do Parceiro',
    aliases: ['/parceiro/suporte', '/parceiro/chat'],
    getBreadcrumbs: () => [
      { label: 'Portal do Parceiro', path: '/parceiro' },
      { label: 'Atendimento' },
    ],
  },
  {
    path: '/parceiro/perfil',
    viewId: 'portal-parceiro-perfil',
    title: 'Meu Cadastro & Senha',
    category: 'Portal do Parceiro',
    aliases: ['/parceiro/cadastro', '/parceiro/seguranca'],
    getBreadcrumbs: () => [
      { label: 'Portal do Parceiro', path: '/parceiro' },
      { label: 'Meu Cadastro' },
    ],
  },
  {
    path: '/parceiro/login',
    viewId: 'portal-parceiro-login',
    title: 'Login do Parceiro',
    category: 'Portal do Parceiro',
    getBreadcrumbs: () => [
      { label: 'Portal do Parceiro', path: '/parceiro' },
      { label: 'Login' },
    ],
  },
];

export interface MatchResult {
  route: RouteConfig;
  params: Record<string, string>;
}

/**
 * Matches a pathname string against defined routes.
 * Supports static routes, exact aliases, and dynamic parameter routes like /propostas/:id.
 */
export function matchRoute(pathname: string): MatchResult | null {
  const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';

  // 1. Direct exact match on path or aliases
  for (const route of APP_ROUTES) {
    if (route.path === cleanPath) {
      return { route, params: {} };
    }
    if (route.aliases && route.aliases.includes(cleanPath)) {
      return { route, params: {} };
    }
  }

  // 2. Pattern match for dynamic routes (e.g. /propostas/:id)
  const dynamicRoutes = APP_ROUTES.filter((r) => r.isDynamic);
  const pathParts = cleanPath.split('/').filter(Boolean);

  for (const route of dynamicRoutes) {
    const routeParts = route.path.split('/').filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let isMatch = true;

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        const paramName = routeParts[i].slice(1);
        try {
          params[paramName] = decodeURIComponent(pathParts[i]);
        } catch {
          // Malformed percent-encoding should behave like an unknown route,
          // not throw during application render.
          isMatch = false;
          break;
        }
      } else if (routeParts[i] !== pathParts[i]) {
        isMatch = false;
        break;
      }
    }

    if (isMatch) {
      return { route, params };
    }
  }

  return null;
}

/**
 * Checks whether user has permission to access the route.
 */
export function canAccessRoute(
  route: RouteConfig,
  role?: Role,
  customPermissions: string[] = []
): boolean {
  if (route.requiredRoles?.length && (!role || !route.requiredRoles.includes(role))) return false;
  if (!route.requiredPermission) return true;
  if (!role) return false;
  if (role === 'PLATFORM_MASTER') return true;

  const perms = Array.isArray(route.requiredPermission)
    ? route.requiredPermission
    : [route.requiredPermission];

  // If multiple permissions are specified, user must have at least one of them
  return perms.some((p) => hasPermission(role, customPermissions, p));
}
