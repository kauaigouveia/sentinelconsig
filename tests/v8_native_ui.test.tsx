// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { V8CltActions } from '../src/components/simulation/V8CltActions';
import { V8NativeConsent } from '../src/components/simulation/V8NativeConsent';
import { V8CltConsultation } from '../src/components/simulation/V8CltConsultation';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const ref = { consultId: 'synthetic-consult', promoterId: 'synthetic-promoter', consentRecorded: true, status: 'CONSENT_APPROVED' };
it('presents the proven net amount and fractional monthly rate without inventing CET', () => {
  render(<V8CltConsultation selected onSelect={() => {}} row={{ state:'OFFER', amount:2350.44, installment:300, term:12, data:{v8:{...ref,monthlyInterestRate:0.0498,iofAmount:64.94,isInsured:false,insuranceAmount:0,requestedProvider:'QI',returnedProvider:'CELCOIN',firstInstallmentDate:'2027-01-28'}} }} />);
  expect(screen.getByText(/Valor liberado:/).textContent).toContain('2.350,44');
  expect(screen.getByText(/Taxa mensal:/).textContent).toContain('4,98%');
  expect(screen.getByText('CET: Não informado')).toBeTruthy();
  expect(screen.getByText('Seguro: Sem seguro')).toBeTruthy();
  expect(screen.getByText(/Provider solicitado:/).textContent).toContain('QI · retornado: CELCOIN');
});
it('never authorizes on mount or a simple operator handover', async () => {
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({challengeToken:'synthetic',terms:'Official synthetic term',termsHash:'hash',version:'1',consultId:ref.consultId})});vi.stubGlobal('fetch',fetcher);
  render(<V8NativeConsent executionId="synthetic" reference={ref} onRecorded={vi.fn()} />);
  expect(fetcher).not.toHaveBeenCalled();
  await act(async()=>fireEvent.click(screen.getByText('Autorizar consulta com o trabalhador')));
  fireEvent.click(screen.getByText('Passar controles ao trabalhador'));
  fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByText('Registrar meu aceite e autorizar na V8') as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain('/native/prepare');
});
it.each(['SUCCESS','REJECTED','FAILED'])('polls only observations and stops at %s; only eligible SUCCESS starts pricing once', async status => {
  vi.useFakeTimers(); const start=vi.fn(),snapshot=vi.fn();
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({results:{v8:{rows:[{data:{v8:{...ref,status,simulationReady:status==='SUCCESS'}}}]}}})});vi.stubGlobal('fetch',fetcher);
  const {unmount}=render(<V8CltActions capabilities={{connections:[]}} form={{}} setForm={vi.fn()} start={start} busy={false} executionId="synthetic" rows={[{data:{v8:ref}}]} onSnapshot={snapshot}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  expect(start).toHaveBeenCalledTimes(status==='SUCCESS'?1:0);
  await act(async()=>{await vi.advanceTimersByTimeAsync(80000);});expect(fetcher).toHaveBeenCalledTimes(1);
  unmount();
});
it('cancels observation on unmount without starting a bank operation', async()=>{
  vi.useFakeTimers();const start=vi.fn(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const {unmount}=render(<V8CltActions capabilities={{connections:[]}} form={{}} setForm={vi.fn()} start={start} busy={false} executionId="synthetic" rows={[{data:{v8:ref}}]} onSnapshot={vi.fn()}/>);
  unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(80000);});expect(fetcher).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
});
