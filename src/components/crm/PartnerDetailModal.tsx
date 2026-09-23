import React, { useState, useEffect } from 'react';
import {
  X,
  Building,
  User,
  Phone,
  Mail,
  FileText,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Activity,
  MessageSquare,
  StickyNote,
  ListTodo,
  DollarSign,
  BarChart3,
  ShieldCheck,
  Plus,
  Send,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { MetricCard } from '../ui/MetricCard';

interface PartnerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  partnerId: string | null;
  onPartnerUpdated?: () => void;
  users?: Array<{ id: string; name: string }>;
}

export const PartnerDetailModal: React.FC<PartnerDetailModalProps> = ({
  isOpen,
  onClose,
  partnerId,
  onPartnerUpdated,
  users = [],
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'interactions' | 'notes' | 'tasks' | 'production' | 'proposals' | 'simulations' | 'pendencies'
  >('overview');

  const [partner, setPartner] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab Data States
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<string>('ALL');
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [interactions, setInteractions] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [simulations, setSimulations] = useState<any[]>([]);
  const [pendencies, setPendencies] = useState<any[]>([]);

  // Production Metrics State
  const [period, setPeriod] = useState<string>('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [metrics, setMetrics] = useState<any | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Forms State
  const [interactionType, setInteractionType] = useState('LIGAÇÃO');
  const [interactionSubject, setInteractionSubject] = useState('');
  const [interactionDesc, setInteractionDesc] = useState('');
  const [interactionResult, setInteractionResult] = useState('');
  const [interactionNextAction, setInteractionNextAction] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);

  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignedTo, setTaskAssignedTo] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // Load Partner Overview
  const loadPartnerDetails = async () => {
    if (!partnerId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/partners/${partnerId}`);
      if (!res.ok) {
        throw new Error('Falha ao obter dados do parceiro.');
      }
      const data = await res.json();
      setPartner(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar parceiro.');
    } finally {
      setLoading(false);
    }
  };

  // Load Timeline
  const loadTimeline = async () => {
    if (!partnerId) return;
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/timeline?limit=60`);
      if (res.ok) {
        const data = await res.json();
        setTimeline(data);
      }
    } catch (err) {
      console.error('Error loading timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  // Load Metrics
  const loadMetrics = async () => {
    if (!partnerId) return;
    setMetricsLoading(true);
    try {
      let url = `/api/partners/${partnerId}/metrics?period=${period}`;
      if (period === 'custom' && customStartDate) {
        url += `&startDate=${customStartDate}`;
        if (customEndDate) url += `&endDate=${customEndDate}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
    } finally {
      setMetricsLoading(false);
    }
  };

  // Load Sub-entities
  const loadInteractions = async () => {
    if (!partnerId) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/interactions`);
      if (res.ok) setInteractions(await res.json());
    } catch (err) {}
  };

  const loadNotes = async () => {
    if (!partnerId) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/notes`);
      if (res.ok) setNotes(await res.json());
    } catch (err) {}
  };

  const loadTasks = async () => {
    if (!partnerId) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/tasks`);
      if (res.ok) setTasks(await res.json());
    } catch (err) {}
  };

  const loadProposals = async () => {
    if (!partnerId) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/proposals?limit=50`);
      if (res.ok) {
        const result = await res.json();
        setProposals(result.data || []);
      }
    } catch (err) {}
  };

  const loadSimulations = async () => {
    if (!partnerId) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/simulations`);
      if (res.ok) setSimulations(await res.json());
    } catch (err) {}
  };

  const loadPendencies = async () => {
    if (!partnerId) return;
    try {
      const res = await fetch(`/api/partners/${partnerId}/pendencies`);
      if (res.ok) setPendencies(await res.json());
    } catch (err) {}
  };

  useEffect(() => {
    if (isOpen && partnerId) {
      loadPartnerDetails();
      loadTimeline();
      loadInteractions();
      loadNotes();
      loadTasks();
      loadMetrics();
      loadProposals();
      loadSimulations();
      loadPendencies();
    }
  }, [isOpen, partnerId]);

  useEffect(() => {
    if (partnerId && activeTab === 'production') {
      loadMetrics();
    }
  }, [period, customStartDate, customEndDate, activeTab]);

  if (!isOpen || !partnerId) return null;

  // Handlers for Form submissions
  const handleCreateInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactionSubject.trim()) return;
    setSavingInteraction(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: interactionType,
          subject: interactionSubject.trim(),
          description: interactionDesc.trim() || undefined,
          result: interactionResult.trim() || undefined,
          nextAction: interactionNextAction.trim() || undefined,
        }),
      });
      if (res.ok) {
        setInteractionSubject('');
        setInteractionDesc('');
        setInteractionResult('');
        setInteractionNextAction('');
        loadInteractions();
        loadTimeline();
        loadPartnerDetails();
        onPartnerUpdated?.();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingInteraction(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteContent.trim() }),
      });
      if (res.ok) {
        setNoteContent('');
        loadNotes();
        loadTimeline();
        loadPartnerDetails();
        onPartnerUpdated?.();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingNote(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDesc.trim() || undefined,
          priority: taskPriority,
          dueDate: taskDueDate || undefined,
          assignedToId: taskAssignedTo || undefined,
        }),
      });
      if (res.ok) {
        setTaskTitle('');
        setTaskDesc('');
        setTaskDueDate('');
        setTaskAssignedTo('');
        loadTasks();
        loadTimeline();
        loadPartnerDetails();
        onPartnerUpdated?.();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA';
    try {
      const res = await fetch(`/api/partners/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadTasks();
        loadTimeline();
        loadPartnerDetails();
        onPartnerUpdated?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    try {
      const res = await fetch(`/api/partners/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadTasks();
        loadTimeline();
        loadPartnerDetails();
        onPartnerUpdated?.();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Badges helpers
  const getOperationalStatusBadge = (status?: string) => {
    switch (status) {
      case 'ATIVO_RECENTE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Ativo Recente
          </span>
        );
      case 'COM_PENDENCIAS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Com Pendências
          </span>
        );
      case 'SEM_ATIVIDADE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-500" />
            Sem Atividade Recente
          </span>
        );
      case 'INATIVO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-500" />
            Inativo
          </span>
        );
      default:
        return null;
    }
  };

  const filteredTimeline = timeline.filter(item => {
    if (timelineFilter === 'ALL') return true;
    return item.type === timelineFilter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 md:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl overflow-hidden flex flex-col h-[94vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {partner?.name || 'Carregando Parceiro...'}
                </h2>
                <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  {partner?.code || 'SEM CÓDIGO'}
                </span>
                {getOperationalStatusBadge(partner?.operationalStatus)}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-3">
                <span>Promotora: <strong>{partner?.promoter?.name || 'Nenhuma'}</strong></span>
                <span>•</span>
                <span>Operador: <strong>{partner?.assignedUser?.name || 'Não atribuído'}</strong></span>
                {partner?.lastActivityAt && (
                  <>
                    <span>•</span>
                    <span>Última Atividade: {new Date(partner.lastActivityAt).toLocaleDateString('pt-BR')}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadPartnerDetails();
                loadTimeline();
                loadMetrics();
              }}
              title="Atualizar dados"
              className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-1 overflow-x-auto shrink-0 py-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Visão Geral 360°
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Linha do Tempo
            {timeline.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700">
                {timeline.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('interactions')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'interactions'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Interações
            {interactions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold">
                {interactions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'notes'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5" />
            Notas Internas
            {notes.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 font-bold">
                {notes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            Tarefas & Follow-up
            {partner?.openTasksCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold">
                {partner.openTasksCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('production')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'production'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Produção & Métricas
          </button>

          <button
            onClick={() => setActiveTab('proposals')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'proposals'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Propostas ({partner?._count?.proposals || 0})
          </button>

          <button
            onClick={() => setActiveTab('simulations')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'simulations'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Simulações ({partner?._count?.simulationRequests || 0})
          </button>

          <button
            onClick={() => setActiveTab('pendencies')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'pendencies'
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Pendências
            {partner?.openPendenciesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {partner.openPendenciesCount}
              </span>
            )}
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-900/50">
          {/* ============================================================== */}
          {/* TAB 1: VISÃO GERAL 360°                                         */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total de Propostas
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                    {partner?._count?.proposals || 0}
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Pendências em Aberto
                  </div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {partner?.openPendenciesCount || 0}
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Tarefas Pendentes
                  </div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {partner?.openTasksCount || 0}
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total de Interações
                  </div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {partner?._count?.interactions || 0}
                  </div>
                </div>
              </div>

              {/* Main 2-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1: Contact & Cadastral details */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Dados Cadastrais Internos
                    </h4>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-slate-400 block font-medium">Nome / Razão Social</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                          {partner?.name}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">Código do Parceiro</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {partner?.code}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">CNPJ / CPF</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {partner?.document || 'Não informado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">E-mail Comercial</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {partner?.email || 'Não informado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">Telefone / WhatsApp</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {partner?.phone || 'Não informado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">Promotora Vinculada</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {partner?.promoter?.name || 'Sem promotora'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">Operador Atribuído</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {partner?.assignedUser?.name || 'Não atribuído'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block font-medium">Data de Cadastro</span>
                        <span className="text-slate-600 dark:text-slate-400">
                          {partner?.createdAt ? new Date(partner.createdAt).toLocaleString('pt-BR') : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Shortcuts */}
                  <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-blue-900 dark:text-blue-300 block">
                      Ações Rápidas de CRM
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setActiveTab('interactions')}
                        className="p-2.5 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        Nova Interação
                      </button>
                      <button
                        onClick={() => setActiveTab('tasks')}
                        className="p-2.5 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ListTodo className="w-3.5 h-3.5 text-indigo-600" />
                        Nova Tarefa
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column 2 & 3: Recent Activity & Follow-ups */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Recent Tasks */}
                  <div className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <ListTodo className="w-4 h-4 text-indigo-600" />
                        Próximas Tarefas & Follow-up
                      </h4>
                      <button
                        onClick={() => setActiveTab('tasks')}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Ver todas
                      </button>
                    </div>

                    {tasks.filter(t => t.status !== 'CONCLUIDA').length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center italic">
                        Nenhuma tarefa pendente para este parceiro.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {tasks.filter(t => t.status !== 'CONCLUIDA').slice(0, 3).map(task => (
                          <div
                            key={task.id}
                            className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700/70 flex items-start justify-between gap-3"
                          >
                            <div className="flex items-start gap-2.5">
                              <button
                                onClick={() => handleToggleTask(task.id, task.status)}
                                className="mt-0.5 text-slate-400 hover:text-emerald-600"
                              >
                                <Square className="w-4 h-4" />
                              </button>
                              <div>
                                <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  {task.title}
                                </h5>
                                {task.description && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                                    {task.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {task.dueDate && (
                                <span className="text-[10px] font-semibold text-slate-500 block">
                                  {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                {task.priority}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Timeline Preview */}
                  <div className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        Histórico Recente de Atividades
                      </h4>
                      <button
                        onClick={() => setActiveTab('timeline')}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Ver linha completa
                      </button>
                    </div>

                    {timeline.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center italic">
                        Nenhuma atividade registrada até o momento.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {timeline.slice(0, 5).map(item => (
                          <div key={item.id} className="flex items-start gap-3 text-xs">
                            <div className="p-1.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 rounded-lg shrink-0 mt-0.5">
                              <Activity className="w-3 h-3" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {item.title}
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {new Date(item.date).toLocaleString('pt-BR')}
                                </span>
                              </div>
                              {item.subtitle && (
                                <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: LINHA DO TEMPO CONSOLIDADA                              */}
          {/* ============================================================== */}
          {activeTab === 'timeline' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Filtrar por evento:</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto">
                  {['ALL', 'INTERACTION', 'NOTE', 'TASK', 'PROPOSAL', 'SIMULATION', 'PENDENCY'].map(f => (
                    <button
                      key={f}
                      onClick={() => setTimelineFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        timelineFilter === f
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {f === 'ALL' ? 'Todos' : f}
                    </button>
                  ))}
                </div>
              </div>

              {timelineLoading ? (
                <div className="py-12 text-center text-slate-400">Carregando eventos...</div>
              ) : filteredTimeline.length === 0 ? (
                <div className="py-12 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  Nenhum registro encontrado para este filtro.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-4 pl-6 space-y-6">
                  {filteredTimeline.map(item => (
                    <div key={item.id} className="relative group">
                      <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 bg-blue-600" />
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(item.date).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {item.subtitle && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                            {item.subtitle}
                          </p>
                        )}
                        {item.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                            {item.description}
                          </p>
                        )}
                        <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <span>Registrado por: <strong>{item.author || 'Sistema'}</strong></span>
                          <span className="px-1.5 py-0.5 rounded uppercase font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {item.type}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: INTERAÇÕES COMERCIAIS                                    */}
          {/* ============================================================== */}
          {activeTab === 'interactions' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form to add interaction */}
              <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  Registrar Nova Interação
                </h4>

                <form onSubmit={handleCreateInteraction} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Canal / Tipo
                    </label>
                    <select
                      value={interactionType}
                      onChange={e => setInteractionType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <option value="LIGAÇÃO">Ligação Telefônica</option>
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="E-MAIL">E-mail</option>
                      <option value="REUNIÃO">Reunião Presencial / Online</option>
                      <option value="VISITA">Visita Comercial</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Assunto *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Alinhamento de metas / Campanha C6"
                      value={interactionSubject}
                      onChange={e => setInteractionSubject(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Resumo da Conversa
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Detalhes discutidos, dúvidas ou solicitações do parceiro..."
                      value={interactionDesc}
                      onChange={e => setInteractionDesc(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Resultado / Acordo
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Parceiro prometeu enviar 10 contratos amanhã"
                      value={interactionResult}
                      onChange={e => setInteractionResult(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Próxima Ação / Follow-up
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Ligar na sexta para cobrar retorno"
                      value={interactionNextAction}
                      onChange={e => setInteractionNextAction(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingInteraction}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {savingInteraction ? 'Salvando...' : 'Salvar Interação'}
                  </button>
                </form>
              </div>

              {/* Interactions list */}
              <div className="lg:col-span-2 space-y-4">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  Histórico de Interações ({interactions.length})
                </h4>

                {interactions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    Nenhuma interação comercial registrada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interactions.map(int => (
                      <div
                        key={int.id}
                        className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {int.type}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                              {int.subject}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {new Date(int.date || int.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>

                        {int.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                            {int.description}
                          </p>
                        )}

                        {int.result && (
                          <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <strong>Resultado:</strong> {int.result}
                          </div>
                        )}

                        {int.nextAction && (
                          <div className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 p-2 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <strong>Próxima Ação:</strong> {int.nextAction}
                          </div>
                        )}

                        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                          Registrado por: <strong>{int.user?.name || 'Operador'}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: NOTAS INTERNAS                                          */}
          {/* ============================================================== */}
          {activeTab === 'notes' && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Note creator */}
              <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-amber-500" />
                  Nova Nota Interna Confidencial
                </h4>
                <form onSubmit={handleCreateNote} className="space-y-3">
                  <textarea
                    required
                    rows={3}
                    placeholder="Escreva anotações internas sobre comportamento, perfil de produção, orientações da diretoria ou histórico confidencial..."
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingNote}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {savingNote ? 'Salvando...' : 'Adicionar Nota'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Notes List */}
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    Nenhuma nota interna registrada.
                  </div>
                ) : (
                  notes.map(note => (
                    <div
                      key={note.id}
                      className="p-4 bg-amber-50/40 dark:bg-slate-800 rounded-xl border border-amber-200/60 dark:border-slate-700 space-y-2 shadow-xs"
                    >
                      <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {note.content}
                      </p>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-amber-100 dark:border-slate-700">
                        <span>Escrito por: <strong>{note.author?.name || 'Operador'}</strong></span>
                        <span>{new Date(note.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: TAREFAS & FOLLOW-UP                                     */}
          {/* ============================================================== */}
          {activeTab === 'tasks' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form to create task */}
              <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-indigo-600" />
                  Criar Tarefa / Follow-up
                </h4>

                <form onSubmit={handleCreateTask} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Título da Tarefa *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Cobrar envio dos documentos do cliente X"
                      value={taskTitle}
                      onChange={e => setTaskTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Descrição
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Instruções ou observações adicionais..."
                      value={taskDesc}
                      onChange={e => setTaskDesc(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                        Prioridade
                      </label>
                      <select
                        value={taskPriority}
                        onChange={e => setTaskPriority(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                      >
                        <option value="LOW">Baixa</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HIGH">Alta</option>
                        <option value="URGENT">Urgente</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                        Data Limite
                      </label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={e => setTaskDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Atribuir a
                    </label>
                    <select
                      value={taskAssignedTo}
                      onChange={e => setTaskAssignedTo(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    >
                      <option value="">Atribuir a mim</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={savingTask}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {savingTask ? 'Criando...' : 'Criar Tarefa'}
                  </button>
                </form>
              </div>

              {/* Tasks List */}
              <div className="lg:col-span-2 space-y-4">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                  <span>Todas as Tarefas ({tasks.length})</span>
                </h4>

                {tasks.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    Nenhuma tarefa cadastrada.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map(t => {
                      const isDone = t.status === 'CONCLUIDA';
                      return (
                        <div
                          key={t.id}
                          className={`p-3.5 bg-white dark:bg-slate-800 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                            isDone
                              ? 'opacity-60 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                              : 'border-slate-200 dark:border-slate-700 shadow-xs'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => handleToggleTask(t.id, t.status)}
                              className={`mt-0.5 transition-colors ${
                                isDone ? 'text-emerald-500' : 'text-slate-400 hover:text-emerald-600'
                              }`}
                            >
                              {isDone ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                            </button>
                            <div>
                              <h5
                                className={`text-xs font-bold ${
                                  isDone
                                    ? 'line-through text-slate-400 dark:text-slate-500'
                                    : 'text-slate-800 dark:text-slate-100'
                                }`}
                              >
                                {t.title}
                              </h5>
                              {t.description && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                  {t.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                                <span>Responsável: <strong>{t.assignedTo?.name || 'Não atribuído'}</strong></span>
                                {t.dueDate && (
                                  <span>Prazo: {new Date(t.dueDate).toLocaleDateString('pt-BR')}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                t.priority === 'URGENT'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                                  : t.priority === 'HIGH'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {t.priority}
                            </span>
                            <button
                              onClick={() => handleDeleteTask(t.id)}
                              className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: PRODUÇÃO & MÉTRICAS                                     */}
          {/* ============================================================== */}
          {activeTab === 'production' && (
            <div className="space-y-6">
              {/* Period Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {[
                    { id: 'today', label: 'Hoje' },
                    { id: '7d', label: 'Últimos 7 Dias' },
                    { id: '30d', label: 'Últimos 30 Dias' },
                    { id: 'current_month', label: 'Mês Atual' },
                    { id: 'last_month', label: 'Mês Anterior' },
                    { id: 'custom', label: 'Personalizado' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPeriod(p.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        period === p.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {period === 'custom' && (
                  <div className="flex items-center gap-2 text-xs">
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={e => setCustomStartDate(e.target.value)}
                      className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                    <span className="text-slate-400">até</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={e => setCustomEndDate(e.target.value)}
                      className="px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </div>
                )}
              </div>

              {metricsLoading ? (
                <div className="py-12 text-center text-slate-400">Calculando métricas de produção...</div>
              ) : metrics ? (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Volume Produzido</span>
                      <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                        R$ {Number(metrics.summary?.totalContractValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        {metrics.summary?.totalCount || 0} propostas cadastradas
                      </span>
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Volume Aprovado / Pago</span>
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        R$ {Number(metrics.summary?.approvedVolume || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[11px] text-emerald-600/80 mt-0.5 block">
                        {metrics.summary?.approvedCount || 0} propostas concluídas
                      </span>
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Taxa de Conversão</span>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                        {Number(metrics.summary?.approvalRate || 0).toFixed(1)}%
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Aprovadas / Total digitado
                      </span>
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Ticket Médio</span>
                      <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                        R$ {Number(metrics.summary?.ticketAverage || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        Por contrato digitado
                      </span>
                    </div>
                  </div>

                  {/* Breakdowns Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Breakdown */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                        <span>Distribuição por Status</span>
                        <span className="text-xs font-normal text-slate-400">Total: {metrics.summary?.totalCount}</span>
                      </h4>

                      {metrics.statusBreakdown?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center">Sem propostas no período.</p>
                      ) : (
                        <div className="space-y-2">
                          {metrics.statusBreakdown?.map((st: any) => (
                            <div key={st.status} className="flex items-center justify-between text-xs p-2 bg-slate-50 dark:bg-slate-850 rounded-lg">
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{st.status}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-slate-500">{st.count} un.</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                  R$ {Number(st.volume).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bank Breakdown */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                        <span>Distribuição por Banco</span>
                        <span className="text-xs font-normal text-slate-400">{metrics.bankBreakdown?.length} bancos</span>
                      </h4>

                      {metrics.bankBreakdown?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center">Sem propostas no período.</p>
                      ) : (
                        <div className="space-y-2">
                          {metrics.bankBreakdown?.map((bk: any) => (
                            <div key={bk.bank} className="flex items-center justify-between text-xs p-2 bg-slate-50 dark:bg-slate-850 rounded-lg">
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{bk.bank}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-slate-500">{bk.count} un.</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                  R$ {Number(bk.volume).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 7: PROPOSTAS                                               */}
          {/* ============================================================== */}
          {activeTab === 'proposals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Propostas do Parceiro ({proposals.length})
                </h4>
              </div>

              {proposals.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  Nenhuma proposta associada a este parceiro.
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                        <tr>
                          <th className="px-4 py-3">Proposta</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">Banco</th>
                          <th className="px-4 py-3">Operação</th>
                          <th className="px-4 py-3">Valor Contrato</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {proposals.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60">
                            <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                              #{p.proposalNumber || p.id.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {p.client?.name || 'Cliente'}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {p.client?.cpf || '***.***.***-**'}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                              {p.bank || '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                              {p.operationType || '-'}
                            </td>
                            <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-100">
                              R$ {Number(p.contractValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {p.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 8: SIMULAÇÕES                                              */}
          {/* ============================================================== */}
          {activeTab === 'simulations' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Simulações de Crédito Solicitadas ({simulations.length})
              </h4>

              {simulations.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  Nenhuma simulação registrada para este parceiro.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {simulations.map(sim => (
                    <div
                      key={sim.id}
                      className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                          {sim.clientName || 'Cliente Sem Nome'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                          {sim.type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center justify-between">
                        <span>Origem: <strong>{sim.origin || 'Interna'}</strong></span>
                        <span>{new Date(sim.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 9: PENDÊNCIAS                                              */}
          {/* ============================================================== */}
          {activeTab === 'pendencies' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Pendências Vinculadas ({pendencies.length})
              </h4>

              {pendencies.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  Nenhuma pendência cadastrada para este parceiro.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendencies.map(pen => (
                    <div
                      key={pen.id}
                      className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4 shadow-xs"
                    >
                      <div>
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {pen.title}
                        </h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {pen.description || 'Sem descrição detalhada'}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                          <span>Responsável: <strong>{pen.assignedUser?.name || 'Não atribuído'}</strong></span>
                          <span>Criada em: {new Date(pen.createdAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          {pen.status}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                          {pen.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
