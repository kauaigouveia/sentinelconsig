import { WorkbenchBrand } from '../workbench/WorkbenchNavigation';
import {paletteStyle} from '../../lib/presentationPalette';
import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Headphones,
  User,
  LogOut,
  Sun,
  Moon,
  Shield,
  MessageSquare,
  Building2,
  ChevronDown,
  Calculator,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react';
import { SYSTEM_IDENTITY } from '../../lib/branding';
import { useWorkspacePreferences, workspaceKey } from '../../hooks/useWorkspacePreferences';
import { useTheme } from '../../context/ThemeContext';
import { InstitutionalFooter } from '../layout/InstitutionalFooter';
import { useTenantBranding } from '../../hooks/useTenantBranding';
import {
  PartnerPortalAccessInfo,
  PartnerInfo,
  TenantInfo,
  PartnerPortalClient,
} from '../../services/partnerPortalClient';
import { PartnerPortalLogin } from './PartnerPortalLogin';
import { PartnerPortalDashboard } from './PartnerPortalDashboard';
import { PartnerProposalsView } from './PartnerProposalsView';
import { PartnerSupportView } from './PartnerSupportView';
import { PartnerProfileView } from './PartnerProfileView';
import { PartnerSimulationsView } from './PartnerSimulationsView';

interface PartnerPortalLayoutProps {
  initialTab?: 'dashboard' | 'propostas' | 'atendimento' | 'perfil' | 'simulacoes';
  proposalIdParam?: string;
}

