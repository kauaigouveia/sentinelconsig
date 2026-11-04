import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Search,
  Sun,
  Moon,
  Database,
  Keyboard,
  KeyRound,
  CheckCircle2,
  Play,
  RotateCcw,
  Zap,
  LogOut,
  Wifi,
  WifiOff,
  Activity,
  ChevronDown,
  RefreshCw,
  Layers,
  Sparkles,
  Radio,
  Star,
  Sliders,
  Maximize2,
  Menu,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { realtimeHub, ConnectionStatus } from '../../services/realtimeService';
import { AutomationService } from '../../services/automationService';
import { BackupService } from '../../services/backupService';
import { User, Role } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { getRoleEmoji } from '../../lib/roleUtils';
import { getRoleLabel } from '../../lib/roleLabels';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface HeaderProps {
  onOpenNotifications: () => void;
  onOpenTestRunner: () => void;
  onOpenBackupModal?: () => void;
  onOpenShortcuts?: () => void;
  onOpenTour?: () => void;
  onOpenWhiteLabel?: () => void;
  onToggleFocusMode?: () => void;
  isFocusMode?: boolean;
  onGlobalSearch: (term: string) => void;
  searchTerm: string;
  onNavigate: (view: string) => void;
  onOpenNavigation?: () => void;
  isNavigationOpen?: boolean;
  redesignPreview?: boolean;
  onOpenSearch?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  onToggleDensity?: () => void;
  density?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNotifications,
  onOpenTestRunner,
  onOpenBackupModal,
  onOpenShortcuts,
  onOpenTour,
  onOpenWhiteLabel,
  onToggleFocusMode,
  onGlobalSearch,
  searchTerm,
  onNavigate,
  onOpenNavigation,
  isNavigationOpen = false,
  redesignPreview = false,
  onOpenSearch,
  onToggleFavorite,
  isFavorite=false,
  onToggleDensity,
  density,
}) => {
  const activeUser = StorageService.getActiveUser();
  const allUsers = StorageService.getUsers();
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadAnnouncementCount, setUnreadAnnouncementCount] = useState(0);
  const unreadCount = unreadNotificationCount + unreadAnnouncementCount;

  const fetchUnreadCounts = async () => {
    const results = await Promise.allSettled([
      fetch('/api/notifications/unread-count', { credentials: 'include' }).then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        return Number(data?.count) || 0;
      }),
      fetch('/api/announcements/unread-count', { credentials: 'include' }).then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        return Number(data?.count) || 0;
      }),
    ]);
    if (results[0].status === 'fulfilled') setUnreadNotificationCount(results[0].value);
    if (results[1].status === 'fulfilled') setUnreadAnnouncementCount(results[1].value);
  };

  useEffect(() => {
    fetchUnreadCounts();

    const unsub = realtimeHub.subscribe('*', (event) => {
      if (
        event?.type === 'ANNOUNCEMENT_PUBLISHED' ||
        event?.type === 'NOTIFICATION_CREATED' ||
        event?.type === 'ANNOUNCEMENT_UPDATED'
      ) {
        fetchUnreadCounts();
      }
    });

    const handleNotificationsUpdated = () => fetchUnreadCounts();
    window.addEventListener('sentinel:notifications-updated', handleNotificationsUpdated);

    return () => {
      unsub();
      window.removeEventListener('sentinel:notifications-updated', handleNotificationsUpdated);
    };
  }, []);

  const { theme, toggleTheme, isDark } = useTheme();

  const [cronMessage, setCronMessage] = useState<string | null>(null);

  // System Status Popover state
  const [isSystemStatusOpen, setIsSystemStatusOpen] = useState(false);
  const systemStatusRef = useRef<HTMLDivElement>(null);

  // User Menu Popover state
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // PostgreSQL API status
  const [databaseStatus, setDatabaseStatus] = useState<'online' | 'error' | 'checking' | 'offline'>('checking');
  const [databaseLatency, setDatabaseLatency] = useState<number | null>(null);

  // Realtime Pusher/SSE status
  const [realtimeStatus, setRealtimeStatus] = useState<ConnectionStatus>(() => realtimeHub.getStatus());
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = realtimeHub.onStatusChange((status, details) => {
      setRealtimeStatus(status);
      if (details?.error) {
        setRealtimeError(details.error);
      } else if (status === 'CONNECTED') {
        setRealtimeError(null);
      }
    });
    return () => unsub();
  }, []);

  const [adminContext, setAdminContext] = useState<{ active: boolean; context?: { targetTenantId: string; targetTenantName: string } } | null>(null);
  const [tenants, setTenants] = useState<any[]>([]);

  useEffect(() => {
    const fetchContextStatus = async () => {
      if (activeUser?.role !== 'PLATFORM_MASTER') return;
      try {
        const res = await fetch('/api/admin/context-status');
        if (res.ok) {
          const data = await res.json();
          setAdminContext(data);
        }
      } catch {}
    };

    const fetchTenants = async () => {
      if (activeUser?.role !== 'PLATFORM_MASTER') return;
      try {
        const res = await fetch('/api/saas/tenants');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setTenants(data);
          }
        }
      } catch (e) {
        console.error('[Header] Erro ao carregar tenants:', e);
      }
    };

    if (activeUser?.role === 'PLATFORM_MASTER') {
      fetchContextStatus();
      fetchTenants();
    }
  }, [activeUser?.id, activeUser?.role]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (systemStatusRef.current && !systemStatusRef.current.contains(event.target as Node)) {
        setIsSystemStatusOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCompanySwitch = async (targetValue: string) => {
    try {
      if (targetValue === 'PLATFORM') {
        const res = await fetch('/api/admin/exit-context', { method: 'POST' });
        if (res.ok) {
          StorageService.clearBusinessCache();
          window.location.reload();
        } else {
          alert('Erro ao retornar ao contexto global.');
        }
      } else {
        const isPlatformMaster = activeUser?.role === 'PLATFORM_MASTER';
        const res = await fetch(isPlatformMaster ? '/api/admin/switch-tenant' : '/api/auth/switch-tenant', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isPlatformMaster ? { targetTenantId: targetValue } : { tenantId: targetValue }),
        });
        if (res.ok) {
          StorageService.clearBusinessCache();
          window.location.reload();
        } else {
          const errData = await res.json();
          alert(errData.message || errData.error || 'Erro ao trocar de empresa.');
        }
      }
    } catch (err) {
      console.error('[Header] Erro ao alternar contexto:', err);
      alert('Erro de conexão ao trocar de empresa.');
    }
  };

  const [serverHealth, setServerHealth] = useState<{
    status: string;
    api: string;
    database: string;
    realtime: string;
    storage: string;
  } | null>(null);

  const checkServerHealth = async () => {
    if (!navigator.onLine) {
      setServerHealth({ status: 'offline', api: 'unreachable', database: 'unreachable', realtime: 'unreachable', storage: 'unreachable' });
      setDatabaseStatus('offline');
      setDatabaseLatency(null);
      return;
    }

    setDatabaseStatus('checking');
    const startedAt = performance.now();
    try {
      const res = await fetch('/api/health', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setServerHealth({ ...data, status: data?.status || 'ok', api: 'healthy', database: data?.database || 'healthy' });
        setDatabaseLatency(Math.round(performance.now() - startedAt));
        setDatabaseStatus(data?.database === 'unreachable' ? 'error' : 'online');
      } else {
        setServerHealth({
          ...data,
          status: data?.status || 'degraded',
          api: data?.status === 'degraded' ? 'healthy' : 'unreachable',
          database: data?.database || 'unreachable',
          realtime: 'degraded',
          storage: 'degraded',
        });
        setDatabaseStatus('error');
        setDatabaseLatency(null);
      }
    } catch {
      setServerHealth({
        status: 'offline',
        api: 'unreachable',
        database: 'unreachable',
        realtime: 'unreachable',
        storage: 'unreachable',
      });
      setDatabaseStatus('error');
      setDatabaseLatency(null);
    }
  };

  useEffect(() => {
    checkServerHealth();
    const handleOnline = () => checkServerHealth();
    const handleOffline = () => {
      setServerHealth({ status: 'offline', api: 'unreachable', database: 'unreachable', realtime: 'unreachable', storage: 'unreachable' });
      setDatabaseStatus('offline');
      setDatabaseLatency(null);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(checkServerHealth, 30000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleTriggerCron = async () => {
    setIsUserMenuOpen(false);
    const res = await AutomationService.runPortabilityCron();
    setCronMessage(
      `Verificação concluída: ${res.checkedCount} propostas verificadas | ${res.saldoRetornadoCount} saldos retornados`
    );
    setTimeout(() => setCronMessage(null), 4000);
  };

  const handleResetData = () => {
    setIsUserMenuOpen(false);
    if (process.env.NODE_ENV === 'production') {
      alert('Operação de reset de banco de dados bloqueada em ambiente de produção.');
      return;
    }
    if (confirm('Deseja redefinir os dados para o estado inicial de fábrica (seed)?')) {
      StorageService.resetToInitial();
      window.location.reload();
    }
  };

  // Format display name strictly as [NÍVEL] - [NOME]
  const getUserDisplayTitle = () => {
    if (!activeUser) return 'DIGITADOR - Operador';
    if (activeUser.role === 'PLATFORM_MASTER') {
      if (adminContext?.active && adminContext?.context) {
        const currentT = tenants.find(t => t.id === adminContext.context?.targetTenantId);
        const masterName = currentT?.users?.[0]?.name || 'Master Tenant';
        return `MASTER - ${masterName}`;
      }
      return `MASTER OP - ${activeUser.name}`;
    }
    return `${getRoleLabel(activeUser.role)} - ${activeUser.name}`;
  };

  // Overall system health indicator
  const isHealthy = serverHealth?.status === 'ok' && serverHealth.database === 'healthy';
  const isHealthChecking = serverHealth === null;

  return (
    <header className="sentinel-header h-13 border-b border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-30 transition-transform select-none">
      {onOpenNavigation && (
        <button
          type="button"
          onClick={onOpenNavigation}
          className="md:hidden h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
          aria-label="Abrir menu de navegação"
          aria-controls="app-sidebar"
          aria-expanded={isNavigationOpen}
        >
          <Menu className="h-4 w-4" />
        </button>
      )}
      {redesignPreview && <label className="s2-company-selector"><span>EMPRESA ATUAL</span><select className="ui-input" aria-label="Selecionar empresa" value={activeUser?.role === 'PLATFORM_MASTER' ? adminContext?.context?.targetTenantId || 'PLATFORM' : StorageService.getCurrentTenantId()} onChange={e => handleCompanySwitch(e.target.value)}>
        {activeUser?.role === 'PLATFORM_MASTER' && <option value="PLATFORM">Plataforma</option>}
        {(activeUser?.role === 'PLATFORM_MASTER' ? tenants : (activeUser?.availableMemberships || activeUser?.memberships || []).filter((m:any)=>m.active!==false).map((m:any)=>({id:m.tenantId,name:m.tenantName||m.tenant?.name||'Empresa'}))).map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
        {activeUser?.role !== 'PLATFORM_MASTER' && !(activeUser?.availableMemberships || activeUser?.memberships || []).some((m:any)=>m.tenantId===StorageService.getCurrentTenantId()) && <option value={StorageService.getCurrentTenantId()}>{StorageService.getCurrentTenant().name}</option>}
      </select></label>}
      {/* CENTRO: Busca Global */}
      <div className="flex-1 min-w-0 max-w-xl">
        {redesignPreview ? <button className="s2-global-search" aria-label="Abrir busca universal" onClick={onOpenSearch}><Search size={17}/><span>Buscar páginas, cliente, CPF ou ADE</span><kbd>Ctrl K</kbd></button> : <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
          <input
            id="global-search-input"
            aria-label="Buscar cliente, CPF, ADE, proposta ou parceiro"
            type="text"
            value={searchTerm}
            onChange={e => onGlobalSearch(e.target.value)}
            placeholder="Buscar cliente, CPF, ADE ou parceiro..."
            className="ui-input w-full h-8.5 pl-9 pr-20 text-xs rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] dark:placeholder-[var(--text-secondary)] focus:bg-[var(--bg-surface)] dark:focus:bg-[var(--bg-surface-elevated)] focus:outline-none focus:border-[var(--border-default)] focus:ring-1 focus:ring-[var(--field-border)] transition-transform "
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex items-center gap-0.5 rounded border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] ">
            Ctrl + K
          </kbd>
        </div>}
      </div>

      {/* DIREITA: Status do Sistema, Notificações, Tema, Usuário */}
      <div className="flex items-center gap-1.5 shrink-0">
        {redesignPreview && <div className="hidden md:flex items-center gap-1">{onToggleFavorite && <button className="s2-button" aria-label={isFavorite?'Remover página dos favoritos':'Adicionar página aos favoritos'} aria-pressed={isFavorite} onClick={onToggleFavorite}><Star size={15} fill={isFavorite?'currentColor':'none'}/></button>}{onToggleDensity && <button className="s2-button" aria-label={`Densidade ${density==='compact'?'compacta':'confortável'}; alternar`} onClick={onToggleDensity}><Sliders size={15}/></button>}</div>}
        {/* Status do Sistema (Consolidated Popover) */}
        <div className="relative" ref={systemStatusRef}>
          <button
            id="btn-system-status"
            onClick={() => setIsSystemStatusOpen(!isSystemStatusOpen)}
            className="flex items-center gap-1.5 h-[var(--header-control-height)] px-2.5 rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] transition-transform cursor-pointer"
            title="Status dos Serviços"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthChecking
                  ? 'bg-[var(--bg-surface-elevated)]'
                  : isHealthy
                  ? 'bg-[var(--action)] '
                  : 'bg-[var(--action)] animate-pulse'
              }`}
            />
            <span className="hidden xl:inline text-[11px] font-bold">
              {isHealthChecking ? 'Verificando' : isHealthy ? 'Operacional' : 'Atenção'}
            </span>
          </button>

          {isSystemStatusOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3.5  z-50 animate-in fade-in duration-100 text-xs">
              <div className="flex items-center justify-between border-b border-[var(--border-default)] dark:border-[var(--border-default)] pb-2 mb-2.5">
                <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                  Status dos Serviços
                </span>
                <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border ${isHealthChecking ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--border-default)] dark:text-[var(--text-primary)]' : isHealthy ? 'bg-[var(--action)] text-[var(--action-ink)] dark:text-[var(--action-ink)] border-[var(--border-default)]' : 'bg-[var(--action)] text-[var(--action-ink)] dark:text-[var(--action-ink)] border-[var(--border-default)]'}`}>
                  {isHealthChecking ? 'VERIFICANDO' : isHealthy ? 'OPERACIONAL' : 'ATENÇÃO'}
                </span>
              </div>

              <div className="space-y-2">
                {/* Realtime Connection */}
                <div className="flex items-center justify-between py-1 border-b border-[var(--border-default)] dark:border-[var(--border-default)]">
                  <div className="flex items-center gap-2">
                    <Radio className="h-3.5 w-3.5 text-[var(--info-text)]" />
                    <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">Conexão em Tempo Real</span>
                  </div>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded font-mono ${realtimeStatus === 'CONNECTED' ? 'bg-[var(--action)] text-[var(--action-ink)] dark:text-[var(--action-ink)]' : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]'}`}>
                    {realtimeStatus === 'CONNECTED' ? 'CONECTADA' : realtimeStatus === 'CONNECTING' ? 'CONECTANDO' : 'DESCONECTADA'}
                  </span>
                </div>

                {/* Secure Sync */}
                <div className="flex items-center justify-between py-1 border-b border-[var(--border-default)] dark:border-[var(--border-default)]">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-[var(--success-text)]" />
                    <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">API da Plataforma</span>
                  </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${serverHealth?.status === 'ok' ? 'bg-[var(--action)] text-[var(--action-ink)] dark:text-[var(--action-ink)]' : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]'}`}>
                    {serverHealth ? (serverHealth.status === 'ok' ? 'DISPONÍVEL' : 'INDISPONÍVEL') : 'VERIFICANDO'}
                  </span>
                </div>

                {/* API e banco consultados pelo endpoint de saúde */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-[var(--info-text)]" />
                    <span className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">Banco de dados</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-bold font-mono ${databaseStatus === 'online' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : databaseStatus === 'checking' ? 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)]' : 'text-[var(--danger-text)] dark:text-[var(--danger-text)]'}`}>
                      {databaseStatus === 'online' ? 'CONECTADO' : databaseStatus === 'checking' ? 'VERIFICANDO' : 'INDISPONÍVEL'}
                    </span>
                    {databaseLatency !== null && (
                      <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                        ({databaseLatency}ms)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={checkServerHealth}
                className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-xs py-1.5 font-bold transition-transform cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${databaseStatus === 'checking' ? 'animate-spin' : ''}`} />
                <span>Verificar API e banco</span>
              </button>
            </div>
          )}
        </div>

        {/* Notificações */}
        <button
          id="btn-notifications-header"
          onClick={onOpenNotifications}
          className="relative h-[var(--header-control-height)] w-[var(--header-control-height)] flex items-center justify-center rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] transition-transform cursor-pointer "
          title="Notificações do Sistema"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[var(--action)] text-[9px] font-black text-[var(--action-ink)] ring-2 ring-white dark:ring-[var(--field-border)] ">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Modo Foco Toggle */}
        {onToggleFocusMode && (
          <button
            id="btn-toggle-focus"
            onClick={onToggleFocusMode}
            className="h-[var(--header-control-height)] w-[var(--header-control-height)] hidden md:flex items-center justify-center rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] transition-transform cursor-pointer "
            title="Modo Foco (Alt+F)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Tema Toggle */}
        <button
          id="btn-theme-toggle"
          onClick={toggleTheme}
          className="h-[var(--header-control-height)] w-[var(--header-control-height)] flex items-center justify-center rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] transition-transform cursor-pointer "
          title={isDark ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'}
        >
          {isDark ? <Sun className="h-4 w-4 text-[var(--warning-text)]" /> : <Moon className="h-4 w-4 text-[var(--text-secondary)]" />}
        </button>

        {/* Usuário, Perfil & Menu Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            id="btn-user-profile-menu"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 h-[var(--header-control-height)] px-2.5 rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] transition-transform cursor-pointer "
            title={getUserDisplayTitle()}
          >
            <div className="h-5.5 w-5.5 rounded-md    text-[var(--text-primary)] text-[10px] font-black flex items-center justify-center shrink-0 ">
              {activeUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] max-w-[150px] truncate hidden md:inline">
              {getUserDisplayTitle()}
            </span>
            <ChevronDown className="h-3 w-3 text-[var(--text-secondary)] shrink-0" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2.5  z-50 animate-in fade-in duration-100 text-xs">
              {/* User Info Header */}
              <div className="px-2.5 py-2 border-b border-[var(--border-default)] dark:border-[var(--border-default)] mb-2">
                <p className="font-black text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">
                  {getUserDisplayTitle()}
                </p>
                <p className="text-[10.5px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-mono truncate">
                  {activeUser?.email || 'usuario@sentinel.com'}
                </p>
              </div>

              {/* Context Selector for PLATFORM_MASTER */}
              {activeUser?.role === 'PLATFORM_MASTER' && !redesignPreview && (
                <div className="px-2 py-1.5 mb-2 border-b border-[var(--border-default)] dark:border-[var(--border-default)]">
                  <label className="text-[9.5px] font-black uppercase tracking-wider text-[var(--text-secondary)] block mb-1">
                    Selecionar Empresa
                  </label>
                  <select
                    value={adminContext?.active && adminContext?.context ? adminContext.context.targetTenantId : 'PLATFORM'}
                    onChange={e => handleCompanySwitch(e.target.value)}
                    className="ui-input w-full text-[11px] font-semibold rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-2 py-1.5 text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                  >
                    <option value="PLATFORM">🌐 [MASTER OP] PLATAFORMA</option>
                    {tenants.map(t => {
                      const masters = t.users || [];
                      const masterUser = masters[0];
                      let displayLabel = `🏢 [MASTER] ${t.name}`;
                      if (masters.length === 0) {
                        displayLabel += ' [Nenhum MASTER cadastrado/ativo]';
                      } else if (masters.length > 1) {
                        displayLabel += ' [CONFLITO: Múltiplos MASTERs]';
                      } else if (masterUser) {
                        displayLabel += ` (${masterUser.name})`;
                      }
                      return (
                        <option key={t.id} value={t.id}>
                          {displayLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {redesignPreview && <div className="px-2 pb-2 border-b border-[var(--border-default)] dark:border-[var(--border-default)] mb-2">{onToggleFavorite && <button className="s2-text-button w-full py-2" onClick={onToggleFavorite}><Star size={14}/>{isFavorite?'Remover favorito':'Favoritar esta página'}</button>}{onToggleDensity && <button className="s2-text-button w-full py-2" onClick={onToggleDensity}><Sliders size={14}/>Densidade: {density==='compact'?'compacta':'confortável'}</button>}</div>}
              {/* Quick Actions */}
              <div className="space-y-0.5">
                {onOpenBackupModal && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenBackupModal();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-left font-semibold transition-transform cursor-pointer"
                  >
                    <Database className="h-3.5 w-3.5 text-[var(--info-text)]" />
                    <span>Backup & Snapshots</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenTestRunner();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-left font-semibold transition-transform cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--info-text)]" />
                  <span>Central de Testes</span>
                </button>

                <button
                  onClick={handleTriggerCron}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-left font-semibold transition-transform cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 text-[var(--success-text)]" />
                  <span>Atualizar Prazos e Saldos</span>
                </button>

                {onOpenShortcuts && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenShortcuts();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-left font-semibold transition-transform cursor-pointer"
                  >
                    <Keyboard className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                    <span>Atalhos de Teclado (?)</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsChangePasswordOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-left font-semibold transition-transform cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[var(--warning-text)]" />
                  <span>Alterar senha</span>
                </button>

                <div className="border-t border-[var(--border-default)] dark:border-[var(--border-default)] my-1" />

                <button
                  onClick={handleResetData}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] font-semibold text-left transition-transform cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Redefinir Dados (Seed)</span>
                </button>

                <button
                  disabled={isLoggingOut}
                  onClick={async () => {
                    if (logoutPending.current) return;
                    logoutPending.current = true;
                    setIsLoggingOut(true);
                    setLogoutError(null);
                    try {
                      await StorageService.logout();
                      window.location.reload();
                    } catch {
                      setLogoutError('Não foi possível encerrar a sessão. Verifique sua conexão e tente novamente.');
                      logoutPending.current = false;
                      setIsLoggingOut(false);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold text-left transition-transform cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{isLoggingOut ? 'Encerrando sessão…' : 'Sair do Sistema'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {logoutError && <div role="alert" className="absolute top-14 right-4 z-50 max-w-sm rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-text)]">{logoutError}</div>}
      {/* Floating Cron Toast */}
      {isChangePasswordOpen && <ChangePasswordModal onClose={() => setIsChangePasswordOpen(false)} />}
      {cronMessage && (
        <div className="absolute top-14 right-4 z-50 rounded-lg border border-[var(--border-default)] dark:border-[var(--border-default)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] px-3.5 py-2 text-xs text-[var(--success-text)] dark:text-[var(--success-text)]  flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-[var(--success-text)] dark:text-[var(--success-text)] animate-pulse" />
          <span>{cronMessage}</span>
        </div>
      )}
    </header>
  );
};
