// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
vi.mock('../src/components/integrations/BankIntegrationsView',()=>({BankIntegrationsView:({initialTab}:any)=><div>Conexão compartilhada {initialTab}</div>}));
vi.mock('../src/components/integrations/FinantoIntegrationTab',()=>({FinantoIntegrationTab:()=>null}));
vi.mock('../src/components/integrations/NossaFintechIntegrationTab',()=>({NossaFintechIntegrationTab:()=>null}));
import {HubIntegracoes} from '../src/components/admin/HubIntegracoes';
import {VctexIntegrationTab} from '../src/components/integrations/VctexIntegrationTab';
const meta={enabled:true,hasCredentials:true,gatewayReady:true,status:'ATTENTION',lastDiagnostic:{timestamp:'2026-10-27T15:00:00Z',httpStatus:200,authenticationSucceeded:true,tokenRecognized:true,permissionsClt:'UNPROVEN',transportAvailable:true,error:null},history:[],metrics:{requests24h:1,errors24h:0,complete:true}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('shows the VCTEX tab and reuses the existing configuration view',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({integrations:[],summary:{total:5,online:0,attention:4,offline:0,disabled:1,errors24h:0},overallStatus:'ATTENTION'})));
 render(<HubIntegracoes premium/>);const nav=screen.getByRole('navigation',{name:'Áreas de integração'});fireEvent.click(within(nav).getByRole('button',{name:'VCTEX CLT'}));expect(await screen.findByText('Conexão compartilhada vctex')).toBeTruthy();await waitFor(()=>expect(screen.queryByText('Carregando…')).toBeNull());expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not render a false 0/0 or online zero as measured values when loading fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'PRIVATE_ERROR'},{status:500})));const {container}=render(<HubIntegracoes/>);await screen.findByRole('alert');expect(screen.getByText('Indisponível')).toBeTruthy();expect(container.textContent).not.toContain('PRIVATE_ERROR');expect(container.textContent).not.toMatch(/0\s*\/\s*0/);
});
it('separates login/token from CLT permission and refreshes without a new POST',async()=>{
 const api=vi.fn(async(_url?:string,_init?:RequestInit)=>Response.json(meta));vi.stubGlobal('fetch',api);render(<VctexIntegrationTab promoterId="p-a"/>);
 await screen.findByText('Reconhecido');expect(screen.getByText('Não comprovadas')).toBeTruthy();expect(screen.getByText(/Operação CLT não comprovada/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Atualizar estado'}));await waitFor(()=>expect(api).toHaveBeenCalledTimes(2));expect(api.mock.calls.every(c=>!(c as any)[1].method)).toBe(true);
});
it('performs one explicit diagnostic through the existing scoped endpoint, then reloads status',async()=>{
 const api=vi.fn(async(_url?:string,_init?:RequestInit)=>Response.json(meta));vi.stubGlobal('fetch',api);render(<VctexIntegrationTab promoterId="p-a"/>);await screen.findByText('Reconhecido');fireEvent.click(screen.getByRole('button',{name:'Diagnóstico de autenticação pela Oracle'}));await waitFor(()=>expect(api).toHaveBeenCalledTimes(3));const writes=api.mock.calls.filter(c=>(c as any)[1]?.method==='POST');expect(writes).toHaveLength(1);expect(writes[0][0]).toBe('/api/integrations/vctex/diagnostic?promoterId=p-a');expect(screen.queryByText('synthetic-access-token-not-real')).toBeNull();
});
it('does not expose an administrative form on denied configuration access',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'PRIVATE'},{status:403})));render(<VctexIntegrationTab promoterId="p-a"/>);await screen.findByRole('alert');expect(screen.queryByLabelText('Senha')).toBeNull();expect(screen.queryByRole('button',{name:'Diagnóstico de autenticação pela Oracle'})).toBeNull();
});
it('aborts an old promoter read and ignores its late response',async()=>{
 let finish!:(r:Response)=>void;const api=vi.fn((url:string)=>url.includes('p-a')?new Promise<Response>(r=>{finish=r;}):Promise.resolve(Response.json({...meta,enabled:false,hasCredentials:false,lastDiagnostic:null})));
 vi.stubGlobal('fetch',api);const view=render(<VctexIntegrationTab promoterId="p-a"/>);const signal=(api.mock.calls[0] as any)[1].signal;view.rerender(<VctexIntegrationTab promoterId="p-b"/>);expect(signal.aborted).toBe(true);await screen.findByText('Não configurada');finish(Response.json(meta));await Promise.resolve();expect(screen.queryByText('Reconhecido')).toBeNull();expect(screen.getByText('Desabilitada')).toBeTruthy();
});
