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
  ArrowRight,
  Database,
  ArrowLeft,
  Search,
  Check,
  Info,
  Loader2,
  StopCircle,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Proposal, ProposalStatus } from '../../types';
import { parseCurrency, formatCurrency } from '../../lib/utils';
import { RealtimeService } from '../../services/realtimeService';

interface StatusImportProps {
  onNavigate: (view: string) => void;
}

interface UniqueStatusMap {
  [csvStatus: string]: string; // system status ID
}

interface PreviewItem {
  rowNumber: number;
  contractNumber: string;
  clientName: string;
  csvStatus: string;
  mappedStatusId: string;
  mappedStatusName: string;
  mappedStatusColor: string;
  proposalId?: string;
  currentStatusName?: string;
  currentStatusColor?: string;
  matchType: 'UPDATE' | 'NO_CHANGE' | 'NOT_FOUND';
  financialUpdate?: {
    disbursedValue?: number;
    contractBalance?: number;
    details: string;
  };
}

export const StatusImport: React.FC<StatusImportProps> = ({ onNavigate }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Map, 3: Success
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  
  // CSV Raw Data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  
  // Selected Column Indices
  const [contractColIdx, setContractColIdx] = useState<number>(-1);
  const [statusColIdx, setStatusColIdx] = useState<number>(-1);
  const [clientColIdx, setClientColIdx] = useState<number>(-1); // optional, just for name display if available
  const [disbursedColIdx, setDisbursedColIdx] = useState<number>(-1); // optional
  const [contractBalanceColIdx, setContractBalanceColIdx] = useState<number>(-1); // optional

  // Status mapping
  const [uniqueCsvStatuses, setUniqueCsvStatuses] = useState<string[]>([]);
  const [statusMapping, setStatusMapping] = useState<UniqueStatusMap>({});

  // System options
  const systemStatuses = StorageService.getStatuses();
  const allProposals = StorageService.getProposals();

  // Preview / Analysis State
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [stats, setStats] = useState({
    totalRows: 0,
    updated: 0,
    noChange: 0,
    notFound: 0,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to normalize strings for comparison
  const normalizeText = (text: string) => 
    text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9]/g, '') // remove spaces and special characters
        .trim();

  // Smart suggerstion for status matching
  const findSuggestedStatusId = (csvStatus: string): string => {
    const normCSV = normalizeText(csvStatus);
    
    // 1. Exact or direct similarity
    for (const sys of systemStatuses) {
      const normSys = normalizeText(sys.name);
      if (normSys === normCSV || normCSV.includes(normSys) || normSys.includes(normCSV)) {
        return sys.id;
      }
    }

    // 2. Portuguese common banking export mapping
    if (normCSV.includes('pago') || normCSV.includes('finalizad') || normCSV.includes('concluid') || normCSV.includes('liquidad')) {
      const found = systemStatuses.find(s => s.code === 'PAGO');
      if (found) return found.id;
    }
    if (normCSV.includes('cancel') || normCSV.includes('desist')) {
      const found = systemStatuses.find(s => s.code === 'CANCELADO');
      if (found) return found.id;
    }
    if (normCSV.includes('reprov') || normCSV.includes('recus') || normCSV.includes('negad') || normCSV.includes('inconsist')) {
      const found = systemStatuses.find(s => s.code === 'REPROVADO');
      if (found) return found.id;
    }
    if (normCSV.includes('formaliz')) {
      const found = systemStatuses.find(s => s.code === 'AGUARDAR_FORMALIZACAO');
      if (found) return found.id;
    }
    if (normCSV.includes('anexo') || normCSV.includes('document')) {
      const found = systemStatuses.find(s => s.code === 'PENDENTE_ENVIO_DOCUMENTACAO' || s.code === 'PENDENTE_ANEXO_DOCUMENTACAO');
      if (found) return found.id;
    }
    if (normCSV.includes('retorn') || normCSV.includes('saldo') || normCSV.includes('cip')) {
      const found = systemStatuses.find(s => s.code === 'SALDO_RETORNADO' || s.code === 'AGUARDAR_RETORNO_CIP');
      if (found) return found.id;
    }

    return '';
  };

  const handleFileSelected = async (selectedFile: File) => {
    setErrorMsg(null);
    if (selectedFile.name.toLowerCase().endsWith('.xls')) {
      setErrorMsg('Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.');
      return;
    }
    setIsParsing(true);
    setFile(selectedFile);

    try {
      let rawRows: any[][] = [];

      // 1. Tentar ler via ExcelJS (.xlsx)
      try {
        const { default: ExcelJS } = await import('exceljs');
        const buffer = await selectedFile.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (worksheet) {
          worksheet.eachRow({ includeEmpty: true }, (row) => {
            const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
            rawRows.push(
              rowValues.map(v => {
                if (v === null || v === undefined) return '';
                if (typeof v === 'object') {
                  if ('result' in v && v.result !== undefined) return v.result;
                  if ('text' in v && v.text !== undefined) return v.text;
                  if ('hyperlink' in v && 'text' in v) return v.text;
                  if (v instanceof Date) return v.toISOString();
                }
                return v;
              })
            );
          });
        }
      } catch (excelErr) {
        console.warn('Leitura XLSX falhou, tentando leitor de texto puro:', excelErr);
      }

      // 2. Fallback robusto para arquivos CSV/TSV/TXT ou se o leitor XLSX não obteve linhas
      if (!rawRows || rawRows.length < 2) {
        try {
          const text = await selectedFile.text();
          const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
          if (lines.length >= 2) {
            const firstLine = lines[0];
            const sep = firstLine.includes(';') ? ';' : (firstLine.includes('\t') ? '\t' : ',');
            rawRows = lines.map(line => line.split(sep).map(col => col.replace(/^["']|["']$/g, '').trim()));
          }
        } catch (textErr) {
          console.warn('Leitura de texto falhou:', textErr);
        }
      }

      if (!rawRows || rawRows.length < 2) {
        throw new Error('O arquivo selecionado está vazio ou não possui colunas suficientes.');
      }

      if (rawRows.length > 50000) {
        throw new Error('O arquivo excede o limite máximo permitido de 50.000 registros para importação.');
      }

      // Headers extraction
      const fileHeaders = rawRows[0].map(h => String(h).trim());
      setHeaders(fileHeaders);

      // Data rows
      const fileRows = rawRows.slice(1).filter(row => row && row.some(cell => String(cell).trim() !== ''));
      setRows(fileRows);

      // Automatic Column Detection
      let contractIdx = -1;
      let statusIdx = -1;
      let clientIdx = -1;
      let disbursedIdx = -1;
      let balanceIdx = -1;

      fileHeaders.forEach((header, index) => {
        const normHeader = normalizeText(header);
        
        if (normHeader.includes('contrato') || normHeader.includes('ade') || normHeader.includes('proposta') || normHeader.includes('numerodecontrole')) {
          if (contractIdx === -1) contractIdx = index;
        }
        if (normHeader.includes('status') || normHeader.includes('situacao') || normHeader.includes('fase') || normHeader.includes('estado')) {
          if (statusIdx === -1) statusIdx = index;
        }
        if (normHeader.includes('nome') || normHeader.includes('cliente') || normHeader.includes('beneficiario')) {
          if (clientIdx === -1) clientIdx = index;
        }
        if (normHeader.includes('liberado') || normHeader.includes('liquido') || normHeader.includes('troco')) {
          if (disbursedIdx === -1) disbursedIdx = index;
        }
        if (normHeader.includes('saldo') || normHeader.includes('quitacao') || normHeader.includes('devedor')) {
          if (balanceIdx === -1) balanceIdx = index;
        }
      });

      // Fail-safes
      if (contractIdx === -1) contractIdx = 0;
      if (statusIdx === -1) statusIdx = fileHeaders.length > 5 ? 5 : 1;
      if (clientIdx === -1 && fileHeaders.length > 1) clientIdx = 1;

      setContractColIdx(contractIdx);
      setStatusColIdx(statusIdx);
      setClientColIdx(clientIdx);
      setDisbursedColIdx(disbursedIdx);
      setContractBalanceColIdx(balanceIdx);

      // Unique Statuses extraction from file
      const statuses = new Set<string>();
      fileRows.forEach(row => {
        if (row && row[statusIdx] !== undefined) {
          const s = String(row[statusIdx]).trim();
          if (s) statuses.add(s);
        }
      });

      const uniqueStatusesList = Array.from(statuses);
      setUniqueCsvStatuses(uniqueStatusesList);

      // Pre-populate intelligent mappings
      const initialMap: UniqueStatusMap = {};
      uniqueStatusesList.forEach(s => {
        initialMap[s] = findSuggestedStatusId(s);
      });
      setStatusMapping(initialMap);

      // Move to step 2 directly
      setStep(2);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao carregar ou processar o arquivo de planilha.');
      setFile(null);
    } finally {
      setIsParsing(false);
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

  const handleStatusMapChange = (csvStatus: string, sysStatusId: string) => {
    setStatusMapping(prev => ({
      ...prev,
      [csvStatus]: sysStatusId
    }));
  };

  // Generate real-time preview of the updates based on current columns and mappings
  const generatePreview = () => {
    if (contractColIdx === -1 || statusColIdx === -1) return;

    let updatedCount = 0;
    let noChangeCount = 0;
    let notFoundCount = 0;

    const items: PreviewItem[] = rows.map((row, index) => {
      const contractNumber = String(row[contractColIdx] || '').trim();
      const clientName = clientColIdx >= 0 ? String(row[clientColIdx] || '').trim() : 'Não especificado';
      const csvStatus = String(row[statusColIdx] || '').trim();
      
      const mappedStatusId = statusMapping[csvStatus] || '';
      const mappedStatus = systemStatuses.find(s => s.id === mappedStatusId);
      
      const cleanContract = contractNumber.replace(/^0+/, ''); // strip leading zeros for comparison
      const matchedProposal = allProposals.find(p => p.proposalNumber.replace(/^0+/, '') === cleanContract);

      let matchType: 'UPDATE' | 'NO_CHANGE' | 'NOT_FOUND' = 'NOT_FOUND';
      let currentStatusName = undefined;
      let currentStatusColor = undefined;

      if (matchedProposal) {
        const currStatus = systemStatuses.find(s => s.id === matchedProposal.statusId);
        currentStatusName = currStatus?.name || 'Desconhecido';
        currentStatusColor = currStatus?.color || '#cbd5e1';

        if (mappedStatusId) {
          if (matchedProposal.statusId === mappedStatusId) {
            matchType = 'NO_CHANGE';
            noChangeCount++;
          } else {
            matchType = 'UPDATE';
            updatedCount++;
          }
        } else {
          matchType = 'NOT_FOUND'; // treated as not matched if mapped target is null
          notFoundCount++;
        }

        // Financial differences detection
        let financialUpdate: PreviewItem['financialUpdate'] = undefined;
        let newDisbursed = disbursedColIdx >= 0 ? parseCurrency(String(row[disbursedColIdx] || '')) : undefined;
        let newBalance = contractBalanceColIdx >= 0 ? parseCurrency(String(row[contractBalanceColIdx] || '')) : undefined;

        const diffs: string[] = [];
        if (newDisbursed !== undefined && Math.abs((matchedProposal.disbursedValue || 0) - newDisbursed) > 0.01) {
          diffs.push(`Lib: ${matchedProposal.disbursedValue !== undefined ? formatCurrency(matchedProposal.disbursedValue) : 'Não inf.'} ➔ ${formatCurrency(newDisbursed)}`);
        }
        if (newBalance !== undefined && Math.abs((matchedProposal.contractBalance || 0) - newBalance) > 0.01) {
          diffs.push(`Saldo: ${matchedProposal.contractBalance !== undefined ? formatCurrency(matchedProposal.contractBalance) : 'Não inf.'} ➔ ${formatCurrency(newBalance)}`);
        }

        if (diffs.length > 0) {
          financialUpdate = {
            disbursedValue: newDisbursed !== undefined ? newDisbursed : matchedProposal.disbursedValue,
            contractBalance: newBalance !== undefined ? newBalance : matchedProposal.contractBalance,
            details: diffs.join(' | ')
          };
          if (matchType === 'NO_CHANGE') {
            matchType = 'UPDATE';
            noChangeCount--;
            updatedCount++;
          }
        }

        return {
          rowNumber: index + 2,
          contractNumber,
          clientName,
          csvStatus,
          mappedStatusId,
          mappedStatusName: mappedStatus?.name || 'Sem vínculo / Ignorar',
          mappedStatusColor: mappedStatus?.color || '#94a3b8',
          proposalId: matchedProposal?.id,
          currentStatusName,
          currentStatusColor,
          matchType,
          financialUpdate
        };
      } else {
        notFoundCount++;
        return {
          rowNumber: index + 2,
          contractNumber,
          clientName,
          csvStatus,
          mappedStatusId,
          mappedStatusName: mappedStatus?.name || 'Sem vínculo / Ignorar',
          mappedStatusColor: mappedStatus?.color || '#94a3b8',
          proposalId: undefined,
          currentStatusName,
          currentStatusColor,
          matchType: 'NOT_FOUND'
        };
      }
    });

    setPreviewItems(items);
    setStats({
      totalRows: rows.length,
      updated: updatedCount,
      noChange: noChangeCount,
      notFound: notFoundCount
    });
  };

  // Trigger preview generation whenever column selection or status mapping changes
  React.useEffect(() => {
    if (rows.length > 0) {
      generatePreview();
    }
  }, [contractColIdx, statusColIdx, clientColIdx, disbursedColIdx, contractBalanceColIdx, statusMapping, rows]);

  // Async Job SSE tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    processed: number;
    total: number;
    percent: number;
    updated: number;
    invalid: number;
    failed: number;
    rowErrors: Array<{ line: number; identifier: string; message: string }>;
    rowErrorsTruncated: number;
    status: 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  } | null>(null);

  useEffect(() => {
    const realtime = RealtimeService.getInstance();
    const unsubProgress = realtime.subscribe('IMPORT_PROGRESS', (event) => {
      const data = event.data || event.payload;
      if (data && activeJobId && data.importId === activeJobId) {
        setJobProgress({
          processed: data.processed || 0,
          total: data.totalRecords || 0,
          percent: data.percent || 0,
          updated: data.updated || 0,
          invalid: data.invalid || 0,
          failed: data.failed || 0,
          rowErrors: [],
          rowErrorsTruncated: 0,
          status: 'PROCESSING',
        });
      }
    });

    const unsubCompleted = realtime.subscribe('IMPORT_COMPLETED', (event) => {
      const data = event.data || event.payload;
      if (data && activeJobId && data.importId === activeJobId) {
        setJobProgress(prev => prev ? {
          ...prev,
          status: 'COMPLETED',
          percent: 100,
          updated: Number(data.updated) || prev.updated,
          invalid: Number(data.invalid) || 0,
          failed: Number(data.failed) || 0,
          rowErrors: Array.isArray(data.rowErrors) ? data.rowErrors : prev.rowErrors,
          rowErrorsTruncated: Number(data.rowErrorsTruncated) || 0,
        } : null);
        setIsProcessing(false);
        setStep(3);
      }
    });

    return () => {
      unsubProgress();
      unsubCompleted();
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!activeJobId || !isProcessing) return;
    let cancelled = false;
    let requestInFlight = false;
    const pollJob = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(`/api/import/${encodeURIComponent(activeJobId)}`, { credentials: 'include' });
        if (!response.ok) return;
        const job = await response.json();
        if (cancelled || job.id !== activeJobId) return;
        const status: NonNullable<typeof jobProgress>['status'] =
          job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'FAILED'
            ? job.status
            : 'PROCESSING';
        setJobProgress({
          processed: Number(job.processedRecords) || 0,
          total: Number(job.totalRecords) || 0,
          percent: status === 'COMPLETED' ? 100 : Number(job.percent) || 0,
          updated: Number(job.updatedRecords) || 0,
          invalid: Number(job.invalidRecords) || 0,
          failed: Number(job.failedRecords) || 0,
          rowErrors: Array.isArray(job.metadata?.rowErrors) ? job.metadata.rowErrors : [],
          rowErrorsTruncated: Number(job.metadata?.rowErrorsTruncated) || 0,
          status,
        });
        if (status === 'COMPLETED') {
          setIsProcessing(false);
          setStep(3);
        } else if (status === 'FAILED' || status === 'CANCELLED') {
          setIsProcessing(false);
          setErrorMsg(job.errorMessage || (status === 'CANCELLED' ? 'A importação foi cancelada.' : 'Falha ao processar a importação.'));
        }
      } catch {
        // Retry on the next interval while the job is running.
      } finally {
        requestInFlight = false;
      }
    };
    void pollJob();
    const timer = window.setInterval(() => void pollJob(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJobId, isProcessing]);

  const handleConfirmImport = async () => {
    const toUpdate = previewItems.filter(item => item.matchType === 'UPDATE');
    if (toUpdate.length === 0) {
      setErrorMsg('Não há nenhuma proposta com alteração de status ou valores detectada para processar.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    const rowsPayload = toUpdate.map(item => ({
      sourceLine: item.rowNumber,
      proposalNumberOrAde: item.contractNumber,
      targetStatusName: item.mappedStatusName,
      disbursedValue: item.financialUpdate?.disbursedValue,
      contractBalance: item.financialUpdate?.contractBalance,
    }));

    try {
      const res = await fetch('/api/import/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileName: file?.name || 'retorno_status.xlsx',
          fileSize: file?.size || 0,
          rows: rowsPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao despachar atualização de status no servidor.');
      }

      setActiveJobId(data.importId);
      setJobProgress({
        processed: 0,
        total: rowsPayload.length,
        percent: 0,
        updated: 0,
        invalid: 0,
        failed: 0,
        rowErrors: [],
        rowErrorsTruncated: 0,
        status: 'PROCESSING',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro durante o processamento da importação de lote.');
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setUniqueCsvStatuses([]);
    setStatusMapping({});
    setPreviewItems([]);
    setActiveJobId(null);
    setJobProgress(null);
    setIsProcessing(false);
    setStep(1);
    setErrorMsg(null);
  };

  return (
    <div id="status-import-container" className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
            <Database className="h-3.5 w-3.5" />
            <span>Painel Administrativo Mestre</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Importar & Atualizar Status de Bancos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Atualize o status da sua esteira inteira em massa a partir de relatórios extraídos das plataformas bancárias.
          </p>
        </div>
        
        {step !== 1 && (
          <button
            onClick={handleReset}
            className="text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 flex items-center gap-2 cursor-pointer transition-all"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Selecionar outro arquivo</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-400 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block mb-0.5">Atenção no Processamento:</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Step 1: Upload Box */}
      {step === 1 && (
        <div className="space-y-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-3 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10'
                : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-600 bg-slate-50/50 dark:bg-slate-900/40'
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
            
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-5 shadow-sm">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 mb-1">
              Arraste seu relatório bancário aqui
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mb-4">
              Selecione o arquivo <strong>Excel (.xlsx)</strong> ou <strong>CSV (.csv)</strong> que você exporta da plataforma para sincronizar instantaneamente.
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                ✔️ Reconhece contratos por ADE / Identificador
              </span>
              <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                ✔️ Mapeador Inteligente de status
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-emerald-500" />
              <span>Instruções de compatibilidade</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
              O importador mestre aceita qualquer relatório estruturado em tabela contendo o <strong>Número do Contrato</strong> e o <strong>Status Atual</strong>.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              O sistema se encarregará de isolar as ADEs pertencentes ao parceiro correto, cruzar com o banco em tempo real e apontar o status atualizado na esteira Kanban de todos os usuários envolvidos automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Columns & Mapping Panel */}
      {step === 2 && rows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left panel: Config, headers & status matching */}
          <div className="lg:col-span-4 space-y-6">
            {/* Column Selector Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
                <SlidersIcon className="h-4 w-4 text-emerald-500" />
                <span>1. Identificar Colunas da Planilha</span>
              </h3>
              
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Coluna de Contrato / ADE *
                  </label>
                  <select
                    value={contractColIdx}
                    onChange={e => setContractColIdx(Number(e.target.value))}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                  >
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h || `Coluna ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Coluna de Novo Status *
                  </label>
                  <select
                    value={statusColIdx}
                    onChange={e => setStatusColIdx(Number(e.target.value))}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                  >
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h || `Coluna ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Coluna de Nome do Cliente (Opcional)
                  </label>
                  <select
                    value={clientColIdx}
                    onChange={e => setClientColIdx(Number(e.target.value))}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={-1}>Ignorar / Não exibir nome</option>
                    {headers.map((h, idx) => (
                      <option key={idx} value={idx}>
                        {h || `Coluna ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                      💰 Atualização Financeira (Opcional)
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Coluna de Valor Liberado / Líquido / Troco
                      </label>
                      <select
                        value={disbursedColIdx}
                        onChange={e => setDisbursedColIdx(Number(e.target.value))}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-emerald-50/40 dark:bg-slate-800 p-2 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value={-1}>Ignorar / Não atualizar valor liberado</option>
                        {headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            {h || `Coluna ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Coluna de Saldo do Contrato / Quitação / Saldo Devedor
                      </label>
                      <select
                        value={contractBalanceColIdx}
                        onChange={e => setContractBalanceColIdx(Number(e.target.value))}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-indigo-50/40 dark:bg-slate-800 p-2 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value={-1}>Ignorar / Não atualizar saldo</option>
                        {headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            {h || `Coluna ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Matcher Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>2. Mapear Status Detectados</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Combine cada status presente no relatório do banco com o status correspondente do seu sistema.
                </p>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                {uniqueCsvStatuses.map((csvStatus) => {
                  const systemId = statusMapping[csvStatus] || '';
                  
                  return (
                    <div key={csvStatus} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate" title={csvStatus}>
                          {csvStatus}
                        </span>
                        {systemId ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-950/20 dark:text-emerald-400">
                            Pre-mapeado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full dark:bg-amber-950/20 dark:text-amber-400">
                            Pendente
                          </span>
                        )}
                      </div>

                      <select
                        value={systemId}
                        onChange={e => handleStatusMapChange(csvStatus, e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">🚫 Ignorar / Não alterar no sistema</option>
                        {systemStatuses.map(sys => (
                          <option key={sys.id} value={sys.id}>
                            {sys.name} ({sys.responsibleGroup})
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Card */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-600 dark:text-slate-400">Alterações no banco:</span>
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{stats.updated} registros</span>
              </div>
              
              <button
                onClick={handleConfirmImport}
                disabled={isProcessing || stats.updated === 0}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black p-3.5 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-emerald-600/10"
              >
                {isProcessing ? (
                  <span>Processando Importação...</span>
                ) : (
                  <>
                    <span>Confirmar & Executar ({stats.updated})</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
              {isProcessing && jobProgress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>Processadas {jobProgress.processed} de {jobProgress.total}</span>
                    <span>{jobProgress.percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
                    <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${jobProgress.percent}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Live Preview & statistics */}
          <div className="lg:col-span-8 space-y-6">
            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Analisado</p>
                <p className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">{stats.totalRows}</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 dark:border-emerald-950 p-4 shadow-2xs">
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Pendentes de Atualização</p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.updated}</p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Já Atualizados</p>
                <p className="text-xl font-black text-slate-500 dark:text-slate-400 mt-1">{stats.noChange}</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/20 dark:border-amber-950 p-4 shadow-2xs">
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Contrato Não Localizado</p>
                <p className="text-xl font-black text-amber-500 dark:text-amber-400 mt-1">{stats.notFound}</p>
              </div>
            </div>

            {/* Live Preview List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col">
              <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-800 dark:text-white">
                  Visualização Prévia das Alterações
                </h3>
                <span className="text-[11px] font-bold text-slate-400">
                  Mostrando os registros lidos da planilha
                </span>
              </div>

              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Linha</th>
                      <th className="px-6 py-3">Contrato / ADE</th>
                      <th className="px-6 py-3">Cliente</th>
                      <th className="px-6 py-3">Status Planilha</th>
                      <th className="px-6 py-3 text-center">Status no Sistema</th>
                      <th className="px-6 py-3 text-right">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs text-slate-700 dark:text-slate-300">
                    {previewItems.map((item, index) => {
                      return (
                        <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="px-6 py-3 text-[10px] font-bold text-slate-400">{item.rowNumber}</td>
                          <td className="px-6 py-3 font-mono font-bold text-slate-900 dark:text-white">
                            {item.contractNumber || '—'}
                          </td>
                          <td className="px-6 py-3 font-semibold truncate max-w-[150px]" title={item.clientName}>
                            {item.clientName}
                          </td>
                          <td className="px-6 py-3">
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-1 rounded">
                              {item.csvStatus || 'Vazio'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center">
                            {item.matchType === 'NOT_FOUND' ? (
                              <span className="text-[11px] font-bold text-slate-400">—</span>
                            ) : (
                              <div className="flex flex-col items-center gap-1.5 justify-center">
                                <span
                                  className="text-[10px] font-bold text-white px-2 py-0.5 rounded-sm line-through opacity-50"
                                  style={{ backgroundColor: item.currentStatusColor }}
                                >
                                  {item.currentStatusName}
                                </span>
                                <span className="text-[10px] text-slate-400">➔</span>
                                <span
                                  className="text-[10px] font-bold text-white px-2 py-0.5 rounded-sm"
                                  style={{ backgroundColor: item.mappedStatusColor }}
                                >
                                  {item.mappedStatusName}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              {item.matchType === 'UPDATE' && (
                                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                                  📝 Atualizar
                                </span>
                              )}
                              {item.financialUpdate && (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  💰 {item.financialUpdate.details}
                                </span>
                              )}
                              {item.matchType === 'NO_CHANGE' && !item.financialUpdate && (
                                <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full dark:bg-slate-800 dark:text-slate-500">
                                  ✔️ Inalterado
                                </span>
                              )}
                              {item.matchType === 'NOT_FOUND' && (
                                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full dark:bg-amber-950/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30" title="Código de contrato não localizado na base de dados">
                                  ⚠️ Não Localizado
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Success Report Panel */}
      {step === 3 && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-xl text-center space-y-6">
          <div className="h-20 w-20 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 flex items-center justify-center mx-auto shadow-sm">
            <FileCheck className="h-10 w-10" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Importação e Atualização Concluídas!
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {jobProgress && jobProgress.invalid + jobProgress.failed > 0
                ? 'A importação terminou com algumas ocorrências. Revise os motivos abaixo e corrija as linhas indicadas.'
                : 'O lote de dados da planilha foi processado. Os status e valores financeiros selecionados foram atualizados.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-b border-slate-100 dark:border-slate-800 py-6 text-center">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atualizados</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{jobProgress?.updated ?? stats.updated}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inalterados</p>
              <p className="text-2xl font-black text-slate-500 dark:text-slate-400 mt-1">{stats.noChange}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ignorados</p>
              <p className="text-2xl font-black text-amber-500 dark:text-amber-400 mt-1">{jobProgress ? jobProgress.invalid + jobProgress.failed : stats.notFound}</p>
            </div>
          </div>

          {jobProgress?.rowErrors.length ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900 text-left overflow-hidden">
              <div className="bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs font-bold text-amber-800 dark:text-amber-300">
                Ocorrências para revisar ({jobProgress.rowErrors.length}{jobProgress.rowErrorsTruncated ? ` de ${jobProgress.rowErrors.length + jobProgress.rowErrorsTruncated}` : ''})
                {jobProgress.rowErrorsTruncated > 0 && <span className="block font-normal">Exibindo as primeiras 500 ocorrências.</span>}
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-amber-100 dark:divide-amber-900/50">
                {jobProgress.rowErrors.slice(0, 20).map((error, index) => (
                  <div key={`${error.line}-${index}`} className="grid grid-cols-[70px_minmax(90px,0.7fr)_minmax(180px,2fr)] gap-2 px-4 py-2 text-[11px] text-slate-700 dark:text-slate-300">
                    <span className="font-mono">Linha {error.line}</span>
                    <span className="truncate font-mono" title={error.identifier}>{error.identifier}</span>
                    <span>{error.message}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('esteira')}
              className="w-full sm:w-auto text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-5 py-3 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>Ver Esteira Kanban</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={handleReset}
              className="w-full sm:w-auto text-xs font-bold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl px-5 py-3 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Importar Nova Planilha</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Internal minimal icons for completeness
const SlidersIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <line x1="4" x2="4" y1="21" y2="14" />
    <line x1="4" x2="4" y1="10" y2="3" />
    <line x1="12" x2="12" y1="21" y2="12" />
    <line x1="12" x2="12" y1="8" y2="3" />
    <line x1="20" x2="20" y1="21" y2="16" />
    <line x1="20" x2="20" y1="12" y2="3" />
    <line x1="2" x2="6" y1="14" y2="14" />
    <line x1="10" x2="14" y1="8" y2="8" />
    <line x1="18" x2="22" y1="16" y2="16" />
  </svg>
);
