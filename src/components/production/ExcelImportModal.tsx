import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileCheck,
  RotateCcw,
  Sparkles,
  Loader2,
  StopCircle,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { ExcelService, ImportAnalysisResult, ImportPreviewRow } from '../../services/excelService';
import { formatCpf, formatCurrency } from '../../lib/utils';
import { RealtimeService } from '../../services/realtimeService';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (count: number) => void;
}

interface ImportJobProgressState {
  importId: string;
  totalRecords: number;
  processed: number;
  created: number;
  updated: number;
  duplicates: number;
  invalid: number;
  failed: number;
  percent: number;
  currentChunk: number;
  totalChunks: number;
  status: 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  errorMessage?: string;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  if (!isOpen) return null;

  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ImportAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'VALIDAS' | 'ERROS' | 'DUPLICADAS' | 'MAPA'>('VALIDAS');

  // Async Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<ImportJobProgressState | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine current wizard step
  const currentStep = jobProgress?.status === 'COMPLETED'
    ? 4
    : jobProgress?.status === 'PROCESSING'
    ? 3
    : analysisResult
    ? 2
    : 1;

  // Subscribe to SSE realtime events for import updates
  useEffect(() => {
    const realtime = RealtimeService.getInstance();

    const unsubscribeProgress = realtime.subscribe('IMPORT_PROGRESS', (event) => {
      const data = event.data || event.payload;
      if (data && (!activeJobId || data.importId === activeJobId)) {
        setActiveJobId(data.importId);
        setJobProgress({
          importId: data.importId,
          totalRecords: data.totalRecords || 0,
          processed: data.processed || 0,
          created: data.created || 0,
          updated: data.updated || 0,
          duplicates: data.duplicates || 0,
          invalid: data.invalid || 0,
          failed: data.failed || 0,
          percent: data.percent || 0,
          currentChunk: data.currentChunk || 0,
          totalChunks: data.totalChunks || 0,
          status: 'PROCESSING',
        });
      }
    });

    const unsubscribeCompleted = realtime.subscribe('IMPORT_COMPLETED', (event) => {
      const data = event.data || event.payload;
      if (data && (!activeJobId || data.importId === activeJobId)) {
        setJobProgress(prev =>
          prev
            ? {
                ...prev,
                status: 'COMPLETED',
                percent: 100,
                created: data.created || prev.created,
                updated: data.updated || prev.updated,
                invalid: data.invalid || prev.invalid,
              }
            : null
        );
        onImportSuccess((data.created || 0) + (data.updated || 0));
      }
    });

    const unsubscribeFailed = realtime.subscribe('IMPORT_FAILED', (event) => {
      const data = event.data || event.payload;
      if (data && (!activeJobId || data.importId === activeJobId)) {
        setJobProgress(prev =>
          prev
            ? {
                ...prev,
                status: 'FAILED',
                errorMessage: data.error || 'Erro no processamento da importação.',
              }
            : null
        );
        setErrorMsg(data.error || 'Erro no processamento da importação.');
      }
    });

    const unsubscribeCancelled = realtime.subscribe('IMPORT_CANCELLED', (event) => {
      const data = event.data || event.payload;
      if (data && (!activeJobId || data.importId === activeJobId)) {
        setJobProgress(prev => (prev ? { ...prev, status: 'CANCELLED' } : null));
        setIsCancelling(false);
      }
    });

    return () => {
      unsubscribeProgress();
      unsubscribeCompleted();
      unsubscribeFailed();
      unsubscribeCancelled();
    };
  }, [activeJobId, onImportSuccess]);

