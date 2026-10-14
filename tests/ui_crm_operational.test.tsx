// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../src/router',()=>({useRouter:()=>({searchParams:new URLSearchParams(),navigate:vi.fn()})}));
vi.mock('../src/components/crm/PartnerDetailModal',()=>({PartnerDetailModal:()=>null}));
vi.mock('../src/components/crm/PartnerFormModal',()=>({PartnerFormModal:({isOpen}:any)=>isOpen?<div data-testid="partner-form"/>:null}));
vi.mock('../src/components/admin/PartnerImportModal',()=>({PartnerImportModal:({isOpen}:any)=>isOpen?<div data-testid="partner-import"/>:null}));
import { PartnerCrmHub } from '../src/components/crm/PartnerCrmHub';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if((options?.method||'GET')!=='GET')throw new Error('Network forbidden');
  if(String(url).startsWith('/api/partners?'))return {ok:true,json:async()=>[{id:'p1',name:'Parceiro fictício',code:'TESTE',status:'ATIVO',operationalStatus:'ATIVO_RECENTE',metrics:{totalProposalsCount:2,totalProposalsVolume:100}}]};
  if(['/api/users','/api/promoters'].includes(String(url)))return {ok:true,json:async()=>[]};
  throw new Error('Network forbidden');
})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('CRM operacional Premium sem cadastro ou exclusão',()=>{
  it('alterna grade/tabela, abre os mesmos destinos de formulário/importação e pesquisa',async()=>{
    render(<PartnerCrmHub premium />);
    await screen.findByText('Parceiro fictício');
    fireEvent.click(screen.getByTitle('Visualização em Tabela'));
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole('button',{name:'Novo Parceiro'}));
    expect(screen.getByTestId('partner-form')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:/Importar/}));
    expect(screen.getByTestId('partner-import')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Buscar por Razão Social, código, CNPJ/CPF, e-mail ou telefone...'),{target:{value:'teste'}});
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('search=teste'))).toBe(true));
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
  });
});
