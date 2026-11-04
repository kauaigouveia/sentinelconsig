// @vitest-environment jsdom
import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {HubIntegracoes} from '../src/components/admin/HubIntegracoes';
vi.mock('../src/components/integrations/BankIntegrationsView',()=>({BankIntegrationsView:(props:any)=><div data-testid="connection">{props.initialTab}:{String(props.embedded)}</div>}));
vi.mock('../src/components/integrations/FinantoIntegrationTab',()=>({FinantoIntegrationTab:()=>null}));
vi.mock('../src/components/integrations/NossaFintechIntegrationTab',()=>({NossaFintechIntegrationTab:()=>null}));
vi.mock('../src/components/integrations/TelegramIntegrationSettings',()=>({TelegramIntegrationSettings:()=>null}));
vi.mock('../src/services/storageService',()=>({StorageService:{getCurrentTenantId:()=> 'synthetic-company'}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('counts enabled independently from online and opens one embedded bank configuration',async()=>{
 const names=['c6','facta','bmg','happy','finanto','nossa-fintech','workbank','parana','presenca','v8','vctex'];
 const integrations=names.map(slug=>({id:slug,slug,name:slug,code:slug,environment:'production',active:['c6','v8'].includes(slug),configured:['c6','v8'].includes(slug),status:slug==='c6'?'ONLINE':slug==='v8'?'ATTENTION':'DISABLED',capabilities:[],maskedBaseUrl:'https://example.test/***'}));
 const read=vi.fn(async()=>new Response(JSON.stringify({timestamp:new Date().toISOString(),overallStatus:'ATTENTION',integrations,summary:{total:11,online:1,attention:1,offline:0,disabled:9,errors24h:0}}),{status:200}));vi.stubGlobal('fetch',read);
 render(<HubIntegracoes/>);
 await screen.findByText('2 configuradas');
 const metric=screen.getByText('INTEGRAÇÕES HABILITADAS').parentElement!.nextElementSibling!;expect(metric.textContent).toMatch(/2.*11/);
 fireEvent.change(screen.getByRole('combobox',{name:'Integração bancária'}),{target:{value:'v8'}});
 expect(screen.getByTestId('connection').textContent).toBe('v8:true');
 expect(read).toHaveBeenCalledTimes(1);expect((read.mock.calls as any)[0][0]).toBe('/api/integrations/health');expect((read.mock.calls as any)[0][1].method).toBeUndefined();
});
it('never presents a failed catalog request as zero configured banks',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));render(<HubIntegracoes/>);
 await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toContain('Catálogo indisponível');expect(screen.queryByText('0 configuradas')).toBeNull();
});
