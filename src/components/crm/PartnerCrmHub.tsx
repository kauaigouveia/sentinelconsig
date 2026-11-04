import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Key,
} from 'lucide-react';
import { MetricCard } from '../ui/MetricCard';
import { PartnerDetailModal } from './PartnerDetailModal';
import { PartnerFormModal } from './PartnerFormModal';
import { PartnerImportModal } from '../admin/PartnerImportModal';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { useRouter } from '../../router';
import { PartnerBatchActions } from './PartnerBatchActions';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';

export const PartnerCrmHub: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  const { searchParams, navigate } = useRouter();
  const activeUser = StorageService.getActiveUser();
  const canDeletePartners = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.delete') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.crm.admin');
  const canResetPartners = hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.update') || hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.crm.admin');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const [partners, setPartners] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const partnersRequestRef = useRef(0);

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
  const tenantScope=StorageService.getSyncScope();
  const partnersAbortRef=useRef<AbortController|null>(null);
  useEffect(()=>()=>{partnersAbortRef.current?.abort();partnersRequestRef.current++;},[tenantScope]);
  const loadAuxData = useCallback(async () => {
    try {
      const [promRes, usersRes] = await Promise.all([
        StorageService.readCatalog('/api/promoters'),
        StorageService.readCatalog('/api/users'),
      ]);
      if (promRes) {
        const data = promRes;
        setPromoters(Array.isArray(data) ? data : []);
      }
      if (usersRes) {
        const data = usersRes;
        setInternalUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error loading aux data:', err);
    }
  }, [tenantScope]);

  // Load Partners with CRM aggregates
  const loadPartners = useCallback(async () => {
    const requestId = ++partnersRequestRef.current;
    partnersAbortRef.current?.abort();
    const controller=new AbortController();partnersAbortRef.current=controller;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.append('crm', 'true');
      params.append('limit', '100');
      params.append('page', String(page));
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (promoterFilter !== 'ALL') params.append('promoterId', promoterFilter);
      if (operationalFilter !== 'ALL') params.append('operationalStatus', operationalFilter);

      const res = await fetch(`/api/partners?${params.toString()}`,{signal:controller.signal});
      if (!res.ok) {
        throw new Error(`Erro ao carregar parceiros (HTTP ${res.status})`);
      }
      const json = await res.json();
      if (requestId !== partnersRequestRef.current || controller.signal.aborted || tenantScope!==StorageService.getSyncScope()) return;
      if (json && Array.isArray(json.data)) {
        const availablePages = Math.max(1, Number(json.pagination?.totalPages) || 1);
        setTotalPages(availablePages);
        if (page > availablePages) { setPage(availablePages); return; }
        setPartners(json.data);
      } else if (Array.isArray(json)) {
        setPartners(json);
      } else {
        setPartners([]);
      }
    } catch (err: any) {
      if (!controller.signal.aborted && requestId === partnersRequestRef.current && tenantScope===StorageService.getSyncScope()) {
        setErrorMsg(err.message || 'Falha ao buscar dados do CRM de parceiros.');
      }
    } finally {
      if (requestId === partnersRequestRef.current) setLoading(false);
    }
  }, [searchTerm, statusFilter, promoterFilter, operationalFilter, page,tenantScope]);

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [searchTerm, statusFilter, promoterFilter, operationalFilter]);

  useEffect(() => {
    loadAuxData();
  }, [loadAuxData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPartners();
    }, 200);
    return () => {clearTimeout(timer);partnersAbortRef.current?.abort();partnersRequestRef.current++;};
  }, [loadPartners]);

  useEffect(() => {
    const partnerId = searchParams.get('partnerId');
    if (!partnerId || loading) return;
    const partner = partners.find(item => item.id === partnerId);
    if (!partner) return;
    setSelectedPartnerId(partner.id);
    setIsDetailOpen(true);
    navigate('/crm-parceiros', { replace: true });
  }, [searchParams, partners, loading, navigate]);

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

  useEffect(() => { setSelectedIds(previous => new Set([...previous].filter(id => partners.some(p => p.id === id)))); }, [partners]);

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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-bg)] animate-pulse" />
            Ativo Recente
          </span>
        );
      case 'COM_PENDENCIAS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            <AlertTriangle className="w-3 h-3 text-[var(--warning-text)]" />
            Com Pendências
          </span>
        );
      case 'SEM_ATIVIDADE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <Clock className="w-3 h-3 text-[var(--text-secondary)]" />
            Sem Atividade Recente
          </span>
        );
      case 'INATIVO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
            <AlertCircle className="w-3 h-3 text-[var(--danger-text)]" />
            Inativo
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`space-y-6 animate-in fade-in duration-300 ${premium ? 'p2-live-module p2-live-crm' : ''}`}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]  ${premium ? 'p2-crm-header' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--info-bg)] text-[var(--text-primary)] rounded-xl  shadow-blue-500/20">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] tracking-tight flex items-center gap-2">
              CRM de Parceiros Comerciais
            </h1>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
              Gestão operacional confidencial 360°, acompanhamento de produção, interações, tarefas e pendências
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsImportOpen(true)}
            className="px-3.5 py-2 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[var(--field-border)] dark:border-[var(--field-border)]"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar
          </button>
          <button
            onClick={() => {
              setEditingPartner(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-semibold flex items-center gap-1.5   transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Parceiro
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className={`grid grid-cols-2 lg:grid-cols-5 gap-3.5 ${premium ? 'p2-crm-metrics' : ''}`}>
        <MetricCard
          title="Total de Parceiros"
          value={stats.total}
          subtitle={`${stats.activeCadastral} cadastros ativos`}
          icon={<Building className="w-5 h-5 text-[var(--link)]" />}
        />

        <MetricCard
          title="Ativos Recentes"
          value={stats.activeRecent}
          subtitle="Com atividade nos últimos 7d"
          icon={<UserCheck className="w-5 h-5 text-[var(--success-text)]" />}
        />

        <MetricCard
          title="Sem Atividade"
          value={stats.noActivity}
          subtitle="Oportunidade de reativação"
          icon={<Clock className="w-5 h-5 text-[var(--text-secondary)]" />}
        />

        <MetricCard
          title="Com Pendências"
          value={stats.withPendencies}
          subtitle="Acompanhamento prioritário"
          icon={<AlertTriangle className="w-5 h-5 text-[var(--warning-text)]" />}
        />

        <MetricCard
          title="Volume em Produção"
          value={stats.totalVolume.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          subtitle={`${stats.totalProposals} propostas digitadas`}
          icon={<DollarSign className="w-5 h-5 text-[var(--link)]" />}
        />
      </div>

      {/* Filter & Control Bar */}
      <div className={`bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-3  ${premium ? 'p2-crm-filters' : ''}`}>
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Buscar por Razão Social, código, CNPJ/CPF, e-mail ou telefone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
            />
          </div>

          {/* Quick Selects */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Cadastral */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-none"
            >
              <option value="ALL">Status: Todos</option>
              <option value="ATIVO">Cadastral: Ativo</option>
              <option value="INATIVO">Cadastral: Inativo</option>
            </select>

            {/* Status Operacional */}
            <select
              value={operationalFilter}
              onChange={e => setOperationalFilter(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-none"
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
              className="px-3 py-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-none"
            >
              <option value="ALL">Promotora: Todas</option>
              {promoters.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] p-1 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--link)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
                title="Visualização em Grade"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'table'
                    ? 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--link)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
                title="Visualização em Tabela"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={loadPartners}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <PartnerBatchActions partners={partners} selected={selectedIds} onSelection={setSelectedIds} canDelete={canDeletePartners} canReset={canResetPartners} onCompleted={loadPartners} />
      {totalPages > 1 && <nav aria-label="Páginas de parceiros" className="flex items-center justify-end gap-3 text-sm"><button disabled={loading || page === 1} onClick={() => { setSelectedIds(new Set()); setPage(p => p - 1); }}>Anterior</button><span>Página {page} de {totalPages} · até 100 parceiros por lote</span><button disabled={loading || page >= totalPages} onClick={() => { setSelectedIds(new Set()); setPage(p => p + 1); }}>Próxima</button></nav>}

      {/* Main Partners Display */}
      {loading ? (
        <div className="p-12 text-center text-[var(--text-secondary)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--link)]" />
          Carregando base de parceiros...
        </div>
      ) : errorMsg ? (
        <div className="p-4 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] rounded-2xl text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      ) : partners.length === 0 ? (
        <div className="p-12 text-center text-[var(--text-secondary)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
          Nenhum parceiro encontrado com os filtros aplicados.
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map(p => (
            <div
              key={p.id}
              className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] p-5  hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] transition-all flex flex-col justify-between group"
            >
              <div>
                {(canDeletePartners || canResetPartners) && <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />Selecionar {p.name || p.fullName}</label>}
                {/* Card Top: Title & Badges */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm group-hover:text-[var(--link)] dark:group-hover:text-[var(--link)] transition-colors line-clamp-1">
                      {p.name || p.fullName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs font-bold text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 rounded">
                        {p.code || p.login}
                      </span>
                      {p.promoter?.name && (
                        <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[140px]">
                          {p.promoter.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {getOperationalBadge(p.operationalStatus)}
                    {p.status === 'INATIVO' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase bg-[var(--danger-bg)] text-[var(--danger-text)]">
                        Inativo
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Middle: Production & Activities Metrics */}
                <div className="grid grid-cols-3 gap-2 mt-4 p-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] text-center">
                  <div>
                    <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold block">Propostas</span>
                    <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs">
                      {p.metrics?.totalProposalsCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold block">Volume</span>
                    <span className="font-bold text-[var(--success-text)] dark:text-[var(--success-text)] text-xs">
                      {Number(p.metrics?.totalProposalsVolume || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold block">Pendências</span>
                    <span
                      className={`font-bold text-xs ${
                        (p.metrics?.openPendenciesCount || 0) > 0 ? 'text-[var(--warning-text)]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {p.metrics?.openPendenciesCount || 0}
                    </span>
                  </div>
                </div>

                {/* Portal Access Status */}
                <div className="mt-3 p-2 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Key className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
                    <span className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-semibold uppercase text-[10px]">
                      Portal:
                    </span>
                    {p.portalAccess ? (
                      p.portalAccess.active ? (
                        <span className="font-medium text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-bg)] inline-block" />
                          Acesso ativo
                        </span>
                      ) : (
                        <span className="font-medium text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger-bg)] inline-block" />
                          Acesso desativado
                        </span>
                      )
                    ) : p.email ? (
                      <span className="font-medium text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-bg)] inline-block" />
                        Acesso pendente
                      </span>
                    ) : (
                      <span className="font-medium text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-bg)] inline-block" />
                        Acesso pendente
                      </span>
                    )}
                  </div>

                  {(p.portalAccess?.email || p.email) && (
                    <span
                      className="font-mono text-[10px] text-[var(--text-secondary)] truncate max-w-[130px] ml-1"
                      title={p.portalAccess?.email || p.email}
                    >
                      Login: {p.portalAccess?.email || p.email}
                    </span>
                  )}
                </div>

                {/* Assigned internal operator & last activity */}
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>Op: <strong>{p.assignedUser?.name || 'Geral'}</strong></span>
                  {p.lastActivityAt && (
                    <span>Última ativ: {new Date(p.lastActivityAt).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
              </div>

              {/* Card Footer: Action buttons */}
              <div className="mt-4 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
                <button
                  onClick={() => {
                    setSelectedPartnerId(p.id);
                    setIsDetailOpen(true);
                  }}
                  className="px-3 py-1.5 bg-[var(--info-bg)] dark:bg-[var(--info-bg)] hover:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
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
                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingPartner(p)}
                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--danger-text)] rounded-lg hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] transition-colors"
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
        <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-b border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] uppercase font-semibold">
                <tr>
                  {(canDeletePartners || canResetPartners) && <th className="px-3 py-3">Selecionar</th>}
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
              <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                {partners.map(p => (
                  <tr key={p.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                    {(canDeletePartners || canResetPartners) && <td className="px-3 py-3"><input aria-label={`Selecionar ${p.name || p.fullName}`} type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} /></td>}
                    <td className="px-4 py-3">
                      <div className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs">
                        {p.name || p.fullName}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {p.document || p.email || 'Sem dados adicionais'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {p.code || p.login}
                    </td>
                    <td className="px-4 py-3">{getOperationalBadge(p.operationalStatus)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                      {p.promoter?.name || '-'}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {p.assignedUser?.name || 'Geral'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {p.metrics?.totalProposalsCount || 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">
                      R$ {Number(p.metrics?.totalProposalsVolume || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(p.metrics?.openPendenciesCount || 0) > 0 ? (
                        <span className="px-2 py-0.5 rounded font-bold bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]">
                          {p.metrics?.openPendenciesCount}
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setSelectedPartnerId(p.id);
                            setIsDetailOpen(true);
                          }}
                          className="px-2.5 py-1 bg-[var(--info-bg)] text-[var(--link)] hover:bg-[var(--info-bg)] rounded-lg text-xs font-semibold transition-colors"
                        >
                          CRM 360°
                        </button>
                        <button
                          onClick={() => {
                            setEditingPartner(p);
                            setIsFormOpen(true);
                          }}
                          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingPartner(p)}
                          className="p-1 text-[var(--text-secondary)] hover:text-[var(--danger-text)] rounded"
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
