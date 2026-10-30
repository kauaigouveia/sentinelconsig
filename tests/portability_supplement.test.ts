import {describe,expect,it} from 'vitest';
import historical from '../src/data/portabilityRules20261019.json';
import supplement from '../src/data/portabilityRulesSupplement.json';
import {evaluatePortabilityPolicy,portabilityBankId} from '../src/lib/portabilityPolicy';
import {simulationPortabilityCheck} from '../src/lib/portabilitySimulationPolicy';
import {PORTABILITY_BOOKS} from '../src/lib/portabilityPlaybooks';
const complete={operation:'PORT_REFIN',birthDate:'1980-01-01',simulationDate:'2026-10-30',state:'SP',
 benefitType:41,remainingInstallments:36,term:36,debt:10000,originalInstallment:900,installment:900,amount:1000,refinRate:1.6};
describe('documentary portability supplement, synthetic data only',()=>{
 it.each(['PB CONSIGNADO','PARANÁ BANCO','BANCO PARANÁ','PARANÁ BANCO S.A.','254'])('normalizes %s independently from Banrisul',alias=>{
  expect(portabilityBankId(alias)).toBe('parana');
  expect(evaluatePortabilityPolicy(alias,'001',30,complete)?.bankId).toBe('parana');
  expect(portabilityBankId('Banrisul')).toBe('banrisul');expect(portabilityBankId('041')).toBe('banrisul');
 });
 it('resolves Paraná as an origin too without matching Banrisul',()=>{
  expect(evaluatePortabilityPolicy('pan','PB CONSIGNADO',30,complete)?.reason).not.toContain('Informe o banco de origem');
  expect(evaluatePortabilityPolicy('pan','Banrisul',29,complete)?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('pan','Paraná Banco',29,complete)?.blocked).toBe(false);
 });
 it('keeps all nine source banks and dates without manufacturing an effective date',()=>{
  expect(supplement.banks.map(bank=>bank.id)).toEqual(['facta','c6','digio','safra','parana','quero-credito','banrisul','daycoval','pan']);
  expect(supplement.effectiveAt).toBeNull();expect(supplement.priority).toBeNull();
  expect(PORTABILITY_BOOKS.filter(book=>book.bankId==='facta')).toHaveLength(2);
  expect(evaluatePortabilityPolicy('facta','623',30,complete)?.sources).toHaveLength(2);
 });
 it('does not silently resolve FACTA PAN 15/30 or prior rate conflicts',()=>{
  const check=evaluatePortabilityPolicy('facta','623',20,complete)!;
  expect(check.status).toBe('PENDENTE DE DADOS');expect(check.reason).toContain('15 ou 30');
  expect(check.reason).toContain('refinRates');
  expect(evaluatePortabilityPolicy('facta','623',14,complete)?.status).toBe('NÃO ELEGÍVEL');
 });
 it('enforces agreed origin exclusions and keeps conflicting exclusions pending',()=>{
  expect(evaluatePortabilityPolicy('facta','012',30,complete)?.status).toBe('NÃO ELEGÍVEL');
  const check=evaluatePortabilityPolicy('parana','149',30,complete)!;
  expect(check.status).toBe('PENDENTE DE DADOS');expect(check.reason).toContain('listas de exclusão divergem');
 });
 it('compares an individual agreement against the older declared category before rejecting',()=>{
  const check=evaluatePortabilityPolicy('c6','149',12,{...complete,originCategory:'CORBAN'})!;
  expect(check.blocked).toBe(false);expect(check.status).toBe('PENDENTE DE DADOS');
  expect(check.reason).toContain('mínimo de pagas conflitante');
 });
 it.each([['PAN','626',35],['SAFRA','149',23],['Quero + Crédito','001',14]])('blocks insufficient paid installments for %s', (bank,origin,paid)=>{
  expect(evaluatePortabilityPolicy(bank as string,origin,paid,complete)?.status).toBe('NÃO ELEGÍVEL');
 });
 it.each([
  {birthDate:'2010-01-01'}, {birthDate:'1940-01-01'}, {debt:5999},
 ])('applies PAN confirmed age and balance bounds %j',patch=>{
  expect(evaluatePortabilityPolicy('pan','001',30,{...complete,...patch})?.status).toBe('NÃO ELEGÍVEL');
 });
 it('applies new-bank installment, operation and reduction rules',()=>{
  expect(evaluatePortabilityPolicy('Quero + Crédito','001',30,{...complete,installment:19})?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('pan','001',30,{...complete,operation:'PORT'})?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('Quero + Crédito','001',30,{...complete,installment:800,negativeMargin:false})?.blocked).toBe(true);
 });
 it('classifies complete PAN data as eligible and missing information as pending',()=>{
  expect(evaluatePortabilityPolicy('pan','001',30,complete)?.status).toBe('ELEGÍVEL');
  const check=evaluatePortabilityPolicy('pan','',undefined,{})!;
  expect(check.blocked).toBe(false);expect(check.status).toBe('PENDENTE DE DADOS');
  expect(check.reason).toMatch(/origem/);expect(check.reason).toMatch(/restantes/);expect(check.reason).toMatch(/saldo/i);
 });
 it('checks every source contract and does not mutate shared policy across tenants',()=>{
  const before=JSON.stringify(historical);
  const raw={...complete,originalBank:'001',originalTerm:60,remainingTerm:36,contracts:[
   {originBank:'001',paidInstallments:30,balance:10000,installment:900,remaining:36},
   {originBank:'121',paidInstallments:30,balance:10000,installment:900,remaining:36},
  ]};
  const check=simulationPortabilityCheck('pan',raw);
  expect(check.blocked).toBe(true);expect(check.reason).toContain('Contrato 2');expect(check.contracts).toHaveLength(2);
  expect(evaluatePortabilityPolicy('pan','001',30,complete)?.status).toBe('ELEGÍVEL');
  expect(JSON.stringify(historical)).toBe(before);
 });
 it('checks the final age and preserves negative-margin/unification operation restrictions',()=>{
  expect(evaluatePortabilityPolicy('parana','001',30,{...complete,contractEndDate:'2058-01-01'})?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('banrisul','001',30,{...complete,contractEndDate:'2062-01-01'})?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('Quero + Crédito','001',30,{...complete,refinRate:1.55,installment:800,negativeMargin:true,contractCount:2})?.blocked).toBe(false);
  expect(evaluatePortabilityPolicy('safra','001',30,{...complete,negativeMargin:true,operation:'PORT'})?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('facta','001',30,{...complete,contractCount:7})?.blocked).toBe(true);
  expect(evaluatePortabilityPolicy('c6','001',30,{...complete,installment:700,originalInstallment:1000})?.reason).toContain('redução limitada a 15%');
 });
});
