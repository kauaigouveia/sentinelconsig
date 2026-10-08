import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, Check, CheckCircle2, Clock3, ListChecks, RefreshCw, Search } from 'lucide-react';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { EmptyState } from '../ui/EmptyState';
import { toastService } from '../ui/toastService';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
import { realtimeHub } from '../../services/realtimeService';

type QueueTask = {
  kind: 'operational' | 'partner';
  id: string;
  title: string;
  description?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string | null;
  completed: boolean;
  proposal?: { id: string; proposalNumber?: string | null; client?: { fullName?: string | null } } | null;
  client?: { id: string; fullName?: string | null } | null;
  partner?: { id: string; name: string } | null;
};

type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'undated';

const priorityLabel: Record<QueueTask['priority'], string> = {
  URGENT: 'Urgente', HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa',
};

const priorityStyle: Record<QueueTask['priority'], string> = {
  URGENT: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  HIGH: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateKey = (value?: string | null) => value ? value.slice(0, 10) : null;

const getBucket = (task: QueueTask, today: string): TaskBucket => {
  const due = dateKey(task.dueDate);
  if (!due) return 'undated';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
};

const formatDueDate = (value?: string | null) => {
  if (!value) return 'Sem vencimento';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
};

const getTaskApiError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error || fallback);
};

const taskKey = (task: Pick<QueueTask, 'kind' | 'id'>) => `${task.kind}:${task.id}`;

