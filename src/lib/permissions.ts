import { Role } from '../types';

export type Permission =
  | 'dashboard.view'
  | 'clients.view' | 'clients.create' | 'clients.update' | 'clients.delete'
  | 'proposals.view' | 'proposals.create' | 'proposals.update' | 'proposals.delete'
  | 'statuses.view' | 'statuses.manage'
  | 'ades.view' | 'ades.create' | 'ades.update' | 'ades.delete'
  | 'tasks.view' | 'tasks.create' | 'tasks.update' | 'tasks.delete'
  | 'partners.view' | 'partners.create' | 'partners.update' | 'partners.delete'
  | 'promoters.view' | 'promoters.create' | 'promoters.update' | 'promoters.delete'
  | 'banks.view' | 'banks.create' | 'banks.update' | 'banks.delete'
  | 'products.view' | 'products.create' | 'products.update' | 'products.delete'
  | 'financial.view' | 'financial.create' | 'financial.update' | 'financial.delete'
  | 'users.view' | 'users.create' | 'users.update' | 'users.delete' | 'users.reset_password'
  | 'notifications.view' | 'notifications.manage'
  | 'audit_logs.view'
  | 'whitelabel.view' | 'whitelabel.manage'
  | 'tenants.view' | 'tenants.create' | 'tenants.update' | 'tenants.suspend' | 'tenants.delete'
  | 'settings.view' | 'settings.manage'
  // NOVOS MÓDULOS OPERACIONAIS (Fases 1-7)
  | 'simulations.view' | 'simulations.create' | 'simulations.update' | 'simulations.delete'
  | 'automations.view' | 'automations.create' | 'automations.update' | 'automations.delete' | 'automations.execute'
  | 'bi.view' | 'bi.export'
  | 'integrations.view' | 'integrations.manage' | 'integrations.sync'
  | 'pendencies.view' | 'pendencies.create' | 'pendencies.update' | 'pendencies.delete' | 'pendencies.resolve'
  | 'intelligence.view' | 'intelligence.execute'
  | 'admin.view' | 'admin.manage';

