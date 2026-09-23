import { IncidentStatus } from '@prisma/client';

export const ALLOWED_STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.OPEN]: [
    IncidentStatus.ACKNOWLEDGED,
    IncidentStatus.INVESTIGATING,
    IncidentStatus.MITIGATING,
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.ACKNOWLEDGED]: [
    IncidentStatus.INVESTIGATING,
    IncidentStatus.MITIGATING,
    IncidentStatus.MONITORING,
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.INVESTIGATING]: [
    IncidentStatus.MITIGATING,
    IncidentStatus.MONITORING,
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.IDENTIFIED]: [
    IncidentStatus.INVESTIGATING,
    IncidentStatus.MITIGATING,
    IncidentStatus.MONITORING,
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.MITIGATING]: [
    IncidentStatus.MONITORING,
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.MONITORING]: [
    IncidentStatus.INVESTIGATING, // Re-investigate if issue resurfaces during monitoring
    IncidentStatus.MITIGATING,
    IncidentStatus.RESOLVED,
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.RESOLVED]: [
    IncidentStatus.MONITORING, // Re-open monitoring if needed
    IncidentStatus.CLOSED,
  ],
  [IncidentStatus.CLOSED]: [
    // Terminal state. CLOSED cannot move back. Re-open requires creating a NEW incident.
  ],
};

export class IncidentLifecycleError extends Error {
  constructor(public currentStatus: IncidentStatus, public targetStatus: IncidentStatus) {
    super(
      `Transição inválida de status do incidente: de '${currentStatus}' para '${targetStatus}'. Incidente encerrado (CLOSED) não pode ser reaberto; crie um novo incidente.`
    );
    this.name = 'IncidentLifecycleError';
  }
}

export function validateStatusTransition(
  currentStatus: IncidentStatus,
  targetStatus: IncidentStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export function getTransitionTimestampField(targetStatus: IncidentStatus): string | null {
  switch (targetStatus) {
    case IncidentStatus.ACKNOWLEDGED:
      return 'acknowledgedAt';
    case IncidentStatus.INVESTIGATING:
      return 'investigatingAt';
    case IncidentStatus.MITIGATING:
      return 'mitigatingAt';
    case IncidentStatus.MONITORING:
      return 'monitoringAt';
    case IncidentStatus.RESOLVED:
      return 'resolvedAt';
    case IncidentStatus.CLOSED:
      return 'closedAt';
    default:
      return null;
  }
}
