import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  Copy,
  RefreshCw,
  Zap,
  ArrowRight,
  Bell,
  AlertTriangle,
  X,
  Search,
  Filter,
  Layers,
  Activity,
  BarChart3,
  BookOpen,
  Sliders,
  Check,
} from 'lucide-react';
import { AutomationVisualBuilder, AutomationData } from './automations/AutomationVisualBuilder';
import { AutomationTestModal } from './automations/AutomationTestModal';
import { AutomationExecutionTimelineModal } from './automations/AutomationExecutionTimelineModal';

interface AutomationItem {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  event: string;
  conditions: any;
  actions: any;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string };
  _count?: { executions: number };
  executions?: Array<{
    id: string;
    status: string;
    durationMs: number;
    createdAt: string;
    error?: string | null;
  }>;
}

interface AutomationMetrics {
  totalRules: number;
  activeRules: number;
  todayExecutions: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  avgDurationMs: number;
  pendenciesCreated: number;
}

interface ExecutionItem {
  id: string;
  event: string;
  status: string;
  result?: string | null;
  error?: string | null;
  durationMs: number;
  createdAt: string;
  automation?: { id: string; name: string; event: string };
  details?: any;
}

export const CentralAutomacoes: React.FC = () => {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'RULES' | 'HISTORY' | 'METRICS' | 'TEMPLATES'>('RULES');

  // Core Data
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any>({ triggers: [], actions: [], operators: [] });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');

  // Modal / Builder views
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Partial<AutomationData> | null>(null);
  const [testingAutomation, setTestingAutomation] = useState<AutomationItem | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionItem | null>(null);

  // Toast / Feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Carrega catálogo de gatilhos, ações e operadores
  const fetchCatalog = async () => {
    try {
      const res = await fetch('/api/automations/catalog');
      if (res.ok) {
        const data = await res.json();
        setCatalog(data);
      }
    } catch (err) {
      console.error('Erro ao buscar catálogo:', err);
    }
  };

  // Carrega lista de regras
  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch('/api/automations');
      if (res.ok) {
        const data = await res.json();
        setAutomations(data);
      }
    } catch (err) {
      console.error('Erro ao buscar automações:', err);
    }
  }, []);

  // Carrega histórico de execuções
  const fetchExecutions = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams();
      if (historyStatusFilter !== 'ALL') queryParams.set('status', historyStatusFilter);
      queryParams.set('limit', '50');

      const res = await fetch(`/api/automations/executions?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setExecutions(data.data || []);
      }
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    }
  }, [historyStatusFilter]);

  // Carrega métricas
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/automations/metrics');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Erro ao buscar métricas:', err);
    }
  }, []);

  // Carrega modelos pré-definidos
  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/automations/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Erro ao buscar modelos:', err);
    }
  };

  // Carga inicial de dados
  const loadAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchCatalog(),
      fetchAutomations(),
      fetchExecutions(),
      fetchMetrics(),
      fetchTemplates(),
    ]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Recarga ao mudar filtro de status do histórico
  useEffect(() => {
    if (activeTab === 'HISTORY') {
      fetchExecutions();
    }
  }, [activeTab, historyStatusFilter, fetchExecutions]);

  // Atualização manual
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchAutomations(), fetchExecutions(), fetchMetrics()]);
    setIsRefreshing(false);
    showToast('Dados atualizados com sucesso!');
  };

  // Toggle Ativo / Pausado
  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, active: updated.active } : a)));
        fetchMetrics();
        showToast(
          updated.active ? 'Automação ativada com sucesso!' : 'Automação pausada com sucesso.'
        );
      }
    } catch (err) {
      showToast('Falha ao alterar status da regra.', 'error');
    }
  };

  // Duplicar Regra de Automação
  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}/duplicate`, { method: 'POST' });
      if (res.ok) {
        const duplicated = await res.json();
        await fetchAutomations();
        await fetchMetrics();
        showToast(`Cópia criada com sucesso como PAUSADA: "${duplicated.name}"`);
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao duplicar automação.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão ao duplicar automação.', 'error');
    }
  };

  // Excluir Regra
  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente a automação "${name}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAutomations((prev) => prev.filter((a) => a.id !== id));
        fetchMetrics();
        showToast('Automação excluída com sucesso.');
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao excluir automação.', 'error');
      }
    } catch (err) {
      showToast('Erro ao excluir automação.', 'error');
    }
  };

  // Salvar do Construtor Visual (Criação ou Atualização)
  const handleSaveAutomation = async (data: AutomationData) => {
    const isEdit = Boolean(data.id);
    const url = isEdit ? `/api/automations/${data.id}` : '/api/automations';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Falha ao salvar automação no servidor.');
    }

    await fetchAutomations();
    await fetchMetrics();
    setBuilderOpen(false);
    setEditingAutomation(null);
    showToast(isEdit ? 'Automação atualizada com sucesso!' : 'Nova automação criada com sucesso!');
  };

  // Carregar modelo pré-configurado no construtor
  const handleUseTemplate = (template: any) => {
    setEditingAutomation({
      name: template.name,
      description: template.description,
      event: template.event,
      conditions: template.conditions,
      actions: template.actions,
      active: true,
    });
    setBuilderOpen(true);
    setActiveTab('RULES');
  };

  // Filtragem de regras
  const filteredAutomations = automations.filter((rule) => {
    if (statusFilter === 'ACTIVE' && !rule.active) return false;
    if (statusFilter === 'PAUSED' && rule.active) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = rule.name.toLowerCase().includes(query);
      const matchDesc = rule.description?.toLowerCase().includes(query);
      const matchEvent = rule.event.toLowerCase().includes(query);
      return matchName || matchDesc || matchEvent;
    }
    return true;
  });

  return (
    <div className="space-y-6 p2-automation-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl  flex items-center gap-3 text-sm font-semibold border ${
            toastMessage.type === 'success'
              ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
              : 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <Check className="w-5 h-5 text-[var(--success-text)]" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-[var(--danger-text)]" />
          )}
          {toastMessage.text}
        </div>
      )}

      {/* Main Header Banner */}
      <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6 text-[var(--text-primary)] flex flex-col md:flex-row md:items-center justify-between gap-4  p2-automation-header">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[var(--info-bg)] text-[var(--link)] rounded-2xl border border-[var(--field-border)]">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              Central de Automação & Workflows
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[var(--info-bg)] text-[var(--link)] border border-[var(--field-border)] uppercase">
                Fase 3
              </span>
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Construtor visual de fluxos orientados a eventos da esteira com idempotência e proteção contra loops.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-xl border border-[var(--field-border)] transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setActiveTab('TEMPLATES')}
            className="px-3.5 py-2.5 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-xl text-xs font-semibold border border-[var(--field-border)] transition-colors flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-[var(--link)]" />
            <span className="hidden sm:inline">Modelos Prontos</span>
          </button>

          <button
            onClick={() => {
              setEditingAutomation(null);
              setBuilderOpen(true);
            }}
            className="px-4 py-2.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl font-semibold text-xs   transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Automação
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[var(--field-border)] gap-2 overflow-x-auto pb-1 p2-automation-tabs">
        <button
          onClick={() => {
            setActiveTab('RULES');
            setBuilderOpen(false);
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'RULES' && !builderOpen
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-md'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Regras de Automação ({automations.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('HISTORY');
            setBuilderOpen(false);
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'HISTORY'
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-md'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <Clock className="w-4 h-4" />
          Histórico de Execuções ({executions.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('METRICS');
            setBuilderOpen(false);
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'METRICS'
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-md'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Métricas & Desempenho
        </button>

        <button
          onClick={() => {
            setActiveTab('TEMPLATES');
            setBuilderOpen(false);
          }}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'TEMPLATES'
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-md'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Biblioteca de Modelos ({templates.length})
        </button>
      </div>

      {/* ========================================================= */}
      {/* MODO BUILDER ATIVO                                        */}
      {/* ========================================================= */}
      {builderOpen ? (
        <AutomationVisualBuilder
          initialData={editingAutomation || undefined}
          catalog={catalog}
          onSave={handleSaveAutomation}
          onCancel={() => {
            setBuilderOpen(false);
            setEditingAutomation(null);
          }}
        />
      ) : (
        <>
          {/* ========================================================= */}
          {/* ABA 1: REGRAS DE AUTOMAÇÃO                                */}
          {/* ========================================================= */}
          {activeTab === 'RULES' && (
            <div className="space-y-4">
              {/* Filter and Search Bar */}
              <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar regras por nome ou gatilho..."
                    className="w-full bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--field-border)]"
                  />
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] mr-1">Filtrar:</span>
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      statusFilter === 'ALL'
                        ? 'bg-[var(--action)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Todas ({automations.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      statusFilter === 'ACTIVE'
                        ? 'bg-[var(--success-bg)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Ativas ({automations.filter((a) => a.active).length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('PAUSED')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      statusFilter === 'PAUSED'
                        ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Pausadas ({automations.filter((a) => !a.active).length})
                  </button>
                </div>
              </div>

              {/* Automation Rules List */}
              {isLoading ? (
                <div className="p-12 text-center text-[var(--text-secondary)]">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[var(--link)] mb-3" />
                  <div className="text-sm font-semibold text-[var(--text-primary)]">Carregando automações...</div>
                </div>
              ) : filteredAutomations.length === 0 ? (
                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-12 text-center text-[var(--text-secondary)] space-y-3">
                  <Zap className="w-12 h-12 mx-auto text-[var(--link)]" />
                  <div className="text-base font-bold text-[var(--text-primary)]">
                    Nenhuma regra de automação encontrada
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                    {searchQuery
                      ? 'Nenhum resultado corresponde à sua busca.'
                      : 'Comece criando sua primeira regra automatizada ou escolha um modelo pré-configurado na biblioteca.'}
                  </p>
                  <div className="pt-2 flex justify-center gap-3">
                    <button
                      onClick={() => {
                        setEditingAutomation(null);
                        setBuilderOpen(true);
                      }}
                      className="px-4 py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-bold transition-all shadow"
                    >
                      + Criar Nova Regra
                    </button>
                    <button
                      onClick={() => setActiveTab('TEMPLATES')}
                      className="px-4 py-2 bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] rounded-xl text-xs font-semibold border border-[var(--field-border)] transition-colors"
                    >
                      Ver Modelos Prontos
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredAutomations.map((rule) => {
                    const ruleConditions = Array.isArray(rule.conditions)
                      ? rule.conditions
                      : rule.conditions?.rules || [];
                    const ruleActions = Array.isArray(rule.actions) ? rule.actions : [];
                    const lastExec = rule.executions?.[0];

                    return (
                      <div
                        key={rule.id}
                        className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5 hover:border-[var(--field-border)] transition-all space-y-4 shadow-lg"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                                  rule.active
                                    ? 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]'
                                    : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] border-[var(--field-border)]'
                                }`}
                              >
                                {rule.active ? 'ATIVO' : 'PAUSADO'}
                              </span>

                              <span className="text-xs font-mono text-[var(--link)] bg-[var(--info-bg)] border border-[var(--field-border)] px-2.5 py-0.5 rounded-md">
                                Gatilho: {rule.event}
                              </span>

                              <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface-elevated)] px-2.5 py-0.5 rounded-md">
                                {ruleConditions.length} condição(ões) • {ruleActions.length} ação(ões)
                              </span>
                            </div>

                            <h3 className="text-base font-bold text-[var(--text-primary)]">{rule.name}</h3>

                            {rule.description && (
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{rule.description}</p>
                            )}

                            {/* Summary Footer */}
                            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] pt-1 flex-wrap">
                              <span>Criado por {rule.createdBy?.name || 'Sistema'}</span>
                              <span>•</span>
                              <span>{rule._count?.executions || 0} execuções totais</span>
                              {lastExec && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1.5">
                                    Última:
                                    <span
                                      className={`font-semibold ${
                                        lastExec.status === 'SUCCESS'
                                          ? 'text-[var(--success-text)]'
                                          : lastExec.status === 'FAILED'
                                          ? 'text-[var(--danger-text)]'
                                          : 'text-[var(--text-secondary)]'
                                      }`}
                                    >
                                      {lastExec.status} ({lastExec.durationMs}ms)
                                    </span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <button
                              onClick={() => setTestingAutomation(rule)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--link)] border border-[var(--field-border)] transition-colors flex items-center gap-1.5"
                              title="Simular sem alterar banco"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Testar
                            </button>

                            <button
                              onClick={() => handleToggle(rule.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] border border-[var(--field-border)] transition-colors flex items-center gap-1.5"
                            >
                              {rule.active ? (
                                <>
                                  <ToggleRight className="w-4 h-4 text-[var(--success-text)]" /> Pausar
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-4 h-4 text-[var(--text-secondary)]" /> Ativar
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => {
                                setEditingAutomation({
                                  id: rule.id,
                                  name: rule.name,
                                  description: rule.description || undefined,
                                  event: rule.event,
                                  conditions: Array.isArray(rule.conditions)
                                    ? { matchType: 'ALL', rules: rule.conditions }
                                    : rule.conditions,
                                  actions: rule.actions,
                                  active: rule.active,
                                });
                                setBuilderOpen(true);
                              }}
                              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors border border-transparent hover:border-[var(--field-border)]"
                              title="Editar automação"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDuplicate(rule.id)}
                              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors border border-transparent hover:border-[var(--field-border)]"
                              title="Duplicar automação (pausada por padrão)"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDelete(rule.id, rule.name)}
                              className="p-2 text-[var(--text-secondary)] hover:text-[var(--danger-text)] hover:bg-[var(--bg-surface-elevated)] rounded-lg transition-colors border border-transparent hover:border-[var(--field-border)]"
                              title="Excluir automação"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 2: HISTÓRICO DE EXECUÇÕES                             */}
          {/* ========================================================= */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Log de Execuções Automatizadas</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Acompanhe em tempo real cada evento recebido e o resultado das ações executadas.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">Filtrar Status:</span>
                  <select
                    value={historyStatusFilter}
                    onChange={(e) => setHistoryStatusFilter(e.target.value)}
                    className="bg-[var(--bg-canvas)] border border-[var(--field-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--field-border)]"
                  >
                    <option value="ALL">Todos os Status</option>
                    <option value="SUCCESS">Apenas Sucesso</option>
                    <option value="FAILED">Apenas Falhas</option>
                    <option value="SKIPPED">Apenas Ignorados</option>
                    <option value="PARTIAL">Apenas Parcial</option>
                  </select>
                </div>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl overflow-hidden shadow-xl">
                {executions.length === 0 ? (
                  <div className="p-12 text-center text-[var(--text-secondary)]">
                    <Clock className="w-10 h-10 mx-auto text-[var(--text-secondary)] mb-2" />
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      Nenhuma execução registrada no histórico
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--bg-canvas)] border-b border-[var(--field-border)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="px-5 py-3">Data / Hora</th>
                          <th className="px-5 py-3">Automação</th>
                          <th className="px-5 py-3">Evento</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Duração</th>
                          <th className="px-5 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--field-border)]">
                        {executions.map((exec) => (
                          <tr key={exec.id} className="hover:bg-[var(--bg-surface-elevated)] transition-colors">
                            <td className="px-5 py-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                              {new Date(exec.createdAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-5 py-3 font-medium text-[var(--text-primary)] max-w-[200px] truncate">
                              {exec.automation?.name || 'Regra Removida'}
                            </td>
                            <td className="px-5 py-3 font-mono text-[var(--link)] text-[11px]">
                              {exec.event}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                                  exec.status === 'SUCCESS'
                                    ? 'bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)]'
                                    : exec.status === 'FAILED'
                                    ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-border)]'
                                    : exec.status === 'PARTIAL'
                                    ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] border border-[var(--warning-border)]'
                                    : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]'
                                }`}
                              >
                                {exec.status}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-[var(--text-secondary)] font-mono">
                              {exec.durationMs} ms
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => setSelectedExecution(exec)}
                                className="px-2.5 py-1 text-xs font-semibold bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[var(--link)] rounded border border-[var(--field-border)] transition-colors"
                              >
                                Ver Timeline
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 3: MÉTRICAS & DESEMPENHO                              */}
          {/* ========================================================= */}
          {activeTab === 'METRICS' && (
            <div className="space-y-6">
              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5 shadow-lg">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Regras Configuradas
                  </span>
                  <div className="text-3xl font-extrabold text-[var(--text-primary)] mt-1">
                    {metrics?.totalRules || 0}
                  </div>
                  <div className="text-xs text-[var(--success-text)] mt-2 font-medium">
                    {metrics?.activeRules || 0} regras ativas
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5 shadow-lg">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Execuções Hoje
                  </span>
                  <div className="text-3xl font-extrabold text-[var(--link)] mt-1">
                    {metrics?.todayExecutions || 0}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-2">Disparos de esteira nas últimas 24h</div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5 shadow-lg">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Taxa de Sucesso
                  </span>
                  <div className="text-3xl font-extrabold text-[var(--success-text)] mt-1">
                    {metrics?.successRate || 100}%
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-2">
                    {metrics?.failedCount || 0} falhas registradas
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5 shadow-lg">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Tempo Médio
                  </span>
                  <div className="text-3xl font-extrabold text-[var(--text-primary)] mt-1">
                    {metrics?.avgDurationMs || 0} ms
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-2">Latência de execução sequencial</div>
                </div>
              </div>

              {/* Status Breakdown & Pendencies Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6  space-y-4">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Distribuição de Execuções
                  </h3>

                  <div className="space-y-3 pt-2">
                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-primary)] font-semibold mb-1">
                        <span>Sucesso ({metrics?.successCount || 0})</span>
                        <span className="text-[var(--success-text)]">{metrics?.successRate || 0}%</span>
                      </div>
                      <div className="w-full bg-[var(--bg-canvas)] h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[var(--success-bg)] h-full rounded-full transition-all"
                          style={{ width: `${metrics?.successRate || 0}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-primary)] font-semibold mb-1">
                        <span>Falhas ({metrics?.failedCount || 0})</span>
                        <span className="text-[var(--danger-text)]">
                          {100 - (metrics?.successRate || 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-[var(--bg-canvas)] h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[var(--danger-bg)] h-full rounded-full transition-all"
                          style={{ width: `${100 - (metrics?.successRate || 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-6  space-y-4">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Impacto Operacional na Esteira
                  </h3>
                  <div className="flex items-center gap-4 pt-2">
                    <div className="p-4 bg-[var(--info-bg)] text-[var(--link)] rounded-2xl border border-[var(--field-border)]">
                      <Zap className="w-8 h-8" />
                    </div>
                    <div>
                      <div className="text-3xl font-extrabold text-[var(--text-primary)]">
                        {metrics?.pendenciesCreated || 0}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-1">
                        Pendências operacionais criadas automaticamente por regras de automação
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 4: BIBLIOTECA DE MODELOS                              */}
          {/* ========================================================= */}
          {activeTab === 'TEMPLATES' && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-xl p-4">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Modelos Prontos para Uso</h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Fluxos testados para SLA, integrações e esteira de crédito. Clique em "+ Usar Modelo" para personalizar e ativar.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="bg-[var(--bg-surface)] border border-[var(--field-border)] rounded-2xl p-5 hover:border-[var(--field-border)] transition-all flex flex-col justify-between space-y-4 shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-[var(--link)] bg-[var(--info-bg)] border border-[var(--field-border)] px-2 py-0.5 rounded">
                          {tpl.event}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[var(--text-primary)]">{tpl.name}</h4>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{tpl.description}</p>
                    </div>

                    <div className="pt-3 border-t border-[var(--field-border)]">
                      <button
                        onClick={() => handleUseTemplate(tpl)}
                        className="w-full py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-bold transition-all  flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Usar Este Modelo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Simulator Modal for existing rule */}
      {testingAutomation && (
        <AutomationTestModal
          automation={{
            name: testingAutomation.name,
            event: testingAutomation.event,
            conditions: testingAutomation.conditions,
            actions: testingAutomation.actions,
          }}
          onClose={() => setTestingAutomation(null)}
        />
      )}

      {/* Execution Timeline Modal */}
      {selectedExecution && (
        <AutomationExecutionTimelineModal
          execution={selectedExecution}
          onClose={() => setSelectedExecution(null)}
        />
      )}
    </div>
  );
};
