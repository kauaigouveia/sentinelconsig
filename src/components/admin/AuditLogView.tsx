import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatDate } from '../../lib/utils';
import { AuditLog, SystemExceptionLog } from '../../types';

type TabMode = 'SUMMARY' | 'ALL_LOGS' | 'EXCEPTIONS';
type BulkFilter = 'ALL' | 'IMPORT' | 'DELETE' | 'STATUS';
type ExceptionSeverityFilter = 'ALL' | 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>(() => StorageService.getAuditLogs());
  const [exceptions, setExceptions] = useState<SystemExceptionLog[]>(() =>
    StorageService.getSystemExceptionLogs()
  );
  const [activeTab, setActiveTab] = useState<TabMode>('SUMMARY');
  const [bulkFilter, setBulkFilter] = useState<BulkFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Exception filters & state
  const [exceptionSeverity, setExceptionSeverity] = useState<ExceptionSeverityFilter>('ALL');
  const [exceptionOperation, setExceptionOperation] = useState<string>('ALL');
  const [exceptionStatusFilter, setExceptionStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [expandedExceptionId, setExpandedExceptionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshLogs = () => {
    setLogs(StorageService.getAuditLogs());
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

  // Filter for all logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        l.action.toLowerCase().includes(term) ||
        l.entity.toLowerCase().includes(term) ||
        l.userName.toLowerCase().includes(term) ||
        (l.newData && l.newData.toLowerCase().includes(term))
      );
    });
  }, [logs, searchTerm]);

  // Extract bulk & import operations
  const bulkOperations = useMemo(() => {
    return logs.filter(l =>
      l.action === 'IMPORTAR_EXCEL' ||
      l.action === 'EXCLUIR_PROPOSTAS_EM_LOTE' ||
      l.action === 'EXCLUIR_PROPOSTA' ||
      l.action === 'ALTERACAO_STATUS_EM_LOTE'
    );
  }, [logs]);

  // Filtered bulk operations
  const filteredBulkOps = useMemo(() => {
    return bulkOperations.filter(op => {
      if (bulkFilter === 'IMPORT' && op.action !== 'IMPORTAR_EXCEL') return false;
      if (bulkFilter === 'DELETE' && !op.action.includes('EXCLUIR')) return false;
      if (bulkFilter === 'STATUS' && op.action !== 'ALTERACAO_STATUS_EM_LOTE') return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          op.action.toLowerCase().includes(term) ||
          op.userName.toLowerCase().includes(term) ||
          (op.newData && op.newData.toLowerCase().includes(term)) ||
          (op.previousData && op.previousData.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [bulkOperations, bulkFilter, searchTerm]);

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
        } else if (op.action === 'EXCLUIR_PROPOSTA') {
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

  const parseLogDetails = (log: AuditLog) => {
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
        }
      } else if (log.previousData) {
        const parsed = JSON.parse(log.previousData);
        if (log.action === 'EXCLUIR_PROPOSTA') {
          successCount = 1;
          deletedAdes = [parsed.proposalNumber || log.entityId];
        }
      }
    } catch {
      // JSON parse error handled safely
    }

    return { successCount, failCount, errors, successfulItems, deletedAdes, observation };
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            <span>Trilha de Auditoria & Operações do Sistema</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro imutável de segurança com resumo de exclusões em massa, importações Excel e alterações
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('SUMMARY')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'SUMMARY'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Resumo Operações em Lote</span>
            </button>
            <button
              onClick={() => setActiveTab('ALL_LOGS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                activeTab === 'ALL_LOGS'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>Trilha Completa ({logs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('EXCEPTIONS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all relative ${
                activeTab === 'EXCEPTIONS'
                  ? 'bg-white text-rose-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bug className="h-3.5 w-3.5 text-rose-600" />
              <span>Exceções & Diagnóstico</span>
              {unresolvedExceptionsCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                  {unresolvedExceptionsCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={refreshLogs}
            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors"
            title="Atualizar Logs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {activeTab === 'SUMMARY' ? (
        <div className="space-y-4">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Importations Card */}
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Importações Excel
                </span>
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900">
                  {summaryMetrics.totalImportedProposals}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1.5">propostas criadas</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold">
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {summaryMetrics.totalImportBatches} lote(s)
                </span>
                {summaryMetrics.totalImportErrors > 0 && (
                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    {summaryMetrics.totalImportErrors} erro(s)
                  </span>
                )}
              </div>
            </div>

            {/* Bulk Deletion Card */}
            <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50/70 to-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                  Exclusões em Lote
                </span>
                <div className="h-8 w-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <Trash2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900">
                  {summaryMetrics.totalDeletedProposals}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1.5">propostas excluídas</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-rose-700">
                <span className="bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {summaryMetrics.totalDeleteBatches} rotina(s) em massa
                </span>
              </div>
            </div>

            {/* Bulk Status Card */}
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  Alterações em Lote
                </span>
                <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900">
                  {summaryMetrics.totalStatusBulkUpdates}
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1.5">status alterados</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-indigo-700">
                <span className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {summaryMetrics.totalStatusBatches} lote(s) processado(s)
                </span>
              </div>
            </div>

            {/* Operational Health Card */}
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  Taxa de Sucesso
                </span>
                <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2.5">
                <span className="text-2xl font-extrabold text-slate-900">
                  {summaryMetrics.successRate}%
                </span>
                <span className="text-xs text-slate-500 font-medium ml-1.5">sucesso operacional</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
                <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Auditoria 100% íntegra
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                Tipo:
              </span>
              <button
                onClick={() => setBulkFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  bulkFilter === 'ALL'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todas ({bulkOperations.length})
              </button>
              <button
                onClick={() => setBulkFilter('IMPORT')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  bulkFilter === 'IMPORT'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Importações Excel
              </button>
              <button
                onClick={() => setBulkFilter('DELETE')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  bulkFilter === 'DELETE'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Exclusões em Lote
              </button>
              <button
                onClick={() => setBulkFilter('STATUS')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  bulkFilter === 'STATUS'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
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
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar operações..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Bulk Operations List */}
          <div className="space-y-3">
            {filteredBulkOps.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-2xs">
                <Layers className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-700">Nenhuma operação em lote registrada</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Quando importar planilhas ou excluir propostas em massa, o resumo detalhado aparecerá aqui.
                </p>
              </div>
            ) : (
              filteredBulkOps.map(op => {
                const { successCount, failCount, errors, successfulItems, deletedAdes, observation } =
                  parseLogDetails(op);
                const isExpanded = expandedLogId === op.id;

                const isImport = op.action === 'IMPORTAR_EXCEL';
                const isDelete = op.action.includes('EXCLUIR');
                const isStatus = op.action === 'ALTERACAO_STATUS_EM_LOTE';

                return (
                  <div
                    key={op.id}
                    className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Operation Summary Header */}
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 border-b border-slate-100">
                      <div className="flex items-start gap-3">
                        <div
                          className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                            isImport
                              ? 'bg-blue-600 text-white'
                              : isDelete
                              ? 'bg-rose-600 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}
                        >
                          {isImport ? (
                            <FileSpreadsheet className="h-5 w-5" />
                          ) : isDelete ? (
                            <Trash2 className="h-5 w-5" />
                          ) : (
                            <Layers className="h-5 w-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-wide border ${
                                isImport
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : isDelete
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {isImport
                                ? 'Importação de Planilha Excel'
                                : isDelete
                                ? 'Exclusão em Lote / Propostas'
                                : 'Alteração de Status em Lote'}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {formatDate(op.createdAt)}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 font-medium mt-1">
                            Executado por: <strong className="text-slate-900">{op.userName}</strong> ({op.userRole})
                          </p>
                        </div>
                      </div>

                      {/* Success / Failure Metrics Badges */}
                      <div className="flex items-center gap-2 shrink-0">
                        {successCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>{successCount} com Sucesso</span>
                          </div>
                        )}

                        {failCount > 0 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                            <span>{failCount} com Falha / Recusa</span>
                          </div>
                        )}

                        <button
                          onClick={() => setExpandedLogId(isExpanded ? null : op.id)}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg border border-blue-200 transition-colors"
                        >
                          <span>{isExpanded ? 'Recolher' : 'Ver Detalhes'}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Breakdown Drawer */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 bg-white animate-in fade-in duration-150">
                        {/* Summary details banner */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          {/* Success Section */}
                          <div className="p-3 rounded-lg border border-emerald-100 bg-emerald-50/40">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-900 mb-1">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              <span>Registros Processados com Sucesso ({successCount})</span>
                            </div>
                            {successfulItems.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                                {successfulItems.map((ade, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold"
                                  >
                                    ADE: {ade}
                                  </span>
                                ))}
                              </div>
                            ) : deletedAdes.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                                {deletedAdes.map((ade, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-mono font-bold"
                                  >
                                    Excluída: {ade}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-500 italic mt-1">
                                {successCount} registro(s) processado(s) com sucesso.
                              </p>
                            )}
                          </div>

                          {/* Failures / Errors Section */}
                          <div className="p-3 rounded-lg border border-rose-100 bg-rose-50/40">
                            <div className="flex items-center gap-1.5 font-bold text-rose-900 mb-1">
                              <AlertCircle className="h-4 w-4 text-rose-600" />
                              <span>Registros com Falha ou Recusa ({failCount})</span>
                            </div>
                            {errors.length > 0 ? (
                              <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                                {errors.map((err, i) => (
                                  <div
                                    key={i}
                                    className="text-[11px] text-rose-700 bg-white p-1.5 rounded border border-rose-200 font-mono"
                                  >
                                    {err}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-emerald-700 italic mt-1 font-medium">
                                Nenhuma falha ou erro reportado nesta operação.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Observation / Payload info */}
                        {observation && (
                          <div className="text-xs p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
                            <strong>Observação:</strong> {observation}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-400 font-mono break-all pt-1 border-t border-slate-100">
                          Identificador do Lote: {op.entityId} • Payload: {op.newData || op.previousData || '-'}
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
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por ação, usuário ou entidade..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <span className="text-xs font-bold text-slate-500">
              {filteredLogs.length} registro(s) de auditoria
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Data / Hora</th>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Ação</th>
                    <th className="px-4 py-3">Entidade</th>
                    <th className="px-4 py-3">Detalhes / Dados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredLogs.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                        {formatDate(l.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {l.userName} ({l.userRole})
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded font-mono font-bold px-2 py-0.5 text-[10px] border ${
                            l.action.includes('EXCLUIR')
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : l.action.includes('IMPORT')
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {l.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-600">
                        {l.entity} ({l.entityId})
                      </td>
                      <td className="px-4 py-3 max-w-md truncate text-slate-500 font-mono text-[11px]" title={l.newData || l.previousData}>
                        {l.newData || l.previousData || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Technical Support Exceptions & Diagnostics Center */
        <div className="space-y-4">
          {/* Top Filter and Actions Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar erro, ADE, stack trace, usuário ou arquivo..."
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Severity Filter */}
                <select
                  value={exceptionSeverity}
                  onChange={e => setExceptionSeverity(e.target.value as ExceptionSeverityFilter)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-rose-500 focus:outline-hidden"
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
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-rose-500 focus:outline-hidden"
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
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:border-rose-500 focus:outline-hidden"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="OPEN">Somente Abertos / Pendentes</option>
                  <option value="RESOLVED">Somente Resolvidos</option>
                </select>

                {/* Export Diagnostics Button */}
                <button
                  onClick={handleExportExceptionsJson}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors"
                  title="Exportar dados de diagnóstico em JSON para envio ao time técnico"
                >
                  <Download className="h-3.5 w-3.5 text-slate-600" />
                  <span>Exportar (.json)</span>
                </button>

                {/* Clear Exceptions */}
                <button
                  onClick={handleClearExceptions}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Limpar Histórico de Exceções"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sub-bar with quick stats */}
            <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-2">
              <div className="flex items-center gap-3">
                <span>
                  Exibindo <strong>{filteredExceptions.length}</strong> de{' '}
                  <strong>{exceptions.length}</strong> exceção(ões)
                </span>
                {unresolvedExceptionsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-600 font-bold">
                    <AlertCircle className="h-3.5 w-3.5" /> {unresolvedExceptionsCount} requerem atenção
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400">
                Os logs detalhados isolam falhas em importações e operações em massa para rápida resolução
              </span>
            </div>
          </div>

          {/* Exceptions List */}
          <div className="space-y-2.5">
            {filteredExceptions.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center shadow-2xs space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-800">Nenhuma exceção encontrada</h4>
                <p className="text-xs text-slate-500">
                  Todas as operações em massa e importações recentes foram executadas sem falhas ativas.
                </p>
              </div>
            ) : (
              filteredExceptions.map(exc => {
                const isExpanded = expandedExceptionId === exc.id;
                const isCopied = copiedId === exc.id;

                const severityBadge =
                  exc.severity === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : exc.severity === 'ERROR'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : exc.severity === 'WARNING'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200';

                return (
                  <div
                    key={exc.id}
                    className={`rounded-xl border bg-white shadow-2xs transition-all ${
                      exc.resolved ? 'border-slate-200 opacity-80' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div
                      onClick={() => setExpandedExceptionId(isExpanded ? null : exc.id)}
                      className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 p-2 rounded-lg ${
                            exc.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700'
                              : exc.severity === 'ERROR'
                              ? 'bg-red-100 text-red-700'
                              : exc.severity === 'WARNING'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          <Bug className="h-4 w-4" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${severityBadge}`}>
                              {exc.severity}
                            </span>
                            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {exc.operation}
                            </span>
                            <h4 className="text-xs font-bold text-slate-900">{exc.title}</h4>
                            {exc.resolved && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" /> Resolvido
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{exc.message}</p>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {formatDate(exc.timestamp)}
                            </span>
                            {exc.userName && (
                              <span>
                                Usuário: <strong>{exc.userName}</strong> ({exc.userRole || 'SISTEMA'})
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
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs"
                          title="Copiar JSON com diagnóstico para abrir chamado de suporte"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 text-slate-500" />
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
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-700 border border-emerald-200 transition-colors"
                            title="Marcar exceção como analisada / resolvida"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Marcar Resolvido</span>
                          </button>
                        )}

                        <div className="text-slate-400 p-1">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Deep Diagnostic Inspector */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/80 p-4 space-y-3 rounded-b-xl">
                        {exc.details && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                              Detalhes & Stack de Execução:
                            </span>
                            <div className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                              {exc.details}
                            </div>
                          </div>
                        )}

                        {exc.contextData && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                              Payload de Contexto (JSON):
                            </span>
                            <pre className="rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto">
                              {JSON.stringify(exc.contextData, null, 2)}
                            </pre>
                          </div>
                        )}

                        {exc.resolved && exc.resolvedBy && (
                          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
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

