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
    { id: 'integrations', label: 'Hub de Integrações', icon: Zap, badge: '4 Conexões' },
    { id: 'whitelabel', label: 'White Label & Marca', icon: Settings, badge: null },
    { id: 'announcements', label: 'Comunicados', icon: Sparkles, badge: null },
    ...(isPlatformMaster ? [{ id: 'domains', label: 'Domínios Customizados', icon: Shield, badge: null }] : []),
  ];

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col ${premium ? 'p2-live-module p2-live-administration' : ''}`}>
      {/* Top Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Central de Administração</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Sentinel OS
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Governança multi-tenant, autorizações, automações e esteira operacional unificada.
            </p>
          </div>
        </div>

        {/* Global Security Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Perfil: <strong className="text-white">{activeUser?.role}</strong></span>
          </div>

          <button
            onClick={fetchOverview}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingOverview ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Layout: Horizontal/Sidebar Nav + Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-slate-900/60 border-r border-slate-800 p-3 space-y-1 shrink-0 overflow-y-auto max-h-[calc(100vh-80px)]" role={premium ? 'navigation' : undefined} aria-label={premium ? 'Seções administrativas' : undefined}>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-2">
            Módulos Administrativos
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as AdminTab)}
                aria-current={premium && isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge !== null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      item.alert
                        ? 'bg-rose-500 text-white animate-pulse'
                        : isActive
                        ? 'bg-indigo-700 text-white'
                        : 'bg-slate-800 text-slate-400'
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
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuários Ativos</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {overviewData?.activeUsersCount ?? '...'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Total: {overviewData?.usersCount ?? '...'} contas
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Produtos & Convênios</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {(overviewData?.productsCount || 0) + (overviewData?.conveniosCount || 0)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {overviewData?.productsCount ?? '...'} produtos • {overviewData?.conveniosCount ?? '...'} convênios
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Pendências Ativas</div>
                  <div className="text-2xl font-bold text-rose-400 mt-1">
                    {overviewData?.openPendenciesCount ?? '0'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Total histórico: {overviewData?.pendenciesCount ?? '0'}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Integridade Auditoria</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    {overviewData?.auditIntegrityStatus === 'VALID' ? '100% Válida' : 'Checando...'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Criptografia SHA-256 ativa
                  </div>
                </div>
              </div>

              {/* Module Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div
                  onClick={() => setActiveTab('users')}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-indigo-500/5 space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <Users className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-white">Gestão de Usuários</h3>
                  <p className="text-xs text-slate-400">
                    Controle de identidades únicas, atribuição multi-tenant (memberships) e reset de senhas seguro.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('pendencies')}
                  className="bg-slate-900 border border-slate-800 hover:border-rose-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-rose-500/5 space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg group-hover:bg-rose-500 group-hover:text-white transition-colors">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-white">Central de Pendências</h3>
                  <p className="text-xs text-slate-400">
                    Tratamento de travas operacionais com controle de SLA, prioridades e notificações em tempo real.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('automations')}
                  className="bg-slate-900 border border-slate-800 hover:border-violet-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-violet-500/5 space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-violet-500/10 text-violet-400 rounded-lg group-hover:bg-violet-500 group-hover:text-white transition-colors">
                      <Bot className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-white">Central de Automação</h3>
                  <p className="text-xs text-slate-400">
                    Disparos automáticos baseados em eventos de propostas, webhooks e alertas reativos.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('integrations')}
                  className="bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-cyan-500/5 space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                      <Zap className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-white">Hub de Integrações Bancárias</h3>
                  <p className="text-xs text-slate-400">
                    Monitoramento de canais com Banco C6, Facta Financeira, Happy Consignado e BMG.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('products')}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-indigo-500/5 space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <Package className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-white">Produtos Globais & Exclusivos</h3>
                  <p className="text-xs text-slate-400">
                    Catálogo com 13 produtos globais do sistema e produtos exclusivos por empresa contratante.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab('convenios')}
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-emerald-500/5 space-y-3 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="text-base font-bold text-white">Convênios Globais & Locais</h3>
                  <p className="text-xs text-slate-400">
                    21 convênios padronizados para todos os tenants e regras de permissão específicas.
                  </p>
                </div>
              </div>
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
