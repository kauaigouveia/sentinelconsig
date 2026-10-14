import type { Proposal } from '../types';
export function proposalProviderVisibility(proposal: Proposal, bank?: { name?: string; code?: string }) {
  const name = String(bank?.name || '').toUpperCase();
  return {
    finanto: Boolean(proposal.finantoSimulationId?.trim() || /FINANTO|JOIN\s?BANK/.test(name)),
    nossa: Boolean(proposal.nossaFintechDebtKey?.trim() || /NOSSA\s*FINTECH/.test(name)),
  };
}
