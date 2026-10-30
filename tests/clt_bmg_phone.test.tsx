// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../src/components/simulation/BmgCltProposalForm', () => ({ BmgCltProposalForm: () => null }));
import { BmgCustomerAuthorization } from '../src/components/simulation/BmgCustomerAuthorization';
afterEach(() => { cleanup();vi.useRealTimers(); vi.unstubAllGlobals(); });
it('reuses client phone and sends SMS only on explicit action, preserving bank conflict errors', async () => {
  const calls: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(options?.method === 'POST' ? { error: 'Telefone vinculado a outro CPF.' } : { enabled: true }), { status: options?.method === 'POST' ? 400 : 200 }); }));
  render(<BmgCustomerAuthorization input={{ cpf: '52998224725', product: 'CLT', phone: '11999999999' }} onRows={() => {}} reusePhone allowProposal={false} />);
  const sms = await screen.findByRole('button', { name: 'Enviar código por SMS' });
  expect(screen.queryByLabelText('Telefone do cliente para SMS BMG')).toBeNull(); expect(calls).toHaveLength(1);
  fireEvent.click(sms); await screen.findByText('Telefone vinculado a outro CPF.');
  expect(calls).toHaveLength(2); expect(JSON.parse(calls[1].options.body).phone).toBe('11999999999');
});
it('keeps OTP in the bank card and does not resend it after a render', async () => {
  const calls: any[] = [], onStatus = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(options?.method === 'POST' ? {} : { enabled: true })); }));
  const props = { input: { cpf: '52998224725', product: 'CLT', phone: '11999999999' }, onRows: vi.fn(), onStatus, reusePhone: true, allowProposal: false };
  const ui = render(<BmgCustomerAuthorization {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enviar código por SMS' }));
  await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('Aguardando código SMS', 'send-otp'));
  fireEvent.change(screen.getByLabelText('Código SMS BMG'), { target: { value: '123456' } });
  ui.rerender(<BmgCustomerAuthorization {...props} />);
  expect(calls.filter(call => String(call.url).endsWith('send-otp'))).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Validar código' }));
  await vi.waitFor(() => expect(onStatus).toHaveBeenCalledWith('Código validado. Consulte as ofertas.', 'verify-otp'));
  expect(JSON.parse(calls.filter(call=>String(call.url).endsWith('/verify-otp')).at(-1).options.body)).toMatchObject({ phone: '11999999999', code: '123456' });
});

it('requires explicit contact permission to renew an expired BMG SMS and blocks duplicate clicks',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url,options)=>{calls.push({url,options});return Response.json(options?.method==='POST'?{message:'SMS solicitado ao BMG.',authorization:{status:'WAITING_OTP',ready:false,expiresAt:new Date(Date.now()+300000).toISOString(),attemptsRemaining:3}}:{enabled:true});}));
 render(<BmgCustomerAuthorization input={{cpf:'52998224725',phone:'11999999999',product:'CLT'}} authorization={{status:'EXPIRED'}} otpRequested simulationReady={false} onRows={()=>{}} reusePhone allowProposal={false}/>);const resend=await screen.findByRole('button',{name:'Reenviar SMS'});expect((resend as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByLabelText('Cliente autorizou o contato por SMS'));fireEvent.click(resend);fireEvent.click(resend);await screen.findByText('SMS solicitado ao BMG.');
 const posts=calls.filter(c=>String(c.url).endsWith('resend-otp'));expect(posts).toHaveLength(1);expect(JSON.parse(posts[0].options.body)).toMatchObject({phone:'11999999999',contactAuthorized:true});expect((screen.getByRole('button',{name:'Consultar ofertas BMG'}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole('button',{name:'Reenviar SMS'}) as HTMLButtonElement).disabled).toBe(true);
});
it('polls only authorization status while waiting and stops after official eligibility without sending SMS',async()=>{
 vi.useFakeTimers();const calls:any[]=[],onStatus=vi.fn();vi.stubGlobal('fetch',vi.fn(async(url,options)=>{calls.push({url,options});return Response.json(options?.method==='POST'?{authorization:{status:'APPROVED',ready:true}}:{enabled:true});}));
 const {act}=await import('@testing-library/react');await act(async()=>{render(<BmgCustomerAuthorization input={{cpf:'52998224725',phone:'11999999999',product:'CLT'}} authorization={{status:'WAITING_OTP',ready:false,expiresAt:new Date(Date.now()+300000).toISOString()}} otpRequested onStatus={onStatus} onRows={()=>{}}/>);});await act(async()=>{await vi.advanceTimersByTimeAsync(31000);});expect(calls.filter(c=>String(c.url).endsWith('authorization-status'))).toHaveLength(1);expect(calls.some(c=>/send-otp|resend-otp/.test(String(c.url)))).toBe(false);expect(onStatus).toHaveBeenCalledWith('Autorização e elegibilidade confirmadas pelo BMG.','authorization-status');await act(async()=>{await vi.advanceTimersByTimeAsync(31000);});expect(calls.filter(c=>String(c.url).endsWith('authorization-status'))).toHaveLength(1);
});
