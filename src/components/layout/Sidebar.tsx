import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Calculator,
  Handshake,
  Building2,
  BarChart3,
  Bot,
  Sparkles,
  Zap,
  Activity,
  Shield,
  HardDrive,
  Layers,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowLeftRight,
  Headphones,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { realtimeHub } from '../../services/realtimeService';
import { Role, User } from '../../types';
import { resolveEffectiveTenantBranding, SYSTEM_IDENTITY } from '../../lib/branding';
import { TenantBranding } from '../../hooks/useTenantBranding';
import { hasPermission } from '../../lib/permissions';

interface SidebarProps {
  currentView: string;
  currentPath?: string;
  onNavigate: (viewOrPath: string) => void;
  branding?: TenantBranding;
  activeUser?: User | null;
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
  to: string;
  label: string;
  icon: React.ElementType;
  color: SemanticColor;
  badge?: {
    text: string;
    variant: 'alert' | 'ai' | 'counter';
  };
  visible?: boolean;
}

interface NavGroupConfig {
  id: string;
  title: string;
  visible: boolean;
  items: NavItemConfig[];
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

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  currentPath,
  onNavigate,
  branding,
  activeUser: propActiveUser,
}) => {
  const [userFromStorage, setUserFromStorage] = useState<User>(() => StorageService.getActiveUser());
  const activeUser = propActiveUser || userFromStorage;
  const role: Role = activeUser?.role || 'DIGITADOR';
  const userCustomPerms = activeUser?.customPermissions || [];

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('cg_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('cg_sidebar_groups_expanded');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      inicio: true,
      operacao: true,
      integracoes: true,
      gestao: true,
      administracao: true,
      plataforma: true,
    };
  });

  const [openPendenciesCount, setOpenPendenciesCount] = useState<number | null>(null);
  const [automationsCount, setAutomationsCount] = useState<number | null>(null);

  const [whiteLabel, setWhiteLabel] = useState(StorageService.getWhiteLabel());
  const [currentTenant, setCurrentTenant] = useState(StorageService.getCurrentTenant());
  const [adminContext, setAdminContext] = useState<{ active: boolean; context?: { targetTenantId: string; targetTenantName: string } }>({ active: false });

  let effectiveBranding = resolveEffectiveTenantBranding(
    activeUser,
    currentTenant,
    whiteLabel,
    adminContext
  );

  if (branding && branding.status !== 'DOMAIN_NOT_CONFIGURED') {
    effectiveBranding.tenantName = branding.companyName || effectiveBranding.tenantName;
    effectiveBranding.logoUrl = branding.logoUrl || effectiveBranding.logoUrl;
    effectiveBranding.plan = branding.plan || effectiveBranding.plan;
  }

  // Sincroniza estado de contadores operacionais para os badges relevantes
  const fetchBadgeCounts = async () => {
    try {
      const res = await fetch('/api/pendencies/metrics');
      if (res.ok) {
        const data = await res.json();
        if (data?.summary) {
          const totalOpen = (data.summary.openCount || 0) + (data.summary.inProgressCount || 0);
          setOpenPendenciesCount(totalOpen);
        }
      }
    } catch {}

    try {
      const autoRes = await fetch('/api/automations');
      if (autoRes.ok) {
        const data = await autoRes.json();
        const list = Array.isArray(data) ? data : data.automations || [];
        setAutomationsCount(list.filter((a: any) => a.isActive !== false).length || 3);
      }
    } catch {
      setAutomationsCount(3);
    }
  };

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
      } catch {}
    }
  };

  useEffect(() => {
    syncTenantState();
    fetchBadgeCounts();

    const handleUpdates = () => {
      syncTenantState();
      fetchBadgeCounts();
      setUserFromStorage(StorageService.getActiveUser());
    };

    window.addEventListener('whiteLabelUpdated', handleUpdates);
    window.addEventListener('tenantUpdated', handleUpdates);
    window.addEventListener('credit_gestao_storage_update', handleUpdates);
    window.addEventListener('storage', handleUpdates);

    // Atalho global Alt+B para expandir/recolher sidebar
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Listen to realtime pendency updates
    const unsub = realtimeHub.subscribe('*', (event: any) => {
      const eventType = event?.type;
      if (
        eventType?.includes('PENDENCY') ||
        eventType === 'TENANT_UPDATED' ||
        eventType === 'CONTEXT_SWITCHED' ||
        eventType === 'USER_UPDATED'
      ) {
        syncTenantState();
        fetchBadgeCounts();
        setUserFromStorage(StorageService.getActiveUser());
      }
    });

    return () => {
      window.removeEventListener('whiteLabelUpdated', handleUpdates);
      window.removeEventListener('tenantUpdated', handleUpdates);
      window.removeEventListener('credit_gestao_storage_update', handleUpdates);
      window.removeEventListener('storage', handleUpdates);
      window.removeEventListener('keydown', handleKeyDown);
      unsub();
    };
  }, [propActiveUser, activeUser?.id, activeUser?.role, JSON.stringify(userCustomPerms)]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cg_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem('cg_sidebar_groups_expanded', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // RBAC Permission checks
  const isPlatformMaster = role === 'PLATFORM_MASTER';
  const isMaster = role === 'MASTER' || isPlatformMaster;
  const isGestor = role === 'GESTOR' || isMaster;
  const isGerente = role === 'GERENTE' || isGestor;
  const isSuporte = role === 'SUPORTE' || isGestor;
  const isDigitador = role === 'DIGITADOR' || isMaster;

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

  // Verificação de correspondência de rota ativa (garante contexto para rotas e sub-rotas)
  const isViewActive = (itemOrId: NavItemConfig | string): boolean => {
    const item = typeof itemOrId === 'string'
      ? navGroups.flatMap(g => g.items).find(i => i.id === itemOrId)
      : itemOrId;

    const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
    const itemTo = item?.to;

    if (currentPath && itemTo) {
      if (currentPath === itemTo) return true;
      if (itemTo === '/dashboard' && (currentPath === '/' || currentPath === '/dashboard')) return true;
      if (itemTo !== '/' && itemTo !== '/dashboard' && currentPath.startsWith(itemTo + '/')) return true;
    }

    if (currentView === itemId) return true;
    if (itemId === 'torre-controle' && (currentView === 'tv-monitor' || currentView === 'dashboard')) return true;
    if (itemId === 'producao' && ['esteira', 'portabilidades', 'importar-excel', 'propostas'].includes(currentView)) return true;
    if (itemId === 'hub-integracoes' && ['integracoes-hub', 'admin-integracoes-bancos', 'integracoes'].includes(currentView)) return true;
    if (itemId === 'dashboard-executivo' && ['bi'].includes(currentView)) return true;
    if (itemId === 'central-automacao' && ['automacoes'].includes(currentView)) return true;
    if (itemId === 'command-center' && ['command'].includes(currentView)) return true;
    if (itemId === 'sentinela-ai' && ['intelligence', 'sentinel-intelligence'].includes(currentView)) return true;
    if (itemId === 'central-pendencias' && ['pendencias', 'pendencias-central'].includes(currentView)) return true;
    if (
      itemId === 'central-administracao' &&
      [
        'administracao',
        'admin-usuarios',
        'admin-produtos',
        'admin-status',
        'admin-calendario',
        'admin-auditoria',
        'admin-comunicados',
      ].includes(currentView)
    ) {
      return true;
    }
    return false;
  };

  // ==================================================
  // DEFINIÇÃO DOS 6 GRUPOS PRINCIPAIS BASEADOS EM RBAC
  // ==================================================
  const navGroups: NavGroupConfig[] = [
    // 1. INÍCIO
    {
      id: 'inicio',
      title: 'Início',
      visible: hasPermission(role, userCustomPerms, 'dashboard.view'),
      items: [
        {
          id: role === 'DIGITADOR' ? 'home-digitador' : 'torre-controle',
          to: '/dashboard',
          label: 'Dashboard / Início',
          icon: LayoutDashboard,
          color: 'blue',
          visible: hasPermission(role, userCustomPerms, 'dashboard.view'),
        },
      ],
    },

    // 2. OPERAÇÃO
    {
      id: 'operacao',
      title: 'Operação',
      visible: true,
      items: [
        {
          id: role === 'DIGITADOR' ? 'home-digitador' : 'torre-controle',
          to: '/dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          color: 'blue',
          visible: hasPermission(role, userCustomPerms, 'dashboard.view'),
        },
        {
          id: 'central-pendencias',
          to: '/central-pendencias',
          label: 'Central de Pendências',
          icon: AlertTriangle,
          color: 'rose',
          visible: hasPermission(role, userCustomPerms, 'pendencies.view'),
          badge:
            openPendenciesCount && openPendenciesCount > 0
              ? { text: `🔴 ${openPendenciesCount}`, variant: 'alert' }
              : undefined,
        },
        {
          id: 'producao',
          to: '/propostas',
          label: 'Propostas',
          icon: FileSpreadsheet,
          color: 'blue',
          visible: hasPermission(role, userCustomPerms, 'proposals.view'),
        },
        {
          id: 'portabilidades',
          to: '/portabilidade',
          label: 'Portabilidade (CIP)',
          icon: ArrowLeftRight,
          color: 'indigo',
          visible: hasPermission(role, userCustomPerms, 'proposals.view'),
        },
        {
          id: 'simulacoes',
          to: '/simulacoes',
          label: 'Simulações',
          icon: Calculator,
          color: 'violet',
          visible: hasPermission(role, userCustomPerms, 'simulations.view'),
        },
        {
          id: 'parceiros',
          to: '/crm-parceiros',
          label: 'CRM de Parceiros',
          icon: Handshake,
          color: 'indigo',
          visible:
            hasPermission(role, userCustomPerms, 'partners.crm.view') ||
            hasPermission(role, userCustomPerms, 'partners.view'),
        },
        {
          id: 'central-atendimento',
          to: '/central-atendimento',
          label: 'Central de Atendimento',
          icon: Headphones,
          color: 'sky',
          visible: hasPermission(role, userCustomPerms, 'support.view'),
        },
      ],
    },

    // 3. INTEGRAÇÕES
    {
      id: 'integracoes',
      title: 'Integrações',
      visible: true,
      items: [
        {
          id: 'hub-integracoes',
          to: '/integracoes',
          label: 'Hub de Integrações',
          icon: Zap,
          color: 'cyan',
          visible: hasPermission(role, userCustomPerms, 'integrations.view'),
        },
        {
          id: 'promotoras',
          to: '/bancos-promotoras',
          label: 'Bancos & Promotoras',
          icon: Building2,
          color: 'sky',
          visible:
            hasPermission(role, userCustomPerms, 'promoters.view') ||
            hasPermission(role, userCustomPerms, 'banks.view') ||
            hasPermission(role, userCustomPerms, 'integrations.view'),
        },
        {
          id: 'admin-c6-bank',
          to: '/saude-apis',
          label: 'Saúde das APIs',
          icon: Activity,
          color: 'emerald',
          visible:
            hasPermission(role, userCustomPerms, 'integrations.health') ||
            hasPermission(role, userCustomPerms, 'integrations.view'),
        },
      ],
    },

    // 4. GESTÃO
    {
      id: 'gestao',
      title: 'Gestão',
      visible: true,
      items: [
        {
          id: 'dashboard-executivo',
          to: '/bi',
          label: 'BI Operacional',
          icon: BarChart3,
          color: 'indigo',
          visible: hasPermission(role, userCustomPerms, 'bi.view'),
        },
        {
          id: 'central-automacao',
          to: '/automacoes',
          label: 'Automações',
          icon: Bot,
          color: 'purple',
          visible: hasPermission(role, userCustomPerms, 'automations.view'),
          badge:
            automationsCount && automationsCount > 0
              ? { text: String(automationsCount), variant: 'ai' }
              : undefined,
        },
        {
          id: 'command-center',
          to: '/command-center',
          label: 'Command Center',
          icon: Shield,
          color: 'rose',
          visible: hasPermission(role, userCustomPerms, 'command.view'),
          badge: { text: 'AO VIVO', variant: 'alert' },
        },
        {
          id: 'sentinela-ai',
          to: '/intelligence',
          label: 'Sentinel Intelligence',
          icon: Sparkles,
          color: 'violet',
          visible: hasPermission(role, userCustomPerms, 'intelligence.view'),
        },
      ],
    },

    // 5. ADMINISTRAÇÃO
    {
      id: 'administracao',
      title: 'Administração',
      visible: true,
      items: [
        {
          id: 'central-administracao',
          to: '/central-administracao',
          label: 'Central de Administração',
          icon: Shield,
          color: 'indigo',
          visible: hasPermission(role, userCustomPerms, 'admin.view'),
        },
      ],
    },

    // 6. PLATAFORMA
    {
      id: 'plataforma',
      title: 'Plataforma',
      visible: isPlatformMaster || hasPermission(role, userCustomPerms, 'tenants.view'),
      items: [
        {
          id: 'saas-tenants',
          to: '/empresas-assinaturas',
          label: 'Empresas & Assinaturas',
          icon: HardDrive,
          color: 'fuchsia',
          visible: isPlatformMaster || hasPermission(role, userCustomPerms, 'tenants.view'),
        },
        {
          id: 'admin-plano-consumo',
          to: '/meu-plano',
          label: 'Meu Plano & Consumo',
          icon: Layers,
          color: 'emerald',
          visible: isPlatformMaster || hasPermission(role, userCustomPerms, 'tenants.view'),
        },
      ],
    },
  ];

  const renderNavItem = (item: NavItemConfig) => {
    if (item.visible === false) return null;
    const isActive = isViewActive(item);
    const Icon = item.icon;
    const style = colorStyles[item.color] || colorStyles.blue;

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Allow browser default for new tab / special clicks
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.altKey ||
        e.ctrlKey ||
        e.shiftKey
      ) {
        return;
      }
      e.preventDefault();
      onNavigate(item.to);
    };

    return (
      <a
        key={item.id}
        id={`nav-${item.id}`}
        href={item.to}
        onClick={handleClick}
        title={item.label}
        className={`group relative flex items-center w-full rounded-lg transition-all duration-150 cursor-pointer select-none text-left no-underline ${
          isCollapsed ? 'h-9 px-0 justify-center' : 'h-[34px] px-2.5 text-xs'
        } ${
          isActive
            ? `${style.activeBg} border ${style.activeBorder}`
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 border border-transparent'
        }`}
      >
        {/* Indicador lateral da aba ativa */}
        {isActive && (
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r ${style.activeBar}`}
          />
        )}

        {/* Ícone semântico padronizado */}
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

        {/* Nome do item (apenas no modo expandido) */}
        {!isCollapsed && (
          <span className="flex-1 truncate tracking-tight text-[12.5px] font-medium">
            {item.label}
          </span>
        )}

        {/* Badge limpo e funcional */}
        {!isCollapsed && item.badge && (
          <span
            className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-extrabold font-mono tracking-wide shrink-0 uppercase flex items-center gap-1 ${
              item.badge.variant === 'alert'
                ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold'
                : item.badge.variant === 'ai'
                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            {item.badge.text}
          </span>
        )}
      </a>
    );
  };

  return (
    <aside
      className={`border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#080d18] flex flex-col shrink-0 transition-all duration-200 ease-in-out select-none ${
        isCollapsed ? 'w-[68px]' : 'w-[248px]'
      }`}
    >
      {/* ==================================================
          BLOCO DE IDENTIDADE & MARCA: SENTINEL CONSIG + TENANT
      ================================================== */}
      {isCollapsed ? (
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col items-center gap-1.5 shrink-0">
          <div
            className="h-8 w-8 flex items-center justify-center shrink-0 cursor-pointer"
            title={`${SYSTEM_IDENTITY.name} - ${displayCompanyName}`}
            onClick={() => onNavigate(role === 'DIGITADOR' ? 'home-digitador' : 'torre-controle')}
          >
            <img
              src={SYSTEM_IDENTITY.defaultLogo}
              alt={SYSTEM_IDENTITY.name}
              className="h-full w-full object-contain rounded-lg shadow-2xs"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/15 px-1 py-0.2 rounded border border-blue-200 dark:border-blue-800/50 text-center leading-tight">
            {(effectiveBranding.plan || SYSTEM_IDENTITY.badge).substring(0, 3).toUpperCase()}
          </span>
        </div>
      ) : (
        <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="h-8.5 w-8.5 flex items-center justify-center shrink-0 mt-0.5">
              <img
                src={SYSTEM_IDENTITY.defaultLogo}
                alt={SYSTEM_IDENTITY.name}
                className="h-full w-full object-contain rounded-lg shadow-2xs"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-xs font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap leading-tight truncate">
                  {SYSTEM_IDENTITY.displayName}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 shrink-0 leading-none">
                  {effectiveBranding.plan || SYSTEM_IDENTITY.badge}
                </span>
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap leading-tight mt-0.5 truncate">
                {SYSTEM_IDENTITY.shortTagline}
              </span>
            </div>
          </div>

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

      {/* ==================================================
          ÁRVORE DE NAVEGAÇÃO REORGANIZADA (6 GRUPOS)
      ================================================== */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2">
        {navGroups
          .filter((g) => g.visible)
          .map((group) => {
            const isExpanded = expandedGroups[group.id] ?? true;
            const hasActiveItem = group.items.some((item) => item.visible !== false && isViewActive(item.id));

            return (
              <div key={group.id} className="space-y-0.5">
                {isCollapsed ? (
                  // Divisor sutil no modo recolhido
                  <div className="my-1.5 border-t border-slate-200/60 dark:border-slate-800/80" />
                ) : (
                  // Cabeçalho Expansível do Grupo
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full px-2.5 pt-2 pb-1 flex items-center justify-between text-slate-400 hover:text-slate-200 transition-colors cursor-pointer group select-none"
                    title={`Recolher/Expandir ${group.title}`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 group-hover:text-slate-300">
                        {group.title}
                      </span>
                      {hasActiveItem && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                      )}
                    </div>
                    <div className="p-0.5 rounded text-slate-500 group-hover:text-slate-300">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </div>
                  </button>
                )}

                {/* Subitens do Grupo */}
                {(isCollapsed || isExpanded) && (
                  <div className="space-y-0.5">
                    {group.items.map(renderNavItem)}
                  </div>
                )}
              </div>
            );
          })}
      </nav>

      {/* ==================================================
          RODAPÉ / BOTÃO DE EXPANDIR OU RECOLHER
      ================================================== */}
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
