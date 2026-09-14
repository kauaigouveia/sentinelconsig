import React, { useState, useEffect } from 'react';
import { StorageService } from './services/storageService';
import { BackupService } from './services/backupService';
import { realtimeHub } from './services/realtimeService';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ControlTower } from './components/dashboard/ControlTower';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { StatusBottleneckReport } from './components/dashboard/StatusBottleneckReport';
import { DigitizerHome } from './components/dashboard/DigitizerHome';
import { ProductionList } from './components/production/ProductionList';
import { KanbanBoard } from './components/production/KanbanBoard';
import { PortabilityView } from './components/production/PortabilityView';
import { Client360View } from './components/clients/Client360View';
import { SupportCenter } from './components/support/SupportCenter';
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
import { SentinelaAIChat } from './components/ai/SentinelaAIChat';
import { OperationalAgendaView } from './components/agenda/OperationalAgendaView';
import { GamificationCenter } from './components/gamification/GamificationCenter';
import { GeneralFinanceView } from './components/finance/GeneralFinanceView';
import { PlatformMasterCentral } from './components/saas/PlatformMasterCentral';
import { UniversalCommandPalette } from './components/search/UniversalCommandPalette';

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
import { ForcePasswordChangeModal } from './components/auth/ForcePasswordChangeModal';
import { ResponsibleAlçada } from './types';
import { Maximize2, Minimize2, Plus, Search, Keyboard, Database, Sparkles } from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => StorageService.isAuthenticated());
  const activeUser = StorageService.getActiveUser();

  // Validate server-side session as the ultimate authority
  useEffect(() => {
    let isMounted = true;

    const verifyServerSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (!isMounted) return;

        if (res.ok) {
          const data = await res.json();
          if (data && data.authenticated && data.user) {
            // Update active user with valid server session data
            StorageService.setActiveUser(data.user);
            localStorage.setItem('cg_is_authenticated', 'true');
            setIsAuthenticated(true);
            return;
          }
        }
        // If server says unauthenticated (401 or !authenticated)
        if (StorageService.isAuthenticated()) {
          console.warn('[AUTH] Sessão server-side inexistente ou expirada. Limpando credenciais locais e redirecionando para login.');
          StorageService.clearBusinessCache();
          localStorage.setItem('cg_is_authenticated', 'false');
          setIsAuthenticated(false);
        }
      } catch (err) {
        // Network error during offline/mock fallback: let StorageService validate local user integrity
        if (!StorageService.isAuthenticated()) {
          setIsAuthenticated(false);
        }
      }
    };

    verifyServerSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for storage / login state updates and initialize/sync data
  useEffect(() => {
    // Initial load on startup
    StorageService.initialize();

    const handleStorageUpdate = () => {
      const auth = StorageService.isAuthenticated();
      setIsAuthenticated(auth);
      if (auth) {
        const user = StorageService.getActiveUser();
        if (user) realtimeHub.setUserContext(user.id);
        realtimeHub.connect(StorageService.getCurrentTenantId());
      } else {
        realtimeHub.disconnect();
      }
    };
    window.addEventListener('credit_gestao_storage_update', handleStorageUpdate);

    // If authenticated on mount, establish SSE connection immediately
    if (StorageService.isAuthenticated()) {
      const user = StorageService.getActiveUser();
      if (user) realtimeHub.setUserContext(user.id);
      realtimeHub.connect(StorageService.getCurrentTenantId());
    }

    // Subscribe to incoming realtime SSE events to perform targeted entity synchronization
    const unsubscribeSSE = realtimeHub.subscribe('*', (event) => {
      if (event && event.entity) {
        StorageService.syncSpecificEntity(event.entity, event.entityId).catch((err) => {
          console.warn('[REALTIME] Erro no sync targeted:', err);
        });
      } else {
        // Fallback: sync all if event entity is not specified
        StorageService.syncWithPostgreSQL().catch((err) => {
          console.warn('[REALTIME] Erro no sync global fallback:', err);
        });
      }
    });

    return () => {
      window.removeEventListener('credit_gestao_storage_update', handleStorageUpdate);
      unsubscribeSSE();
      realtimeHub.disconnect();
      StorageService.unsubscribeRealTimeListeners();
    };
  }, []);

  // Initial view based on user role (safe fallback)
  const defaultView =
    activeUser?.role === 'DIGITADOR'
      ? 'home-digitador'
    : activeUser?.role === 'SUPORTE'
    ? 'suporte'
    : activeUser?.role === 'SIMULACAO'
    ? 'simulacoes'
    : 'torre-controle';

  const [currentView, setCurrentView] = useState<string>(defaultView);
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

  // Run scheduled backup check and first-time tour check on startup
  useEffect(() => {
    BackupService.checkAndExecuteScheduledBackup();
    
    // Check if user has already seen the interactive tour
    try {
      const tourSeen = localStorage.getItem('cg_tour_completed');
      if (!tourSeen) {
        setIsTourOpen(true);
      }
    } catch {
      // safe fallback
    }
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

      // Global Command Palette (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsUniversalSearchOpen(prev => !prev);
        return;
      }

      // Global New Production (Ctrl+N or Cmd+N)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
        e.preventDefault();
        setIsNewProductionOpen(true);
        return;
      }

      // Global Quick Search (Ctrl+F or Cmd+F)
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

      // Global Backup Manager (Ctrl+Shift+B)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault();
        setIsBackupModalOpen(true);
        return;
      }

      // Toggle Focus Mode (Alt+F or Ctrl+B)
      if (
        (e.altKey && (e.key === 'f' || e.key === 'F')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B') && !e.shiftKey)
      ) {
        e.preventDefault();
        setIsFocusMode(prev => !prev);
        return;
      }

      // Shortcuts Cheatsheet (Shift + ?)
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }

      // Escape key handling
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
        else if (detailProposalId) setDetailProposalId(null);
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
  ]);

  const handleNavigate = (view: string, params?: any) => {
    if (view === 'nova-producao') {
      setIsNewProductionOpen(true);
      return;
    }
    if (view === 'importar-excel' || view === 'importacao') {
      setIsImportExcelOpen(true);
      return;
    }
    if (view === 'exportar-propostas' || view === 'exportacao') {
      setIsExportOpen(true);
      return;
    }
    if (view === 'admin-backup') {
      setIsBackupModalOpen(true);
      return;
    }

    if (view === 'clients_360' || view === 'clientes') {
      if (params?.cpf) {
        setGlobalSearchTerm(params.cpf);
      }
      setCurrentView('clientes');
      return;
    }

    if (view === 'tv_monitor' || view === 'tv-monitor') {
      setCurrentView('tv-monitor');
      return;
    }

    if (view === 'commercial_radar' || view === 'radar-comercial') {
      setCurrentView('radar-comercial');
      return;
    }

    if (view === 'sentinela_ai' || view === 'sentinela-ai') {
      setCurrentView('sentinela-ai');
      return;
    }

    if (view === 'agenda' || view === 'agenda-operacional') {
      setCurrentView('agenda-operacional');
      return;
    }

    if (view === 'gamification' || view === 'gamificacao') {
      setCurrentView('gamificacao');
      return;
    }

    if (view === 'finance' || view === 'financeiro-geral') {
      setCurrentView('financeiro-geral');
      return;
    }

    if (view === 'saas_tenants' || view === 'saas-tenants') {
      setCurrentView('saas-tenants');
      return;
    }

    if (view === 'proposals' && params?.proposalId) {
      setDetailProposalId(params.proposalId);
      return;
    }

    setCurrentView(view);
  };

  const handleGlobalSearch = (term: string) => {
    setGlobalSearchTerm(term);
    if (term.trim()) {
      setCurrentView('clientes');
    }
  };

  const handleNavigateToProductionWithFilter = (filter: {
    statusId?: string;
    alçada?: ResponsibleAlçada;
    bankId?: string;
    promoterId?: string;
  }) => {
    setProductionFilter(filter);
    setCurrentView('producao');
  };

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 antialiased transition-colors">
      {/* Sidebar (Hidden in Focus Mode) */}
      {!isFocusMode && (
        <Sidebar currentView={currentView} onNavigate={handleNavigate} />
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
                className="flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs"
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

        {/* Dynamic Page Views */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-5 min-h-0 ${isFocusMode ? 'bg-slate-50 dark:bg-slate-900/50' : ''}`}>
          {currentView === 'torre-controle' && (
            <ControlTower
              onNavigateToProductionWithFilter={handleNavigateToProductionWithFilter}
            />
          )}

          {currentView === 'tv-monitor' && <TVOperationsMonitor />}

          {currentView === 'dashboard-executivo' && <ExecutiveDashboard />}

          {currentView === 'radar-comercial' && <CommercialRadarView />}

          {currentView === 'sentinela-ai' && <SentinelaAIChat />}

          {currentView === 'gamificacao' && <GamificationCenter />}

          {currentView === 'agenda-operacional' && <OperationalAgendaView />}

          {currentView === 'financeiro-geral' && <GeneralFinanceView />}

          {currentView === 'saas-tenants' && <PlatformMasterCentral />}

          {currentView === 'relatorio-gargalos' && <StatusBottleneckReport />}

          {currentView === 'home-digitador' && (
            <DigitizerHome
              onOpenNewProduction={() => setIsNewProductionOpen(true)}
              onOpenImportExcel={() => setIsImportExcelOpen(true)}
              onOpenExport={() => setIsExportOpen(true)}
            />
          )}

          {currentView === 'simulacoes' && activeUser?.role !== 'DIGITADOR' && (
            <SimulationView
              onOpenProposalDetail={propId => setDetailProposalId(propId)}
            />
          )}

          {currentView === 'producao' && (
            <ProductionList
              onOpenNewProduction={() => setIsNewProductionOpen(true)}
              onOpenImportExcel={() => setIsImportExcelOpen(true)}
              onToggleFocusMode={() => setIsFocusMode(prev => !prev)}
              isFocusMode={isFocusMode}
              initialFilter={productionFilter}
            />
          )}

          {currentView === 'esteira' && <KanbanBoard />}

          {currentView === 'portabilidades' && <PortabilityView />}

          {(currentView === 'clientes' || currentView === 'busca-cpf' || currentView === 'pesquisa-cpf') && (
            <Client360View initialSearchCpf={globalSearchTerm} />
          )}

          {currentView === 'parceiros' && <PartnerManagement />}

          {(currentView === 'promotoras' || currentView === 'admin-bancos') && (
            <BankPromoterManagement />
          )}

          {(currentView === 'suporte' ||
            currentView === 'pendencias' ||
            currentView === 'sla') && <SupportCenter />}

          {currentView === 'admin-usuarios' && <UserManagement />}

          {currentView === 'admin-produtos' && <ProductManagement />}

          {currentView === 'admin-status' && <StatusManagement />}

          {currentView === 'admin-calendario' && <HolidayManagement />}

          {currentView === 'admin-auditoria' && <AuditLogView />}

          {currentView === 'admin-import-status' && (
            <StatusImport onNavigate={handleNavigate} />
          )}
        </main>
      </div>

      {/* Global Modals */}
      {isNewProductionOpen && (
        <NewProductionModal
          isOpen={isNewProductionOpen}
          onClose={() => setIsNewProductionOpen(false)}
          onSuccess={() => {
            setIsNewProductionOpen(false);
            setCurrentView('producao');
          }}
        />
      )}

      {isImportExcelOpen && (
        <ExcelImportModal
          isOpen={isImportExcelOpen}
          onClose={() => setIsImportExcelOpen(false)}
          onImportSuccess={() => {
            setIsImportExcelOpen(false);
            setCurrentView('producao');
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
        onSelectProposal={id => setDetailProposalId(id)}
      />

      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          onClose={() => setDetailProposalId(null)}
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
        onSelectProposal={id => setDetailProposalId(id)}
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
    </div>
  );
}
