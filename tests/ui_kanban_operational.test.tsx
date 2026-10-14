// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ update: false, write: vi.fn(), blockedStage: false, noManualDestination: false }));
vi.mock('../src/services/storageService', () => ({StorageService:{
  getProposals: () => [{id:'unit-proposal',proposalNumber:'SAFE-1',statusId:'s1',clientId:'c1',productId:'prod',createdAt:new Date().toISOString(),disbursedValue:100}],
  getStatuses: () => [{id:'s1',name:'Etapa local A',active:true,manualChangeAllowed:true}, ...(state.blockedStage ? [{id:'automatic',name:'Etapa automática',active:true,manualChangeAllowed:false},{id:'inactive',name:'Etapa inativa',active:false,manualChangeAllowed:true}] : []),{id:'s2',name:'Etapa local B',active:true,manualChangeAllowed:!state.noManualDestination}],
  getClients: () => [{id:'c1',fullName:'Cliente fictício',cpf:'00000000000'}],
  getProducts: () => [{id:'prod',name:'Produto local'}], getBanks:()=>[],getPromoters:()=>[],getPartners:()=>[],getHistory:()=>[],
  getActiveUser: () => ({role:'MASTER',customPermissions:state.update ? ['proposals.view','proposals.update'] : ['proposals.view']}),
  updateProposalStatus: state.write,
}}));
vi.mock('../src/components/production/ProposalDetailModal', () => ({ProposalDetailModal:({proposalId}:any)=><div data-testid="proposal-detail">{proposalId}</div>}));
import { KanbanBoard } from '../src/components/production/KanbanBoard';
beforeEach(() => {state.update=false;state.blockedStage=false;state.noManualDestination=false;state.write.mockClear();vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new Error('Network forbidden in local test'))));});
afterEach(() => {cleanup();vi.unstubAllGlobals();});
describe('Kanban operacional Premium, sem persistência', () => {
  it('navega para etapa existente, filtra e abre o detalhe original', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView=scroll;
    render(<KanbanBoard premium />);
    const navigator = screen.getByRole('navigation',{name:'Etapas da esteira'});
    fireEvent.click(within(navigator).getByRole('button',{name:'Etapa local B: 0 propostas'}));
    expect(scroll).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByLabelText('Etapa Etapa local B'));
    fireEvent.change(screen.getByPlaceholderText('Buscar ADE, CPF ou Parceiro...'),{target:{value:'inexistente'}});
    expect(screen.queryByText('ADE SAFE-1')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Buscar ADE, CPF ou Parceiro...'),{target:{value:''}});
    fireEvent.click(screen.getByText('ADE SAFE-1'));
    expect(screen.getByTestId('proposal-detail').textContent).toBe('unit-proposal');
    expect(fetch).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
  });
  it('mantém o gate de mudança de status sem executar a ação', () => {
    const {rerender} = render(<KanbanBoard premium />);
    expect(screen.queryByTitle('Avançar para próxima etapa')).toBeNull();
    state.update=true;rerender(<KanbanBoard premium />);
    expect(screen.getByTitle('Avançar para próxima etapa')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
  });
  it('rollback não renderiza o novo navegador de etapas', () => {
    render(<KanbanBoard />);
    expect(screen.queryByRole('navigation',{name:'Etapas da esteira'})).toBeNull();
    expect(screen.getByText('ADE SAFE-1')).toBeTruthy();
  });
  it('pula etapas automáticas e inativas usando somente transporte mockado', async () => {
    state.update=true;state.blockedStage=true;
    vi.mocked(fetch).mockResolvedValue({ok:true} as Response);
    render(<KanbanBoard premium />);
    expect(screen.queryByText('Etapa inativa')).toBeNull();
    fireEvent.click(screen.getByTitle('Avançar para próxima etapa'));
    await waitFor(()=>expect(state.write).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledOnce();
    const [path,options] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe('/api/proposals/unit-proposal');
    expect(JSON.parse(String(options?.body)).statusId).toBe('s2');
  });
  it('não oferece avanço quando todos os destinos seguintes são automáticos', () => {
    state.update=true;state.blockedStage=true;state.noManualDestination=true;
    render(<KanbanBoard premium />);
    expect(screen.queryByTitle('Avançar para próxima etapa')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();expect(state.write).not.toHaveBeenCalled();
  });
});
