const DISBURSEMENT_KEYS = new Set([
  'final_disbursement_amount',
  'final_disbursed_amount',
  'disbursement_amount',
  'net_disbursed_amount',
  'disbursed_issue_amount',
  'disbursed_amount',
]);

/** Extract the client cash-out from the documented response and common API envelopes. */
export function getNossaFintechTroco(payload: unknown): number | null {
  const pending: unknown[] = [payload];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (DISBURSEMENT_KEYS.has(key.toLowerCase()) && value !== null && value !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
      if (value && typeof value === 'object') pending.push(value);
    }
  }
  return null;
}
