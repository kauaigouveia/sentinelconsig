import React, { useState, useEffect } from 'react';
import {
  Shield,
  Building2,
  Users,
  KeyRound,
  Package,
  FileText,
  Landmark,
  Sliders,
  AlertTriangle,
  Bot,
  Zap,
  History,
  Settings,
  Lock,
  ChevronRight,
  Sparkles,
  BarChart3,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Calendar,
  Search,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { UserManagement } from './UserManagement';
import { PerfisPermissoesView } from './PerfisPermissoesView';
import { ProductManagement } from './ProductManagement';
import { ConvenioManagement } from './ConvenioManagement';
import { BankPromoterManagement } from './BankPromoterManagement';
import { OperationalRulesManagement } from './OperationalRulesManagement';
import { StatusManagement } from './StatusManagement';
import { HolidayManagement } from './HolidayManagement';
import { PlatformMasterCentral } from '../saas/PlatformMasterCentral';
import { CentralPendencias } from './CentralPendencias';
import { CentralAutomacoes } from './CentralAutomacoes';
import { HubIntegracoes } from './HubIntegracoes';
import { AuditLogView } from './AuditLogView';
import { WhiteLabelModal } from './WhiteLabelModal';
import { AnnouncementsManagement } from './AnnouncementsManagement';
import { DomainManagement } from './DomainManagement';

export type AdminTab =
  | 'overview'
  | 'tenants'
  | 'users'
  | 'roles'
  | 'products'
  | 'convenios'
  | 'banks'
  | 'rules'
  | 'status'
  | 'calendario'
  | 'audit'
  | 'pendencies'
  | 'automations'
  | 'integrations'
  | 'whitelabel'
  | 'announcements'
  | 'domains';

export const CentralAdministracao: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [navigationQuery, setNavigationQuery] = useState('');
  const [overviewData, setOverviewData] = useState<any>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);

  const activeUser = StorageService.getActiveUser();
  const isPlatformMaster = activeUser?.role === 'PLATFORM_MASTER';
  const isMaster = isPlatformMaster || activeUser?.role === 'MASTER' || activeUser?.role === 'TENANT_ADMIN';

  const fetchOverview = async () => {
    setIsLoadingOverview(true);
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data);
      }
    } catch (err) {
      console.error('Erro ao buscar visão geral da administração:', err);
    } finally {
      setIsLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverview();
    }
  }, [activeTab]);

  const navItems = [
    { id: 'overview', label: 'Visão Geral', icon: BarChart3, badge: null },
    ...(isPlatformMaster ? [{ id: 'tenants', label: 'Empresas & SaaS', icon: Building2, badge: overviewData?.tenantsCount }] : []),
    { id: 'users', label: 'Usuários', icon: Users, badge: overviewData?.usersCount },
    { id: 'roles', label: 'Perfis & Permissões', icon: KeyRound, badge: null },
    { id: 'products', label: 'Produtos Consignados', icon: Package, badge: overviewData?.productsCount },
    { id: 'convenios', label: 'Convênios', icon: FileText, badge: overviewData?.conveniosCount },
    { id: 'banks', label: 'Bancos & Promotoras', icon: Landmark, badge: overviewData?.banksCount },
    { id: 'rules', label: 'Regras Operacionais', icon: Sliders, badge: overviewData?.rulesCount },
    { id: 'status', label: 'Status do Sistema', icon: Sliders, badge: null },
    { id: 'calendario', label: 'Feriados & Prazos', icon: Calendar, badge: null },
    { id: 'audit', label: 'Trilha de Auditoria', icon: History, badge: overviewData?.auditIntegrityStatus === 'VALID' ? 'SHA-256 OK' : null },
    { id: 'pendencies', label: 'Central de Pendências', icon: AlertTriangle, badge: overviewData?.openPendenciesCount, alert: Boolean(overviewData?.openPendenciesCount) },
    { id: 'automations', label: 'Central de Automação', icon: Bot, badge: overviewData?.activeAutomationsCount },
    { id: 'integrations', label: 'Hub de Integrações', icon: Zap, badge: null },
    { id: 'whitelabel', label: 'White Label & Marca', icon: Settings, badge: null },
    { id: 'announcements', label: 'Comunicados', icon: Sparkles, badge: null },
    ...(isPlatformMaster ? [{ id: 'domains', label: 'Domínios Customizados', icon: Shield, badge: null }] : []),
  ];

  return (
    <div className={`min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col ${premium ? 'p2-live-module p2-live-administration' : ''}`}>
      {/* Top Header */}
      <div className="bg-[var(--bg-surface)] border-b border-[var(--field-border)] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[var(--info-bg)] text-[var(--link)] rounded-xl border border-[var(--field-border)]">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Configurações da empresa</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--info-bg)] text-[var(--link)] border border-[var(--field-border)]">
                Administração
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Gerencie sua equipe, os cadastros e as regras da operação.
            </p>
          </div>
        </div>

        {/* Global Security Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--field-border)] text-xs text-[var(--text-primary)]">
            <Lock className="w-3.5 h-3.5 text-[var(--success-text)]" />
            <span>Perfil: <strong className="text-[var(--text-primary)]">{activeUser?.role}</strong></span>
          </div>

          <button
            onClick={fetchOverview}
            className="p-2 rounded-lg bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] border border-[var(--field-border)] transition-colors"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingOverview ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Layout: Horizontal/Sidebar Nav + Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-[var(--bg-surface)] border-r border-[var(--field-border)] p-3 space-y-1 shrink-0 overflow-y-auto max-h-[calc(100vh-80px)]" role={premium ? 'navigation' : undefined} aria-label={premium ? 'Seções administrativas' : undefined}>
          <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider px-3 py-2">
            Módulos Administrativos
          </div>
          <label className="internal-admin-search"><Search size={16}/><input aria-label="Buscar configuração" placeholder="Encontrar configuração" value={navigationQuery} onChange={event => setNavigationQuery(event.target.value)}/></label>
          {navItems.filter(item => item.label.toLocaleLowerCase('pt-BR').includes(navigationQuery.toLocaleLowerCase('pt-BR'))).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {setActiveTab(item.id as AdminTab);setNavigationQuery('');}}
                aria-current={premium && isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--action)] text-[var(--text-primary)] font-semibold  shadow-indigo-600/20'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge !== null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      item.alert
                        ? 'bg-[var(--danger-bg)] text-[var(--text-primary)] animate-pulse'
                        : isActive
                        ? 'bg-[var(--info-bg)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Health & Overview Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Usuários Ativos</div>
                  <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">
                    {overviewData?.activeUsersCount ?? '...'}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    Total: {overviewData?.usersCount ?? '...'} contas
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4">
                  <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Produtos & Convênios</div>
                  <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">
                    {(overviewData?.productsCount || 0) + (overviewData?.conveniosCount || 0)}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    {overviewData?.productsCount ?? '...'} produtos • {overviewData?.conveniosCount ?? '...'} convênios
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4">
                  <div className="text-xs font-semibold text-[var(--danger-text)] uppercase tracking-wider">Pendências Ativas</div>
                  <div className="text-2xl font-bold text-[var(--danger-text)] mt-1">
                    {overviewData?.openPendenciesCount ?? '0'}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    Total histórico: {overviewData?.pendenciesCount ?? '0'}
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4">
                  <div className="text-xs font-semibold text-[var(--success-text)] uppercase tracking-wider">Integridade Auditoria</div>
                  <div className="text-2xl font-bold text-[var(--success-text)] mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-6 h-6 text-[var(--success-text)]" />
                    {overviewData?.auditIntegrityStatus === 'VALID' ? '100% Válida' : 'Checando...'}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">
                    Criptografia SHA-256 ativa
                  </div>
                </div>
              </div>

              <section className="internal-admin-directory" aria-label="Todas as configurações">
                <div className="internal-directory-heading"><h2>O que você precisa configurar?</h2><p>Escolha uma área para acessar seus cadastros e ferramentas.</p></div>
                {navItems.filter(item => item.id !== 'overview').map(item => <button type="button" key={item.id} onClick={() => setActiveTab(item.id as AdminTab)}><item.icon size={23}/><span><strong>{item.label}</strong><small>{['users','roles'].includes(item.id) ? 'Equipe e acesso ao sistema' : ['products','convenios','banks','status','calendario','rules'].includes(item.id) ? 'Cadastros e regras da operação' : ['audit','domains','tenants'].includes(item.id) ? 'Controle e acompanhamento' : 'Ferramentas da empresa'}</small></span><ChevronRight size={17}/></button>)}
              </section>
            </div>
          )}
          {activeTab === 'tenants' && <PlatformMasterCentral />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'roles' && <PerfisPermissoesView />}
          {activeTab === 'products' && <ProductManagement />}
          {activeTab === 'convenios' && <ConvenioManagement />}
          {activeTab === 'banks' && <BankPromoterManagement />}
          {activeTab === 'rules' && <OperationalRulesManagement />}
          {activeTab === 'status' && <StatusManagement />}
          {activeTab === 'calendario' && <HolidayManagement />}
          {activeTab === 'pendencies' && <CentralPendencias premium={premium} />}
          {activeTab === 'automations' && <CentralAutomacoes />}
          {activeTab === 'integrations' && <HubIntegracoes premium={premium} />}
          {activeTab === 'audit' && <AuditLogView />}
          {activeTab === 'whitelabel' && <WhiteLabelModal isOpen={true} onClose={() => setActiveTab('overview')} />}
          {activeTab === 'announcements' && <AnnouncementsManagement />}
          {activeTab === 'domains' && <DomainManagement />}
        </main>
      </div>
    </div>
  );
};
