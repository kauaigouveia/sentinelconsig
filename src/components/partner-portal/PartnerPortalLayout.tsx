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
} from 'lucide-react';
import { SYSTEM_IDENTITY } from '../../lib/branding';
import { useTheme } from '../../context/ThemeContext';
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
  initialTab?: 'dashboard' | 'propostas' | 'atendimento' | 'perfil';
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
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white space-y-3">
        <div className="h-8 w-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-medium">Validando sessão do Portal do Parceiro...</span>
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
    tenant.whiteLabel?.logoUrl ||
    branding.logoUrl ||
    SYSTEM_IDENTITY.defaultLogo;

  return (
    <div className="min-h-screen w-screen flex flex-col bg-slate-100 dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-100 antialiased transition-colors select-none">
      {/* Top Header */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0b101d] px-4 md:px-6 flex items-center justify-between gap-4 shrink-0 z-30 transition-colors">
        {/* Brand & Portal Name */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
            <img
              src={effectiveTenantLogo}
              alt={effectiveTenantName}
              className="h-full w-full object-contain rounded-lg"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-nowrap">
              <span className="text-xs font-black tracking-tight text-slate-900 dark:text-white uppercase truncate">
                {effectiveTenantName}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0">
                PARCEIRO
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate">
              Portal do Parceiro • {partner.name} (Cód: {partner.code})
            </p>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <button onClick={() => setActiveTab('simulacoes')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${activeTab === 'simulacoes' ? 'bg-violet-600 text-white' : ''}`}>Simulações</button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setProposalFilters({});
              setActiveTab('propostas');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'propostas'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Minhas Propostas</span>
          </button>

          <button
            onClick={() => setActiveTab('atendimento')}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'atendimento'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>Atendimento</span>
            {unreadSupportCount > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                {unreadSupportCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('perfil')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'perfil'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Meu Cadastro</span>
          </button>
        </nav>

        {/* Right Tools & User Menu */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Alternar Tema"
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User Profile */}
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 h-8.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-xs"
            >
              <div className="h-5.5 w-5.5 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                {access.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-200 max-w-[120px] truncate hidden sm:inline">
                {access.name}
              </span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl z-50 animate-in fade-in text-xs space-y-1">
                <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-black text-slate-900 dark:text-white truncate">{access.name}</p>
                  <p className="text-[10.5px] text-slate-400 font-mono truncate">{access.email}</p>
                </div>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setActiveTab('perfil');
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300 text-left transition-colors cursor-pointer"
                >
                  <User className="h-3.5 w-3.5 text-blue-500" />
                  <span>Meu Cadastro</span>
                </button>

                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-rose-600 dark:text-rose-400 text-left transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sair do Portal</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Tabs */}
      <div className="md:hidden flex items-center justify-around bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 py-1.5 text-xs">
        <button onClick={() => setActiveTab('simulacoes')} className={`rounded-lg px-2 py-1 font-bold ${activeTab === 'simulacoes' ? 'bg-violet-600 text-white' : ''}`}>Simulações</button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-1 py-1 px-2.5 rounded-lg font-bold ${
            activeTab === 'dashboard' ? 'bg-blue-500/10 text-blue-600' : 'text-slate-500'
          }`}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => {
            setProposalFilters({});
            setActiveTab('propostas');
          }}
          className={`flex items-center gap-1 py-1 px-2.5 rounded-lg font-bold ${
            activeTab === 'propostas' ? 'bg-blue-500/10 text-blue-600' : 'text-slate-500'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>Propostas</span>
        </button>

        <button
          onClick={() => setActiveTab('atendimento')}
          className={`relative flex items-center gap-1 py-1 px-2.5 rounded-lg font-bold ${
            activeTab === 'atendimento' ? 'bg-blue-500/10 text-blue-600' : 'text-slate-500'
          }`}
        >
          <Headphones className="h-3.5 w-3.5" />
          <span>Suporte</span>
          {unreadSupportCount > 0 && (
            <span className="h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">
              {unreadSupportCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('perfil')}
          className={`flex items-center gap-1 py-1 px-2.5 rounded-lg font-bold ${
            activeTab === 'perfil' ? 'bg-blue-500/10 text-blue-600' : 'text-slate-500'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          <span>Perfil</span>
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
        {activeTab === 'simulacoes' && <PartnerSimulationsView />}
        {activeTab === 'dashboard' && (
          <PartnerPortalDashboard
            onNavigate={(tab, params) => {
              if (tab === 'propostas') {
                setProposalFilters({
                  standardCategory: params?.standardCategory,
                  waitingReturnOnly: params?.waitingReturnOnly === true,
                });
              }
              setActiveTab(tab as any);
            }}
            onSelectProposal={(propId) => {
              setProposalFilters({});
              setDashboardProposalId(propId);
              setActiveTab('propostas');
            }}
          />
        )}

        {activeTab === 'propostas' && (
          <PartnerProposalsView
            initialStatusCategory={proposalFilters.standardCategory}
            initialWaitingReturnOnly={proposalFilters.waitingReturnOnly}
            initialProposalId={dashboardProposalId}
            onInitialProposalHandled={() => setDashboardProposalId(null)}
            onOpenChatForProposal={handleOpenChatForProposal}
          />
        )}

        {activeTab === 'atendimento' && (
          <PartnerSupportView
            initialProposalId={chatProposal?.id}
            initialProposalNumber={chatProposal?.number}
          />
        )}

        {activeTab === 'perfil' && (
          <PartnerProfileView
            partner={partner}
            access={access}
            tenant={tenant}
            onContactUpdated={(contact) => setPartner(current => current ? { ...current, ...contact } : current)}
          />
        )}
      </main>
    </div>
  );
};
