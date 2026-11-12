import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Menu, Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { RouterProvider } from './router';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PreviewSidebar } from './components/redesign/PreviewSidebar';
import { WorkspaceHome } from './components/redesign/WorkspaceHome';
import { galleryRows } from './components/redesign/galleryFixtures';
import { installPreviewEnvironment } from './components/redesign/previewEnvironment';
import { visibleNavigation } from './components/redesign/navigation';
import { operationalFamily } from './components/redesign/operationalFamilies';
import { ToastContainer } from './components/ui/ToastContainer';
import './index.css';
import './styles/sentinel-2-preview.css';
import './styles/sentinel-2-production.css';
import './styles/sentinel-2-modules.css';
import './styles/sentinel-2-dialogs.css';
import './styles/sentinel-2-finishing.css';
import './styles/workspace-refresh.css';
import './styles/internal-workspaces.css';

installPreviewEnvironment();
const lazyNamed = (loader: () => Promise<any>, name: string) => React.lazy(() => loader().then(module => ({default: module[name] as React.ComponentType<any>})));
const ExecutiveBIDashboard = lazyNamed(() => import('./components/bi/ExecutiveBIDashboard'), 'ExecutiveBIDashboard');
const ControlTower = lazyNamed(() => import('./components/dashboard/ControlTower'), 'ControlTower');
const StatusBottleneckReport = lazyNamed(() => import('./components/dashboard/StatusBottleneckReport'), 'StatusBottleneckReport');
const DigitizerHome = lazyNamed(() => import('./components/dashboard/DigitizerHome'), 'DigitizerHome');
const ProductionList = lazyNamed(() => import('./components/production/ProductionList'), 'ProductionList');
const KanbanBoard = lazyNamed(() => import('./components/production/KanbanBoard'), 'KanbanBoard');
const PortabilityView = lazyNamed(() => import('./components/production/PortabilityView'), 'PortabilityView');
const Client360View = lazyNamed(() => import('./components/clients/Client360View'), 'Client360View');
const SupportCenter = lazyNamed(() => import('./components/support/SupportCenter'), 'SupportCenter');
const CentralAtendimentoView = lazyNamed(() => import('./components/support/CentralAtendimentoView'), 'CentralAtendimentoView');
const PartnerPortalLayout = lazyNamed(() => import('./components/partner-portal/PartnerPortalLayout'), 'PartnerPortalLayout');
const PartnerManagement = lazyNamed(() => import('./components/admin/PartnerManagement'), 'PartnerManagement');
const BankPromoterManagement = lazyNamed(() => import('./components/admin/BankPromoterManagement'), 'BankPromoterManagement');
const ProductManagement = lazyNamed(() => import('./components/admin/ProductManagement'), 'ProductManagement');
const StatusManagement = lazyNamed(() => import('./components/admin/StatusManagement'), 'StatusManagement');
const HolidayManagement = lazyNamed(() => import('./components/admin/HolidayManagement'), 'HolidayManagement');
const AuditLogView = lazyNamed(() => import('./components/admin/AuditLogView'), 'AuditLogView');
const UserManagement = lazyNamed(() => import('./components/admin/UserManagement'), 'UserManagement');
const StatusImport = lazyNamed(() => import('./components/admin/StatusImport'), 'StatusImport');
const BankPlaybooksView = lazyNamed(() => import('./components/simulation/BankPlaybooksView'), 'BankPlaybooksView');
const SimulationView = lazyNamed(() => import('./components/simulation/SimulationView'), 'SimulationView');
const TVOperationsMonitor = lazyNamed(() => import('./components/monitor/TVOperationsMonitor'), 'TVOperationsMonitor');
const CommercialRadarView = lazyNamed(() => import('./components/bi/CommercialRadarView'), 'CommercialRadarView');
const OperationalAgendaView = lazyNamed(() => import('./components/agenda/OperationalAgendaView'), 'OperationalAgendaView');
const MyTaskQueueView = lazyNamed(() => import('./components/agenda/MyTaskQueueView'), 'MyTaskQueueView');
const GamificationCenter = lazyNamed(() => import('./components/gamification/GamificationCenter'), 'GamificationCenter');
const GeneralFinanceView = lazyNamed(() => import('./components/finance/GeneralFinanceView'), 'GeneralFinanceView');
const PlatformMasterCentral = lazyNamed(() => import('./components/saas/PlatformMasterCentral'), 'PlatformMasterCentral');
const TenantSaaSCapacityView = lazyNamed(() => import('./components/admin/TenantSaaSCapacityView'), 'TenantSaaSCapacityView');
const AnnouncementsManagement = lazyNamed(() => import('./components/admin/AnnouncementsManagement'), 'AnnouncementsManagement');
const OperationsCentral = lazyNamed(() => import('./components/operations/OperationsCentral'), 'OperationsCentral');
const UniversalCommandPalette = lazyNamed(() => import('./components/search/UniversalCommandPalette'), 'UniversalCommandPalette');
const BankIntegrationsView = lazyNamed(() => import('./components/integrations/BankIntegrationsView'), 'BankIntegrationsView');
const CentralAdministracao = lazyNamed(() => import('./components/admin/CentralAdministracao'), 'CentralAdministracao');
const CentralPendencias = lazyNamed(() => import('./components/admin/CentralPendencias'), 'CentralPendencias');
const CentralAutomacoes = lazyNamed(() => import('./components/admin/CentralAutomacoes'), 'CentralAutomacoes');
const HubIntegracoes = lazyNamed(() => import('./components/admin/HubIntegracoes'), 'HubIntegracoes');
const SentinelIntelligenceDashboard = lazyNamed(() => import('./components/intelligence/SentinelIntelligenceDashboard'), 'SentinelIntelligenceDashboard');
const CommandCenterView = lazyNamed(() => import('./components/CommandCenter/CommandCenterView'), 'CommandCenterView');
const NewProductionModal = lazyNamed(() => import('./components/production/NewProductionModal'), 'NewProductionModal');
const ExcelImportModal = lazyNamed(() => import('./components/production/ExcelImportModal'), 'ExcelImportModal');
const ExcelExportModal = lazyNamed(() => import('./components/production/ExcelExportModal'), 'ExcelExportModal');
const TestRunnerModal = lazyNamed(() => import('./components/admin/TestRunnerModal'), 'TestRunnerModal');
const ProposalDetailModal = lazyNamed(() => import('./components/production/ProposalDetailModal'), 'ProposalDetailModal');
const NotificationsDrawer = lazyNamed(() => import('./components/layout/NotificationsDrawer'), 'NotificationsDrawer');
const CommandPaletteModal = lazyNamed(() => import('./components/common/CommandPaletteModal'), 'CommandPaletteModal');
const KeyboardShortcutsModal = lazyNamed(() => import('./components/common/KeyboardShortcutsModal'), 'KeyboardShortcutsModal');
const BackupManagementModal = lazyNamed(() => import('./components/admin/BackupManagementModal'), 'BackupManagementModal');
const WhiteLabelModal = lazyNamed(() => import('./components/admin/WhiteLabelModal'), 'WhiteLabelModal');
const InteractiveTourModal = lazyNamed(() => import('./components/common/InteractiveTourModal'), 'InteractiveTourModal');
const LoginView = lazyNamed(() => import('./components/auth/LoginView'), 'LoginView');
const TenantSelectionView = lazyNamed(() => import('./components/auth/TenantSelectionView'), 'TenantSelectionView');
const ForcePasswordChangeModal = lazyNamed(() => import('./components/auth/ForcePasswordChangeModal'), 'ForcePasswordChangeModal');
const screens: Record<string, React.ComponentType<any>> = {
  producao: ProductionList, simulacoes: SimulationView, clientes: Client360View, esteira: KanbanBoard,
  portabilidades: PortabilityView, parceiros: PartnerManagement, 'central-atendimento': CentralAtendimentoView,
  suporte: SupportCenter, 'financeiro-geral': GeneralFinanceView, 'central-administracao': CentralAdministracao,
  'central-pendencias': CentralPendencias, 'hub-integracoes': HubIntegracoes, 'integracoes-hub': HubIntegracoes,
  'central-automacao': CentralAutomacoes, automacoes: CentralAutomacoes,
  'admin-usuarios': UserManagement, 'admin-produtos': ProductManagement, 'admin-status': StatusManagement,
  'admin-calendario': HolidayManagement, 'admin-auditoria': AuditLogView, 'admin-comunicados': AnnouncementsManagement,
  'admin-import-status': StatusImport, 'admin-bancos': BankPromoterManagement, promotoras: BankPromoterManagement,
  'admin-c6-bank': BankIntegrationsView, 'admin-integracoes-bancos': BankIntegrationsView,
  'agenda-operacional': OperationalAgendaView, 'minha-fila': MyTaskQueueView, 'central-operacoes': OperationsCentral,
  'dashboard-executivo': ExecutiveBIDashboard, 'radar-comercial': CommercialRadarView, 'relatorio-gargalos': StatusBottleneckReport,
  'sentinela-ai': SentinelIntelligenceDashboard, 'sentinel-intelligence': SentinelIntelligenceDashboard,
  'command-center': CommandCenterView, gamificacao: GamificationCenter, roteiros: BankPlaybooksView,
  'saas-tenants': PlatformMasterCentral, 'admin-plano-consumo': TenantSaaSCapacityView, 'tv-monitor': TVOperationsMonitor,
};
const available = visibleNavigation('MASTER');
const readPath = () => new URLSearchParams(window.location.search).get('view') || '/';
function WorkspacePreview() {
  const { isDark, toggleTheme, setTheme } = useTheme();
  const [path, setPath] = useState(readPath);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<'new' | 'import' | null>(() => new URLSearchParams(window.location.search).get('modal') === 'new' ? 'new' : null);
  const [proposal, setProposal] = useState<string | null>(null);
  const previewTheme = new URLSearchParams(window.location.search).get('theme');
  useEffect(() => {if (previewTheme === 'light' || previewTheme === 'dark') setTheme(previewTheme);}, [previewTheme]);
  useEffect(() => {const pop = () => setPath(readPath());window.addEventListener('popstate', pop);return () => window.removeEventListener('popstate',pop);}, []);
  const navigate = (next: string) => {
    const route = available.find(item => item.path === next || item.viewId === next);
    if (!route) return;
    setPath(route.path);setMobileOpen(false);
    const url = new URL(window.location.href);url.searchParams.set('view',route.path);window.history.pushState({},'',url);
  };
  const route = available.find(item => item.path === path);
  const Screen = route ? screens[route.viewId] : undefined;
  return <div className="sentinel-app s2-root internal-full-preview flex w-screen overflow-hidden">
    <PreviewSidebar role="MASTER" path={path} navigate={navigate} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)}/>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="sentinel-header flex items-center justify-between gap-4"><div className="flex items-center gap-3"><button className="workspace-secondary workspace-preview-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu size={18}/></button><strong>{route?.title || 'Meu espaço'}</strong></div><div className="flex items-center gap-3"><span className="text-xs">Prévia · dados fictícios · gravações desativadas</span><button className="workspace-secondary" onClick={toggleTheme} aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>{isDark ? <Sun size={18}/> : <Moon size={18}/>}</button></div></header>
      <main className="sentinel-main min-h-0 flex-1 overflow-y-auto"><div className="sentinel-view-body" data-ui-module={route?.viewId} data-ui-family={route ? operationalFamily(route.viewId) : undefined}>
        <ErrorBoundary key={path}><React.Suspense fallback={<div className="workspace-empty">Carregando tela…</div>}>
          {path === '/' ? <WorkspaceHome rows={galleryRows} bottlenecks={null} role="MASTER" name="Ana Demonstração" navigate={navigate} openProposal={setProposal} newProposal={() => setModal('new')}/> : Screen ? <Screen premium onNavigate={navigate} onNavigateToView={navigate} onKanban={() => navigate('/esteira')} onOpenNewProduction={() => setModal('new')} onOpenImportExcel={() => setModal('import')} onOpenProposalDetail={setProposal}/> : <div className="workspace-empty">Selecione uma área no menu.</div>}
        </React.Suspense></ErrorBoundary>
      </div></main>
    </div>
    <React.Suspense fallback={null}>
      {modal === 'new' && <NewProductionModal isOpen onClose={() => setModal(null)} onSuccess={() => setModal(null)}/>}
      {modal === 'import' && <ExcelImportModal isOpen onClose={() => setModal(null)} onImportSuccess={() => setModal(null)}/>}
      {proposal && <ProposalDetailModal proposalId={proposal} onClose={() => setProposal(null)} onProposalUpdated={() => {}}/>}
    </React.Suspense><ToastContainer/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><RouterProvider><WorkspacePreview/></RouterProvider></ThemeProvider>);