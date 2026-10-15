// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
vi.mock('../src/services/storageService', () => ({ StorageService: { getActiveUser: () => ({ role: 'MASTER', customPermissions: [] }), syncSpecificEntity: vi.fn() } }));
import { WorkbankIntegrationTab } from '../src/components/integrations/WorkbankIntegrationTab';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('loads only saved metadata and the private queue; does not authenticate, extract or publish on mount', async () => {
  const request = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('/config?') ? { enabled: true, username: 'EXAMPLE', authOrigin: 'https://go-api.workbankvirtual.com.br', extractOrigin: 'https://goapi.workbankvirtual.com.br', hasClientKey: true, hasPublicKey: true } : url.includes('/options?') ? { partners: [], banks: [], products: [], convenios: [] } : { items: [{ id: 'record-demo', state: 'WAITING_AGENT', partnerId: null, row: { proposalNumber: 'DEMO', clientName: 'CLIENTE FICTICIO', agent: 'AGENTE FICTICIO', bank: 'BANCO FICTICIO', product: 'TESTE', agreement: 'INSS', operation: 'NOVO', status: 'ANALISE', releasedValue: 4500, installmentValue: 100, installmentsCount: 84 } }], nextCursor: null }), { status: 200 }));
  vi.stubGlobal('fetch', request);
  render(<WorkbankIntegrationTab promoterId="promoter-demo" />);
  await waitFor(() => expect(screen.getByText('Aguardando vínculo do agente')).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Confirmar revisão e enviar à Produção' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Vincular este nome ao parceiro' }) as HTMLButtonElement).disabled).toBe(true);
  expect(request).toHaveBeenCalledTimes(3);
  for (const call of request.mock.calls as any[]) { expect(call[0]).toContain('promoterId=promoter-demo'); expect(call[1].method).toBe('GET'); }
  expect(screen.getByLabelText('clientKey').getAttribute('type')).toBe('password');
  expect((screen.getByLabelText('clientKey') as HTMLInputElement).value).toBe('');
});
