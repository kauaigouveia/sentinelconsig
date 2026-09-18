import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Kanban,
  ArrowLeftRight,
  Upload,
  Users,
  Search,
  Handshake,
  Building2,
  Headphones,
  Hourglass,
  BarChart3,
  Calculator,
  Tv,
  TrendingUp,
  Bot,
  Trophy,
  DollarSign,
  HardDrive,
  Calendar,
  Layers,
  Sliders,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Sparkles,
  Activity,
  Zap,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { realtimeHub } from '../../services/realtimeService';
import { Role } from '../../types';
import { resolveEffectiveTenantBranding, SYSTEM_IDENTITY } from '../../lib/branding';

import { TenantBranding } from "../../hooks/useTenantBranding";

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  branding?: TenantBranding;
}

type SemanticColor =
  | 'blue'
  | 'cyan'
  | 'violet'
  | 'amber'
  | 'purple'
  | 'yellow'
  | 'emerald'
  | 'indigo'
  | 'sky'
  | 'orange'
  | 'rose'
  | 'fuchsia'
  | 'slate';

interface NavItemConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  color: SemanticColor;
  badge?: {
    text: string;
    variant: 'live' | 'ai' | 'counter' | 'alert';
  };
}

const colorStyles: Record<
  SemanticColor,
  {
    iconInactive: string;
    iconActive: string;
    activeBg: string;
    activeBar: string;
    activeBorder: string;
    badgeBg: string;
  }
