// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
vi.mock('../src/services/storageService', () => ({StorageService:{
  getClients:()=>[{id:'c1',fullName:'Cliente fictício Alfa',cpf:'00000000000'},{id:'c2',fullName:'Cliente fictício Beta',cpf:'11111111111'}],
  getProposals:()=>[1,2].map(n=>({id:`p${n}`,proposalNumber:`SAFE-${n}`,clientId:'c1',disbursedValue:100,contractBalance:0,statusId:'s1',createdAt:'2026-10-14T12:00:00Z'})),
  getProducts:()=>[],getBanks:()=>[],getPromoters:()=>[],getPartners:()=>[],getStatuses:()=>[{id:'s1',name:'Status local',code:'PAGO'}],getHistory:()=>[],
  getDocumentsByClient:()=>[],getCommunicationsByClient:()=>[],getActiveUser:()=>({role:'MASTER',customPermissions:['clients.view','proposals.view']}),
}}));
vi.mock('../src/services/realtimeService',()=>({realtimeHub:{subscribe:()=>()=>{}}}));
vi.mock('../src/components/production/ProposalDetailModal',()=>({ProposalDetailModal:({proposalId}:any)=><div data-testid="detail">{proposalId}</div>}));
import { Client360View } from '../src/components/clients/Client360View';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async (url,options:any)=> {
  if ((options?.method || 'GET') !== 'GET' || !String(url).match(/^\/api\/clients\/c[12]\/(notes|communications)$/)) throw new Error('Network forbidden');
  return {ok:true,json:async()=>[]};
})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Cliente 360 operacional Premium com fontes sintéticas',()=>{
  it('preserva sete seções e múltiplas ADEs sem escrever',async()=>{
    render(<Client360View premium />);
    const nav = screen.getByRole('navigation',{name:'Seções do cliente'});
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {fireEvent.click(button);expect(button.getAttribute('aria-current')).toBe('page');}
    fireEvent.click(within(nav).getByRole('button',{name:'Propostas (2)'}));
    expect(screen.getByText('ADE SAFE-1')).toBeTruthy();expect(screen.getByText('ADE SAFE-2')).toBeTruthy();
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls.every(([, options])=>!options?.method || options.method==='GET')).toBe(true);
  });
  it('busca troca o cliente sem conservar a carteira do anterior',async()=>{
    render(<Client360View premium />);
    fireEvent.change(screen.getByPlaceholderText('Buscar cliente por CPF ou Nome...'),{target:{value:'Beta'}});
    expect(screen.queryByRole('button',{name:/Cliente fictício Alfa/})).toBeNull();
    expect(screen.getByRole('button',{name:'Propostas (0)'})).toBeTruthy();
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(4));
  });
  it('rollback mantém estrutura original',()=>{
    const {container}=render(<Client360View />);
    expect(container.querySelector('.p2-client-layout')).toBeNull();
    expect(screen.getByRole('button',{name:'Propostas (2)'})).toBeTruthy();
  });
});
