// @vitest-environment jsdom
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
