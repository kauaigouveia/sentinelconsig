// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../src/components/simulation/BmgCustomerAuthorization', () => ({ BmgCustomerAuthorization: () => null }));
vi.mock('../src/components/simulation/BankPlaybooksPanel', () => ({ BankPlaybooksPanel: () => null }));
vi.mock('../src/components/simulation/SpreadsheetPortRefinWorkspace', () => ({ SpreadsheetPortRefinWorkspace: () => null }));
vi.mock('../src/components/simulation/OrderedSimulationBanks', () => ({ OrderedSimulationBanks: ({ groups }: any) => <>{groups.map((group: any) => <React.Fragment key={group.bank}>{group.content}</React.Fragment>)}</> }));
import { PartnerSimulationsView } from '../src/components/partner-portal/PartnerSimulationsView';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Partner CLT form, mocked APIs and real BRL input', () => {
  it.each(['1423,98', '1.423,98'])('keeps %s and bank-specific selectors when navigating back and forth', async value => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: any, options: any) => {
      if (!options?.method) return { ok: true, json: async () => ({ rows: [] }) };
      const body = JSON.parse(options.body); calls.push({ url: String(url), body });
      if (String(url).endsWith('/refresh')) return { ok: true, json: async () => ({ rows: [
        { provider: 'FACTA', institution: 'FACTA', state: 'DATA', data: { employment: { employer_cnpj: '12345678000100', work_registration: '00017000310042' }, margin: { employer: { name: 'Empresa sintética' }, name: 'Pessoa sintética', available_balance: 1900 } } },
        { provider: 'V8 DIGITAL', institution: 'V8 · QI', state: 'DATA', data: { v8: { consultId: 'consult-synthetic', promoterId: 'promoter-synthetic' }, margin: { name: 'Pessoa sintética', available_balance: 1900 } } },
      ] }) };
      return { ok: true, json: async () => ({ rows: [{ provider: 'V8 DIGITAL', institution: 'V8 · QI', state: 'OFFER', amount: 12000, installment: 1423.98, term: 24 }] }) };
    }));
    render(<PartnerSimulationsView />);
    fireEvent.change(screen.getByLabelText('Produto'), { target: { value: 'CLT' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } });
    fireEvent.change(screen.getByLabelText('Nome do cliente'), { target: { value: 'Pessoa sintética' } });
    fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11999999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar vínculos e margem' }));
    await screen.findByText('Empresa sintética');
    fireEvent.click(screen.getByRole('button', { name: 'Usar este vínculo na simulação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta consulta V8' }));
    fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'), { target: { value } });
    fireEvent.blur(screen.getByLabelText('Parcela desejada (R$)'));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect((screen.getByLabelText('Parcela desejada (R$)') as HTMLInputElement).value).toBe('1.423,98');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar ofertas' }));
    await screen.findByText('Oferta disponível');
    expect(calls.at(-1).body).toMatchObject({ factaRegistration: '00017000310042', v8ConsultId: 'consult-synthetic', v8PromoterId: 'promoter-synthetic' });
    expect(Number(calls.at(-1).body.value)).toBe(1423.98);
  });
});
