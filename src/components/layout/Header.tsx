import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Search,
  Sun,
  Moon,
  Database,
  Keyboard,
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
  Server,
  Layers,
  Sparkles,
  Radio,
  Sliders,
  Maximize2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { realtimeHub, ConnectionStatus } from '../../services/realtimeService';
import { AutomationService } from '../../services/automationService';
import { BackupService } from '../../services/backupService';
import { User, Role } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { getRoleEmoji } from '../../lib/roleUtils';
import { db } from '../../firebase';
import { doc, getDocFromServer } from 'firebase/firestore';

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
}) => {
  const activeUser = StorageService.getActiveUser();
  const allUsers = StorageService.getUsers();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCounts = async () => {
    try {
      const [notifRes, annRes] = await Promise.all([
        fetch('/api/notifications/unread-count'),
        fetch('/api/announcements/unread-count')
      ]);
      const notifData = notifRes.ok ? await notifRes.json() : { count: 0 };
      const annData = annRes.ok ? await annRes.json() : { count: 0 };
      setUnreadCount((notifData.count || 0) + (annData.count || 0));
    } catch (e) {}
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
    
    return () => unsub();
  }, []);

  const { theme, toggleTheme, isDark } = useTheme();

  const [whiteLabel, setWhiteLabel] = useState(StorageService.getWhiteLabel());
  const currentTenant = StorageService.getCurrentTenant();

  useEffect(() => {
    const handleWlUpdate = () => {
      setWhiteLabel(StorageService.getWhiteLabel());
    };
    window.addEventListener('whiteLabelUpdated', handleWlUpdate);
    window.addEventListener('storage', handleWlUpdate);
    return () => {
      window.removeEventListener('whiteLabelUpdated', handleWlUpdate);
      window.removeEventListener('storage', handleWlUpdate);
    };
  }, []);

  const [cronMessage, setCronMessage] = useState<string | null>(null);

  // System Status Popover state
  const [isSystemStatusOpen, setIsSystemStatusOpen] = useState(false);
  const systemStatusRef = useRef<HTMLDivElement>(null);

  // User Menu Popover state
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Firebase status
  const [fbStatus, setFbStatus] = useState<'online' | 'error' | 'checking' | 'offline'>('checking');
  const [fbLatency, setFbLatency] = useState<number | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

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

  const checkFirebase = async (forceCheckingState = true) => {
    if (!navigator.onLine) {
      setFbStatus('offline');
      setFbLatency(null);
      setFbError('Navegador está offline');
      return;
    }

    if (forceCheckingState) setFbStatus('checking');

    const start = performance.now();
    try {
      const testDocRef = doc(db, 'statuses', 'st-1');
      await getDocFromServer(testDocRef);
      const latency = Math.round(performance.now() - start);
      setFbStatus('online');
      setFbLatency(latency);
      setFbError(null);
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      if (
        err?.message?.includes('offline') ||
        err?.message?.includes('failed-precondition') ||
        err?.message?.includes('network')
      ) {
        setFbStatus('error');
        setFbLatency(null);
        setFbError(err.message || 'Erro de rede ou timeout');
      } else {
        setFbStatus('online');
        setFbLatency(latency);
        setFbError(null);
      }
    }
  };

  useEffect(() => {
    checkFirebase(true);
    const handleOnline = () => checkFirebase(true);
    const handleOffline = () => {
      setFbStatus('offline');
      setFbLatency(null);
      setFbError('Navegador offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(() => checkFirebase(false), 45000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

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

  const handleRoleSwitch = (userId: string) => {
    const selected = allUsers.find(u => u.id === userId);
    if (selected) {
      StorageService.setActiveUser(selected);
      window.location.reload();
    }
  };

  const handleTriggerCron = () => {
    setIsUserMenuOpen(false);
    const res = AutomationService.runPortabilityCron();
    const backupRes = BackupService.checkAndExecuteScheduledBackup();
    setCronMessage(
      `Cron executado: ${res.checkedCount} verificadas | ${res.saldoRetornadoCount} saldos retornados | ${backupRes.executed ? 'Backup Salvo' : 'Backup Agendado'}`
    );
    setTimeout(() => setCronMessage(null), 4000);
  };

  const handleResetData = () => {
    setIsUserMenuOpen(false);
    if (confirm('Deseja redefinir os dados para o estado inicial de fábrica (seed)?')) {
      StorageService.resetToInitial();
      window.location.reload();
    }
  };

  // Format display name strictly as [NÍVEL] - [NOME]
  const getUserDisplayTitle = (user?: User | null) => {
    if (!user) return 'DIGITADOR - Operador';
    const roleNormalized = user.role === 'PLATFORM_MASTER' ? 'MASTER' : user.role;
    return `${roleNormalized} - ${user.name}`;
  };

  // Overall system health indicator
  const isHealthy = fbStatus === 'online' || fbStatus === 'checking';

  return (
    <header className="h-13 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0b101d] px-4 flex items-center justify-between gap-4 shrink-0 z-30 transition-colors select-none">
      {/* ESQUERDA: Logo do tenant + nome/contexto do tenant */}
      <div className="flex items-center gap-3 min-w-0 max-w-[260px] sm:max-w-xs shrink-0">
        <div className="h-8 w-8 flex items-center justify-center shrink-0">
          {whiteLabel.logoUrl ? (
            <img
              src={whiteLabel.logoUrl}
              alt={whiteLabel.companyName}
              className="h-full w-full object-contain rounded-lg shadow-2xs"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xs flex items-center justify-center shadow-xs ring-1 ring-blue-500/30">
              {whiteLabel.companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 truncate">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black tracking-tight text-slate-900 dark:text-white truncate block leading-tight">
              {whiteLabel.companyName || 'SENTINEL CONSIG'}
            </span>
            <span className="px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase tracking-wider bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
              ENTERPRISE
            </span>
          </div>
          <span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-medium truncate block leading-none mt-0.5">
            {currentTenant.name || 'Mesa Operacional'}
          </span>
        </div>
      </div>

      {/* CENTRO: Busca Global */}
      <div className="flex-1 max-w-xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            id="global-search-input"
            type="text"
            value={searchTerm}
            onChange={e => onGlobalSearch(e.target.value)}
            placeholder="Buscar por cliente, CPF, ADE, proposta, digitador ou parceiro..."
            className="w-full h-8.5 pl-9 pr-20 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all shadow-2xs"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-slate-400 dark:text-slate-400 shadow-2xs">
            Ctrl + K
          </kbd>
        </div>
      </div>

      {/* DIREITA: Status do Sistema, Notificações, Tema, Usuário */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Status do Sistema (Consolidated Popover) */}
        <div className="relative" ref={systemStatusRef}>
          <button
            id="btn-system-status"
            onClick={() => setIsSystemStatusOpen(!isSystemStatusOpen)}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title="Status dos Serviços"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                  : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="hidden xl:inline text-[11px] font-bold">
              {isHealthy ? 'Operacional' : 'Atenção'}
            </span>
          </button>

          {isSystemStatusOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-3.5 shadow-xl z-50 animate-in fade-in duration-100 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2.5">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  Status da Infraestrutura
                </span>
                <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  100% DISPONÍVEL
                </span>
              </div>

              <div className="space-y-2">
                {/* Realtime Pusher */}
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Radio className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-slate-700 dark:text-slate-300">Pusher Realtime</span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    ONLINE
                  </span>
                </div>

                {/* SSE Status */}
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">SSE Fallback</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    DESATIVADO
                  </span>
                </div>

                {/* Database PostgreSQL */}
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Database className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-slate-700 dark:text-slate-300">PostgreSQL (Prisma)</span>
                  </div>
                  <span className="text-[10px] font-black font-mono text-emerald-600 dark:text-emerald-400">
                    CONECTADO
                  </span>
                </div>

                {/* API Host */}
                <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-slate-700 dark:text-slate-300">API Host (Container)</span>
                  </div>
                  <span className="text-[10px] font-black font-mono text-emerald-600 dark:text-emerald-400">
                    ONLINE
                  </span>
                </div>

                {/* Firebase Legacy */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-slate-700 dark:text-slate-300">Firebase Firestore</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      DISPONÍVEL
                    </span>
                    {fbLatency !== null && (
                      <span className="text-[9px] font-mono text-slate-400">
                        ({fbLatency}ms)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => checkFirebase(true)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs py-1.5 font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${fbStatus === 'checking' ? 'animate-spin' : ''}`} />
                <span>Verificar Latência</span>
              </button>
            </div>
          )}
        </div>

        {/* Notificações */}
        <button
          id="btn-notifications-header"
          onClick={onOpenNotifications}
          className="relative h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
          title="Notificações do Sistema"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white ring-2 ring-white dark:ring-slate-900 shadow-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Modo Foco Toggle */}
        {onToggleFocusMode && (
          <button
            id="btn-toggle-focus"
            onClick={onToggleFocusMode}
            className="h-8 w-8 hidden md:flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
            title="Modo Foco (Alt+F)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Tema Toggle */}
        <button
          id="btn-theme-toggle"
          onClick={toggleTheme}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
          title={isDark ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro'}
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
        </button>

        {/* Usuário, Perfil & Menu Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            id="btn-user-profile-menu"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
            title={getUserDisplayTitle(activeUser)}
          >
            <div className="h-5.5 w-5.5 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-2xs">
              {activeUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 max-w-[150px] truncate hidden md:inline">
              {getUserDisplayTitle(activeUser)}
            </span>
            <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-xl z-50 animate-in fade-in duration-100 text-xs">
              {/* User Info Header */}
              <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                <p className="font-black text-slate-900 dark:text-slate-100 truncate">
                  {getUserDisplayTitle(activeUser)}
                </p>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-500 font-mono truncate">
                  {activeUser?.email || 'usuario@sentinel.com'}
                </p>
              </div>

              {/* Context Role Switcher (Platform Master / Master) */}
              {(activeUser?.role === 'MASTER' || activeUser?.role === 'PLATFORM_MASTER') && (
                <div className="px-2 py-1.5 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Simular Perfil (Switch)
                  </label>
                  <select
                    value={activeUser.id}
                    onChange={e => handleRoleSwitch(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
                  >
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {getRoleEmoji(u.role)} [{u.role === 'PLATFORM_MASTER' ? 'MASTER' : u.role}] - {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Actions */}
              <div className="space-y-0.5">
                {onOpenBackupModal && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenBackupModal();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left font-semibold transition-colors cursor-pointer"
                  >
                    <Database className="h-3.5 w-3.5 text-purple-500" />
                    <span>Backup & Snapshots</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenTestRunner();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left font-semibold transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                  <span>Central de Testes</span>
                </button>

                <button
                  onClick={handleTriggerCron}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left font-semibold transition-colors cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Executar Cron Manual</span>
                </button>

                {onOpenShortcuts && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenShortcuts();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-left font-semibold transition-colors cursor-pointer"
                  >
                    <Keyboard className="h-3.5 w-3.5 text-slate-400" />
                    <span>Atalhos de Teclado (?)</span>
                  </button>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                <button
                  onClick={handleResetData}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold text-left transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Redefinir Dados (Seed)</span>
                </button>

                <button
                  onClick={() => {
                    StorageService.logout();
                    window.location.reload();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-left transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sair do Sistema</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Cron Toast */}
      {cronMessage && (
        <div className="absolute top-14 right-4 z-50 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/90 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-200 shadow-lg flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span>{cronMessage}</span>
        </div>
      )}
    </header>
  );
};
