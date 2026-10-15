// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ParanaCltSimulation } from '../src/components/simulation/ParanaCltSimulation';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps CLT in the common workspace and requires bank eligibility before showing simulation controls', async () => {
  const limits = { tipoCondicao: 'SemSeguro', taxaMinima: 5, taxaMaxima: 5.01, valorMinimoDaParcela: 100, valorMaximoDaParcela: 1000, quantidadeMinimaDeParcelas: 6, quantidadeMaximaDeParcelas: 24, valorMinimoLiberado: 1000, valorMaximoLiberado: 20000 };
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/consent') ? { results: [{ link: 'https://example.test/consent', status: 'Solicitado' }] } : url.endsWith('/eligibility') ? { results: [{ receipt: 'pending-demo' }] } : url.endsWith('/assessment') ? { choices: [{ receipt: 'eligible-demo', employerName: 'Empresa fictícia', employer: '12345678', registration: '1234', limits }] } : { offers: [{ id: 'demo-simulation', amount: 5000, installment: 1000, term: 24, rate: 5 }] })));
  vi.stubGlobal('fetch', fetchMock);
  render(<ParanaCltSimulation cpf="52998224725" name="Cliente Ficticio" phone="11999999999" />);
  expect(fetchMock).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Simular Paraná CLT' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Gerar consentimento CLT' })); await screen.findByRole('link', { name: 'Abrir consentimento CLT' });
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar elegibilidade CLT' }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Atualizar elegibilidade CLT' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar elegibilidade CLT' }));
  await screen.findByRole('combobox', { name: 'Vínculo e condição elegíveis' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Vínculo e condição elegíveis' }), { target: { value: 'eligible-demo' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Prazo' }), { target: { value: '24' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Taxa mensal' }), { target: { value: '5' } });
  fireEvent.paste(screen.getByLabelText('Parcela desejada (R$)'), { clipboardData: { getData: () => '1.000,00' } });
  fireEvent.change(screen.getByLabelText(/Código da regra Paraná/), { target: { value: 'DEMO-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simular Paraná CLT' }));
  await screen.findByText('Paraná · Novo CLT');
  expect(JSON.parse((fetchMock.mock.calls.at(-1) as any)[1].body)).toMatchObject({ receipt: 'eligible-demo', value: 1000, term: 24, rate: 5, rule: 'DEMO-1' });
});
