/** Compare reported monthly percentages without changing their unit or the offer. */
export function higherMonthlyRateFirst(left: unknown, right: unknown): number {
  const numeric = (value: unknown) => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:[.,]\d+)?%?$/.test(value.trim())
      ? Number(value.trim().replace('%', '').replace(',', '.')) : NaN;
    return Number.isFinite(number) && number >= 0 ? number : -1;
  };
  return numeric(right) - numeric(left);
}
