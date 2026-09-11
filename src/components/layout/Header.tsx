import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Search,
  Play,
  RotateCcw,
  CheckCircle2,
  Zap,
  Sun,
  Moon,
  Database,
  Keyboard,
  Maximize2,
  Minimize2,
  Sparkles,
  Wrench,
  ChevronDown,
  LogOut,
  Wifi,
  WifiOff,
  Activity,
  RefreshCw,
  Palette,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { AutomationService } from '../../services/automationService';
import { BackupService } from '../../services/backupService';
import { User, Role } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { ROLE_CONFIG, getRoleEmoji } from '../../lib/roleUtils';
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
  isFocusMode = false,
  onGlobalSearch,
  searchTerm,
  onNavigate,
}) => {
  const activeUser = StorageService.getActiveUser();
  const allUsers = StorageService.getUsers();
  const notifications = StorageService.getNotifications();
  const unreadCount = notifications.filter(n => !n.read).length;
  const { theme, toggleTheme, isDark } = useTheme();

  const [whiteLabel, setWhiteLabel] = useState(StorageService.getWhiteLabel());

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
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Firebase connection status state
  const [fbStatus, setFbStatus] = useState<'online' | 'error' | 'checking' | 'offline'>('checking');
  const [fbLatency, setFbLatency] = useState<number | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);
  const [isFbStatusOpen, setIsFbStatusOpen] = useState(false);
  const fbMenuRef = useRef<HTMLDivElement>(null);

  const checkFirebase = async (forceCheckingState = true) => {
    if (!navigator.onLine) {
      setFbStatus('offline');
      setFbLatency(null);
      setFbError('Navegador está offline');
      return;
    }

    if (forceCheckingState) {
      setFbStatus('checking');
    }

    const start = performance.now();
    try {
      // Query st-1 which always exists in default operational states
      const testDocRef = doc(db, 'statuses', 'st-1');
      await getDocFromServer(testDocRef);
      const latency = Math.round(performance.now() - start);
      setFbStatus('online');
      setFbLatency(latency);
      setFbError(null);
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      if (err?.message?.includes('offline') || err?.message?.includes('failed-precondition') || err?.message?.includes('network')) {
        setFbStatus('error');
        setFbLatency(null);
        setFbError(err.message || 'Erro de rede ou timeout');
      } else {
        // Any other response (like permission denied) means we hit the server, so online!
        setFbStatus('online');
        setFbLatency(latency);
        setFbError(null);
      }
    }
  };

  useEffect(() => {
    checkFirebase(true);

    const handleOnline = () => {
      checkFirebase(true);
    };

    const handleOffline = () => {
      setFbStatus('offline');
      setFbLatency(null);
      setFbError('Navegador está offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      checkFirebase(false);
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  // Close Firebase dropdown on outside click
  useEffect(() => {
    const handleClickOutsideFb = (event: MouseEvent) => {
      if (fbMenuRef.current && !fbMenuRef.current.contains(event.target as Node)) {
        setIsFbStatusOpen(false);
      }
    };
    if (isFbStatusOpen) {
      document.addEventListener('mousedown', handleClickOutsideFb);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideFb);
    };
  }, [isFbStatusOpen]);

  // Close tools dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    };
    if (isToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen]);

  const handleRoleSwitch = (userId: string) => {
    const selected = allUsers.find(u => u.id === userId);
    if (selected) {
      StorageService.setActiveUser(selected);
      window.location.reload(); // Refresh to re-render role-specific menus
    }
  };

  const handleTriggerCron = () => {
    setIsToolsOpen(false);
    const res = AutomationService.runPortabilityCron();
    const backupRes = BackupService.checkAndExecuteScheduledBackup();
    setCronMessage(
      `Cron executado: ${res.checkedCount} verificadas | ${res.saldoRetornadoCount} saldos retornados | ${backupRes.executed ? 'Backup Cron Salvo' : 'Backup Agendado'}`
    );
    setTimeout(() => setCronMessage(null), 5000);
  };

  const handleResetData = () => {
    setIsToolsOpen(false);
    if (confirm('Deseja redefinir os dados para o estado inicial de fábrica (seed)?')) {
      StorageService.resetToInitial();
      window.location.reload();
    }
  };

  const roleColors: Record<Role, string> = {
    MASTER: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    GESTOR: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    GERENTE: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    SUPORTE: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    DIGITADOR: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    SIMULACAO: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 md:px-6 shadow-xs transition-colors">
      {/* Brand & Logo */}
      <div className="flex items-center gap-2.5 shrink-0 mr-3 md:mr-5">
        <div className="h-9 w-9 flex items-center justify-center shrink-0">
          {whiteLabel.logoUrl ? (
            <img
              src={whiteLabel.logoUrl}
              alt={whiteLabel.companyName}
              className="h-full w-full object-contain filter drop-shadow-sm"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
              {whiteLabel.companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="hidden sm:block">
          <span className="text-xs font-black tracking-wider text-slate-900 dark:text-white leading-none block">
            {whiteLabel.companyName}
          </span>
          <span className="text-[9px] font-extrabold text-blue-600 dark:text-blue-400 tracking-widest uppercase block mt-0.5">
            {whiteLabel.tradeName || 'SISTEMA MULTI-PROMOTORA'}
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            id="global-search-input"
            type="text"
            value={searchTerm}
            onChange={e => onGlobalSearch(e.target.value)}
            placeholder="Busca rápida: CPF, Nome, ADE, Banco, Status... (Ctrl+K)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-20 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchTerm ? (
              <button
                onClick={() => onGlobalSearch('')}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-200 dark:bg-slate-700 rounded px-1.5 py-0.5"
              >
                Limpar
              </button>
            ) : (
              <kbd className="hidden sm:inline rounded border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                Ctrl+K
              </kbd>
            )}
          </div>
        </div>
      </div>

      {/* Right Controls - Streamlined & Clean */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Modo Foco Toggle Button */}
        {onToggleFocusMode && (
          <button
            id="btn-toggle-focus-mode"
            onClick={onToggleFocusMode}
            title={isFocusMode ? 'Sair do Modo Foco (Esc)' : 'Ativar Modo Foco (Alt+F / Ctrl+B)'}
            className={`p-2 rounded-lg border transition-colors ${
              isFocusMode
                ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}

        {/* Dark Mode Toggle */}
        <button
          id="btn-toggle-theme"
          onClick={toggleTheme}
          title={isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          )}
        </button>

        {/* Notification Bell */}
        <button
          id="btn-open-notifications"
          onClick={onOpenNotifications}
          className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Central de Notificações"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Firebase Connection Status Badge & Popover */}
        <div className="relative" ref={fbMenuRef}>
          <button
            id="btn-firebase-status"
            onClick={() => setIsFbStatusOpen(!isFbStatusOpen)}
            title="Verificar status de conexão com Firebase"
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
              fbStatus === 'online'
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                : fbStatus === 'checking'
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                : fbStatus === 'offline'
                ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            }`}
          >
            {fbStatus === 'online' ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            ) : fbStatus === 'offline' ? (
              <WifiOff className="h-3.5 w-3.5 text-slate-400" />
            ) : fbStatus === 'checking' ? (
              <RefreshCw className="h-3.5 w-3.5 text-amber-500 animate-spin" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-rose-500" />
            )}
            <span className="hidden md:inline">
              {fbStatus === 'online'
                ? 'Firebase OK'
                : fbStatus === 'checking'
                ? 'Conectando...'
                : fbStatus === 'offline'
                ? 'Offline'
                : 'Erro Firebase'}
            </span>
            {fbStatus === 'online' && fbLatency !== null && (
              <span className="hidden lg:inline text-[9px] font-mono opacity-80">
                ({fbLatency}ms)
              </span>
            )}
          </button>

          {isFbStatusOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Monitor Firebase
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Nuvem Real-time
                </span>
              </div>

              <div className="space-y-3">
                {/* Connection Indicator Bar */}
                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2.5 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      fbStatus === 'online'
                        ? 'bg-emerald-500 animate-pulse'
                        : fbStatus === 'checking'
                        ? 'bg-amber-500 animate-pulse'
                        : fbStatus === 'offline'
                        ? 'bg-slate-400'
                        : 'bg-rose-500 animate-pulse'
                    }`} />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {fbStatus === 'online'
                        ? 'Conectado à nuvem'
                        : fbStatus === 'checking'
                        ? 'Verificando conexão...'
                        : fbStatus === 'offline'
                        ? 'Dispositivo Offline'
                        : 'Erro de Comunicação'}
                    </span>
                  </div>
                  {fbLatency !== null && (
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-700/50 px-1.5 py-0.5 rounded">
                      {fbLatency}ms latência
                    </span>
                  )}
                </div>

                {/* Connection metadata properties */}
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-slate-500">Projeto Firebase:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300 select-all truncate max-w-[140px]" title="gen-lang-client-0830510735">
                      gen-lang-client-0830510735
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-slate-500">Banco de Dados:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">
                      (default)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-slate-500">Canal de Rede:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${navigator.onLine ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      {navigator.onLine ? 'Internet Ativa' : 'Desconectado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-slate-500">Modo de Persistência:</span>
                    <span className="text-slate-700 dark:text-slate-300">Sincronia + Cache Local</span>
                  </div>
                </div>

                {fbError && (
                  <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 rounded-lg p-2 text-[10px] text-rose-600 dark:text-rose-400 font-mono break-words leading-relaxed max-h-24 overflow-y-auto">
                    <strong>Erro:</strong> {fbError}
                  </div>
                )}

                {/* Interactive ping button */}
                <button
                  onClick={() => checkFirebase(true)}
                  disabled={fbStatus === 'checking'}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-xs py-2 px-3 shadow-xs hover:shadow-sm active:scale-[0.98] transition-all"
                >
                  <Activity className={`h-3.5 w-3.5 ${fbStatus === 'checking' ? 'animate-pulse' : ''}`} />
                  {fbStatus === 'checking' ? 'Verificando...' : 'Testar Conectividade'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Consolidated System & Tools Dropdown Menu */}
        <div className="relative" ref={toolsMenuRef}>
          <button
            id="btn-system-tools-menu"
            onClick={() => setIsToolsOpen(!isToolsOpen)}
            title="Ferramentas, Testes e Ajuda"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              isToolsOpen
                ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Wrench className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Ferramentas</span>
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isToolsOpen ? 'rotate-180' : ''}`} />
          </button>

          {isToolsOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                Ações Rápidas & Sistema
              </div>

              <div className="space-y-0.5 py-1">
                {/* Tour Guiado */}
                {onOpenTour && (
                  <button
                    id="menu-btn-open-tour"
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenTour();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-300 transition-colors text-left"
                  >
                    <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight">Tour Guiado Interativo</p>
                      <p className="text-[10px] text-slate-400">Rever passo a passo do sistema</p>
                    </div>
                  </button>
                )}

                {/* White-Label Personalização */}
                {onOpenWhiteLabel && (
                  <button
                    id="menu-btn-open-whitelabel"
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenWhiteLabel();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors text-left"
                  >
                    <Palette className="h-4 w-4 text-indigo-600 shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight">White-Label & Marca</p>
                      <p className="text-[10px] text-slate-400">Personalizar promotora / licença</p>
                    </div>
                  </button>
                )}

                {/* Database Backup */}
                {onOpenBackupModal && (
                  <button
                    id="menu-btn-open-backup"
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenBackupModal();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-700 dark:hover:text-purple-300 transition-colors text-left"
                  >
                    <Database className="h-4 w-4 text-purple-600 shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight">Backup & Snapshots</p>
                      <p className="text-[10px] text-slate-400">Exportar/Restaurar banco de dados</p>
                    </div>
                  </button>
                )}

                {/* Test Runner */}
                <button
                  id="menu-btn-run-tests"
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenTestRunner();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors text-left"
                >
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="font-semibold leading-tight">Central de Testes</p>
                    <p className="text-[10px] text-slate-400">Validar regras de negócio</p>
                  </div>
                </button>

                {/* Vercel Cron Trigger */}
                <button
                  id="menu-btn-run-cron"
                  onClick={handleTriggerCron}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors text-left"
                >
                  <Play className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold leading-tight">Executar Vercel Cron</p>
                    <p className="text-[10px] text-slate-400">Verificar SLAs e Portabilidade</p>
                  </div>
                </button>

                {/* Keyboard Shortcuts */}
                {onOpenShortcuts && (
                  <button
                    id="menu-btn-open-shortcuts"
                    onClick={() => {
                      setIsToolsOpen(false);
                      onOpenShortcuts();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <Keyboard className="h-4 w-4 text-slate-500 shrink-0" />
                    <div>
                      <p className="font-semibold leading-tight">Atalhos de Teclado</p>
                      <p className="text-[10px] text-slate-400">Pressione ? para abrir</p>
                    </div>
                  </button>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                {/* Reset Seed Button */}
                <button
                  id="menu-btn-reset-data"
                  onClick={handleResetData}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-left"
                >
                  <RotateCcw className="h-4 w-4 text-rose-500 shrink-0" />
                  <div>
                    <p className="font-semibold leading-tight">Redefinir Dados (Seed)</p>
                    <p className="text-[10px] text-rose-400">Restaurar estado de fábrica</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* Live Role & User Switcher */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden lg:block">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight flex items-center justify-end gap-1">
              <span>{getRoleEmoji(activeUser.role)}</span>
              <span>{activeUser.name}</span>
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{activeUser.email}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="user-role-select" className="sr-only">Perfil Ativo</label>
            <div className="relative flex items-center">
              {activeUser.role === 'MASTER' ? (
                <select
                  id="user-role-select"
                  value={activeUser.id}
                  onChange={e => handleRoleSwitch(e.target.value)}
                  className={`text-xs font-bold rounded-lg border px-2.5 py-1.5 cursor-pointer focus:outline-hidden transition-all ${ROLE_CONFIG[activeUser.role].badgeClass}`}
                  title="Trocar usuário e perfil do sistema"
                >
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold py-1">
                      {getRoleEmoji(u.role)} {u.role} — {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  className={`text-xs font-bold rounded-lg border px-2.5 py-1.5 select-none ${ROLE_CONFIG[activeUser.role].badgeClass}`}
                  title={`Perfil Ativo: ${ROLE_CONFIG[activeUser.role].label}`}
                >
                  {getRoleEmoji(activeUser.role)} {activeUser.role}
                </div>
              )}
            </div>

            {/* Logout Button */}
            <button
              id="btn-logout-header"
              onClick={() => {
                StorageService.logout();
                window.location.reload();
              }}
              title="Sair do Sistema (Logout)"
              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/80 transition-colors flex items-center gap-1"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="text-[11px] font-bold hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cron Notification Toast */}
      {cronMessage && (
        <div className="absolute top-16 right-6 z-50 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/90 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 shadow-md flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span>{cronMessage}</span>
        </div>
      )}
    </header>
  );
};

