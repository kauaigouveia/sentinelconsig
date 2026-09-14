import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  PieChart,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { FinancialEntry, EntryType, FinancialCategory, FinancialStatus } from '../../types';
import { formatCurrency, formatDate } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const GeneralFinanceView: React.FC = () => {
  const [entries, setEntries] = useState<FinancialEntry[]>(StorageService.getFinancialEntries());
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EntryType>('ENTRADA');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<FinancialCategory>('RECEBIMENTO_OPERACIONAL');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [isPaid, setIsPaid] = useState(true);

  const activeUser = StorageService.getActiveUser();

  const refreshData = () => {
    setEntries(StorageService.getFinancialEntries());
  };

  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (!description.trim() || isNaN(val) || val <= 0) return;

    StorageService.addFinancialEntry({
      tenantId: StorageService.getCurrentTenantId(),
      type,
      category,
      title: description.trim(),
      description: description.trim(),
      amount: val,
      dueDate,
      paymentDate: isPaid ? dueDate : undefined,
      status: isPaid ? 'REALIZADO' : 'PREVISTO',
    });

    setDescription('');
    setAmount('');
    setIsModalOpen(false);
    refreshData();
  };

  const handleDeleteEntry = (id: string) => {
    if (confirm('Deseja realmente excluir este lançamento?')) {
      StorageService.deleteFinancialEntry(id);
      refreshData();
    }
  };

  const filteredEntries = entries.filter(e => {
    if (filterType !== 'ALL' && e.type !== filterType) return false;
    if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;
    return true;
  });

  // Financial aggregates
  const totalReceitas = entries.filter(e => e.type === 'ENTRADA' && e.status === 'REALIZADO').reduce((sum, e) => sum + e.amount, 0);
  const totalDespesas = entries.filter(e => e.type === 'SAIDA' && e.status === 'REALIZADO').reduce((sum, e) => sum + e.amount, 0);
  const netResult = totalReceitas - totalDespesas;

  const pendingReceitas = entries.filter(e => e.type === 'ENTRADA' && e.status === 'PREVISTO').reduce((sum, e) => sum + e.amount, 0);
  const pendingDespesas = entries.filter(e => e.type === 'SAIDA' && e.status === 'PREVISTO').reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <ActionBar
        title="Gestão Financeira Geral da Promotora"
        subtitle="Controle de receitas operacionais, despesas administrativas, fluxo Previsto vs. Realizado"
        badgeText="FLUXO DE CAIXA & DRE"
        badgeColor="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
        actions={
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Lançamento Financeiro</span>
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          label="Entradas Realizadas"
          value={formatCurrency(totalReceitas)}
          subtext={`Previsto a receber: ${formatCurrency(pendingReceitas)}`}
          tone="success"
          icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
        />

        <MetricCard
          label="Saídas Pagas"
          value={formatCurrency(totalDespesas)}
          subtext={`Previsto a pagar: ${formatCurrency(pendingDespesas)}`}
          tone="danger"
          icon={<ArrowDownRight className="h-4 w-4 text-rose-600" />}
        />

        <MetricCard
          label="Resultado Líquido"
          value={formatCurrency(netResult)}
          subtext="Saldo apurado em caixa"
          tone={netResult >= 0 ? 'success' : 'danger'}
          icon={<DollarSign className={`h-4 w-4 ${netResult >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />}
        />

        <MetricCard
          label="Total de Lançamentos"
          value={`${entries.length} registros`}
          subtext="Auditoria contábil completa"
          tone="neutral"
          icon={<Layers className="h-4 w-4 text-slate-500" />}
        />
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-hidden"
          >
            <option value="ALL">Todos os Tipos (Entradas e Saídas)</option>
            <option value="ENTRADA">Apenas Entradas</option>
            <option value="SAIDA">Apenas Saídas</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-hidden"
          >
            <option value="ALL">Todos os Status</option>
            <option value="REALIZADO">Realizado</option>
            <option value="PREVISTO">Previsto</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <span className="text-slate-400 dark:text-slate-500 text-[11px] font-mono">
          {filteredEntries.length} de {entries.length} registros
        </span>
      </div>

      {/* Financial Entries Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">Descrição</th>
                <th className="p-3.5">Categoria</th>
                <th className="p-3.5">Tipo</th>
                <th className="p-3.5">Vencimento</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Valor</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    Nenhum lançamento financeiro encontrado.
                  </td>
                </tr>
              ) : (
                filteredEntries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">{e.title || e.description}</td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">{e.category.replace('_', ' ')}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        e.type === 'ENTRADA'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                      }`}>
                        {e.type}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">{e.dueDate}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.status === 'REALIZADO'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : e.status === 'PREVISTO'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className={`p-3.5 text-right font-mono font-bold ${
                      e.type === 'ENTRADA' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                    }`}>
                      {e.type === 'ENTRADA' ? '+' : '-'} {formatCurrency(e.amount)}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDeleteEntry(e.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                        title="Excluir Lançamento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Lançamento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Novo Lançamento Financeiro</h3>

            <form onSubmit={handleCreateEntry} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Descrição do Lançamento</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  placeholder="Ex: Recebimento de Spread Bancário"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Tipo</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as EntryType)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  >
                    <option value="ENTRADA">Entrada (Receita)</option>
                    <option value="SAIDA">Saída (Despesa)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Valor (R$)</label>
                  <input
                    type="text"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    placeholder="Ex: 1.500,00"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Categoria</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as FinancialCategory)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  >
                    <option value="RECEBIMENTO_OPERACIONAL">Recebimento Operacional</option>
                    <option value="COMISSAO_RECEBIDA">Comissão Recebida</option>
                    <option value="DESPESA_FIXA">Despesa Fixa</option>
                    <option value="DESPESA_VARIAVEL">Despesa Variável</option>
                    <option value="SERVICO">Serviço</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Data de Vencimento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isPaidCheck"
                  checked={isPaid}
                  onChange={e => setIsPaid(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <label htmlFor="isPaidCheck" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Marcar como já pago / realizado
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 cursor-pointer shadow-xs transition-colors"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
