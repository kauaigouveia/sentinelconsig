import { parseCurrency } from './utils';

/**
 * Cenário comercial informativo baseado no PLOA 2027, não na margem averbável.
 * A previsão do salário mínimo de R$ 1.741 ainda pode mudar.
 * Jamais somar este valor à margem atual ou declará-lo disponível. Em cálculo bancário de cenário futuro, identificar a operação como hipotética.
 */
export const INSS_PROJECTED_2027 = Object.freeze({
  sourceWage: 1621.00,
  forecastWage: 1741.00,
  loanMarginPercent: 35,
  addedInstallment: 42.00,
  forecastYear: 2027,
});

export interface ProjectedInssMargin {
  kind: 'FORECAST_2027';
  sourceWage: number;
  forecastWage: number;
  currentAvailableMargin: number | null;
  /** Valor de parcela hipotética, não liberado pelo INSS/Dataprev. */
  projectedInstallment: number;
  loanBlocked: boolean;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

export function inssProjectedMargin(
  grossIncome: string | number | null | undefined,
  currentMargin?: string | number | null,
  loanBlocked = false,
): ProjectedInssMargin | null {
  const salary = parseCurrency(grossIncome);
  if (salary == null || !Number.isFinite(salary) || cents(salary) !== cents(INSS_PROJECTED_2027.sourceWage))
    return null;
  const margin = parseCurrency(currentMargin);
  const currentAvailableMargin = margin != null && Number.isFinite(margin) ? Math.max(0, cents(margin) / 100) : null;
  return {
    kind: 'FORECAST_2027',
    sourceWage: INSS_PROJECTED_2027.sourceWage,
    forecastWage: INSS_PROJECTED_2027.forecastWage,
    currentAvailableMargin,
    projectedInstallment: INSS_PROJECTED_2027.addedInstallment,
    loanBlocked: loanBlocked === true,
  };
}

/**
 * Valor bruto teórico pela fórmula Price; não inclui IOF, seguro, CET,
 * coeficientes particulares, limite mínimo ou validações comerciais bancárias.
 * Uma estimativa não é uma oferta, um crédito aprovado ou margem vigente.
 */
export function estimateProjectedInssLoan(monthlyRatePercent: number, termMonths: number): number | null {
  const installment = INSS_PROJECTED_2027.addedInstallment;
  if (!Number.isFinite(monthlyRatePercent) || monthlyRatePercent <= 0 ||
      !Number.isInteger(termMonths) || termMonths <= 0 || termMonths > 120)
    return null;
  const monthlyRate = monthlyRatePercent / 100;
  const principal = installment * (1 - (1 + monthlyRate) ** -termMonths) / monthlyRate;
  if (!Number.isFinite(principal) || principal <= 0) return null;
  return Math.round(principal * 100) / 100;
}
