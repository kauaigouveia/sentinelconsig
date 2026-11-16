// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {initialTelegramSimulationSelection} from '../src/components/partner-portal/PartnerSimulationsView';

describe('Portal do Parceiro: seleção do produto por link do Telegram',()=>{
 it('pré-seleciona Novo, Refin, Port e Refin Port apenas para INSS',()=>{
  for(const op of ['NEW','REFIN','PORT','PORT_REFIN']){
   expect(initialTelegramSimulationSelection('?tab=simulacoes&product=INSS&operation='+op)).toEqual({product:'INSS',operation:op,term:'108'});
  }
 });
 it('pré-seleciona CLT e FGTS com seus prazos iniciais atuais',()=>{
  expect(initialTelegramSimulationSelection('?product=CLT')).toEqual({product:'CLT',operation:'NEW',term:'0'});
  expect(initialTelegramSimulationSelection('?product=FGTS')).toEqual({product:'FGTS',operation:'NEW',term:'4'});
 });
 it('ignora produto e modalidade arbitrários sem copiar dados pessoais da URL',()=>{
  expect(initialTelegramSimulationSelection('?product=CLT&operation=PORT_REFIN&cpf=00000000000')).toEqual({product:'CLT',operation:'NEW',term:'0'});
  expect(initialTelegramSimulationSelection('?product=INVALID&operation=INVALID')).toEqual({product:'INSS',operation:'NEW',term:'108'});
 });
});
