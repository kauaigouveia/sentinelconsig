// Only bank-returned limits. No percentage haircut, estimated margin or default term.
export function cltPaymentLimit(...limits: unknown[]): number | undefined {
  const provided = limits.filter(value => value !== undefined && value !== null && value !== '');
  if (!provided.length) return undefined;
  const numbers = provided.map(value => typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN);
  if (numbers.some(value => !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER / 100)) return undefined;
  const scaled = Math.min(...numbers) * 100;
  const cents = Math.floor(scaled + Number.EPSILON * Math.abs(scaled));
  return cents > 0 ? cents / 100 : undefined;
}
