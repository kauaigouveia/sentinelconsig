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

it('tracks the four PDF sources with hashes, actual versions and page references', () => {
 const updated = BANK_PLAYBOOKS.filter(book => book.sourceFile);
 expect(updated.map(book => book.id).sort()).toEqual(['bmg','daycoval','facta','parana']);
 expect(updated.every(book => /^[a-f0-9]{64}$/.test(book.sourceSha256 || '') && (book.sourcePageCount || 0) > 0)).toBe(true);
 expect(updated.find(book => book.id === 'bmg')?.version).toContain('21/07/2026');
 expect(updated.find(book => book.id === 'daycoval')?.version).toContain('02/07/2026');
 const found = searchBankPlaybooks('BMG 28 anos');
 expect(found.some(row => row.bankId === 'bmg' && row.page === '5' && row.sourceFile?.includes('BMG'))).toBe(true);
});
it('enforces the BMG pension age and the documented benefit duration for disability', () => {
 const find = (extra: any) => evaluateBankPlaybooks({ birthDate: '1999-10-16', species: '21', operation: 'NEW', ...extra }, new Date(2026,9,16)).find(row => row.bankId === 'bmg')!;
 expect(find({}).blocked.join(' ')).toContain('28 anos completos');
 expect(find({ birthDate: '1998-10-16' }).status).toBe('REVIEW');
 expect(find({ birthDate: '1972-10-16', species: '32' }).status).toBe('BLOCKED');
 expect(find({ birthDate: '1971-10-16', species: '32', benefitStartDate: '2012-10-16' }).status).toBe('BLOCKED');
 expect(find({ birthDate: '1971-10-16', species: '32', benefitStartDate: '2011-10-16' }).status).toBe('REVIEW');
});
it('preserves historical and conflicting PDF caveats instead of treating them as current permission', () => {
 const facta = BANK_PLAYBOOKS.find(book => book.id === 'facta')!;
 expect(facta.text).toContain('EXCEÇÃO HISTÓRICA');
 expect(facta.text).toContain('somente para operações NOVAS');
 expect(facta.text).toContain('não confirma limite de dez arquivos');
 const row = evaluateBankPlaybooks({ birthDate: '1960-01-01', species: '41', operation: 'NEW', state: 'SC' }, new Date(2026,9,16)).find(row => row.bankId === 'facta')!;
 expect(row.status).toBe('REVIEW'); expect(row.review.join(' ')).toContain('formalização física/híbrida');
 const parana = BANK_PLAYBOOKS.find(book => book.id === 'parana')!;
 expect(parana.text).toContain('Conferir acordo específico'); expect(parana.text).toContain('fronteira exata de 58');
 expect(evaluateBankPlaybooks({ birthDate: '1960-01-01', species: '41', operation: 'NEW', legalRepresentative: true }, new Date(2026,9,16)).find(row => row.bankId === 'parana')?.blocked.join(' ')).toContain('Representação legal');
});
