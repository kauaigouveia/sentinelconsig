// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {NexusHome} from '../src/components/nexus/NexusHome';
import type {PreviewRow} from '../src/components/redesign/PreviewData';
const base:PreviewRow={
  id:'p1',ade:'12345',client:'Cliente Sintético',cpf:'',bank:'C6 BANK',partner:'Parceiro A',
  product:'NOVO INSS',status:'Pendente',statusId:'PEND',color:'#ddd',
  amount:1000,contract:1200,createdAt:'2026-11-20T11:00:00Z',
  active:true,paid:false,pending:true,
};
const rows:PreviewRow[]=[
  base,
  {...base,id:'p2',ade:'23456',client:'Outro Cliente',bank:'FACTA',
    status:'Pago',statusId:'PAGO',active:false,paid:true,pending:false,amount:2000},
  {...base,id:'p3',ade:'34567',client:'Terceiro Cliente',bank:'C6 BANK',
    status:'Em análise',statusId:'ANALISE',active:true,paid:false,pending:false,amount:null},
];
afterEach(()=>cleanup());
it('mostra indicadores reais da carteira, sem valores inventados',()=>{
  render(<NexusHome rows={rows} role="MASTER" name="Operador Teste"
    navigate={()=>{}} openProposal={()=>{}}/>);
  const indicators=screen.getByRole('region',{name:'Indicadores da carteira carregada'});
  expect(within(indicators).getByText('Na carteira').parentElement?.parentElement?.textContent).toContain('3');
  expect(within(indicators).getByText('Em andamento').parentElement?.parentElement?.textContent).toContain('2');
  expect(within(indicators).getByText('Com pendência').parentElement?.parentElement?.textContent).toContain('1');
  expect(within(indicators).getByText('Pagas').parentElement?.parentElement?.textContent).toContain('1');
  expect(screen.getByText(/registros carregados/)).toBeTruthy();
  expect(screen.getByText(/C6 BANK/)).toBeTruthy();
});
it('abre a proposta real selecionada e filtra a carteira',()=>{
  const open=vi.fn();
  render(<NexusHome rows={rows} role="MASTER" name="Operador"
    navigate={()=>{}} openProposal={open}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'Buscar movimentação'}),
    {target:{value:'Cliente Sintético'}});
  expect(screen.getByRole('button',{name:'Abrir proposta de Cliente Sintético'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Abrir proposta de Terceiro Cliente'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Abrir proposta de Cliente Sintético'}));
  expect(open).toHaveBeenCalledWith('p1');
});
it('não usa dados da carteira sem a permissão de leitura',()=>{
  render(<NexusHome rows={rows} role="DIGITADOR" name="Técnico"
    navigate={()=>{}} openProposal={()=>{}}/>);
  expect(screen.queryByRole('region',{name:'Indicadores da carteira carregada'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Abrir proposta de Cliente Sintético'})).toBeNull();
});
