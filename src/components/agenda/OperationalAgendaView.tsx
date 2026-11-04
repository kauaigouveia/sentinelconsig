import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  Filter,
  AlertTriangle,
  User,
  Building,
  CheckSquare,
  Square,
  Trash2,
  Edit2,
  Tag,
  Layers,
  Sparkles,
  ShieldCheck,
  Zap,
  RefreshCw,
  Search,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { OperationalTask, TaskCategory, TaskPriority } from '../../types';
import { formatDate } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { EmptyState } from '../ui/EmptyState';
import { hasPermission } from '../../lib/permissions';
import { toastService } from '../ui/toastService';

const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const TASK_CATEGORY_LABELS: Record<string, string> = {
  RETORNO: 'Retorno',
  FOLLOW_UP: 'Follow-up',
  PENDENCIA: 'Pendência',
  SALDO_CIP: 'Saldo CIP',
  CLIENTE: 'Cliente',
  PARCEIRO: 'Parceiro',
  INTERNA: 'Rotina interna',
  OUTRO: 'Outro',
  DOCUMENTACAO: 'Documentação',
  FORMALIZACAO: 'Formalização',
  AVERBACAO: 'Averbação',
  OUTROS: 'Outros',
  OPERACIONAL: 'Operacional',
};

const getLocalDateInputValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatTaskDate = (value?: string | null) => {
  if (!value) return 'Sem vencimento';
  const dateKey = String(value).slice(0, 10);
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Data inválida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
};

const getTaskApiError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
};

