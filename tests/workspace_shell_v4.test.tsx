// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { WorkbenchNavigation } from '../src/components/workbench/WorkbenchNavigation';
import { WorkspaceGuide } from '../src/components/workbench/WorkspaceGuide';
import { PremiumRecordWorkspace } from '../src/components/redesign/PremiumRecordWorkspace';

afterEach(cleanup);
describe('Sentinel v4: navegação por tarefa e orientação operacional',()=>{
 it('garante que a prévia e a aplicação compartilham a grade lateral',()=>{
  const app=readFileSync('src/App.tsx','utf8');
  const preview=readFileSync('src/workspace-preview.tsx','utf8');
  const css=readFileSync('src/components/workbench/workspace-shell.css','utf8');
  expect(app).toContain('s2-root s3-root s4-root');
  expect(preview).toContain('s2-root s3-root s4-root');
  expect(css).toContain('grid-template-columns:248px minmax(0,1fr)');
  expect(css).toContain('wb-mobile-open');
 });
 it('mantém a navegação do módulo com contexto e o mapa completo',()=>{
  const navigate=vi.fn();
  render(<WorkbenchNavigation role="MASTER" path="/propostas/123" navigate={navigate}/>);
  expect(within(screen.getByRole('navigation',{name:'Ferramentas de Operação'})).getByRole('link',{name:'Propostas'}).getAttribute('aria-current')).toBe('page');
  fireEvent.click(screen.getByRole('button',{name:'Todas as telas'}));
  expect(screen.getByRole('dialog',{name:'Mapa de telas autorizadas'})).toBeTruthy();
  fireEvent.click(within(screen.getByRole('dialog',{name:'Mapa de telas autorizadas'})).getByRole('link',{name:'Simular crédito'}));
  expect(navigate).toHaveBeenCalledWith('/simulacoes');
 });
 it('oferece menu móvel acionável e fechamento sem alterações no router',()=>{
  const navigate=vi.fn();
  render(<WorkbenchNavigation role="MASTER" path="/propostas" navigate={navigate}/>);
  fireEvent.click(screen.getByRole('button',{name:/Menu/i,expanded:false}));
  expect(screen.getByRole('button',{name:/Menu/i,expanded:true})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Fechar menu lateral'}));
  expect(screen.getByRole('button',{name:/Menu/i,expanded:false})).toBeTruthy();
 });
 it('explica a jornada e restringe atalhos às permissões de quem acessa',()=>{
  const navigate=vi.fn();
  render(<WorkspaceGuide pathname="/propostas" role="MASTER" navigate={navigate}/>);
  fireEvent.click(screen.getByRole('button',{name:/Como funciona/}));
  const section=screen.getByRole('navigation',{name:'Próximos passos'});
  expect(within(section).getByRole('link',{name:'Simular crédito'})).toBeTruthy();
  fireEvent.click(within(section).getByRole('link',{name:'Simular crédito'}));
  expect(navigate).toHaveBeenCalledWith('/simulacoes');
 });
 it('remove o aviso redundante apenas da tela de simulações',()=>{
  const navigate=vi.fn();
  const {rerender}=render(<WorkspaceGuide pathname="/simulacoes" role="MASTER" navigate={navigate}/>);
  expect(screen.queryByRole('complementary',{name:'Orientação da tela'})).toBeNull();
  rerender(<WorkspaceGuide pathname="/propostas" role="MASTER" navigate={navigate}/>);
  expect(screen.getByRole('complementary',{name:'Orientação da tela'})).toBeTruthy();
 });
 it('mantém registros, controles e resumo operacional sem desalinhamento estrutural',()=>{
  const onMode=vi.fn();
  render(<PremiumRecordWorkspace count={10} mode="list" onMode={onMode}
    filters={<div>Filtro de teste</div>} summary={<p>Dados operacionais</p>}>
    <p>Resultado da simulação</p>
  </PremiumRecordWorkspace>);
  expect(screen.getByRole('status').textContent).toBe('10 registros encontrados');
  expect(screen.getByText('Registros')).toBeTruthy();
  const toolbar=screen.getByText('Registros').closest('.p2-operational-toolbar');
  expect(toolbar?.querySelector('.p2-actions')).toBeTruthy();
  const info=screen.getByText('Visão operacional').closest('details');
  expect(info?.previousElementSibling).toBe(toolbar);
  expect(screen.getByText('Filtro de teste').closest('aside')?.hidden).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:/Filtros/}));
  expect(screen.getByText('Filtro de teste').closest('aside')?.hidden).toBe(false);
  fireEvent.click(screen.getByText('Visão operacional'));
  expect(screen.getByText('Dados operacionais')).toBeTruthy();
  expect(screen.getByText('Resultado da simulação')).toBeTruthy();
 });
 it('não mostra dicas de rotas sem permissão',()=>{
  render(<WorkspaceGuide pathname="/propostas" role="SIMULACAO" permissions={['simulations.view']} navigate={vi.fn()}/>);
  expect(screen.queryByRole('complementary',{name:'Orientação da tela'})).toBeNull();
 });
});
