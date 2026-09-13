import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  Kanban,
  ArrowLeftRight,
  Upload,
  Download,
  Users,
  Search,
  Handshake,
  Building2,
  Headphones,
  AlertCircle,
  Clock,
  BarChart3,
  ShieldAlert,
  Sliders,
  Calendar,
  Layers,
  FileText,
  UserCheck,
  Hourglass,
  Database,
  Calculator,
  Tv,
  TrendingUp,
  Bot,
  Trophy,
  DollarSign,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Role } from '../../types';
import { getRoleEmoji, getRoleLabel } from '../../lib/roleUtils';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const activeUser = StorageService.getActiveUser();
  const role: Role = activeUser?.role || 'DIGITADOR';

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

  // RBAC Permission checks
  const isMaster = role === 'MASTER' || role === 'PLATFORM_MASTER';
  const isGestor = role === 'GESTOR' || isMaster;
  const isGerente = role === 'GERENTE' || isGestor;
  const isSuporte = role === 'SUPORTE' || isGestor;
  const isDigitador = role === 'DIGITADOR' || isMaster;

  const navItemClass = (viewName: string) =>
    `flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
      currentView === viewName
        ? 'bg-blue-600 text-white font-semibold shadow-xs'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
    }`;

  const navHeaderClass = 'px-3 mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500';

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 overflow-y-auto transition-colors">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="h-9 w-9 flex items-center justify-center shrink-0">
          {whiteLabel.logoUrl ? (
            <img
              src={whiteLabel.logoUrl}
              alt={whiteLabel.companyName}
              className="h-full w-full object-contain filter drop-shadow-sm rounded-lg"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xs flex items-center justify-center shadow-xs">
              {whiteLabel.companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="overflow-hidden">
          <h1 className="text-xs font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
            {whiteLabel.companyName}
          </h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate">
            {currentTenant.name || whiteLabel.tradeName || 'Gestão de Produção'}
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-0.5">
        {/* DASHBOARD SECTION */}
        {(isGestor || isSuporte || isDigitador) && (
          <>
            <div className={navHeaderClass}>Visão Geral & Inteligência</div>

            {isGestor && (
              <button
                id="nav-torre-controle"
                onClick={() => onNavigate('torre-controle')}
                className={navItemClass('torre-controle')}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Torre de Controle</span>
              </button>
            )}

            {/* TV Monitor Mode */}
            <button
              id="nav-tv-monitor"
              onClick={() => onNavigate('tv-monitor')}
              className={navItemClass('tv-monitor')}
            >
              <Tv className="h-4 w-4 text-emerald-500" />
              <span className="flex-1 text-left">Monitor TV (Ao Vivo)</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800">
                LIVE
              </span>
            </button>

            {isGestor && (
              <button
                id="nav-dashboard-executivo"
                onClick={() => onNavigate('dashboard-executivo')}
                className={navItemClass('dashboard-executivo')}
              >
                <BarChart3 className="h-4 w-4" />
                <span>Dashboard Executivo</span>
              </button>
            )}

            {/* Radar Comercial BI */}
            {isGestor && (
              <button
                id="nav-radar-comercial"
                onClick={() => onNavigate('radar-comercial')}
                className={navItemClass('radar-comercial')}
              >
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                <span>Radar Comercial & BI</span>
              </button>
            )}

            {/* Sentinela AI Assistant */}
            <button
              id="nav-sentinela-ai"
              onClick={() => onNavigate('sentinela-ai')}
              className={navItemClass('sentinela-ai')}
            >
              <Bot className="h-4 w-4 text-purple-500" />
              <span className="flex-1 text-left">Sentinela IA</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-800">
                IA
              </span>
            </button>

            {/* Gamification Center */}
            <button
              id="nav-gamificacao"
              onClick={() => onNavigate('gamificacao')}
              className={navItemClass('gamificacao')}
            >
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>Conquistas & Metas</span>
            </button>

            {(isGestor || isSuporte) && (
              <button
                id="nav-relatorio-gargalos"
                onClick={() => onNavigate('relatorio-gargalos')}
                className={navItemClass('relatorio-gargalos')}
              >
                <Hourglass className="h-4 w-4 text-amber-500" />
                <span>Gargalos & Permanência</span>
              </button>
            )}

            {isDigitador && (
              <button
                id="nav-home-digitador"
                onClick={() => onNavigate('home-digitador')}
                className={navItemClass('home-digitador')}
              >
                <UserCheck className="h-4 w-4" />
                <span>Minha Produção</span>
              </button>
            )}
          </>
        )}

        {/* PRODUÇÃO SECTION */}
        <div className={navHeaderClass}>Produção & Simulações</div>

        <button
          id="nav-simulacoes"
          onClick={() => onNavigate('simulacoes')}
          className={navItemClass('simulacoes')}
        >
          <Calculator className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="font-medium">Simulações</span>
        </button>

        {role !== 'SIMULACAO' && (
          <>
            <button
              id="nav-producao-todas"
              onClick={() => onNavigate('producao')}
              className={navItemClass('producao')}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Todas as Propostas</span>
            </button>

            {isDigitador && (
              <button
                id="nav-nova-producao"
                onClick={() => onNavigate('nova-producao')}
                className={navItemClass('nova-producao')}
              >
                <PlusCircle className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-emerald-700">Nova Produção (ADEs)</span>
              </button>
            )}

            <button
              id="nav-esteira-kanban"
              onClick={() => onNavigate('esteira')}
              className={navItemClass('esteira')}
            >
              <Kanban className="h-4 w-4" />
              <span>Esteira Kanban</span>
            </button>

            <button
              id="nav-portabilidades"
              onClick={() => onNavigate('portabilidades')}
              className={navItemClass('portabilidades')}
            >
              <ArrowLeftRight className="h-4 w-4" />
              <span>Portabilidades (5 Dias)</span>
            </button>

            {/* Agenda & Tarefas Operacionais */}
            <button
              id="nav-agenda-operacional"
              onClick={() => onNavigate('agenda-operacional')}
              className={navItemClass('agenda-operacional')}
            >
              <Calendar className="h-4 w-4 text-blue-500" />
              <span>Agenda & Tarefas CIP</span>
            </button>

            {isDigitador && (
              <button
                id="nav-importar-excel"
                onClick={() => onNavigate('importar-excel')}
                className={navItemClass('importar-excel')}
              >
                <Upload className="h-4 w-4 text-blue-600" />
                <span>Importar Planilha</span>
              </button>
            )}

            <button
              id="nav-exportar-propostas"
              onClick={() => onNavigate('exportar-propostas')}
              className={navItemClass('exportar-propostas')}
            >
              <Download className="h-4 w-4" />
              <span>Exportar Propostas</span>
            </button>
          </>
        )}

        {/* CLIENTES */}
        {role !== 'SIMULACAO' && (
          <>
            <div className={navHeaderClass}>Clientes (CRM 360º)</div>

            <button
              id="nav-clientes-360"
              onClick={() => onNavigate('clientes')}
              className={navItemClass('clientes')}
            >
              <Users className="h-4 w-4 text-blue-600" />
              <span>Clientes 360º & CRM</span>
            </button>

            <button
              id="nav-busca-cpf"
              onClick={() => onNavigate('busca-cpf')}
              className={navItemClass('busca-cpf')}
            >
              <Search className="h-4 w-4" />
              <span>Busca por CPF</span>
            </button>
          </>
        )}

        {/* FINANCEIRO GERAL */}
        {isGestor && (
          <>
            <div className={navHeaderClass}>Gestão Financeira</div>
            <button
              id="nav-financeiro-geral"
              onClick={() => onNavigate('financeiro-geral')}
              className={navItemClass('financeiro-geral')}
            >
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <span>Fluxo de Caixa & Entradas</span>
            </button>
          </>
        )}

        {/* PARCEIROS */}
        {isGerente && (
          <>
            <div className={navHeaderClass}>Parceiros & Promotoras</div>
            <button
              id="nav-parceiros"
              onClick={() => onNavigate('parceiros')}
              className={navItemClass('parceiros')}
            >
              <Handshake className="h-4 w-4" />
              <span>Parceiros Cadastrados</span>
            </button>
            <button
              id="nav-promotoras"
              onClick={() => onNavigate('promotoras')}
              className={navItemClass('promotoras')}
            >
              <Building2 className="h-4 w-4" />
              <span>Promotoras</span>
            </button>
          </>
        )}

        {/* SUPORTE */}
        {(isSuporte || isGestor) && (
          <>
            <div className={navHeaderClass}>Suporte & SLA</div>
            <button
              id="nav-central-suporte"
              onClick={() => onNavigate('suporte')}
              className={navItemClass('suporte')}
            >
              <Headphones className="h-4 w-4" />
              <span>Central de Suporte</span>
            </button>
            <button
              id="nav-pendencias"
              onClick={() => onNavigate('pendencias')}
              className={navItemClass('pendencias')}
            >
              <AlertCircle className="h-4 w-4" />
              <span>Pendências</span>
            </button>
            <button
              id="nav-sla"
              onClick={() => onNavigate('sla')}
              className={navItemClass('sla')}
            >
              <Clock className="h-4 w-4" />
              <span>Controle de Alçadas</span>
            </button>
          </>
        )}

        {/* ADMINISTRAÇÃO (MASTER ONLY) */}
        {isMaster && (
          <>
            <div className={navHeaderClass}>Administração & Multi-Tenant</div>

            {/* SaaS Platform Master */}
            <button
              id="nav-saas-tenants"
              onClick={() => onNavigate('saas-tenants')}
              className={navItemClass('saas-tenants')}
            >
              <HardDrive className="h-4 w-4 text-rose-500" />
              <span className="font-bold text-rose-700 dark:text-rose-400">SaaS & Tenants</span>
            </button>

            <button
              id="nav-admin-usuarios"
              onClick={() => onNavigate('admin-usuarios')}
              className={navItemClass('admin-usuarios')}
            >
              <Users className="h-4 w-4" />
              <span>Usuários & Perfis</span>
            </button>
            <button
              id="nav-admin-bancos"
              onClick={() => onNavigate('admin-bancos')}
              className={navItemClass('admin-bancos')}
            >
              <Building2 className="h-4 w-4" />
              <span>Bancos & Vínculos</span>
            </button>
            <button
              id="nav-admin-produtos"
              onClick={() => onNavigate('admin-produtos')}
              className={navItemClass('admin-produtos')}
            >
              <Layers className="h-4 w-4" />
              <span>Produtos & Regras</span>
            </button>
            <button
              id="nav-admin-status"
              onClick={() => onNavigate('admin-status')}
              className={navItemClass('admin-status')}
            >
              <Sliders className="h-4 w-4" />
              <span>Status do Sistema</span>
            </button>
            <button
              id="nav-admin-import-status"
              onClick={() => onNavigate('admin-import-status')}
              className={navItemClass('admin-import-status')}
            >
              <Upload className="h-4 w-4 text-emerald-500" />
              <span>Importar Status Bancos</span>
            </button>
            <button
              id="nav-admin-calendario"
              onClick={() => onNavigate('admin-calendario')}
              className={navItemClass('admin-calendario')}
            >
              <Calendar className="h-4 w-4" />
              <span>Feriados & SLA</span>
            </button>
            <button
              id="nav-admin-backup"
              onClick={() => onNavigate('admin-backup')}
              className={navItemClass('admin-backup')}
            >
              <Database className="h-4 w-4 text-purple-500" />
              <span>Backup & Cron</span>
            </button>
            <button
              id="nav-admin-auditoria"
              onClick={() => onNavigate('admin-auditoria')}
              className={navItemClass('admin-auditoria')}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Auditoria (AuditLog)</span>
            </button>
          </>
        )}
      </nav>

      {/* Footer info */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
        <p className="font-semibold text-slate-600 dark:text-slate-300">{whiteLabel.companyName} v2.5 Enterprise</p>
        <p className="flex items-center gap-1 mt-0.5 font-bold text-slate-700 dark:text-slate-200">
          <span>{getRoleEmoji(role)}</span>
          <span>{getRoleLabel(role)} ({role})</span>
        </p>
      </div>
    </aside>
  );
};
