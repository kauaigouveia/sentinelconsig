import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  AlertTriangle,
  Calculator,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { formatCpf, normalizeCpf, isValidCpf, extractPartnerCode } from '../../lib/utils';
import { Partner } from '../../types';
import { PartnerSearchSelect } from '../common/PartnerSearchSelect';

interface SimulationImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted: () => void;
}

interface ParsedSimulationRow {
  rowIndex: number;
  cpf: string;
  cleanCpf: string;
  partnerIdentifier: string;
  matchedPartner: Partner | null;
  status: 'VALID' | 'WARNING' | 'INVALID';
  statusMessage: string;
}

export const SimulationImportModal: React.FC<SimulationImportModalProps> = ({
  isOpen,
  onClose,
  onImportCompleted,
}) => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [defaultPartnerId, setDefaultPartnerId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      fetch('/api/partners')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const activePartners = data.filter((p: any) => p.status === 'ATIVO' || p.active);
            setPartners(activePartners);
            if (activePartners.length > 0) {
              setDefaultPartnerId(activePartners[0].id);
            }
          }
        })
        .catch(err => console.warn('[API PARTNERS GET FAIL]', err));
    }
  }, [isOpen]);
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedSimulationRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const defaultPartner = partners.find(p => p.id === defaultPartnerId) || partners[0];

  // Process raw data from spreadsheet or pasted text
  const processRawData = (rowsData: any[]) => {
    const results: ParsedSimulationRow[] = [];

    rowsData.forEach((row, idx) => {
      const rowKeys = Object.keys(row);

      const findVal = (keyPatterns: string[]) => {
        for (const pattern of keyPatterns) {
          const matchKey = rowKeys.find(k => k.toLowerCase().includes(pattern));
          if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null) {
            return String(row[matchKey]).trim();
          }
        }
        return '';
      };

      const rawCpf = findVal(['cpf', 'cliente', 'documento']) || (Array.isArray(row) ? String(row[0] || '') : '');
      const rawPartner = findVal(['parceiro', 'login', 'codigo', 'código', 'code', 'promotora']) || (Array.isArray(row) ? String(row[1] || '') : '');

      const cleanCpf = normalizeCpf(rawCpf);
      let matchedPartner: Partner | null = null;
      let status: 'VALID' | 'WARNING' | 'INVALID' = 'VALID';
      let statusMessage = 'Pronto para cadastro';

      if (!cleanCpf) {
        status = 'INVALID';
        statusMessage = 'CPF do cliente não informado ou vazio.';
      } else if (!isValidCpf(cleanCpf)) {
        status = 'INVALID';
        statusMessage = `CPF '${rawCpf}' é inválido (dígitos verificadores incorretos).`;
      } else {
        // Try matching partner
        const identifier = rawPartner.trim().toUpperCase();
        if (identifier) {
          matchedPartner = partners.find(
            p =>
              p.id === identifier ||
              p.login.toUpperCase() === identifier ||
              extractPartnerCode(p.login) === identifier ||
              p.fullName.toUpperCase().includes(identifier)
          ) || null;
        }

        if (!matchedPartner) {
          if (defaultPartner) {
            matchedPartner = defaultPartner;
            status = 'WARNING';
            statusMessage = `Parceiro '${rawPartner || 'vazio'}' não encontrado; utilizando parceiro padrão '${defaultPartner.login}'.`;
          } else {
            status = 'INVALID';
            statusMessage = `Parceiro '${rawPartner}' não localizado no sistema.`;
          }
        }
      }

      results.push({
        rowIndex: idx + 1,
        cpf: rawCpf,
        cleanCpf,
        partnerIdentifier: rawPartner,
        matchedPartner,
        status,
        statusMessage,
      });
    });

    setParsedRows(results);
  };

  // Upload Excel / CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (file.name.toLowerCase().endsWith('.xls')) {
      setErrorMsg('Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        if (!buffer) {
          throw new Error('Não foi possível ler o arquivo.');
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          throw new Error('Nenhuma planilha encontrada no arquivo.');
        }

        const rawJson: any[] = [];
        let headers: string[] = [];

        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
          if (rowNumber === 1) {
            headers = rowValues.map(v => String(v || '').trim());
          } else {
            const rowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              rowObj[h] = rowValues[idx] !== undefined ? rowValues[idx] : '';
            });
            rawJson.push(rowObj);
          }
        });

        if (rawJson.length === 0) {
          setErrorMsg('A planilha selecionada está vazia.');
          return;
        }

        if (rawJson.length > 50000) {
          setErrorMsg('O arquivo excede o limite máximo permitido de 50.000 registros para importação.');
          return;
        }

        processRawData(rawJson);
      } catch (err: any) {
        setErrorMsg('Erro ao ler a planilha: ' + (err.message || 'Arquivo inválido.'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Parse Pasted Text
  const handleParsePastedText = () => {
    if (!pastedText.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const lines = pastedText.trim().split('\n').filter(l => l.trim().length > 0);
    const rowsJson = lines.map(line => {
      const parts = line.split(/[\t,;]/).map(p => p.trim());
      return {
        cpf: parts[0] || '',
        parceiro: parts[1] || '',
      };
    });

    processRawData(rowsJson);
  };

  // Download Excel Template
  const handleDownloadTemplate = async () => {
    const templateData = [
      { 'CPF CLIENTE': '012.345.678-90', 'PARCEIRO (LOGIN / CÓDIGO)': 'KAUAI@16740' },
      { 'CPF CLIENTE': '987.654.321-00', 'PARCEIRO (LOGIN / CÓDIGO)': '16690' },
      { 'CPF CLIENTE': '111.222.333-44', 'PARCEIRO (LOGIN / CÓDIGO)': 'FOX@16715' },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Simulacoes');
    const headers = Object.keys(templateData[0]);
    worksheet.addRow(headers);
    templateData.forEach(item => {
      worksheet.addRow(headers.map(h => (item as any)[h]));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'MODELO_IMPORTACAO_SIMULACOES.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    const validItems = parsedRows
      .filter(r => (r.status === 'VALID' || r.status === 'WARNING') && r.matchedPartner)
      .map(r => ({
        cpf: r.cleanCpf,
        partnerId: r.matchedPartner!.id,
      }));

    if (validItems.length === 0) {
      setErrorMsg('Não existem solicitações de simulação válidas prontas para importação.');
      return;
    }

    setImporting(true);
    let createdCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const item of validItems) {
      try {
        const res = await fetch('/api/simulations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ cpf: item.cpf, partnerId: item.partnerId }),
        });

        if (res.ok) {
          createdCount++;
        } else if (res.status === 409) {
          duplicateCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setImporting(false);
    let msg = `Sucesso! ${createdCount} solicitações de simulação foram criadas via API.`;
    if (duplicateCount > 0) msg += ` (${duplicateCount} duplicidades pendentes ignoradas)`;
    if (errorCount > 0) msg += ` (${errorCount} falhas de processamento)`;

    setSuccessMsg(msg);
    setTimeout(() => {
      onImportCompleted();
      onClose();
    }, 1500);
  };

  const validCount = parsedRows.filter(r => r.status === 'VALID' || r.status === 'WARNING').length;
  const invalidCount = parsedRows.filter(r => r.status === 'INVALID').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-600 p-2 text-white">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Importar Solicitações de Simulação em Lote
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload de planilha Excel (.xlsx, .csv) contendo listas de CPFs e Parceiros
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Section 1: Default Partner Fallback */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/50 dark:bg-blue-950/30 p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/50">
            <div>
              <PartnerSearchSelect
                partners={partners}
                selectedPartnerId={defaultPartnerId}
                onSelectPartner={setDefaultPartnerId}
                label="Parceiro Comercial Padrão *"
                placeholder="Digite o código (ex: 16740) ou nome..."
                required
              />
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Atribuído automaticamente se a coluna 'Parceiro' da planilha estiver vazia.
              </p>
            </div>

            <div className="flex items-end justify-end">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Download className="h-4 w-4 text-blue-600" />
                <span>Baixar Modelo Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Section 2: Upload or Paste */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File Upload Dropzone */}
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-5 text-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex flex-col items-center justify-center">
              <Upload className="h-8 w-8 text-blue-500 mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Selecione a planilha de simulações
              </p>
              <p className="text-[10px] text-slate-500 mb-3">Formatos: .XLSX, .CSV</p>
              <label className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white cursor-pointer shadow-xs transition-colors">
                <span>Escolher Arquivo</span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste Raw Data */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Ou cole os dados (CPF [Tab] Parceiro):
              </label>
              <textarea
                rows={3}
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Exemplo:&#10;012.345.678-90	KAUAI@16740&#10;987.654.321-00	16690"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={handleParsePastedText}
                disabled={!pastedText.trim()}
                className="w-full rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white py-1.5 text-xs font-bold transition-colors disabled:opacity-40"
              >
                Processar Texto Colado
              </button>
            </div>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 3: Parsed Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Pré-visualização da Importação ({parsedRows.length} linhas)
                </h3>

                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {validCount} Válidos
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      {invalidCount} Inválidos
                    </span>
                  )}
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-2">Linha</th>
                      <th className="px-3 py-2">CPF Informado</th>
                      <th className="px-3 py-2">CPF Formatado</th>
                      <th className="px-3 py-2">Parceiro Resolvido</th>
                      <th className="px-3 py-2">Validação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {parsedRows.map(row => (
                      <tr
                        key={row.rowIndex}
                        className={
                          row.status === 'INVALID'
                            ? 'bg-rose-50/50 dark:bg-rose-950/20'
                            : row.status === 'WARNING'
                            ? 'bg-amber-50/50 dark:bg-amber-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="px-3 py-2 text-slate-400 font-mono">{row.rowIndex}</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {row.cpf || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-blue-600">
                          {row.cleanCpf ? formatCpf(row.cleanCpf) : '-'}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">
                          {row.matchedPartner
                            ? `${row.matchedPartner.login} (${row.matchedPartner.fullName})`
                            : row.partnerIdentifier || '-'}
                        </td>
                        <td className="px-3 py-2">
                          {row.status === 'VALID' && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> OK
                            </span>
                          )}
                          {row.status === 'WARNING' && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold" title={row.statusMessage}>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {row.statusMessage}
                            </span>
                          )}
                          {row.status === 'INVALID' && (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold" title={row.statusMessage}>
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {row.statusMessage}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={importing || validCount === 0}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>
              {importing
                ? 'Importando...'
                : `Confirmar e Cadastrar ${validCount} Simulação(ões)`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
