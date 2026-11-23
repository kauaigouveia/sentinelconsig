// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InssStatementWorkspace from '../src/components/simulation/InssStatementWorkspace';
import { StorageService } from '../src/services/storageService';
import { readInssStatement } from '../src/lib/readInssStatement';
import type { InssStatement } from '../src/lib/inssStatement';

vi.mock('../src/lib/readInssStatement',()=>({readInssStatement:vi.fn()}));
vi.mock('../src/components/simulation/NossaFintechPortRefinSimulationModal',()=>({
  NossaFintechPortRefinSimulationModal:({statement,autoRunFromStatement,onBack}:any)=>
    <section aria-label="Comparador original restaurado" data-count={statement?.contracts.length}
      data-benefit-count={statement?.benefitContractCount} data-auto-run={String(autoRunFromStatement)}>
      <p>Comparador com unificações Daycoval e seleção de ofertas</p>
      <button type="button" onClick={onBack}>Voltar ao extrato</button>
    </section>,
}));
const fixture:InssStatement={
  customer:{name:'Pessoa sintética',cpf:'52998224725',birthDate:'1960-01-01',benefitNumber:'1234567890',benefitType:'41'},
  income:'1621.00',loanMargin:'36.52',cardMargin:'81.05',benefitCardMargin:'81.05',
  reference:'10/2026',uf:'',benefitStart:'',issues:[],
  contracts:['626','237','237','623','341','033'].map((bank,index)=>({
    originLenderCode:bank,originContractNumber:'C-'+index,
    originalTerm:'84',openedInstallmentNumber:'27',lastDueBalance:'1000.50',installmentFaceValue:'36.50',
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
it('restaura seleção dos contratos, prévia de margem e somente um botão principal',async()=>{
  open();
  const action=await screen.findByRole('button',{name:/Simular margem e portabilidades \(6 contratos\)/});
  expect((action as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Empréstimos do extrato \(6\)/)).toBeTruthy();
  const checked=screen.getAllByRole('checkbox').filter((x:any)=>x.checked);
  expect(checked).toHaveLength(6);
  expect(screen.getByText(/Prévia separada — aumento projetado de 2027/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Consultar refinanciamento|Portabilidade individual|Simular novo pela margem atual|Comparar portabilidade/})).toBeNull();
  fireEvent.click(screen.getByRole('radio',{name:'Não'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que o cliente autorizou/}));
  fireEvent.click(action);
  const modal=screen.getByRole('region',{name:'Comparador original restaurado'});
  expect(modal.getAttribute('data-count')).toBe('6');
  expect(modal.getAttribute('data-benefit-count')).toBe('6');
  expect(modal.getAttribute('data-auto-run')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'Voltar ao extrato'}));
  expect(screen.getByRole('button',{name:/Simular margem e portabilidades/})).toBeTruthy();
});
it('mantém a seleção editável e informa ao Paraná o total de contratos no benefício',async()=>{
  open();
  await screen.findByText(/Empréstimos do extrato \(6\)/);
  const inputs=screen.getAllByRole('checkbox').filter((x:any)=>x.checked);
  fireEvent.click(inputs[0]);
  fireEvent.click(screen.getByRole('radio',{name:'Sim'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que o cliente autorizou/}));
  fireEvent.click(screen.getByRole('button',{name:/Simular margem e portabilidades \(5 contratos\)/}));
  const modal=screen.getByRole('region',{name:'Comparador original restaurado'});
  expect(modal.getAttribute('data-count')).toBe('5');
  expect(modal.getAttribute('data-benefit-count')).toBe('6');
});
it('descarta o extrato e fecha a simulação quando a sessão troca de empresa',async()=>{
  let finish!:(value:InssStatement)=>void;
  vi.mocked(readInssStatement).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const close=open();
  await waitFor(()=>expect(finish).toBeTypeOf('function'));
  vi.mocked(StorageService.getCurrentTenantId).mockReturnValue('other-tenant');
  fireEvent(window,new Event('credit_gestao_storage_update'));
  finish(fixture);
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByText('Pessoa sintética')).toBeNull();
});

it('extrato com margem positiva e nenhum contrato libera NOVO sem selecionar portabilidade',async()=>{
  vi.mocked(readInssStatement).mockResolvedValue({
    ...fixture, contracts:[], loanMargin:'87.06',issues:[],
  });
  open();
  const action=await screen.findByRole('button',{name:'Simular NOVO pela margem disponível'});
  expect(screen.getByText(/Nenhum empréstimo ativo identificado/)).toBeTruthy();
  expect((action as HTMLButtonElement).disabled).toBe(true); // autorização e alfabetização obrigatórias
  expect(screen.queryByText(/Total de contratos no benefício \(Paraná\)/)).toBeNull();
  fireEvent.click(screen.getByRole('radio',{name:'Não'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que o cliente autorizou/}));
  expect((action as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(action);
  const modal=screen.getByRole('region',{name:'Comparador original restaurado'});
  expect(modal.getAttribute('data-count')).toBe('0');
  expect(modal.getAttribute('data-auto-run')).toBe('true');
});

it('extrato sem contratos e sem margem de empréstimo não inicia cotação fictícia',async()=>{
  vi.mocked(readInssStatement).mockResolvedValue({
    ...fixture, contracts:[], loanMargin:'0.00',issues:[],
  });
  open();
  const action=await screen.findByRole('button',{name:'Simular NOVO pela margem disponível'});
  fireEvent.click(screen.getByRole('radio',{name:'Não'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Confirmo que o cliente autorizou/}));
  expect((action as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Não há portabilidade para comparar/)).toBeTruthy();
});
