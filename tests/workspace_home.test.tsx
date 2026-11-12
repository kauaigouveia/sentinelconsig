// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceHome } from '../src/components/redesign/WorkspaceHome';
import type { PreviewRow } from '../src/components/redesign/PreviewData';

afterEach(cleanup);
const rows: PreviewRow[] = [{ id: 'p1', client: 'Maria Silva', cpf: '', ade: '123', bank: 'Banco exemplo', partner: '', product: 'INSS', status: 'Pendente', statusId: 's1', color: '', amount: 100, contract: 120, createdAt: '2026-11-12T12:00:00Z', active: true, paid: false, pending: true }];
describe('Página inicial orientada a tarefas', () => {
  it('busca propostas e abre o registro correto', () => {
    const openProposal = vi.fn();
    render(<WorkspaceHome rows={rows} bottlenecks={null} role="MASTER" name="Ana" navigate={vi.fn()} openProposal={openProposal}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Maria Silva' }));
    expect(openProposal).toHaveBeenCalledWith('p1');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'inexistente' } });
    expect(screen.queryByText('Maria Silva')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByText('Maria Silva')).toBeTruthy();
  });
  it('não apresenta carteira recebida sem permissão para visualizar propostas', () => {
    render(<WorkspaceHome rows={rows} bottlenecks={null} role="SIMULACAO" permissions={['simulations.view']} name="Ana" navigate={vi.fn()} openProposal={vi.fn()}/>);
    expect(screen.queryByText('Maria Silva')).toBeNull();
  });
});
