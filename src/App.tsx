import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StorageService } from './services/storageService';
import { BackupService } from './services/backupService';
import { realtimeHub } from './services/realtimeService';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ExecutiveBIDashboard } from './components/bi/ExecutiveBIDashboard';
import { OperationalBIDashboard } from './components/bi/OperationalBIDashboard';
import { ControlTower } from './components/dashboard/ControlTower';
import { StatusBottleneckReport } from './components/dashboard/StatusBottleneckReport';
import { DigitizerHome } from './components/dashboard/DigitizerHome';
import { ProductionList } from './components/production/ProductionList';
import { KanbanBoard } from './components/production/KanbanBoard';
import { PortabilityView } from './components/production/PortabilityView';
import { Client360View } from './components/clients/Client360View';
import { SupportCenter } from './components/support/SupportCenter';
import { CentralAtendimentoView } from './components/support/CentralAtendimentoView';
import { PartnerPortalLayout } from './components/partner-portal/PartnerPortalLayout';
import { PartnerManagement } from './components/admin/PartnerManagement';
import { BankPromoterManagement } from './components/admin/BankPromoterManagement';
import { ProductManagement } from './components/admin/ProductManagement';
import { StatusManagement } from './components/admin/StatusManagement';
import { HolidayManagement } from './components/admin/HolidayManagement';
import { AuditLogView } from './components/admin/AuditLogView';
import { UserManagement } from './components/admin/UserManagement';
import { StatusImport } from './components/admin/StatusImport';
import { SimulationView } from './components/simulation/SimulationView';

import { TVOperationsMonitor } from './components/monitor/TVOperationsMonitor';
import { CommercialRadarView } from './components/bi/CommercialRadarView';
import { useTenantBranding } from './hooks/useTenantBranding';
import { OperationalAgendaView } from './components/agenda/OperationalAgendaView';
import { GamificationCenter } from './components/gamification/GamificationCenter';
import { GeneralFinanceView } from './components/finance/GeneralFinanceView';
import { PlatformMasterCentral } from './components/saas/PlatformMasterCentral';
import { TenantSaaSCapacityView } from './components/admin/TenantSaaSCapacityView';
import { AnnouncementsManagement } from './components/admin/AnnouncementsManagement';
import { OperationsCentral } from './components/operations/OperationsCentral';
import { UniversalCommandPalette } from './components/search/UniversalCommandPalette';
import { BankIntegrationsView } from './components/integrations/BankIntegrationsView';
import { CentralAdministracao } from './components/admin/CentralAdministracao';
import { CentralPendencias } from './components/admin/CentralPendencias';
import { CentralAutomacoes } from './components/admin/CentralAutomacoes';
import { HubIntegracoes } from './components/admin/HubIntegracoes';
import { SentinelIntelligenceDashboard } from './components/intelligence/SentinelIntelligenceDashboard';
import { CommandCenterView } from './components/CommandCenter/CommandCenterView';
import { getRoleLabel } from './lib/roleLabels';

import { NewProductionModal } from './components/production/NewProductionModal';
import { ExcelImportModal } from './components/production/ExcelImportModal';
import { ExcelExportModal } from './components/production/ExcelExportModal';
import { TestRunnerModal } from './components/admin/TestRunnerModal';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer';
import { ProposalDetailModal } from './components/production/ProposalDetailModal';
import { CommandPaletteModal } from './components/common/CommandPaletteModal';
import { KeyboardShortcutsModal } from './components/common/KeyboardShortcutsModal';
import { BackupManagementModal } from './components/admin/BackupManagementModal';
import { WhiteLabelModal } from './components/admin/WhiteLabelModal';
import { InteractiveTourModal } from './components/common/InteractiveTourModal';
import { LoginView } from './components/auth/LoginView';
import { TenantSelectionView } from './components/auth/TenantSelectionView';
import { ForcePasswordChangeModal } from './components/auth/ForcePasswordChangeModal';
import { ResponsibleAlçada, User } from './types';
import { Maximize2, Minimize2, Plus, Search, Keyboard } from 'lucide-react';
import { Breadcrumbs } from './components/ui/Breadcrumbs';
import { ToastContainer } from './components/ui/ToastContainer';

import { RouterProvider, useRouter } from './router';
import { canAccessRoute } from './router/routes';
import { AccessDeniedView } from './components/common/AccessDeniedView';
import { NotFoundView } from './components/common/NotFoundView';

function AppMainContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(true);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [adminContext, setAdminContext] = useState<{ targetTenantId: string; targetTenantName: string } | null>(null);
  const { branding } = useTenantBranding();

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
  }>({});

  // Focus mode state (maximizes table and hide chrome)
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Modals state
  const [isNewProductionOpen, setIsNewProductionOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isUniversalSearchOpen, setIsUniversalSearchOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isWhiteLabelModalOpen, setIsWhiteLabelModalOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

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
        setIsNewProductionOpen(true);
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
  ]);

  // Main navigation handler: translates view or path to canonical URL navigation
  const handleNavigate = (viewOrPath: string, navParams?: any) => {
    if (viewOrPath === 'nova-producao') {
      setIsNewProductionOpen(true);
      return;
    }
    if (viewOrPath === 'importar-excel' || viewOrPath === 'importacao') {
      setIsImportExcelOpen(true);
      return;
    }
    if (viewOrPath === 'exportar-propostas' || viewOrPath === 'exportacao') {
      setIsExportOpen(true);
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
  if (pathname.startsWith('/parceiro')) {
    let initialTab: 'dashboard' | 'propostas' | 'atendimento' | 'perfil' = 'dashboard';
    if (pathname.startsWith('/parceiro/propostas')) initialTab = 'propostas';
    else if (pathname.startsWith('/parceiro/atendimento') || pathname.startsWith('/parceiro/suporte') || pathname.startsWith('/parceiro/chat')) initialTab = 'atendimento';
    else if (pathname.startsWith('/parceiro/perfil') || pathname.startsWith('/parceiro/cadastro')) initialTab = 'perfil';

    return <PartnerPortalLayout initialTab={initialTab} />;
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
    );
  }

  if (activeUser?.requireTenantSelection) {
    return <TenantSelectionView user={activeUser} onSuccess={() => window.location.reload()} />;
  }

  // RBAC route access verification
  const hasRouteAccess = activeRoute
    ? canAccessRoute(activeRoute, activeUser?.role, activeUser?.customPermissions || [])
    : true;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 antialiased transition-colors">
      {/* Sidebar (Hidden in Focus Mode) */}
      {!isFocusMode && (
        <Sidebar
          currentView={effectiveView}
          currentPath={pathname}
          onNavigate={handleNavigate}
          branding={branding}
        />
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top Header or Sleek Focus Mode Floating Bar */}
        {!isFocusMode ? (
          <Header
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
                onClick={() => setIsNewProductionOpen(true)}
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
        {!isFocusMode && effectiveView !== 'tv-monitor' && (
          <div className="px-4 py-1.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
            <Breadcrumbs currentView={effectiveView} onNavigate={handleNavigate} />
          </div>
        )}

        {/* Dynamic Page Views */}
        <main className={`flex-1 overflow-y-auto p-3.5 md:p-4 min-h-0 ${isFocusMode ? 'bg-slate-50 dark:bg-slate-900/50' : ''}`}>
          {is404 ? (
            <NotFoundView
              pathname={pathname}
              onNavigateHome={() => navigate('/dashboard')}
            />
          ) : !hasRouteAccess && activeRoute ? (
            <AccessDeniedView
              requiredPermission={activeRoute.requiredPermission}
              userRole={activeUser?.role}
              tenantName={branding?.companyName || StorageService.getCurrentTenant().name}
              onNavigateHome={() => navigate('/dashboard')}
            />
          ) : (
            <>
              {effectiveView === 'torre-controle' && (
                <ControlTower
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

              {effectiveView === 'financeiro-geral' && <GeneralFinanceView />}

              {effectiveView === 'saas-tenants' && <PlatformMasterCentral />}

              {effectiveView === 'relatorio-gargalos' && <StatusBottleneckReport />}

              {effectiveView === 'home-digitador' && (
                <DigitizerHome
                  onOpenNewProduction={() => setIsNewProductionOpen(true)}
                  onOpenImportExcel={() => setIsImportExcelOpen(true)}
                  onOpenExport={() => setIsExportOpen(true)}
                />
              )}

              {effectiveView === 'simulacoes' && activeUser?.role !== 'DIGITADOR' && (
                <SimulationView
                  onOpenProposalDetail={propId => {
                    setDetailProposalId(propId);
                    navigate(`/propostas/${propId}`);
                  }}
                />
              )}

              {effectiveView === 'producao' && (
                <ProductionList
                  onOpenNewProduction={() => setIsNewProductionOpen(true)}
                  onOpenImportExcel={() => setIsImportExcelOpen(true)}
                  onToggleFocusMode={() => setIsFocusMode(prev => !prev)}
                  isFocusMode={isFocusMode}
                  initialFilter={productionFilter}
                />
              )}

              {effectiveView === 'esteira' && <KanbanBoard />}

              {effectiveView === 'portabilidades' && <PortabilityView />}

              {(effectiveView === 'clientes' || effectiveView === 'busca-cpf' || effectiveView === 'pesquisa-cpf') && (
                <Client360View initialSearchCpf={globalSearchTerm} />
              )}

              {effectiveView === 'parceiros' && <PartnerManagement />}

              {(effectiveView === 'promotoras' || effectiveView === 'admin-bancos') && (
                <BankPromoterManagement />
              )}

              {(effectiveView === 'suporte' ||
                effectiveView === 'pendencias' ||
                effectiveView === 'sla') && <SupportCenter />}

              {effectiveView === 'admin-usuarios' && <UserManagement />}

              {effectiveView === 'admin-plano-consumo' && <TenantSaaSCapacityView />}

              {effectiveView === 'admin-produtos' && <ProductManagement />}

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
                <CentralAdministracao />
              )}
              {(effectiveView === 'central-pendencias' || effectiveView === 'pendencias-central') && (
                <CentralPendencias />
              )}
              {(effectiveView === 'central-automacao' || effectiveView === 'automacoes') && (
                <CentralAutomacoes />
              )}
              {(effectiveView === 'hub-integracoes' || effectiveView === 'integracoes-hub') && (
                <HubIntegracoes />
              )}
              {(effectiveView === 'command-center' || effectiveView === 'command') && (
                <CommandCenterView />
              )}
              {(effectiveView === 'central-atendimento' || effectiveView === 'suporte-central' || effectiveView === 'atendimento-parceiros') && (
                <CentralAtendimentoView />
              )}
            </>
          )}
        </main>

        {/* Bottom Operational Status Bar */}
        {!isFocusMode && effectiveView !== 'tv-monitor' && (
          <footer className="h-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 select-none shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>SENTINEL OPERACIONAL</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="truncate max-w-[200px]">
                Empresa: <strong className="text-slate-700 dark:text-slate-300 font-medium">
                  {activeUser?.role === 'PLATFORM_MASTER'
                    ? (adminContext ? adminContext.targetTenantName : 'PLATAFORMA')
                    : branding?.companyName || StorageService.getCurrentTenant().name}
                </strong>
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
              <span className="hidden sm:inline">
                Contexto: <strong className="text-slate-700 dark:text-slate-300 font-medium">
                  {activeUser?.role === 'PLATFORM_MASTER'
                    ? (adminContext ? 'MASTER' : 'MASTER OP')
                    : getRoleLabel(activeUser?.role)}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3 font-medium text-[10px]">
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Atualização em tempo real ativa
              </span>
            </div>
          </footer>
        )}
      </div>

      {/* Global Modals */}
      {isNewProductionOpen && (
        <NewProductionModal
          isOpen={isNewProductionOpen}
          onClose={() => setIsNewProductionOpen(false)}
          onSuccess={() => {
            setIsNewProductionOpen(false);
            navigate('/propostas');
          }}
        />
      )}

      {isImportExcelOpen && (
        <ExcelImportModal
          isOpen={isImportExcelOpen}
          onClose={() => setIsImportExcelOpen(false)}
          onImportSuccess={() => {
            setIsImportExcelOpen(false);
            navigate('/propostas');
          }}
        />
      )}

      {isExportOpen && (
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

      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onSelectProposal={id => {
          setDetailProposalId(id);
          navigate(`/propostas/${id}`);
        }}
      />

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
      <UniversalCommandPalette
        isOpen={isUniversalSearchOpen}
        onClose={() => setIsUniversalSearchOpen(false)}
        onNavigate={handleNavigate}
      />

      {/* Legacy/Quick Palette */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onOpenNewProduction={() => setIsNewProductionOpen(true)}
        onOpenImportExcel={() => setIsImportExcelOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onToggleFocusMode={() => setIsFocusMode(prev => !prev)}
        onSelectProposal={id => {
          setDetailProposalId(id);
          navigate(`/propostas/${id}`);
        }}
      />

      {/* Keyboard Shortcuts Cheatsheet (?) */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Database Backup & Scheduled Cron Modal (Ctrl+Shift+B) */}
      <BackupManagementModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDatabaseRestored={() => {
          setIsBackupModalOpen(false);
          window.location.reload();
        }}
      />

      {/* White Label Personalization Modal */}
      <WhiteLabelModal
        isOpen={isWhiteLabelModalOpen}
        onClose={() => setIsWhiteLabelModalOpen(false)}
      />

      {/* Interactive System Onboarding Tour Guide */}
      <InteractiveTourModal
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onNavigateView={handleNavigate}
      />

      {/* Force First Access Password Change Modal */}
      {isAuthenticated && activeUser?.mustChangePassword && (
        <ForcePasswordChangeModal
          user={activeUser}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}

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
