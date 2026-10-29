// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { V8CltActions } from '../src/components/simulation/V8CltActions';
import { V8ApiAuthorization } from '../src/components/simulation/V8ApiAuthorization';
import { V8CltConsultation } from '../src/components/simulation/V8CltConsultation';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const ref = { consultId: 'synthetic-consult', promoterId: 'synthetic-promoter', consentRecorded: true, status: 'CONSENT_APPROVED' };
it('uses first-step data to create V8 consultations without rendering duplicate personal inputs',()=>{
 const start=vi.fn();render(<V8CltActions capabilities={{connections:[{promoterId:'synthetic-promoter'}]}} form={{v8BirthDate:'28/02/1990',v8Email:'synthetic@example.invalid',v8Gender:'male'}} setForm={vi.fn()} start={start} busy={false} executionId="synthetic" rows={[]} onSnapshot={vi.fn()}/>);
 expect(screen.queryByText(/Criar consulta · dados adicionais/)).toBeNull();expect(screen.queryByLabelText(/Nascimento|E-mail|Sexo/)).toBeNull();
 fireEvent.click(screen.getByText('Criar consulta V8'));expect(start).toHaveBeenCalledWith('v8','CREATE_CONSULT');expect(screen.queryByRole('checkbox')).toBeNull();
});
it('presents the proven net amount and fractional monthly rate without inventing CET', () => {
  render(<V8CltConsultation selected onSelect={() => {}} row={{ state:'OFFER', amount:2350.44, installment:300, term:12, data:{v8:{...ref,monthlyInterestRate:0.0498,iofAmount:64.94,isInsured:false,insuranceAmount:0,requestedProvider:'QI',returnedProvider:'CELCOIN',firstInstallmentDate:'2027-01-28'}} }} />);
  expect(screen.getByText(/Valor liberado:/).textContent).toContain('2.350,44');
  expect(screen.getByText(/Taxa mensal:/).textContent).toContain('4,98%');
  expect(screen.getByText('CET: Não informado')).toBeTruthy();
  expect(screen.getByText('Seguro: Sem seguro')).toBeTruthy();
  expect(screen.getByText(/Provider solicitado:/).textContent).toContain('QI · retornado: CELCOIN');
});
it('calls bank-mediated authorization only on explicit action, without worker signature controls', async () => {
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({authorizationRecorded:true,message:'Autorização processada pela API V8'})});vi.stubGlobal('fetch',fetcher);const recorded=vi.fn();
  render(<V8ApiAuthorization executionId="synthetic" reference={ref} onRecorded={recorded} />);
  expect(fetcher).not.toHaveBeenCalled();expect(screen.queryByRole('checkbox')).toBeNull();expect(screen.queryByLabelText('Assinatura do trabalhador')).toBeNull();
  fireEvent.change(screen.getByLabelText('Sistema operacional do dispositivo'),{target:{value:'Synthetic OS'}});
  fireEvent.change(screen.getByLabelText('Modelo do dispositivo'),{target:{value:'Synthetic model'}});
  fireEvent.change(screen.getByLabelText('Nome do dispositivo'),{target:{value:'Synthetic device'}});
  fireEvent.change(screen.getByLabelText('Tipo do dispositivo'),{target:{value:'desktop'}});
  await act(async()=>fireEvent.click(screen.getByText('Autorizar consulta V8')));
  expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/api/simulations/clt/v8/authorize');expect(recorded).toHaveBeenCalledOnce();
  const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.consultId).toBe(ref.consultId);expect(body.signature).toBeUndefined();expect(body.accepted).toBeUndefined();
});
it.each(['SUCCESS','REJECTED','FAILED'])('delegates polling to the parent journey and never independently replays a calculation at %s', async status => {
  vi.useFakeTimers();const start=vi.fn(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  render(<V8CltActions capabilities={{connections:[]}} form={{}} setForm={vi.fn()} start={start} busy={false} executionId="synthetic" rows={[{data:{v8:{...ref,status}}}]} onSnapshot={vi.fn()}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(90000);});expect(fetcher).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
});
it('cancels observation on unmount without starting a bank operation', async()=>{
  vi.useFakeTimers();const start=vi.fn(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const {unmount}=render(<V8CltActions capabilities={{connections:[]}} form={{}} setForm={vi.fn()} start={start} busy={false} executionId="synthetic" rows={[{data:{v8:ref}}]} onSnapshot={vi.fn()}/>);
  unmount();await act(async()=>{await vi.advanceTimersByTimeAsync(80000);});expect(fetcher).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
});
it('binds authorization to its own reference instead of a different form selection',async()=>{
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({authorizationRecorded:true})});vi.stubGlobal('fetch',request);const done=vi.fn();
 render(<V8ApiAuthorization executionId="synthetic" reference={{...ref,consentRecorded:false,status:'WAITING_CONSENT'}} onRecorded={done}/>);
 for(const [label,value]of [['Sistema operacional do dispositivo','Synthetic OS'],['Modelo do dispositivo','Synthetic model'],['Nome do dispositivo','Synthetic device'],['Tipo do dispositivo','desktop']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 await act(async()=>fireEvent.click(screen.getByText('Autorizar consulta V8')));expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({consultId:ref.consultId,promoterId:ref.promoterId});expect(done).toHaveBeenCalledOnce();
});

it('offers only configurations from the selected V8 consultation and forwards the explicit choice',()=>{
 const setForm=vi.fn(),start=vi.fn();const rows=[{state:'DATA',data:{v8:{consultId:'c',promoterId:'p',configurations:[{id:'config-36',name:'CLT Acelera',terms:[12,36]}]}}},{state:'DATA',data:{v8:{consultId:'other',promoterId:'p',configurations:[{id:'other-config',name:'Outra consulta',terms:[24]}]}}}];
 render(<V8CltActions capabilities={{connections:[{promoterId:'p'}]}} form={{v8ConsultId:'c',v8PromoterId:'p',v8Email:'synthetic@example.invalid',v8BirthDate:'28/02/1990',v8Gender:'male'}} setForm={setForm} start={start} rows={rows}/>);const select=screen.getByLabelText('Configuração V8');expect(select.textContent).toContain('CLT Acelera');expect(select.textContent).not.toContain('Outra consulta');fireEvent.change(select,{target:{value:'config-36'}});expect(setForm.mock.calls[0][0]({v8ConsultId:'c'})).toMatchObject({v8ConfigId:'config-36'});expect(start).not.toHaveBeenCalled();
});