export const PartnerPortalLayout: React.FC<PartnerPortalLayoutProps> = ({
  initialTab = 'dashboard',
  proposalIdParam,
}) => {
  const { branding } = useTenantBranding();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [access, setAccess] = useState<PartnerPortalAccessInfo | null>(null);
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'propostas' | 'atendimento' | 'perfil' | 'simulacoes'>(initialTab);
  const [proposalFilters, setProposalFilters] = useState<{ standardCategory?: string; waitingReturnOnly?: boolean }>({});
  const [dashboardProposalId, setDashboardProposalId] = useState<string | null>(null);
  const [unreadSupportCount, setUnreadSupportCount] = useState<number>(0);
  const [chatProposal, setChatProposal] = useState<{ id: string; number: string } | null>(null);

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { isDark, toggleTheme } = useTheme();
  const workspace = useWorkspacePreferences(workspaceKey(tenant?.id, `partner-${access?.id || 'guest'}`));

  const verifySession = async () => {
    try {
      const res = await PartnerPortalClient.getSession();
      if (res.authenticated && res.access && res.partner && res.tenant) {
        setIsAuthenticated(true);
        setAccess(res.access);
        setPartner(res.partner);
        setTenant(res.tenant);

        // Fetch unread support messages count
        PartnerPortalClient.getUnreadCount().then(setUnreadSupportCount);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    verifySession();
  }, []);

  const handleLogout = async () => {
    await PartnerPortalClient.logout();
    setIsAuthenticated(false);
    setAccess(null);
    setPartner(null);
    setTenant(null);
  };

  const handleOpenChatForProposal = (proposalId: string, proposalNumber: string) => {
    setChatProposal({ id: proposalId, number: proposalNumber });
    setActiveTab('atendimento');
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)] space-y-3">
        <div className="h-8 w-8 border-3 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
        <span className="text-xs text-[var(--text-secondary)] font-medium">Validando sessão do Portal do Parceiro...</span>
      </div>
    );
  }

  if (!isAuthenticated || !partner || !access || !tenant) {
    return (
      <PartnerPortalLogin
        onLoginSuccess={verifySession}
        tenantName={tenant?.name || (branding.companyName !== 'Sentinel Consig' ? branding.companyName : undefined)}
        logoUrl={tenant?.whiteLabel?.logoUrl || branding.logoUrl}
      />
    );
  }

  const effectiveTenantName =
    tenant.name ||
    (branding.companyName !== 'Sentinel Consig' ? branding.companyName : '') ||
    'Organização';

  const effectiveTenantLogo =
    branding.logoUrl ||
    tenant.whiteLabel?.logoUrl ||
    SYSTEM_IDENTITY.defaultLogo;

  const tabs = [
    { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'simulacoes', label: 'Simulações', icon: Calculator },
    { id: 'propostas', label: 'Minhas propostas', icon: FileSpreadsheet },
    { id: 'atendimento', label: 'Atendimento', icon: Headphones },
    { id: 'perfil', label: 'Meu cadastro', icon: User },
  ] as const;
  const currentTab = tabs.find(tab => tab.id === activeTab)!;
  const renderTab = (tab: typeof tabs[number]) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className="sentinel-nav-item w-full"><span className="sentinel-nav-icon" style={{color:"var(--text-secondary)"}}><tab.icon aria-hidden="true" /></span><span className="flex-1 text-left">{tab.label}</span>{tab.id === 'atendimento' && unreadSupportCount > 0 && <span className="sentinel-nav-badge">{unreadSupportCount}</span>}</button>;
  return <div className="sentinel-app sentinel-portal s3-portal flex w-screen overflow-hidden" data-density={workspace.density} style={paletteStyle(branding.status==='ACTIVE'?branding.primaryColor:null)}>

    <div className="wb-portal-stage flex min-w-0 flex-1 flex-col overflow-hidden"><header className="sentinel-portal-header flex shrink-0 items-center justify-between gap-3 border-b"><WorkbenchBrand name={effectiveTenantName} logo={effectiveTenantLogo} onHome={() => setActiveTab('dashboard')}/><div className="wb-portal-location"><p className="sentinel-eyebrow !mb-1">{effectiveTenantName}</p><h2 className="text-base font-semibold">{currentTab.label}</h2></div><div className="flex items-center gap-3"><button type="button" className="sentinel-secondary-button" onClick={workspace.toggleDensity} title="Alternar densidade das telas"><SlidersHorizontal size={16} /><span className="hidden lg:inline">{workspace.density === 'compact' ? 'Compacto' : 'Confortável'}</span></button><button type="button" className="sentinel-secondary-button" onClick={toggleTheme} aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>{isDark ? <Sun size={17} /> : <Moon size={17} />}</button><div className="relative"><button type="button" className="sentinel-secondary-button" onClick={() => setIsUserMenuOpen(value => !value)} aria-expanded={isUserMenuOpen}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--success-bg)] text-[11px] text-[var(--success-text)]">{access.name.charAt(0)}</span><span className="hidden max-w-[140px] truncate sm:inline">{access.name}</span><ChevronDown size={13} /></button>{isUserMenuOpen && <div className="absolute right-0 top-full z-40 mt-2 w-52 rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-2  dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)]"><button type="button" className="w-full rounded-lg p-3 text-left text-xs" onClick={() => { setActiveTab('perfil'); setIsUserMenuOpen(false); }}>Meu cadastro</button><button type="button" className="flex w-full items-center gap-2 rounded-lg p-3 text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)]" onClick={() => void handleLogout()}><LogOut size={14} />Sair do portal</button></div>}</div></div></header>
    <nav className="wb-portal-navigation" aria-label="Navegação do parceiro">{tabs.map(renderTab)}<span className="wb-portal-code">Parceiro {partner.code}</span></nav>
    <main className="sentinel-main min-h-0 flex-1 overflow-y-auto">
      {activeTab === 'simulacoes' && <PartnerSimulationsView />}
      {activeTab === 'dashboard' && <PartnerPortalDashboard onNavigate={(tab, params) => { if (tab === 'propostas') setProposalFilters({ standardCategory: params?.standardCategory, waitingReturnOnly: params?.waitingReturnOnly === true }); setActiveTab(tab as any); }} onSelectProposal={id => { setProposalFilters({}); setDashboardProposalId(id); setActiveTab('propostas'); }} />}
      {activeTab === 'propostas' && <PartnerProposalsView initialStatusCategory={proposalFilters.standardCategory} initialWaitingReturnOnly={proposalFilters.waitingReturnOnly} initialProposalId={dashboardProposalId} onInitialProposalHandled={() => setDashboardProposalId(null)} onOpenChatForProposal={handleOpenChatForProposal} />}
      {activeTab === 'atendimento' && <PartnerSupportView initialProposalId={chatProposal?.id} initialProposalNumber={chatProposal?.number} />}
      {activeTab === 'perfil' && <PartnerProfileView onPasswordChanged={() => { void verifySession(); }} partner={partner} access={access} tenant={tenant} onContactUpdated={contact => setPartner(current => current ? { ...current, ...contact } : current)} />}
    </main>
    <InstitutionalFooter userName={access.name} companyName={tenant.name} />
    </div>
  </div>;
};
