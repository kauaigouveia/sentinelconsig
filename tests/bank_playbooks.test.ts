import { describe, expect, it } from 'vitest';
import { BANK_PLAYBOOKS, evaluateBankPlaybooks, searchBankPlaybooks } from '../src/lib/bankPlaybooks';
const today = new Date(2026, 9, 16);
const base = { birthDate: '1966-10-16', species: '41', operation: 'NEW' as const, term: 108, state: 'SP' };
const evaluate = (input = {}) => evaluateBankPlaybooks({ ...base, ...input }, today);
describe('company supplied INSS playbooks', () => {
 it('imports nine distinct banks and preserves the supplied version provenance', () => {
  expect(BANK_PLAYBOOKS).toHaveLength(9); expect(new Set(BANK_PLAYBOOKS.map(row => row.id)).size).toBe(9);
  expect(BANK_PLAYBOOKS.find(row => row.id === 'safra')?.version).toContain('193');
  expect(BANK_PLAYBOOKS.every(row => row.text.length > 1000 && row.receivedAt === '2026-10-16')).toBe(true);
 });
 it('finds source passages without requiring API activation', () => {
  const matches = searchBankPlaybooks('FACTA Piauí');
  expect(matches.some(row => row.bankId === 'facta' && row.excerpt.includes('Piauí'))).toBe(true);
  expect(searchBankPlaybooks('xyzunmatched123')).toEqual([]);
  expect(searchBankPlaybooks('  ')).toEqual([]);
 });
 it('flags explicit species and regional restrictions without inventing approval', () => {
  expect(evaluate({ state: 'PI' }).find(row => row.bankId === 'facta')?.status).toBe('BLOCKED');
  expect(evaluate({ species: '87' }).find(row => row.bankId === 'c6')?.status).toBe('BLOCKED');
  expect(evaluate().every(row => row.status !== ('APPROVED' as any))).toBe(true);
 });
 it('uses age boundaries and operation-specific limits', () => {
  expect(evaluate({ birthDate: '1954-10-16', term: 108 }).find(row => row.bankId === 'facta')?.blocked.join(' ')).toContain('96 meses');
  expect(evaluate({ birthDate: '1952-10-16', term: 72 }).find(row => row.bankId === 'c6')?.status).toBe('REVIEW');
  expect(evaluate({ birthDate: '1952-10-16', operation: 'PORT_REFIN', term: 72 }).find(row => row.bankId === 'c6')?.status).toBe('BLOCKED');
  expect(evaluate({ birthDate: '1957-10-16', term: 96 }).find(row => row.bankId === 'presenca')?.blocked.join(' ')).toContain('84 meses');
 });
 it('does not silently resolve contradictory or missing policies', () => {
  expect(evaluate({ operation: 'PORT_REFIN' }).find(row => row.bankId === 'finanto')?.review.join(' ')).toContain('divergentes');
  expect(evaluate({ species: '32' }).find(row => row.bankId === 'presenca')?.review.join(' ')).toContain('não aparece');
  expect(evaluate({ birthDate: '' }).every(row => row.review.join(' ').includes('nascimento'))).toBe(true);
 });
 it('does not ship internal promoter names or correspondent commission instructions to partners', () => {
  expect(JSON.stringify(BANK_PLAYBOOKS)).not.toMatch(/BEM PROMOTORA|Suporte ao Correspondente|SIM remunera/);
 });
});
