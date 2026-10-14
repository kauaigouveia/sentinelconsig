/// <reference types="vite/client" />
/* Standalone development harness. Never imported by the authenticated application. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/sentinel-2-preview.css';
import '../../src/styles/sentinel-2-modules.css';
import '../../src/styles/sentinel-2-production.css';
import '../../src/styles/sentinel-2-dialogs.css';
import '../../src/styles/sentinel-2-finishing.css';

if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(location.hostname)) {
  throw new Error('This visual harness is restricted to local development');
}
const {StorageService} = await import('../../src/services/storageService');
const partners = [{id:'visual-partner', login:'DEMO', fullName:'Parceiro de demonstração', active:true}];
const users = [{id:'visual-user', name:'Atendente de demonstração', role:'MASTER', customPermissions:[]}];
const simulations = Array.from({length:4},(_,index)=>({id:`visual-${index}`,cpf:'00000000000',partnerId:'visual-partner',createdById:'visual-user',simulationType:'PORT_REFIN',operationType:'PORT_REFIN',status:index===3?'DIGITADA PELA MESA':'SIMULAÇÃO ENVIADA',createdAt:new Date(Date.now()-index*3600000).toISOString(),selectedCondition:{amount:2500+index*1000},matchedProposalNumber:index===3?'DEMO-004':undefined}));
StorageService.getActiveUser = () => users[0] as any;
StorageService.getCurrentTenant = () => null;
StorageService.getPartners = () => partners as any;
StorageService.getUsers = () => users as any;
StorageService.getProducts = () => [];
StorageService.getConvenios = () => [{id:'visual-convenio',name:'INSS',active:true}] as any;
const statuses = [{id:'visual-status',name:'Aguardar retorno CIP',code:'AGUARDAR_RETORNO_CIP',active:true,manualChangeAllowed:true,color:'#06b6d4',responsible:'BANCO'},{id:'visual-next',name:'Aguardar formalização',code:'FORMAL',active:true,manualChangeAllowed:true,color:'#8b5cf6',responsible:'CLIENTE'}];
const clients = [{id:'visual-client',fullName:'Cliente inteiramente fictício',cpf:'00000000000'}];
const proposals = [1,2,3].map(index=>({id:`visual-proposal-${index}`,proposalNumber:`DEMO-${index}`,clientId:'visual-client',clientCpf:'00000000000',bankId:'visual-bank',productId:'visual-product',partnerId:'visual-partner',statusId:statuses[index===3?1:0].id,type:'PORTABILIDADE',disbursedValue:2500+index*1000,contractBalance:15000,installmentValue:250,installmentsCount:84,currentResponsible:'BANCO',createdAt:'2026-10-14T12:00:00Z'}));
StorageService.getProposals = () => proposals as any;
StorageService.getClients = () => clients as any;
StorageService.getBanks = () => [{id:'visual-bank',name:'Banco fictício',active:true}] as any;
StorageService.getProducts = () => [{id:'visual-product',name:'INSS · Portabilidade',active:true}] as any;
StorageService.getPromoters = () => [{id:'visual-promoter',name:'Promotora fictícia',active:true}] as any;
StorageService.getPromotersForBank = () => StorageService.getPromoters();
StorageService.getProductsForConvenio = () => StorageService.getProducts();
StorageService.getStatuses = () => statuses as any;
StorageService.fetchAndSyncStatuses = async () => statuses as any;
StorageService.getHistory = () => [];
StorageService.getDocumentsByClient = () => [];
StorageService.getCommunicationsByClient = () => [];
StorageService.getHolidays = () => [];
StorageService.getConfig = () => ({}) as any;
StorageService.getCurrentTenantId = () => 'isolated-visual-harness';
const {realtimeHub} = await import('../../src/services/realtimeService');
realtimeHub.connect = () => {};
realtimeHub.subscribe = () => () => {};
window.fetch = async (input, options) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (options?.method && options.method !== 'GET') throw new Error('Escrita bloqueada nesta revisão local');
  const payloads: Record<string,unknown> = {'/api/simulations':simulations,'/api/partners':partners,'/api/users':users,'/api/products':[],'/api/convenios':[],'/api/settings/simulation-access':{happySimulationAccessEnabled:false},'/api/integrations/finanto/config':{enabled:false},'/api/integrations/nossa-fintech/config':{enabled:false},'/api/simulation-spreadsheets/active?bank=DAYCOVAL':null};
  if (['/api/daycoval','/api/c6-spreadsheet','/api/parana-spreadsheet'].includes(path)) return new Response(JSON.stringify({fileName:'Arquivo fictício para revisão visual.xlsx',versionDate:'2026-10-14',terms:[108,96,84],ratePolicies:[]}),{status:200,headers:{'Content-Type':'application/json'}});
  if (path === '/api/financial') return new Response(JSON.stringify([{id:'visual-entry',title:'Receita fictícia',type:'ENTRADA',amount:1500,category:'SERVICO',status:'REALIZADO',dueDate:'2026-10-14',paymentDate:'2026-10-14'}]),{status:200,headers:{'Content-Type':'application/json'}});
  if (/^\/api\/clients\/visual-client\/(notes|communications)$/.test(path)) return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});
  if (path.startsWith('/api/pendencies')) return new Response(JSON.stringify(path.endsWith('/metrics')?{total:0,abertas:0,emAtendimento:0}:{items:[],total:0}),{status:200,headers:{'Content-Type':'application/json'}});
  if (path === '/api/admin/overview') return new Response(JSON.stringify({activeUsersCount:1,usersCount:1,productsCount:1,conveniosCount:1,openPendenciesCount:0,pendenciesCount:0,auditIntegrityStatus:'VALID'}),{status:200,headers:{'Content-Type':'application/json'}});
  if (path.startsWith('/api/automations')) return new Response(JSON.stringify(path.endsWith('/catalog')?{triggers:[],actions:[],operators:[]}:path.endsWith('/metrics')?null:[]),{status:200,headers:{'Content-Type':'application/json'}});
  if (path.startsWith('/api/intelligence/')) return new Response(JSON.stringify(path.endsWith('/overview')?{summary:{newInsights:0,criticalInsights:0,correlationsCount:0,bottlenecksCount:0},topAnomalies:[],topCorrelations:[]}:path.endsWith('/metrics')?null:[]),{status:200,headers:{'Content-Type':'application/json'}});
  if (!(path in payloads)) throw new Error(`Rede bloqueada: ${path}`);
  return new Response(JSON.stringify(payloads[path]), {status:200,headers:{'Content-Type':'application/json'}});
};
const {SimulationView} = await import('../../src/components/simulation/SimulationView');
const {ProductionList} = await import('../../src/components/production/ProductionList');
const {KanbanBoard} = await import('../../src/components/production/KanbanBoard');
const {Client360View} = await import('../../src/components/clients/Client360View');
const {PortabilityView} = await import('../../src/components/production/PortabilityView');
const {CentralPendencias} = await import('../../src/components/admin/CentralPendencias');
const {GeneralFinanceView} = await import('../../src/components/finance/GeneralFinanceView');
const {NewProductionModal} = await import('../../src/components/production/NewProductionModal');
const {CentralAdministracao} = await import('../../src/components/admin/CentralAdministracao');
const {CentralAutomacoes} = await import('../../src/components/admin/CentralAutomacoes');
const {SentinelIntelligenceDashboard} = await import('../../src/components/intelligence/SentinelIntelligenceDashboard');
function LocalReview() {
  const [dark,setDark] = useState(true);
  const [premium,setPremium] = useState(true);
  const [module,setModule] = useState('Simulações');
  const [newProposal,setNewProposal] = useState(false);
  document.documentElement.classList.toggle('dark',dark);
  return <main className={premium?'s2-root':'sentinel-app'} style={{minHeight:'100vh',padding:24,background:dark?'#080f1e':'#f1f5fc'}}>
    <header style={{display:'flex',gap:16,alignItems:'center',marginBottom:24,color:dark?'#f8fafc':'#14243b'}}>
      <strong>REVISÃO LOCAL · Dados fictícios · Sem autenticação</strong>
      <button onClick={()=>setDark(!dark)}>Alternar tema</button>
      <button onClick={()=>setPremium(!premium)}>Comparar {premium?'legado':'V2'}</button>
      <span>Rede externa e gravações bloqueadas</span>
    </header>
    <nav aria-label="Módulos da revisão local" style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>{['Propostas','Simulações','Kanban','Clientes 360°','CIP','Pendências','Financeiro','Administração','Automações','Intelligence'].map(name=><button key={name} aria-pressed={module===name} onClick={()=>setModule(name)} style={{padding:'8px 14px',border:'1px solid #64748b',borderRadius:8,color:dark?'#f8fafc':'#14243b',background:module===name?(dark?'#1b2e48':'#dbeafe'):'transparent'}}>{name}</button>)}</nav>
    <div data-ui-family={premium ? module==='Administração'?'administration':module==='Automações'?'automation':module==='Intelligence'?'analytics':undefined : undefined}>
    {module==='Propostas' && <ProductionList premium={premium} onOpenNewProduction={()=>setNewProposal(true)} onKanban={()=>setModule('Kanban')} />}
    {module==='Simulações' && <SimulationView premium={premium} />}
    {module==='Kanban' && <KanbanBoard premium={premium} />}
    {module==='Clientes 360°' && <Client360View premium={premium} />}
    {module==='CIP' && <PortabilityView premium={premium} />}
    {module==='Pendências' && <CentralPendencias premium={premium} />}
    {module==='Financeiro' && <GeneralFinanceView premium={premium} />}
    {module==='Administração' && <CentralAdministracao premium={premium} />}
    {module==='Automações' && <CentralAutomacoes />}
    {module==='Intelligence' && <SentinelIntelligenceDashboard />}
    </div>
    <NewProductionModal isOpen={newProposal} onClose={()=>setNewProposal(false)} onSuccess={()=>{}} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<LocalReview />);
