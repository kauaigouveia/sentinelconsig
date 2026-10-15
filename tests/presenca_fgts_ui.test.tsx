// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PresencaFgtsSimulation } from '../src/components/simulation/PresencaFgtsSimulation';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const props = { cpf: '52998224725' };
const offer = { id: 9941, tableId: 1, name: 'Tabela A', amount: 752.83, balance: 1332.71, rate: 1.79, term: 4, payments: [{ date: '2027-01-31', amount: 500 }] };
function respond(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }); }
it('stays hidden when FGTS is disabled and makes no bank calls on opening', async () => {
  const mock = vi.fn(async () => respond({ fgts: false })); vi.stubGlobal('fetch', mock);
  const { container } = render(<PresencaFgtsSimulation {...props} />);
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(1)); expect(container.textContent).toBe('');
});
it('queries every table, shows BRL and annual payments and retries only failed tables', async () => {
  let attempts = 0;
  const mock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/availability')) return respond({ fgts: true });
    if (url.endsWith('/tables')) return respond({ tables: [{ id: 1, name: 'Tabela A', rate: 1.79, receipt: 'table-a' }, { id: 2, name: 'Tabela B', rate: 1.8, receipt: 'table-b' }], messages: [] });
    if (JSON.parse(options!.body as string).receipt === 'table-b' && attempts++ === 0) return respond({ error: 'Falha ficticia na tabela B' }, 400);
    return respond({ offers: [offer], message: 'Simulação retornada' });
  });
  vi.stubGlobal('fetch', mock); render(<PresencaFgtsSimulation {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar ofertas FGTS · Presença' }));
  await screen.findByText(/2\/2 tabelas processadas · 1 ofertas · 1 falhas/);
  expect(screen.getByText('R$ 752,83')).toBeTruthy(); expect(screen.getByText('31/01/2027 · R$ 500,00')).toBeTruthy(); expect(screen.queryByText(/meses/)).toBeNull();
  expect(mock.mock.calls.filter(call => call[0].endsWith('/simulate'))).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Retomar tabelas pendentes ou com falha' }));
  await screen.findByText(/2\/2 tabelas processadas · 2 ofertas · 0 falhas/);
  expect(mock.mock.calls.filter(call => call[0].endsWith('/simulate'))).toHaveLength(3);
  expect(JSON.parse(mock.mock.calls.at(-1)![1]!.body as string)).toEqual({ receipt: 'table-b' });
});
it('can interrupt a running comparison without losing completed results', async () => {
  const mock = vi.fn(async (url: string, options?: RequestInit): Promise<Response> => {
    if (url.endsWith('/availability')) return respond({ fgts: true });
    if (url.endsWith('/tables')) return respond({ tables: [{ id: 1, name: 'Tabela A', rate: 1.79, receipt: 'table-a' }, { id: 2, name: 'Tabela B', rate: 1.8, receipt: 'table-b' }], messages: [] });
    if (JSON.parse(options!.body as string).receipt === 'table-a') return respond({ offers: [offer] });
    return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  });
  vi.stubGlobal('fetch', mock); render(<PresencaFgtsSimulation {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar ofertas FGTS · Presença' }));
  await screen.findByText(/1\/2 tabelas processadas/);
  fireEvent.click(screen.getByRole('button', { name: 'Interromper consulta FGTS' }));
  await screen.findByRole('button', { name: 'Retomar tabelas pendentes ou com falha' });
  expect(screen.getByText('R$ 752,83')).toBeTruthy(); expect(screen.getByText(/Consulta interrompida/)).toBeTruthy();
});
it('respects Retry-After on 429 and resumes the same table', async () => {
  let attempts = 0;
  const mock = vi.fn(async (url: string) => {
    if (url.endsWith('/availability')) return respond({ fgts: true });
    if (url.endsWith('/tables')) return respond({ tables: [{ id: 1, name: 'Tabela A', rate: 1.79, receipt: 'table-a' }], messages: [] });
    return attempts++ === 0 ? new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }) : respond({ offers: [offer] });
  });
  vi.stubGlobal('fetch', mock); render(<PresencaFgtsSimulation {...props} />);
  const button = await screen.findByRole('button', { name: 'Consultar ofertas FGTS · Presença' });
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(button); });
  expect(screen.getByText(/Aguardando a janela do banco/)).toBeTruthy();
  expect(attempts).toBe(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(attempts).toBe(2); expect(screen.getByText('R$ 752,83')).toBeTruthy();
});
