import React, { useState } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { OperationalTask, TaskCategory, TaskPriority } from '../../types';
import { formatDate } from '../../lib/utils';

export const OperationalAgendaView: React.FC = () => {
  const [tasks, setTasks] = useState<OperationalTask[]>(StorageService.getOperationalTasks());
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

  const refreshTasks = () => {
    setTasks(StorageService.getOperationalTasks());
  };

  const handleToggleCompleted = (id: string) => {
    StorageService.toggleOperationalTaskCompleted(id);
    refreshTasks();
  };

  const handleDeleteTask = (id: string) => {
    if (confirm('Deseja realmente excluir esta tarefa?')) {
      StorageService.deleteOperationalTask(id);
      refreshTasks();
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const assignedUser = users.find(u => u.id === assignedUserId);

    StorageService.addOperationalTask({
      tenantId: StorageService.getCurrentTenantId(),
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      dueDate,
      assignedUserId: assignedUserId || activeUser.id,
      assignedUserName: assignedUser ? assignedUser.name : activeUser.name,
      clientName: clientName.trim() || undefined,
      proposalNumber: proposalNumber.trim() || undefined,
    });

    setTitle('');
    setDescription('');
    setClientName('');
    setProposalNumber('');
    setIsModalOpen(false);
    refreshTasks();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 uppercase tracking-wider">
              ROTINA & CONTROLE
            </span>
            <span className="text-xs text-slate-500 font-semibold">Esteira Operacional</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-1">Agenda & Tarefas da Mesa de Operações</h2>
          <p className="text-xs text-slate-500">
            Acompanhamento de retornos de CIP, cobranças de documentos, pendências de parceiros e follow-ups diários
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Tarefa</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase">Tarefas Pendentes</span>
          <div className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase">Tarefas Concluídas</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{completedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 uppercase">Total Registrado</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{tasks.length}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">Status:</span>
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {(['ALL', 'PENDING', 'COMPLETED'] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 font-bold rounded-md transition-all cursor-pointer ${
                  filterStatus === st ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {st === 'ALL' ? 'Todas' : st === 'PENDING' ? 'Pendentes' : 'Concluídas'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">Todas as Categorias</option>
            <option value="SALDO_CIP">Retorno de Saldo CIP</option>
            <option value="PENDENCIA">Pendências Documentais</option>
            <option value="FOLLOW_UP">Follow-up de Cliente</option>
            <option value="PARCEIRO">Solicitação de Parceiro</option>
            <option value="OUTRO">Outros</option>
          </select>

          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">Todas as Prioridades</option>
            <option value="URGENTE">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-xs italic">
            Nenhuma tarefa encontrada para os filtros selecionados.
          </div>
        ) : (
          filteredTasks.map(t => (
            <div
              key={t.id}
              className={`rounded-xl border p-4 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                t.completed
                  ? 'border-slate-200 bg-slate-50/70 opacity-70'
                  : 'border-slate-200 bg-white hover:shadow-xs'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => handleToggleCompleted(t.id)}
                  className="mt-0.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  {t.completed ? (
                    <CheckSquare className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Square className="h-5 w-5" />
                  )}
                </button>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${t.completed ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      {t.title}
                    </span>
                    <span className={`px-2 py-0.2 rounded text-[10px] font-black uppercase ${
                      t.priority === 'URGENTE' ? 'bg-rose-100 text-rose-800' :
                      t.priority === 'ALTA' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {t.priority}
                    </span>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                      {t.category.replace('_', ' ')}
                    </span>
                  </div>

                  {t.description && (
                    <p className="text-xs text-slate-600">{t.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Prazo: {t.dueDate}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      <span>Responsável: {t.assignedUserName}</span>
                    </span>
                    {t.clientName && (
                      <span className="font-semibold text-slate-700">Cliente: {t.clientName}</span>
                    )}
                    {t.proposalNumber && (
                      <span className="font-mono font-bold text-blue-700">ADE {t.proposalNumber}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:self-center">
                <button
                  onClick={() => handleDeleteTask(t.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                  title="Excluir Tarefa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Nova Tarefa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Nova Tarefa Operacional</h3>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Título da Tarefa</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Ex: Verificar retorno de saldo CIP Banco Daycoval"
                  className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Descrição / Detalhes</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Instruções operacionais sobre a tarefa..."
                  className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Categoria</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as TaskCategory)}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  >
                    <option value="SALDO_CIP">Retorno de Saldo CIP</option>
                    <option value="PENDENCIA">Pendência de Documento</option>
                    <option value="FOLLOW_UP">Follow-up de Cliente</option>
                    <option value="PARCEIRO">Solicitação de Parceiro</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Prioridade</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Data Limite (Prazo)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    required
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Responsável</label>
                  <select
                    value={assignedUserId}
                    onChange={e => setAssignedUserId(e.target.value)}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  >
                    <option value="">Atribuir a mim ({activeUser.name})</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Cliente (Opcional)</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Número da ADE (Opcional)</label>
                  <input
                    type="text"
                    value={proposalNumber}
                    onChange={e => setProposalNumber(e.target.value)}
                    placeholder="Ex: 833085808"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 cursor-pointer shadow-xs"
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
