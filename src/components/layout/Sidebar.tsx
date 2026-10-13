import React, { useState, useEffect, useRef } from 'react';
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
  CalendarDays,
  UsersRound,
  CircleDollarSign,
  MonitorUp,
  Trophy,
  Workflow,
  ListChecks,
  Search,
  Star,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { realtimeHub } from '../../services/realtimeService';
import { Role, User } from '../../types';
import { resolveEffectiveTenantBranding, SYSTEM_IDENTITY } from '../../lib/branding';
import { TenantBranding } from '../../hooks/useTenantBranding';
import { hasPermission } from '../../lib/permissions';
import { useWorkspacePreferences, workspaceKey } from '../../hooks/useWorkspacePreferences';

interface SidebarProps {
  currentView: string;
  preferenceKey?: string;
  currentPath?: string;
  onNavigate: (viewOrPath: string) => void;
  branding?: TenantBranding;
  activeUser?: User | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
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

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  preferenceKey,
  currentPath,
  onNavigate,
  branding,
  activeUser: propActiveUser,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const [userFromStorage, setUserFromStorage] = useState<User>(() => StorageService.getActiveUser());
  const activeUser = propActiveUser || userFromStorage;
  const role: Role = activeUser?.role || 'DIGITADOR';
  const userCustomPerms = activeUser?.customPermissions || [];
  const workspace = useWorkspacePreferences(preferenceKey || workspaceKey(StorageService.getCurrentTenantId(), activeUser?.id));
  const [navSearch, setNavSearch] = useState('');

