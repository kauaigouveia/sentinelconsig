import React, { useState } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Sliders,
  CheckSquare,
  Square,
  FileText,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { ExcelService } from '../../services/excelService';
import { Proposal } from '../../types';
import { toastService } from '../ui/toastService';
import { StorageService } from '../../services/storageService';

interface ExcelExportModalProps {
  isOpen: boolean;
  proposals: Proposal[];
  onClose: () => void;
}

export const ExcelExportModal: React.FC<ExcelExportModalProps> = ({
  isOpen,
  proposals,
  onClose,
}) => {
  const [exportType, setExportType] = useState<'PADRAO' | 'PERSONALIZADO'>('PERSONALIZADO');
  const [fileFormat, setFileFormat] = useState<'XLSX' | 'CSV'>('XLSX');
  const [standardProductId, setStandardProductId] = useState('TODOS');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const availableColumns = [
    { key: 'ADE', label: 'ADE / Nº Proposta', category: 'Identificação' },
    { key: 'CPF', label: 'CPF do Cliente (Formatado)', category: 'Cliente' },
    { key: 'CPF_RAW', label: 'CPF sem formatação (apenas dígitos)', category: 'Cliente' },
    { key: 'NOME', label: 'Nome do Cliente', category: 'Cliente' },
    { key: 'TELEFONE', label: 'Telefone / WhatsApp', category: 'Cliente' },
    { key: 'EMAIL', label: 'E-mail do Cliente', category: 'Cliente' },
    { key: 'CODIGO_PARCEIRO', label: 'Código do Parceiro (16740)', category: 'Parceiro' },
    { key: 'PARCEIRO', label: 'Nome do Parceiro', category: 'Parceiro' },
    { key: 'LOGIN', label: 'Login do Parceiro (NOME@16740)', category: 'Parceiro' },
    { key: 'PRODUTO', label: 'Produto', category: 'Operação' },
    { key: 'BANCO', label: 'Banco Destino', category: 'Operação' },
    { key: 'PROMOTORA', label: 'Promotora de Vínculo', category: 'Operação' },
    { key: 'STATUS', label: 'Status Atual da Esteira', category: 'Esteira' },
    { key: 'ALCADA', label: 'Alçada de Responsabilidade', category: 'Esteira' },
    { key: 'VALOR_LIBERADO', label: 'Valor Liberado Cliente (R$)', category: 'Financeiro' },
    { key: 'SALDO_CONTRATO', label: 'Saldo Contrato / Quitação (R$)', category: 'Financeiro' },
    { key: 'VALOR_CONTRATO', label: 'Valor do Contrato (R$)', category: 'Financeiro' },
    { key: 'VALOR_PARCELA', label: 'Valor da Parcela (R$)', category: 'Financeiro' },
    { key: 'PRAZO', label: 'Prazo / Parcelas', category: 'Financeiro' },
    { key: 'DIGITADOR', label: 'Digitador Responsável', category: 'Operação' },
    { key: 'OBSERVACOES', label: 'Última Observação', category: 'Operação' },
    { key: 'DATA', label: 'Data de Cadastro', category: 'Auditoria' },
    { key: 'DATA_ATUALIZACAO', label: 'Data de Última Atualização', category: 'Auditoria' },
  ];

  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'ADE',
    'CPF',
    'NOME',
    'PRODUTO',
    'BANCO',
    'PROMOTORA',
    'CODIGO_PARCEIRO',
    'STATUS',
    'ALCADA',
    'VALOR_LIBERADO',
    'SALDO_CONTRATO',
    'VALOR_PARCELA',
    'PRAZO',
    'DIGITADOR',
    'DATA',
  ]);

  if (!isOpen) return null;

  const columnsCount = availableColumns.length;
  const activeProducts = StorageService.getProducts().filter(product => product.active);
  const selectedStandardProduct = activeProducts.find(product => product.id === standardProductId);
  const proposalsForExport = exportType === 'PADRAO' && selectedStandardProduct
    ? proposals.filter(proposal => proposal.productId === selectedStandardProduct.id)
    : proposals;

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    setSelectedColumns(availableColumns.map(c => c.key));
  };

  const handleSelectNone = () => {
    setSelectedColumns([]);
  };

  const handleApplyPreset = (preset: 'ESSENCIAL' | 'FINANCEIRO' | 'COMPLETO') => {
    if (preset === 'ESSENCIAL') {
      setSelectedColumns(['ADE', 'CPF', 'NOME', 'PRODUTO', 'BANCO', 'CODIGO_PARCEIRO', 'STATUS', 'DATA']);
    } else if (preset === 'FINANCEIRO') {
      setSelectedColumns([
        'ADE',
        'CPF',
        'NOME',
        'PRODUTO',
        'BANCO',
        'VALOR_CONTRATO',
        'VALOR_PARCELA',
        'PRAZO',
        'STATUS',
        'DIGITADOR',
      ]);
    } else if (preset === 'COMPLETO') {
      setSelectedColumns(availableColumns.map(c => c.key));
    }
  };

  const handleExport = async () => {
    if (isExporting || downloadSuccess) return;
    if (proposalsForExport.length === 0) {
      toastService.info('Sem propostas para exportar', 'Altere os filtros da produção e tente novamente.');
      return;
    }
    try {
      setIsExporting(true);
      if (exportType === 'PADRAO') {
        const { fileName } = await ExcelService.exportStandard(
          proposalsForExport,
          selectedStandardProduct?.name || 'TODOS'
        );
        setDownloadSuccess(`Arquivo padrão gerado com sucesso: ${fileName}`);
      } else {
        if (selectedColumns.length === 0) {
          toastService.warning('Selecione as colunas', 'Marque ao menos uma coluna para gerar o arquivo.');
          return;
        }

        const { fileName } = await ExcelService.exportCustom(
          proposalsForExport,
          selectedColumns,
          `Personalizado | ${selectedColumns.length} colunas | Formato ${fileFormat}`,
          fileFormat
        );
        setDownloadSuccess(`Relatório personalizado (${fileFormat}) gerado: ${fileName}`);
      }
      setTimeout(() => {
        setDownloadSuccess(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      toastService.error('Falha na exportação', err.message || 'Não foi possível gerar o arquivo.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] px-6 py-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[var(--success-bg)] text-[var(--success-text)] flex items-center justify-center shadow-xs">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Exportação de Propostas e Produção</h3>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                {proposalsForExport.length} proposta(s) prontas para download
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Export Type Switcher */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setExportType('PADRAO')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                exportType === 'PADRAO'
                  ? 'border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold shadow-2xs'
                  : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 text-xs mb-1 text-[var(--success-text)] dark:text-[var(--success-text)]">
                <FileSpreadsheet className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)]" />
                <span>Layout Padrão Bancário</span>
              </div>
              <p className="text-[11px] font-normal text-[var(--text-secondary)] dark:text-[var(--text-secondary)] leading-relaxed">
                Colunas essenciais para importação bancária: <strong>ADE | CPF | CÓDIGO DO PARCEIRO | DATA</strong>
              </p>
            </button>

            <button
              onClick={() => setExportType('PERSONALIZADO')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                exportType === 'PERSONALIZADO'
                  ? 'border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] font-bold shadow-2xs'
                  : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 text-xs mb-1 text-[var(--link)] dark:text-[var(--link)]">
                <Sliders className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
                <span>Exportação Seletiva Personalizada</span>
              </div>
              <p className="text-[11px] font-normal text-[var(--text-secondary)] dark:text-[var(--text-secondary)] leading-relaxed">
                Escolha exatamente quais colunas financeiras, operacionais e de esteira incluir.
              </p>
            </button>
          </div>

          {/* Format selection (.xlsx vs .csv) */}
          {exportType === 'PERSONALIZADO' ? <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Formato de Saída:</span>
              <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">Compatível com Excel, Google Sheets e PowerBI</span>
            </div>

            <div className="flex rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] p-0.5">
              <button
                type="button"
                onClick={() => setFileFormat('XLSX')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  fileFormat === 'XLSX'
                    ? 'bg-[var(--success-bg)] text-[var(--text-primary)] shadow-2xs'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
              >
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setFileFormat('CSV')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  fileFormat === 'CSV'
                    ? 'bg-[var(--success-bg)] text-[var(--text-primary)] shadow-2xs'
                    : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
                }`}
              >
                CSV (.csv)
              </button>
            </div>
          </div> : <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <Info className="h-4 w-4 text-[var(--text-secondary)]" />
            <span>O layout bancário é gerado em Excel (.xlsx).</span>
          </div>}

          {exportType === 'PADRAO' ? (
            <div className="space-y-3">
            <label className="flex flex-col gap-1.5 rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] p-4 text-xs text-[var(--success-text)] sm:flex-row sm:items-center sm:justify-between dark:border-[var(--success-border)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]">
              <span className="font-bold">Produto para o arquivo bancário</span>
              <select
                value={standardProductId}
                onChange={event => setStandardProductId(event.target.value)}
                className="min-h-9 rounded-lg border border-[var(--success-border)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-secondary)] outline-none focus:border-[var(--success-border)] dark:border-[var(--success-border)] dark:bg-[var(--bg-surface)] dark:text-[var(--text-primary)]"
              >
                <option value="TODOS">Todos os produtos</option>
                {activeProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <div className="rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] p-4 space-y-2.5 text-xs text-[var(--success-text)]">
              <div className="flex items-center gap-2 font-bold text-[var(--success-text)]">
                <Info className="h-4 w-4 text-[var(--success-text)]" />
                <span>Regras de Integridade e Formatação Padrão:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1.5 text-[11px] leading-relaxed">
                <li>O código do parceiro reflete exatamente o login/identificador cadastrado no sistema (ex: <em>KAUAI@16740</em>, <em>AL15963</em>, <em>16740</em>).</li>
                <li>Gera o arquivo no formato <code>PROPOSTAS_PORTABILIDADE_AAAA-MM-DD.xlsx</code>.</li>
                <li>Registrado de forma imutável na trilha de auditoria e logs de exportação.</li>
              </ul>
            </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Presets and Quick Selection Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--field-border)] pb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-[var(--text-secondary)] mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('ESSENCIAL')}
                    className="px-2 py-0.5 rounded border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[11px] font-semibold text-[var(--text-secondary)]"
                  >
                    Operacional Básico
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('FINANCEIRO')}
                    className="px-2 py-0.5 rounded border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[11px] font-semibold text-[var(--text-secondary)]"
                  >
                    Financeiro & Crédito
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('COMPLETO')}
                    className="px-2 py-0.5 rounded border border-[var(--field-border)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] text-[11px] font-semibold text-[var(--text-secondary)]"
                  >
                    Auditoria Completa
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[var(--link)] hover:underline font-semibold"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-[var(--text-primary)]">|</span>
                  <button
                    type="button"
                    onClick={handleSelectNone}
                    className="text-[var(--text-secondary)] hover:underline"
                  >
                    Desmarcar
                  </button>
                  <span className="rounded-full bg-[var(--info-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--link)] border border-[var(--field-border)]">
                    {selectedColumns.length} de {columnsCount} selecionadas
                  </span>
                </div>
              </div>

              {/* Column Selection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-[var(--field-border)] rounded-xl bg-[var(--bg-canvas)]">
                {availableColumns.map(col => {
                  const isChecked = selectedColumns.includes(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleColumn(col.key)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-colors ${
                        isChecked
                          ? 'bg-[var(--bg-surface)] border-[var(--field-border)] text-[var(--text-secondary)] shadow-2xs'
                          : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-[var(--link)] shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--text-primary)] shrink-0" />
                        )}
                        <span className={isChecked ? 'font-bold text-[var(--text-secondary)] truncate' : 'text-[var(--text-secondary)] truncate'}>
                          {col.label}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] shrink-0">
                        {col.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {downloadSuccess && (
            <div className="rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] p-3 text-xs text-[var(--success-text)] flex items-center gap-2 shadow-xs">
              <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] shrink-0" />
              <span className="font-semibold">{downloadSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--field-border)] dark:border-[var(--field-border)] px-6 py-3.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] rounded-b-2xl shrink-0">
          <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
            {exportType === 'PADRAO' ? '4 colunas bancárias' : `${selectedColumns.length} colunas selecionadas`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-download-excel"
              onClick={handleExport}
              disabled={isExporting || Boolean(downloadSuccess) || proposalsForExport.length === 0}
              className="rounded-lg bg-[var(--success-bg)] hover:bg-[var(--success-bg)] px-5 py-2 text-xs font-bold text-[var(--success-text)] transition-colors flex items-center gap-2  cursor-pointer disabled:cursor-not-allowed disabled:opacity-90"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? 'Gerando arquivo…' : `Baixar Arquivo ${exportType === 'PADRAO' || fileFormat === 'XLSX' ? 'Excel (.xlsx)' : 'CSV (.csv)'}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
