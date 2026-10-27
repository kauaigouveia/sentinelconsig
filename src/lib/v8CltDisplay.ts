// V8 stores the bank's decimal rate. Convert only in presentation, never in pricing.
export function cltRatePercent(row: { rate?: number; data?: unknown }): number | undefined {
  const decimal = (row.data as any)?.v8?.monthlyInterestRate;
  if (typeof decimal === 'number' && Number.isFinite(decimal)) return decimal * 100;
  return typeof row.rate === 'number' && Number.isFinite(row.rate) ? row.rate : undefined;
}
