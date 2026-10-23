// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ event: undefined as any, status: undefined as any, rows: [] as any[] }));
const client = vi.hoisted(() => ({getConversations: vi.fn(), getConversationMessages: vi.fn(), sendMessage: vi.fn(), createConversation: vi.fn()}));
vi.mock('../src/services/partnerPortalClient', () => ({PartnerPortalClient: client}));
vi.mock('../src/services/partnerSupportRealtime',()=>({connectPartnerSupportRealtime:(callback:any)=>{state.event=callback;return ()=>{state.event=undefined;};}}));
vi.mock('../src/services/realtimeService', () => ({realtimeHub: {
  subscribe: (_: string, callback: any) => {state.event=callback;return ()=>{state.event=undefined;};},
  onStatusChange: (callback: any) => {state.status=callback;return ()=>{state.status=undefined;};},
}}));
vi.mock('../src/components/ui/toastService', () => ({toastService: {error: vi.fn()}}));
import { PartnerSupportView } from '../src/components/partner-portal/PartnerSupportView';
const conversation = {id:'synthetic-a',subject:'Atendimento sintético',status:'OPEN',channel:'PORTAL',lastMessageAt:'2026-10-23T12:00:00Z',unreadCount:0};
beforeEach(()=>{
  vi.clearAllMocks(); state.rows=[]; Element.prototype.scrollIntoView=vi.fn();
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected network request blocked');}));
  client.getConversations.mockResolvedValue([conversation]);
  client.getConversationMessages.mockImplementation(async()=>({conversation,messages:state.rows}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('External partner chat, offline synthetic API',()=>{
  it.each(['SUPPORT_MESSAGE_RECEIVED','SUPPORT_CONVERSATION_CREATED','SUPPORT_CONVERSATION_STATUS_CHANGED','SUPPORT_CONVERSATION_ASSIGNED'])('refreshes from thin %s envelope',async type=>{
    render(<PartnerSupportView />);
    await screen.findByPlaceholderText('Digite sua mensagem para o suporte...');
    state.rows=[{id:'received',message:'Mensagem sintética recebida',senderType:'SUPPORT',createdAt:conversation.lastMessageAt}];
    await act(async()=>state.event({type,entity:'SUPPORT',entityId:conversation.id}));
    expect(await screen.findByText('Mensagem sintética recebida')).toBeTruthy();
  });
  it('restores text after failure, retries once and preserves attachments',async()=>{
    state.rows=[{id:'attachment',message:'Documento sintético',attachmentName:'exemplo.txt',senderType:'SUPPORT',createdAt:conversation.lastMessageAt}];
    client.sendMessage.mockRejectedValueOnce(new Error('Falha sintética')).mockResolvedValueOnce({id:'sent',message:'Tentativa sintética',senderType:'PARTNER',createdAt:conversation.lastMessageAt});
    render(<PartnerSupportView />);
    const input=await screen.findByPlaceholderText('Digite sua mensagem para o suporte...');
    fireEvent.change(input,{target:{value:'Tentativa sintética'}});fireEvent.submit(input.closest('form')!);
    await waitFor(()=>expect((input as HTMLInputElement).value).toBe('Tentativa sintética'));
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByText('Tentativa sintética')).toBeTruthy();
    expect(client.sendMessage).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link',{name:'Baixar exemplo.txt'}).getAttribute('href')).toBe('/api/partner-portal/support/messages/attachment/attachment');
  });
  it('ignores stale responses when selecting a different conversation',async()=>{
    client.getConversations.mockResolvedValue([conversation,{...conversation,id:'synthetic-b',subject:'Segunda conversa'}]);
    let finish:any;
    client.getConversationMessages.mockImplementation((id:string)=>id===conversation.id ? new Promise(resolve=>{finish=resolve;}) : Promise.resolve({conversation:{...conversation,id:'synthetic-b'},messages:[]}));
    render(<PartnerSupportView />);
    await screen.findByText('Segunda conversa');
    fireEvent.click(screen.getByText('Segunda conversa'));
    await screen.findByPlaceholderText('Digite sua mensagem para o suporte...');
    await act(async()=>finish({conversation,messages:[{id:'stale',message:'STALE MUST NOT APPEAR'}]}));
    expect(screen.queryByText('STALE MUST NOT APPEAR')).toBeNull();
  });
  it('does not allow in-portal replies for external messaging channels',async()=>{
    client.getConversationMessages.mockResolvedValue({conversation:{...conversation,channel:'WHATSAPP'},messages:[]});
    render(<PartnerSupportView />);
    expect(await screen.findByText('Continue esta conversa pelo WhatsApp do canal de simulação.')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Digite sua mensagem para o suporte...')).toBeNull();
  });
});
