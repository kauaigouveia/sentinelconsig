// @vitest-environment jsdom
import React from 'react';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within,waitFor} from '@testing-library/react';
import {NexusHome} from '../src/components/nexus/NexusHome';
import type {PreviewRow} from '../src/components/redesign/PreviewData';
const base:PreviewRow={
  id:'p1',ade:'12345',client:'Cliente Sintético',cpf:'00000000191',bank:'C6 BANK',partner:'Parceiro A',partnerId:'pa',
  product:'NOVO INSS',convenio:'INSS',status:'Pendente',statusId:'PEND',statusCategory:'PENDENTE',color:'#ddd',
  amount:1000,contract:1200,createdAt:'2026-11-20T11:00:00Z',active:true,paid:false,pending:true,
};
const rows:PreviewRow[]=[
  base,
  {...base,id:'p2',ade:'23456',client:'Outro Cliente',bank:'FACTA',partner:'Parceiro B',partnerId:'pb',
    status:'Pago',statusId:'PAGO',statusCategory:'PAGO',active:false,paid:true,pending:false,amount:2000,contract:2400,createdAt:'2026-11-21T11:00:00Z'},
  {...base,id:'p3',ade:'34567',client:'Terceiro Cliente',bank:'C6 BANK',status:'Em análise',
    statusId:'ANALISE',statusCategory:'ANDAMENTO',active:true,paid:false,pending:false,amount:null,contract:null,createdAt:'2026-11-22T11:00:00Z'},
];
const props={rows,role:'MASTER' as const,name:'Operador Teste',navigate:vi.fn(),openProposal:vi.fn()};
beforeEach(()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>[
  {id:'s1',createdAt:'2026-11-20T12:00:00Z',partnerId:'pa',productName:'NOVO INSS',convenioName:'INSS'},
  {id:'s2',createdAt:'2026-11-21T12:00:00Z',partnerId:'pb',productName:'NOVO INSS',convenioName:'INSS'},
]}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it('mostra indicadores reais da carteira, sem valores inventados',async()=>{
  render(<NexusHome {...props}/>);
  expect(screen.getByText('SENTINEL CONSIG · INTELIGÊNCIA EM CADA OPERAÇÃO.')).toBeTruthy();
  expect(screen.queryByText(/nexus/i)).toBeNull();
  const indicators=screen.getByRole('region',{name:'Indicadores da carteira carregada'});
  expect(within(indicators).getByText('Na carteira').closest('article')?.textContent).toContain('3');
  expect(within(indicators).getByText('Valor digitado').closest('article')?.textContent).toMatch(/3[.\s]?600,00/);
  expect(within(indicators).getByText('Valor liberado').closest('article')?.textContent).toMatch(/3[.\s]?000,00/);
  const statuses=screen.getByRole('region',{name:'Situação das propostas'});
  expect(within(statuses).getByRole('button',{name:/Em andamento/}).textContent).toContain('2 proposta(s)');
  expect(within(statuses).getByRole('button',{name:/Com pendência/}).textContent).toContain('1 proposta(s)');
  expect(within(statuses).getByRole('button',{name:/Pagas/}).textContent).toContain('1 proposta(s)');
  await waitFor(()=>expect(within(indicators).getByText('Simulações salvas').closest('article')?.textContent).toContain('2'));
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Parceiro A'})).toBeTruthy();
});
it('abre a proposta real selecionada e filtra a carteira',()=>{
  const open=vi.fn();
  render(<NexusHome {...props} openProposal={open}/>);
  fireEvent.click(screen.getByRole('button',{name:'Por proposta'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Buscar movimentação'}),{target:{value:'Cliente Sintético'}});
  expect(screen.getByRole('button',{name:'Abrir proposta de Cliente Sintético'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Abrir proposta de Terceiro Cliente'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Abrir proposta de Cliente Sintético'}));
  expect(open).toHaveBeenCalledWith('p1');
});
it('filtra por data inclusiva, banco, parceiro, convênio e status',()=>{
  render(<NexusHome {...props}/>);
  fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-11-21'}});
  fireEvent.change(screen.getByLabelText('Data final'),{target:{value:'2026-11-22'}});
  fireEvent.change(screen.getByLabelText('Banco'),{target:{value:'FACTA'}});
  fireEvent.change(screen.getByLabelText('Convênio'),{target:{value:'INSS'}});
  expect(screen.getByRole('button',{name:'Parceiro B'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Parceiro A'})).toBeNull();
  fireEvent.click(screen.getByRole('region',{name:'Situação das propostas'}).querySelector('button[aria-pressed="false"]:last-child')!);
  fireEvent.click(screen.getByRole('button',{name:'Parceiro B'}));
  expect(screen.getByRole('button',{name:'Abrir proposta de Outro Cliente'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Abrir proposta de Cliente Sintético'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));
  expect(screen.getByRole('button',{name:'Abrir proposta de Cliente Sintético'})).toBeTruthy();
});
it('não usa dados da carteira sem a permissão de leitura',()=>{
  render(<NexusHome rows={rows} role="DIGITADOR" permissions={['dashboard.view']} name="Técnico" navigate={()=>{}} openProposal={()=>{}}/>);
  expect(screen.queryByRole('region',{name:'Indicadores da carteira carregada'})).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByRole('button',{name:'Abrir proposta de Cliente Sintético'})).toBeNull();
});
it('não apresenta uma falha de consulta como zero simulações',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));
  render(<NexusHome {...props}/>);
  await waitFor(()=>expect(screen.getByText('Simulações salvas').closest('article')?.textContent).toContain('fonte indisponível'));
  expect(screen.getByText('Simulações salvas').closest('article')?.textContent).toContain('—');
});

it('mantém a busca em um único campo com rótulo e limpeza independentes',()=>{
  render(<NexusHome {...props} demo/>);
  const input=screen.getByRole('textbox',{name:'Buscar movimentação'});
  expect(screen.getByText('Busca',{selector:'label'}).getAttribute('for')).toBe(input.id);
  expect(input.closest('label')).toBeNull();
  fireEvent.change(input,{target:{value:'Cliente Sintético'}});
  fireEvent.click(screen.getByRole('button',{name:'Limpar busca'}));
  expect((input as HTMLInputElement).value).toBe('');
});
it('compartilha dimensões do shell entre rotas e impede que o input cubra a borda',()=>{
  const home=readFileSync('src/components/nexus/nexus-home.css','utf8');
  const shell=readFileSync('src/styles/sentinel-clarity.css','utf8');
  expect(home).not.toContain('.sentinel-stage:has(.nx-ops-dashboard)');
  expect(shell).toContain('.sentinel-stage{grid-template-columns:200px minmax(0,1fr);grid-template-rows:56px minmax(0,1fr) auto}');
  expect(shell).toContain('scrollbar-gutter:stable');
  expect(home).toContain('background:transparent!important;box-shadow:none!important');
  expect(home).toContain('flex:1 1 0;outline:none!important');
});