export const OperationalAgendaView: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadRequestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('SALDO_CIP');
  const [priority, setPriority] = useState<TaskPriority>('HIGH');
  const [dueDate, setDueDate] = useState(getLocalDateInputValue);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [clientId, setClientId] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const users = StorageService.getUsers();
  const clients = StorageService.getClients();
  const proposals = StorageService.getProposals();
  const activeUser = StorageService.getActiveUser();
  const canCreateTasks = hasPermission(activeUser?.role, activeUser?.customPermissions, 'tasks.create');
  const canDeleteTasks = hasPermission(activeUser?.role, activeUser?.customPermissions, 'tasks.delete');
  const canAssignTasks = hasPermission(activeUser?.role, activeUser?.customPermissions, 'tasks.assign');
  const canEditTasks = hasPermission(activeUser?.role, activeUser?.customPermissions, 'tasks.update');

  useEffect(() => {
    void refreshTasks();
    return () => {
      loadRequestRef.current += 1;
    };
  }, []);

  const refreshTasks = async () => {
    const requestId = ++loadRequestRef.current;
    if (!hasLoadedRef.current) setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/tasks', { credentials: 'include' });
      if (!res.ok) throw await getTaskApiError(res, 'Não foi possível carregar as tarefas.');
      const data = await res.json();
      if (requestId !== loadRequestRef.current) return;
      setTasks(Array.isArray(data) ? data : []);
      hasLoadedRef.current = true;
    } catch (e) {
      if (requestId !== loadRequestRef.current) return;
      const message = e instanceof Error ? e.message : 'Não foi possível carregar as tarefas.';
      setLoadError(message);
      toastService.error(message);
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  };

  const handleToggleCompleted = async (task: any) => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed })
      });
      if (!response.ok) throw await getTaskApiError(response, 'Não foi possível atualizar a tarefa.');
      await refreshTasks();
      toastService.success('Tarefa atualizada.');
    } catch (error) {
      toastService.error(error instanceof Error ? error.message : 'Não foi possível atualizar a tarefa.');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (confirm('Deseja realmente excluir esta tarefa da agenda?')) {
      try {
        const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!response.ok) throw await getTaskApiError(response, 'Não foi possível excluir a tarefa.');
        await refreshTasks();
        toastService.success('Tarefa excluída.');
      } catch (error) {
        toastService.error(error instanceof Error ? error.message : 'Não foi possível excluir a tarefa.');
      }
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const linkedProposal = proposals.find(p => p.id === proposalId);
      const response = await fetch(editingTaskId ? `/api/tasks/${encodeURIComponent(editingTaskId)}` : '/api/tasks', {
        method: editingTaskId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          ...(canAssignTasks
            ? { assignedToId: assignedUserId === '__UNASSIGNED__' ? null : (assignedUserId || activeUser?.id) }
            : (!editingTaskId ? { assignedToId: activeUser?.id } : {})),
          proposalId: linkedProposal?.id || null,
          clientId: linkedProposal?.clientId || clientId || null,
        })
      });
      if (!response.ok) throw await getTaskApiError(response, 'Não foi possível criar a tarefa.');
      setTitle('');
      setDescription('');
      setDueDate(getLocalDateInputValue());
      setAssignedUserId('');
      setClientId('');
      setProposalId('');
      const wasEditing = Boolean(editingTaskId);
      setEditingTaskId(null);
      setIsModalOpen(false);
      await refreshTasks();
      toastService.success(wasEditing ? 'Tarefa atualizada.' : 'Tarefa criada.');
    } catch (err) {
      toastService.error(err instanceof Error ? err.message : 'Não foi possível criar a tarefa.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingTask = (task: any) => {
    setEditingTaskId(task.id);
    setTitle(task.title || '');
    setDescription(task.description || '');
    setCategory((task.category || 'OPERACIONAL') as TaskCategory);
    setPriority((task.priority || 'MEDIUM') as TaskPriority);
    setDueDate(task.dueDate ? String(task.dueDate).slice(0, 10) : '');
    setAssignedUserId(task.assignedToId || '__UNASSIGNED__');
    setClientId(task.clientId || '');
    setProposalId(task.proposalId || '');
    setIsModalOpen(true);
  };

  const closeTaskModal = () => {
    setIsModalOpen(false);
    setEditingTaskId(null);
    setTitle('');
    setDescription('');
    setDueDate(getLocalDateInputValue());
    setAssignedUserId('');
    setClientId('');
    setProposalId('');
  };

  const filteredTasks = tasks.filter(t => {
    if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;
    if (filterPriority !== 'ALL' && t.priority !== filterPriority) return false;
    if (filterStatus === 'PENDING' && t.completed) return false;
    if (filterStatus === 'COMPLETED' && !t.completed) return false;
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (term) {
      const searchable = [t.title, t.description, t.clientName, t.proposalNumber, t.assignedUserName]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      if (!searchable.includes(term)) return false;
    }
    return true;
  });

  const pendingCount = tasks.filter(t => !t.completed).length;
  const completedCount = tasks.filter(t => t.completed).length;
  const criticalCount = tasks.filter(t => !t.completed && (t.priority === 'HIGH' || t.priority === 'URGENT')).length;

  return (
    <div className="space-y-6">
      <ActionBar
        title="Agenda Operacional & Controle de Tarefas"
        subtitle="Controle de vencimento de saldo CIP, follow-up de pendências, averbações e rotinas diárias da mesa"
        badgeText="ROTINA DE OPERAÇÃO"
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
        actions={canCreateTasks ? (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] px-4 py-2 text-xs font-bold text-[var(--action-ink)]  transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ Nova Tarefa</span>
          </button>
        ) : undefined}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--warning-text)] dark:text-[var(--warning-text)]">
              Pendências Ativas
            </span>
            <Clock className="h-4 w-4 text-[var(--warning-text)] dark:text-[var(--warning-text)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--warning-text)] dark:text-[var(--warning-text)]">
            {pendingCount} tarefas
          </p>
          <span className="text-[11px] text-[var(--warning-text)] dark:text-[var(--warning-text)] font-bold block">
            {criticalCount} classificadas como ALTA prioridade
          </span>
        </div>

        <div className="rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--success-text)] dark:text-[var(--success-text)]">
              Concluídas
            </span>
            <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--success-text)] dark:text-[var(--success-text)]">
            {completedCount} tarefas
          </p>
          <span className="text-[11px] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold block">
            Rotinas resolvidas pela equipe
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
              Total na Agenda
            </span>
            <CalendarIcon className="h-4 w-4 text-[var(--text-secondary)]" />
          </div>
          <p className="text-2xl font-black font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            {tasks.length} tarefas
          </p>
          <span className="text-[11px] text-[var(--text-secondary)] font-bold block">
            Histórico operacional completo
          </span>
        </div>
      </div>

      {/* Main Tasks Stream */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4 p2-agenda-stream">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Fila de Execução ({filteredTasks.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-40 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
              <input
                type="search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar tarefas"
                aria-label="Buscar tarefas por título, descrição, cliente, proposta ou responsável"
                className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-2.5 text-[11px] font-medium text-[var(--text-secondary)] placeholder:text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)] sm:w-48"
              />
            </label>
            <div className="flex rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterStatus === 'ALL' ? 'bg-[var(--action)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilterStatus('PENDING')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterStatus === 'PENDING' ? 'bg-[var(--warning-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Pendentes ({pendingCount})
              </button>
              <button
                onClick={() => setFilterStatus('COMPLETED')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterStatus === 'COMPLETED' ? 'bg-[var(--success-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Concluídas ({completedCount})
              </button>
            </div>
            <label className="sr-only" htmlFor="agenda-category-filter">Filtrar por categoria</label>
            <select
              id="agenda-category-filter"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]"
            >
              <option value="ALL">Todas as categorias</option>
              {Array.from(new Set(tasks.map(task => task.category).filter(Boolean))).sort().map(taskCategory => (
                <option key={taskCategory} value={taskCategory}>{TASK_CATEGORY_LABELS[taskCategory] || taskCategory}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="agenda-priority-filter">Filtrar por prioridade</label>
            <select
              id="agenda-priority-filter"
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]"
            >
              <option value="ALL">Todas as prioridades</option>
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {loadError ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-text)] dark:border-[var(--danger-border)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]">
            <span>{loadError}</span>
            <button type="button" onClick={() => void refreshTasks()} className="inline-flex items-center gap-2 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</button>
          </div>
        ) : isLoading ? (
          <div className="py-10 text-center text-sm text-[var(--text-secondary)]">Carregando tarefas…</div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa encontrada"
            description="Não existem tarefas cadastradas para os filtros selecionados."
            {...(canCreateTasks ? { actionLabel: '+ Criar Primeira Tarefa', onAction: () => setIsModalOpen(true) } : {})}
          />
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map(task => (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                  task.completed
                    ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] opacity-60'
                    : task.priority === 'HIGH' || task.priority === 'URGENT'
                    ? 'border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleToggleCompleted(task)}
                    disabled={!canEditTasks && task.assignedToId !== activeUser?.id}
                    title={!canEditTasks && task.assignedToId !== activeUser?.id ? 'Você só pode alterar tarefas atribuídas a você.' : 'Alterar conclusão'}
                    className="mt-0.5 text-[var(--text-secondary)] hover:text-[var(--link)] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-90"
                  >
                    {task.completed ? (
                      <CheckSquare className="h-5 w-5 text-[var(--success-text)] dark:text-[var(--success-text)]" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4
                        className={`text-xs font-bold ${
                          task.completed
                            ? 'line-through text-[var(--text-secondary)]'
                            : 'text-[var(--text-secondary)] dark:text-[var(--text-primary)]'
                        }`}
                      >
                        {task.title}
                      </h4>

                      <span
                        className={`px-2 py-0.2 rounded text-[9.5px] font-bold ${
                          task.priority === 'URGENT'
                            ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
                            : task.priority === 'HIGH'
                            ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]'
                            : task.priority === 'MEDIUM'
                            ? 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                            : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]'
                        }`}
                      >
                        {TASK_PRIORITY_LABELS[task.priority as TaskPriority] || task.priority}
                      </span>

                      <span className="px-2 py-0.2 rounded text-[9.5px] font-bold bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]">
                        {TASK_CATEGORY_LABELS[task.category] || task.category}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-[var(--text-secondary)] pt-1 font-mono">
                      <span>Vencimento: {formatTaskDate(task.dueDate)}</span>
                      <span>•</span>
                      <span>Responsável: {task.assignedUserName}</span>
                      {task.proposalNumber && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--link)] dark:text-[var(--link)]">ADE: {task.proposalNumber}</span>
                        </>
                      )}
                      {task.clientName && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Cliente: {task.clientName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {canEditTasks && <button
                    type="button"
                    onClick={() => startEditingTask(task)}
                    className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--info-bg)] hover:text-[var(--link)] dark:hover:bg-[var(--info-bg)]"
                    title="Editar tarefa"
                    aria-label={`Editar tarefa: ${task.title}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>}
                  {canDeleteTasks && <button
                    type="button"
                    onClick={() => handleDeleteTask(task.id)}
                    className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)] dark:hover:bg-[var(--danger-bg)]"
                    title="Excluir tarefa"
                    aria-label={`Excluir tarefa: ${task.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Tarefa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{editingTaskId ? 'Editar Tarefa Operacional' : 'Nova Tarefa Operacional'}</h3>
              <button
                onClick={closeTaskModal}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Título da Tarefa *
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Cobrar saldo devedor Banco Santander"
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as TaskCategory)}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  >
                    <option value="SALDO_CIP">Saldo CIP</option>
                    <option value="RETORNO">Retorno</option>
                    <option value="FOLLOW_UP">Follow-up</option>
                    <option value="PENDENCIA">Pendência</option>
                    <option value="DOCUMENTACAO">Documentação</option>
                    <option value="FORMALIZACAO">Formalização</option>
                    <option value="AVERBACAO">Averbação</option>
                    <option value="CLIENTE">Cliente</option>
                    <option value="PARCEIRO">Parceiro</option>
                    <option value="INTERNA">Rotina interna</option>
                    <option value="OUTROS">Outros</option>
                    {category && !TASK_CATEGORY_LABELS[category] && <option value={category}>{category}</option>}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Prioridade
                  </label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  >
                    <option value="URGENT">Urgente</option>
                    <option value="HIGH">Alta</option>
                    <option value="MEDIUM">Média</option>
                    <option value="LOW">Baixa</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Atribuir a
                  </label>
                  <select
                    value={assignedUserId}
                    onChange={e => setAssignedUserId(e.target.value)}
                    disabled={!canAssignTasks}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden disabled:opacity-90"
                  >
                    <option value="">Eu mesmo ({activeUser.name})</option>
                    {editingTaskId && <option value="__UNASSIGNED__">Sem responsável</option>}
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Descrição Detalhada
                </label>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Instruções adicionais..."
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Vincular cliente</label>
                  <select value={clientId} onChange={e => { setClientId(e.target.value); setProposalId(''); }} className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]">
                    <option value="">Nenhum cliente</option>
                    {clients.map(client => <option key={client.id} value={client.id}>{client.fullName}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Vincular proposta</label>
                  <select value={proposalId} onChange={e => { const nextId = e.target.value; setProposalId(nextId); const proposal = proposals.find(item => item.id === nextId); if (proposal?.clientId) setClientId(proposal.clientId); }} className="w-full rounded-xl border border-[var(--field-border)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]">
                    <option value="">Nenhuma proposta</option>
                    {proposals.filter(proposal => !clientId || proposal.clientId === clientId).map(proposal => <option key={proposal.id} value={proposal.id}>ADE {proposal.proposalNumber}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="px-4 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-bold text-[var(--action-ink)] bg-[var(--action)] hover:bg-[var(--action-hover)] rounded-xl  cursor-pointer disabled:opacity-90"
                >
                  {isSaving ? 'Salvando…' : editingTaskId ? 'Salvar Alterações' : 'Salvar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
