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
