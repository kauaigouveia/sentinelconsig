import { describe, expect, it } from 'vitest';
import { ageAt, finantoAgeError, finantoCashOutError, finantoInstallmentError, finantoRuleItem, finantoTableLabel, finantoTableRateError, nossaFintechAgeError, nossaFintechBalanceError } from '../src/lib/inssEligibility';

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
      expect(finantoInstallmentError(`ESSENCIAL ≥ 50${grace}`, 49.99)).not.toBeNull();
      expect(finantoInstallmentError(`ESSENCIAL ≥ 50${grace}`, 100)).toBeNull();
      expect(finantoInstallmentError(`ESSENCIAL ≥ 50${grace}`, 100.01)).not.toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 100)).not.toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 101)).toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 299)).toBeNull();
      expect(finantoInstallmentError(`SELECT ≥ 100${grace}`, 299.01)).not.toBeNull();
      expect(finantoInstallmentError(`PRIME ≥ 300${grace}`, 300)).not.toBeNull();
      expect(finantoInstallmentError(`PRIME ≥ 300${grace}`, 300.01)).toBeNull();
    }
    expect(finantoTableLabel({ name: 'ESSENCIAL ≥ 50 +90D' })).toContain('parcela R$ 50,00 a R$ 100,00');
    expect(finantoTableLabel({ name: 'ESSENCIAL ≥ 50 +90D' })).toContain('90 dias');
  });

  it.each([['ESSENCIAL', 1.75], ['SELECT', 1.68], ['PRIME', 1.6]])('aplica a taxa do roteiro da tabela %s', (name, minimum) => {
    expect(finantoTableRateError(name, minimum)).toBeNull();
    expect(finantoTableRateError(name, 1.85)).toBeNull();
    expect(finantoTableRateError(name, minimum - 0.01)).not.toBeNull();
    expect(finantoTableRateError(name, 1.86)).not.toBeNull();
  });

  it('só libera oferta Port/Refin com troco de pelo menos R$ 100', () => {
    expect(finantoCashOutError('PRIME', { refinancing: { netValue: 100 } })).toBeNull();
    expect(finantoCashOutError('SELECT', { refinancing: { netValue: 99.99 } })).not.toBeNull();
    expect(finantoCashOutError('ESSENCIAL', { refinancing: { netValue: 0 } })).not.toBeNull();
    expect(finantoCashOutError('ESSENCIAL', {})).not.toBeNull();
  });

  it('usa um item com taxa operacional válida em vez do primeiro item inválido', () => {
    expect(finantoRuleItem({ name: 'SELECT', items: [{ term: 108, rate: 1.6 }, { term: 108, rate: 1.7 }] }, 108)?.rate).toBe(1.7);
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
