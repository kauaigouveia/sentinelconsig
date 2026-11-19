import { describe, expect, it } from 'vitest';
import { INSS_PROJECTED_2027, inssProjectedMargin, estimateProjectedInssLoan } from '../src/lib/inssProjectedMargin';

describe('INSS NOVO — 2027 salary increase is a separate provisional forecast', () => {
  it('uses the forecast 1,621 -> 1,741 and a distinct R$42 installment (35% of R$120)', () => {
    expect(INSS_PROJECTED_2027.sourceWage).toBe(1621);
    expect(INSS_PROJECTED_2027.forecastWage).toBe(1741);
    expect((INSS_PROJECTED_2027.forecastWage - INSS_PROJECTED_2027.sourceWage) * .35).toBeCloseTo(42, 2);
    expect(INSS_PROJECTED_2027.addedInstallment).toBe(42);
  });
  it('recognizes salary in both Portuguese and API currency formats without rounding near-misses', () => {
    for (const salary of ['R$ 1.621,00', '1621.00', '1621,00', 1621]) {
      const got = inssProjectedMargin(salary, 'R$ 80,00');
      expect(got?.kind).toBe('FORECAST_2027');
      expect(got?.currentAvailableMargin).toBe(80);
      expect(got?.projectedInstallment).toBe(42);
    }
    for (const other of ['1620,99', '1621,01', '1741,00', '', '0,00', -10, null, undefined]) {
      expect(inssProjectedMargin(other)).toBeNull();
    }
  });
  it('does not replace available margin, add current balance, or depend on free margin', () => {
    const withAvailable = inssProjectedMargin('1.621,00', '80,00');
    expect(withAvailable?.currentAvailableMargin).toBe(80);
    expect(withAvailable?.projectedInstallment).toBe(42);
    expect(withAvailable?.projectedInstallment).not.toBe(122);

    const zero = inssProjectedMargin('1621', '0,00');
    expect(zero?.currentAvailableMargin).toBe(0);
    expect(zero?.projectedInstallment).toBe(42);

    const negative = inssProjectedMargin(1621, '-25,00');
    expect(negative?.currentAvailableMargin).toBe(0);

    expect(inssProjectedMargin('1.621,00')?.currentAvailableMargin).toBeNull();
  });
  it('preserves loan-block status from the source for UI restrictions', () => {
    const blocked = inssProjectedMargin(1621, '0', true);
    expect(blocked?.loanBlocked).toBe(true);
    expect(inssProjectedMargin(1621, 0, false)?.loanBlocked).toBe(false);
  });
  it('computes a gross-only Price estimate for the selected term and monthly interest', () => {
    const pv84 = estimateProjectedInssLoan(1.85, 84);
    const pv108 = estimateProjectedInssLoan(1.85, 108);
    expect(pv84).not.toBeNull();
    expect(pv108).not.toBeNull();
    expect(pv108!).toBeGreaterThan(pv84!);
    const rate = .0185;
    expect(pv84).toBeCloseTo(42 * (1 - Math.pow(1 + rate, -84)) / rate, 2);
    expect(estimateProjectedInssLoan(0, 84)).toBeNull();
    expect(estimateProjectedInssLoan(-1, 84)).toBeNull();
    expect(estimateProjectedInssLoan(1.85, 0)).toBeNull();
    expect(estimateProjectedInssLoan(1.85, 84.5)).toBeNull();
    expect(estimateProjectedInssLoan(Number.NaN, 84)).toBeNull();
  });
});
