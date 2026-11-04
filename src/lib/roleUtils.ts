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
    label: 'MASTER OP',
    emoji: '⚡',
    badgeClass: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    pillClass: '   text-[var(--text-primary)] font-black shadow-xs',
    textClass: 'text-[var(--link)] dark:text-[var(--link)]',
    description: 'Acesso global multi-empresa à infraestrutura SaaS, gestão de tenants, planos e auditoria.',
  },
  MASTER: {
    role: 'MASTER',
    label: 'Master da Operação',
    emoji: '👑',
    badgeClass: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]',
    pillClass: '   text-[var(--text-primary)] font-black shadow-xs',
    textClass: 'text-[var(--warning-text)] dark:text-[var(--warning-text)]',
    description: 'Acesso irrestrito a todos os módulos, usuários e configurações do sistema do tenant.',
  },
  TENANT_ADMIN: {
    role: 'TENANT_ADMIN',
    label: 'Administrador da Empresa',
    emoji: '🏢',
    badgeClass: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    pillClass: 'bg-[var(--info-bg)] text-[var(--text-primary)] font-bold',
    textClass: 'text-[var(--link)] dark:text-[var(--link)]',
    description: 'Gestão da empresa, personalização de marca white label e controle de usuários da conta.',
  },
  GESTOR: {
    role: 'GESTOR',
    label: 'Gestor Operacional',
    emoji: '🛡️',
    badgeClass: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    pillClass: 'bg-[var(--info-bg)] text-[var(--text-primary)] font-bold',
    textClass: 'text-[var(--link)] dark:text-[var(--link)]',
    description: 'Gestão executiva de produção, esteira, gargalos e relatórios de desempenho.',
  },
  GERENTE: {
    role: 'GERENTE',
    label: 'Gerente de Vendas',
    emoji: '🎯',
    badgeClass: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    pillClass: 'bg-[var(--info-bg)] text-[var(--text-primary)] font-bold',
    textClass: 'text-[var(--link)] dark:text-[var(--link)]',
    description: 'Gestão comercial, controle de parceiros e acompanhamento da esteira de propostas.',
  },
  SUPORTE: {
    role: 'SUPORTE',
    label: 'Suporte Técnico',
    emoji: '🎧',
    badgeClass: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]',
    pillClass: 'bg-[var(--warning-bg)] text-[var(--text-primary)] font-bold',
    textClass: 'text-[var(--warning-text)] dark:text-[var(--warning-text)]',
    description: 'Tratamento de pendências, SLA de alçadas e assistência aos digitadores.',
  },
  DIGITADOR: {
    role: 'DIGITADOR',
    label: 'Digitador da Mesa',
    emoji: '⌨️',
    badgeClass: 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] border-[var(--success-border)] dark:border-[var(--success-border)]',
    pillClass: 'bg-[var(--success-bg)] text-[var(--text-primary)] font-bold',
    textClass: 'text-[var(--success-text)] dark:text-[var(--success-text)]',
    description: 'Inclusão rápida de ADEs, importação de lotes e acompanhamento da produção própria.',
  },
  SIMULACAO: {
    role: 'SIMULACAO',
    label: 'Canal de Simulação',
    emoji: '📊',
    badgeClass: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    pillClass: 'bg-[var(--info-bg)] text-[var(--text-primary)] font-bold',
    textClass: 'text-[var(--link)] dark:text-[var(--link)]',
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
  badgeClass: 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--field-border)]',
  pillClass: 'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] font-bold',
  textClass: 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)]',
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

