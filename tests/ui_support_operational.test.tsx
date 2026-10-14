// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
const state = vi.hoisted(() => ({ listener: undefined as any, messages: [] as any[], permissions: ['support.view'] }));
vi.mock('../src/services/storageService', () => ({StorageService:{getActiveUser:()=>({id:'local-user',role:'USUARIO',customPermissions:state.permissions})}}));
vi.mock('../src/services/realtimeService', () => ({realtimeHub:{subscribe:vi.fn((_type,listener)=>{state.listener=listener;return ()=>{state.listener=undefined;};})}}));
vi.mock('../src/components/support/SupportReplyTemplates', () => ({SupportReplyTemplates:()=>null}));
vi.mock('../src/components/support/SimulationWhatsAppConnection', () => ({SimulationWhatsAppConnection:()=>null}));
import { CentralAtendimentoView } from '../src/components/support/CentralAtendimentoView';
const conversation = {id:'local-conversation',partnerId:'local-partner',partnerName:'Parceiro fictício',partnerCode:'LOCAL',channel:'PORTAL',status:'OPEN',subject:'Conversa local',createdAt:'2026-10-14T12:00:00Z',lastMessageAt:'2026-10-14T12:00:00Z',unreadCount:0};
beforeEach(()=>{
  state.permissions=['support.view'];state.messages=[];
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
    await act(async()=>state.listener({type:'SUPPORT_MESSAGE_RECEIVED',data:{conversationId:conversation.id}}));
    expect(await screen.findByText('Mensagem fictícia recebida')).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
  });
  it('mantém a leitura sem editor para perfil sem support.reply',async()=>{
    const {container}=render(<CentralAtendimentoView />);
    await waitFor(()=>expect(screen.getAllByText('Parceiro fictício').length).toBeGreaterThan(0));
    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.queryByRole('button',{name:'Concluir Atendimento'})).toBeNull();
  });
});
