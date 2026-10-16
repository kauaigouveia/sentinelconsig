// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresencaInssBenefits } from '../src/components/simulation/PresencaInssBenefits';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const detail = { cpf: '52998224725', name: 'Cliente Ficticio', benefit: '1234567890', species: '41', birthDate: '1960-01-01', income: 1500, margin: 500.5, cardMargin: 75, benefitCardMargin: 75, benefitState: 'AL', benefitStartDate: '2021-01-06', sex: 'Feminino' };
const benefit = { benefit: detail.benefit, species: '41', income: 1500, receipt: 'sealed-demo' };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
it('automatically queries a valid CPF and applies its only benefit; margin still needs explicit action', async () => {
  const apply = vi.fn(), margin = vi.fn();
  const mock = vi.fn(async (url: string) => response(url.endsWith('availability') ? { inssLookup: true } : url.endsWith('benefits') ? { benefits: [benefit], messages: [] } : { detail }));
  vi.stubGlobal('fetch', mock); render(<PresencaInssBenefits cpf={detail.cpf} onApply={apply} onUseMargin={margin} />);
  await screen.findByText('Cliente Ficticio'); expect(apply).toHaveBeenCalledExactlyOnceWith(detail); expect(margin).not.toHaveBeenCalled();
  expect(mock).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole('button', { name: 'Usar margem residual como parcela' })); expect(margin).toHaveBeenCalledWith(detail);
  expect(JSON.parse((mock.mock.calls.at(-1) as any)[1].body)).toEqual({ receipt: 'sealed-demo' }); expect(screen.queryByText(/promotora/i)).toBeNull();
});
it('requires selection when more than one benefit is returned', async () => {
  const apply = vi.fn();
  const mock = vi.fn(async (url: string) => response(url.endsWith('availability') ? { inssLookup: true } : url.endsWith('benefits') ? { benefits: [benefit, { ...benefit, benefit: '1234567891', receipt: 'sealed-other' }], messages: [] } : { detail }));
  vi.stubGlobal('fetch', mock); render(<PresencaInssBenefits cpf={detail.cpf} onApply={apply} />);
  await screen.findByText(/Mais de um benefício encontrado/); expect(mock).toHaveBeenCalledTimes(2); expect(apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Benefício retornado' }), { target: { value: 'sealed-demo' } });
  await waitFor(() => expect(apply).toHaveBeenCalledWith(detail));
});
it('does not offer unavailable margin as an installment', async () => {
  const mock = vi.fn(async (url: string) => response(url.endsWith('availability') ? { inssLookup: true } : url.endsWith('benefits') ? { benefits: [benefit] } : { detail: { ...detail, margin: null } }));
  vi.stubGlobal('fetch', mock); render(<PresencaInssBenefits cpf={detail.cpf} onApply={vi.fn()} onUseMargin={vi.fn()} />);
  await screen.findByText('Cliente Ficticio'); expect(screen.queryByRole('button', { name: 'Usar margem residual como parcela' })).toBeNull();
});
it('explains disabled connections instead of silently hiding lookup', async () => {
  const mock = vi.fn(async () => response({ inssLookup: false })); vi.stubGlobal('fetch', mock);
  render(<PresencaInssBenefits cpf={detail.cpf} onApply={vi.fn()} />);
  await screen.findByText(/habilite “Consulta de benefícios INSS”/); expect(mock).toHaveBeenCalledTimes(1);
});
it('does not query invalid CPF and discards a late response after CPF change', async () => {
  const apply = vi.fn(); let finish!: (value: Response) => void;
  const mock = vi.fn(async (url: string): Promise<Response> => url.endsWith('availability') ? response({ inssLookup: true }) : url.endsWith('benefits') ? response({ benefits: [benefit] }) : new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', mock);
  const { rerender } = render(<PresencaInssBenefits key="a" cpf="00000000000" onApply={apply} />);
  expect(mock).not.toHaveBeenCalled();
  rerender(<PresencaInssBenefits key="b" cpf={detail.cpf} onApply={apply} />);
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  rerender(<PresencaInssBenefits key="c" cpf="" onApply={apply} />);
  await act(async () => finish(response({ detail })));
  expect(apply).not.toHaveBeenCalled();
});
it('shows upstream failure without claiming data were filled', async () => {
  const apply = vi.fn(); vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('availability') ? response({ inssLookup: true }) : response({ error: 'Falha ficticia na consulta' }, 400)));
  render(<PresencaInssBenefits cpf={detail.cpf} onApply={apply} />);
  await screen.findByText('Falha ficticia na consulta'); expect(apply).not.toHaveBeenCalled();
});
