/** Ticket limits use the value returned for this condition, never the requested value. */
export function c6ConditionEligible(condition: any, benefitType: number | string): boolean {
  const amount = Number(condition?.client_amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const name = String(condition?.covenant?.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const invalidity = /\binval\b/.test(name);
  if ([32, 92].includes(Number(benefitType))) return invalidity;
  if (invalidity) return false;
  if (!/\btkt\b/.test(name)) return true;
  if (/\btkt\s+(?:ate|até)\s*6\s*k\b/.test(name)) return amount <= 6000;
  if (/\btkt\s*6\s*k\s*(?:a|ate|-)\s*20\s*k\b/.test(name)) return amount > 6000 && amount <= 20000;
  if (/\btkt\s*>\s*20\s*k\b/.test(name)) return amount > 20000;
  // Unknown ticket labels cannot safely establish eligibility.
  return false;
}


/** Filter returned conditions locally; the C6 response may include other rates. Rates are percentages per month. */
export function c6MatchesSelection(rate: unknown, term: unknown, selectedRate?: unknown, selectedTerm?: unknown): boolean {
  const numeric = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? Number(String(value).trim().replace(',', '.')) : NaN;
  const hasRate = selectedRate !== undefined && selectedRate !== null && selectedRate !== '';
  const hasTerm = selectedTerm !== undefined && selectedTerm !== null && selectedTerm !== '';
  if (hasRate && (!(numeric(selectedRate) > 0) || !Number.isFinite(numeric(rate)) || Math.abs(numeric(rate) - numeric(selectedRate)) > 0.000001)) return false;
  if (hasTerm && (!Number.isInteger(numeric(selectedTerm)) || numeric(selectedTerm) <= 0 || numeric(term) !== numeric(selectedTerm))) return false;
  return true;
}
