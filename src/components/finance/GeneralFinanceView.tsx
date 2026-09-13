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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase tracking-wider">
              FLUXO DE CAIXA
            </span>
            <span className="text-xs text-slate-500 font-semibold">Mesa & Operação</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-1">Gestão Financeira Geral da Promotora</h2>
          <p className="text-xs text-slate-500">
            Controle de receitas operacionais, despesas administrativas, fluxo Previsto vs. Realizado
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Lançamento Financeiro</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Entradas Realizadas</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black font-mono text-emerald-700 mt-1">
            {formatCurrency(totalReceitas)}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Previsto a receber: {formatCurrency(pendingReceitas)}</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Saídas Pagas</span>
            <ArrowDownRight className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-xl font-black font-mono text-rose-700 mt-1">
            {formatCurrency(totalDespesas)}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Previsto a pagar: {formatCurrency(pendingDespesas)}</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Resultado Líquido</span>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </div>
          <div className={`text-xl font-black font-mono mt-1 ${netResult >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatCurrency(netResult)}
          </div>
          <span className="text-[11px] text-slate-400">Saldo apurado no caixa</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total de Lançamentos</span>
            <Layers className="h-4 w-4 text-slate-500" />
          </div>
          <div className="text-xl font-black text-slate-900 mt-1">
            {entries.length} registros
          </div>
          <span className="text-[11px] text-slate-400">Auditoria completa</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">Todos os Tipos (Entradas e Saídas)</option>
            <option value="ENTRADA">Apenas Entradas</option>
            <option value="SAIDA">Apenas Saídas</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-300 p-1.5 text-xs text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">Todos os Status</option>
            <option value="REALIZADO">Realizado</option>
            <option value="PREVISTO">Previsto</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Financial Entries Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
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
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    Nenhum lançamento financeiro encontrado.
                  </td>
                </tr>
              ) : (
                filteredEntries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{e.title || e.description}</td>
                    <td className="p-3.5 text-slate-600 font-medium">{e.category.replace('_', ' ')}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        e.type === 'ENTRADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {e.type}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">{e.dueDate}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.status === 'REALIZADO' ? 'bg-emerald-100 text-emerald-800' :
                        e.status === 'PREVISTO' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className={`p-3.5 text-right font-mono font-bold ${
                      e.type === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {e.type === 'ENTRADA' ? '+' : '-'} {formatCurrency(e.amount)}
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDeleteEntry(e.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
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
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Novo Lançamento Financeiro</h3>

            <form onSubmit={handleCreateEntry} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Descrição do Lançamento</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  placeholder="Ex: Recebimento de Spread Bancário"
                  className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Tipo</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as EntryType)}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
                  >
                    <option value="ENTRADA">Entrada (Receita)</option>
                    <option value="SAIDA">Saída (Despesa)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Valor (R$)</label>
                  <input
                    type="text"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    placeholder="Ex: 1.500,00"
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Categoria</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as FinancialCategory)}
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
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
                  <label className="font-bold text-slate-700">Data de Vencimento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    required
                    className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-hidden"
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
                <label htmlFor="isPaidCheck" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Marcar como já pago / realizado
                </label>
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
                  className="px-4 py-2 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 cursor-pointer shadow-xs"
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
