import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StorageService } from './services/storageService';
import { BackupService } from './services/backupService';
import { realtimeHub } from './services/realtimeService';
import { PreviewSidebar } from './components/redesign/PreviewSidebar';
import { WorkTabs } from './components/redesign/WorkTabs';
import { PreviewDashboard } from './components/redesign/PreviewDashboard';
import { PreviewSearch } from './components/redesign/PreviewSearch';
import { usePreviewData } from './components/redesign/PreviewData';
import { useTaskSearch } from './components/redesign/useTaskSearch';
import { operationalFamily } from './components/redesign/operationalFamilies';
import { rememberDevelopmentPresentation } from './components/redesign/developmentPresentation';
import { initialPresentation } from './components/redesign/productionPresentation';
import './styles/sentinel-2-preview.css';
import './styles/sentinel-2-production.css';
import './styles/sentinel-2-modules.css';
import './styles/sentinel-2-dialogs.css';
import './styles/sentinel-2-finishing.css';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { WorkspaceToolbar } from './components/layout/WorkspaceToolbar';
import { RouteContextPanel } from './components/layout/RouteContextPanel';
import { useWorkspacePreferences, workspaceKey } from './hooks/useWorkspacePreferences';
import { useTenantBranding } from './hooks/useTenantBranding';
import { resolveAuthenticatedBranding } from './lib/branding';
import { InstitutionalFooter } from './components/layout/InstitutionalFooter';

import { ResponsibleAlçada, User } from './types';
import { Maximize2, Minimize2, Plus, Search, Keyboard } from 'lucide-react';
import { Breadcrumbs } from './components/ui/Breadcrumbs';
import { ToastContainer } from './components/ui/ToastContainer';
import { toastService } from './components/ui/toastService';
import { hasPermission } from './lib/permissions';

import { RouterProvider, useRouter } from './router';
import { canAccessRoute } from './router/routes';
import { AccessDeniedView } from './components/common/AccessDeniedView';
import { NotFoundView } from './components/common/NotFoundView';

const lazyNamed = (loader: () => Promise<any>, exportName: string) =>
  React.lazy(() => loader().then(module => ({ default: module[exportName] as React.ComponentType<any> })));

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

