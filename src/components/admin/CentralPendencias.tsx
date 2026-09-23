import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Plus,
  Search,
  User,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  FileText,
  X,
  RefreshCw,
} from 'lucide-react';

export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface PendencyItem {
  id: string;
  type: string;
  priority: PriorityLevel;
  status: string;
  title: string;
  description?: string | null;
  proposalId?: string | null;
  proposal?: {
    id: string;
    proposalNumber: string;
    contractValue: number;
    client?: { fullName?: string; name?: string; cpf: string };
    status?: { name: string; color: string };
  };
  partner?: { name: string; code: string };
  assignedTo?: { id: string; name: string; email: string };
  bank?: { name: string; code: string };
  product?: { name: string };
  convenio?: { name: string };
  slaDeadline?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  histories?: Array<{
    id: string;
    action: string;
    userName?: string;
    notes?: string;
    createdAt: string;
  }>;
}

export const CentralPendencias: React.FC = () => {
  const [pendencies, setPendencies] = useState<PendencyItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // New Pendency Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('DOCUMENTACAO');
  const [newPriority, setNewPriority] = useState<PriorityLevel>('MEDIUM');
  const [newSlaHours, setNewSlaHours] = useState('24');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolve Modal
  const [resolvingPendency, setResolvingPendency] = useState<PendencyItem | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  const fetchPendencies = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (priorityFilter !== 'ALL') params.append('priority', priorityFilter);

      const res = await fetch(`/api/pendencies?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPendencies(data.items || []);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      console.error('Erro ao buscar pendências:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendencies();
  }, [statusFilter, priorityFilter]);

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
          slaHours: parseInt(newSlaHours, 10) || 24,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewTitle('');
        setNewDescription('');
        fetchPendencies();
      }
    } catch (err) {
      console.error('Erro ao criar pendência:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string, notes?: string) => {
    try {
      const res = await fetch(`/api/pendencies/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });

      if (res.ok) {
        setResolvingPendency(null);
        setResolveNotes('');
        fetchPendencies();
      }
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  // SLA helpers
  const getSlaBadge = (deadline?: string | null, status?: string) => {
    if (status === 'RESOLVIDA') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Concluído
        </span>
      );
    }
    if (!deadline) return null;

    const diffHours = (new Date(deadline).getTime() - Date.now()) / (1000 * 3600);
    if (diffHours < 0) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 animate-pulse">
          <AlertCircle className="w-3 h-3" /> SLA Estourado ({Math.abs(Math.round(diffHours))}h)
        </span>
      );
    }
    if (diffHours < 4) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Crítico ({Math.round(diffHours)}h restantes)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
        <Clock className="w-3 h-3 text-slate-400" /> {Math.round(diffHours)}h restantes
      </span>
    );
  };

  const filteredPendencies = pendencies.filter((p) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    return (
      p.title.toLowerCase().includes(term) ||
      p.proposal?.proposalNumber?.toLowerCase().includes(term) ||
      p.proposal?.client?.name?.toLowerCase().includes(term) ||
      p.type.toLowerCase().includes(term)
    );
  });

  const abertasCount = pendencies.filter((p) => p.status === 'ABERTA').length;
  const emAtendimentoCount = pendencies.filter((p) => p.status === 'EM_ATENDIMENTO').length;
  const resolvidasCount = pendencies.filter((p) => p.status === 'RESOLVIDA').length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Central de Pendências & SLA</h2>
            <p className="text-sm text-slate-400">
              Tratamento centralizado de impedimentos da esteira com rastreabilidade de SLA e eventos em tempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPendencies}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-sm shadow-lg shadow-rose-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Pendência
          </button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Registradas</div>
          <div className="text-2xl font-bold text-white mt-1">{totalCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Abertas</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{abertasCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Em Atendimento</div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">{emAtendimentoCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Resolvidas</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{resolvidasCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1">
            <span className="text-xs text-slate-400 px-2 font-medium">Status:</span>
            {['ALL', 'ABERTA', 'EM_ATENDIMENTO', 'RESOLVIDA'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s === 'ALL' ? 'Todos' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-1">
            <span className="text-xs text-slate-400 px-2 font-medium">Prioridade:</span>
            {['ALL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  priorityFilter === p ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p === 'ALL' ? 'Todas' : p}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por título, contrato, cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Pendencies Table / Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {filteredPendencies.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/40 mb-3" />
            <div className="text-base font-semibold text-slate-300">Nenhuma pendência encontrada</div>
            <div className="text-sm mt-1">A esteira operacional está sem pendências ativas para os filtros selecionados.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredPendencies.map((item) => (
              <div key={item.id} className="p-5 hover:bg-slate-800/40 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded uppercase tracking-wider">
                      {item.type}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-bold rounded ${
                        item.priority === 'URGENT'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : item.priority === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.priority}
                    </span>
                    {getSlaBadge(item.slaDeadline, item.status)}
                    <span className="text-xs text-slate-500">
                      Criada em {new Date(item.createdAt).toLocaleDateString('pt-BR')} às {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    {item.title}
                  </h4>

                  {item.description && (
                    <p className="text-sm text-slate-400">{item.description}</p>
                  )}

                  {/* Context Links */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                    {item.proposal && (
                      <span className="flex items-center gap-1 text-slate-300 font-medium">
                        <FileText className="w-3.5 h-3.5 text-rose-400" />
                        Proposta #{item.proposal.proposalNumber}
                        {item.proposal.client && ` (${item.proposal.client.name})`}
                      </span>
                    )}
                    {item.bank && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        {item.bank.name}
                      </span>
                    )}
                    {item.assignedTo && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        Resp: {item.assignedTo.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.status !== 'RESOLVIDA' && (
                    <>
                      {item.status === 'ABERTA' && (
                        <button
                          onClick={() => handleUpdateStatus(item.id, 'EM_ATENDIMENTO')}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          Assumir
                        </button>
                      )}
                      <button
                        onClick={() => setResolvingPendency(item)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Resolver
                      </button>
                    </>
                  )}
                  {item.status === 'RESOLVIDA' && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-4 h-4" /> Resolvida
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Pendência */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Abrir Nova Pendência
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
                  placeholder="Ex: Documento de identidade ilegível ou divergente"
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
                  placeholder="Instruções para o correspondente ou digitador..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Tipo de Pendência
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="DOCUMENTACAO">Documentação</option>
                    <option value="ASSINATURA">Assinatura / Formalização</option>
                    <option value="DIVERGENCIA_DADOS">Divergência de Dados</option>
                    <option value="RETENCAO">Retenção de Margem</option>
                    <option value="ESTEIRA">Esteira Bancária</option>
                    <option value="OUTROS">Outros</option>
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
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Normal</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Crítica / Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Prazo SLA (Horas)
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={newSlaHours}
                  onChange={(e) => setNewSlaHours(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-rose-500"
                />
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
                  {isSubmitting ? 'Salvando...' : 'Criar Pendência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Resolver Pendência */}
      {resolvingPendency && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Resolver Pendência
              </h3>
              <button
                onClick={() => setResolvingPendency(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-slate-300">
              Você está marcando como resolvida a pendência: <br />
              <strong className="text-white">{resolvingPendency.title}</strong>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                Parecer / Observações da Resolução
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Novo comprovante anexado e aprovado pelo banco."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setResolvingPendency(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUpdateStatus(resolvingPendency.id, 'RESOLVIDA', resolveNotes)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Baixa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
