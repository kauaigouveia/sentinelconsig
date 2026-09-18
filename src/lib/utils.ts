import { Holiday } from '../types';

/**
 * Extracts partner code from login string.
 * The code is defined as everything after the last '@'.
 * Examples:
 *   extractPartnerCode("KAUAI@16740") => "16740"
 *   extractPartnerCode("FOX@16715") => "16715"
 *   extractPartnerCode("FRANCO@16690") => "16690"
 */
export function extractPartnerCode(login: string): string {
  if (!login) return '';
  return login.trim();
}

/**
 * Validates partner login format: NOME@CODIGO
 */
export function isValidPartnerLogin(login: string): boolean {
  return !!login && login.trim().length > 0;
}

/**
 * Normalizes CPF by stripping all non-digit characters.
 * Accepts: "01138777498" or "011.387.774-98"
 * Stores: "01138777498"
 */
export function normalizeCpf(cpf: string): string {
  if (!cpf) return '';
  return cpf.replace(/\D/g, '').slice(0, 11);
}

/**
 * Formats 11-digit CPF to display format: 011.387.774-98
 */
export function formatCpf(cpf: string): string {
  const clean = normalizeCpf(cpf);
  if (clean.length !== 11) return cpf || '';
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

/**
 * Checks if a string is a valid CPF format
 */
export function isValidCpf(cpf: string): boolean {
  const clean = normalizeCpf(cpf);
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  let remainder: number;
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(clean.substring(i - 1, i), 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.substring(9, 10), 10)) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(clean.substring(i - 1, i), 10) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(clean.substring(10, 11), 10)) return false;

  return true;
}

/**
 * Formats ISO date to Brazilian standard DD/MM/YYYY HH:mm
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export function formatDateOnly(dateString?: string | null): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Checks if a date falls on a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
}

/**
 * Checks if a date matches any active registered holiday
 */
export function isHoliday(date: Date, holidays: Holiday[] = []): boolean {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  return holidays.some(h => h.active && h.date === dateStr);
}

/**
 * Checks if a day is a valid business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date, holidays: Holiday[] = []): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Calculates business days elapsed between start date and end date
 * Monday through Friday, skipping weekends and registered holidays.
 */
export function calculateBusinessDays(
  startDate: Date | string,
  endDate: Date | string = new Date(),
  holidays: Holiday[] = []
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (start > end) return 0;

  // Start checking from the next day or fractional counting
  const curr = new Date(start);
  curr.setHours(0, 0, 0, 0);

  const target = new Date(end);
  target.setHours(0, 0, 0, 0);

  let businessDays = 0;
  // Advance day by day
  const testDate = new Date(curr);
  testDate.setDate(testDate.getDate() + 1);

  while (testDate <= target) {
    if (isBusinessDay(testDate, holidays)) {
      businessDays++;
    }
    testDate.setDate(testDate.getDate() + 1);
  }

  return businessDays;
}

/**
 * Calculates deadline target date by adding N business days to start date
 */
export function addBusinessDays(
  startDate: Date | string,
  daysToAdd: number,
  holidays: Holiday[] = []
): Date {
  const current = new Date(startDate);
  let added = 0;
  while (added < daysToAdd) {
    current.setDate(current.getDate() + 1);
    if (isBusinessDay(current, holidays)) {
      added++;
    }
  }
  return current;
}

/**
 * Calculates aging bucket for proposal (e.g. 0 dias, 1 dia, 2-3 dias, etc.)
 */
export function getAgingBucket(createdAt: string): string {
  const d = new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - d.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '0 dias';
  if (diffDays === 1) return '1 dia';
  if (diffDays === 2) return '2 dias';
  if (diffDays === 3) return '3 dias';
  if (diffDays === 4) return '4 dias';
  if (diffDays === 5) return '5 dias';
  if (diffDays <= 10) return '6-10 dias';
  if (diffDays <= 20) return '11-20 dias';
  return '20+ dias';
}

/**
 * Formats a number as BRL currency (R$ 1.234,56)
 */
export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || isNaN(Number(value))) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

/**
 * Parses any currency string or numeric representation to a clean number.
 * Supports: "R$ 12.345,67", "12.345,67", "12345,67", "12345.67", 12345.67
 */
export function parseCurrency(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') {
    return isNaN(val) ? undefined : val;
  }
  const str = String(val).trim();
  if (!str) return undefined;

  // Strip currency symbols and letters, keeping digits, dots, commas, minus
  const clean = str.replace(/[^\d.,-]/g, '').trim();
  if (!clean) return undefined;

  // Check format: Brazilian (1.234,56) vs US (1,234.56)
  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      // 1.234,56
      const numStr = clean.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(numStr);
      return isNaN(n) ? undefined : n;
    } else {
      // 1,234.56
      const numStr = clean.replace(/,/g, '');
      const n = parseFloat(numStr);
      return isNaN(n) ? undefined : n;
    }
  } else if (clean.includes(',')) {
    // 1234,56
    const numStr = clean.replace(',', '.');
    const n = parseFloat(numStr);
    return isNaN(n) ? undefined : n;
  } else {
    // 1234.56 or 1234
    const n = parseFloat(clean);
    return isNaN(n) ? undefined : n;
  }
}

/**
 * Classnames helper
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
