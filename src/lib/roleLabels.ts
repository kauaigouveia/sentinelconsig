export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_MASTER: 'MASTER OP',
  MASTER: 'MASTER',
  TENANT_ADMIN: 'ADMINISTRADOR',
  GESTOR: 'GESTOR',
  GERENTE: 'GERENTE',
  DIGITADOR: 'DIGITADOR',
  SUPORTE: 'SUPORTE',
  SIMULACAO: 'CANAL DE SIMULAÇÃO',
};

export function getRoleLabel(role?: string | null): string {
  if (!role) return 'OPERADOR';
  return ROLE_LABELS[role] || role;
}
