import React, { useState, useEffect } from 'react';
import {
  Bot,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  RefreshCw,
  Zap,
  ArrowRight,
  Bell,
  AlertTriangle,
  X,
} from 'lucide-react';

interface AutomationItem {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  event: string;
  conditions: Array<{ field: string; operator: string; value: any }>;
  actions: Array<{ type: string; params: any }>;
  createdAt: string;
  createdBy?: { name: string; email: string };
  _count?: { executions: number };
}

export const CentralAutomacoes: React.FC = () => {
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [event, setEvent] = useState('PROPOSAL_STATUS_CHANGED');
  const [actionType, setActionType] = useState('NOTIFY_USER');
  const [actionParams, setActionParams] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchAutomations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/automations');
      if (res.ok) {
        const data = await res.json();
        setAutomations(data);
      }
    } catch (err) {
      console.error('Erro ao buscar automações:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        fetchAutomations();
      }
    } catch (err) {
      console.error('Erro ao alterar status da regra:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta regra de automação?')) return;
    try {
      const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAutomations();
      }
    } catch (err) {
      console.error('Erro ao excluir regra:', err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          event,
          conditions: [],
          actions: [{ type: actionType, params: { message: actionParams } }],
          active: true,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setName('');
        setDescription('');
        setActionParams('');
        fetchAutomations();
      }
    } catch (err) {
      console.error('Erro ao salvar automação:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-violet-500/20 text-violet-400 rounded-xl border border-violet-500/30">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Central de Automação & Workflows</h2>
            <p className="text-sm text-slate-400">
              Gatilhos automatizados orientados a eventos de esteira, auditoria e notificações reativas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAutomations}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-semibold text-sm shadow-lg shadow-violet-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Automação
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Regras Configuradas</div>
          <div className="text-2xl font-bold text-white mt-1">{automations.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Regras Ativas</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {automations.filter((a) => a.active).length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Disparos Executados</div>
          <div className="text-2xl font-bold text-violet-400 mt-1">
            {automations.reduce((acc, a) => acc + (a._count?.executions || 0), 0)}
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {automations.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Zap className="w-12 h-12 mx-auto text-violet-500/40 mb-3" />
            <div className="text-base font-semibold text-slate-300">Nenhuma regra de automação ativa</div>
            <div className="text-sm mt-1">Crie sua primeira regra para automatizar notificações ou transições de esteira.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {automations.map((rule) => (
              <div
                key={rule.id}
                className="p-5 hover:bg-slate-800/40 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${
                        rule.active
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {rule.active ? 'ATIVO' : 'PAUSADO'}
                    </span>
                    <span className="text-xs font-mono text-violet-400 bg-violet-950/40 border border-violet-800/30 px-2 py-0.5 rounded">
                      Gatilho: {rule.event}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-white">{rule.name}</h4>
                  {rule.description && (
                    <p className="text-sm text-slate-400">{rule.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                    <span>Criado por {rule.createdBy?.name || 'Sistema'}</span>
                    <span>•</span>
                    <span>{rule._count?.executions || 0} execuções registradas</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => handleToggle(rule.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    {rule.active ? (
                      <>
                        <ToggleRight className="w-4 h-4 text-emerald-400" /> Pausar
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-4 h-4 text-slate-500" /> Ativar
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                    title="Excluir regra"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Regra */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-500" />
                Nova Regra de Automação
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
                  Nome da Automação *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Notificar gestor quando proposta for aprovada"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Descrição
                </label>
                <textarea
                  rows={2}
                  placeholder="Objetivo da regra..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Evento Gatilho (Trigger)
                </label>
                <select
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="PROPOSAL_STATUS_CHANGED">PROPOSTA: Status Alterado</option>
                  <option value="PROPOSAL_CREATED">PROPOSTA: Nova Proposta Criada</option>
                  <option value="PROPOSAL_APPROVED">PROPOSTA: Aprovada pelo Banco</option>
                  <option value="PROPOSAL_PAID">PROPOSTA: Paga / Liquidada</option>
                  <option value="PENDENCY_CREATED">PENDÊNCIA: Nova Pendência Aberta</option>
                  <option value="PENDENCY_RESOLVED">PENDÊNCIA: Pendência Baixada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Ação a Executar
                </label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="NOTIFY_USER">Disparar Notificação no Sistema</option>
                  <option value="CREATE_TASK">Criar Tarefa Operacional</option>
                  <option value="WEBHOOK_EXTERNAL">Chamar Webhook Externo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Mensagem / Parâmetros
                </label>
                <input
                  type="text"
                  placeholder="Ex: Contrato aprovado com sucesso! Verificar esteira."
                  value={actionParams}
                  onChange={(e) => setActionParams(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
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
                  disabled={isSubmitting || !name.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Criar Automação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
