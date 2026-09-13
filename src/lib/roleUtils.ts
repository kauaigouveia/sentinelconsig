import { Role } from '../types';

export interface RoleConfig {
  role: Role;
  label: string;
  emoji: string;
  badgeClass: string;
  pillClass: string;
  textClass: string;
  description: string;
}

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  PLATFORM_MASTER: {
    role: 'PLATFORM_MASTER',
    label: 'Platform Master SaaS',
    emoji: '⚡',
    badgeClass: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-200 border-indigo-400 dark:border-indigo-600',
    pillClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black shadow-xs',
    textClass: 'text-indigo-700 dark:text-indigo-400',
    description: 'Acesso global multi-empresa à infraestrutura SaaS, gestão de tenants, planos e auditoria.',
  },
  MASTER: {
    role: 'MASTER',
    label: 'Master da Operação',
    emoji: '👑',
    badgeClass: 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700',
    pillClass: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white font-black shadow-xs',
    textClass: 'text-amber-700 dark:text-amber-400',
    description: 'Acesso irrestrito a todos os módulos, usuários e configurações do sistema do tenant.',
  },
  TENANT_ADMIN: {
    role: 'TENANT_ADMIN',
    label: 'Administrador da Empresa',
    emoji: '🏢',
    badgeClass: 'bg-sky-100 dark:bg-sky-950/80 text-sky-900 dark:text-sky-200 border-sky-300 dark:border-sky-700',
    pillClass: 'bg-sky-600 text-white font-bold',
    textClass: 'text-sky-700 dark:text-sky-400',
    description: 'Gestão da empresa, personalização de marca white label e controle de usuários da conta.',
  },
  GESTOR: {
    role: 'GESTOR',
    label: 'Gestor Operacional',
    emoji: '🛡️',
    badgeClass: 'bg-purple-100 dark:bg-purple-950/80 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-700',
    pillClass: 'bg-purple-600 text-white font-bold',
    textClass: 'text-purple-700 dark:text-purple-400',
    description: 'Gestão executiva de produção, esteira, gargalos e relatórios de desempenho.',
  },
  GERENTE: {
    role: 'GERENTE',
    label: 'Gerente de Vendas',
    emoji: '🎯',
    badgeClass: 'bg-blue-100 dark:bg-blue-950/80 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700',
    pillClass: 'bg-blue-600 text-white font-bold',
    textClass: 'text-blue-700 dark:text-blue-400',
    description: 'Gestão comercial, controle de parceiros e acompanhamento da esteira de propostas.',
  },
  SUPORTE: {
    role: 'SUPORTE',
    label: 'Suporte Técnico',
    emoji: '🎧',
    badgeClass: 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700',
    pillClass: 'bg-amber-600 text-white font-bold',
    textClass: 'text-amber-700 dark:text-amber-400',
    description: 'Tratamento de pendências, SLA de alçadas e assistência aos digitadores.',
  },
  DIGITADOR: {
    role: 'DIGITADOR',
    label: 'Digitador da Mesa',
    emoji: '⌨️',
    badgeClass: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
    pillClass: 'bg-emerald-600 text-white font-bold',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    description: 'Inclusão rápida de ADEs, importação de lotes e acompanhamento da produção própria.',
  },
  SIMULACAO: {
    role: 'SIMULACAO',
    label: 'Canal de Simulação',
    emoji: '📊',
    badgeClass: 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700',
    pillClass: 'bg-indigo-600 text-white font-bold',
    textClass: 'text-indigo-700 dark:text-indigo-400',
    description: 'Canal dedicado ao envio, acompanhamento e pré-análise de solicitações de simulação de contratos.',
  },
};

export const VALID_ROLES: readonly Role[] = [
  'PLATFORM_MASTER',
  'MASTER',
  'TENANT_ADMIN',
  'GESTOR',
  'GERENTE',
  'SUPORTE',
  'DIGITADOR',
  'SIMULACAO',
] as const;

export function isValidRole(role: any): role is Role {
  return typeof role === 'string' && (VALID_ROLES as readonly string[]).includes(role);
}

export const FALLBACK_ROLE_CONFIG: RoleConfig = {
  role: 'DIGITADOR',
  label: 'Usuário',
  emoji: '👤',
  badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  pillClass: 'bg-slate-500 text-white font-bold',
  textClass: 'text-slate-700 dark:text-slate-400',
  description: 'Acesso padrão de usuário.',
};

export function getRoleEmoji(role?: Role | null): string {
  if (!role || !ROLE_CONFIG[role]) return FALLBACK_ROLE_CONFIG.emoji;
  return ROLE_CONFIG[role]?.emoji || FALLBACK_ROLE_CONFIG.emoji;
}

export function getRoleLabel(role?: Role | null): string {
  if (!role || !ROLE_CONFIG[role]) return FALLBACK_ROLE_CONFIG.label;
  return ROLE_CONFIG[role]?.label || FALLBACK_ROLE_CONFIG.label;
}

export function getRoleBadgeClass(role?: Role | null): string {
  if (!role || !ROLE_CONFIG[role]) return FALLBACK_ROLE_CONFIG.badgeClass;
  return ROLE_CONFIG[role]?.badgeClass || FALLBACK_ROLE_CONFIG.badgeClass;
}

