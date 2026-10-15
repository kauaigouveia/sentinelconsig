// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PresencaInssBenefits } from '../src/components/simulation/PresencaInssBenefits';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const detail = { cpf: '52998224725', name: 'Cliente Ficticio', benefit: '1234567890', species: '41', birthDate: '1960-01-01', income: 1500, margin: 500.5, cardMargin: 75, benefitCardMargin: 75, benefitState: 'AL', benefitStartDate: '2021-01-06', sex: 'Feminino' };
it('selects a benefit and fills only after confirmation; residual margin needs its own explicit action', async () => {
  const apply = vi.fn(), margin = vi.fn();
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('availability') ? { inssLookup: true } : url.endsWith('benefits') ? { benefits: [{ benefit: '1234567890', species: '41', income: 1500, receipt: 'sealed-demo' }], messages: [] } : { detail })));
  vi.stubGlobal('fetch', mock); render(<PresencaInssBenefits cpf={detail.cpf} onApply={apply} onUseMargin={margin} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Buscar benefícios pelo CPF' }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Benefício retornado' }), { target: { value: 'sealed-demo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar detalhes do benefício' }));
  await screen.findByText('Cliente Ficticio'); expect(apply).not.toHaveBeenCalled(); expect(margin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Preencher dados do cliente e benefício' })); expect(apply).toHaveBeenCalledWith(detail); expect(margin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Usar margem residual como parcela' })); expect(margin).toHaveBeenCalledWith(detail);
  expect(JSON.parse((mock.mock.calls.at(-1) as any)[1].body)).toEqual({ receipt: 'sealed-demo' }); expect(screen.queryByText(/promotora/i)).toBeNull();
});
it('does not offer negative margin or apply data returned after unmount/CPF change', async () => {
  const apply = vi.fn();
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('availability') ? { inssLookup: true } : url.endsWith('benefits') ? { benefits: [{ benefit: '1234567890', species: '41', income: 1500, receipt: 'sealed-demo' }] } : { detail: { ...detail, margin: null } })));
  vi.stubGlobal('fetch', mock); const { unmount } = render(<PresencaInssBenefits cpf={detail.cpf} onApply={apply} onUseMargin={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Buscar benefícios pelo CPF' })); fireEvent.change(await screen.findByRole('combobox', { name: 'Benefício retornado' }), { target: { value: 'sealed-demo' } }); fireEvent.click(screen.getByRole('button', { name: 'Consultar detalhes do benefício' }));
  await screen.findByText('Cliente Ficticio'); expect(screen.queryByRole('button', { name: 'Usar margem residual como parcela' })).toBeNull(); unmount(); expect(apply).not.toHaveBeenCalled();
});
