import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  Calendar,
  Layers,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  RefreshCw,
  Bug,
  Copy,
  Check,
  Download,
  Terminal,
  Clock,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Database,
  Building2,
  User,
  Shield,
  Loader2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { AuditApiService, AuditLogApiEntry, AuditLogPagination } from '../../services/auditApiService';
import { formatDate } from '../../lib/utils';
import { SystemExceptionLog } from '../../types';
import { ActionBar } from '../ui/ActionBar';

type TabMode = 'SUMMARY' | 'ALL_LOGS' | 'EXCEPTIONS';
type BulkFilter = 'ALL' | 'IMPORT' | 'DELETE' | 'STATUS';
type ExceptionSeverityFilter = 'ALL' | 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

export const AuditLogView: React.FC = () => {
  // PostgreSQL Server-Side Audit Logs State
  const [logs, setLogs] = useState<AuditLogApiEntry[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters for Server-Side Audit Query
  const [activeTab, setActiveTab] = useState<TabMode>('SUMMARY');
  const [bulkFilter, setBulkFilter] = useState<BulkFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Exceptions state (Diagnostic center)
  const [exceptions, setExceptions] = useState<SystemExceptionLog[]>(() =>
    StorageService.getSystemExceptionLogs()
  );
  const [exceptionSeverity, setExceptionSeverity] = useState<ExceptionSeverityFilter>('ALL');
  const [exceptionOperation, setExceptionOperation] = useState<string>('ALL');
  const [exceptionStatusFilter, setExceptionStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [expandedExceptionId, setExpandedExceptionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch audit logs from PostgreSQL via AuditApiService
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await AuditApiService.fetchAuditLogs({
        page,
        limit: 50,
        search: searchTerm.trim() || undefined,
        action: selectedAction !== 'ALL' ? selectedAction : undefined,
        entity: selectedEntity !== 'ALL' ? selectedEntity : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setLogs(response.data);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('[AuditLogView] Erro ao carregar logs de auditoria:', err);
      setLoadError(err?.message || 'Falha ao sincronizar trilha de auditoria com PostgreSQL.');
    } finally {
      setIsLoading(false);
    }
  }, [page, searchTerm, selectedAction, selectedEntity, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const refreshLogs = () => {
    fetchLogs();
    setExceptions(StorageService.getSystemExceptionLogs());
  };

  const handleCopyDiagnostic = (exc: SystemExceptionLog) => {
    const diagnosticPayload = JSON.stringify(exc, null, 2);
    navigator.clipboard.writeText(diagnosticPayload);
    setCopiedId(exc.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResolveException = (id: string) => {
    StorageService.resolveSystemExceptionLog(id, 'Analisado pelo suporte técnico');
    setExceptions(StorageService.getSystemExceptionLogs());
  };

  const handleClearExceptions = () => {
    if (window.confirm('Deseja limpar todos os registros de exceções do sistema?')) {
      StorageService.clearSystemExceptionLogs();
      setExceptions([]);
    }
  };

  const handleExportExceptionsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exceptions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `DIAGNOSTICO_SUPORTE_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Filtered exceptions
  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      if (exceptionSeverity !== 'ALL' && e.severity !== exceptionSeverity) return false;
      if (exceptionOperation !== 'ALL' && e.operation !== exceptionOperation) return false;
      if (exceptionStatusFilter === 'OPEN' && e.resolved) return false;
      if (exceptionStatusFilter === 'RESOLVED' && !e.resolved) return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const jsonStr = e.contextData ? JSON.stringify(e.contextData).toLowerCase() : '';
        return (
          e.title.toLowerCase().includes(term) ||
          e.message.toLowerCase().includes(term) ||
          (e.details && e.details.toLowerCase().includes(term)) ||
          (e.userName && e.userName.toLowerCase().includes(term)) ||
          jsonStr.includes(term)
        );
      }
      return true;
    });
  }, [exceptions, exceptionSeverity, exceptionOperation, exceptionStatusFilter, searchTerm]);

  const unresolvedExceptionsCount = useMemo(() => {
    return exceptions.filter(e => !e.resolved).length;
  }, [exceptions]);

  // Extract bulk & import operations for Summary Tab
  const bulkOperations = useMemo(() => {
    return logs.filter(l =>
      l.action === 'IMPORTAR_EXCEL' ||
      l.action === 'EXCLUIR_PROPOSTAS_EM_LOTE' ||
      l.action === 'EXCLUIR_PROPOSTA' ||
      l.action === 'PROPOSAL_DELETED' ||
      l.action === 'ALTERACAO_STATUS_EM_LOTE' ||
      l.action === 'SENTINELA_QUERY' ||
      l.action === 'DOCUMENT_UPLOADED' ||
      l.action === 'DOCUMENT_DELETED'
    );
  }, [logs]);

  // Filtered bulk operations
  const filteredBulkOps = useMemo(() => {
    return bulkOperations.filter(op => {
      if (bulkFilter === 'IMPORT' && op.action !== 'IMPORTAR_EXCEL') return false;
      if (bulkFilter === 'DELETE' && !op.action.includes('EXCLUIR') && !op.action.includes('DELETED')) return false;
      if (bulkFilter === 'STATUS' && op.action !== 'ALTERACAO_STATUS_EM_LOTE') return false;
      return true;
    });
  }, [bulkOperations, bulkFilter]);

  // Compute summary metrics for bulk operations
  const summaryMetrics = useMemo(() => {
    let totalImportedProposals = 0;
    let totalImportBatches = 0;
    let totalImportErrors = 0;

    let totalDeletedProposals = 0;
    let totalDeleteBatches = 0;

    let totalStatusBulkUpdates = 0;
    let totalStatusBatches = 0;

    bulkOperations.forEach(op => {
      try {
        const parsed = op.newData ? JSON.parse(op.newData) : {};

        if (op.action === 'IMPORTAR_EXCEL') {
          totalImportBatches++;
          totalImportedProposals += Number(parsed.importedCount || 0);
          totalImportErrors += Number(parsed.errorsCount || (parsed.errors ? parsed.errors.length : 0) || 0);
        } else if (op.action === 'EXCLUIR_PROPOSTAS_EM_LOTE') {
          totalDeleteBatches++;
          totalDeletedProposals += Number(parsed.count || 0);
        } else if (op.action === 'EXCLUIR_PROPOSTA' || op.action === 'PROPOSAL_DELETED') {
          totalDeletedProposals += 1;
        } else if (op.action === 'ALTERACAO_STATUS_EM_LOTE') {
          totalStatusBatches++;
          totalStatusBulkUpdates += Number(parsed.count || 0);
        }
      } catch {
        // Safe fallback
      }
    });

    const totalProcessed = totalImportedProposals + totalDeletedProposals + totalStatusBulkUpdates;
    const successRate =
      totalProcessed + totalImportErrors > 0
        ? Math.round((totalProcessed / (totalProcessed + totalImportErrors)) * 100)
        : 100;

    return {
      totalImportBatches,
      totalImportedProposals,
      totalImportErrors,
      totalDeleteBatches,
      totalDeletedProposals,
      totalStatusBatches,
      totalStatusBulkUpdates,
      successRate,
    };
  }, [bulkOperations]);

  const parseLogDetails = (log: AuditLogApiEntry) => {
    let successCount = 0;
    let failCount = 0;
    let errors: string[] = [];
    let successfulItems: string[] = [];
    let deletedAdes: string[] = [];
    let observation = '';

    try {
      if (log.newData) {
        const parsed = JSON.parse(log.newData);
        if (log.action === 'IMPORTAR_EXCEL') {
          successCount = Number(parsed.importedCount || 0);
          failCount = Number(parsed.errorsCount || (parsed.errors ? parsed.errors.length : 0) || 0);
          errors = Array.isArray(parsed.errors) ? parsed.errors : [];
          successfulItems = Array.isArray(parsed.successfulAdes) ? parsed.successfulAdes : [];
        } else if (log.action === 'EXCLUIR_PROPOSTAS_EM_LOTE') {
          successCount = Number(parsed.count || 0);
          failCount = Number(parsed.failedCount || 0);
          deletedAdes = Array.isArray(parsed.deletedAdes) ? parsed.deletedAdes : [];
        } else if (log.action === 'ALTERACAO_STATUS_EM_LOTE') {
          successCount = Number(parsed.count || 0);
          observation = parsed.observation || '';
          errors = Array.isArray(parsed.errors) ? parsed.errors : [];
          failCount = errors.length;
        } else if (log.action === 'SENTINELA_QUERY') {
          successCount = 1;
          observation = parsed.promptSnippet ? `Pergunta: "${parsed.promptSnippet}"` : '';
          if (Array.isArray(parsed.toolsUsed) && parsed.toolsUsed.length > 0) {
            successfulItems = parsed.toolsUsed.map((t: string) => `Ferramenta: ${t}`);
          }
        }
      } else if (log.oldData) {
        const parsed = JSON.parse(log.oldData);
        if (log.action === 'EXCLUIR_PROPOSTA' || log.action === 'PROPOSAL_DELETED') {
          successCount = 1;
          deletedAdes = [parsed.proposalNumber || log.entityId || 'Proposta'];
        }
      }
    } catch {
      // JSON parse fallback
    }

    return { successCount, failCount, errors, successfulItems, deletedAdes, observation };
  };

  return (
    <div className="space-y-4">
      {/* Header with ActionBar */}
      <ActionBar
        title="Trilha de Auditoria & Governança"
        subtitle="Registro imutável de segurança alimentado exclusivamente pelo PostgreSQL com isolamento multi-tenant rigoroso"
        badgeText="POSTGRESQL AUDIT TRAIL"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Source of truth badge */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              <Database className="h-3 w-3" />
              <span>PostgreSQL Source of Truth</span>
            </div>

            {/* Tab Switcher */}
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 p-1">
              <button
                onClick={() => setActiveTab('SUMMARY')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'SUMMARY'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Resumo Operações</span>
              </button>
              <button
                onClick={() => setActiveTab('ALL_LOGS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'ALL_LOGS'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Trilha Completa ({pagination.total})</span>
              </button>
              <button
                onClick={() => setActiveTab('EXCEPTIONS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all relative cursor-pointer ${
                  activeTab === 'EXCEPTIONS'
                    ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Bug className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span>Exceções</span>
                {unresolvedExceptionsCount > 0 && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                    {unresolvedExceptionsCount}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={refreshLogs}
              disabled={isLoading}
              className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer disabled:opacity-50"
              title="Atualizar Logs do PostgreSQL"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {loadError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{loadError}</span>
        </div>
      )}

      {activeTab === 'SUMMARY' ? (
        <div className="space-y-4">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Importations Card */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                  Importações Excel
                </span>
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {summaryMetrics.totalImportedProposals}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1.5">propostas criadas</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
                <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  {summaryMetrics.totalImportBatches} lote(s)
                </span>
                {summaryMetrics.totalImportErrors > 0 && (
                  <span className="text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
                    {summaryMetrics.totalImportErrors} erro(s)
                  </span>
                )}
              </div>
            </div>

            {/* Bulk Deletion Card */}
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                  Exclusões em Lote
                </span>
                <div className="h-8 w-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <Trash2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {summaryMetrics.totalDeletedProposals}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1.5">propostas excluídas</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                <span className="bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
                  {summaryMetrics.totalDeleteBatches} rotina(s) em massa
                </span>
              </div>
            </div>

            {/* Bulk Status Card */}
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                  Alterações em Lote
                </span>
                <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {summaryMetrics.totalStatusBulkUpdates}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1.5">status alterados</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                <span className="bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {summaryMetrics.totalStatusBatches} lote(s)
                </span>
              </div>
            </div>

            {/* Operational Health Card */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Taxa de Sucesso
                </span>
                <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {summaryMetrics.successRate}%
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-1.5">sucesso operacional</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  Auditoria 100% PostgreSQL
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                Tipo:
              </span>
              <button
                onClick={() => setBulkFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  bulkFilter === 'ALL'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Todas ({bulkOperations.length})
              </button>
              <button
                onClick={() => setBulkFilter('IMPORT')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  bulkFilter === 'IMPORT'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Importações Excel
              </button>
              <button
                onClick={() => setBulkFilter('DELETE')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  bulkFilter === 'DELETE'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Exclusões em Lote
              </button>
              <button
                onClick={() => setBulkFilter('STATUS')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  bulkFilter === 'STATUS'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Alterações de Status
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar operações..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Bulk Operations List */}
          <div className="space-y-3">
            {isLoading ? (
              <div className="p-12 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Carregando trilha de auditoria do PostgreSQL...</p>
              </div>
            ) : filteredBulkOps.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center shadow-2xs">
                <Layers className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Nenhuma operação em lote registrada</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  Quando importar planilhas ou excluir propostas em massa, o resumo detalhado aparecerá aqui.
                </p>
              </div>
            ) : (
              filteredBulkOps.map(op => {
                const { successCount, failCount, errors, successfulItems, deletedAdes, observation } =
                  parseLogDetails(op);
                const isExpanded = expandedLogId === op.id;

                const isImport = op.action === 'IMPORTAR_EXCEL';
                const isDelete = op.action.includes('EXCLUIR') || op.action.includes('DELETED');
                const isStatus = op.action === 'ALTERACAO_STATUS_EM_LOTE';
                const isSentinela = op.action === 'SENTINELA_QUERY';

                return (
                  <div
                    key={op.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Operation Summary Header */}
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-start gap-3">
                        <div
                          className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                            isImport
                              ? 'bg-blue-600 text-white'
                              : isDelete
                              ? 'bg-rose-600 text-white'
                              : isSentinela
                              ? 'bg-purple-600 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {isImport ? (
                            <FileSpreadsheet className="h-5 w-5" />
                          ) : isDelete ? (
                            <Trash2 className="h-5 w-5" />
                          ) : isSentinela ? (
                            <Shield className="h-5 w-5" />
                          ) : (
                            <Layers className="h-5 w-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-wide border ${
                                isImport
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                  : isDelete
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                  : isSentinela
                                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                              }`}
                            >
                              {isImport
                                ? 'Importação de Planilha Excel'
                                : isDelete
                                ? 'Exclusão de Registros / Lote'
                                : isSentinela
                                ? 'Consulta Sentinela AI'
                                : 'Alteração de Status em Lote'}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                              {formatDate(op.createdAt)}
                            </span>
                            {op.tenant?.name && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                <Building2 className="h-3 w-3" />
                                {op.tenant.name}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                            Executado por: <strong className="text-slate-900 dark:text-white">{op.userName || op.user?.name || 'Sistema'}</strong> {op.user?.role ? `(${op.user.role})` : ''}
                            {op.ipAddress && <span className="text-slate-400 font-mono ml-2 text-[11px]">IP: {op.ipAddress}</span>}
                          </p>
                        </div>
                      </div>

                      {/* Success / Failure Metrics Badges */}
                      <div className="flex items-center gap-2 shrink-0">
                        {successCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>{successCount} com Sucesso</span>
                          </div>
                        )}

                        {failCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-bold">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                            <span>{failCount} com Falha / Recusa</span>
                          </div>
                        )}

                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : op.id)}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-3 py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Recolher' : 'Ver Detalhes'}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Breakdown Drawer */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-white dark:bg-slate-900 animate-in fade-in duration-150">
                        {/* Summary details banner */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {/* Success Section */}
                          <div className="p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              <span>Registros Processados com Sucesso ({successCount})</span>
                            </div>
                            {successfulItems.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                                {successfulItems.map((ade, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-mono font-bold"
                                  >
                                    {ade}
                                  </span>
                                ))}
                              </div>
                            ) : deletedAdes.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                                {deletedAdes.map((ade, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 text-[10px] font-mono font-bold"
                                  >
                                    Excluída: {ade}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-1">
                                {successCount} registro(s) processado(s) com sucesso.
                              </p>
                            )}
                          </div>

                          {/* Failures / Errors Section */}
                          <div className="p-3 rounded-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20">
                            <div className="flex items-center gap-1.5 font-bold text-rose-900 dark:text-rose-300 mb-1">
                              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                              <span>Registros com Falha ou Recusa ({failCount})</span>
                            </div>
                            {errors.length > 0 ? (
                              <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                                {errors.map((err, i) => (
                                  <div
                                    key={i}
                                    className="text-[11px] text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-900 p-1.5 rounded border border-rose-200 dark:border-rose-800 font-mono"
                                  >
                                    {err}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 italic mt-1 font-medium">
                                Nenhuma falha ou erro reportado nesta operação.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Observation / Payload info */}
                        {observation && (
                          <div className="text-xs p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            <strong>Observação:</strong> {observation}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono break-all pt-1 border-t border-slate-100 dark:border-slate-800">
                          Identificador do Lote: {op.entityId || '-'} • Payload: {op.newData || op.oldData || '-'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : activeTab === 'ALL_LOGS' ? (
        /* Complete All Logs Table */
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar por ação, usuário, entidade ou dados..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Action Filter */}
                <select
                  value={selectedAction}
                  onChange={e => {
                    setSelectedAction(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="ALL">Todas as Ações</option>
                  <option value="IMPORTAR_EXCEL">IMPORTAR_EXCEL</option>
                  <option value="EXCLUIR_PROPOSTA">EXCLUIR_PROPOSTA</option>
                  <option value="PROPOSAL_DELETED">PROPOSAL_DELETED</option>
                  <option value="ALTERACAO_STATUS_EM_LOTE">ALTERACAO_STATUS_EM_LOTE</option>
                  <option value="SENTINELA_QUERY">SENTINELA_QUERY</option>
                  <option value="DOCUMENT_UPLOADED">DOCUMENT_UPLOADED</option>
                  <option value="DOCUMENT_DOWNLOADED">DOCUMENT_DOWNLOADED</option>
                  <option value="DOCUMENT_DELETED">DOCUMENT_DELETED</option>
                  <option value="USER_CREATED">USER_CREATED</option>
                  <option value="USER_DELETED">USER_DELETED</option>
                  <option value="TENANT_CREATED">TENANT_CREATED</option>
                  <option value="TENANT_UPDATED">TENANT_UPDATED</option>
                  <option value="TENANT_SUSPENDED">TENANT_SUSPENDED</option>
                  <option value="TENANT_REACTIVATED">TENANT_REACTIVATED</option>
                  <option value="admin.context_entered">admin.context_entered</option>
                  <option value="admin.context_exited">admin.context_exited</option>
                </select>

                {/* Entity Filter */}
                <select
                  value={selectedEntity}
                  onChange={e => {
                    setSelectedEntity(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="ALL">Todas as Entidades</option>
                  <option value="Proposal">Proposal</option>
                  <option value="ClientDocument">ClientDocument</option>
                  <option value="User">User</option>
                  <option value="Tenant">Tenant</option>
                  <option value="SentinelaAI">SentinelaAI</option>
                  <option value="System">System</option>
                </select>

                {/* Date Inputs */}
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                  title="Data Inicial"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                  title="Data Final"
                />

                {(startDate || endDate || selectedAction !== 'ALL' || selectedEntity !== 'ALL' || searchTerm) && (
                  <button
                    onClick={() => {
                      setSelectedAction('ALL');
                      setSelectedEntity('ALL');
                      setStartDate('');
                      setEndDate('');
                      setSearchTerm('');
                      setPage(1);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <span>
                Exibindo <strong>{logs.length}</strong> de <strong>{pagination.total}</strong> registros (Página {pagination.page} de {pagination.totalPages || 1})
              </span>
              <span className="text-[11px] text-slate-400">
                PostgreSQL • AuditLog Oficial • Não editável
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Data / Hora</th>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Ação</th>
                    <th className="px-4 py-3">Entidade</th>
                    <th className="px-4 py-3">IP / Origem</th>
                    <th className="px-4 py-3">Detalhes / Dados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                        Carregando registros do PostgreSQL...
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        Nenhum registro de auditoria encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    logs.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">
                          {formatDate(l.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {l.userName || l.user?.name || 'Sistema'}
                          {l.user?.role && (
                            <span className="text-[10px] text-slate-400 font-normal ml-1">({l.user.role})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`rounded font-mono font-bold px-2 py-0.5 text-[10px] border ${
                              l.action.includes('EXCLUIR') || l.action.includes('DELETED') || l.action.includes('SUSPENDED')
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                : l.action.includes('IMPORT') || l.action.includes('CREATED') || l.action.includes('REACTIVATED')
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : l.action.includes('SENTINELA')
                                ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            {l.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {l.entity} {l.entityId ? `(${l.entityId})` : ''}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {l.ipAddress || '127.0.0.1'}
                        </td>
                        <td className="px-4 py-3 max-w-md truncate text-slate-500 dark:text-slate-400 font-mono text-[11px]" title={l.newData || l.oldData || '-'}>
                          {l.newData || l.oldData || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={!pagination.hasPrevPage || isLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={!pagination.hasNextPage || isLoading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Próxima
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Technical Support Exceptions & Diagnostics Center */
        <div className="space-y-4">
          {/* Top Filter and Actions Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar erro, ADE, stack trace, usuário ou arquivo..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Severity Filter */}
                <select
                  value={exceptionSeverity}
                  onChange={e => setExceptionSeverity(e.target.value as ExceptionSeverityFilter)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-rose-500 focus:outline-hidden"
                >
                  <option value="ALL">Todas Severidades</option>
                  <option value="CRITICAL">🔴 CRÍTICO</option>
                  <option value="ERROR">❌ ERRO</option>
                  <option value="WARNING">⚠️ ALERTA</option>
                  <option value="INFO">ℹ️ INFO</option>
                </select>

                {/* Operation Filter */}
                <select
                  value={exceptionOperation}
                  onChange={e => setExceptionOperation(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-rose-500 focus:outline-hidden"
                >
                  <option value="ALL">Todas Operações</option>
                  <option value="IMPORT_EXCEL">Importação Excel</option>
                  <option value="BULK_STATUS">Alteração em Lote</option>
                  <option value="BULK_DELETE">Exclusão em Lote</option>
                  <option value="BACKUP_RESTORE">Backup & Restauração</option>
                  <option value="SLA_CHECK">Verificação SLA</option>
                  <option value="GENERAL">Geral</option>
                </select>

                {/* Resolution Filter */}
                <select
                  value={exceptionStatusFilter}
                  onChange={e => setExceptionStatusFilter(e.target.value as any)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-rose-500 focus:outline-hidden"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="OPEN">Somente Abertos / Pendentes</option>
                  <option value="RESOLVED">Somente Resolvidos</option>
                </select>

                {/* Export Diagnostics Button */}
                <button
                  onClick={handleExportExceptionsJson}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
                  title="Exportar dados de diagnóstico em JSON para envio ao time técnico"
                >
                  <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                  <span>Exportar (.json)</span>
                </button>

                {/* Clear Exceptions */}
                <button
                  onClick={handleClearExceptions}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Limpar Histórico de Exceções"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sub-bar with quick stats */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <div className="flex items-center gap-3">
                <span>
                  Exibindo <strong>{filteredExceptions.length}</strong> de{' '}
                  <strong>{exceptions.length}</strong> exceção(ões)
                </span>
                {unresolvedExceptionsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                    <AlertCircle className="h-3.5 w-3.5" /> {unresolvedExceptionsCount} requerem atenção
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Os logs detalhados isolam falhas em importações e operações em massa para rápida resolução
              </span>
            </div>
          </div>

          {/* Exceptions List */}
          <div className="space-y-2.5">
            {filteredExceptions.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center shadow-2xs space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Nenhuma exceção encontrada</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Todas as operações em massa e importações recentes foram executadas sem falhas ativas.
                </p>
              </div>
            ) : (
              filteredExceptions.map(exc => {
                const isExpanded = expandedExceptionId === exc.id;
                const isCopied = copiedId === exc.id;

                const severityBadge =
                  exc.severity === 'CRITICAL'
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                    : exc.severity === 'ERROR'
                    ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                    : exc.severity === 'WARNING'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';

                return (
                  <div
                    key={exc.id}
                    className={`rounded-xl border bg-white dark:bg-slate-900 shadow-2xs transition-all ${
                      exc.resolved ? 'border-slate-200 dark:border-slate-800 opacity-80' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div
                      onClick={() => setExpandedExceptionId(isExpanded ? null : exc.id)}
                      className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-850"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 p-2 rounded-lg ${
                            exc.severity === 'CRITICAL'
                              ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                              : exc.severity === 'ERROR'
                              ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                              : exc.severity === 'WARNING'
                              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                              : 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          <Bug className="h-4 w-4" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${severityBadge}`}>
                              {exc.severity}
                            </span>
                            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {exc.operation}
                            </span>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white">{exc.title}</h4>
                            {exc.resolved && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                <CheckCircle2 className="h-3 w-3" /> Resolvido
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{exc.message}</p>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {formatDate(exc.timestamp)}
                            </span>
                            {exc.userName && (
                              <span>
                                Usuário: <strong className="text-slate-700 dark:text-slate-300">{exc.userName}</strong> ({exc.userRole || 'SISTEMA'})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleCopyDiagnostic(exc);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-2xs cursor-pointer"
                          title="Copiar JSON com diagnóstico para abrir chamado de suporte"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-emerald-700 dark:text-emerald-300">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                              <span>Copiar Diagnóstico</span>
                            </>
                          )}
                        </button>

                        {!exc.resolved && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleResolveException(exc.id);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                            title="Marcar exceção como analisada / resolvida"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Marcar Resolvido</span>
                          </button>
                        )}

                        <div className="text-slate-400 dark:text-slate-500 p-1">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Deep Diagnostic Inspector */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 p-4 space-y-3 rounded-b-xl">
                        {exc.details && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide block mb-1">
                              Detalhes & Stack de Execução:
                            </span>
                            <div className="rounded-lg bg-slate-900 dark:bg-black p-3 font-mono text-[11px] text-slate-100 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                              {exc.details}
                            </div>
                          </div>
                        )}

                        {exc.contextData && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide block mb-1">
                              Payload de Contexto (JSON):
                            </span>
                            <pre className="rounded-lg bg-slate-900 dark:bg-black p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto border border-slate-800">
                              {JSON.stringify(exc.contextData, null, 2)}
                            </pre>
                          </div>
                        )}

                        {exc.resolved && exc.resolvedBy && (
                          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>
                              <strong>Resolvido em:</strong> {formatDate(exc.resolvedAt || '')} por {exc.resolvedBy}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
