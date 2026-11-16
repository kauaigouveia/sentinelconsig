// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { WorkbenchNavigation } from '../src/components/workbench/WorkbenchNavigation';
import { WorkspaceGuide } from '../src/components/workbench/WorkspaceGuide';

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
  expect(screen.getByRole('region',{name:'Mapa de telas autorizadas'})).toBeTruthy();
  fireEvent.click(within(screen.getByRole('region',{name:'Mapa de telas autorizadas'})).getByRole('link',{name:'Simular crédito'}));
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
 it('não mostra dicas de rotas sem permissão',()=>{
  render(<WorkspaceGuide pathname="/propostas" role="SIMULACAO" permissions={['simulations.view']} navigate={vi.fn()}/>);
  expect(screen.queryByRole('complementary',{name:'Orientação da tela'})).toBeNull();
 });
});
