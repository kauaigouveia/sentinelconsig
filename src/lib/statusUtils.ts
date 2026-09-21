import { Proposal, ProposalStatus } from '../types';

/**
 * Checks if a status definition represents a final, closed operational state.
 * Respects tenant-specific `finalStatus === true`, standardCategory, and name/code aliases.
 */
export function isStatusFinal(
  status?: Partial<ProposalStatus> | null
): boolean {
  if (!status) return false;

  // 1. Primary rule: explicit boolean flag configured in system
  if (status.finalStatus === true) return true;

  // 2. Standard category rule
  const cat = ((status as any).standardCategory || '').toUpperCase();
  if (cat === 'PAGO' || cat === 'CANCELADO' || cat === 'RECUSADO') {
    return true;
  }

  // 3. Fallback code / name pattern recognition
  const code = (status.code || '').toUpperCase();
  const name = (status.name || '').toUpperCase();

  if (
    code === 'PAGO' ||
    code === 'CANCELADO' ||
    code === 'REPROVADO' ||
    name.includes('CANCELAD') ||
    name.includes('REPROVAD') ||
    name.includes('LIQUIDADO') ||
    name.includes('DISTRAT')
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a proposal is closed / final (e.g. Cancelled, Reproved, Paid).
 * A proposal with a final status is NOT operationally open:
 * - Does not accumulate SLA
 * - Does not show up in active bottlenecks
 * - Does not age in open proposals aging
 * - Does not penalize Operational Health Score (OHS)
 */
export function isProposalFinal(
  proposal: Proposal,
  statuses?: ProposalStatus[]
): boolean {
  if (!proposal) return false;

  // 1. Explicit completion timestamps
  if (proposal.cancelledAt || proposal.rejectedAt || proposal.paidAt) {
    return true;
  }

  // 2. Match with status definition if available
  if (statuses && statuses.length > 0 && proposal.statusId) {
    const st = statuses.find((s) => s.id === proposal.statusId);
    if (st && isStatusFinal(st)) {
      return true;
    }
  }

  // 3. Status name / code fallback if embedded
  const rawStatus = (proposal as any).status;
  if (rawStatus && isStatusFinal(rawStatus)) {
    return true;
  }

  // 4. Standard category fallback
  const stdCat = ((proposal as any).standardCategory || '').toUpperCase();
  if (stdCat === 'PAGO' || stdCat === 'CANCELADO' || stdCat === 'RECUSADO') {
    return true;
  }

  return false;
}

/**
 * Checks if a proposal is actively open in the operational pipeline (esteira).
 */
export function isProposalOperationalActive(
  proposal: Proposal,
  statuses?: ProposalStatus[]
): boolean {
  return !isProposalFinal(proposal, statuses);
}

/**
 * Calculates dwell time and SLA status for a proposal.
 * If the proposal is final, dwell time ends at its completion/cancellation timestamp,
 * and it is never marked as an active SLA failure.
 */
export function calculateProposalDwellHours(
  proposal: Proposal,
  status?: ProposalStatus | null,
  referenceDate: Date = new Date()
): {
  dwellHours: number;
  slaHours: number;
  isOverSla: boolean;
  isNearSla: boolean;
  isFinal: boolean;
} {
  const isFinal = isProposalFinal(proposal, status ? [status] : undefined);
  const slaHours = status?.slaHours && status.slaHours > 0 ? status.slaHours : 24;

  const createdTime = new Date(proposal.createdAt).getTime();

  // If final, determine the exact end time
  let endTime = referenceDate.getTime();
  if (isFinal) {
    const finalDateStr =
      proposal.completedAt ||
      proposal.cancelledAt ||
      proposal.rejectedAt ||
      proposal.paidAt ||
      proposal.updatedAt;
    if (finalDateStr) {
      endTime = new Date(finalDateStr).getTime();
    }
  }

  const dwellHours = Math.max(0, Math.round((endTime - createdTime) / (1000 * 3600)));

  if (isFinal) {
    return {
      dwellHours,
      slaHours,
      isOverSla: false,
      isNearSla: false,
      isFinal: true,
    };
  }

  const isOverSla = dwellHours > slaHours;
  const isNearSla = !isOverSla && dwellHours >= slaHours * 0.75;

  return {
    dwellHours,
    slaHours,
    isOverSla,
    isNearSla,
    isFinal: false,
  };
}
