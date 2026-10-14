// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
vi.mock('../src/components/integrations/BankIntegrationsView',()=>({BankIntegrationsView:({initialTab}:any)=>{
  const [draft,setDraft]=React.useState('');
  return <input aria-label={`Configuração local ${initialTab}`} value={draft} onChange={event=>setDraft(event.target.value)} />;
}}));
vi.mock('../src/components/integrations/FinantoIntegrationTab',()=>({FinantoIntegrationTab:()=>null}));
vi.mock('../src/components/integrations/NossaFintechIntegrationTab',()=>({NossaFintechIntegrationTab:()=>null}));
import { HubIntegracoes } from '../src/components/admin/HubIntegracoes';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if(String(url)!=='/api/integrations/health'||(options?.method||'GET')!=='GET')throw new Error('Network forbidden');
  return {ok:true,json:async()=>({integrations:[],overallStatus:'UNKNOWN'})};
})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Hub Premium, sem chamadas reais aos bancos',()=>{
  it('preserva dez áreas e o rascunho do componente filho no rollback',async()=>{
    const {rerender}=render(<HubIntegracoes premium />);
    const nav=screen.getByRole('navigation',{name:'Áreas de integração'});
    expect(within(nav).getAllByRole('button')).toHaveLength(10);
    fireEvent.click(within(nav).getByRole('button',{name:'C6 Bank'}));
    fireEvent.change(screen.getByLabelText('Configuração local c6'),{target:{value:'rascunho sintético'}});
    rerender(<HubIntegracoes premium={false} />);
    expect((screen.getByLabelText('Configuração local c6') as HTMLInputElement).value).toBe('rascunho sintético');
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  });
});