export const MyTaskQueueView: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const activeUser = StorageService.getActiveUser();
  const canManagePartnerTasks = hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.crm.tasks') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.crm.admin');
  const canViewPartnerCrm = hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.crm.view') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.view') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'partners.crm.admin');
  const canViewProposals = hasPermission(activeUser?.role, activeUser?.customPermissions, 'proposals.view');
  const canCompleteOperationalTasks = hasPermission(activeUser?.role, activeUser?.customPermissions, 'tasks.update');
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [today, setToday] = useState(() => localDateKey(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | QueueTask['priority']>('ALL');
  const loadRequestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/my-work', { credentials: 'include' });
      if (!response.ok) {
        throw await getTaskApiError(response, response.status === 401 ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível carregar sua fila.');
      }
      const data = await response.json();
      if (requestId !== loadRequestRef.current) return;
      setTasks(Array.isArray(data) ? data : []);
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar sua fila.');
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    const updateToday = () => setToday(localDateKey(new Date()));
    const timer = window.setInterval(updateToday, 60_000);
    const unsubscribe = realtimeHub.subscribe('*', (event) => {
      if (!['TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED', 'PARTNER_TASK_CREATED', 'PARTNER_TASK_UPDATED', 'PARTNER_TASK_COMPLETED', 'PARTNER_TASK_DELETED'].includes(event.type)) return;
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        void loadTasks();
      }, 250);
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
    };
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
    return tasks.filter(task => {
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) return false;
      if (!term) return true;
      const searchable = [
        task.title,
        task.description,
        task.client?.fullName,
        task.proposal?.proposalNumber,
        task.proposal?.client?.fullName,
        task.partner?.name,
      ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return searchable.includes(term);
    });
  }, [tasks, searchTerm, priorityFilter]);

  const buckets = useMemo(() => {
    const result: Record<TaskBucket, QueueTask[]> = { overdue: [], today: [], upcoming: [], undated: [] };
    for (const task of filteredTasks) result[getBucket(task, today)].push(task);
    const order: Record<QueueTask['priority'], number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sort = (items: QueueTask[]) => items.sort((a, b) => {
      const priorityOrder = order[a.priority] - order[b.priority];
      if (priorityOrder) return priorityOrder;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
    Object.values(result).forEach(sort);
    return result;
  }, [filteredTasks, today]);

  const completeTask = async (task: QueueTask) => {
    const key = taskKey(task);
    setUpdatingId(key);
    try {
      const response = await fetch(task.kind === 'partner' ? `/api/partners/tasks/${task.id}` : `/api/tasks/${task.id}`, {
        method: task.kind === 'partner' ? 'PATCH' : 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task.kind === 'partner' ? { status: 'CONCLUIDA' } : { completed: true }),
      });
      if (!response.ok) throw await getTaskApiError(response, 'Não foi possível concluir esta tarefa.');
      setTasks(current => current.filter(item => taskKey(item) !== key));
      toastService.success('Tarefa concluída.');
    } catch (updateError) {
      toastService.error(updateError instanceof Error ? updateError.message : 'Falha ao concluir tarefa.');
    } finally {
      setUpdatingId(null);
    }
  };

  const renderSection = (key: TaskBucket, title: string, icon: React.ReactNode, tone: string) => {
    const sectionTasks = buckets[key];
    if (!sectionTasks.length) return null;
    return (
      <section key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <span className={tone}>{icon}</span>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{sectionTasks.length}</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {sectionTasks.map(task => {
            const clientName = task.client?.fullName || task.proposal?.client?.fullName;
            const key = taskKey(task);
            return (
              <article key={key} className="flex items-start gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => void completeTask(task)}
                  disabled={updatingId !== null || (task.kind === 'partner' ? !canManagePartnerTasks : !canCompleteOperationalTasks)}
                  aria-label={`Concluir tarefa: ${task.title}`}
                  title={task.kind === 'partner' && !canManagePartnerTasks
                    ? 'Você pode visualizar este follow-up, mas não tem permissão para concluí-lo.'
                    : task.kind === 'operational' && !canCompleteOperationalTasks
                      ? 'Você pode visualizar esta tarefa, mas não tem permissão para concluí-la.'
                      : 'Marcar como concluída'}
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-300 text-transparent transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-emerald-950/40"
                >
                  {updatingId === key ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                  {task.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{task.description}</p>}
                  {(clientName || task.proposal?.proposalNumber || task.partner?.name) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {clientName && <span>Cliente: {clientName}</span>}
                      {task.partner?.name && (canViewPartnerCrm
                        ? <button type="button" onClick={() => onNavigate(`/crm-parceiros?partnerId=${encodeURIComponent(task.partner!.id)}`)} className="text-blue-600 hover:underline dark:text-blue-400">Parceiro: {task.partner.name}</button>
                        : <span>Parceiro: {task.partner.name}</span>)}
                      {task.proposal?.proposalNumber && (canViewProposals
                        ? <button type="button" onClick={() => onNavigate(`/propostas/${task.proposal!.id}`)} className="text-blue-600 hover:underline dark:text-blue-400">Proposta {task.proposal.proposalNumber}</button>
                        : <span>Proposta {task.proposal.proposalNumber}</span>)}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityStyle[task.priority]}`}>{priorityLabel[task.priority]}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><Clock3 className="h-3 w-3" />{formatDueDate(task.dueDate)}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const totalUrgent = buckets.overdue.length + buckets.today.length;

  return (
    <div className="space-y-5">
      <ActionBar
        title="Minha Fila"
        subtitle="Tarefas atribuídas a você, organizadas pelo prazo e pela prioridade."
        badgeText="ROTINA"
        actions={<>
          <label className="relative flex h-9 min-w-40 flex-1 items-center sm:flex-none">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Buscar na fila"
              aria-label="Buscar tarefas por título, cliente, proposta ou parceiro"
              className="h-full w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:w-52"
            />
          </label>
          <select
            value={priorityFilter}
            onChange={event => setPriorityFilter(event.target.value as 'ALL' | QueueTask['priority'])}
            aria-label="Filtrar tarefas por prioridade"
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="ALL">Todas prioridades</option>
            <option value="URGENT">Urgente</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </select>
          <button type="button" onClick={() => void loadTasks()} disabled={refreshing} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Atualizar</button>
        </>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Atrasadas" value={buckets.overdue.length} icon={<AlertCircle className="h-4 w-4" />} variant={buckets.overdue.length ? 'danger' : 'default'} />
        <MetricCard label="Para hoje" value={buckets.today.length} icon={<CalendarClock className="h-4 w-4" />} variant={buckets.today.length ? 'warning' : 'default'} />
        <MetricCard label="Próximas" value={buckets.upcoming.length} icon={<Clock3 className="h-4 w-4" />} variant="primary" />
        <MetricCard label="Sem prazo" value={buckets.undated.length} icon={<ListChecks className="h-4 w-4" />} variant="default" />
      </div>

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          <span>{error}</span><button type="button" onClick={() => void loadTasks()} className="font-semibold underline">Tentar novamente</button>
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Carregando sua fila…</div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Sua fila está em dia" description="Não há tarefas abertas atribuídas a você." />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nenhuma tarefa encontrada"
          description="A busca ou a prioridade selecionada não corresponde a nenhuma tarefa da sua fila."
          actionLabel="Limpar filtros"
          onAction={() => { setSearchTerm(''); setPriorityFilter('ALL'); }}
        />
      ) : (
        <div className="space-y-4">
          {totalUrgent > 0 && <p className="text-sm text-slate-600 dark:text-slate-300">Você tem <strong>{totalUrgent}</strong> tarefa(s) atrasada(s) ou com vencimento hoje.</p>}
          {renderSection('overdue', 'Atrasadas', <AlertCircle className="h-4 w-4" />, 'text-rose-600 dark:text-rose-400')}
          {renderSection('today', 'Para hoje', <CalendarClock className="h-4 w-4" />, 'text-amber-600 dark:text-amber-400')}
          {renderSection('upcoming', 'Próximas', <Clock3 className="h-4 w-4" />, 'text-blue-600 dark:text-blue-400')}
          {renderSection('undated', 'Sem vencimento', <ListChecks className="h-4 w-4" />, 'text-slate-500')}
        </div>
      )}
    </div>
  );
};
