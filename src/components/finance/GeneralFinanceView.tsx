import React, { useEffect, useRef, useState } from 'react';
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
  Search,
  RefreshCw,
  Download,
} from 'lucide-react';
import { FinancialEntry, EntryType, FinancialCategory, FinancialStatus } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { toastService } from '../ui/toastService';
import { hasPermission } from '../../lib/permissions';
import { StorageService } from '../../services/storageService';

const localDateInputValue = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const mapFinancialEntry = (entry: any): FinancialEntry => ({
  ...entry,
  amount: Number(entry.amount),
  dueDate: String(entry.dueDate).slice(0, 10),
  paymentDate: entry.paymentDate ? String(entry.paymentDate).slice(0, 10) : undefined,
});

const formatFinancialDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Data inválida' : new Intl.DateTimeFormat('pt-BR').format(date);
};

const financialCategoryLabels: Record<FinancialCategory, string> = {
  RECEBIMENTO_OPERACIONAL: 'Recebimento Operacional',
  COMISSAO_RECEBIDA: 'Comissão Recebida',
  DESPESA_FIXA: 'Despesa Fixa',
  DESPESA_VARIAVEL: 'Despesa Variável',
  SERVICO: 'Serviço',
  OUTROS: 'Outros',
};

const MAX_FINANCIAL_AMOUNT = 9_999_999_999.99;

const getFinancialCategories = (entryType: EntryType): FinancialCategory[] => entryType === 'ENTRADA'
  ? ['RECEBIMENTO_OPERACIONAL', 'COMISSAO_RECEBIDA', 'SERVICO', 'OUTROS']
  : ['DESPESA_FIXA', 'DESPESA_VARIAVEL', 'SERVICO', 'OUTROS'];

