// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../src/components/simulation/ParanaCltSimulation', () => ({ ParanaCltSimulation: () => null }));
vi.mock('../src/components/simulation/PresencaCltSimulation', () => ({ PresencaCltSimulation: () => null }));
vi.mock('../src/components/simulation/PresencaFgtsSimulation', () => ({ PresencaFgtsSimulation: () => null }));
vi.mock('../src/components/simulation/HappyCltSimulationModal', () => ({ HappyCltSimulationModal: () => null }));
vi.mock('../src/components/simulation/BmgCustomerAuthorization', () => ({ BmgCustomerAuthorization: () => null }));
import { ProductSimulationModal } from '../src/components/simulation/ProductSimulationModal';

const document = '12345678000100';
const employment = (registration: string, name: string) => ({ provider: 'FACTA', institution: 'FACTA', state: 'DATA', data: { employment: { employer_cnpj: document, work_registration: registration }, margin: { name: 'Pessoa sintética', employer: { name, document }, available_balance: 1900 } } });
const employments = [employment('1', 'Empresa A'), employment('00017000310042', 'Empresa B')];
let refreshRows: any[], requests: any[];
beforeEach(() => {
  refreshRows = employments; requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: any) => {
    const body = JSON.parse(options.body); requests.push({ url, body });
    if (url.endsWith('/refresh')) return { ok: true, json: async () => ({ rows: refreshRows }) };
    if (url.endsWith('/simulate')) return { ok: true, json: async () => ({ rows: [
      { provider: 'FACTA', institution: 'FACTA', state: 'ERROR', message: 'Matrícula recusada pelo banco' },
      { provider: 'FINANTO', institution: 'QI sintética', state: 'OFFER', amount: 5000, installment: body.value },
    ] }) };
    throw Error('Unexpected network request');
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function prepare() {
  render(<ProductSimulationModal isOpen product="CLT" onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } });
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Pessoa sintética' } });
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar dados do cliente' }));
  await screen.findByText('Empresa A');
}

describe('FACTA CLT client → conditions → results', () => {
  it('queries from the legacy client form without native financial requirements, but validates financial calculation later', async () => {
    render(<ProductSimulationModal isOpen product="CLT" onClose={() => {}} />);
    for(const [label,value] of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999']]) fireEvent.change(screen.getByLabelText(label),{target:{value}});
    const payment=screen.getByLabelText('Parcela desejada (R$)') as HTMLInputElement;
    expect(payment.required).toBe(false);expect(payment.value).toBe('');
    expect(payment.closest('form')!.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES'}));
    await screen.findByText('Empresa A');
    expect(requests).toHaveLength(1);expect(requests[0].url).toBe('/api/simulations/products/clt/refresh');
    expect(requests[0].body.value).toBeUndefined();expect(requests[0].body.term).toBeUndefined();
    fireEvent.click(screen.getByRole('button',{name:'Consultar ofertas'}));
    await screen.findByText(/Informe uma parcela ou valor liberado positivo/);
    expect(requests).toHaveLength(1);
  });
  it.each(['1423,98', '1.423,98', '1423.98', 'R$ 1.423,98'])('preserves manually entered %s and the selected opaque registration across steps', async raw => {
    await prepare();
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar este vínculo na simulação' })[1]);
    expect(screen.getAllByRole('button', { name: 'Vínculo selecionado' })).toHaveLength(1);
    const payment = screen.getByLabelText('Parcela desejada (R$)') as HTMLInputElement;
    fireEvent.change(payment, { target: { value: raw } }); fireEvent.blur(payment);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect((screen.getByLabelText('Parcela desejada (R$)') as HTMLInputElement).value).toBe('1.423,98');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar ofertas' }));
    await screen.findByText('Matrícula recusada pelo banco');
    expect(screen.getByText('QI sintética')).toBeTruthy();
    expect(requests.find(request => request.url.endsWith('/simulate')).body).toMatchObject({ employerDocument: document, factaRegistration: '00017000310042', mode: 'Payment', value: 1423.98 });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às condições' }));
    expect(screen.getByRole('button', { name: 'Vínculo selecionado' })).toBeTruthy();
  });
  it('switches registration independently for two employments of the same employer', async () => {
    await prepare();
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar este vínculo na simulação' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Usar este vínculo na simulação' }));
    fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'), { target: { value: '100,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar ofertas' }));
    await waitFor(() => expect(requests.some(request => request.url.endsWith('/simulate'))).toBe(true));
    expect(requests.at(-1).body).toMatchObject({ factaRegistration: '1', value: 100.5 });
  });
  it('clears stale registration when customer identity or refreshed data changes', async () => {
    await prepare();
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar este vínculo na simulação' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar dados do cliente' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Vínculo selecionado' })).toBeNull());
    expect(requests.at(-1).body.factaRegistration).toBe('');
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar este vínculo na simulação' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao cliente' }));
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '11144477735' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByRole('button', { name: 'Vínculo selecionado' })).toBeNull();
  });
  it('keeps V8 consent selection separate from FACTA registration across steps', async () => {
    refreshRows = [...employments, ...['consult-a', 'consult-b'].map(consultId => ({ provider: 'V8 DIGITAL', institution: 'V8 · QI', state: 'DATA', data: { v8: { consultId, promoterId: 'promoter-v8' }, margin: { name: 'Pessoa sintética', available_balance: 1900 } } }))];
    await prepare();
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar este vínculo na simulação' })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Usar esta consulta V8' })[1]);
    fireEvent.change(screen.getByLabelText('Parcela desejada (R$)'), { target: { value: '1.423,98' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('button', { name: 'Consulta V8 selecionada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vínculo selecionado' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar ofertas' }));
    await screen.findByText('Matrícula recusada pelo banco');
    expect(requests.at(-1).body).toMatchObject({ v8ConsultId: 'consult-b', v8PromoterId: 'promoter-v8', factaRegistration: '00017000310042', value: 1423.98 });
    expect(screen.getByText('Oferta disponível')).toBeTruthy();
  });
});
