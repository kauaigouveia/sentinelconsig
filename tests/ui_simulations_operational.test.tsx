// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const context = vi.hoisted(() => ({ role: 'MASTER' }));
vi.mock('../src/services/storageService', () => ({ StorageService: {
  getActiveUser: () => ({ id: 'local-user', role: context.role, customPermissions: [] }),
  getCurrentTenant: () => null,
  getPartners: () => [], getUsers: () => [], getConvenios: () => [], getProducts: () => [],
} }));
vi.mock('../src/components/simulation/DaycovalSimulationModal', () => ({ DaycovalSimulationModal: ({bank, portal}: any) => <div data-testid="sheet-form">{bank} · {portal ? 'portal' : 'interno'}</div> }));
vi.mock('../src/components/simulation/SimulationImportModal', () => ({ SimulationImportModal: ({isOpen}: any) => isOpen ? <div data-testid="import-form" /> : null }));
vi.mock('../src/components/simulation/SimulationFlowSelectorModal', () => ({ SimulationFlowSelectorModal: ({isOpen}: any) => isOpen ? <div data-testid="flow-selector" /> : null }));
vi.mock('../src/components/simulation/ProductSimulationModal', () => ({ ProductSimulationModal: () => null }));
vi.mock('../src/components/simulation/HappyInssSimulationModal', () => ({ HappyInssSimulationModal: () => null }));
vi.mock('../src/components/simulation/HappyCltSimulationModal', () => ({ HappyCltSimulationModal: () => null }));
vi.mock('../src/components/simulation/FinantoInssSimulationModal', () => ({ FinantoInssSimulationModal: () => null }));
vi.mock('../src/components/simulation/NossaFintechPortRefinSimulationModal', () => ({ NossaFintechPortRefinSimulationModal: () => null }));
vi.mock('../src/components/simulation/PartnerSimulationMonthlyReport', () => ({ PartnerSimulationMonthlyReport: () => <div>Relatório mensal preservado</div> }));

import { SimulationView } from '../src/components/simulation/SimulationView';
import { SpreadsheetPortRefinWorkspace } from '../src/components/simulation/SpreadsheetPortRefinWorkspace';

beforeEach(() => {
  context.role = 'MASTER';
  vi.stubGlobal('fetch', vi.fn(async (url, options: any) => {
    if (options?.method && options.method !== 'GET') throw new Error('Writes forbidden in local UI test');
    const path = String(url);
    if (path === '/api/simulations') return { ok: true, json: async () => [{ id: 'local-sim', cpf: '00000000000', partnerId: 'local-partner', createdById: 'local-user', status: 'SIMULAÇÃO ENVIADA', simulationType: 'INSS', createdAt: '2099-01-01T12:00:00Z' }] };
    if (path === '/api/partners') return { ok: true, json: async () => [{ id: 'local-partner', login: 'LOCAL', fullName: 'Parceiro fictício', active: true }] };
    if (path === '/api/users') return { ok: true, json: async () => [{ id: 'local-user', name: 'Usuário fictício', role: 'MASTER' }] };
    if (['/api/products', '/api/convenios'].includes(path)) return { ok: true, json: async () => [] };
    if (['/api/settings/simulation-access', '/api/integrations/finanto/config', '/api/integrations/nossa-fintech/config'].includes(path)) return { ok: true, json: async () => ({ enabled: false, isConfigured: false }) };
    throw new Error(`Unknown request blocked: ${path}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Simulações reais com transporte local isolado', () => {
  it('navega nas quatro áreas, preserva a fila, análises e os três bancos de planilha', async () => {
    const {container} = render(<SimulationView premium />);
    await screen.findByText(/LOCAL.*Parceiro fictício/);
    const navigation = within(screen.getByRole('navigation', {name: 'Áreas de simulação'}));
    expect(navigation.getAllByRole('button')).toHaveLength(4);
    fireEvent.click(navigation.getByRole('button', {name: /Fila de digitação/}));
    expect(container.querySelector('.p2-simulation-queue')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Lista'}));
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(screen.getByText('Usuário fictício')).toBeTruthy();
    fireEvent.click(navigation.getByRole('button', {name: /Resultados e parceiros/}));
    expect(screen.getByText('Relatório mensal preservado')).toBeTruthy();
    expect(container.querySelector('.p2-simulation-analytics')).toBeTruthy();
    fireEvent.click(navigation.getByRole('button', {name: /Planilhas/}));
    expect(screen.getByTestId('sheet-form').textContent).toContain('DAYCOVAL');
    fireEvent.click(screen.getByRole('tab', {name: 'C6'}));
    expect(screen.getByTestId('sheet-form').textContent).toContain('C6');
    fireEvent.click(screen.getByRole('tab', {name: 'Paraná'}));
    expect(screen.getByTestId('sheet-form').textContent).toContain('PARANA');
    expect(vi.mocked(fetch).mock.calls.every(([,options]) => !options?.method || options.method === 'GET')).toBe(true);
  });
  it('abre os destinos existentes de importação e seleção sem executar simulações', async () => {
    render(<SimulationView premium />);
    await screen.findByText(/LOCAL.*Parceiro fictício/);
    fireEvent.click(screen.getByRole('button', {name: 'Importar em Lote'}));
    expect(screen.getByTestId('import-form')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Nova simulação'}));
    expect(screen.getByTestId('flow-selector')).toBeTruthy();
  });
  it('mantém a restrição de DIGITADOR sem buscar dados', () => {
    context.role = 'DIGITADOR';
    render(<SimulationView premium />);
    expect(screen.getByText('Acesso Restrito')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('o portal não recebe o layout administrativo mesmo com premium explícito', () => {
    const {container} = render(<SpreadsheetPortRefinWorkspace premium portal onSuccess={() => {}} />);
    expect(container.querySelector('.p2-spreadsheet-workspace')).toBeNull();
    expect(screen.getByTestId('sheet-form').textContent).toContain('portal');
  });
});
