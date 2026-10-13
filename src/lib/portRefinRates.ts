export type RatePolicy = { minTerm: number; maxTerm: number; minInstallment: number; maxInstallment: number; minRate: number; maxRate: number };
export function selectablePortRefinRates(policies: RatePolicy[], term: number, installment: number, minimumInstallmentOverride?: number): number[] {
  const matching = policies.filter(policy => term >= policy.minTerm && term <= policy.maxTerm && installment >= (minimumInstallmentOverride ?? policy.minInstallment) && installment <= policy.maxInstallment);
  if (!matching.length) return [];
  // The Paraná workbook averages the bounds if more than one policy row matches.
  const minimum = Math.ceil(matching.reduce((sum,p) => sum+p.minRate,0)/matching.length*100-1e-8);
  const maximum = Math.floor(Math.min(1.85,matching.reduce((sum,p) => sum+p.maxRate,0)/matching.length)*100+1e-8);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum || maximum-minimum > 500) return [];
  return Array.from({length:maximum-minimum+1},(_,i) => (maximum-i)/100);
}