  const handleFileSelected = async (file: File) => {
    setErrorMsg(null);
    if (file.name.toLowerCase().endsWith('.xls')) {
      setErrorMsg('Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await ExcelService.parseAndAnalyzeFile(file);
      setAnalysisResult(result);
      if (result.validRows.length > 0) {
        setActiveTab('VALIDAS');
      } else if (result.invalidRows.length > 0) {
        setActiveTab('ERROS');
      } else {
        setActiveTab('DUPLICADAS');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao processar arquivo.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmImport = async () => {
    if (!analysisResult || analysisResult.validRows.length === 0) return;

    setErrorMsg(null);

    const rowsPayload = analysisResult.validRows.map(r => ({
      cpf: r.normalizedCpf || r.rawCpf,
      fullName: r.fullName,
      proposalNumber: r.proposalNumber,
      partnerCodeOrLogin: r.matchedPartnerLogin || r.rawPartner,
      productName: r.matchedProductName || r.rawProduct,
      bankName: r.matchedBankName || r.rawBank,
      promoterName: r.matchedPromoterName || r.rawPromoter,
      disbursedValue: r.disbursedValue,
      contractBalance: r.contractBalance,
    }));

    try {
      const res = await fetch('/api/import/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileName: analysisResult.fileName,
          fileSize: analysisResult.fileSize,
          rows: rowsPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao despachar importação no servidor.');
      }

      setActiveJobId(data.importId);
      setJobProgress({
        importId: data.importId,
        totalRecords: data.totalRecords || rowsPayload.length,
        processed: 0,
        created: 0,
        updated: 0,
        duplicates: 0,
        invalid: 0,
        failed: 0,
        percent: 0,
        currentChunk: 1,
        totalChunks: Math.ceil(rowsPayload.length / 500) || 1,
        status: 'PROCESSING',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao iniciar importação em massa.');
    }
  };

  const handleCancelJob = async () => {
    if (!activeJobId) return;
    setIsCancelling(true);
    try {
      await fetch(`/api/import/${activeJobId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Falha ao cancelar job:', err);
    }
  };

  const steps = [
    { num: 1, label: 'Arquivo' },
    { num: 2, label: 'Mapeamento & Preview' },
    { num: 3, label: 'Processamento Server' },
    { num: 4, label: 'Concluído' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl rounded-xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-950/60 rounded-t-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Importação de Produção em Lote
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Processamento com chunks assíncronos, proteção multi-tenant e monitoramento em tempo real
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={jobProgress?.status === 'PROCESSING'}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Stepper Flow */}
          <div className="flex items-center justify-between max-w-2xl mx-auto pt-2">
            {steps.map((s, idx) => {
              const isCompleted = currentStep > s.num;
              const isCurrent = currentStep === s.num;

              return (
                <React.Fragment key={s.num}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        isCompleted
                          ? 'bg-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-blue-600 text-white ring-2 ring-blue-500/20'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        isCurrent
                          ? 'text-blue-600 dark:text-blue-400 font-bold'
                          : isCompleted
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-3 ${
                        currentStep > s.num
                          ? 'bg-emerald-500'
                          : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Active Job Progress Bar View */}
          {jobProgress ? (
            <div className="space-y-6 py-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {jobProgress.status === 'PROCESSING' ? (
                      <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                    ) : jobProgress.status === 'COMPLETED' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : jobProgress.status === 'CANCELLED' ? (
                      <StopCircle className="h-5 w-5 text-amber-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-rose-600" />
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {jobProgress.status === 'PROCESSING' && 'Processando Importação no Servidor...'}
                        {jobProgress.status === 'COMPLETED' && 'Importação Concluída com Sucesso!'}
                        {jobProgress.status === 'CANCELLED' && 'Importação Cancelada pelo Usuário'}
                        {jobProgress.status === 'FAILED' && 'Falha no Processamento da Importação'}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {jobProgress.processed} de {jobProgress.totalRecords} registros processados ({jobProgress.percent}%)
                        {jobProgress.totalChunks > 1 && ` • Bloco ${jobProgress.currentChunk} de ${jobProgress.totalChunks}`}
                      </p>
                    </div>
                  </div>

                  {jobProgress.status === 'PROCESSING' && (
                    <button
                      onClick={handleCancelJob}
                      disabled={isCancelling}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      <span>{isCancelling ? 'Cancelando...' : 'Cancelar Importação'}</span>
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      jobProgress.status === 'COMPLETED'
                        ? 'bg-emerald-600'
                        : jobProgress.status === 'CANCELLED'
                        ? 'bg-amber-500'
                        : jobProgress.status === 'FAILED'
                        ? 'bg-rose-600'
                        : 'bg-blue-600'
                    }`}
                    style={{ width: `${jobProgress.percent}%` }}
                  />
                </div>

                {/* Metric cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Processados</span>
                    <p className="text-base font-extrabold text-slate-900 dark:text-slate-100">{jobProgress.processed}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Criados</span>
                    <p className="text-base font-extrabold text-emerald-800 dark:text-emerald-300">{jobProgress.created}</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">Atualizados</span>
                    <p className="text-base font-extrabold text-blue-800 dark:text-blue-300">{jobProgress.updated}</p>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-800">
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Duplicados</span>
                    <p className="text-base font-extrabold text-amber-800 dark:text-amber-300">{jobProgress.duplicates}</p>
                  </div>
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800">
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">Inválidos / Falhas</span>
                    <p className="text-base font-extrabold text-rose-800 dark:text-rose-300">{jobProgress.invalid + jobProgress.failed}</p>
                  </div>
                </div>

                {jobProgress.errorMessage && (
                  <div className="p-3 bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 rounded-lg text-xs font-medium border border-rose-300 dark:border-rose-800">
                    {jobProgress.errorMessage}
                  </div>
                )}
              </div>
            </div>
          ) : !analysisResult ? (
            /* Upload Box */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 scale-[0.99]'
                  : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-950/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                }}
              />
              <div className="h-14 w-14 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                Arraste sua planilha aqui ou clique para selecionar
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-3">
                Formatos aceitos: <strong>.xlsx, .csv</strong>. O sistema identifica automaticamente colunas como CPF, ADE, Parceiro, Produto e Banco/Promotora.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800">
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Interpretação automática de modelo antigo (ex: "C6 - DG")</span>
              </div>
            </div>
          ) : (
            /* Analysis & Preview */
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Arquivo</span>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={analysisResult.fileName}>
                    {analysisResult.fileName}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{analysisResult.totalRows} linhas lidas</span>
                </div>

                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/40 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Linhas Válidas</span>
                  <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">
                    {analysisResult.validRows.length}
                  </p>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Prontas para envio ao servidor</span>
                </div>

                <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/40 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase">Com Erros</span>
                  <p className="text-lg font-extrabold text-rose-800 dark:text-rose-300">
                    {analysisResult.invalidRows.length}
                  </p>
                  <span className="text-[10px] text-rose-600 dark:text-rose-400">Requerem correção</span>
                </div>

                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/40 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase">Duplicadas (ADE)</span>
                  <p className="text-lg font-extrabold text-amber-800 dark:text-amber-300">
                    {analysisResult.duplicateRows.length}
                  </p>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">ADEs já cadastradas</span>
                </div>
              </div>

              {/* Reset button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setAnalysisResult(null)}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Substituir arquivo</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-semibold text-slate-500">
                <button
                  onClick={() => setActiveTab('VALIDAS')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'VALIDAS'
                      ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                      : 'border-transparent hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Válidas ({analysisResult.validRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('ERROS')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'ERROS'
                      ? 'border-rose-600 text-rose-700 dark:text-rose-400 font-bold'
                      : 'border-transparent hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Erros ({analysisResult.invalidRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('DUPLICADAS')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'DUPLICADAS'
                      ? 'border-amber-600 text-amber-700 dark:text-amber-400 font-bold'
                      : 'border-transparent hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Duplicadas ({analysisResult.duplicateRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('MAPA')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'MAPA'
                      ? 'border-blue-600 text-blue-700 dark:text-blue-400 font-bold'
                      : 'border-transparent hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  Colunas Detectadas
                </button>
              </div>

              {/* Table Preview */}
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-72">
                {activeTab === 'MAPA' ? (
                  <div className="p-4 space-y-2 text-xs">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Mapeamento Inteligente de Cabeçalhos:</h4>
                    {Object.entries(analysisResult.detectedColumns).map(([field, colName]) => (
                      <div key={field} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">{field}:</span>
                        <span className="font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                          {colName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sticky top-0 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-3 py-2">Linha</th>
                        <th className="px-3 py-2">CPF</th>
                        <th className="px-3 py-2">Nome</th>
                        <th className="px-3 py-2">ADE</th>
                        <th className="px-3 py-2">Parceiro</th>
                        <th className="px-3 py-2">Produto</th>
                        <th className="px-3 py-2">Banco</th>
                        <th className="px-3 py-2">Promotora</th>
                        <th className="px-3 py-2">Valores (Liberado / Saldo)</th>
                        <th className="px-3 py-2">Status / Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(activeTab === 'VALIDAS'
                        ? analysisResult.validRows
                        : activeTab === 'ERROS'
                        ? analysisResult.invalidRows
                        : analysisResult.duplicateRows
                      ).map(row => (
                        <tr key={row.rowNumber} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="px-3 py-2 font-mono text-slate-400">{row.rowNumber}</td>
                          <td className="px-3 py-2 font-mono">{formatCpf(row.normalizedCpf || row.rawCpf)}</td>
                          <td className="px-3 py-2 font-medium">{row.fullName}</td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900 dark:text-slate-100">{row.proposalNumber}</td>
                          <td className="px-3 py-2">
                            {row.matchedPartnerLogin ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{row.matchedPartnerLogin}</span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 font-mono">{row.rawPartner || 'Vazio'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{row.matchedProductName || row.rawProduct}</td>
                          <td className="px-3 py-2">{row.matchedBankName || row.rawBank}</td>
                          <td className="px-3 py-2">{row.matchedPromoterName || row.rawPromoter}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex flex-col text-[11px] font-mono">
                              {row.disbursedValue !== undefined ? (
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                  Lib: {formatCurrency(row.disbursedValue)}
                                </span>
                              ) : (
                                <span className="text-slate-400">Lib: -</span>
                              )}
                              {row.contractBalance !== undefined ? (
                                <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                                  Saldo: {formatCurrency(row.contractBalance)}
                                </span>
                              ) : (
                                <span className="text-slate-400">Saldo: -</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {row.isValid ? (
                              <div className="flex flex-col gap-0.5">
                                {row.financialDifferenceDetected ? (
                                  <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                    <Sparkles className="h-3 w-3" /> Atualizar Valores
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                                    <CheckCircle2 className="h-3 w-3" /> Válida
                                  </span>
                                )}
                                {row.financialDiffDetails && (
                                  <span className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                                    {row.financialDiffDetails}
                                  </span>
                                )}
                                {row.isLegacyInterpretation && (
                                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                                    {row.legacyInterpretationText}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 font-medium text-[11px]">
                                {row.errors.join(' | ')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-950/60 rounded-b-xl">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {jobProgress ? (
              <span>Status do Job: <strong className="text-slate-800 dark:text-slate-200">{jobProgress.status}</strong></span>
            ) : analysisResult ? (
              <span>
                Total válido para importação: <strong className="text-slate-800 dark:text-slate-200">{analysisResult.validRows.length}</strong> de{' '}
                {analysisResult.totalRows}
              </span>
            ) : (
              <span>Nenhum arquivo processado</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={jobProgress?.status === 'PROCESSING'}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
            >
              {jobProgress?.status === 'COMPLETED' ? 'Fechar' : 'Cancelar'}
            </button>
            {!jobProgress && (
              <button
                id="btn-confirm-import-excel"
                onClick={handleConfirmImport}
                disabled={!analysisResult || analysisResult.validRows.length === 0}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <FileCheck className="h-4 w-4" />
                <span>Confirmar e Enviar para Servidor ({analysisResult?.validRows.length || 0})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
