// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act, fireEvent } from '@testing-library/react';
const state = vi.hoisted(() => ({ listener: undefined as any, messages: [] as any[], permissions: ['support.view'], statusListener: undefined as any, role: 'USUARIO' }));
vi.mock('../src/services/storageService', () => ({StorageService:{getActiveUser:()=>({id:'local-user',role:state.role,customPermissions:state.permissions})}}));
vi.mock('../src/services/realtimeService', () => ({realtimeHub:{onStatusChange:vi.fn(listener=>{state.statusListener=listener;return ()=>{state.statusListener=undefined;};}),subscribe:vi.fn((_type,listener)=>{state.listener=listener;return ()=>{state.listener=undefined;};})}}));
vi.mock('../src/components/support/SupportReplyTemplates', () => ({SupportReplyTemplates:()=>null}));
vi.mock('../src/components/support/SimulationWhatsAppConnection', () => ({SimulationWhatsAppConnection:()=>null}));
import { CentralAtendimentoView } from '../src/components/support/CentralAtendimentoView';
const conversation = {id:'local-conversation',partnerId:'local-partner',partnerName:'Parceiro fictício',partnerCode:'LOCAL',channel:'PORTAL',status:'OPEN',subject:'Conversa local',createdAt:'2026-10-14T12:00:00Z',lastMessageAt:'2026-10-14T12:00:00Z',unreadCount:0};
beforeEach(()=>{
  state.role='USUARIO';state.permissions=['support.view'];state.messages=[];
  Element.prototype.scrollIntoView=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
    if(options?.method && options.method!=='GET')throw new Error('All writes blocked');
    const path=String(url);
    if(path.startsWith('/api/support/conversations?'))return {ok:true,json:async()=>[conversation]};
    if(path==='/api/support/metrics')return {ok:true,json:async()=>({openCount:1,inProgressCount:0,resolvedCount:0,totalActive:1,totalMessagesToday:state.messages.length})};
    if(path==='/api/support/conversations/local-conversation')return {ok:true,json:async()=>({conversation,messages:state.messages})};
    throw new Error(`External request blocked: ${path}`);
  }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Atendimento preservado no shell V2, sem envio externo',()=>{
  it('recebe atualização da conversa pelo evento real sem recarregar a tela',async()=>{
    render(<CentralAtendimentoView />);
    await waitFor(()=>expect(screen.getAllByText('Parceiro fictício').length).toBeGreaterThan(0));
    state.messages=[{id:'local-message',conversationId:conversation.id,senderType:'PARTNER',message:'Mensagem fictícia recebida',channel:'PORTAL',createdAt:'2026-10-14T12:00:00Z'}];
    await act(async()=>state.listener({type:'SUPPORT_MESSAGE_RECEIVED',entity:'SUPPORT',entityId:conversation.id}));
    expect(await screen.findByText('Mensagem fictícia recebida')).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
  });
  it('mantém a leitura sem editor para perfil sem support.reply',async()=>{
    const {container}=render(<CentralAtendimentoView />);
    await waitFor(()=>expect(screen.getAllByText('Parceiro fictício').length).toBeGreaterThan(0));
    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.queryByRole('button',{name:'Concluir Atendimento'})).toBeNull();
  });
  it.each(['SUPPORT_CONVERSATION_STATUS_CHANGED','SUPPORT_CONVERSATION_ASSIGNED'])('refreshes active context for %s without content in broadcast', async type => {
    render(<CentralAtendimentoView />);
    await screen.findByText('Conversa local');
    const before=vi.mocked(fetch).mock.calls.length;
    await act(async()=>state.listener({type,entity:'SUPPORT',entityId:conversation.id}));
    expect(vi.mocked(fetch).mock.calls.slice(before).some(([url])=>String(url).endsWith('/local-conversation'))).toBe(true);
  });
  it('catches up after reconnect and keeps two-second polling', async()=>{
    render(<CentralAtendimentoView />);
    await waitFor(()=>expect(state.statusListener).toBeTypeOf('function'));
    const before=vi.mocked(fetch).mock.calls.length;
    await act(async()=>{state.statusListener('ERROR');state.statusListener('CONNECTED');});
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(before);
    // The transport suite tests reconnection; this component still owns its fallback timers.
  });
  it('defers tools, exposes details and supports keyboard/mobile navigation', async()=>{
    state.permissions=['support.view','support.reply'];
    const {container}=render(<CentralAtendimentoView />);
    await waitFor(()=>expect(container.querySelector('[role="button"]')).toBeTruthy());
    const row=container.querySelector('[role="button"]')!;
    fireEvent.keyDown(row,{key:'Enter'});
    expect(container.querySelector('.support-show-conversation')).toBeTruthy();
    expect(screen.getByText('Detalhes da conversa').closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByRole('button',{name:'← Conversas'}));
    expect(container.querySelector('.support-show-queue')).toBeTruthy();
    expect(screen.queryByText('Chamados Abertos')).toBeNull();
    expect(screen.getByLabelText('Resposta para o parceiro')).toBeTruthy();
  });
  it('deduplicates an echoed message when POST finishes after realtime refresh',async()=>{
    state.permissions=['support.view','support.reply'];
    render(<CentralAtendimentoView />);
    const input=await screen.findByLabelText('Resposta para o parceiro');
    const message={id:'echo-id',message:'Resposta sintética',senderType:'SUPPORT',createdAt:'2026-10-23T12:00:00Z'};
    const read=vi.mocked(fetch).getMockImplementation()!;
    let finish:any;
    vi.mocked(fetch).mockImplementation(async(url,options)=>{
      if(options?.method==='POST')return await new Promise(resolve=>{finish=()=>resolve({ok:true,json:async()=>message} as Response);});
      return read(url,options);
    });
    fireEvent.change(input,{target:{value:message.message}});
    fireEvent.submit(input.closest('form')!);
    await waitFor(()=>expect(finish).toBeTypeOf('function'));
    state.messages=[message];
    await act(async()=>state.listener({type:'SUPPORT_MESSAGE_RECEIVED',entity:'SUPPORT',entityId:conversation.id}));
    await act(async()=>finish());
    expect(screen.getAllByText(message.message)).toHaveLength(1);
  });

  it.each([
    ['PLATFORM_MASTER',true,true,true,true], ['MASTER',true,true,true,true],
    ['TENANT_ADMIN',true,true,false,false], ['GESTOR',true,true,true,false],
    ['GERENTE',true,false,true,false], ['SUPORTE',true,true,false,true],
    ['DIGITADOR',false,false,false,false], ['SIMULACAO',true,true,true,false],
  ])('preserves role %s controls and channel scope',async(role,reply,manage,simulation,telegram)=>{
    state.role=role as string;state.permissions=[];
    const {container}=render(<CentralAtendimentoView />);
    await waitFor(()=>expect(container.querySelector('[role="button"]')).toBeTruthy());
    await waitFor(()=>expect(!!screen.queryByLabelText('Resposta para o parceiro')).toBe(reply));
    expect(!!screen.queryByRole('button',{name:'Concluir Atendimento'})).toBe(manage);
    expect(!!screen.queryByRole('option',{name:'Mesa de simulação',hidden:true})).toBe(simulation);
    expect(!!screen.queryByRole('option',{name:'Telegram',hidden:true})).toBe(telegram);
  });

  it('keeps the two-second fallback working when transport is unavailable',async()=>{
    vi.useFakeTimers();
    try {
      render(<CentralAtendimentoView />);
      await act(async()=>{await vi.advanceTimersByTimeAsync(350);});
      vi.mocked(fetch).mockClear();
      await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});
      const urls=vi.mocked(fetch).mock.calls.map(([url])=>String(url));
      expect(urls.filter(url=>url.endsWith('/local-conversation'))).toHaveLength(1);
      expect(urls.filter(url=>url.includes('/conversations?'))).toHaveLength(1);
      expect(urls.filter(url=>url.endsWith('/metrics'))).toHaveLength(1);
    } finally {cleanup();vi.useRealTimers();}
  });

});
