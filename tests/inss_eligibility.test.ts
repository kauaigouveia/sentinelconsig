import { describe, expect, it } from 'vitest';
import { ageAt, finantoAgeError, finantoInstallmentError, finantoRuleItem, finantoTableLabel, nossaFintechAgeError, nossaFintechBalanceError } from '../src/lib/inssEligibility';

const today = new Date(2026, 9, 8, 12);

describe('Regras operacionais INSS', () => {
  it('calcula idade no aniversário e rejeita datas inexistentes ou futuras', () => {
    expect(ageAt('1957-10-08', today)).toBe(69);
    expect(ageAt('1957-10-09', today)).toBe(68);
    expect(ageAt('2000-02-30', today)).toBeNull();
    expect(ageAt('2027-01-01', today)).toBeNull();
  });

  it.each([[22, 108], [68, 108], [69, 96], [70, 84], [71, 72], [72, 60], [73, 48]])('FINANTO: idade %i permite até %i parcelas', (age, term) => {
    const birth = `${2026 - age}-10-08`;
    expect(finantoAgeError(birth, term, today)).toBeNull();
    expect(finantoAgeError(birth, term + 12, today)).not.toBeNull();
  });

  it('FINANTO rejeita idade abaixo de 22 e acima de 73', () => {
    expect(finantoAgeError('2005-10-08', 48, today)).not.toBeNull();
    expect(finantoAgeError('1952-10-08', 48, today)).not.toBeNull();
  });

  it.each([[60, 75], [72, 74], [84, 73], [96, 72], [108, 71]])('Nossa Fintech: %i parcelas respeitam %i anos, 11 meses e 29 dias', (term, maxAge) => {
    expect(nossaFintechAgeError(`${2026 - maxAge - 1}-10-09`, term, today)).toBeNull();
    expect(nossaFintechAgeError(`${2026 - maxAge - 1}-10-08`, term, today)).not.toBeNull();
  });

  it('Nossa Fintech respeita os 29 dias finais mesmo em mês com 31 dias', () => {
    expect(nossaFintechAgeError('1950-11-08', 60, new Date(2026, 10, 6))).toBeNull();
    expect(nossaFintechAgeError('1950-11-08', 60, new Date(2026, 10, 7))).not.toBeNull();
    expect(nossaFintechAgeError('2008-10-09', 108, today)).not.toBeNull();
    expect(nossaFintechAgeError('2008-10-08', 108, today)).toBeNull();
  });

  it('aplica os limites de parcela nas tabelas normais e com carência', () => {
    for (const grace of ['', ' +90D']) {
      expect(finantoInstallmentError(`ESSENCIAL ≥ 50${grace}`, 50)).toBeNull();
      expect(finantoInstallmentError(`ESSENCIAL ≥ 50${grace}`, 50.01)).not.toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 99.99)).not.toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 100)).toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 300)).toBeNull();
      expect(finantoInstallmentError(`PRIME ≥ 300${grace}`, 299.99)).not.toBeNull();
      expect(finantoInstallmentError(`PRIME ≥ 300${grace}`, 300)).toBeNull();
    }
    expect(finantoTableLabel({ name: 'ESSENCIAL ≥ 50 +90D' })).toContain('parcela até R$ 50,00');
    expect(finantoTableLabel({ name: 'ESSENCIAL ≥ 50 +90D' })).toContain('90 dias');
  });

  it('não troca um prazo inexistente pelo item padrão da tabela', () => {
    const rule = { items: [{ term: 84, rate: 1.85, default: true }] };
    expect(finantoRuleItem(rule, 108)).toBeNull();
    expect(finantoRuleItem(rule, 84, 1.85)).not.toBeNull();
    expect(finantoRuleItem(rule, 84, 1.65)).toBeNull();
    expect(finantoRuleItem({ items: [{ minTerm: 60, maxTerm: 108, minRate: 1.65, maxRate: 1.85 }] }, 96, 1.7)).not.toBeNull();
  });

  it.each([[1.65, 13000], [1.78, 13000], [1.79, 4000], [1.85, 4000]])('Nossa Fintech: taxa %s requer saldo %i', (rate, minimum) => {
    const table = { name: `INSS PORT-REFIN ${rate}% - 108x` };
    expect(nossaFintechBalanceError(table, minimum)).toBeNull();
    expect(nossaFintechBalanceError(table, minimum - 0.01)).not.toBeNull();
  });

  it('aplica o saldo da tabela Exclusiva e preserva restrições adicionais da API', () => {
    expect(nossaFintechBalanceError({ name: 'INSS 1,85% Exclusiva' }, 2900)).toBeNull();
    expect(nossaFintechBalanceError({ name: 'INSS 1,85% Exclusiva' }, 2899.99)).not.toBeNull();
    expect(nossaFintechBalanceError({ name: 'INSS 1,85% (saldo mín R$ 20000)' }, 13000)).not.toBeNull();
  });
});
