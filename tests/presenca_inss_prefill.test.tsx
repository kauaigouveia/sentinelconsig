// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinantoInssSimulationModal } from '../src/components/simulation/FinantoInssSimulationModal';
vi.mock('../src/components/simulation/ParanaNovoOpportunities', () => ({ ParanaNovoOpportunities: ({ name }: any) => <output data-testid="borrower-name">{name}</output> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('fills real INSS form states and keeps imported values manually editable', async () => {
  const detail = { cpf: '52998224725', name: 'Cliente Ficticio', birthDate: '1960-01-01', benefit: '1234567890', species: '41', income: 1500, benefitStartDate: '2021-01-06', benefitState: 'AL', margin: 500.5, cardMargin: 75, benefitCardMargin: 75, sex: 'Feminino' };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/presenca/availability') ? { inssLookup: true } : url.endsWith('/inss/benefits') ? { benefits: [{ benefit: detail.benefit, species: '41', income: 1500, receipt: 'sealed-demo' }], messages: [] } : url.endsWith('/inss/benefit-detail') ? { detail } : { items: [], banks: [] }))));
  render(<FinantoInssSimulationModal isOpen operationCode="1" partners={[]} onClose={vi.fn()} onSuccess={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } });
  await waitFor(() => expect((screen.getByLabelText('Número do benefício') as HTMLInputElement).value).toBe('1234567890'));
  expect((screen.getByLabelText('Data de nascimento') as HTMLInputElement).value).toBe('1960-01-01');
  await waitFor(() => expect((screen.getByRole('combobox', { name: 'Espécie do benefício (pesquise por código ou nome)' }) as HTMLInputElement).value).toMatch(/^41/));
  expect(screen.getByTestId('borrower-name').textContent).toBe('Cliente Ficticio');
  expect((screen.getByLabelText('Valor da parcela desejado (R$)') as HTMLInputElement).value).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Usar margem residual como parcela' }));
  expect((screen.getByLabelText('Valor da parcela desejado (R$)') as HTMLInputElement).value).toBe('500,50');
  fireEvent.change(screen.getByLabelText('Número do benefício'), { target: { value: '9999999999' } });
  expect((screen.getByLabelText('Número do benefício') as HTMLInputElement).value).toBe('9999999999');
});