export interface PermissionCategory {
  category: string;
  label: string;
  permissions: { id: Permission; label: string }[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    category: 'DASHBOARD',
    label: 'Dashboard & Indicadores',
    permissions: [
      { id: 'dashboard.view', label: 'Visualizar Painel' },
    ],
  },
  {
    category: 'CLIENTES',
    label: 'Clientes',
    permissions: [
      { id: 'clients.view', label: 'Visualizar' },
      { id: 'clients.create', label: 'Criar' },
      { id: 'clients.update', label: 'Editar' },
      { id: 'clients.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'PROPOSTAS',
    label: 'Propostas & Esteira',
    permissions: [
      { id: 'proposals.view', label: 'Visualizar' },
      { id: 'proposals.create', label: 'Criar' },
      { id: 'proposals.update', label: 'Editar' },
      { id: 'proposals.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'STATUS',
    label: 'Status da Esteira',
    permissions: [
      { id: 'statuses.view', label: 'Visualizar' },
      { id: 'statuses.manage', label: 'Gerenciar' },
    ],
  },
  {
    category: 'ADE',
    label: 'ADEs (Contratos)',
    permissions: [
      { id: 'ades.view', label: 'Visualizar' },
      { id: 'ades.create', label: 'Criar' },
      { id: 'ades.update', label: 'Editar' },
      { id: 'ades.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'TAREFAS',
    label: 'Tarefas Operacionais',
    permissions: [
      { id: 'tasks.view', label: 'Visualizar' },
      { id: 'tasks.create', label: 'Criar' },
      { id: 'tasks.update', label: 'Editar' },
      { id: 'tasks.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'PARCEIROS',
    label: 'Parceiros & Corretores',
    permissions: [
      { id: 'partners.view', label: 'Visualizar' },
      { id: 'partners.create', label: 'Criar' },
      { id: 'partners.update', label: 'Editar' },
      { id: 'partners.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'PROMOTORAS',
    label: 'Promotoras',
    permissions: [
      { id: 'promoters.view', label: 'Visualizar' },
      { id: 'promoters.create', label: 'Criar' },
      { id: 'promoters.update', label: 'Editar' },
      { id: 'promoters.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'BANCOS',
    label: 'Bancos',
    permissions: [
      { id: 'banks.view', label: 'Visualizar' },
      { id: 'banks.create', label: 'Criar' },
      { id: 'banks.update', label: 'Editar' },
      { id: 'banks.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'PRODUTOS',
    label: 'Produtos Consignados',
    permissions: [
      { id: 'products.view', label: 'Visualizar' },
      { id: 'products.create', label: 'Criar' },
      { id: 'products.update', label: 'Editar' },
      { id: 'products.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'FINANCEIRO',
    label: 'Financeiro',
    permissions: [
      { id: 'financial.view', label: 'Visualizar' },
      { id: 'financial.create', label: 'Criar' },
      { id: 'financial.update', label: 'Editar' },
      { id: 'financial.delete', label: 'Excluir' },
    ],
  },
  {
    category: 'USUÁRIOS',
    label: 'Usuários & Permissões',
    permissions: [
      { id: 'users.view', label: 'Visualizar' },
      { id: 'users.create', label: 'Criar' },
      { id: 'users.update', label: 'Editar' },
      { id: 'users.delete', label: 'Excluir' },
      { id: 'users.reset_password', label: 'Resetar Senha' },
    ],
  },
  {
    category: 'NOTIFICAÇÕES',
    label: 'Notificações',
    permissions: [
      { id: 'notifications.view', label: 'Visualizar' },
      { id: 'notifications.manage', label: 'Gerenciar' },
    ],
  },
  {
    category: 'AUDITORIA',
    label: 'Logs de Auditoria',
    permissions: [
      { id: 'audit_logs.view', label: 'Visualizar Logs' },
    ],
  },
  {
    category: 'WHITELABEL',
    label: 'White Label',
    permissions: [
      { id: 'whitelabel.view', label: 'Visualizar' },
      { id: 'whitelabel.manage', label: 'Gerenciar' },
    ],
  },
  {
    category: 'TENANTS',
    label: 'Empresas (Plataforma)',
    permissions: [
      { id: 'tenants.view', label: 'Visualizar empresas' },
      { id: 'tenants.create', label: 'Cadastrar empresas' },
      { id: 'tenants.update', label: 'Editar empresas' },
      { id: 'tenants.suspend', label: 'Suspender empresas' },
      { id: 'tenants.delete', label: 'Excluir empresas' },
    ],
  },
  {
    category: 'CONFIGURAÇÕES',
    label: 'Configurações',
    permissions: [
      { id: 'settings.view', label: 'Visualizar' },
      { id: 'settings.manage', label: 'Gerenciar' },
    ],
  },
  {
    category: 'SIMULAÇÕES',
    label: 'Simulações de Crédito',
    permissions: [
      { id: 'simulations.view', label: 'Visualizar Simulações' },
      { id: 'simulations.create', label: 'Criar Simulação' },
      { id: 'simulations.update', label: 'Editar Simulação' },
      { id: 'simulations.delete', label: 'Excluir Simulação' },
    ],
  },
  {
    category: 'AUTOMAÇÃO',
    label: 'Central de Automação',
    permissions: [
      { id: 'automations.view', label: 'Visualizar Automações' },
      { id: 'automations.create', label: 'Criar Regra' },
      { id: 'automations.update', label: 'Editar Regra' },
      { id: 'automations.delete', label: 'Excluir Regra' },
      { id: 'automations.execute', label: 'Executar Manualmente' },
    ],
  },
  {
    category: 'BI',
    label: 'BI & Relatórios Operacionais',
    permissions: [
      { id: 'bi.view', label: 'Visualizar Dashboards' },
      { id: 'bi.export', label: 'Exportar Dados' },
    ],
  },
  {
    category: 'INTEGRAÇÕES',
    label: 'Hub de Integrações Bancárias',
    permissions: [
      { id: 'integrations.view', label: 'Visualizar Status de Integrações' },
      { id: 'integrations.manage', label: 'Gerenciar Credenciais & Conexões' },
      { id: 'integrations.sync', label: 'Disparar Sincronização' },
    ],
  },
  {
    category: 'PENDÊNCIAS',
    label: 'Central de Pendências & SLA',
    permissions: [
      { id: 'pendencies.view', label: 'Visualizar Pendências' },
      { id: 'pendencies.create', label: 'Criar Pendência' },
      { id: 'pendencies.update', label: 'Atualizar / Comentar' },
      { id: 'pendencies.delete', label: 'Excluir Pendência' },
      { id: 'pendencies.resolve', label: 'Resolver / Baixar' },
    ],
  },
  {
    category: 'SENTINEL_INTELLIGENCE',
    label: 'Sentinel Intelligence',
    permissions: [
      { id: 'intelligence.view', label: 'Visualizar Recomendações' },
      { id: 'intelligence.execute', label: 'Executar Ações Sugeridas' },
    ],
  },
  {
    category: 'ADMINISTRAÇÃO',
    label: 'Central de Administração',
    permissions: [
      { id: 'admin.view', label: 'Acessar Central de Administração' },
      { id: 'admin.manage', label: 'Gerenciar Recursos Globais e do Tenant' },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.id));

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  PLATFORM_MASTER: [...ALL_PERMISSIONS],
  MASTER: ALL_PERMISSIONS.filter(p => !p.startsWith('tenants.')),
  TENANT_ADMIN: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.update', 'clients.delete',
    'proposals.view', 'proposals.create', 'proposals.update', 'proposals.delete',
    'statuses.view', 'statuses.manage',
    'ades.view', 'ades.create', 'ades.update', 'ades.delete',
    'tasks.view', 'tasks.create', 'tasks.update', 'tasks.delete',
    'partners.view', 'partners.create', 'partners.update', 'partners.delete',
    'promoters.view', 'promoters.create', 'promoters.update', 'promoters.delete',
    'banks.view', 'banks.create', 'banks.update', 'banks.delete',
    'products.view', 'products.create', 'products.update', 'products.delete',
    'financial.view', 'financial.create', 'financial.update', 'financial.delete',
    'users.view', 'users.create', 'users.update', 'users.delete', 'users.reset_password',
    'notifications.view', 'notifications.manage',
    'audit_logs.view',
    'whitelabel.view', 'whitelabel.manage',
    'settings.view', 'settings.manage',
    'simulations.view', 'simulations.create', 'simulations.update', 'simulations.delete',
    'automations.view', 'automations.create', 'automations.update', 'automations.delete', 'automations.execute',
    'bi.view', 'bi.export',
    'integrations.view', 'integrations.manage', 'integrations.sync',
    'pendencies.view', 'pendencies.create', 'pendencies.update', 'pendencies.delete', 'pendencies.resolve',
    'intelligence.view', 'intelligence.execute',
    'admin.view', 'admin.manage',
  ],
  GESTOR: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.update', 'clients.delete',
    'proposals.view', 'proposals.create', 'proposals.update', 'proposals.delete',
    'statuses.view', 'statuses.manage',
    'ades.view', 'ades.create', 'ades.update', 'ades.delete',
    'tasks.view', 'tasks.create', 'tasks.update', 'tasks.delete',
    'partners.view', 'partners.create',
    'promoters.view',
    'banks.view',
    'products.view',
    'financial.view', 'financial.create', 'financial.update',
    'users.view',
    'notifications.view', 'notifications.manage',
    'audit_logs.view',
    'settings.view',
    'simulations.view', 'simulations.create',
    'automations.view',
    'bi.view', 'bi.export',
    'integrations.view',
    'pendencies.view', 'pendencies.create', 'pendencies.update', 'pendencies.resolve',
    'intelligence.view',
  ],
  GERENTE: [
    'dashboard.view',
    'clients.view', 'clients.create', 'clients.update',
    'proposals.view', 'proposals.create', 'proposals.update',
    'statuses.view',
    'ades.view', 'ades.create', 'ades.update',
    'tasks.view', 'tasks.create', 'tasks.update',
    'partners.view',
    'promoters.view',
    'banks.view',
    'products.view',
    'financial.view',
    'notifications.view',
    'simulations.view', 'simulations.create',
    'bi.view',
    'pendencies.view', 'pendencies.create', 'pendencies.update',
  ],
  SUPORTE: [
    'dashboard.view',
    'clients.view',
    'proposals.view', 'proposals.update',
    'statuses.view',
    'ades.view',
    'tasks.view', 'tasks.create', 'tasks.update',
    'notifications.view',
    'simulations.view',
    'pendencies.view', 'pendencies.create', 'pendencies.update', 'pendencies.resolve',
  ],
  DIGITADOR: [
    'dashboard.view',
    'clients.view', 'clients.create',
    'proposals.view', 'proposals.create',
    'ades.view', 'ades.create',
    'tasks.view', 'tasks.create',
    'notifications.view',
    'pendencies.view', 'pendencies.create',
  ],
  SIMULACAO: [
    'dashboard.view',
    'clients.view',
    'proposals.view', 'proposals.create',
    'simulations.view', 'simulations.create', 'simulations.update',
  ],
};

export function getPermissionsForRole(role: Role): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.DIGITADOR;
}

export function getEffectivePermissions(
  role?: Role | null,
  customPermissions?: string[] | null
): Permission[] {
  if (!role) return [];
  if (role === 'PLATFORM_MASTER') return [...ALL_PERMISSIONS];

  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    return Array.from(new Set(customPermissions as Permission[]));
  }

  return getPermissionsForRole(role);
}

const PERMISSION_ALIASES: Record<string, Permission> = {
  AUTOMACAO_VIEW: 'automations.view',
  AUTOMACAO_MANAGE: 'automations.create',
  SIMULACAO_VIEW: 'simulations.view',
  SIMULACAO_CREATE: 'simulations.create',
  INTEGRACOES_VIEW: 'integrations.view',
  INTEGRACOES_MANAGE: 'integrations.manage',
  PENDENCIAS_VIEW: 'pendencies.view',
  PENDENCIAS_MANAGE: 'pendencies.create',
  PENDENCIA_VIEW: 'pendencies.view',
  BI_VIEW: 'bi.view',
  BI_EXPORT: 'bi.export',
  INTELLIGENCE_VIEW: 'intelligence.view',
  ADMIN_VIEW: 'admin.view',
  ADMIN_MANAGE: 'admin.manage',
};

export function hasPermission(
  role?: Role | null,
  customPermissions?: string[] | null,
  requiredPermission?: Permission | string
): boolean {
  if (!requiredPermission) return true;
  if (!role) return false;

  // PLATFORM_MASTER has unrestricted global authority
  if (role === 'PLATFORM_MASTER') return true;

  const normalized = (PERMISSION_ALIASES[requiredPermission] || requiredPermission) as Permission;
  const effective = getEffectivePermissions(role, customPermissions);
  return effective.includes(normalized) || effective.includes(requiredPermission as Permission);
}
