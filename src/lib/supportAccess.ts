export const SIMULATION_SUPPORT_ROLES = ['SIMULACAO', 'MASTER', 'GESTOR', 'GERENTE'] as const;

export function canAccessSimulationSupport(role?: string | null) {
  return SIMULATION_SUPPORT_ROLES.some(allowed => allowed === role);
}

// Apply in the database query as well as the UI; custom permissions cannot override this scope.
export function supportDepartmentScope(role?: string | null) {
  return canAccessSimulationSupport(role) ? {} : { department: { not: 'SIMULATION' } };
}
