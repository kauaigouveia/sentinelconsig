// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {readFileSync} from 'node:fs';
vi.mock('../src/services/storageService',()=>({StorageService:{
  getProducts:()=>[{id:'product',name:'Novo',active:true}],
  getConvenios:()=>[{id:'inss',name:'INSS',active:true}],
  getBanks:()=>[{id:'bank',name:'Banco fictício',active:true}],
  getPromoters:()=>[{id:'promoter',name:'Promotora fictícia',active:true}],
  getPartners:()=>[],getPromotersForBank:()=>[{id:'promoter',name:'Promotora fictícia',active:true}],
  getProductsForConvenio:()=>[{id:'product',name:'Novo',active:true}],
  getCurrentTenantId:()=> 'unit-dialog',lookupClientAndPendingData:()=>({client:null,pendingData:null}),
}}));
import {NewProductionModal} from '../src/components/production/NewProductionModal';
beforeEach(()=>{
  vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
    if(String(url)!=='/api/partners'||(options?.method||'GET')!=='GET')throw new Error('Network blocked');
    return {ok:true,json:async()=>[]};
  }));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Formulário original dentro do shell Premium',()=>{
  it('mantém rascunho ao comparar o legado e cancela sem gravar',()=>{
    const close=vi.fn(),success=vi.fn();
    const {rerender}=render(<div className="s2-root"><NewProductionModal isOpen onClose={close} onSuccess={success}/></div>);
    const name=screen.getByPlaceholderText('Ex: MARIA JOSE ALEXANDRE');
    fireEvent.change(name,{target:{value:'Cliente fictício'}});
    expect(screen.getByPlaceholderText('833085808 ou UUID')).toBeTruthy();
    rerender(<div className="sentinel-app"><NewProductionModal isOpen onClose={close} onSuccess={success}/></div>);
    expect((screen.getByPlaceholderText('Ex: MARIA JOSE ALEXANDRE') as HTMLInputElement).value).toBe('Cliente fictício');
    fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
    expect(close).toHaveBeenCalledOnce();expect(success).not.toHaveBeenCalled();
  });
  it('estilos de diálogo não atingem body, portal ou legado',()=>{
    const css=readFileSync('src/styles/sentinel-2-dialogs.css','utf8');
    expect(css).not.toMatch(/(?:^|\n)(?:body|:root|\.dark|\.sentinel-app|\.fixed|\[role)/);
    expect(css).not.toMatch(/display:\s*none|visibility:\s*hidden|pointer-events:\s*none/);
    expect(css).toContain('.s2-root');
  });
});
