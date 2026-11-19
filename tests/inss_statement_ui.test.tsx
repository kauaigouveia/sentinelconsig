// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InssStatementWorkspace from '../src/components/simulation/InssStatementWorkspace';
import { StorageService } from '../src/services/storageService';
import { readInssStatement } from '../src/lib/readInssStatement';
import type { InssStatement } from '../src/lib/inssStatement';

vi.mock('../src/lib/readInssStatement',()=>({readInssStatement:vi.fn()}));
const fixture:InssStatement={
  customer:{name:'Pessoa sintética',cpf:'52998224725',birthDate:'1960-01-01',benefitNumber:'1234567890',benefitType:'41'},
  income:'1621.00',loanMargin:'36.52',cardMargin:'',benefitCardMargin:'',reference:'10/2026',
  uf:'',benefitStart:'',issues:[],
  contracts:['626','237','623','341','033','707'].map((bank,index)=>({
    originLenderCode:bank,originContractNumber:'C-'+index,originalTerm:'84',
    openedInstallmentNumber:'27',lastDueBalance:'1.000,50',installmentFaceValue:'36,50',
  })),
};
beforeEach(()=>{
  vi.spyOn(StorageService,'getCurrentTenantId').mockReturnValue('tenant-test');
  vi.spyOn(StorageService,'getActiveUser').mockReturnValue({id:'user-test'} as ReturnType<typeof StorageService.getActiveUser>);
  vi.mocked(readInssStatement).mockResolvedValue(fixture);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
function open(){
  const close=vi.fn();
  render(<InssStatementWorkspace scope="tenant-test:user-test" partners={[]} onClose={close} onSuccess={()=>{}}/>);
  fireEvent.change(screen.getByLabelText(/Extrato da consulta/),{target:{files:[new File(['fixture'],'teste.pdf')]}});
  return close;
}
it('exibe um botão apenas, não oferece refinanciamento separado e exige confirmação de autorização',async()=>{
  const http=vi.fn();
  vi.stubGlobal('fetch',http);
  open();
  const action=await screen.findByRole('button',{name:/Simular margem e portabilidades/});
  expect((action as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Contratos detectados no extrato: 6/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Consultar refinanciamento|Portabilidade individual|Prévia NOVO|Simular novo pela margem atual|Comparar portabilidade/})).toBeNull();
  expect(http).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio',{name:'Não'}));
  expect((action as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que o cliente autorizou/}));
  expect((action as HTMLButtonElement).disabled).toBe(false);
});

it('consulta NOVO + seis contratos em APIs via um único clique e mostra fontes',async()=>{
  const http=vi.fn(async (_url:string,_init?:RequestInit)=>new Response(JSON.stringify({
    offers:[{provider:'FACTA',institution:'FACTA',table:'Tabela banco',amount:2222,installment:36.52,rate:1.85,term:108,source:'API',review:false}],
    notices:[],
  }),{status:200}));
  vi.stubGlobal('fetch',http);
  open();
  const action=await screen.findByRole('button',{name:/Simular margem e portabilidades/});
  fireEvent.click(screen.getByRole('radio',{name:'Não'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que o cliente autorizou/}));
  fireEvent.click(action);
  await waitFor(()=>expect(http.mock.calls).toHaveLength(7));
  await waitFor(()=>expect(screen.getByText(/Consultas concluídas: 7 de 7/)).toBeTruthy());
  const operations=http.mock.calls.map(([,init])=>JSON.parse(String(init?.body)));
  expect(operations.filter(row=>row.operation==='NEW')).toHaveLength(1);
  expect(operations.filter(row=>row.operation==='PORT_REFIN')).toHaveLength(6);
  expect(operations.some(row=>row.loanMargin===42)).toBe(false);
  expect(screen.getByText(/Bruto teórico/)).toBeTruthy();
  expect(screen.getAllByText('API bancária',{exact:false}).length).toBeGreaterThan(0);
});

it('descarta leitura e simulação ao trocar de empresa',async()=>{
  let finish!:(value:InssStatement)=>void;
  vi.mocked(readInssStatement).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const close=open();
  await waitFor(()=>expect(finish).toBeTypeOf('function'));
  vi.mocked(StorageService.getCurrentTenantId).mockReturnValue('outro-tenant');
  fireEvent(window,new Event('credit_gestao_storage_update'));
  finish(fixture);
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByText('Pessoa sintética')).toBeNull();
});