const parseBrazilianAmount = (raw: string): number | null => {
  const value = raw.trim();
  const plainNumber = /^\d+(?:,\d{1,2})?$/;
  const groupedNumber = /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;
  if (!plainNumber.test(value) && !groupedNumber.test(value)) return null;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const GeneralFinanceView: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDue, setFilterDue] = useState<'ALL' | 'OVERDUE' | 'UPCOMING'>('ALL');
  const [startDueDate, setStartDueDate] = useState('');
  const [endDueDate, setEndDueDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());

  // Form state
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EntryType>('ENTRADA');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<FinancialCategory>('RECEBIMENTO_OPERACIONAL');
  const [dueDate, setDueDate] = useState(localDateInputValue);
  const [paymentDate, setPaymentDate] = useState(localDateInputValue);
  const [isPaid, setIsPaid] = useState(true);
  const loadRequestRef = useRef(0);
  const activeUser = StorageService.getActiveUser();
  const canCreate = hasPermission(activeUser?.role, activeUser?.customPermissions, 'financial.create');
  const canUpdate = hasPermission(activeUser?.role, activeUser?.customPermissions, 'financial.update');
  const canDelete = hasPermission(activeUser?.role, activeUser?.customPermissions, 'financial.delete');

  const loadEntries = async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/financial', { credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível carregar os lançamentos financeiros.');
      }
      const data = await response.json();
      if (requestId !== loadRequestRef.current) return;
      setEntries(Array.isArray(data) ? data.map(mapFinancialEntry) : []);
    } catch (err: any) {
      if (requestId === loadRequestRef.current) setLoadError(err.message || 'Não foi possível carregar os lançamentos financeiros.');
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadEntries();
      }, 120);
    };
    const handleFinancialUpdate = () => scheduleRefresh();
    window.addEventListener('credit_gestao_financial_update', handleFinancialUpdate);
    void loadEntries();
    return () => {
      loadRequestRef.current += 1;
      window.removeEventListener('credit_gestao_financial_update', handleFinancialUpdate);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, []);

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const val = parseBrazilianAmount(amount);
    if (!description.trim() || val === null || val <= 0) {
      toastService.error('Confira os dados', 'Informe uma descrição e um valor válido, como 1.500,00.');
      return;
    }
    if (val > MAX_FINANCIAL_AMOUNT) {
      toastService.error('Valor acima do limite', 'O valor máximo por lançamento é R$ 9.999.999.999,99.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/financial', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: description.trim(),
          type,
          category,
          amount: val,
          dueDate,
          paymentDate: isPaid ? paymentDate : null,
          status: isPaid ? 'REALIZADO' : 'PREVISTO',
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível salvar o lançamento.');
      }
      const created = mapFinancialEntry(await response.json());
      setEntries(current => [created, ...current]);
      setDescription('');
      setAmount('');
      setDueDate(localDateInputValue());
      setPaymentDate(localDateInputValue());
      setIsPaid(true);
      setIsModalOpen(false);
      toastService.success('Lançamento salvo no financeiro.');
    } catch (err: any) {
      toastService.error('Erro ao salvar', err.message || 'Não foi possível salvar o lançamento.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (entry: FinancialEntry, nextStatus: FinancialStatus) => {
    if (updatingIds.has(entry.id)) return;
    setUpdatingIds(current => new Set(current).add(entry.id));
    try {
      const response = await fetch(`/api/financial/${encodeURIComponent(entry.id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, paymentDate: nextStatus === 'REALIZADO' ? localDateInputValue() : null }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível atualizar o status.');
      }
      const updated = mapFinancialEntry(await response.json());
      setEntries(current => current.map(item => item.id === updated.id ? updated : item));
      toastService.success('Status financeiro atualizado.');
    } catch (err: any) {
      toastService.error('Erro ao atualizar', err.message || 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingIds(current => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (deletingIds.has(id) || !confirm('Deseja realmente excluir este lançamento?')) return;
    setDeletingIds(current => new Set(current).add(id));
    try {
      const response = await fetch(`/api/financial/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível excluir o lançamento.');
      }
      setEntries(current => current.filter(entry => entry.id !== id));
      toastService.success('Lançamento excluído.');
    } catch (err: any) {
      toastService.error('Erro ao excluir', err.message || 'Não foi possível excluir o lançamento.');
    } finally {
      setDeletingIds(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const today = localDateInputValue();
  const filteredEntries = entries.filter(e => {
    if (filterType !== 'ALL' && e.type !== filterType) return false;
    if (filterStatus !== 'ALL' && e.status !== filterStatus) return false;
    if (startDueDate && e.dueDate < startDueDate) return false;
    if (endDueDate && e.dueDate > endDueDate) return false;
    if (filterDue === 'OVERDUE' && !(e.status === 'PREVISTO' && e.dueDate < today)) return false;
    if (filterDue === 'UPCOMING' && !(e.status === 'PREVISTO' && e.dueDate >= today)) return false;
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (query && !`${e.title || e.description} ${financialCategoryLabels[e.category] || e.category}`.toLocaleLowerCase('pt-BR').includes(query)) return false;
    return true;
  });

  // Financial aggregates
  const totalReceitas = entries.filter(e => e.type === 'ENTRADA' && e.status === 'REALIZADO').reduce((sum, e) => sum + e.amount, 0);
  const totalDespesas = entries.filter(e => e.type === 'SAIDA' && e.status === 'REALIZADO').reduce((sum, e) => sum + e.amount, 0);
  const netResult = totalReceitas - totalDespesas;

  const pendingReceitas = entries.filter(e => e.type === 'ENTRADA' && e.status === 'PREVISTO').reduce((sum, e) => sum + e.amount, 0);
  const pendingDespesas = entries.filter(e => e.type === 'SAIDA' && e.status === 'PREVISTO').reduce((sum, e) => sum + e.amount, 0);

  const handleExportCsv = () => {
    if (filteredEntries.length === 0) return;
    const escapeCsv = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['Descrição', 'Categoria', 'Tipo', 'Vencimento', 'Pagamento', 'Status', 'Valor (R$)'],
      ...filteredEntries.map(entry => [
        entry.title || entry.description || '',
        financialCategoryLabels[entry.category] || entry.category,
        entry.type === 'ENTRADA' ? 'Entrada' : 'Saída',
        entry.dueDate,
        entry.paymentDate || '',
        entry.status,
        entry.amount.toFixed(2).replace('.', ','),
      ]),
    ];
    const csv = `\uFEFF${rows.map(row => row.map(escapeCsv).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `lancamentos-financeiros-${localDateInputValue()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className={`space-y-6 ${premium ? 'p2-live-module p2-live-finance' : ''}`}>
      {/* Header */}
      <ActionBar
        title="Gestão Financeira Geral da Promotora"
        subtitle="Controle de receitas operacionais, despesas administrativas, fluxo Previsto vs. Realizado"
        badgeText="FLUXO DE CAIXA & DRE"
        badgeColor="bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] border-[var(--success-border)] dark:border-[var(--success-border)]"
        actions={canCreate ? (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] font-bold text-xs px-4 py-2 rounded-xl  transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Lançamento Financeiro</span>
          </button>
        ) : undefined}
      />

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 ${premium ? 'p2-finance-metrics' : ''}`}>
        <MetricCard
          label="Entradas Realizadas"
          value={formatCurrency(totalReceitas)}
          subtext={`Previsto a receber: ${formatCurrency(pendingReceitas)}`}
          tone="success"
          icon={<ArrowUpRight className="h-4 w-4 text-[var(--success-text)]" />}
        />

        <MetricCard
          label="Saídas Pagas"
          value={formatCurrency(totalDespesas)}
          subtext={`Previsto a pagar: ${formatCurrency(pendingDespesas)}`}
          tone="danger"
          icon={<ArrowDownRight className="h-4 w-4 text-[var(--danger-text)]" />}
        />

        <MetricCard
          label="Resultado Líquido"
          value={formatCurrency(netResult)}
          subtext="Saldo apurado em caixa"
          tone={netResult >= 0 ? 'success' : 'danger'}
          icon={<DollarSign className={`h-4 w-4 ${netResult >= 0 ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]'}`} />}
        />

        <MetricCard
          label="Total de Lançamentos"
          value={`${entries.length} registros`}
          subtext="Auditoria contábil completa"
          tone="neutral"
          icon={<Layers className="h-4 w-4 text-[var(--text-secondary)]" />}
        />
      </div>

      {/* Filter Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--field-border)] bg-[var(--bg-surface)] p-3 text-xs  dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] ${premium ? 'p2-finance-filters' : ''}`}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Buscar descrição ou categoria..."
              aria-label="Buscar lançamento financeiro"
              className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
          >
            <option value="ALL">Todos os Tipos (Entradas e Saídas)</option>
            <option value="ENTRADA">Apenas Entradas</option>
            <option value="SAIDA">Apenas Saídas</option>
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
          >
            <option value="ALL">Todos os Status</option>
            <option value="REALIZADO">Realizado</option>
            <option value="PREVISTO">Previsto</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
          <select
            value={filterDue}
            onChange={e => setFilterDue(e.target.value as typeof filterDue)}
            aria-label="Filtrar por vencimento"
            className="rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] p-1.5 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
          >
            <option value="ALL">Todos os vencimentos</option>
            <option value="OVERDUE">Vencidos em aberto</option>
            <option value="UPCOMING">A vencer</option>
          </select>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
            De
            <input
              type="date"
              value={startDueDate}
              max={endDueDate || undefined}
              onChange={event => setStartDueDate(event.target.value)}
              aria-label="Data inicial do vencimento"
              className="rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-1.5 py-1 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
            Até
            <input
              type="date"
              value={endDueDate}
              min={startDueDate || undefined}
              onChange={event => setEndDueDate(event.target.value)}
              aria-label="Data final do vencimento"
              className="rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] px-1.5 py-1 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
            {filteredEntries.length} de {entries.length} registros
          </span>
          <button type="button" onClick={handleExportCsv} disabled={filteredEntries.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--field-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] disabled:cursor-not-allowed disabled:opacity-90 dark:border-[var(--field-border)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--bg-surface-elevated)]">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
          <button type="button" onClick={() => void loadEntries()} disabled={isLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--field-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] disabled:opacity-90 dark:border-[var(--field-border)] dark:text-[var(--text-primary)] dark:hover:bg-[var(--bg-surface-elevated)]">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Financial Entries Table */}
      <div className={`rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] overflow-hidden  ${premium ? 'p2-finance-results' : ''}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="p-3.5">Descrição</th>
                <th className="p-3.5">Categoria</th>
                <th className="p-3.5">Tipo</th>
                <th className="p-3.5">Vencimento</th>
                <th className="p-3.5">Pagamento</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Valor</th>
                <th className="p-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--text-secondary)] italic">
                    {isLoading ? 'Carregando lançamentos financeiros…' : loadError || 'Nenhum lançamento financeiro encontrado.'}
                    {loadError && <button type="button" onClick={() => void loadEntries()} className="ml-2 font-semibold text-[var(--link)] underline">Tentar novamente</button>}
                  </td>
                </tr>
              ) : (
                filteredEntries.map(e => (
                  <tr key={e.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors">
                    <td className="p-3.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{e.title || e.description}</td>
                    <td className="p-3.5 text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">{financialCategoryLabels[e.category] || e.category}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        e.type === 'ENTRADA'
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                          : 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
                      }`}>
                        {e.type}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{formatFinancialDate(e.dueDate)}</td>
                    <td className="p-3.5 font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{e.paymentDate ? formatFinancialDate(e.paymentDate) : '—'}</td>
                    <td className="p-3.5">
                      {canUpdate ? <select
                        value={e.status}
                        onChange={event => void handleToggleStatus(e, event.target.value as FinancialStatus)}
                        disabled={updatingIds.has(e.id)}
                        aria-label={`Alterar status financeiro de ${e.title}`}
                        className="rounded-full border border-[var(--field-border)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)] disabled:opacity-90 dark:border-[var(--field-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]"
                      >
                        <option value="PREVISTO">Previsto</option>
                        <option value="REALIZADO">Realizado</option>
                        <option value="CANCELADO">Cancelado</option>
                      </select> : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.status === 'REALIZADO'
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                          : e.status === 'PREVISTO'
                          ? 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)]'
                          : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)]'
                      }`}>{e.status}</span>}
                    </td>
                    <td className={`p-3.5 text-right font-mono font-bold ${
                      e.type === 'ENTRADA' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                    }`}>
                      {e.type === 'ENTRADA' ? '+' : '-'} {formatCurrency(e.amount)}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        {canDelete && <button
                          type="button"
                          onClick={() => void handleDeleteEntry(e.id)}
                          disabled={deletingIds.has(e.id)}
                          className="rounded-lg p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--danger-text)] disabled:cursor-wait disabled:opacity-90 dark:hover:bg-[var(--bg-surface-elevated)] dark:hover:text-[var(--danger-text)]"
                          title="Excluir lançamento"
                          aria-label={`Excluir lançamento: ${e.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>}
                      </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] p-6  space-y-4">
            <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Novo Lançamento Financeiro</h3>

            <form onSubmit={handleCreateEntry} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Descrição do Lançamento</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={180}
                  required
                  placeholder="Ex: Recebimento de Spread Bancário"
                  className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Tipo</label>
                  <select
                    value={type}
                    onChange={e => {
                      const nextType = e.target.value as EntryType;
                      setType(nextType);
                      if (!getFinancialCategories(nextType).includes(category)) {
                        setCategory(nextType === 'ENTRADA' ? 'RECEBIMENTO_OPERACIONAL' : 'DESPESA_VARIAVEL');
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  >
                    <option value="ENTRADA">Entrada (Receita)</option>
                    <option value="SAIDA">Saída (Despesa)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Valor (R$)</label>
                  <input
                    type="text"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    inputMode="decimal"
                    required
                    placeholder="Ex: 1.500,00"
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Categoria</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as FinancialCategory)}
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  >
                    {getFinancialCategories(type).map(value => (
                      <option key={value} value={value}>{financialCategoryLabels[value]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Data de Vencimento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isPaidCheck"
                  checked={isPaid}
                  onChange={e => {
                    const checked = e.target.checked;
                    setIsPaid(checked);
                    if (checked && !paymentDate) setPaymentDate(localDateInputValue());
                  }}
                  className="rounded border-[var(--field-border)] text-[var(--link)]"
                />
                <label htmlFor="isPaidCheck" className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] cursor-pointer">
                  Marcar como já pago / realizado
                </label>
              </div>

              {isPaid && (
                <div className="space-y-1">
                  <label htmlFor="financial-payment-date" className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Data do pagamento</label>
                  <input
                    id="financial-payment-date"
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-secondary)] focus:outline-hidden dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-[var(--success-bg)] text-[var(--success-text)] font-bold hover:bg-[var(--success-bg)] cursor-pointer  transition-colors disabled:opacity-90"
                >
                  {isSaving ? 'Salvando…' : 'Salvar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
