// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WorkbenchNavigation } from '../src/components/workbench/WorkbenchNavigation';
import { visibleNavigation } from '../src/components/redesign/navigation';

afterEach(cleanup);

describe('Mapa do sistema e simplificação da navegação', () => {
  it('agrupa ferramentas sem retirar rotas autorizadas', () => {
    const visible = visibleNavigation('MASTER');
    expect(visible.some(item => item.path === '/financeiro-geral' && item.group === 'Gestão')).toBe(true);
    expect(visible.some(item => item.path === '/integracoes' && item.group === 'Configurações')).toBe(true);
    expect(visible.some(item => item.path === '/propostas' && item.group === 'Operação')).toBe(true);
    expect(visible.some(item => item.path === '/central-atendimento' && item.group === 'Relacionamento')).toBe(true);
  });

  it('orienta links antigos e detalhes de proposta para a mesma tela atual', () => {
    const { rerender } = render(<WorkbenchNavigation role="MASTER" path="/producao" navigate={vi.fn()} />);
    expect(within(screen.getByRole('navigation', { name: 'Ferramentas de Operação' }))
      .getByRole('link', { name: 'Propostas' }).getAttribute('aria-current')).toBe('page');
    rerender(<WorkbenchNavigation role="MASTER" path="/propostas/registro" navigate={vi.fn()} />);
    expect(within(screen.getByRole('navigation', { name: 'Ferramentas de Operação' }))
      .getByRole('link', { name: 'Propostas' }).getAttribute('aria-current')).toBe('page');
  });

  it('apresenta um mapa orientado a tarefas, sem revelar ferramentas não autorizadas', () => {
    const navigate = vi.fn();
    render(<WorkbenchNavigation role="SIMULACAO" permissions={['clients.view']} path="/clientes" navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Todas as telas/ }));
    const region = screen.getByRole('region', { name: 'Mapa de telas autorizadas' });
    expect(within(region).getByText('Encontre sua próxima ação')).toBeTruthy();
    expect(within(region).getByRole('link', { name: 'Clientes 360°' })).toBeTruthy();
    expect(within(region).queryByRole('link', { name: 'Usuários e acessos' })).toBeNull();
    fireEvent.click(within(region).getByRole('link', { name: 'Clientes 360°' }));
    expect(navigate).toHaveBeenCalledWith('/clientes');
    expect(screen.queryByRole('region', { name: 'Mapa de telas autorizadas' })).toBeNull();
  });

  it('fecha mapa pelo teclado e devolve foco ao controle', () => {
    render(<WorkbenchNavigation role="MASTER" path="/" navigate={vi.fn()} />);
    const button = screen.getByRole('button', { name: /Todas as telas/ });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Mapa de telas autorizadas' })).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
