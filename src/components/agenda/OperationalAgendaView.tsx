import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { OperationalTask, TaskCategory, TaskPriority } from '../../types';
import { formatDate } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { EmptyState } from '../ui/EmptyState';

export const OperationalAgendaView: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('SALDO_CIP');
  const [priority, setPriority] = useState<TaskPriority>('ALTA');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [clientName, setClientName] = useState('');
  const [proposalNumber, setProposalNumber] = useState('');

  const users = StorageService.getUsers();
  const activeUser = StorageService.getActiveUser();

  useEffect(() => {
    refreshTasks();
  }, []);

  const refreshTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCompleted = async (task: any) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed })
      });
      refreshTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (confirm('Deseja realmente excluir esta tarefa da agenda?')) {
      try {
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        refreshTasks();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          assignedToId: assignedUserId || activeUser?.id,
          // clientName and proposalNumber should be related by IDs if available, 
          // passing null for now since they are legacy concepts from localstorage
        })
      });
      setTitle('');
      setDescription('');
      setClientName('');
      setProposalNumber('');
      setIsModalOpen(false);
      refreshTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;
    if (filterPriority !== 'ALL' && t.priority !== filterPriority) return false;
    if (filterStatus === 'PENDING' && t.completed) return false;
    if (filterStatus === 'COMPLETED' && !t.completed) return false;
    return true;
  });

  const pendingCount = tasks.filter(t => !t.completed).length;
  const completedCount = tasks.filter(t => t.completed).length;
  const criticalCount = tasks.filter(t => !t.completed && t.priority === 'ALTA').length;

  return (
    <div className="space-y-6">
      <ActionBar
        title="Agenda Operacional & Controle de Tarefas"
        subtitle="Controle de vencimento de saldo CIP, follow-up de pendências, averbações e rotinas diárias da mesa"
        badgeText="ROTINA DE OPERAÇÃO"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ Nova Tarefa</span>
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Pendências Ativas
            </span>
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-black font-mono text-amber-950 dark:text-amber-200">
            {pendingCount} tarefas
          </p>
          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold block">
            {criticalCount} classificadas como ALTA prioridade
          </span>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Concluídas
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-black font-mono text-emerald-950 dark:text-emerald-200">
            {completedCount} tarefas
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold block">
            Rotinas resolvidas pela equipe
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Total na Agenda
            </span>
            <CalendarIcon className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black font-mono text-slate-900 dark:text-white">
            {tasks.length} tarefas
          </p>
          <span className="text-[11px] text-slate-500 font-bold block">
            Histórico operacional completo
          </span>
        </div>
      </div>

      {/* Main Tasks Stream */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Fila de Execução ({filteredTasks.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterStatus('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterStatus === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-500'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilterStatus('PENDING')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterStatus === 'PENDING' ? 'bg-amber-600 text-white' : 'text-slate-500'
                }`}
              >
                Pendentes ({pendingCount})
              </button>
              <button
                onClick={() => setFilterStatus('COMPLETED')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterStatus === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                }`}
              >
                Concluídas ({completedCount})
              </button>
            </div>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa encontrada"
            description="Não existem tarefas cadastradas para os filtros selecionados."
            actionLabel="+ Criar Primeira Tarefa"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="space-y-2.5">
            {filteredTasks.map(task => (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                  task.completed
                    ? 'border-slate-200 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/30 opacity-60'
                    : task.priority === 'ALTA'
                    ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleToggleCompleted(task.id)}
                    className="mt-0.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    {task.completed ? (
                      <CheckSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Square className="h-5 w-5" />
                    )}
                  </button>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4
                        className={`text-xs font-bold ${
                          task.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {task.title}
                      </h4>

                      <span
                        className={`px-2 py-0.2 rounded text-[9.5px] font-bold ${
                          task.priority === 'ALTA'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : task.priority === 'MEDIA'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {task.priority}
                      </span>

                      <span className="px-2 py-0.2 rounded text-[9.5px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {task.category}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-[11px] text-slate-500 leading-relaxed">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-slate-400 pt-1 font-mono">
                      <span>Vencimento: {task.dueDate}</span>
                      <span>•</span>
                      <span>Responsável: {task.assignedUserName}</span>
                      {task.proposalNumber && (
                        <>
                          <span>•</span>
                          <span className="text-blue-600 dark:text-blue-400">ADE: {task.proposalNumber}</span>
                        </>
                      )}
                      {task.clientName && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600 dark:text-slate-300">Cliente: {task.clientName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Excluir tarefa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Tarefa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Nova Tarefa Operacional</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Título da Tarefa *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Cobrar saldo devedor Banco Santander"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as TaskCategory)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="SALDO_CIP">Saldo CIP</option>
                    <option value="DOCUMENTACAO">Documentação</option>
                    <option value="FORMALIZACAO">Formalização</option>
                    <option value="AVERBACAO">Averbação</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prioridade
                  </label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="ALTA">Alta</option>
                    <option value="MEDIA">Média</option>
                    <option value="BAIXA">Baixa</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Atribuir a
                  </label>
                  <select
                    value={assignedUserId}
                    onChange={e => setAssignedUserId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                  >
                    <option value="">Eu mesmo ({activeUser.name})</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Descrição Detalhada
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Instruções adicionais..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs cursor-pointer"
                >
                  Salvar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
