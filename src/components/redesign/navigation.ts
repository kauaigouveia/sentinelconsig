import { APP_ROUTES, canAccessRoute } from '../../router/routes';
import type { Role } from '../../types';

/**
 * Information architecture for the operator-facing workspace.
 * Presentation only: the router remains the authority for routes and RBAC.
 */
export const GROUPS = ['Início', 'Operação', 'Relacionamento', 'Gestão', 'Configurações', 'Plataforma'] as const;
export type NavigationGroup = (typeof GROUPS)[number];

export const AREA_SUMMARY: Record<NavigationGroup, string> = {
  'Início': 'Suas prioridades, tarefas e compromissos.',
  'Operação': 'Simular, cadastrar e acompanhar propostas.',
  'Relacionamento': 'Clientes, parceiros e atendimento.',
  'Gestão': 'Indicadores, resultados e decisões.',
  'Configurações': 'Bancos, integrações, usuários e regras.',
  'Plataforma': 'Empresas, assinaturas e capacidade.',
};

const homeRoutes = new Set(['/', '/dashboard', '/minha-fila', '/agenda-operacional']);
const relationshipRoutes = new Set(['/clientes', '/crm-parceiros', '/central-atendimento']);
const managementRoutes = new Set(['/financeiro-geral', '/gamificacao', '/tv-monitor']);

export function navigationGroup(path: string, category: string): NavigationGroup {
  if (homeRoutes.has(path) || category === 'Início') return 'Início';
  if (relationshipRoutes.has(path)) return 'Relacionamento';
  if (category === 'Plataforma') return 'Plataforma';
  if (category === 'Administração' || category === 'Integrações' || category === 'Sistema') return 'Configurações';
  if (category === 'Gestão' || managementRoutes.has(path)) return 'Gestão';
  return 'Operação';
}

const preferred = [
  '/', '/minha-fila', '/agenda-operacional',
  '/propostas', '/simulacoes', '/central-pendencias', '/esteira',
  '/portabilidade', '/roteiros', '/central-operacoes',
  '/clientes', '/crm-parceiros', '/central-atendimento',
  '/bi', '/financeiro-geral', '/radar-comercial', '/command-center',
  '/intelligence', '/automacoes',
  '/integracoes', '/bancos-promotoras', '/central-administracao',
  '/admin-usuarios', '/admin-produtos',
  '/empresas-assinaturas', '/meu-plano',
];

const workspaceLabels: Record<string, string> = {
  '/': 'Visão do dia',
  '/minha-fila': 'Minhas tarefas',
  '/agenda-operacional': 'Agenda',
  '/propostas': 'Propostas',
  '/simulacoes': 'Simular crédito',
  '/roteiros': 'Guias dos bancos',
  '/portabilidade': 'Portabilidade',
  '/central-pendencias': 'Pendências',
  '/esteira': 'Esteira Kanban',
  '/central-operacoes': 'Rotina da equipe',
  '/central-atendimento': 'Atendimento',
  '/crm-parceiros': 'Parceiros',
  '/clientes': 'Clientes 360°',
  '/financeiro-geral': 'Financeiro',
  '/bi': 'Indicadores',
  '/integracoes': 'Integrações bancárias',
  '/bancos-promotoras': 'Bancos e promotoras',
  '/saude-apis': 'Monitoramento de APIs',
  '/central-administracao': 'Administração geral',
  '/admin-usuarios': 'Usuários e acessos',
  '/admin-produtos': 'Produtos e regras',
};

const pagePurpose: Record<string, string> = {
  '/': 'Veja o que precisa de atenção hoje.',
  '/minha-fila': 'Acompanhe as atividades atribuídas a você.',
  '/agenda-operacional': 'Organize compromissos e prazos.',
  '/propostas': 'Consulte, registre e atualize operações.',
  '/simulacoes': 'Compare alternativas antes da contratação.',
  '/central-pendencias': 'Trate bloqueios e solicitações abertas.',
  '/esteira': 'Visualize propostas por etapa operacional.',
  '/portabilidade': 'Monitore operações de portabilidade.',
  '/roteiros': 'Consulte condições e orientações bancárias.',
  '/central-operacoes': 'Acompanhe a rotina da equipe.',
  '/clientes': 'Localize o histórico completo do cliente.',
  '/crm-parceiros': 'Gerencie os agentes e seus relacionamentos.',
  '/central-atendimento': 'Responda às solicitações de suporte.',
  '/bi': 'Analise a produção e as tendências.',
  '/financeiro-geral': 'Acompanhe resultados e movimentações.',
  '/integracoes': 'Gerencie conexões com instituições.',
  '/central-administracao': 'Configure a operação da empresa.',
  '/admin-usuarios': 'Controle perfis e permissões.',
};

/** Only display routes already authorized by the shared router. */
export function visibleNavigation(role?: Role, customPermissions: string[] = []) {
  return APP_ROUTES
    .filter(route => !route.isDynamic &&
      route.category !== 'Portal do Parceiro' &&
      route.path !== '/dashboard' &&
      canAccessRoute(route, role, customPermissions))
    .map(route => ({
      ...route,
      title: workspaceLabels[route.path] || route.title,
      description: pagePurpose[route.path] || route.title,
      group: navigationGroup(route.path, route.category),
    }))
    .sort((a, b) =>
      GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
      (preferred.includes(a.path) ? preferred.indexOf(a.path) : 100) -
      (preferred.includes(b.path) ? preferred.indexOf(b.path) : 100) ||
      a.title.localeCompare(b.title, 'pt-BR'));
}