> = {
  blue: {
    iconInactive: 'text-blue-500/80 group-hover:text-blue-500 dark:text-blue-400',
    iconActive: 'text-blue-600 dark:text-blue-400',
    activeBg: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-950 dark:text-blue-100 font-bold',
    activeBar: 'bg-blue-600 dark:bg-blue-400 shadow-[0_0_8px_rgba(37,99,235,0.6)]',
    activeBorder: 'border-blue-200/60 dark:border-blue-800/40',
    badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  cyan: {
    iconInactive: 'text-cyan-500/80 group-hover:text-cyan-500 dark:text-cyan-400',
    iconActive: 'text-cyan-600 dark:text-cyan-300',
    activeBg: 'bg-cyan-500/10 dark:bg-cyan-500/15 text-cyan-950 dark:text-cyan-100 font-bold',
    activeBar: 'bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]',
    activeBorder: 'border-cyan-200/60 dark:border-cyan-800/40',
    badgeBg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  },
  violet: {
    iconInactive: 'text-violet-500/80 group-hover:text-violet-500 dark:text-violet-400',
    iconActive: 'text-violet-600 dark:text-violet-300',
    activeBg: 'bg-violet-500/10 dark:bg-violet-500/15 text-violet-950 dark:text-violet-100 font-bold',
    activeBar: 'bg-violet-600 dark:bg-violet-400 shadow-[0_0_8px_rgba(124,58,237,0.6)]',
    activeBorder: 'border-violet-200/60 dark:border-violet-800/40',
    badgeBg: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  purple: {
    iconInactive: 'text-purple-500/80 group-hover:text-purple-500 dark:text-purple-400',
    iconActive: 'text-purple-600 dark:text-purple-300',
    activeBg: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-950 dark:text-purple-100 font-bold',
    activeBar: 'bg-purple-500 dark:bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.6)]',
    activeBorder: 'border-purple-200/60 dark:border-purple-800/40',
    badgeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  },
  amber: {
    iconInactive: 'text-amber-500/80 group-hover:text-amber-500 dark:text-amber-400',
    iconActive: 'text-amber-600 dark:text-amber-300',
    activeBg: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-950 dark:text-amber-100 font-bold',
    activeBar: 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
    activeBorder: 'border-amber-200/60 dark:border-amber-800/40',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  yellow: {
    iconInactive: 'text-yellow-600/80 group-hover:text-yellow-500 dark:text-yellow-400',
    iconActive: 'text-yellow-600 dark:text-yellow-300',
    activeBg: 'bg-yellow-500/10 dark:bg-yellow-500/15 text-yellow-950 dark:text-yellow-100 font-bold',
    activeBar: 'bg-yellow-500 dark:bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.6)]',
    activeBorder: 'border-yellow-200/60 dark:border-yellow-800/40',
    badgeBg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  },
  emerald: {
    iconInactive: 'text-emerald-500/80 group-hover:text-emerald-500 dark:text-emerald-400',
    iconActive: 'text-emerald-600 dark:text-emerald-300',
    activeBg: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 font-bold',
    activeBar: 'bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]',
    activeBorder: 'border-emerald-200/60 dark:border-emerald-800/40',
    badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  indigo: {
    iconInactive: 'text-indigo-500/80 group-hover:text-indigo-500 dark:text-indigo-400',
    iconActive: 'text-indigo-600 dark:text-indigo-300',
    activeBg: 'bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-950 dark:text-indigo-100 font-bold',
    activeBar: 'bg-indigo-600 dark:bg-indigo-400 shadow-[0_0_8px_rgba(79,70,229,0.6)]',
    activeBorder: 'border-indigo-200/60 dark:border-indigo-800/40',
    badgeBg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  },
  sky: {
    iconInactive: 'text-sky-500/80 group-hover:text-sky-500 dark:text-sky-400',
    iconActive: 'text-sky-600 dark:text-sky-300',
    activeBg: 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-950 dark:text-sky-100 font-bold',
    activeBar: 'bg-sky-500 dark:bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.6)]',
    activeBorder: 'border-sky-200/60 dark:border-sky-800/40',
    badgeBg: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  orange: {
    iconInactive: 'text-orange-500/80 group-hover:text-orange-500 dark:text-orange-400',
    iconActive: 'text-orange-600 dark:text-orange-300',
    activeBg: 'bg-orange-500/10 dark:bg-orange-500/15 text-orange-950 dark:text-orange-100 font-bold',
    activeBar: 'bg-orange-500 dark:bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.6)]',
    activeBorder: 'border-orange-200/60 dark:border-orange-800/40',
    badgeBg: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
  rose: {
    iconInactive: 'text-rose-500/80 group-hover:text-rose-500 dark:text-rose-400',
    iconActive: 'text-rose-600 dark:text-rose-300',
    activeBg: 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-950 dark:text-rose-100 font-bold',
    activeBar: 'bg-rose-500 dark:bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]',
    activeBorder: 'border-rose-200/60 dark:border-rose-800/40',
    badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  },
  fuchsia: {
    iconInactive: 'text-fuchsia-500/80 group-hover:text-fuchsia-500 dark:text-fuchsia-400',
    iconActive: 'text-fuchsia-600 dark:text-fuchsia-300',
    activeBg: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/15 text-fuchsia-950 dark:text-fuchsia-100 font-bold',
    activeBar: 'bg-fuchsia-500 dark:bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.6)]',
    activeBorder: 'border-fuchsia-200/60 dark:border-fuchsia-800/40',
    badgeBg: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300',
  },
  slate: {
    iconInactive: 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400',
    iconActive: 'text-slate-800 dark:text-slate-200',
    activeBg: 'bg-slate-200/70 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold',
    activeBar: 'bg-slate-700 dark:bg-slate-300',
    activeBorder: 'border-slate-300 dark:border-slate-700',
    badgeBg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  },
};

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, branding }) => {
  const activeUser = StorageService.getActiveUser();
  const role: Role = activeUser?.role || 'DIGITADOR';

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('cg_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [whiteLabel, setWhiteLabel] = useState(StorageService.getWhiteLabel());
  const [currentTenant, setCurrentTenant] = useState(StorageService.getCurrentTenant());
  const [adminContext, setAdminContext] = useState<{ active: boolean; context?: { targetTenantId: string; targetTenantName: string } }>({ active: false });
  let effectiveBranding = resolveEffectiveTenantBranding(
    activeUser,
    currentTenant,
    whiteLabel,
    adminContext
  );

  if (branding && branding.status !== "DOMAIN_NOT_CONFIGURED") {
    effectiveBranding.tenantName = branding.companyName || effectiveBranding.tenantName;
    effectiveBranding.logoUrl = branding.logoUrl || effectiveBranding.logoUrl;
    effectiveBranding.plan = branding.plan || effectiveBranding.plan;
  }

  // Sync tenant and admin context status
  const syncTenantState = async () => {
    setCurrentTenant(StorageService.getCurrentTenant());
    setWhiteLabel(StorageService.getWhiteLabel());
    if (activeUser?.role === 'PLATFORM_MASTER') {
      try {
        const res = await fetch('/api/saas/context-switch/status');
        if (res.ok) {
          const data = await res.json();
          setAdminContext(data);
        }
      } catch (e) {}
    }
  };

  useEffect(() => {
    syncTenantState();

    const handleUpdates = () => {
      syncTenantState();
    };

    window.addEventListener('whiteLabelUpdated', handleUpdates);
    window.addEventListener('tenantUpdated', handleUpdates);
    window.addEventListener('credit_gestao_storage_update', handleUpdates);
    window.addEventListener('storage', handleUpdates);

    // Listen to realtime tenant context changes
    const unsub = realtimeHub.subscribe('*', (event) => {
      const eventType = (event as any)?.type;
      if (eventType === 'TENANT_UPDATED' || eventType === 'TENANT_SUSPENDED' || eventType === 'CONTEXT_SWITCHED') {
        syncTenantState();
      }
    });

    return () => {
      window.removeEventListener('whiteLabelUpdated', handleUpdates);
      window.removeEventListener('tenantUpdated', handleUpdates);
      window.removeEventListener('credit_gestao_storage_update', handleUpdates);
      window.removeEventListener('storage', handleUpdates);
      unsub();
    };
  }, [activeUser?.id, activeUser?.role]);

  // Determine dynamic company name to display
  const displayCompanyName = (() => {
    if (activeUser?.role === 'PLATFORM_MASTER') {
      if (adminContext.active && adminContext.context?.targetTenantName) {
        return adminContext.context.targetTenantName;
      }
      return 'PLATAFORMA';
    }
    return currentTenant?.name || 'Mesa Operacional';
  })();

  const isGlobalPlatformContext = activeUser?.role === 'PLATFORM_MASTER' && !adminContext.active;
  const isInspectionMode = activeUser?.role === 'PLATFORM_MASTER' && adminContext.active;

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('cg_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // RBAC Permission checks (strictly preserved)
  const isPlatformMaster = role === 'PLATFORM_MASTER';
  const isMaster = role === 'MASTER' || isPlatformMaster;
  const isGestor = role === 'GESTOR' || isMaster;
  const isGerente = role === 'GERENTE' || isGestor;
  const isSuporte = role === 'SUPORTE' || isGestor;
  const isDigitador = role === 'DIGITADOR' || isMaster;

  const renderNavItem = (item: NavItemConfig) => {
    const isActive = currentView === item.id;
    const Icon = item.icon;
    const style = colorStyles[item.color] || colorStyles.blue;

    return (
      <button
        key={item.id}
        id={`nav-${item.id}`}
        onClick={() => onNavigate(item.id)}
        title={isCollapsed ? item.label : undefined}
        className={`group relative flex items-center w-full rounded-lg transition-all duration-150 cursor-pointer select-none text-left ${
          isCollapsed ? 'h-9 px-0 justify-center' : 'h-[34px] px-2.5 text-xs'
        } ${
          isActive
            ? `${style.activeBg} border ${style.activeBorder}`
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
        }`}
      >
        {/* Left active vertical indicator bar */}
        {isActive && (
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r ${style.activeBar}`}
          />
        )}

        {/* Semantic Icon with subtle colored container */}
        <div
          className={`flex items-center justify-center shrink-0 rounded-md transition-colors ${
            isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-2'
          } ${
            isActive
              ? 'bg-white/80 dark:bg-slate-900/80 shadow-2xs'
              : 'bg-transparent group-hover:bg-slate-200/50 dark:group-hover:bg-slate-800/50'
          }`}
        >
          <Icon
            className={`h-4 w-4 shrink-0 transition-transform ${
              isActive ? style.iconActive : style.iconInactive
            }`}
          />
        </div>

        {/* Item Label */}
        {!isCollapsed && (
          <span className="flex-1 truncate tracking-tight text-[12.5px] font-medium">
            {item.label}
          </span>
        )}

        {/* Item Badge */}
        {!isCollapsed && item.badge && (
          <span
            className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-extrabold font-mono tracking-wide shrink-0 uppercase flex items-center gap-1 ${
              item.badge.variant === 'live'
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse'
                : item.badge.variant === 'ai'
                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                : item.badge.variant === 'alert'
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {item.badge.variant === 'live' && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            )}
            {item.badge.text}
          </span>
        )}
      </button>
    );
  };

  const renderSectionHeader = (title: string) => {
    if (isCollapsed) return <div className="my-2 border-t border-slate-200/60 dark:border-slate-800/80" />;
    return (
      <div className="px-2.5 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 select-none">
          {title}
        </span>
      </div>
    );
  };

  return (
    <aside
      className={`border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#080d18] flex flex-col shrink-0 transition-all duration-200 ease-in-out select-none ${
        isCollapsed ? 'w-[68px]' : 'w-[248px]'
      }`}
    >
      {/* ==================================================
          BLOCO DE IDENTIDADE & MARCA: SENTINEL CONSIG + EMPRESA ATUAL
      ================================================== */}
      {isCollapsed ? (
        /* Versão Compacta (Ícone do Sentinel / Logo da Empresa) */
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1.5 shrink-0">
          <div
            className="h-8 w-8 flex items-center justify-center shrink-0 cursor-pointer"
            title={`${SYSTEM_IDENTITY.name} - ${displayCompanyName}`}
            onClick={() => onNavigate('torre-controle')}
          >
            <img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />
          </div>
          <span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/15 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 text-center leading-tight">
            {(effectiveBranding.plan || SYSTEM_IDENTITY.badge).substring(0, 3).toUpperCase()}
          </span>
        </div>
      ) : (
        /* Versão Expandida: Sentinel Consig + Enterprise + Empresa Atual */
        <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0 space-y-3">
          {/* IDENTIDADE DO SISTEMA */}
          <div className="flex items-start gap-2.5">
            <div className="h-8.5 w-8.5 flex items-center justify-center shrink-0 mt-0.5">
              <img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              {/* Linha principal: Nome da Empresa / Sistema + ENTERPRISE */}
              <div className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-xs font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap leading-tight truncate">
                  {SYSTEM_IDENTITY.name}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 shrink-0 leading-none">
                  {effectiveBranding.plan || SYSTEM_IDENTITY.badge}
                </span>
              </div>
              {/* Segunda linha: Razão / Subtítulo da Marca */}
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap leading-tight mt-0.5 truncate">
                {SYSTEM_IDENTITY.subtitle}
              </span>
            </div>
          </div>

          {/* IDENTIDADE DO TENANT (EMPRESA ATUAL / AMBIENTE) */}
          <div className="bg-slate-50 dark:bg-slate-900/70 rounded-lg p-2.5 border border-slate-200/70 dark:border-slate-800/70">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {isGlobalPlatformContext ? 'Ambiente' : 'Empresa Atual'}
              </span>
              {isGlobalPlatformContext && (
                <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider bg-purple-500/10 dark:bg-purple-400/15 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50">
                  GLOBAL
                </span>
              )}
              {isInspectionMode && (
                <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider bg-amber-500/10 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 animate-pulse">
                  INSPEÇÃO
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded flex items-center justify-center shrink-0 bg-white dark:bg-slate-800 shadow-xs border border-slate-200/50 dark:border-slate-700/50">
                <img 
                  src={effectiveBranding.logoUrl || SYSTEM_IDENTITY.defaultLogo} 
                  alt={effectiveBranding.tenantName} 
                  className="max-h-full max-w-full object-contain rounded-sm"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div
                className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate leading-snug flex-1"
                title={effectiveBranding.tenantName}
              >
                {effectiveBranding.tenantName}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Navigation Tree */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-1">
        {/* ==================================================
            1. VISÃO GERAL (Blue / Cyan / Violet)
        ================================================== */}
        {(isGestor || isSuporte || isDigitador) && (
          <div className="space-y-0.5">
            {renderSectionHeader('Visão Geral')}

            {isGestor &&
              renderNavItem({
                id: 'torre-controle',
                label: 'Torre de Controle',
                icon: LayoutDashboard,
                color: 'blue',
              })}

            {isGestor &&
              renderNavItem({
                id: 'dashboard-executivo',
                label: 'Dashboard Executivo',
                icon: BarChart3,
                color: 'violet',
              })}

            {renderNavItem({
              id: 'tv-monitor',
              label: 'Monitor TV',
              icon: Tv,
              color: 'cyan',
              badge: { text: 'Live', variant: 'live' },
            })}

            {isGestor &&
              renderNavItem({
                id: 'radar-comercial',
                label: 'Radar Comercial',
                icon: TrendingUp,
                color: 'amber',
              })}

            {renderNavItem({
              id: 'gamificacao',
              label: 'Conquistas & Metas',
              icon: Trophy,
              color: 'yellow',
            })}
          </div>
        )}

        {/* ==================================================
            INTELIGÊNCIA (Purple)
        ================================================== */}
        {(isGestor || isSuporte || isDigitador) && (
          <div className="space-y-0.5">
            {renderSectionHeader('Inteligência & Operações')}
            {renderNavItem({
              id: 'central-operacoes',
              label: 'Central de Operações',
              icon: Activity,
              color: 'blue',
              badge: { text: 'Hub', variant: 'live' },
            })}
            {renderNavItem({
              id: 'sentinela-ai',
              label: 'Sentinela AI',
              icon: Bot,
              color: 'purple',
              badge: { text: 'Copilot', variant: 'ai' },
            })}
          </div>
        )}

        {/* ==================================================
            2. OPERAÇÃO (Emerald / Blue / Violet / Amber)
        ================================================== */}
        {role !== 'SIMULACAO' && (
          <div className="space-y-0.5">
            {renderSectionHeader('Operação')}

            {isDigitador &&
              renderNavItem({
                id: 'home-digitador',
                label: 'Minha Produção',
                icon: UserCheck,
                color: 'emerald',
              })}

            {renderNavItem({
              id: 'producao',
              label: 'Todas as Propostas',
              icon: FileSpreadsheet,
              color: 'blue',
            })}

            {renderNavItem({
              id: 'esteira',
              label: 'Esteira Kanban',
              icon: Kanban,
              color: 'violet',
            })}

            {renderNavItem({
              id: 'portabilidades',
              label: 'Portabilidades (CIP)',
              icon: ArrowLeftRight,
              color: 'amber',
            })}

            {renderNavItem({
              id: 'agenda-operacional',
              label: 'Agenda & Tarefas',
              icon: Calendar,
              color: 'cyan',
            })}

            {isDigitador &&
              renderNavItem({
                id: 'importar-excel',
                label: 'Importar Planilha',
                icon: Upload,
                color: 'emerald',
              })}
          </div>
        )}

        {/* ==================================================
            3. SIMULAÇÕES (Violet)
        ================================================== */}
        {role !== 'DIGITADOR' && (
          <div className="space-y-0.5">
            {renderSectionHeader('Simulações')}
            {renderNavItem({
              id: 'simulacoes',
              label: 'Simulações',
              icon: Calculator,
              color: 'violet',
            })}
          </div>
        )}

        {/* ==================================================
            4. CLIENTES (Cyan / Blue)
        ================================================== */}
        {role !== 'SIMULACAO' && (
          <div className="space-y-0.5">
            {renderSectionHeader('Clientes')}

            {renderNavItem({
              id: 'clientes',
              label: 'Clientes 360º',
              icon: Users,
              color: 'cyan',
            })}

            {renderNavItem({
              id: 'busca-cpf',
              label: 'Busca por CPF',
              icon: Search,
              color: 'blue',
            })}
          </div>
        )}

        {/* ==================================================
            5. GESTÃO (Emerald / Indigo / Sky / Orange / Rose)
        ================================================== */}
        {(isGestor || isGerente || isSuporte) && (
          <div className="space-y-0.5">
            {renderSectionHeader('Gestão')}

            {isGestor &&
              renderNavItem({
                id: 'financeiro-geral',
                label: 'Financeiro',
                icon: DollarSign,
                color: 'emerald',
              })}

            {isGerente &&
              renderNavItem({
                id: 'parceiros',
                label: 'Parceiros',
                icon: Handshake,
                color: 'indigo',
              })}

            {isGerente &&
              renderNavItem({
                id: 'promotoras',
                label: 'Promotoras',
                icon: Building2,
                color: 'sky',
              })}

            {(isSuporte || isGestor) &&
              renderNavItem({
                id: 'suporte',
                label: 'Suporte & Fila',
                icon: Headphones,
                color: 'orange',
              })}

            {(isGestor || isSuporte) &&
              renderNavItem({
                id: 'relatorio-gargalos',
                label: 'Gargalos & SLA',
                icon: Hourglass,
                color: 'rose',
              })}
          </div>
        )}

        {/* ==================================================
            6. ADMINISTRAÇÃO (Slate / Cyan / Purple / Amber / Sky / Emerald)
        ================================================== */}
        {isMaster && (
          <div className="space-y-0.5">
            {renderSectionHeader('Administração')}

            {renderNavItem({
              id: 'admin-usuarios',
              label: 'Usuários',
              icon: Users,
              color: 'blue',
            })}

            {renderNavItem({
              id: 'admin-plano-consumo',
              label: 'Meu Plano & Consumo',
              icon: HardDrive,
              color: 'emerald',
            })}

            {renderNavItem({
              id: 'admin-bancos',
              label: 'Bancos & Vínculos',
              icon: Building2,
              color: 'cyan',
            })}

            {renderNavItem({
              id: 'admin-c6-bank',
              label: 'Integração C6 Bank',
              icon: Zap,
              color: 'amber',
              badge: {
                text: 'API',
                variant: 'live',
              },
            })}

            {renderNavItem({
              id: 'admin-produtos',
              label: 'Produtos & Regras',
              icon: Layers,
              color: 'purple',
            })}

            {renderNavItem({
              id: 'admin-status',
              label: 'Status do Sistema',
              icon: Sliders,
              color: 'amber',
            })}

            {renderNavItem({
              id: 'admin-calendario',
              label: 'Feriados & Prazos',
              icon: Calendar,
              color: 'sky',
            })}

            {renderNavItem({
              id: 'admin-auditoria',
              label: 'Trilha de Auditoria',
              icon: ShieldCheck,
              color: 'emerald',
            })}
          </div>
        )}

        {/* ==================================================
            7. PLATAFORMA (Fuchsia / Magenta)
        ================================================== */}
        {isPlatformMaster && (
          <div className="space-y-0.5">
            {renderSectionHeader('Plataforma')}

            {renderNavItem({
              id: 'saas-tenants',
              label: 'Empresas & Assinaturas',
              icon: HardDrive,
              color: 'fuchsia',
            })}
          </div>
        )}
      </nav>

      {/* Sidebar Footer / Collapse Toggle */}
      <div className="p-2 border-t border-slate-200/80 dark:border-slate-800/80 shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
        <button
          onClick={toggleCollapse}
          className="flex items-center justify-center w-full h-8 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center justify-between w-full px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <ChevronLeft className="h-4 w-4" />
                <span>Recolher</span>
              </span>
              <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-500">
                Alt+B
              </kbd>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};

