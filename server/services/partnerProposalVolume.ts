/** Presentation volume only. Does not change contract amounts or commission bases. */
export function partnerProposalVolume(proposal: { type?: string; releasedValue?: unknown; debtBalance?: unknown; contractValue?: unknown }): number {
  const amount = proposal.type === 'PORTABILIDADE'
    ? proposal.debtBalance ?? proposal.contractValue
    : proposal.releasedValue ?? proposal.contractValue;
  const value = Number(amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}
