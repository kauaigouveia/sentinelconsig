import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  AlertTriangle,
  Loader2,
  Layers,
  Info
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { StorageService } from '../../services/storageService';
import { Product } from '../../types';
import { normalizeProposalType } from '../../lib/proposalTypeNormalizer';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted: () => void;
}

interface ParsedProductRow {
  rowIndex: number;
  name: string;
  requiresPortability: boolean;
  type: string;
  rawTypeReceived?: string;
  status: 'VALID' | 'WARNING' | 'INVALID';
  statusMessage: string;
  action: 'CREATE' | 'UPDATE' | 'IGNORE';
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  isOpen,
  onClose,
  onImportCompleted,
}) => {
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) return;
    setExistingProducts(StorageService.getProducts());
    setParsedRows([]);
    setSuccessMsg(null);
    setErrorMsg(null);
    setSummary(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const processRawData = (rows: any[]) => {
    const results: ParsedProductRow[] = [];
    
    rows.forEach((row, idx) => {
      const rawName = String(row[0] || '').trim();
      if (!rawName) return; // Skip empty rows

      const col2 = String(row[1] || '').trim();
      const col3 = String(row[2] || '').trim();

      const isCol2Port = ['SIM', 'S', 'TRUE', '1', 'NAO', 'NÃO', 'N', 'FALSE', '0'].includes(col2.toUpperCase());
      const isCol3Port = ['SIM', 'S', 'TRUE', '1', 'NAO', 'NÃO', 'N', 'FALSE', '0'].includes(col3.toUpperCase());

      let requiresPortability = false;
      let rawType = '';

      if (isCol3Port) {
        requiresPortability = ['SIM', 'S', 'TRUE', '1'].includes(col3.toUpperCase());
        rawType = col2;
      } else if (isCol2Port) {
        requiresPortability = ['SIM', 'S', 'TRUE', '1'].includes(col2.toUpperCase());
        rawType = col3;
      } else {
        rawType = col2;
      }

      let normalizedType = 'NOVO';
      let status: 'VALID' | 'WARNING' | 'INVALID' = 'VALID';
      let statusMessage = 'Pronto para importação.';
      let action: 'CREATE' | 'UPDATE' | 'IGNORE' = 'CREATE';

      try {
        normalizedType = normalizeProposalType(rawType, requiresPortability);
      } catch (err: any) {
        status = 'INVALID';
        statusMessage = `Linha ${idx + 2}: ${err.message}`;
        action = 'IGNORE';
      }

      if (status !== 'INVALID') {
        const existing = existingProducts.find(p => p.name.toUpperCase() === rawName.toUpperCase());
        
        if (existing) {
          if (existing.type !== normalizedType || existing.requiresPortabilityRelation !== requiresPortability) {
            status = 'WARNING';
            statusMessage = 'Produto já existe e será atualizado.';
            action = 'UPDATE';
          } else {
            status = 'WARNING';
            statusMessage = 'Produto já existe (idêntico). Será ignorado.';
            action = 'IGNORE';
          }
        }
      }

      results.push({
        rowIndex: idx + 2, // Account for header row in Excel
        name: rawName.toUpperCase(),
        requiresPortability,
        type: normalizedType,
        rawTypeReceived: rawType || 'N/A',
        status,
        statusMessage,
        action
      });
    });

    setParsedRows(results);
    if (results.length === 0) {
      setErrorMsg('Nenhum dado válido encontrado. Verifique o arquivo.');
    } else {
      setErrorMsg(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSummary(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      let rows: any[] = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = new TextDecoder().decode(arrayBuffer);
        const lines = text.split('\n');
        rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];
        
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) { // Skip header
            const rowValues = row.values as any[];
            rows.push([rowValues[1], rowValues[2], rowValues[3]]);
          }
        });
      }

      processRawData(rows);
    } catch (err: any) {
      setErrorMsg('Falha ao ler o arquivo. Certifique-se de usar o modelo correto.');
      console.error(err);
    }
    
    if (e.target) e.target.value = '';
  };

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Produtos');

    worksheet.columns = [
      { header: 'NOME DO PRODUTO', key: 'name', width: 35 },
      { header: 'TIPO DE OPERAÇÃO', key: 'type', width: 30 },
      { header: 'EXIGE VÍNCULO PORTABILIDADE? (SIM/NÃO)', key: 'port', width: 40 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    worksheet.addRow({ name: 'NOVO DIGITAL DATAPREV', type: 'CONSIGNADO', port: 'NÃO' });
    worksheet.addRow({ name: 'REFINANCIAMENTO INSS', type: 'REFIN', port: 'NÃO' });
    worksheet.addRow({ name: 'PORTABILIDADE DE CRÉDITO', type: 'PORTABILIDADE', port: 'SIM' });
    worksheet.addRow({ name: 'REFIN DA PORTABILIDADE', type: 'REFIN DA PORTABILIDADE', port: 'SIM' });
    worksheet.addRow({ name: 'CARTÃO CONSIGNADO RMC', type: 'CARTAO_RMC', port: 'NÃO' });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'MODELO_IMPORTACAO_PRODUTOS.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = async () => {
    const validItems = parsedRows.filter(r => r.status !== 'INVALID' && r.action !== 'IGNORE');

    if (validItems.length === 0) {
      setErrorMsg('Não existem registros válidos prontos para importação ou atualização.');
      return;
    }

    setImporting(true);
    setErrorMsg(null);

    try {
      const rowsPayload = validItems.map(r => ({
        rowIndex: r.rowIndex,
        name: r.name,
        type: r.type,
        action: r.action,
        requiresPortabilityRelation: r.requiresPortability
      }));

      const res = await fetch('/api/import/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsPayload }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na importação.');

      setSummary(data.summary);
      setSuccessMsg(data.message || 'Importação concluída com sucesso!');
      
      setTimeout(() => {
        onImportCompleted();
      }, 500);

    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao importar produtos.');
    } finally {
      setImporting(false);
    }
  };

  const totalRows = parsedRows.length;
  const validCount = parsedRows.filter(r => r.status !== 'INVALID' && r.action !== 'IGNORE').length;
  const newCount = parsedRows.filter(r => r.action === 'CREATE' && r.status !== 'INVALID').length;
  const updateCount = parsedRows.filter(r => r.action === 'UPDATE' && r.status !== 'INVALID').length;
  const ignoreCount = parsedRows.filter(r => r.action === 'IGNORE' && r.status !== 'INVALID').length;
  const errorCount = parsedRows.filter(r => r.status === 'INVALID').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-600 p-2 text-white">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Importar Produtos em Lote
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload de arquivos Excel (.xlsx) ou CSV para cadastro massivo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Status Messages */}
          {errorMsg && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800/50 flex items-start gap-3 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          {successMsg && !summary && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800/50 flex items-start gap-3 text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{successMsg}</p>
            </div>
          )}

          {summary && (
            <div className="p-5 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800/50 space-y-3">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold mb-2">
                <CheckCircle2 className="h-5 w-5" />
                <h3>Resultado da Importação</h3>
              </div>
              <ul className="text-sm text-blue-900 dark:text-blue-200 space-y-1 ml-7">
                <li>Total processado: <strong>{summary.total}</strong></li>
                <li>Criados: <strong>{summary.created}</strong></li>
                <li>Atualizados: <strong>{summary.updated}</strong></li>
                <li>Ignorados (idênticos): <strong>{summary.ignored}</strong></li>
                <li>Com erro: <strong className="text-red-600">{summary.errors}</strong></li>
              </ul>
              {summary.errorDetails && summary.errorDetails.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/50">
                  <p className="text-xs font-bold text-red-800 dark:text-red-300 mb-2">Detalhes dos Erros:</p>
                  <ul className="text-xs text-red-700 dark:text-red-400 list-disc list-inside">
                    {summary.errorDetails.map((err: any, i: number) => (
                      <li key={i}>{err.name}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center justify-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Baixar Modelo (Excel)
              </button>

              <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 transition-colors cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200 relative">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Selecionar Arquivo (.xlsx, .csv)
              </label>
            </div>
          )}

          {parsedRows.length > 0 && !summary && (
            <div className="space-y-4">
              {/* Pre-validation Summary Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 block">Total de Linhas</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{totalRows}</span>
                </div>
                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/20">
                  <span className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400 block">Novos Produtos</span>
                  <span className="text-lg font-bold text-emerald-800 dark:text-emerald-300">{newCount}</span>
                </div>
                <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/20">
                  <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400 block">A Atualizar</span>
                  <span className="text-lg font-bold text-amber-800 dark:text-amber-300">{updateCount}</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 block">Ignorados (Idênticos)</span>
                  <span className="text-lg font-bold text-slate-600 dark:text-slate-400">{ignoreCount}</span>
                </div>
                <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-900/20 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-semibold uppercase text-red-700 dark:text-red-400 block">Com Erro</span>
                  <span className="text-lg font-bold text-red-800 dark:text-red-300">{errorCount}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Prévia da Importação
                </h3>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-emerald-600 dark:text-emerald-400">{validCount} prontos para processar</span>
                  {errorCount > 0 && <span className="text-red-600 dark:text-red-400 font-bold">{errorCount} com erros</span>}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">Linha</th>
                        <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">Produto</th>
                        <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">Tipo Mapeado</th>
                        <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">Regras</th>
                        <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">Ação Prevista</th>
                        <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {parsedRows.map((row, i) => (
                        <tr key={i} className={row.status === 'INVALID' ? 'bg-red-50/70 dark:bg-red-950/30' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'}>
                          <td className="px-4 py-2.5 text-slate-500 font-bold">{row.rowIndex}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                            {row.name}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                              {row.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {row.requiresPortability ? (
                              <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-[10px] font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-900/20 dark:text-purple-400 dark:ring-purple-900/50">
                                Exige Portabilidade
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.status === 'INVALID' && <span className="text-red-600 font-bold">Bloqueado</span>}
                            {row.action === 'CREATE' && row.status !== 'INVALID' && <span className="text-emerald-600 font-semibold">Criar novo</span>}
                            {row.action === 'UPDATE' && row.status !== 'INVALID' && <span className="text-amber-600 font-semibold">Atualizar existente</span>}
                            {row.action === 'IGNORE' && row.status !== 'INVALID' && <span className="text-slate-400">Ignorar (Idêntico)</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {row.status === 'VALID' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                              {row.status === 'WARNING' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                              {row.status === 'INVALID' && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <span className={`truncate max-w-[320px] ${
                                row.status === 'VALID' ? 'text-emerald-700 dark:text-emerald-400' :
                                row.status === 'WARNING' ? 'text-amber-700 dark:text-amber-400' :
                                'text-red-700 dark:text-red-400 font-medium'
                              }`} title={row.statusMessage}>
                                {row.statusMessage}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {summary ? 'Fechar' : 'Cancelar'}
          </button>
          
          {!summary && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || validCount === 0}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>
                {importing
                  ? 'Importando...'
                  : `Confirmar e Importar ${validCount} Produto(s)`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
