import React, { useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Building,
  Handshake,
  Download,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { StorageService } from '../../services/storageService';
import { extractPartnerCode } from '../../lib/utils';
import { Partner, Promoter } from '../../types';

interface PartnerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportCompleted: () => void;
}

interface ParsedPartnerRow {
  rowIndex: number;
  fullName: string;
  login: string;
  promoterName: string;
  promoterId: string;
  extractedCode: string;
  status: 'VALID' | 'WARNING' | 'INVALID';
  statusMessage: string;
}

export const PartnerImportModal: React.FC<PartnerImportModalProps> = ({
  isOpen,
  onClose,
  onImportCompleted,
}) => {
  const promoters = StorageService.getPromoters();
  const existingPartners = StorageService.getPartners();
  const existingLoginsSet = new Set(existingPartners.map(p => p.login.toUpperCase()));

  const [defaultPromoterId, setDefaultPromoterId] = useState<string>(promoters[0]?.id || '');
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedPartnerRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Process raw objects into parsed partner rows
  const processRawData = (rowsData: any[]) => {
    const defaultPromoter = promoters.find(pr => pr.id === defaultPromoterId) || promoters[0];

    const results: ParsedPartnerRow[] = [];
    const seenLoginsInFile = new Set<string>();

    rowsData.forEach((row, idx) => {
      // Auto-detect columns
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

      const rawFullName = findVal(['nome', 'parceiro', 'razao', 'full', 'completo']) || (Array.isArray(row) ? String(row[0] || '') : '');
      let rawLogin = findVal(['login', 'codigo', 'código', 'code', 'id', 'user']) || (Array.isArray(row) ? String(row[1] || '') : '');
      const rawPromoter = findVal(['promotora', 'vinculo', 'vínculo', 'promoter']) || (Array.isArray(row) ? String(row[2] || '') : '');

      let fullName = rawFullName.trim().toUpperCase();
      let login = rawLogin.trim().toUpperCase();

      let status: 'VALID' | 'WARNING' | 'INVALID' = 'VALID';
      let statusMessage = 'Pronto para cadastro';

      if (!fullName) {
        status = 'INVALID';
        statusMessage = 'Nome completo é obrigatório.';
      } else if (!login) {
        status = 'INVALID';
        statusMessage = 'Login/Código é obrigatório.';
      } else {
        // Check if login lacks @ (e.g., "16740" or "KAUAI")
        if (!login.includes('@')) {
          const namePrefix = fullName.split(' ')[0] || 'PARCEIRO';
          const previousLogin = login;
          login = `${namePrefix}@${login}`;
          status = 'WARNING';
          statusMessage = `Login ajustado automaticamente de '${previousLogin}' para '${login}'`;
        }

        if (existingLoginsSet.has(login)) {
          status = 'INVALID';
          statusMessage = `O login '${login}' já está cadastrado no sistema.`;
        } else if (seenLoginsInFile.has(login)) {
          status = 'INVALID';
          statusMessage = `O login '${login}' está duplicado no próprio arquivo de importação.`;
        } else {
          seenLoginsInFile.add(login);
        }
      }

      // Resolve promoter
      let targetPromoterId = defaultPromoterId;
      let targetPromoterName = defaultPromoter?.name || 'Geral';

      if (rawPromoter) {
        const matched = promoters.find(
          p => p.name.toUpperCase().includes(rawPromoter.toUpperCase()) || rawPromoter.toUpperCase().includes(p.name.toUpperCase())
        );
        if (matched) {
          targetPromoterId = matched.id;
          targetPromoterName = matched.name;
        }
      }

      const extractedCode = extractPartnerCode(login);

      results.push({
        rowIndex: idx + 1,
        fullName,
        login,
        promoterName: targetPromoterName,
        promoterId: targetPromoterId,
        extractedCode,
        status,
        statusMessage,
      });
    });

    setParsedRows(results);
  };

  // Handle XLSX / CSV File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson = XLSX.utils.sheet_to_json(ws);
        if (rawJson.length === 0) {
          setErrorMsg('A planilha selecionada está vazia ou sem cabeçalhos reconhecíveis.');
          return;
        }
        processRawData(rawJson);
      } catch (err: any) {
        setErrorMsg('Erro ao ler a planilha: ' + (err.message || 'Arquivo inválido.'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Handle Raw Copy/Paste text
  const handleParsePastedText = () => {
    if (!pastedText.trim()) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const lines = pastedText.trim().split('\n').filter(l => l.trim().length > 0);
    const rowsJson = lines.map(line => {
      const parts = line.split(/[\t,;]/).map(p => p.trim());
      return {
        fullName: parts[0] || '',
        login: parts[1] || '',
        promoterName: parts[2] || '',
      };
    });

    processRawData(rowsJson);
  };

  // Download Example CSV Template
  const handleDownloadTemplate = () => {
    const templateData = [
      { 'NOME COMPLETO': 'KAUAI AMORIM GOUVEIA', 'LOGIN': 'KAUAI@16740', 'PROMOTORA': 'DG' },
      { 'NOME COMPLETO': 'FRANCISCO DA SILVA', 'LOGIN': 'FRANCO@16690', 'PROMOTORA': 'DG' },
      { 'NOME COMPLETO': 'FOX AGENTE FINANCEIRO', 'LOGIN': 'FOX@16715', 'PROMOTORA': 'PROSPECTA' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parceiros');
    XLSX.writeFile(wb, 'MODELO_IMPORTACAO_PARCEIROS.xlsx');
  };

  // Confirm Import
  const handleConfirmImport = () => {
    const validItems = parsedRows
      .filter(r => r.status === 'VALID' || r.status === 'WARNING')
      .map(r => ({
        fullName: r.fullName,
        login: r.login,
        promoterId: r.promoterId,
      }));

    if (validItems.length === 0) {
      setErrorMsg('Não existem registros válidos prontos para importação.');
      return;
    }

    setImporting(true);
    try {
      const res = StorageService.createPartnersBatch(validItems);
      setSuccessMsg(`Sucesso! ${res.createdCount} parceiros cadastrados no sistema.`);
      setTimeout(() => {
        onImportCompleted();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao importar parceiros em lote.');
    } finally {
      setImporting(false);
    }
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
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Importar Parceiros Comerciais em Lote
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload de arquivos Excel (.xlsx, .csv) ou colar diretamente da planilha
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
          
          {/* Section 1: Default Promoter Fallback */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50/50 dark:bg-blue-950/30 p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/50">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                Promotora de Vínculo Padrão *
              </label>
              <select
                value={defaultPromoterId}
                onChange={e => setDefaultPromoterId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                {promoters.map(pr => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Utilizada quando a coluna 'Promotora' da planilha estiver vazia.
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

          {/* Section 2: Upload or Paste Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* File Upload Dropzone */}
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-5 text-center hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex flex-col items-center justify-center">
              <Upload className="h-8 w-8 text-blue-500 mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Selecione uma planilha de parceiros
              </p>
              <p className="text-[10px] text-slate-500 mb-3">Formatos suportados: .XLSX, .XLS, .CSV</p>
              <label className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white cursor-pointer shadow-xs transition-colors">
                <span>Escolher Arquivo</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste Raw Data */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Ou cole os dados (Nome [Tab] Login [Tab] Promotora):
              </label>
              <textarea
                rows={3}
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Exemplo:&#10;KAUAI AMORIM	KAUAI@16740	DG&#10;FOX AGENTE	FOX@16715	PROSPECTA"
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

          {/* Feedback messages */}
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
                      <th className="px-3 py-2">Nome Completo</th>
                      <th className="px-3 py-2">Login Informado</th>
                      <th className="px-3 py-2">Código Extraído</th>
                      <th className="px-3 py-2">Promotora</th>
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
                        <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">
                          {row.fullName || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {row.login || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-blue-600">
                          {row.extractedCode || '-'}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {row.promoterName}
                        </td>
                        <td className="px-3 py-2">
                          {row.status === 'VALID' && (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> OK
                            </span>
                          )}
                          {row.status === 'WARNING' && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold" title={row.statusMessage}>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Ajustado
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
            <Handshake className="h-4 w-4" />
            <span>
              {importing
                ? 'Importando...'
                : `Confirmar e Cadastrar ${validCount} Parceiro(s)`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
