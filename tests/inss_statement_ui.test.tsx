// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InssStatementWorkspace from '../src/components/simulation/InssStatementWorkspace';
import { StorageService } from '../src/services/storageService';
import { readInssStatement } from '../src/lib/readInssStatement';
import type { InssStatement } from '../src/lib/inssStatement';

vi.mock('../src/lib/readInssStatement', () => ({ readInssStatement: vi.fn() }));
const fixture: InssStatement = {
  customer:{name:'Pessoa sintética',cpf:'00000000191',birthDate:'1960-01-01',benefitNumber:'1234567890',benefitType:'41'},
  income:'1500.50', loanMargin:'20.00', cardMargin:'', benefitCardMargin:'', reference:'01/2026', uf:'', benefitStart:'', issues:[],
  contracts:['001','123'].map(bank=>({originLenderCode:bank,originContractNumber:'Teste-'+bank, originalTerm:'84',openedInstallmentNumber:'27',lastDueBalance:'1.000,50',installmentFaceValue:'25,50'}))
};
beforeEach(()=>{
  vi.spyOn(StorageService,'getCurrentTenantId').mockReturnValue('tenant-test');
  vi.spyOn(StorageService,'getActiveUser').mockReturnValue({id:'user-test'} as ReturnType<typeof StorageService.getActiveUser>);
  vi.mocked(readInssStatement).mockResolvedValue(fixture);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function open() {
  const close = vi.fn();
  render(<InssStatementWorkspace scope="tenant-test:user-test" partners={[]} onClose={close} onSuccess={()=>{}}/>);
  fireEvent.change(screen.getByLabelText(/Extrato da consulta/),{target:{files:[new File(['fixture'],'teste.pdf')]}});
  return close;
}
it('carrega os dois contratos e só calcula após o operador confirmar a comparação', async()=>{
  const http=vi.fn(async (url:string,_init?:RequestInit)=>new Response(JSON.stringify(
    url.endsWith('/calculate') ? {offers:[{name:'Tabela sintética',code:'test',term:84,rate:1.5,amount:250}]} : {enabled:false,offers:[]}
  )));
  vi.stubGlobal('fetch',http);
  open();
  const compare = await screen.findByRole('button',{name:/Comparar portabilidade/});
  expect((compare as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('radio',{name:'Sim'}));
  fireEvent.click(compare);
  expect(screen.queryByLabelText('CPF')).toBeNull();
  const calls=()=>http.mock.calls.filter(([url])=>url==='/api/daycoval/calculate');
  expect(calls()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Comparar ofertas'}));
  await waitFor(()=>expect(calls()).toHaveLength(2));
  expect(calls().every(([,init])=>JSON.parse(String(init?.body)).illiterate==="YES")).toBe(true);
  expect(calls().map(([,init])=>JSON.parse(String(init?.body)).contracts[0])).toEqual(
    ['001','123'].map(originBank=>({originBank,originalTerm:84,remaining:27,balance:1000.50,installment:25.50})));
});
it('descarta o extrato numa troca de empresa durante a leitura', async()=>{
  let finish!: (value:InssStatement)=>void;
  vi.mocked(readInssStatement).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const close=open();
  await waitFor(()=>expect(finish).toBeTypeOf('function'));
  vi.mocked(StorageService.getCurrentTenantId).mockReturnValue('outro-tenant');
  fireEvent(window,new Event('credit_gestao_storage_update'));
  finish(fixture);
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByText('Pessoa sintética')).toBeNull();
});
