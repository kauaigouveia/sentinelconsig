import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Plus,
  Search,
  User as UserIcon,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  FileText,
  X,
  RefreshCw,
  Send,
  History,
  Settings,
  ShieldAlert,
  ArrowUpRight,
  TrendingDown,
  UserCheck,
  RotateCcw,
  Ban,
  Check,
  Sliders,
  DollarSign,
  Tag,
  Timer,
  AlertOctagon,
} from 'lucide-react';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SlaMetrics {
  slaStatus: 'DENTRO_SLA' | 'PROXIMO_SLA' | 'SLA_ESTOURADO' | 'RESOLVIDA' | 'CANCELADA' | 'INATIVA_TERMINAL';
  elapsedHours: number;
  remainingHours: number;
  exceededHours: number;
  percentageElapsed: number;
  isBreached: boolean;
  isWarning: boolean;
  isTerminalProposal: boolean;
}

export interface PendencyHistoryItem {
  id: string;
  action: string;
  userName?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface PendencyItem {
  id: string;
  type: string;
  priority: PriorityLevel;
  status: string;
  title: string;
  description?: string | null;
  source?: string | null;
  sourceEventId?: string | null;
  resolution?: string | null;
  proposalId?: string | null;
  proposal?: {
    id: string;
    proposalNumber: string;
    contractValue: number;
    standardCategory?: string | null;
    client?: { id?: string; fullName?: string; cpf?: string; phone?: string; email?: string };
    status?: { id?: string; name: string; color: string; finalStatus?: boolean };
  } | null;
  partner?: { name: string; code: string } | null;
  assignedTo?: { id: string; name: string; email: string } | null;
  resolvedBy?: { id: string; name: string; email: string } | null;
  bank?: { name: string; code: string } | null;
  product?: { name: string } | null;
  convenio?: { name: string } | null;
  slaDeadline?: string | null;
  assignedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  histories?: PendencyHistoryItem[];
  slaMetrics: SlaMetrics;
}

export interface PendencySummary {
  total: number;
  abertas: number;
  emAtendimento: number;
  aguardando: number;
  resolvidas: number;
  canceladas: number;
  dentroSla: number;
  proximoSla: number;
  slaEstourado: number;
  avgResolutionTimeHours: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

export const CATEGORY_LABELS: Record<string, string> = {
  DOCUMENTACAO: 'Documentação',
  DOCUMENTO: 'Documento',
  ASSINATURA: 'Assinatura / Formalização',
  DIVERGENCIA_DADOS: 'Divergência de Dados',
  DADOS_CADASTRAIS: 'Dados Cadastrais',
  RETENCAO: 'Retenção de Margem',
  ESTEIRA: 'Esteira Bancária',
  BANCO: 'Exigência Bancária',
  AVERBACAO: 'Averbação Órgão',
  MARGEM: 'Margem Insuficiente',
  INTEGRACAO: 'Falha de Integração',
  PENDENCIA_OPERACIONAL: 'Operacional',
  PENDENCIA_COMERCIAL: 'Comercial',
  OUTROS: 'Outros',
};

export const CentralPendencias: React.FC = () => {
  const [pendencies, setPendencies] = useState<PendencyItem[]>([]);
  const [summary, setSummary] = useState<PendencySummary | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [slaFilter, setSlaFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected item for drawer/timeline
  const [selectedPendency, setSelectedPendency] = useState<PendencyItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('DOCUMENTACAO');
  const [newPriority, setNewPriority] = useState<PriorityLevel>('MEDIUM');
  const [newSlaHours, setNewSlaHours] = useState('24');
  const [newProposalNumber, setNewProposalNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolve Modal
  const [resolvingPendency, setResolvingPendency] = useState<PendencyItem | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Cancel Modal
  const [cancellingPendency, setCancellingPendency] = useState<PendencyItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // SLA Config Modal
  const [showSlaConfigModal, setShowSlaConfigModal] = useState(false);
  const [slaMatrix, setSlaMatrix] = useState<Record<string, number>>({});
  const [isSavingSlaConfig, setIsSavingSlaConfig] = useState(false);

  const fetchSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      const res = await fetch('/api/pendencies/metrics');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Erro ao buscar métricas de pendências:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  const fetchPendencies = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (slaFilter !== 'ALL') params.append('slaStatus', slaFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', '100');

      const res = await fetch(`/api/pendencies?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPendencies(data.items || []);
        setTotalCount(data.total || 0);

        // Se uma pendência estiver aberta no drawer, atualizar seus dados em tela
        if (selectedPendency) {
          const updatedSelected = (data.items || []).find((p: PendencyItem) => p.id === selectedPendency.id);
          if (updatedSelected) setSelectedPendency(updatedSelected);
        }
      }
    } catch (err) {
      console.error('Erro ao listar pendências:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, slaFilter, priorityFilter, typeFilter, searchQuery, selectedPendency?.id]);

  const fetchSlaConfig = async () => {
    try {
      const res = await fetch('/api/pendencies/sla-config');
      if (res.ok) {
        const data = await res.json();
        setSlaMatrix(data.matrix || {});
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de SLA:', err);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchPendencies();
  }, [statusFilter, slaFilter, priorityFilter, typeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPendencies();
  };

  const handleRefresh = () => {
    fetchSummary();
    fetchPendencies();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/pendencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          type: newType,
          priority: newPriority,
          slaHours: parseInt(newSlaHours, 10) || undefined,
          metadata: newProposalNumber.trim() ? { proposalNumberInput: newProposalNumber.trim() } : undefined,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewTitle('');
        setNewDescription('');
        setNewProposalNumber('');
        handleRefresh();
      }
    } catch (err) {
      console.error('Erro ao abrir pendência:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignToMe = async (id: string) => {
    try {
      const res = await fetch(`/api/pendencies/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Operador assumiu a pendência.' }),
      });
      if (res.ok) {
        handleRefresh();
      }
    } catch (err) {
      console.error('Erro ao assumir pendência:', err);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingPendency || !resolveNotes.trim() || resolveNotes.trim().length < 3) return;

    setIsResolving(true);
    try {
      const res = await fetch(`/api/pendencies/${resolvingPendency.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: resolveNotes.trim() }),
      });

      if (res.ok) {
        setResolvingPendency(null);
        setResolveNotes('');
        handleRefresh();
        if (selectedPendency?.id === resolvingPendency.id) {
          setIsDrawerOpen(false);
        }
      }
    } catch (err) {
      console.error('Erro ao resolver pendência:', err);
    } finally {
      setIsResolving(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingPendency || !cancelReason.trim()) return;

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/pendencies/${cancellingPendency.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });

      if (res.ok) {
        setCancellingPendency(null);
        setCancelReason('');
        handleRefresh();
        if (selectedPendency?.id === cancellingPendency.id) {
          setIsDrawerOpen(false);
        }
      }
    } catch (err) {
      console.error('Erro ao cancelar pendência:', err);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReopen = async (item: PendencyItem) => {
    try {
      const res = await fetch(`/api/pendencies/${item.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Pendência reaberta para tratativa complementar.' }),
      });
      if (res.ok) {
        handleRefresh();
      }
    } catch (err) {
      console.error('Erro ao reabrir pendência:', err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPendency || !newCommentText.trim()) return;

    setIsAddingComment(true);
    try {
      const res = await fetch(`/api/pendencies/${selectedPendency.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newCommentText.trim() }),
      });

      if (res.ok) {
        setNewCommentText('');
        // Recarregar os detalhes do item selecionado
        const detailRes = await fetch(`/api/pendencies/${selectedPendency.id}`);
        if (detailRes.ok) {
          const updated = await detailRes.json();
          setSelectedPendency(updated);
        }
        handleRefresh();
      }
    } catch (err) {
      console.error('Erro ao adicionar comentário:', err);
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleSaveSlaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSlaConfig(true);
    try {
      const res = await fetch('/api/pendencies/sla-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix: slaMatrix }),
      });

      if (res.ok) {
        setShowSlaConfigModal(false);
        handleRefresh();
      }
    } catch (err) {
      console.error('Erro ao salvar matriz de SLA:', err);
    } finally {
      setIsSavingSlaConfig(false);
    }
  };

  const openDrawer = async (item: PendencyItem) => {
    setSelectedPendency(item);
    setIsDrawerOpen(true);
    // Buscar histórico completo
    try {
      const res = await fetch(`/api/pendencies/${item.id}`);
      if (res.ok) {
        const fullData = await res.json();
        setSelectedPendency(fullData);
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes completos da pendência:', err);
    }
  };

  // Renderizador de Badge de SLA
  const renderSlaBadge = (metrics: SlaMetrics) => {
    if (metrics.isTerminalProposal) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5" title="A proposta vinculada já foi finalizada; SLA não contabilizado.">
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
          Proposta Concluída (SLA Inativo)
        </span>
      );
    }

    if (metrics.slaStatus === 'RESOLVIDA') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Resolvida
        </span>
      );
    }

    if (metrics.slaStatus === 'CANCELADA') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5">
          <Ban className="w-3.5 h-3.5" /> Cancelada
        </span>
      );
    }

    if (metrics.slaStatus === 'SLA_ESTOURADO') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 animate-pulse">
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          SLA Estourado (+{metrics.exceededHours}h)
        </span>
      );
    }

    if (metrics.slaStatus === 'PROXIMO_SLA') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5 text-amber-400" />
          SLA Crítico ({metrics.remainingHours}h rest.)
        </span>
      );
    }

    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        No Prazo ({metrics.remainingHours}h rest.)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-rose-500/15 text-rose-400 rounded-xl border border-rose-500/30">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight">Central de Pendências & SLA</h2>
              <span className="px-2 py-0.5 text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full">
                Operacional
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Tratamento centralizado de impedimentos da esteira com rastreabilidade de SLA, fila de atendimento e automações.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchSlaConfig();
              setShowSlaConfigModal(true);
            }}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors text-xs font-semibold flex items-center gap-2"
            title="Matriz de Prazos de SLA por Categoria"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Configurar SLA
          </button>
          <button
            onClick={handleRefresh}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isSummaryLoading ? 'animate-spin text-rose-400' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs shadow-lg shadow-rose-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Pendência
          </button>
        </div>
      </div>

      {/* KPI Counters & SLA Health */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Total Fila</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {summary?.total ?? totalCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">pendências no tenant</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center justify-between">
            <span>Abertas</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">
            {summary?.abertas ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">aguardando operador</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center justify-between">
            <span>Em Atendimento</span>
            <UserCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-400 mt-2">
            {summary?.emAtendimento ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">sendo tratadas</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
            <span>Dentro do SLA</span>
            <Check className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">
            {summary?.dentroSla ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">prazos confortáveis</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between border-rose-500/20 bg-rose-950/10">
          <div className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center justify-between">
            <span>SLA Estourado</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2">
            {summary?.slaEstourado ?? 0}
          </div>
          <div className="text-xs text-rose-400/70 mt-1">atenção imediata</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Resolvidas</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-200 mt-2">
            {summary?.resolvidas ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            méd: {summary?.avgResolutionTimeHours ?? 0}h por baixa
          </div>
        </div>
      </div>

      {/* Advanced Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Status buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1">
            <span className="text-xs text-slate-400 px-2 font-medium">Status:</span>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'ABERTA', label: 'Abertas' },
              { id: 'EM_ATENDIMENTO', label: 'Em Atendimento' },
              { id: 'AGUARDANDO', label: 'Aguardando' },
              { id: 'RESOLVIDA', label: 'Resolvidas' },
              { id: 'CANCELADA', label: 'Canceladas' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === s.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* SLA Filter */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1">
            <span className="text-xs text-slate-400 px-2 font-medium">SLA:</span>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'DENTRO_SLA', label: 'No Prazo', color: 'hover:text-emerald-400' },
              { id: 'PROXIMO_SLA', label: 'Crítico', color: 'hover:text-amber-400' },
              { id: 'SLA_ESTOURADO', label: 'Estourado', color: 'hover:text-rose-400' },
            ].map((sla) => (
              <button
                key={sla.id}
                onClick={() => setSlaFilter(sla.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  slaFilter === sla.id
                    ? sla.id === 'SLA_ESTOURADO'
                      ? 'bg-rose-600 text-white'
                      : sla.id === 'PROXIMO_SLA'
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-600 text-white'
                    : `text-slate-400 ${sla.color || 'hover:text-white'}`
                }`}
              >
                {sla.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar contrato, cliente, CPF, título..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-rose-500 placeholder-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchPendencies();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>

        {/* Secondary filters (Priority and Type) */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Prioridade:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="ALL">Todas</option>
              <option value="URGENT">Crítica / Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Normal</option>
              <option value="LOW">Baixa</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Categoria / Tipo:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="ALL">Todas as Categorias</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {(statusFilter !== 'ALL' || slaFilter !== 'ALL' || priorityFilter !== 'ALL' || typeFilter !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setSlaFilter('ALL');
                setPriorityFilter('ALL');
                setTypeFilter('ALL');
                setSearchQuery('');
              }}
              className="text-rose-400 hover:text-rose-300 ml-auto flex items-center gap-1 font-semibold"
            >
              <RotateCcw className="w-3 h-3" /> Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Main List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-16 text-center text-slate-500 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-rose-500" />
            <div className="text-sm font-medium">Carregando pendências operacionais...</div>
          </div>
        ) : pendencies.length === 0 ? (
          <div className="p-16 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/40 mb-2" />
            <div className="text-base font-semibold text-slate-300">Nenhuma pendência encontrada</div>
            <div className="text-xs text-slate-500 max-w-sm mx-auto">
              Não há impedimentos operacionais para os filtros selecionados ou a fila está 100% em dia.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {pendencies.map((item) => {
              const sla = item.slaMetrics;
              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-slate-800/40 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left Column: Context, Title, Badges */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded uppercase tracking-wider border border-slate-700/60">
                        {CATEGORY_LABELS[item.type] || item.type}
                      </span>

                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded ${
                          item.priority === 'URGENT'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : item.priority === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {item.priority === 'URGENT' ? 'CRÍTICA' : item.priority === 'HIGH' ? 'ALTA' : item.priority === 'MEDIUM' ? 'NORMAL' : 'BAIXA'}
                      </span>

                      {renderSlaBadge(sla)}

                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-600" />
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')} às {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h4
                      onClick={() => openDrawer(item)}
                      className="text-sm md:text-base font-bold text-white hover:text-rose-400 cursor-pointer transition-colors flex items-center gap-2"
                    >
                      {item.title}
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </h4>

                    {item.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 max-w-3xl">{item.description}</p>
                    )}

                    {/* Progress Bar of SLA */}
                    {!sla.isTerminalProposal && item.status !== 'RESOLVIDA' && item.status !== 'CANCELADA' && (
                      <div className="w-full max-w-md bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-300 ${
                            sla.isBreached
                              ? 'bg-rose-500'
                              : sla.isWarning
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                          }`}
                          style={{ width: `${Math.min(100, sla.percentageElapsed)}%` }}
                        />
                      </div>
                    )}

                    {/* Linked Proposal / Bank Context */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5">
                      {item.proposal && (
                        <span className="flex items-center gap-1 text-slate-200 font-semibold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          <FileText className="w-3.5 h-3.5 text-rose-400" />
                          Proposta #{item.proposal.proposalNumber}
                          {item.proposal.client && ` • ${item.proposal.client.fullName || 'Cliente'}`}
                          {item.proposal.contractValue ? ` (R$ ${Number(item.proposal.contractValue).toLocaleString('pt-BR')})` : ''}
                        </span>
                      )}
                      {item.bank && (
                        <span className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {item.bank.name}
                        </span>
                      )}
                      {item.assignedTo ? (
                        <span className="flex items-center gap-1 text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/40 font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                          {item.assignedTo.name}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/30">
                          <UserIcon className="w-3.5 h-3.5" /> Fila Geral
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                    {item.status !== 'RESOLVIDA' && item.status !== 'CANCELADA' && (
                      <>
                        {!item.assignedTo && (
                          <button
                            onClick={() => handleAssignToMe(item.id)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> Assumir
                          </button>
                        )}
                        <button
                          onClick={() => setResolvingPendency(item)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Baixar
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => openDrawer(item)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                      title="Histórico e Acompanhamento"
                    >
                      <History className="w-3.5 h-3.5 text-slate-400" /> Detalhes
                    </button>

                    {(item.status === 'RESOLVIDA' || item.status === 'CANCELADA') && (
                      <button
                        onClick={() => handleReopen(item)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-1"
                        title="Reabrir pendência"
                      >
                        <RotateCcw className="w-3 h-3" /> Reabrir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawer Lateral: Detalhes Completos & Timeline Histórico */}
      {isDrawerOpen && selectedPendency && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded uppercase">
                    {selectedPendency.type}
                  </span>
                  {renderSlaBadge(selectedPendency.slaMetrics)}
                </div>
                <h3 className="text-lg font-bold text-white leading-snug">
                  {selectedPendency.title}
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Context Cards */}
              {selectedPendency.proposal && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Dados da Proposta Vinculada
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Contrato / Número:</span>
                      <div className="text-white font-semibold">#{selectedPendency.proposal.proposalNumber}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Valor Contrato:</span>
                      <div className="text-white font-semibold">
                        R$ {Number(selectedPendency.proposal.contractValue || 0).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Cliente:</span>
                      <div className="text-slate-200 font-medium">
                        {selectedPendency.proposal.client?.fullName || 'Não informado'}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">CPF:</span>
                      <div className="text-slate-200 font-mono">
                        {selectedPendency.proposal.client?.cpf || 'Não informado'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolution Note if Resolved */}
              {selectedPendency.status === 'RESOLVIDA' && selectedPendency.resolution && (
                <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-xl p-4 space-y-1.5">
                  <div className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Parecer Formal de Resolução
                  </div>
                  <p className="text-xs text-slate-200 whitespace-pre-wrap">{selectedPendency.resolution}</p>
                  <div className="text-[11px] text-slate-400 pt-1">
                    Baixada por {selectedPendency.resolvedBy?.name || 'Operador'} em{' '}
                    {selectedPendency.resolvedAt ? new Date(selectedPendency.resolvedAt).toLocaleString('pt-BR') : ''}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedPendency.description && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Instruções / Descrição</div>
                  <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap">
                    {selectedPendency.description}
                  </p>
                </div>
              )}

              {/* Timeline of Histories */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" /> Linha do Tempo & Auditoria
                </div>

                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800 pl-8">
                  {selectedPendency.histories && selectedPendency.histories.length > 0 ? (
                    selectedPendency.histories.map((h) => (
                      <div key={h.id} className="relative text-xs space-y-1">
                        <div className="absolute -left-8 top-0.5 w-4 h-4 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-white">{h.userName || 'Sistema'}</span>
                          <span className="text-[11px]">
                            {new Date(h.createdAt).toLocaleDateString('pt-BR')} às {new Date(h.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-indigo-300 font-medium">{h.action}</div>
                        {h.notes && (
                          <div className="text-slate-300 bg-slate-950/80 p-2 rounded border border-slate-800/80">
                            {h.notes}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500">Nenhum evento registrado ainda.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer: Add Comment & Quick Resolution */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-3">
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Adicionar nota ou comentário na timeline..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isAddingComment || !newCommentText.trim()}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar
                </button>
              </form>

              <div className="flex items-center justify-between gap-2 pt-1">
                {selectedPendency.status !== 'RESOLVIDA' && selectedPendency.status !== 'CANCELADA' && (
                  <>
                    <button
                      onClick={() => setCancellingPendency(selectedPendency)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-rose-400 font-semibold"
                    >
                      Cancelar Pendência
                    </button>
                    <button
                      onClick={() => setResolvingPendency(selectedPendency)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Baixar Pendência
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Pendência */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                Abrir Nova Pendência Operacional
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Título da Pendência *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Documento de identidade divergente ou ilegível"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Descrição detalhada
                </label>
                <textarea
                  rows={3}
                  placeholder="Instruções para o correspondente, digitador ou operador..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Categoria / Tipo
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Prioridade
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as PriorityLevel)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="LOW">Baixa (48h)</option>
                    <option value="MEDIUM">Normal (24h)</option>
                    <option value="HIGH">Alta (4h)</option>
                    <option value="URGENT">Crítica / Urgente (2h)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Prazo SLA Customizado (Horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={newSlaHours}
                    onChange={(e) => setNewSlaHours(e.target.value)}
                    placeholder="Padrão da Matriz"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Nº Proposta (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newProposalNumber}
                    onChange={(e) => setNewProposalNumber(e.target.value)}
                    placeholder="Ex: 100234"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Abrir Pendência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Baixar / Resolver Pendência */}
      {resolvingPendency && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Baixar / Resolver Pendência
              </h3>
              <button
                onClick={() => setResolvingPendency(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="text-slate-500">Pendência:</span>
              <div className="font-semibold text-white">{resolvingPendency.title}</div>
            </div>

            <form onSubmit={handleResolve} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Parecer Formal de Resolução * (Obrigatório)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ex: Documento complementar anexado e validado com sucesso junto ao banco parceiro."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResolvingPendency(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isResolving || resolveNotes.trim().length < 3}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isResolving ? 'Gravando...' : 'Confirmar Resolução'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cancelar Pendência */}
      {cancellingPendency && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Ban className="w-5 h-5 text-rose-500" />
                Cancelar Pendência
              </h3>
              <button
                onClick={() => setCancellingPendency(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Informe a justificativa do cancelamento (ex: proposta cancelada, duplicidade, etc.):
            </p>

            <form onSubmit={handleCancel} className="space-y-4">
              <textarea
                rows={3}
                required
                placeholder="Justificativa formal do cancelamento..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
              />

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancellingPendency(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isCancelling || !cancelReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Matriz de SLA */}
      {showSlaConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Matriz de Prazos de SLA por Categoria (Horas)
              </h3>
              <button
                onClick={() => setShowSlaConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Configure o tempo máximo de atendimento padrão para cada categoria de pendência no seu tenant.
            </p>

            <form onSubmit={handleSaveSlaConfig} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <div key={k} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={slaMatrix[k] ?? 24}
                        onChange={(e) =>
                          setSlaMatrix((prev) => ({
                            ...prev,
                            [k]: parseInt(e.target.value, 10) || 24,
                          }))
                        }
                        className="w-20 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white text-center focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-xs text-slate-500">horas</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSlaConfigModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingSlaConfig}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isSavingSlaConfig ? 'Salvando...' : 'Salvar Configurações de SLA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
