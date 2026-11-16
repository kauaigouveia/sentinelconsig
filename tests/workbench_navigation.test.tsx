// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WorkbenchBrand, WorkbenchNavigation } from '../src/components/workbench/WorkbenchNavigation';
afterEach(cleanup);

it('orienta a navegação pela área e identifica uma proposta aberta por link direto', () => {
  const navigate = vi.fn();
  render(<WorkbenchNavigation role="MASTER" path="/propostas/registro" navigate={navigate}/>);
  expect(within(screen.getByRole('navigation', {name:'Áreas do sistema'})).getByRole('link', {name:'Produção'}).getAttribute('aria-current')).toBe('true');
  const tools = within(screen.getByRole('navigation', {name:'Ferramentas de Produção'}));
  expect(tools.getByRole('link', {name:'Propostas'}).getAttribute('aria-current')).toBe('page');
  fireEvent.click(tools.getByRole('link', {name:'Simular crédito'}));
  expect(navigate).toHaveBeenCalledWith('/simulacoes');
});
it('remove áreas e ferramentas não autorizadas para o perfil', () => {
  render(<WorkbenchNavigation role="SIMULACAO" permissions={['clients.view']} path="/clientes" navigate={vi.fn()}/>);
  expect(screen.queryByRole('link', {name:'Administração'})).toBeNull();
  expect(screen.queryByRole('link', {name:'Propostas'})).toBeNull();
  expect(screen.getByRole('link', {name:'Relacionamento'})).toBeTruthy();
});
it('preserva a identidade cadastrada e o acesso ao início', () => {
  const home = vi.fn();
  render(<WorkbenchBrand name="Empresa Exemplo" logo="/brand-local.png" onHome={home}/>);
  expect(screen.getByAltText('Empresa Exemplo').getAttribute('src')).toBe('/brand-local.png');
  fireEvent.click(screen.getByRole('button', {name:'Início — Empresa Exemplo'}));
  expect(home).toHaveBeenCalledOnce();
});
