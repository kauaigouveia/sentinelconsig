export const SIMULATION_SUPPORT_ROLES = ['SIMULACAO', 'MASTER', 'GESTOR', 'GERENTE'] as const;

export function canAccessSimulationSupport(role?: string | null) {
  // MASTER OP retains MASTER access within the session's authorized tenant context.
  const effectiveRole = role === 'PLATFORM_MASTER' ? 'MASTER' : role;
  return SIMULATION_SUPPORT_ROLES.some(allowed => allowed === effectiveRole);
}

// Apply in the database query as well as the UI; custom permissions cannot override this scope.
export function supportDepartmentScope(role?: string | null) {
  return canAccessSimulationSupport(role) ? {} : { department: { not: 'SIMULATION' } };
}