  const [isCollapsedPreference, setIsCollapsedPreference] = useState(() => {
    try {
      return localStorage.getItem('cg_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const isCollapsed = isMobileOpen ? false : isCollapsedPreference;
  const onCloseMobileRef = useRef(onCloseMobile);
  onCloseMobileRef.current = onCloseMobile;

  useEffect(() => {
    if (!isMobileOpen) return;

    const sidebar = document.getElementById('app-sidebar');
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFrame = window.requestAnimationFrame(() => {
      sidebar?.querySelector<HTMLElement>('a[href]')?.focus();
    });

    document.body.style.overflow = 'hidden';
    const handleDrawerKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobileRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !sidebar) return;

      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDrawerKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleDrawerKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isMobileOpen]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('cg_sidebar_groups_expanded');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      inicio: true,
      operacao: true,
      relacionamento: true,
      rotina: true,
      financeiro: true,
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
        } else {
          setOpenPendenciesCount(null);
        }
      } else {
        setOpenPendenciesCount(null);
      }
    } catch {
      setOpenPendenciesCount(null);
    }

    try {
      const autoRes = await fetch('/api/automations');
      if (autoRes.ok) {
        const data = await autoRes.json();
        const list = Array.isArray(data) ? data : data.automations || [];
        setAutomationsCount(list.filter((a: any) => a.isActive !== false).length);
      } else {
        setAutomationsCount(null);
      }
    } catch {
      setAutomationsCount(null);
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
    setIsCollapsedPreference((prev) => {
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
  // Navegação organizada por área e filtrada pelas permissões do usuário
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
      title: 'Produção',
      visible: true,
      items: [
        {
          id: 'central-pendencias',
          to: '/central-pendencias',
          label: 'Central de Pendências',
          icon: AlertTriangle,
          color: 'rose',
          visible: hasPermission(role, userCustomPerms, 'pendencies.view'),
          badge:
            openPendenciesCount !== null && openPendenciesCount > 0
              ? { text: String(openPendenciesCount), variant: 'alert' }
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
      ],
    },

    {
      id: 'relacionamento',
      title: 'Relacionamento',
      visible: true,
      items: [
        { id: 'clientes', to: '/clientes', label: 'Clientes 360º', icon: UsersRound, color: 'cyan', visible: hasPermission(role, userCustomPerms, 'clients.view') },
        { id: 'parceiros', to: '/crm-parceiros', label: 'CRM de Parceiros', icon: Handshake, color: 'indigo', visible: hasPermission(role, userCustomPerms, 'partners.crm.view') || hasPermission(role, userCustomPerms, 'partners.view') },
        { id: 'central-atendimento', to: '/central-atendimento', label: 'Central de Atendimento', icon: Headphones, color: 'sky', visible: hasPermission(role, userCustomPerms, 'support.view') },
      ],
    },
    {
      id: 'rotina',
      title: 'Rotina',
      visible: true,
      items: [
        { id: 'minha-fila', to: '/minha-fila', label: 'Minha Fila', icon: ListChecks, color: 'blue', visible: hasPermission(role, userCustomPerms, 'tasks.view') || hasPermission(role, userCustomPerms, 'partners.crm.view') || hasPermission(role, userCustomPerms, 'partners.crm.tasks') || hasPermission(role, userCustomPerms, 'partners.crm.admin') },
        { id: 'agenda-operacional', to: '/agenda-operacional', label: 'Agenda & Tarefas', icon: CalendarDays, color: 'sky', visible: hasPermission(role, userCustomPerms, 'tasks.view') },
        { id: 'central-operacoes', to: '/central-operacoes', label: 'Central de Operações', icon: ListChecks, color: 'indigo', visible: hasPermission(role, userCustomPerms, 'proposals.view') },
        { id: 'esteira', to: '/esteira', label: 'Esteira Kanban', icon: Workflow, color: 'blue', visible: hasPermission(role, userCustomPerms, 'proposals.view') },
        { id: 'tv-monitor', to: '/tv-monitor', label: 'Monitor de Operações', icon: MonitorUp, color: 'emerald', visible: hasPermission(role, userCustomPerms, 'dashboard.view') },
        { id: 'gamificacao', to: '/gamificacao', label: 'Metas & Conquistas', icon: Trophy, color: 'yellow', visible: hasPermission(role, userCustomPerms, 'proposals.view') },
      ],
    },
    {
      id: 'financeiro',
      title: 'Financeiro',
      visible: hasPermission(role, userCustomPerms, 'financial.view'),
      items: [
        { id: 'financeiro-geral', to: '/financeiro-geral', label: 'Fluxo Financeiro', icon: CircleDollarSign, color: 'emerald', visible: hasPermission(role, userCustomPerms, 'financial.view') },
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
          label: 'Integrações bancárias',
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
      title: 'Inteligência',
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
          badge: undefined,
        },
        {
          id: 'sentinela-ai',
          to: '/intelligence',
          label: 'Sentinel Intelligence',
          icon: Sparkles,
          color: 'violet',
          visible: hasPermission(role, userCustomPerms, 'intelligence.view'),
        },
        { id: 'radar-comercial', to: '/radar-comercial', label: 'Radar Comercial', icon: Activity, color: 'cyan', visible: hasPermission(role, userCustomPerms, 'bi.view') },
        { id: 'relatorio-gargalos', to: '/relatorio-gargalos', label: 'Gargalos & Permanência', icon: BarChart3, color: 'amber', visible: hasPermission(role, userCustomPerms, 'bi.view') },
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

  const visibleItems = navGroups.filter(group => group.visible).flatMap(group => group.items.filter(item => item.visible !== false));
  const favoriteItems = workspace.favorites.map(path => visibleItems.find(item => item.to === path || (path === '/' && item.to === '/dashboard'))).filter((item): item is NavItemConfig => !!item);
  const matchesSearch = (item: NavItemConfig) => item.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(navSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const renderNavItem = (item: NavItemConfig) => {
    if (item.visible === false || (navSearch && !matchesSearch(item))) return null;
    const isActive = isViewActive(item), Icon = item.icon;
    return <a key={item.id} id={`nav-${item.id}`} href={item.to} title={item.label} aria-current={isActive ? 'page' : undefined} className={`sentinel-nav-item ${isCollapsed ? 'justify-center !px-0' : ''}`} onClick={event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault(); onNavigate(item.to); onCloseMobile?.();
    }}><Icon aria-hidden="true" />{!isCollapsed && <><span className="flex-1 truncate">{item.label}</span>{item.badge && <span className="sentinel-nav-badge">{item.badge.text}</span>}</>}</a>;
  };

  return (
    <aside
      id="app-sidebar"
      data-collapsed={isCollapsed}
      role={isMobileOpen ? 'dialog' : undefined}
      aria-modal={isMobileOpen || undefined}
      aria-label="Menu principal"
      tabIndex={isMobileOpen ? -1 : undefined}
      className={`sentinel-sidebar border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#080d18] flex flex-col shrink-0 transition-all duration-200 ease-in-out select-none ${
        isMobileOpen
          ? 'fixed inset-y-0 left-0 z-50 w-[min(82vw,280px)] shadow-2xl md:static md:z-auto md:shadow-none'
          : 'hidden md:flex'
      } md:flex ${
        isCollapsed ? 'md:w-[68px]' : 'md:w-[248px]'
      }`}
    >
      {/* ==================================================
          BLOCO DE IDENTIDADE & MARCA: SENTINEL CONSIG + TENANT
      ================================================== */}
      <div className={`sentinel-sidebar-brand ${isCollapsed ? '!px-3 !py-6' : ''}`}>
        <button type="button" className="sentinel-brand-line" onClick={() => onNavigate(role === 'DIGITADOR' ? 'home-digitador' : 'torre-controle')} title="Ir para o início"><img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} />{!isCollapsed && <div className="text-left"><div className="sentinel-brand-name">sentinel<span className="font-normal text-[#64d3b9]">.</span></div><div className="sentinel-brand-subtitle">Consig · Workspace</div></div>}</button>
        {!isCollapsed && <div className="sentinel-company"><img src={effectiveBranding.logoUrl || SYSTEM_IDENTITY.defaultLogo} alt="" referrerPolicy="no-referrer" onError={event => { const image = event.currentTarget; if (!image.src.endsWith(SYSTEM_IDENTITY.defaultLogo)) image.src = SYSTEM_IDENTITY.defaultLogo; }} /><div className="min-w-0"><small>{isGlobalPlatformContext ? 'Plataforma' : isInspectionMode ? 'Em inspeção' : 'Sua empresa'}</small><strong title={displayCompanyName}>{displayCompanyName}</strong></div></div>}
      </div>
      {!isCollapsed && <div className="sentinel-nav-search"><Search size={14} /><input type="search" aria-label="Encontrar uma tela no menu" placeholder="Encontrar uma tela..." value={navSearch} onChange={event => setNavSearch(event.target.value)} /></div>}

      {/* ==================================================
          ÁRVORE DE NAVEGAÇÃO REORGANIZADA (6 GRUPOS)
      ================================================== */}
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2">
        {!navSearch && !isCollapsed && favoriteItems.length > 0 && <div><div className="sentinel-group-heading flex items-center gap-2"><Star size={11} />Favoritos</div>{favoriteItems.map(item => <div key={`favorite-${item.id}`}>{renderNavItem({ ...item, id: `favorite-${item.id}` })}</div>)}</div>}
        {navSearch && !visibleItems.some(matchesSearch) && <p className="sentinel-nav-empty">Nenhuma tela encontrada.</p>}
        {navGroups
          .filter((g) => g.visible && g.items.some(item => item.visible !== false && (!navSearch || matchesSearch(item))))
          .map((group) => {
            const isExpanded = !!navSearch || (expandedGroups[group.id] ?? true);
            const hasActiveItem = group.items.some((item) => item.visible !== false && isViewActive(item));

            return (
              <div key={group.id} className="space-y-0.5">
                {isCollapsed ? (
                  // Divisor sutil no modo recolhido
                  <div className="my-1.5 border-t border-slate-200/60 dark:border-slate-800/80" />
                ) : (
                  // Cabeçalho Expansível do Grupo
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`nav-group-${group.id}`}
                    className="sentinel-group-heading w-full px-2.5 pt-2 pb-1 flex items-center justify-between text-slate-400 hover:text-slate-200 transition-colors cursor-pointer group select-none"
                    title={`Recolher/Expandir ${group.title}`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300">
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
                <div
                  id={`nav-group-${group.id}`}
                  className="space-y-0.5"
                  hidden={!isCollapsed && !isExpanded}
                >
                  {group.items.map(renderNavItem)}
                </div>
              </div>
            );
          })}
      </nav>

      {/* ==================================================
          RODAPÉ / BOTÃO DE EXPANDIR OU RECOLHER
      ================================================== */}
      <div className="sentinel-sidebar-footer p-2 border-t border-slate-200/80 dark:border-slate-800/80 shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
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
