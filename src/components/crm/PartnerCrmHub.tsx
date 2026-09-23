import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Building,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  MessageSquare,
  ListTodo,
  ExternalLink,
  Edit2,
  Trash2,
  LayoutGrid,
  List,
  Upload,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { MetricCard } from '../ui/MetricCard';
import { PartnerDetailModal } from './PartnerDetailModal';
import { PartnerFormModal } from './PartnerFormModal';
import { PartnerImportModal } from '../admin/PartnerImportModal';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

export const PartnerCrmHub: React.FC = () => {
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [operationalFilter, setOperationalFilter] = useState('ALL');
  const [promoterFilter, setPromoterFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Aux state
  const [promoters, setPromoters] = useState<any[]>([]);
  const [internalUsers, setInternalUsers] = useState<any[]>([]);

  // Modals
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<any | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deletingPartner, setDeletingPartner] = useState<any | null>(null);

  // Load Promoters & Users for dropdowns
  const loadAuxData = useCallback(async () => {
    try {
      const [promRes, usersRes] = await Promise.all([
        fetch('/api/promoters'),
        fetch('/api/users'),
      ]);
      if (promRes.ok) {
        const data = await promRes.json();
        setPromoters(Array.isArray(data) ? data : []);
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setInternalUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error loading aux data:', err);
    }
  }, []);

  // Load Partners with CRM aggregates
  const loadPartners = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.append('crm', 'true');
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (promoterFilter !== 'ALL') params.append('promoterId', promoterFilter);
      if (operationalFilter !== 'ALL') params.append('operationalStatus', operationalFilter);

      const res = await fetch(`/api/partners?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Erro ao carregar parceiros (HTTP ${res.status})`);
      }
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        setPartners(json.data);
      } else if (Array.isArray(json)) {
        setPartners(json);
      } else {
        setPartners([]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao buscar dados do CRM de parceiros.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, promoterFilter, operationalFilter]);

  useEffect(() => {
    loadAuxData();
  }, [loadAuxData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPartners();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadPartners]);

  // Overall statistics
  const stats = useMemo(() => {
    const total = partners.length;
    const activeCadastral = partners.filter(p => p.status === 'ATIVO').length;
    const activeRecent = partners.filter(p => p.operationalStatus === 'ATIVO_RECENTE').length;
    const noActivity = partners.filter(p => p.operationalStatus === 'SEM_ATIVIDADE').length;
    const withPendencies = partners.filter(p => p.operationalStatus === 'COM_PENDENCIAS').length;
    const totalVolume = partners.reduce((acc, p) => acc + (Number(p.metrics?.totalProposalsVolume) || 0), 0);
    const totalProposals = partners.reduce((acc, p) => acc + (Number(p.metrics?.totalProposalsCount) || 0), 0);

    return {
      total,
      activeCadastral,
      activeRecent,
      noActivity,
      withPendencies,
      totalVolume,
      totalProposals,
    };
  }, [partners]);

  const handleDeletePartner = async () => {
    if (!deletingPartner) return;
    try {
      const res = await fetch(`/api/partners/${deletingPartner.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao remover parceiro.');
      setDeletingPartner(null);
      loadPartners();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover parceiro.');
    }
  };

  const getOperationalBadge = (status?: string) => {
    switch (status) {
      case 'ATIVO_RECENTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Ativo Recente
          </span>
        );
      case 'COM_PENDENCIAS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Com Pendências
          </span>
        );
      case 'SEM_ATIVIDADE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-500" />
            Sem Atividade Recente
          </span>
        );
      case 'INATIVO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-500" />
            Inativo
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              CRM de Parceiros Comerciais
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gestão operacional confidencial 360°, acompanhamento de produção, interações, tarefas e pendências
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar
          </button>
          <button
            onClick={() => {
              setEditingPartner(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Parceiro
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <MetricCard
          title="Total de Parceiros"
          value={stats.total}
          subtitle={`${stats.activeCadastral} cadastros ativos`}
          icon={<Building className="w-5 h-5 text-blue-600" />}
        />

        <MetricCard
          title="Ativos Recentes"
          value={stats.activeRecent}
          subtitle="Com atividade nos últimos 7d"
          icon={<UserCheck className="w-5 h-5 text-emerald-600" />}
        />

        <MetricCard
          title="Sem Atividade"
          value={stats.noActivity}
          subtitle="Oportunidade de reativação"
          icon={<Clock className="w-5 h-5 text-slate-500" />}
        />

        <MetricCard
          title="Com Pendências"
          value={stats.withPendencies}
          subtitle="Acompanhamento prioritário"
          icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
        />

        <MetricCard
          title="Volume em Produção"
          value={`R$ ${(stats.totalVolume / 1000).toFixed(0)}k`}
          subtitle={`${stats.totalProposals} propostas digitadas`}
          icon={<DollarSign className="w-5 h-5 text-indigo-600" />}
        />
      </div>

      {/* Filter & Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por Razão Social, código, CNPJ/CPF, e-mail ou telefone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Quick Selects */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Cadastral */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">Status: Todos</option>
              <option value="ATIVO">Cadastral: Ativo</option>
              <option value="INATIVO">Cadastral: Inativo</option>
            </select>

            {/* Status Operacional */}
            <select
              value={operationalFilter}
              onChange={e => setOperationalFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">Operacional: Todos</option>
              <option value="ATIVO_RECENTE">Ativo Recente</option>
              <option value="SEM_ATIVIDADE">Sem Atividade Recente</option>
              <option value="COM_PENDENCIAS">Com Pendências</option>
            </select>

            {/* Promotora */}
            <select
              value={promoterFilter}
              onChange={e => setPromoterFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="ALL">Promotora: Todas</option>
              {promoters.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
                title="Visualização em Grade"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
                title="Visualização em Tabela"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={loadPartners}
              className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Partners Display */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          Carregando base de parceiros...
        </div>
      ) : errorMsg ? (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : partners.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          Nenhum parceiro encontrado com os filtros aplicados.
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map(p => (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Card Top: Title & Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                      {p.name || p.fullName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {p.code || p.login}
                      </span>
                      {p.promoter?.name && (
                        <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                          {p.promoter.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {getOperationalBadge(p.operationalStatus)}
                    {p.status === 'INATIVO' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase bg-rose-100 text-rose-700">
                        Inativo
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Middle: Production & Activities Metrics */}
                <div className="grid grid-cols-3 gap-2 mt-4 p-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Propostas</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                      {p.metrics?.totalProposalsCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Volume</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                      R$ {((p.metrics?.totalProposalsVolume || 0) / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">Pendências</span>
                    <span
                      className={`font-bold text-xs ${
                        (p.metrics?.openPendenciesCount || 0) > 0 ? 'text-amber-600' : 'text-slate-500'
                      }`}
                    >
                      {p.metrics?.openPendenciesCount || 0}
                    </span>
                  </div>
                </div>

                {/* Assigned internal operator & last activity */}
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Op: <strong>{p.assignedUser?.name || 'Geral'}</strong></span>
                  {p.lastActivityAt && (
                    <span>Última ativ: {new Date(p.lastActivityAt).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
              </div>

              {/* Card Footer: Action buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button
                  onClick={() => {
                    setSelectedPartnerId(p.id);
                    setIsDetailOpen(true);
                  }}
                  className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Perfil 360°
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingPartner(p);
                      setIsFormOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingPartner(p)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Parceiro</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Status Operacional</th>
                  <th className="px-4 py-3">Promotora</th>
                  <th className="px-4 py-3">Responsável</th>
                  <th className="px-4 py-3 text-right">Propostas</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-center">Pendências</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {partners.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-850/60">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                        {p.name || p.fullName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {p.document || p.email || 'Sem dados adicionais'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-300">
                      {p.code || p.login}
                    </td>
                    <td className="px-4 py-3">{getOperationalBadge(p.operationalStatus)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {p.promoter?.name || '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                      {p.assignedUser?.name || 'Geral'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                      {p.metrics?.totalProposalsCount || 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {Number(p.metrics?.totalProposalsVolume || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(p.metrics?.openPendenciesCount || 0) > 0 ? (
                        <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                          {p.metrics?.openPendenciesCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setSelectedPartnerId(p.id);
                            setIsDetailOpen(true);
                          }}
                          className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
                        >
                          CRM 360°
                        </button>
                        <button
                          onClick={() => {
                            setEditingPartner(p);
                            setIsFormOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingPartner(p)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <PartnerDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        partnerId={selectedPartnerId}
        onPartnerUpdated={loadPartners}
        users={internalUsers}
      />

      <PartnerFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={loadPartners}
        partner={editingPartner}
        promoters={promoters}
        users={internalUsers}
      />

      <PartnerImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportCompleted={loadPartners}
      />

      {deletingPartner && (
        <DeleteConfirmationModal
          isOpen={Boolean(deletingPartner)}
          onClose={() => setDeletingPartner(null)}
          onConfirm={handleDeletePartner}
          title="Excluir Parceiro"
          itemType="Parceiro"
          itemName={deletingPartner.name || deletingPartner.fullName || ''}
          description="Tem certeza que deseja remover este parceiro da base operacional interna?"
        />
      )}
    </div>
  );
};
