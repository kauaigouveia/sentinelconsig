import React, { useState, useEffect } from 'react';
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
  Loader2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { extractPartnerCode } from '../../lib/utils';
import { Partner, Promoter } from '../../types';
import { RealtimeService } from '../../services/realtimeService';

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
  const [promoters, setPromoters] = useState<Promoter[]>(() => StorageService.getPromoters());
  const [existingPartners, setExistingPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [partnersLoadFailed, setPartnersLoadFailed] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [existingLoginsSet, setExistingLoginsSet] = useState<Set<string>>(new Set());

  const [defaultPromoterId, setDefaultPromoterId] = useState<string>(promoters[0]?.id || '');
  const [pastedText, setPastedText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedPartnerRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/promoters')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setPromoters(data);
          setDefaultPromoterId(prev => (prev && data.some(p => p.id === prev) ? prev : data[0].id));
        }
      })
      .catch(err => console.warn('[PartnerImportModal] Erro ao carregar promotoras:', err));

    const fetchExistingPartners = async () => {
      setLoadingPartners(true);
      setPartnersLoadFailed(false);
      setErrorMsg(prev => prev === 'Não foi possível carregar os parceiros existentes. Tente novamente.' ? null : prev);
      try {
        const res = await fetch('/api/partners', {
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setExistingPartners(data);
            const logins = new Set<string>();
            data.forEach(p => {
              if (p && p.login) {
                logins.add(String(p.login).trim().toUpperCase());
              }
            });
            setExistingLoginsSet(logins);
            setPartnersLoadFailed(false);
          } else {
            throw new Error('Formato inválido retornado pelo servidor.');
          }
        } else {
          throw new Error(`Erro HTTP: ${res.status}`);
        }
      } catch (err) {
        console.error('[PartnerImportModal] Erro ao carregar parceiros existentes:', err);
        setPartnersLoadFailed(true);
        setErrorMsg('Não foi possível carregar os parceiros existentes. Tente novamente.');
      } finally {
        setLoadingPartners(false);
      }
    };

    fetchExistingPartners();
  }, [isOpen, retryTrigger]);

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

      let fullName = String(rawFullName ?? '').trim().toUpperCase();
      let login = String(rawLogin ?? '').trim().toUpperCase();

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

      const extractedCode = login;

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
    if (loadingPartners) return;
    if (partnersLoadFailed) {
      setErrorMsg('Não foi possível carregar os parceiros existentes. Tente novamente.');
      return;
    }
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

        const { default: ExcelJS } = await import('exceljs');
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
          setErrorMsg('A planilha selecionada está vazia ou sem cabeçalhos reconhecíveis.');
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

  // Handle Raw Copy/Paste text
  const handleParsePastedText = () => {
    if (loadingPartners) return;
    if (partnersLoadFailed) {
      setErrorMsg('Não foi possível carregar os parceiros existentes. Tente novamente.');
      return;
    }
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
  const handleDownloadTemplate = async () => {
    const { default: ExcelJS } = await import('exceljs');
    const templateData = [
      { 'NOME COMPLETO': 'KAUAI AMORIM GOUVEIA', 'LOGIN': 'KAUAI@16740', 'PROMOTORA': 'DG' },
      { 'NOME COMPLETO': 'FRANCISCO DA SILVA', 'LOGIN': 'FRANCO@16690', 'PROMOTORA': 'DG' },
      { 'NOME COMPLETO': 'FOX AGENTE FINANCEIRO', 'LOGIN': 'FOX@16715', 'PROMOTORA': 'PROSPECTA' },
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Parceiros');
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
    link.download = 'MODELO_IMPORTACAO_PARCEIROS.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (loadingPartners) return;
    if (partnersLoadFailed) {
      setErrorMsg('Não foi possível carregar os parceiros existentes. Tente novamente.');
      return;
    }
    const validItems = parsedRows
      .filter(r => r.status === 'VALID' || r.status === 'WARNING')
      .map(r => ({
        fullName: r.fullName,
        login: r.login,
        promoterName: r.promoterName,
      }));

    if (validItems.length === 0) {
      setErrorMsg('Não existem registros válidos prontos para importação.');
      return;
    }

    setImporting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/import/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileName: 'importacao_parceiros.xlsx',
          fileSize: 0,
          rows: validItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao processar importação de parceiros.');
      }

      setSuccessMsg(`Importação enfileirada com sucesso no servidor! ${validItems.length} parceiros em processamento.`);
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
              <Upload className={`h-8 w-8 mb-2 ${loadingPartners || partnersLoadFailed ? 'text-slate-400' : 'text-blue-500'}`} />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Selecione uma planilha de parceiros
              </p>
              <p className="text-[10px] text-slate-500 mb-3">Formatos suportados: .XLSX, .CSV</p>
              <label className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors ${loadingPartners || partnersLoadFailed ? 'bg-slate-400 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}>
                <span>{loadingPartners ? 'Carregando parceiros existentes...' : 'Escolher Arquivo'}</span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileUpload}
                  disabled={loadingPartners || partnersLoadFailed}
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
                disabled={loadingPartners || partnersLoadFailed}
                placeholder="Exemplo:&#10;KAUAI AMORIM	KAUAI@16740	DG&#10;FOX AGENTE	FOX@16715	PROSPECTA"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-hidden disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleParsePastedText}
                disabled={loadingPartners || partnersLoadFailed || !pastedText.trim()}
                className="w-full rounded-lg bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white py-1.5 text-xs font-bold transition-colors disabled:opacity-40"
              >
                {loadingPartners ? 'Carregando parceiros existentes...' : 'Processar Texto Colado'}
              </button>
            </div>

          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              {partnersLoadFailed && (
                <button
                  type="button"
                  onClick={() => setRetryTrigger(prev => prev + 1)}
                  className="px-2.5 py-1 text-[10px] font-bold bg-rose-100 hover:bg-rose-200 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-800 dark:text-rose-200 rounded transition-colors cursor-pointer shrink-0"
                >
                  Tentar Novamente
                </button>
              )}
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
            disabled={loadingPartners || partnersLoadFailed || importing || validCount === 0}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {loadingPartners ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Handshake className="h-4 w-4" />
            )}
            <span>
              {loadingPartners
                ? 'Carregando parceiros existentes...'
                : partnersLoadFailed
                ? 'Carregamento de parceiros falhou'
                : importing
                ? 'Importando...'
                : `Confirmar e Cadastrar ${validCount} Parceiro(s)`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
