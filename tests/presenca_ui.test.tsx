// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresencaCltSimulation } from '../src/components/simulation/PresencaCltSimulation';
import { PresencaIntegrationTab } from '../src/components/integrations/PresencaIntegrationTab';
vi.mock('../src/services/storageService', () => ({ StorageService: { getActiveUser: () => ({ role: 'MASTER', customPermissions: [] }) } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = { cpf: '52998224725', name: 'Cliente Ficticio', phone: '11999999999' };
it('does not display a disabled product or make bank requests on opening', async () => {
  const mock = vi.fn(async () => new Response(JSON.stringify({ clt: false }))); vi.stubGlobal('fetch', mock);
  const { container } = render(<PresencaCltSimulation {...props} />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(1)); expect(container.textContent).toBe('');
  expect(mock.mock.calls[0]).toEqual(['/api/integrations/presenca/availability', expect.objectContaining({ cache: 'no-store' })]);
});
it('performs consent then employment then margin then offers and sends BRL as numeric value', async () => {
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/availability') ? { clt: true } : url.endsWith('/consent') ? { results: [{ link: 'https://sign.presen.ca/example', receipt: 'consent-demo' }], messages: [] } : url.endsWith('/employments') ? { choices: [{ employer: '12345678', registration: '123', receipt: 'employment-demo' }] } : url.endsWith('/margin') ? { margin: 1200, receipt: 'margin-demo' } : { offers: [{ id: 1, name: 'Oferta ficticia', amount: 5000, installment: 1000, term: 18, rate: 4.52, insuranceAmount: 0 }], message: 'Consulta não representa contratação.' })));
  vi.stubGlobal('fetch', mock); render(<PresencaCltSimulation {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: '1. Gerar consentimento Presença' }));
  await screen.findByRole('link', { name: 'Abrir termo Presença' });
  expect((screen.getByRole('button', { name: '2. Consultar vínculos Presença' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '2. Consultar vínculos Presença' }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Vínculo ativo' }), { target: { value: 'employment-demo' } });
  fireEvent.click(screen.getByRole('button', { name: '3. Consultar margem Presença' }));
  await screen.findByText('Margem disponível:');
  fireEvent.change(screen.getByLabelText('E-mail do cliente'), { target: { value: 'cliente@example.test' } });
  fireEvent.paste(screen.getByLabelText('Parcela desejada (R$)'), { clipboardData: { getData: () => '1.000,00' } });
  fireEvent.click(screen.getByRole('button', { name: '4. Consultar ofertas Presença' }));
  await screen.findByText('Oferta ficticia');
  expect(JSON.parse((mock.mock.calls.at(-1) as any)[1].body)).toEqual({ receipt: 'margin-demo', installment: 1000, email: 'cliente@example.test' });
  expect(screen.queryByRole('button', { name: /contratar|selecionar oferta/i })).toBeNull();
  expect(screen.queryByText(/promotora/i)).toBeNull();
  fireEvent.click(screen.getByRole('checkbox')); expect(screen.queryByText('Oferta ficticia')).toBeNull();
});
it('keeps stored credentials hidden and clears unsaved secrets when switching environment', async () => {
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify({ environment: url.includes('homologation') ? 'homologation' : 'production', enabled: false, cltEnabled: false, hasCredentials: !url.includes('homologation'), activeEnvironment: 'production' })));
  vi.stubGlobal('fetch', mock); render(<PresencaIntegrationTab promoterId="promoter-a" />);
  await waitFor(() => expect((screen.getByLabelText('Login do agente') as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'unsaved-password' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Ambiente' }), { target: { value: 'homologation' } });
  await waitFor(() => expect((screen.getByLabelText('Senha') as HTMLInputElement).value).toBe(''));
  expect(mock.mock.calls.at(-1)?.[0]).toBe('/api/integrations/presenca/config?environment=homologation&promoterId=promoter-a');
  expect((screen.getByLabelText('Habilitar conexão Presença') as HTMLInputElement).disabled).toBe(true);
});
