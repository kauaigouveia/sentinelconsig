// @vitest-environment jsdom
import { ParanaNovoOpportunities } from '../src/components/simulation/ParanaNovoOpportunities';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ sync: vi.fn(async () => undefined) }));
vi.mock('../src/services/storageService', () => ({ StorageService: { getActiveUser: () => ({ role: 'MASTER', customPermissions: [] }), getBanks: () => [{ id: 'bank-demo', name: 'Paraná Banco', code: '254' }], syncSpecificEntity: state.sync } }));
import { ParanaIntegrationTab } from '../src/components/integrations/ParanaIntegrationTab';
import { ParanaProposalSyncCard } from '../src/components/production/ParanaProposalSyncCard';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.sync.mockClear(); });
it('only loads masked connection metadata on mount and never queries the bank automatically', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ environment: 'homologation', enabled: false, clientId: 'fictional', hasClientSecret: true, bankId: 'bank-demo', promoterCode: 'DEMO' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ParanaIntegrationTab promoterId="promoter-demo" />);
  await waitFor(() => expect((screen.getByLabelText('client_id') as HTMLInputElement).value).toBe('fictional'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((fetchMock.mock.calls[0] as any)[0]).toBe('/api/integrations/parana/config?promoterId=promoter-demo');
  expect(screen.getByLabelText('client_secret').getAttribute('type')).toBe('password');
  expect((screen.getByLabelText('client_secret') as HTMLInputElement).value).toBe('');
});
it('syncs only the selected local proposal on explicit click and refreshes the real cache', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, bankStatus: 'Analise', statusMapped: false }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock); const updated = vi.fn();
  render(<ParanaProposalSyncCard proposalId="proposal-demo" onUpdated={updated} />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar proposta no Paraná' }));
  await waitFor(() => expect(updated).toHaveBeenCalledTimes(1));
  expect((fetchMock.mock.calls[0] as any)[0]).toBe('/api/proposals/proposal-demo/parana-sync');
  expect(state.sync).toHaveBeenCalledWith('Proposal');
  expect(screen.getByRole('status').textContent).toContain('Configure o mapeamento');
});

it('loads separate credentials on environment switch and clears the unsaved secret without saving', async () => {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ environment: url.includes('environment=production') ? 'production' : 'homologation', activeEnvironment: 'homologation', enabled: false, clientId: url.includes('environment=production') ? 'prod-client' : 'hom-client', hasClientSecret: false, bankId: '', promoterCode: '' })));
  vi.stubGlobal('fetch', fetchMock);
  render(<ParanaIntegrationTab promoterId="promoter-demo" />);
  await waitFor(() => expect((screen.getByLabelText('client_id') as HTMLInputElement).value).toBe('hom-client'));
  fireEvent.change(screen.getByLabelText('client_secret'), { target: { value: 'unsaved-secret' } });
  fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: 'production' } });
  await waitFor(() => expect((screen.getByLabelText('client_id') as HTMLInputElement).value).toBe('prod-client'));
  expect((screen.getByLabelText('client_secret') as HTMLInputElement).value).toBe('');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect((fetchMock.mock.calls[1] as any)[0]).toContain('environment=production');
});

it('queries Paraná only on explicit click and selects an actual Novo offer with source metadata', async () => {
  const offer = { id: '11111111-2222-4333-8444-555555555555', benefit: '0000000001', species: 41, amount: 2000, installment: 60, term: 108, rate: 1.85, insurance: false, expiresAt: '2099-01-01T00:00:00Z' };
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/connections') ? [{ id: 'demo', name: 'DG' }] : { offers: [offer, { ...offer, benefit: 'other' }], environment: 'homologation' })));
  vi.stubGlobal('fetch', fetchMock); const onSelect = vi.fn();
  render(<ParanaNovoOpportunities cpf="52998224725" benefit="0000000001" species="41" onSelect={onSelect} onClear={() => {}} />);
  await screen.findByRole('button', { name: 'Consultar ofertas Novo · Paraná' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar ofertas Novo · Paraná' }));
  await screen.findByRole('button', { name: 'Selecionar oferta' });
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar oferta' }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ provider: 'Paraná Banco', promoterId: 'demo', environment: 'homologation', tableId: offer.id, amount: 2000 }));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
