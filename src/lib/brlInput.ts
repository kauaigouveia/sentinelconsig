/** Converts a BRL entry to a canonical numeric string, without changing its magnitude. */
export function normalizeBrlInput(raw: string): string | null {
  let value = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!value) return '';
  if (!/^-?[\d.,]+$/.test(value)) return null;
  if (value.includes(',')) {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(value)) return null;
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  else if (!/^-?\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : null;
}
export function formatBrlInput(value: string | number): string {
  if (value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}
