// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const state=vi.hoisted(()=>({role:'MASTER'}));
vi.mock('../src/services/storageService',()=>({StorageService:{getActiveUser:()=>({role:state.role})}}));
vi.mock('../src/components/admin/UserManagement',()=>({UserManagement:()=> <div>Usuários originais</div>}));
vi.mock('../src/components/admin/PerfisPermissoesView',()=>({PerfisPermissoesView:()=>null}));
vi.mock('../src/components/admin/ProductManagement',()=>({ProductManagement:()=>null}));
vi.mock('../src/components/admin/ConvenioManagement',()=>({ConvenioManagement:()=>null}));
vi.mock('../src/components/admin/BankPromoterManagement',()=>({BankPromoterManagement:()=>null}));
vi.mock('../src/components/admin/OperationalRulesManagement',()=>({OperationalRulesManagement:()=>null}));
vi.mock('../src/components/admin/StatusManagement',()=>({StatusManagement:()=>null}));
vi.mock('../src/components/admin/HolidayManagement',()=>({HolidayManagement:()=>null}));
vi.mock('../src/components/saas/PlatformMasterCentral',()=>({PlatformMasterCentral:()=>null}));
vi.mock('../src/components/admin/CentralPendencias',()=>({CentralPendencias:()=>null}));
vi.mock('../src/components/admin/CentralAutomacoes',()=>({CentralAutomacoes:()=>null}));
vi.mock('../src/components/admin/HubIntegracoes',()=>({HubIntegracoes:()=>null}));
vi.mock('../src/components/admin/AuditLogView',()=>({AuditLogView:()=>null}));
vi.mock('../src/components/admin/WhiteLabelModal',()=>({WhiteLabelModal:()=>null}));
vi.mock('../src/components/admin/AnnouncementsManagement',()=>({AnnouncementsManagement:()=>null}));
vi.mock('../src/components/admin/DomainManagement',()=>({DomainManagement:()=>null}));
import { CentralAdministracao } from '../src/components/admin/CentralAdministracao';
beforeEach(()=>{state.role='MASTER';vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if(String(url)!=='/api/admin/overview'||(options?.method||'GET')!=='GET')throw new Error('Network forbidden');
  return {ok:true,json:async()=>({})};
}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Administração Premium preserva os destinos reais',()=>{
  it('MASTER mantém quinze áreas e não ganha administração de plataforma',async()=>{
    render(<CentralAdministracao premium />);
    const nav=screen.getByRole('navigation',{name:'Seções administrativas'});
    expect(within(nav).getAllByRole('button')).toHaveLength(15);
    expect(within(nav).queryByRole('button',{name:/Empresas & SaaS/})).toBeNull();
    expect(within(nav).queryByRole('button',{name:/Domínios Customizados/})).toBeNull();
    fireEvent.click(within(nav).getByRole('button',{name:/Usuários/}));
    expect(screen.getByText('Usuários originais')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('conta de teste PLATFORM_MASTER conserva seus dezessete destinos',()=>{
    state.role='PLATFORM_MASTER';render(<CentralAdministracao premium />);
    const nav=screen.getByRole('navigation',{name:'Seções administrativas'});
    expect(within(nav).getAllByRole('button')).toHaveLength(17);
    expect(within(nav).getByRole('button',{name:/Empresas & SaaS/})).toBeTruthy();
    expect(within(nav).getByRole('button',{name:/Domínios Customizados/})).toBeTruthy();
  });
});
