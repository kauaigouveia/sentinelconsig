// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../src/components/simulation/BmgCustomerAuthorization', () => ({ BmgCustomerAuthorization: () => null }));
import { CltJourneyWorkspace } from '../src/components/simulation/CltJourneyWorkspace';
import { readJourneyStream } from '../src/lib/cltJourney';
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
const snapshot = { executionId: 'synthetic-execution', running: false, banks: [{ id: 'facta', name: 'FACTA' }, { id: 'nossa', name: 'Nossa Fintech' }], results: { facta: { status: 'RETURNED', rows: [{ provider: 'FACTA', institution: 'FACTA', table: 'A', state: 'OFFER', amount: 12000, installment: 1423.98, term: 24 }, { provider: 'FACTA', institution: 'FACTA', table: 'B', state: 'OFFER', amount: 13000, installment: 1423.98, term: 36 }] }, nossa: { status: 'RETURNED', rows: [{ provider: 'Nossa Fintech', institution: 'QI', state: 'PENDING', outcome: 'AUTHORIZATION_REQUIRED' }] } } };
it.each([390,1440])('submits the actual CLT form at width %s with only identity, no hidden financial constraint or financial payload', async width => {
  vi.stubGlobal('innerWidth',width);
  const fetcher=vi.fn(async(_url:string,_options:any)=>new Response(JSON.stringify(snapshot)+'\n',{headers:{'content-type':'application/x-ndjson'}}));vi.stubGlobal('fetch',fetcher);
  render(<CltJourneyWorkspace isOpen scope="tenant-synthetic:user-synthetic" onClose={()=>{}}/>);
  for(const [label,value] of [['CPF','52998224725'],['Nome completo','Pessoa sintética'],['Telefone com DDD','11999999999']]) fireEvent.change(screen.getByLabelText(label),{target:{value}});
  const button=screen.getByRole('button',{name:'CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES'}),form=button.closest('form')!;
  expect(form.checkValidity()).toBe(true);expect(form.querySelectorAll('[required]')).toHaveLength(3);
  expect(screen.queryByLabelText('Parcela desejada (R$)')).toBeNull();expect(screen.queryByLabelText('Prazo (meses)')).toBeNull();
  fireEvent.click(button);await screen.findByText('Ofertas disponíveis');
  const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.action).toBe('REFRESH');expect(body.value).toBeUndefined();expect(body.term).toBeUndefined();
});
it('uses a single primary action, displays offers independently, compares conditions and reopens without POST', async () => {
  const fetcher = vi.fn(async (_url, options) => options?.method === 'POST' ? new Response(JSON.stringify(snapshot) + '\n', { headers: { 'content-type': 'application/x-ndjson' } }) : new Response(JSON.stringify(snapshot)));
  vi.stubGlobal('fetch', fetcher);
  const props = { isOpen: true, scope: 'tenant-a:user-a', onClose: vi.fn() };
  const rendered = render(<CltJourneyWorkspace {...props} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '52998224725' } });
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Pessoa sintética' } });
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '11999999999' } });
  expect(screen.queryByLabelText('Parcela desejada (R$)')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES' }));
  await screen.findByText('Ofertas disponíveis'); await screen.findByText('Aguardando autorização do cliente');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const sent = JSON.parse(fetcher.mock.calls[0][1].body); expect(sent.value).toBeUndefined(); expect(sent.term).toBeUndefined(); expect(sent.action).toBe('REFRESH'); expect(sent.phone).toBe('11999999999');
  fireEvent.click(screen.getByLabelText('Comparar A')); fireEvent.click(screen.getByLabelText('Comparar B'));
  fireEvent.click(screen.getByRole('button', { name: 'Comparar selecionadas (2)' }));
  expect(screen.getByText('Comparação de condições')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar comparação' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
  expect(screen.getByRole('list', { name: 'Retornos por instituição' }).textContent).toContain('QI');
  expect(screen.getByText('A solicitação abrange as instituições retornadas por esta integração. O aceite cabe ao cliente.')).toBeTruthy();
  rendered.rerender(<CltJourneyWorkspace {...props} isOpen={false} />); rendered.rerender(<CltJourneyWorkspace {...props} />);
  expect(fetcher).toHaveBeenCalledTimes(1);
  rendered.rerender(<CltJourneyWorkspace {...props} scope="tenant-b:user-a" />);
  expect(screen.queryByRole('list', { name: 'Retornos por instituição' })).toBeNull(); expect((screen.getByLabelText('CPF') as HTMLInputElement).value).toBe('');
});
it('reads split progressive frames and reports transport failure without replaying a request', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot) + '\n'), updates = vi.fn();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 30)); controller.enqueue(bytes.slice(30)); controller.close(); } });
  await readJourneyStream(new Response(stream), updates); expect(updates).toHaveBeenCalledTimes(1);
  await expect(readJourneyStream(new Response(null), updates)).rejects.toThrow('Acompanhamento indisponível');
});
it('requires state recovery after an incomplete transport, without issuing another banking POST', async () => {
  const fetcher = vi.fn(async (_url, options) => new Response(options?.method === 'POST' ? JSON.stringify({ ...snapshot, running: true }) + '\n' : JSON.stringify(snapshot)));
  vi.stubGlobal('fetch', fetcher);
  render(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={() => {}} />);
  for (const [label, value] of [['CPF', '52998224725'], ['Nome completo', 'Pessoa sintética'], ['Telefone com DDD', '11999999999']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES' }));
  await screen.findByText(/A conexão de acompanhamento terminou/);
  fireEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
  fireEvent.click(screen.getByRole('button', { name: 'CONSULTAR BANCOS / SOLICITAR AUTORIZAÇÕES' }));
  await screen.findByText('Recupere o acompanhamento e confira o estado antes de iniciar outra operação.');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Recuperar acompanhamento' }));
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('recovers after a full remount using only an opaque tenant/actor-scoped identifier and a read request', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  sessionStorage.setItem('sentinel:clt-execution:tenant-a:user-a', id);
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({ ...snapshot, executionId: id })));
  vi.stubGlobal('fetch', fetcher);
  render(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={() => {}} />);
  await screen.findByText('Ofertas disponíveis');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/simulations/clt/journey/' + id);
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  expect(sessionStorage.getItem('sentinel:clt-execution:tenant-a:user-a')).toBe(id);
});

it('restores the authorized customer from the encrypted server snapshot without financial parameters or another POST', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  sessionStorage.setItem('sentinel:clt-execution:tenant-a:user-a', id);
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...snapshot, executionId: id, customer: { cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', value: 0, term: 0, mode: 'Payment' } })));
  vi.stubGlobal('fetch', fetcher);
  render(<CltJourneyWorkspace isOpen scope="tenant-a:user-a" onClose={() => {}} />);
  await screen.findByText('Ofertas disponíveis'); fireEvent.click(screen.getByRole('button', { name: 'Editar dados' }));
  expect((screen.getByLabelText('CPF') as HTMLInputElement).value.replace(/\D/g, '')).toBe('52998224725');
  expect((screen.getByLabelText('Telefone com DDD') as HTMLInputElement).value).toBe('11999999999');
  expect(screen.queryByLabelText('Parcela desejada (R$)')).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
});

it('uses a bounded modal, internal scroll and restores background scroll on close', () => {
  const close = vi.fn(), props = { isOpen: true, scope: 'tenant-a:user-a', onClose: close };
  const rendered = render(<CltJourneyWorkspace {...props} />), dialog = screen.getByRole('dialog');
  expect(dialog.className).toContain('max-w-6xl'); expect(dialog.className).toContain('max-h-[92dvh]');
  expect(dialog.querySelector('main')?.className).toContain('overflow-y-auto');
  expect(document.body.style.overflow).toBe('hidden'); fireEvent.keyDown(dialog, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  rendered.rerender(<CltJourneyWorkspace {...props} isOpen={false} />); expect(document.body.style.overflow).not.toBe('hidden');
});