function AppMainContent() {
  const [newUI, setNewUI] = useState(() => initialPresentation((import.meta as any).env.DEV, (import.meta as any).env.VITE_SENTINEL_UI_MODE, window.location.search));
  useEffect(() => { if ((import.meta as any).env.DEV) rememberDevelopmentPresentation(newUI); }, [newUI]);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(true);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [adminContext, setAdminContext] = useState<{ targetTenantId: string; targetTenantName: string } | null>(null);
  const { branding: publicBranding } = useTenantBranding();
  const brandingTenant = StorageService.getTenants().find(tenant => tenant.id === (adminContext?.targetTenantId || StorageService.getCurrentTenantId() || activeUser?.tenantId)) || null;
  const branding = resolveAuthenticatedBranding(publicBranding, isAuthenticated, brandingTenant, StorageService.getWhiteLabel());

  // Router context for URL-driven navigation and deep linking
  const {
    pathname,
    search,
    params,
    activeRoute,
    currentView: routerViewId,
    is404,
    navigate,
    redirectTarget,
    setRedirectTarget,
  } = useRouter();

  const preferenceKey = workspaceKey(adminContext?.targetTenantId || StorageService.getCurrentTenantId() || activeUser?.tenantId, activeUser?.id);
  useEffect(() => {
    if (!(import.meta as any).env.DEV) setNewUI(initialPresentation(false, (import.meta as any).env.VITE_SENTINEL_UI_MODE, ''));
  }, [preferenceKey, activeUser?.role]);
  const workspace = useWorkspacePreferences(preferenceKey);
  const preview = usePreviewData(`${preferenceKey}:${activeUser?.role}:${(activeUser?.customPermissions || []).join(',')}`, newUI && isAuthenticated && !pathname.startsWith('/parceiro'));
  useEffect(() => {
    if (isAuthenticated && activeUser && activeRoute && !activeRoute.isDynamic && canAccessRoute(activeRoute, activeUser.role, activeUser.customPermissions || [])) workspace.recordRoute(activeRoute.path);
  }, [isAuthenticated, activeRoute?.path, activeUser?.id, preferenceKey, workspace.recordRoute]);

  // Validate server-side session as the ultimate authority via HttpOnly cookies
  const verifyServerSession = useCallback(async () => {
    setIsVerifyingSession(true);
    try {
      try {
        localStorage.removeItem('cg_session_token');
        sessionStorage.removeItem('cg_session_token');
      } catch {}

      const res = await fetch('/api/auth/session', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.authenticated && data.user) {
          StorageService.setActiveUser(data.user);
          setActiveUser(data.user);
          setAdminContext(data.adminContext || null);
          if (data.adminContext) {
            StorageService.setCurrentTenantId(data.adminContext.targetTenantId);
          } else {
            StorageService.setCurrentTenantId(data.user.tenantId || '');
          }
          localStorage.setItem('cg_is_authenticated', 'true');
          setIsAuthenticated(true);
          StorageService.fetchAndSyncStatuses().catch(() => {});
          StorageService.fetchAndSyncOperationalCalendar().catch(err => {
            console.warn('[CALENDAR SYNC] Não foi possível sincronizar o calendário operacional:', err);
          });
          return;
        }
      }

      console.warn('[AUTH FAIL-CLOSED] Sessão server-side inexistente ou inválida. Forçando logout.');
      StorageService.clearBusinessCache();
      localStorage.setItem('cg_is_authenticated', 'false');
      setIsAuthenticated(false);
      setActiveUser(null);
      setAdminContext(null);
    } catch (err) {
      console.warn('[AUTH FAIL-CLOSED] Erro de conexão/servidor ao validar sessão:', err);
      localStorage.setItem('cg_is_authenticated', 'false');
      setIsAuthenticated(false);
      setActiveUser(null);
      setAdminContext(null);
    } finally {
      setIsVerifyingSession(false);
    }
  }, []);

  useEffect(() => {
    verifyServerSession();
  }, [verifyServerSession]);

  // Listen for storage / login state updates and initialize/sync data
  useEffect(() => {
    StorageService.initialize();

    const handleStorageUpdate = () => {
      const auth = StorageService.isAuthenticated();
      setIsAuthenticated(auth);
      if (auth) {
        const user = StorageService.getActiveUser();
        setActiveUser(user);
        if (user) realtimeHub.setUserContext(user.id);
        realtimeHub.connect(StorageService.getCurrentTenantId());
      } else {
        setActiveUser(null);
        realtimeHub.disconnect();
      }
    };
    window.addEventListener('credit_gestao_storage_update', handleStorageUpdate);

    if (StorageService.isAuthenticated()) {
      const user = StorageService.getActiveUser();
      if (user) realtimeHub.setUserContext(user.id);
      realtimeHub.connect(StorageService.getCurrentTenantId());
    }

    const unsubscribeRealtime = realtimeHub.subscribe('*', (event) => {
      if (event?.type === 'TENANT_SUSPENDED') {
        console.warn('[REALTIME] Tenant suspenso via Pusher. Revalidando sessão server-side...');
        verifyServerSession();
        return;
      }
      if (event?.type === 'TENANT_SETTINGS_UPDATED' && event?.entityId === 'operational-calendar') {
        StorageService.fetchAndSyncOperationalCalendar().catch(err => {
          console.warn('[REALTIME] Erro ao sincronizar calendário operacional:', err);
        });
        return;
      }
      if (event && event.entity) {
        StorageService.syncSpecificEntity(event.entity, event.entityId).catch((err) => {
          console.warn('[REALTIME] Erro no sync targeted:', err);
        });
      } else {
        StorageService.syncWithPostgreSQL().catch((err) => {
          console.warn('[REALTIME] Erro no sync global fallback:', err);
        });
      }
    });

    return () => {
      window.removeEventListener('credit_gestao_storage_update', handleStorageUpdate);
      unsubscribeRealtime();
      realtimeHub.disconnect();
    };
  }, [verifyServerSession]);

  // Synchronize document.title by effective tenant (Fixed across all routes: ${tenantName} | Sentinel Consig)
  useEffect(() => {
    const effectiveTenantName =
      (activeUser?.role === 'PLATFORM_MASTER' && adminContext?.targetTenantName)
        ? adminContext.targetTenantName
        : branding?.companyName || StorageService.getCurrentTenant()?.name || 'Sentinel Consig';

    if (typeof document !== 'undefined') {
      document.title = `${effectiveTenantName} | Sentinel Consig`;
    }
  }, [activeUser, adminContext, branding]);

  // Compute effective view:
  // If at root or dashboard, respect role default (e.g. DIGITADOR -> home-digitador)
  // Otherwise use route's viewId
  const effectiveView = useMemo(() => {
    if (pathname === '/' || pathname === '/dashboard') {
      if (activeUser?.role === 'DIGITADOR') return 'home-digitador';
      if (activeUser?.role === 'SUPORTE') return 'suporte';
      if (activeUser?.role === 'SIMULACAO') return 'simulacoes';
      return 'torre-controle';
    }
    return routerViewId;
  }, [pathname, routerViewId, activeUser?.role]);

  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [productionFilter, setProductionFilter] = useState<{
    statusId?: string;
    alçada?: ResponsibleAlçada;
    bankId?: string;
    promoterId?: string;
    productId?: string;
    digitizerId?: string;
  } | null>(null);

  // Focus mode state (maximizes table and hide chrome)
  const [isFocusMode, setIsFocusMode] = useState(false);

  useEffect(() => {
    if (!isMobileNavigationOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileNavigationOpen(false);
    };
    const handleDesktopViewport = () => {
      if (window.matchMedia('(min-width: 768px)').matches) setIsMobileNavigationOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleDesktopViewport);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleDesktopViewport);
    };
  }, [isMobileNavigationOpen]);

  // Modals state
  const [isNewProductionOpen, setIsNewProductionOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isUniversalSearchOpen, setIsUniversalSearchOpen] = useState(false);
  const taskSearch = useTaskSearch(`${preferenceKey}:${activeUser?.role}:${(activeUser?.customPermissions || []).join(',')}`, newUI && isAuthenticated && isUniversalSearchOpen && hasPermission(activeUser?.role, activeUser?.customPermissions, 'tasks.view'));
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isWhiteLabelModalOpen, setIsWhiteLabelModalOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

  const canCreateProposals = hasPermission(
    activeUser?.role,
    activeUser?.customPermissions,
    'proposals.create'
  );
  const canViewProposals = hasPermission(
    activeUser?.role,
    activeUser?.customPermissions,
    'proposals.view'
  );
  const openNewProduction = useCallback(() => {
    if (!canCreateProposals) {
      toastService.error('Seu perfil não tem permissão para criar propostas.');
      return;
    }
    setIsNewProductionOpen(true);
  }, [canCreateProposals]);
  const openProposalImport = useCallback(() => {
    if (!canCreateProposals) {
      toastService.error('Seu perfil não tem permissão para importar propostas.');
      return;
    }
    setIsImportExcelOpen(true);
  }, [canCreateProposals]);
  const openProposalExport = useCallback(() => {
    if (!canViewProposals) {
      toastService.error('Seu perfil não tem permissão para consultar propostas.');
      return;
    }
    setIsExportOpen(true);
  }, [canViewProposals]);

  // Deep linking support for /propostas/:id
  useEffect(() => {
    if (params.id && effectiveView === 'producao') {
      if (detailProposalId !== params.id) {
        setDetailProposalId(params.id);
      }
    }
  }, [params.id, effectiveView, detailProposalId]);

  // Run scheduled backup check and first-time tour check on startup
  useEffect(() => {
    BackupService.checkAndExecuteScheduledBackup();

    try {
      const tourSeen = localStorage.getItem('cg_tour_completed');
      if (!tourSeen) {
        setIsTourOpen(true);
      }
    } catch {}
  }, []);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsUniversalSearchOpen(prev => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault();
        openNewProduction();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setProductionFilter(null);
        navigate('/propostas');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        navigate('/esteira');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
          searchInput.focus();
        } else {
          setIsUniversalSearchOpen(true);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault();
        setIsBackupModalOpen(true);
        return;
      }

      if (
        (e.altKey && (e.key === 'f' || e.key === 'F')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B') && !e.shiftKey)
      ) {
        e.preventDefault();
        setIsFocusMode(prev => !prev);
        return;
      }

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (isUniversalSearchOpen) setIsUniversalSearchOpen(false);
        else if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
        else if (isShortcutsOpen) setIsShortcutsOpen(false);
        else if (isBackupModalOpen) setIsBackupModalOpen(false);
        else if (isNewProductionOpen) setIsNewProductionOpen(false);
        else if (isImportExcelOpen) setIsImportExcelOpen(false);
        else if (isExportOpen) setIsExportOpen(false);
        else if (isTestRunnerOpen) setIsTestRunnerOpen(false);
        else if (isNotificationsOpen) setIsNotificationsOpen(false);
        else if (detailProposalId) {
          setDetailProposalId(null);
          if (params.id) {
            navigate('/propostas', { replace: true });
          }
        }
        else if (isFocusMode) setIsFocusMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isUniversalSearchOpen,
    isCommandPaletteOpen,
    isShortcutsOpen,
    isBackupModalOpen,
    isNewProductionOpen,
    isImportExcelOpen,
    isExportOpen,
    isTestRunnerOpen,
    isNotificationsOpen,
    detailProposalId,
    isFocusMode,
    navigate,
    params.id,
    openNewProduction,
  ]);

  // Main navigation handler: translates view or path to canonical URL navigation
  const handleNavigate = (viewOrPath: string, navParams?: any) => {
    if (viewOrPath === 'nova-producao') {
      openNewProduction();
      return;
    }
    if (viewOrPath === 'importar-excel' || viewOrPath === 'importacao') {
      openProposalImport();
      return;
    }
    if (viewOrPath === 'exportar-propostas' || viewOrPath === 'exportacao') {
      openProposalExport();
      return;
    }
    if (viewOrPath === 'admin-backup') {
      setIsBackupModalOpen(true);
      return;
    }

    if (viewOrPath === 'clients_360' || viewOrPath === 'clientes') {
      if (navParams?.cpf) {
        setGlobalSearchTerm(navParams.cpf);
      }
      navigate('/clientes');
      return;
    }

    if (viewOrPath === '/propostas' || viewOrPath === '/producao' || viewOrPath === 'producao') {
      setProductionFilter(null);
    }

    if (viewOrPath === 'proposals' && navParams?.proposalId) {
      setDetailProposalId(navParams.proposalId);
      navigate(`/propostas/${navParams.proposalId}`);
      return;
    }

    navigate(viewOrPath);
  };

  const handleGlobalSearch = (term: string) => {
    setGlobalSearchTerm(term);
    if (term.trim()) {
      navigate('/clientes');
    }
  };

  const handleNavigateToProductionWithFilter = (filter: {
    statusId?: string;
    alçada?: ResponsibleAlçada;
    bankId?: string;
    promoterId?: string;
    productId?: string;
    digitizerId?: string;
  }) => {
    setProductionFilter(filter);
    navigate('/propostas');
  };

  // Preserve requested destination if unauthenticated
  useEffect(() => {
    if (!isAuthenticated && !isVerifyingSession && pathname !== '/login') {
      if (!redirectTarget) {
        setRedirectTarget(`${pathname}${search}`);
      }
    }
  }, [isAuthenticated, isVerifyingSession, pathname, search, redirectTarget, setRedirectTarget]);

  // 0. Se a rota for do Portal do Parceiro (/parceiro/*), renderiza o layout isolado
  if (pathname === '/parceiro' || pathname.startsWith('/parceiro/')) {
    let initialTab: 'dashboard' | 'propostas' | 'atendimento' | 'perfil' = 'dashboard';
    if (pathname.startsWith('/parceiro/propostas')) initialTab = 'propostas';
    else if (pathname.startsWith('/parceiro/atendimento') || pathname.startsWith('/parceiro/suporte') || pathname.startsWith('/parceiro/chat')) initialTab = 'atendimento';
    else if (pathname.startsWith('/parceiro/perfil') || pathname.startsWith('/parceiro/cadastro')) initialTab = 'perfil';

    return (
      <React.Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando portal...</div>}>
        <PartnerPortalLayout initialTab={initialTab} />
      </React.Suspense>
    );
  }

  if (isVerifyingSession) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-slate-200 font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <span className="text-xs font-semibold tracking-wide text-slate-400">Verificando autenticação segura...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Carregando acesso seguro...</div>}>
        <LoginView
          onLoginSuccess={async () => {
            await verifyServerSession();
            if (redirectTarget && redirectTarget !== '/login') {
              const target = redirectTarget;
              setRedirectTarget(null);
              navigate(target, { replace: true });
            }
          }}
        />
      </React.Suspense>
    );
  }

  if (activeUser?.requireTenantSelection) {
    return (
      <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Carregando empresas...</div>}>
        <TenantSelectionView user={activeUser} onSuccess={() => window.location.reload()} />
      </React.Suspense>
    );
  }

  const showRouteContext = !newUI && !!activeRoute && !['torre-controle', 'home-digitador', 'producao', 'simulacoes', 'central-atendimento', 'tv-monitor'].includes(effectiveView);

  // RBAC route access verification
  const hasRouteAccess = activeRoute
    ? canAccessRoute(activeRoute, activeUser?.role, activeUser?.customPermissions || [])
    : true;

  return (
    <div className={`sentinel-app flex w-screen overflow-hidden font-sans antialiased transition-colors ${newUI ? "s2-root" : ""}`} data-density={workspace.density}>
      <a href="#sentinel-main" className="sentinel-skip-link">Ir para o conteúdo principal</a>
      {/* Sidebar (Hidden in Focus Mode) */}
      {!isFocusMode && (
        <>
          {isMobileNavigationOpen && (
            <button
              type="button"
              aria-label="Fechar menu de navegação"
              className="md:hidden fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[1px]"
              onClick={() => setIsMobileNavigationOpen(false)}
            />
          )}
          {newUI ? <PreviewSidebar favorites={workspace.favorites} recent={workspace.recent} key={preferenceKey} role={activeUser?.role} permissions={activeUser?.customPermissions} path={pathname} navigate={handleNavigate} mobileOpen={isMobileNavigationOpen} closeMobile={() => setIsMobileNavigationOpen(false)} brandName={branding?.companyName || 'Sentinel Consig'} brandLogo={branding?.logoUrl && branding.logoUrl !== '/branding/sentinel-mark-v2.svg' ? branding.logoUrl : '/branding/sentinel-consig-symbol.svg'} /> : <Sidebar
            currentView={effectiveView}
            currentPath={pathname}
            preferenceKey={preferenceKey}
            activeUser={activeUser}
            onNavigate={handleNavigate}
            branding={branding}
            isMobileOpen={isMobileNavigationOpen}
            onCloseMobile={() => setIsMobileNavigationOpen(false)}
          />}
        </>
      )}

      {/* Main Content Area */}
      <div className="sentinel-stage flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Header or Sleek Focus Mode Floating Bar */}
        {!isFocusMode ? (
          <Header
            redesignPreview={newUI}
            onToggleFavorite={newUI && hasRouteAccess && activeRoute && !activeRoute.isDynamic ? () => workspace.toggleFavorite(activeRoute.path) : undefined}
            isFavorite={!!activeRoute && workspace.favorites.includes(activeRoute.path)}
            onToggleDensity={newUI ? workspace.toggleDensity : undefined}
            density={workspace.density}
            onOpenSearch={() => setIsUniversalSearchOpen(true)}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            onOpenTestRunner={() => setIsTestRunnerOpen(true)}
            onOpenBackupModal={() => setIsBackupModalOpen(true)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onOpenTour={() => setIsTourOpen(true)}
            onOpenWhiteLabel={() => setIsWhiteLabelModalOpen(true)}
            onToggleFocusMode={() => setIsFocusMode(true)}
            isFocusMode={false}
            onGlobalSearch={handleGlobalSearch}
            searchTerm={globalSearchTerm}
            onNavigate={handleNavigate}
            onOpenNavigation={() => setIsMobileNavigationOpen(true)}
            isNavigationOpen={isMobileNavigationOpen}
          />
        ) : (
          <div className="flex h-12 items-center justify-between border-b border-blue-500/20 bg-blue-900/90 dark:bg-blue-950 px-4 text-white shadow-md z-30 transition-all backdrop-blur-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-md bg-blue-600/80 px-2 py-0.5 text-xs font-black tracking-wide uppercase">
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Modo Foco Ativo</span>
              </div>
              <span className="text-xs text-blue-200 hidden sm:inline">
                Barra lateral e cabeçalho ocultados para análise ampliada de dados
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={openNewProduction}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Produção</span>
              </button>

              <button
                onClick={() => setIsUniversalSearchOpen(true)}
                className="flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Buscar (Ctrl+K)</span>
              </button>

              <button
                onClick={() => setIsShortcutsOpen(true)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                title="Atalhos (?)"
              >
                <Keyboard className="h-4 w-4" />
              </button>

              <button
                id="btn-exit-focus-mode"
                onClick={() => setIsFocusMode(false)}
                className="flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
                title="Sair do Modo Foco (Esc)"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Sair do Foco (Esc)</span>
              </button>
            </div>
          </div>
        )}

        {/* Breadcrumb Navigation Bar */}
        {!newUI && !isFocusMode && effectiveView !== 'tv-monitor' && (
          <WorkspaceToolbar route={hasRouteAccess ? activeRoute : null} user={activeUser} preferenceKey={preferenceKey} onNavigate={handleNavigate} />
        )}

        {/* Dynamic Page Views */}
        {newUI && !isFocusMode && <WorkTabs key={preferenceKey} path={pathname} recent={workspace.recent} role={activeUser?.role} permissions={activeUser?.customPermissions} navigate={handleNavigate} />}
        <main id="sentinel-main" tabIndex={-1} className={`sentinel-main flex-1 overflow-y-auto min-h-0 ${isFocusMode ? 'bg-slate-50 dark:bg-slate-900/50' : ''}`}>
          <div className={showRouteContext && hasRouteAccess ? 'sentinel-view-frame' : ''}><div className="sentinel-view-body" data-ui-module={newUI && hasRouteAccess ? effectiveView : undefined} data-ui-family={newUI && hasRouteAccess ? operationalFamily(effectiveView) : undefined}>
          {is404 ? (
            <NotFoundView
              pathname={pathname}
              onNavigateHome={() => navigate('/dashboard')}
            />
          ) : !hasRouteAccess && activeRoute ? (
            <AccessDeniedView
              requiredPermission={activeRoute.requiredPermission}
              requiredRoles={activeRoute.requiredRoles}
              userRole={activeUser?.role}
              tenantName={branding?.companyName || StorageService.getCurrentTenant().name}
              onNavigateHome={() => navigate('/dashboard')}
            />
          ) : (
            <React.Suspense fallback={<div className="flex min-h-48 items-center justify-center text-sm text-slate-500">Carregando tela...</div>}>
            <>
              {effectiveView === 'torre-controle' && newUI && <PreviewDashboard onRefresh={preview.refresh} loading={preview.loading} key={preferenceKey} rows={preview.rows} bottlenecks={preview.bottlenecks} error={preview.error} openStatus={statusId => handleNavigateToProductionWithFilter({statusId})} openBank={bankId => handleNavigateToProductionWithFilter({bankId})} role={activeUser?.role} permissions={activeUser?.customPermissions} name={activeUser?.name || 'equipe'} navigate={handleNavigate} openProposal={id => { setDetailProposalId(id); navigate(`/propostas/${id}`); }} newProposal={canCreateProposals ? openNewProduction : undefined} />}
              {effectiveView === 'torre-controle' && !newUI && (
                <ControlTower
                  onNavigate={handleNavigate}
                  onNavigateToProductionWithFilter={handleNavigateToProductionWithFilter}
                />
              )}

              {effectiveView === 'tv-monitor' && <TVOperationsMonitor />}

              {effectiveView === 'dashboard-executivo' && <ExecutiveBIDashboard />}

              {effectiveView === 'radar-comercial' && <CommercialRadarView />}

              {(effectiveView === 'sentinela-ai' || effectiveView === 'sentinel-intelligence') && (
                <SentinelIntelligenceDashboard onNavigateToView={(view) => handleNavigate(view)} />
              )}

              {effectiveView === 'central-operacoes' && <OperationsCentral />}

              {effectiveView === 'gamificacao' && <GamificationCenter />}

              {effectiveView === 'agenda-operacional' && <OperationalAgendaView />}

              {effectiveView === 'minha-fila' && <MyTaskQueueView onNavigate={navigate} />}

              {effectiveView === 'financeiro-geral' && <GeneralFinanceView premium={newUI} />}

              {effectiveView === 'saas-tenants' && <PlatformMasterCentral />}

              {effectiveView === 'relatorio-gargalos' && <StatusBottleneckReport />}

              {effectiveView === 'home-digitador' && (
                <DigitizerHome
                  onOpenNewProduction={canCreateProposals ? openNewProduction : undefined}
                  onOpenImportExcel={canCreateProposals ? openProposalImport : undefined}
                  onOpenExport={canViewProposals ? openProposalExport : undefined}
                />
              )}

              {effectiveView === 'simulacoes' && activeUser?.role !== 'DIGITADOR' && (
                <SimulationView
                  key={preferenceKey}
                  premium={newUI}
                  onOpenProposalDetail={propId => {
                    setDetailProposalId(propId);
                    navigate(`/propostas/${propId}`);
                  }}
                />
              )}

              {effectiveView === 'producao' && (
                <ProductionList
                  key={preferenceKey}
                  premium={newUI}
                  onKanban={hasPermission(activeUser?.role,activeUser?.customPermissions,'proposals.view') ? () => handleNavigate('/esteira') : undefined}
                  onOpenNewProduction={canCreateProposals ? openNewProduction : undefined}
                  onOpenImportExcel={canCreateProposals ? openProposalImport : undefined}
                  onToggleFocusMode={() => setIsFocusMode(prev => !prev)}
                  isFocusMode={isFocusMode}
                  initialFilter={productionFilter}
                />
              )}

              {effectiveView === 'esteira' && <KanbanBoard premium={newUI} />}

              {effectiveView === 'portabilidades' && <PortabilityView premium={newUI} />}

              {(effectiveView === 'clientes' || effectiveView === 'busca-cpf' || effectiveView === 'pesquisa-cpf') && (
                <Client360View premium={newUI} initialSearchCpf={globalSearchTerm} />
              )}

              {effectiveView === 'parceiros' && <PartnerManagement premium={newUI} />}

              {(effectiveView === 'promotoras' || effectiveView === 'admin-bancos') && (
                <BankPromoterManagement />
              )}

              {(effectiveView === 'suporte' ||
                effectiveView === 'pendencias' ||
                effectiveView === 'sla') && <SupportCenter />}

              {effectiveView === 'admin-usuarios' && <UserManagement />}

              {effectiveView === 'admin-plano-consumo' && <TenantSaaSCapacityView />}

              {effectiveView === 'admin-produtos' && <ProductManagement />}

              {effectiveView === 'roteiros' && <BankPlaybooksView />}
              {effectiveView === 'admin-status' && <StatusManagement />}

              {effectiveView === 'admin-calendario' && <HolidayManagement />}

              {effectiveView === 'admin-auditoria' && <AuditLogView />}

              {(effectiveView === 'admin-c6-bank' || effectiveView === 'admin-integracoes-bancos') && (
                <BankIntegrationsView />
              )}

              {effectiveView === 'admin-comunicados' && (<AnnouncementsManagement />)}
              {effectiveView === 'admin-import-status' && (
                <StatusImport onNavigate={handleNavigate} />
              )}

              {/* NOVOS MÓDULOS OPERACIONAIS & CENTRAL DE ADMINISTRAÇÃO */}
              {(effectiveView === 'central-administracao' || effectiveView === 'administracao') && (
                <CentralAdministracao premium={newUI} />
              )}
              {(effectiveView === 'central-pendencias' || effectiveView === 'pendencias-central') && (
                <CentralPendencias premium={newUI} />
              )}
              {(effectiveView === 'central-automacao' || effectiveView === 'automacoes') && (
                <CentralAutomacoes />
              )}
              {(effectiveView === 'hub-integracoes' || effectiveView === 'integracoes-hub') && (
                <HubIntegracoes key={preferenceKey} premium={newUI} />
              )}
              {(effectiveView === 'command-center' || effectiveView === 'command') && (
                <CommandCenterView />
              )}
              {(effectiveView === 'central-atendimento' || effectiveView === 'suporte-central' || effectiveView === 'atendimento-parceiros') && (
                <CentralAtendimentoView />
              )}
            </>
            </React.Suspense>
          )}
          </div>{showRouteContext && hasRouteAccess && activeRoute && activeUser && <RouteContextPanel route={activeRoute} user={activeUser} onNavigate={handleNavigate} />}</div>
        </main>

        {activeUser && !isFocusMode && effectiveView !== 'tv-monitor' && (
          <InstitutionalFooter userName={activeUser.name} companyName={activeUser.role === 'PLATFORM_MASTER'
            ? (adminContext?.targetTenantName || 'Plataforma')
            : brandingTenant?.name || activeUser.availableMemberships?.find(membership => membership.tenantId === activeUser.tenantId)?.tenantName
              || branding?.companyName || StorageService.getCurrentTenant().name} />
        )}
      </div>

      {/* Global Modals */}
      <React.Suspense fallback={null}>
      {isNewProductionOpen && canCreateProposals && (
        <NewProductionModal
          isOpen={isNewProductionOpen}
          onClose={() => setIsNewProductionOpen(false)}
          onSuccess={(count) => {
            setIsNewProductionOpen(false);
            navigate('/propostas');
            toastService.success('Cadastro concluído', `${count} proposta(s) cadastrada(s) com sucesso.`);
          }}
        />
      )}

      {isImportExcelOpen && canCreateProposals && (
        <ExcelImportModal
          isOpen={isImportExcelOpen}
          onClose={() => setIsImportExcelOpen(false)}
          onImportSuccess={(count) => {
            navigate('/propostas');
            toastService.success(
              'Importação concluída',
              `${count} proposta(s) criada(s) ou atualizada(s). Confira o resumo e as ocorrências antes de fechar.`,
            );
          }}
        />
      )}

      {isExportOpen && canViewProposals && (
        <ExcelExportModal
          isOpen={isExportOpen}
          proposals={StorageService.getProposals()}
          onClose={() => setIsExportOpen(false)}
        />
      )}

      {isTestRunnerOpen && (
        <TestRunnerModal
          isOpen={isTestRunnerOpen}
          onClose={() => setIsTestRunnerOpen(false)}
        />
      )}

      {isNotificationsOpen && <NotificationsDrawer
        isOpen={true}
        onClose={() => setIsNotificationsOpen(false)}
        onSelectProposal={id => {
          setDetailProposalId(id);
          navigate(`/propostas/${id}`);
        }}
      />}

      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          onClose={() => {
            setDetailProposalId(null);
            if (params.id) {
              navigate('/propostas', { replace: true });
            }
          }}
          onProposalUpdated={() => {}}
        />
      )}
      {/* Universal Search Command Palette (Ctrl+K) */}
      {isUniversalSearchOpen && newUI && <PreviewSearch tasks={taskSearch} key={preferenceKey} role={activeUser?.role} permissions={activeUser?.customPermissions} rows={preview.rows} clients={hasPermission(activeUser?.role,activeUser?.customPermissions,'clients.view') ? StorageService.getClients().map(c=>({id:c.id,name:c.fullName||'Cliente não informado',cpf:c.cpf||''})) : []} openClient={hasPermission(activeUser?.role,activeUser?.customPermissions,'clients.view') ? cpf => {setGlobalSearchTerm(cpf);navigate('/clientes');} : undefined} partners={hasPermission(activeUser?.role, activeUser?.customPermissions,'partners.view') || hasPermission(activeUser?.role, activeUser?.customPermissions,'partners.crm.view') ? StorageService.getPartners().map(p => ({name:p.fullName,code:p.login})) : []} recent={workspace.recent} favorites={workspace.favorites} navigate={handleNavigate} openProposal={id => {setDetailProposalId(id);navigate(`/propostas/${id}`);}} close={() => setIsUniversalSearchOpen(false)} />}
      {isUniversalSearchOpen && !newUI && <UniversalCommandPalette
        isOpen={isUniversalSearchOpen}
        onClose={() => setIsUniversalSearchOpen(false)}
        onNavigate={handleNavigate}
      />}

      {/* Legacy/Quick Palette */}
      {isCommandPaletteOpen && <CommandPaletteModal
        isOpen={true}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onOpenNewProduction={openNewProduction}
        onOpenImportExcel={openProposalImport}
        onOpenExport={openProposalExport}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onToggleFocusMode={() => setIsFocusMode(prev => !prev)}
        onSelectProposal={id => {
          setDetailProposalId(id);
          navigate(`/propostas/${id}`);
        }}
      />}

      {/* Keyboard Shortcuts Cheatsheet (?) */}
      {isShortcutsOpen && <KeyboardShortcutsModal
        isOpen={true}
        onClose={() => setIsShortcutsOpen(false)}
      />}

      {/* Database Backup & Scheduled Cron Modal (Ctrl+Shift+B) */}
      {isBackupModalOpen && <BackupManagementModal
        isOpen={true}
        onClose={() => setIsBackupModalOpen(false)}
        onDatabaseRestored={() => {
          setIsBackupModalOpen(false);
          window.location.reload();
        }}
      />}

      {/* White Label Personalization Modal */}
      {isWhiteLabelModalOpen && <WhiteLabelModal
        isOpen={true}
        onClose={() => setIsWhiteLabelModalOpen(false)}
      />}

      {/* Interactive System Onboarding Tour Guide */}
      {isTourOpen && <InteractiveTourModal
        isOpen={true}
        onClose={() => setIsTourOpen(false)}
        onNavigateView={handleNavigate}
      />}

      {/* Force First Access Password Change Modal */}
      {isAuthenticated && activeUser?.mustChangePassword && (
        <ForcePasswordChangeModal
          user={activeUser}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
      </React.Suspense>

      {/* Global Toast Feedback Container */}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AppMainContent />
    </RouterProvider>
  );
}
