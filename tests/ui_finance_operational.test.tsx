// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const state=vi.hoisted(()=>({create:false}));
vi.mock('../src/services/storageService',()=>({StorageService:{getActiveUser:()=>({role:'MASTER',customPermissions:state.create?['financial.view','financial.create']:['financial.view']})}}));
import { GeneralFinanceView } from '../src/components/finance/GeneralFinanceView';
beforeEach(()=>{state.create=false;vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if(String(url)!=='/api/financial'||(options?.method||'GET')!=='GET')throw new Error('Network forbidden');
  return {ok:true,json:async()=>[{id:'entry',title:'Lançamento fictício',type:'ENTRADA',amount:100,category:'SERVICO',status:'REALIZADO',dueDate:'2026-10-14',paymentDate:'2026-10-14'}]};
}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Financeiro Premium com fonte sintética, sem escrita',()=>{
  it('preserva oito campos, busca e gates de alteração',async()=>{
    render(<GeneralFinanceView premium />);
    await screen.findByText('Lançamento fictício');
    expect(screen.getAllByRole('columnheader')).toHaveLength(8);
    expect(screen.queryByLabelText('Alterar status financeiro de Lançamento fictício')).toBeNull();
    expect(screen.queryByLabelText('Excluir lançamento: Lançamento fictício')).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar lançamento financeiro'),{target:{value:'inexistente'}});
    expect(screen.queryByText('Lançamento fictício')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('abre e cancela o formulário original sem submissão',async()=>{
    state.create=true;render(<GeneralFinanceView premium />);
    await screen.findByText('Lançamento fictício');
    fireEvent.click(screen.getByRole('button',{name:'Novo Lançamento Financeiro'}));
    expect(screen.getByPlaceholderText('Ex: 1.500,00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
    expect(screen.queryByPlaceholderText('Ex: 1.500,00')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
