/** Shared validation only; never logs or persists customer data. */
export function isCltBirthDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getTime() < Date.now();
}
export function parseCltBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  return isCltBirthDate(iso) ? iso : undefined;
}
export function displayCltBirthDate(value: string) {
  return isCltBirthDate(value) ? `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}` : '';
}
export function maskCltBirthDate(value: string) {
  return value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2}\/\d{2})(\d)/, '$1/$2');
}
export function isCltEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function isCltGender(value: unknown): value is 'male' | 'female' { return value === 'male' || value === 'female'; }
