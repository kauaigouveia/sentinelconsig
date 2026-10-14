// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state=vi.hoisted(()=>({create:false}));
vi.mock('../src/services/storageService',()=>({StorageService:{getActiveUser:()=>({id:'unit-user',role:'MASTER',customPermissions:state.create?['pendencies.view','pendencies.create']:['pendencies.view']})}}));
import { CentralPendencias } from '../src/components/admin/CentralPendencias';
beforeEach(()=>{state.create=false;vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if ((options?.method||'GET')!=='GET' || !String(url).startsWith('/api/pendencies')) throw new Error('Network forbidden');
  return {ok:true,json:async()=>String(url).endsWith('/metrics')?{total:0,abertas:0,emAtendimento:0}:{items:[],total:0}};
}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Pendências Premium com leituras mockadas',()=>{
  it('mantém filtros status, responsável e busca no endpoint existente',async()=>{
    render(<CentralPendencias premium />);
    await screen.findByText('Nenhuma pendência encontrada');
    fireEvent.click(screen.getByRole('button',{name:'Abertas'}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('status=ABERTA'))).toBe(true));
    fireEvent.click(screen.getByRole('button',{name:'Minhas pendências'}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('assignedToId=unit-user'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Buscar pendências por contrato, cliente, CPF ou título'),{target:{value:'documento'}});
    fireEvent.click(screen.getByRole('button',{name:'Buscar pendências'}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('search=documento'))).toBe(true));
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
  });
  it('preserva permissão e abertura do formulário sem submissão',async()=>{
    const {rerender}=render(<CentralPendencias premium />);
    expect(screen.queryByRole('button',{name:'Nova Pendência'})).toBeNull();
    state.create=true;rerender(<CentralPendencias premium />);
    fireEvent.click(screen.getByRole('button',{name:'Nova Pendência'}));
    expect(screen.getByText('Abrir Nova Pendência Operacional')).toBeTruthy();
    expect(screen.getByPlaceholderText('Ex: Documento de identidade divergente ou ilegível')).toBeTruthy();
    await screen.findByText('Nenhuma pendência encontrada');
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
  });
  it('rollback conserva a apresentação original',async()=>{
    const {container}=render(<CentralPendencias />);
    await screen.findByText('Nenhuma pendência encontrada');
    expect(container.querySelector('.p2-live-pendencies')).toBeNull();
  });
});
