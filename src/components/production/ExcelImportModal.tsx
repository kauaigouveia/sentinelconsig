import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { ExcelService, ImportAnalysisResult, ImportPreviewRow } from '../../services/excelService';
import { formatCpf, formatCurrency } from '../../lib/utils';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (count: number) => void;
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
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'VALIDAS' | 'ERROS' | 'DUPLICADAS' | 'MAPA'>('VALIDAS');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (file: File) => {
    setErrorMsg(null);
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

  const handleConfirmImport = () => {
    if (!analysisResult || analysisResult.validRows.length === 0) return;

    setIsImporting(true);
    try {
      const { importedCount, errors } = ExcelService.executeImport(analysisResult.validRows, analysisResult.fileName);
      if (errors.length > 0) {
        setErrorMsg(`Importado parcialmente (${importedCount}). Erros: ${errors.join('; ')}`);
      } else {
        onImportSuccess(importedCount);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro durante a importação.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[92vh] border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Importar Produção em Lote (Excel / CSV)
              </h3>
              <p className="text-xs text-slate-500">
                Suporta reconhecimento inteligente de cabeçalho, detecção de ADEs duplicadas e interpretação de bancos legados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {!analysisResult ? (
            /* Upload Box */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                }}
              />
              <div className="h-14 w-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-slate-800 mb-1">
                Arraste sua planilha aqui ou clique para selecionar
              </p>
              <p className="text-xs text-slate-500 max-w-sm mb-3">
                Formatos aceitos: <strong>.xlsx, .xls, .csv</strong>. O sistema identifica automaticamente colunas como CPF, ADE, Parceiro, Produto e Banco/Promotora.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Interpretação automática de modelo antigo (ex: "C6 - DG")</span>
              </div>
            </div>
          ) : (
            /* Analysis & Preview */
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Arquivo</span>
                  <p className="text-xs font-bold text-slate-800 truncate" title={analysisResult.fileName}>
                    {analysisResult.fileName}
                  </p>
                  <span className="text-[10px] text-slate-500">{analysisResult.totalRows} linhas lidas</span>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase">Linhas Válidas</span>
                  <p className="text-lg font-extrabold text-emerald-800">
                    {analysisResult.validRows.length}
                  </p>
                  <span className="text-[10px] text-emerald-600">Prontas para importação</span>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-rose-700 uppercase">Com Erros</span>
                  <p className="text-lg font-extrabold text-rose-800">
                    {analysisResult.invalidRows.length}
                  </p>
                  <span className="text-[10px] text-rose-600">Requerem correção</span>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 shadow-2xs">
                  <span className="text-[11px] font-bold text-amber-700 uppercase">Duplicadas (ADE)</span>
                  <p className="text-lg font-extrabold text-amber-800">
                    {analysisResult.duplicateRows.length}
                  </p>
                  <span className="text-[10px] text-amber-600">ADEs já cadastradas</span>
                </div>
              </div>

              {/* Reset button */}
              <div className="flex justify-end">
                <button
                  onClick={() => setAnalysisResult(null)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Substituir arquivo</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold text-slate-500">
                <button
                  onClick={() => setActiveTab('VALIDAS')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'VALIDAS'
                      ? 'border-emerald-600 text-emerald-700 font-bold'
                      : 'border-transparent hover:text-slate-800'
                  }`}
                >
                  Válidas ({analysisResult.validRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('ERROS')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'ERROS'
                      ? 'border-rose-600 text-rose-700 font-bold'
                      : 'border-transparent hover:text-slate-800'
                  }`}
                >
                  Erros ({analysisResult.invalidRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('DUPLICADAS')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'DUPLICADAS'
                      ? 'border-amber-600 text-amber-700 font-bold'
                      : 'border-transparent hover:text-slate-800'
                  }`}
                >
                  Duplicadas ({analysisResult.duplicateRows.length})
                </button>
                <button
                  onClick={() => setActiveTab('MAPA')}
                  className={`py-2 border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'MAPA'
                      ? 'border-blue-600 text-blue-700 font-bold'
                      : 'border-transparent hover:text-slate-800'
                  }`}
                >
                  Colunas Detectadas
                </button>
              </div>

              {/* Table Preview */}
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white max-h-72">
                {activeTab === 'MAPA' ? (
                  <div className="p-4 space-y-2 text-xs">
                    <h4 className="font-bold text-slate-800 mb-2">Mapeamento Inteligente de Cabeçalhos:</h4>
                    {Object.entries(analysisResult.detectedColumns).map(([field, colName]) => (
                      <div key={field} className="flex items-center justify-between py-1 border-b border-slate-100">
                        <span className="font-semibold text-slate-600">{field}:</span>
                        <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          {colName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 border-b border-slate-200">
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
                    <tbody className="divide-y divide-slate-100">
                      {(activeTab === 'VALIDAS'
                        ? analysisResult.validRows
                        : activeTab === 'ERROS'
                        ? analysisResult.invalidRows
                        : analysisResult.duplicateRows
                      ).map(row => (
                        <tr key={row.rowNumber} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2 font-mono text-slate-400">{row.rowNumber}</td>
                          <td className="px-3 py-2 font-mono">{formatCpf(row.normalizedCpf || row.rawCpf)}</td>
                          <td className="px-3 py-2 font-medium">{row.fullName}</td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">{row.proposalNumber}</td>
                          <td className="px-3 py-2">
                            {row.matchedPartnerLogin ? (
                              <span className="text-emerald-700 font-semibold">{row.matchedPartnerLogin}</span>
                            ) : (
                              <span className="text-rose-600 font-mono">{row.rawPartner || 'Vazio'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{row.matchedProductName || row.rawProduct}</td>
                          <td className="px-3 py-2">{row.matchedBankName || row.rawBank}</td>
                          <td className="px-3 py-2">{row.matchedPromoterName || row.rawPromoter}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex flex-col text-[11px]">
                              {row.disbursedValue !== undefined ? (
                                <span className="font-semibold text-emerald-700">
                                  Lib: {formatCurrency(row.disbursedValue)}
                                </span>
                              ) : (
                                <span className="text-slate-400">Lib: -</span>
                              )}
                              {row.contractBalance !== undefined ? (
                                <span className="font-semibold text-indigo-700">
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
                                  <span className="inline-flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    <Sparkles className="h-3 w-3" /> Atualizar Valores
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                    <CheckCircle2 className="h-3 w-3" /> Válida
                                  </span>
                                )}
                                {row.financialDiffDetails && (
                                  <span className="text-[10px] text-blue-700 font-medium">
                                    {row.financialDiffDetails}
                                  </span>
                                )}
                                {row.isLegacyInterpretation && (
                                  <span className="text-[10px] text-blue-600 font-medium">
                                    {row.legacyInterpretationText}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-rose-600 font-medium text-[11px]">
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
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-xl">
          <div className="text-xs text-slate-500 font-medium">
            {analysisResult ? (
              <span>
                Total válido para importação: <strong>{analysisResult.validRows.length}</strong> de{' '}
                {analysisResult.totalRows}
              </span>
            ) : (
              <span>Nenhum arquivo processado</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-import-excel"
              onClick={handleConfirmImport}
              disabled={!analysisResult || analysisResult.validRows.length === 0 || isImporting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              <FileCheck className="h-4 w-4" />
              <span>{isImporting ? 'Importando...' : `Confirmar Importação (${analysisResult?.validRows.length || 0})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
