// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../src/services/storageService',()=>({StorageService:{getActiveUser:()=>({id:'synthetic-user',role:'MASTER'})}}));
vi.mock('../src/services/realtimeService',()=>({realtimeHub:{subscribe:()=>()=>{},onStatusChange:()=>()=>{}}}));
import { CentralAtendimentoView } from '../src/components/support/CentralAtendimentoView';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('loads real tools only on demand and inserts a template without sending it',async()=>{
  Element.prototype.scrollIntoView=vi.fn();
  const conversation={id:'synthetic-conversation',partnerName:'Parceiro sintético',channel:'PORTAL',department:'SUPPORT',status:'OPEN',lastMessageAt:'2026-10-23T12:00:00Z'};
  vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
    if(options?.method && options.method!=='GET')throw Error('Unexpected write blocked');
    const path=String(url);
    const data=path.includes('/conversations?')?[conversation]:path.endsWith('/metrics')?{totalActive:1,totalMessagesToday:0}:path.endsWith('/reply-templates')?[{id:'synthetic-template',title:'Saudação',message:'Mensagem modelo sintética'}]:path.endsWith('/whatsapp/config')?{enabled:false}:path.endsWith('/synthetic-conversation')?{conversation,messages:[]}:null;
    if(!data)throw Error('Unexpected request blocked');
    return {ok:true,json:async()=>data};
  }));
  render(<CentralAtendimentoView />);
  await screen.findByLabelText('Resposta para o parceiro');
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('reply-templates')||String(url).includes('whatsapp'))).toBe(false);
  const tools=screen.getByText('Ferramentas').closest('details')!;
  await act(async()=>{tools.open=true;fireEvent(tools,new Event('toggle'));});
  expect(await screen.findByText('Saudação')).toBeTruthy();
  const templates=screen.getByText(/Minhas mensagens modelo/).closest('details')!;
  fireEvent.click(templates.querySelector('summary')!);
  fireEvent.click(screen.getByRole('button',{name:'Usar modelo'}));
  expect((screen.getByLabelText('Resposta para o parceiro') as HTMLTextAreaElement).value).toBe('Mensagem modelo sintética');
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('whatsapp/config'))).toBe(true));
  expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
});
