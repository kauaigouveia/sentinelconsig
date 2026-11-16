// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PortabilityResults } from '../src/components/simulation/PortabilityResults';
import { portabilityQuoteCondition, formatMonthlyRate } from '../src/lib/portRefinQuote';
import { inssSimulationDraft } from '../server/services/inssSimulationDraft';
import type { SimulationRequest } from '../src/types';

afterEach(cleanup);
const row = (provider:string, overrides:Record<string,unknown>={}) => ({
 provider, contractLabel:'Contrato 3 · banco 237 · parcela R$ 30,00',
 originalInstallment:30, success:true, requiresReview:true, term:108, troco:334.12,
 table:{cod_tabela:'SYNTHETIC-108',name:'RFN INSS · planilha teste'},
 data:{rate:1.8500000000000003,installment:30,contractAmount:1400},
 ...overrides,
});
const customerData = {birthDate:'1966-06-15',benefitNumber:'0000000001',benefitType:32,name:'Pessoa de teste'};
describe('Cotações de planilha INSS: seleção segura para revisão',()=>{
 it.each([
  ['DAYCOVAL','DAYCOVAL'],
  ['C6','C6_PLANILHA'],
  ['PARANA','PARANA_PLANILHA'],
 ])('salva a origem de %s separada das ofertas bancárias aprovadas', (bank,expected)=>{
  const quote = portabilityQuoteCondition(row(bank),30);
  expect(quote).toMatchObject({provider:expected,quoteKind:'SPREADSHEET_ESTIMATE',reviewRequired:true,reviewState:'PENDING',amount:334.12,installment:30,rate:1.8500000000000003});
  const saved = inssSimulationDraft({customerData,selectedCondition:quote,operationType:'PORT_REFIN'});
  expect(saved.selectedCondition).toMatchObject({provider:expected,quoteKind:'SPREADSHEET_ESTIMATE',reviewRequired:true,reviewState:'PENDING'});
  expect(saved.customerData.quoteReview).toMatchObject({required:true,status:'PENDING'});
 });
 it('preserva limites da API C6 e bloqueia validação contratual automática por planilha',()=>{
  const sheet=portabilityQuoteCondition(row('C6'),30);
  expect(()=>inssSimulationDraft({customerData,selectedCondition:sheet,operationType:'NEW'})).toThrow('planilha');
  expect(()=>inssSimulationDraft({customerData,selectedCondition:{...sheet,quoteKind:undefined},operationType:'PORT_REFIN'})).toThrow('planilha');
  const api={provider:'C6',tableId:'api',tableName:'API',term:108,amount:1000,rate:1.85,installment:30};
  expect(()=>inssSimulationDraft({customerData,selectedCondition:api,operationType:'PORT_REFIN'})).toThrow('C6 via API');
 });
 it('não aceita troco negativo ou dados insuficientes',()=>{
  const quote=portabilityQuoteCondition(row('PARANA',{troco:-1}),30);
  expect(()=>inssSimulationDraft({customerData,selectedCondition:quote,operationType:'PORT_REFIN'})).toThrow('válida');
 });
 it('formata taxas sem a sequência decimal de ponto flutuante do exemplo',()=>{
  expect(formatMonthlyRate(1.8500000000000003)).toBe('1,85% a.m.');
  expect(formatMonthlyRate(1.406)).toBe('1,406% a.m.');
  expect(formatMonthlyRate(null)).toBe('Não informada');
 });
 it('preserva grupo de contratos e filtra dados adicionais enviados por cliente',()=>{
  const quote=portabilityQuoteCondition(row('DAYCOVAL'),30);
  const original={lenderCode:'237',contractNumber:'TEST-CONTRACT',installmentValue:'30',dueBalanceValue:'1018.99',sensitive:'não copiar'};
  const saved=inssSimulationDraft({customerData:{...customerData,originContracts:[original]},selectedCondition:quote,operationType:'PORT_REFIN'});
  expect(saved.customerData.originContracts?.[0]).toMatchObject({lenderCode:'237',contractNumber:'TEST-CONTRACT',dueBalanceValue:'1018.99'});
  expect(JSON.stringify(saved.customerData)).not.toContain('não copiar');
 });
 it('permite selecionar cotação com revisão pendente, mas impede valores inválidos',()=>{
  const offers=[row('DAYCOVAL'),row('C6',{troco:0})];
  function Scenario(){
   const [selected,setSelected] = useState<any>(null);
   return <><PortabilityResults rows={offers} selected={selected} onSelect={setSelected}
    conditionFor={offer=>({rate:offer.data.rate,installment:offer.data.installment})}/>
    <output>{selected ? selected.provider : ''}</output></>;
  }
  render(<Scenario/>);
  const buttons=screen.getAllByRole('button',{name:'Selecionar cotação'});
  expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(buttons[0]);
  expect(screen.getByRole('button',{name:'Cotação selecionada'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('complementary',{name:'Resumo selecionado para o parceiro'})).toBeTruthy();
  expect(screen.getByText(/Troco estimado:/)).toBeTruthy();
  expect(screen.getAllByText(/1,85% a.m./).length).toBeGreaterThan(0);
  expect(screen.getByRole('button',{name:'Copiar resumo para parceiro'})).toBeTruthy();
 });
});
