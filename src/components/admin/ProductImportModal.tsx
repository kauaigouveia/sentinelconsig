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
        const { default: ExcelJS } = await import('exceljs');
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
    const { default: ExcelJS } = await import('exceljs');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  border border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-col">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] px-6 py-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-[var(--info-bg)] p-2 text-[var(--text-primary)]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-tight">
                Importar Produtos em Lote
              </h2>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Upload de arquivos Excel (.xlsx) ou CSV para cadastro massivo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Status Messages */}
          {errorMsg && (
            <div className="p-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] dark:border-[var(--danger-border)] flex items-start gap-3 text-[var(--danger-text)] dark:text-[var(--danger-text)] text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          {successMsg && !summary && (
            <div className="p-4 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] dark:border-[var(--success-border)] flex items-start gap-3 text-[var(--success-text)] dark:text-[var(--success-text)] text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{successMsg}</p>
            </div>
          )}

          {summary && (
            <div className="p-5 rounded-xl border border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] dark:border-[var(--field-border)] space-y-3">
              <div className="flex items-center gap-2 text-[var(--link)] dark:text-[var(--link)] font-bold mb-2">
                <CheckCircle2 className="h-5 w-5" />
                <h3>Resultado da Importação</h3>
              </div>
              <ul className="text-sm text-[var(--link)] dark:text-[var(--link)] space-y-1 ml-7">
                <li>Total processado: <strong>{summary.total}</strong></li>
                <li>Criados: <strong>{summary.created}</strong></li>
                <li>Atualizados: <strong>{summary.updated}</strong></li>
                <li>Ignorados (idênticos): <strong>{summary.ignored}</strong></li>
                <li>Com erro: <strong className="text-[var(--danger-text)]">{summary.errors}</strong></li>
              </ul>
              {summary.errorDetails && summary.errorDetails.length > 0 && (
                <div className="mt-3 p-3 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] rounded border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                  <p className="text-xs font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)] mb-2">Detalhes dos Erros:</p>
                  <ul className="text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] list-disc list-inside">
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
                className="flex items-center justify-center gap-2 p-4 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors text-sm font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
              >
                <Download className="h-5 w-5 text-[var(--link)] dark:text-[var(--link)]" />
                Baixar Modelo (Excel)
              </button>

              <label className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] hover:border-[var(--field-border)] dark:hover:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] transition-colors cursor-pointer text-sm font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] relative">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="h-5 w-5 text-[var(--link)] dark:text-[var(--link)]" />
                Selecionar Arquivo (.xlsx, .csv)
              </label>
            </div>
          )}

          {parsedRows.length > 0 && !summary && (
            <div className="space-y-4">
              {/* Pre-validation Summary Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
                  <span className="text-[10px] font-semibold uppercase text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">Total de Linhas</span>
                  <span className="text-lg font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{totalRows}</span>
                </div>
                <div className="p-3 rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)]">
                  <span className="text-[10px] font-semibold uppercase text-[var(--success-text)] dark:text-[var(--success-text)] block">Novos Produtos</span>
                  <span className="text-lg font-bold text-[var(--success-text)] dark:text-[var(--success-text)]">{newCount}</span>
                </div>
                <div className="p-3 rounded-xl border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)]">
                  <span className="text-[10px] font-semibold uppercase text-[var(--warning-text)] dark:text-[var(--warning-text)] block">A Atualizar</span>
                  <span className="text-lg font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)]">{updateCount}</span>
                </div>
                <div className="p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
                  <span className="text-[10px] font-semibold uppercase text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block">Ignorados (Idênticos)</span>
                  <span className="text-lg font-bold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{ignoreCount}</span>
                </div>
                <div className="p-3 rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-semibold uppercase text-[var(--danger-text)] dark:text-[var(--danger-text)] block">Com Erro</span>
                  <span className="text-lg font-bold text-[var(--danger-text)] dark:text-[var(--danger-text)]">{errorCount}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Prévia da Importação
                </h3>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="text-[var(--success-text)] dark:text-[var(--success-text)]">{validCount} prontos para processar</span>
                  {errorCount > 0 && <span className="text-[var(--danger-text)] dark:text-[var(--danger-text)] font-bold">{errorCount} com erros</span>}
                </div>
              </div>

              <div className="border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl overflow-hidden bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Linha</th>
                        <th className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Produto</th>
                        <th className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Tipo Mapeado</th>
                        <th className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Regras</th>
                        <th className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Ação Prevista</th>
                        <th className="px-4 py-3 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
                      {parsedRows.map((row, i) => (
                        <tr key={i} className={row.status === 'INVALID' ? 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)]' : 'hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]'}>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)] font-bold">{row.rowIndex}</td>
                          <td className="px-4 py-2.5 font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {row.name}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                              {row.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            {row.requiresPortability ? (
                              <span className="inline-flex items-center rounded-md bg-[var(--info-bg)] px-2 py-1 text-[10px] font-medium text-[var(--link)] ring-1 ring-inset ring-[var(--focus)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] dark:ring-[var(--focus)]">
                                Exige Portabilidade
                              </span>
                            ) : (
                              <span className="text-[var(--text-secondary)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.status === 'INVALID' && <span className="text-[var(--danger-text)] font-bold">Bloqueado</span>}
                            {row.action === 'CREATE' && row.status !== 'INVALID' && <span className="text-[var(--success-text)] font-semibold">Criar novo</span>}
                            {row.action === 'UPDATE' && row.status !== 'INVALID' && <span className="text-[var(--warning-text)] font-semibold">Atualizar existente</span>}
                            {row.action === 'IGNORE' && row.status !== 'INVALID' && <span className="text-[var(--text-secondary)]">Ignorar (Idêntico)</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {row.status === 'VALID' && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-text)]" />}
                              {row.status === 'WARNING' && <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning-text)]" />}
                              {row.status === 'INVALID' && <AlertCircle className="h-3.5 w-3.5 text-[var(--danger-text)] shrink-0" />}
                              <span className={`truncate max-w-[320px] ${
                                row.status === 'VALID' ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' :
                                row.status === 'WARNING' ? 'text-[var(--warning-text)] dark:text-[var(--warning-text)]' :
                                'text-[var(--danger-text)] dark:text-[var(--danger-text)] font-medium'
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
        <div className="flex items-center justify-end gap-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] p-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
          >
            {summary ? 'Fechar' : 'Cancelar'}
          </button>

          {!summary && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || validCount === 0}
              className="rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] px-5 py-2 text-xs font-bold text-[var(--action-ink)]  transition-colors disabled:opacity-90 flex items-center gap-1.5"
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
