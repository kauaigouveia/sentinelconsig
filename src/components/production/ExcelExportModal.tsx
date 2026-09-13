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
  if (!isOpen) return null;

  const [exportType, setExportType] = useState<'PADRAO' | 'PERSONALIZADO'>('PERSONALIZADO');
  const [fileFormat, setFileFormat] = useState<'XLSX' | 'CSV'>('XLSX');
  const [productFilterName, setProductFilterName] = useState('TODOS');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const availableColumns = [
    { key: 'ADE', label: 'ADE / Nº Proposta', category: 'Identificação' },
    { key: 'CPF', label: 'CPF do Cliente (Formatado)', category: 'Cliente' },
    { key: 'CPF_RAW', label: 'CPF Limpo (Apenas dígitos)', category: 'Cliente' },
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
    { key: 'SLA_HOURS', label: 'Tempo no Status (Horas)', category: 'Esteira' },
    { key: 'VALOR_LIBERADO', label: 'Valor Liberado Cliente (R$)', category: 'Financeiro' },
    { key: 'SALDO_CONTRATO', label: 'Saldo Contrato / Quitação (R$)', category: 'Financeiro' },
    { key: 'VALOR_CONTRATO', label: 'Valor do Contrato (R$)', category: 'Financeiro' },
    { key: 'VALOR_PARCELA', label: 'Valor da Parcela (R$)', category: 'Financeiro' },
    { key: 'PRAZO', label: 'Prazo / Parcelas', category: 'Financeiro' },
    { key: 'TAXA_JUROS', label: 'Taxa de Juros (% a.m.)', category: 'Financeiro' },
    { key: 'DIGITADOR', label: 'Digitador Responsável', category: 'Operação' },
    { key: 'OPERADOR', label: 'Operador / Criador', category: 'Operação' },
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
    'VALOR_CONTRATO',
    'OPERADOR',
    'DATA',
  ]);

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSelectAll = () => {
    setSelectedColumns(availableColumns.map(c => c.key));
  };

  const handleSelectNone = () => {
    setSelectedColumns(['ADE', 'CPF']);
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
        'TAXA_JUROS',
        'STATUS',
        'OPERADOR',
      ]);
    } else if (preset === 'COMPLETO') {
      setSelectedColumns(availableColumns.map(c => c.key));
    }
  };

  const handleExport = async () => {
    try {
      if (exportType === 'PADRAO') {
        const { fileName } = await ExcelService.exportStandard(proposals, productFilterName);
        setDownloadSuccess(`Arquivo padrão gerado com sucesso: ${fileName}`);
      } else {
        if (selectedColumns.length === 0) {
          alert('Por favor, selecione ao menos uma coluna para exportar.');
          return;
        }

        const { fileName } = await ExcelService.exportCustom(
          proposals,
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
      alert(err.message || 'Erro ao gerar arquivo de exportação.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Exportação de Propostas e Produção</h3>
              <p className="text-xs text-slate-500">
                {proposals.length} proposta(s) filtradas prontas para download
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
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
              className={`p-3.5 rounded-xl border text-left transition-all ${
                exportType === 'PADRAO'
                  ? 'border-emerald-500 bg-emerald-50/60 text-emerald-950 font-bold shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 text-xs mb-1 text-emerald-800">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Layout Padrão Bancário</span>
              </div>
              <p className="text-[11px] font-normal text-slate-500 leading-relaxed">
                Colunas essenciais para importação bancária: <strong>ADE | CPF | CÓDIGO DO PARCEIRO | DATA</strong>
              </p>
            </button>

            <button
              onClick={() => setExportType('PERSONALIZADO')}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                exportType === 'PERSONALIZADO'
                  ? 'border-blue-500 bg-blue-50/60 text-blue-950 font-bold shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 text-xs mb-1 text-blue-800">
                <Sliders className="h-4 w-4 text-blue-600" />
                <span>Exportação Seletiva Personalizada</span>
              </div>
              <p className="text-[11px] font-normal text-slate-500 leading-relaxed">
                Escolha exatamente quais colunas financeiras, operacionais e de esteira incluir.
              </p>
            </button>
          </div>

          {/* Format selection (.xlsx vs .csv) */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Formato de Saída:</span>
              <span className="text-[11px] text-slate-500">Compatível com Excel, Google Sheets e PowerBI</span>
            </div>

            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setFileFormat('XLSX')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  fileFormat === 'XLSX'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setFileFormat('CSV')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  fileFormat === 'CSV'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                CSV (.csv)
              </button>
            </div>
          </div>

          {exportType === 'PADRAO' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2.5 text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <Info className="h-4 w-4 text-emerald-600" />
                <span>Regras de Integridade e Formatação Padrão:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1.5 text-[11px] leading-relaxed">
                <li>O código do parceiro é isolado automaticamente pelo algoritmo <code>extractPartnerCode()</code> (ex: <em>KAUAI@16740</em> resulta estritamente em <strong>16740</strong>).</li>
                <li>Gera o arquivo no formato <code>PROPOSTAS_PORTABILIDADE_AAAA-MM-DD.xlsx</code>.</li>
                <li>Registrado de forma imutável na trilha de auditoria e logs de exportação.</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Presets and Quick Selection Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-700 mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('ESSENCIAL')}
                    className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700"
                  >
                    Operacional Básico
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('FINANCEIRO')}
                    className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700"
                  >
                    Financeiro & Crédito
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('COMPLETO')}
                    className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700"
                  >
                    Auditoria Completa
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-blue-600 hover:underline font-semibold"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleSelectNone}
                    className="text-slate-500 hover:underline"
                  >
                    Desmarcar
                  </button>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                    {selectedColumns.length} de {availableColumns.length} selecionadas
                  </span>
                </div>
              </div>

              {/* Column Selection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
                {availableColumns.map(col => {
                  const isChecked = selectedColumns.includes(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleColumn(col.key)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-colors ${
                        isChecked
                          ? 'bg-white border-blue-200 text-slate-900 shadow-2xs'
                          : 'bg-transparent border-transparent text-slate-500 hover:bg-white/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-blue-600 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300 shrink-0" />
                        )}
                        <span className={isChecked ? 'font-bold text-slate-800 truncate' : 'text-slate-600 truncate'}>
                          {col.label}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 shrink-0">
                        {col.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {downloadSuccess && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 shadow-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">{downloadSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3.5 bg-slate-50 rounded-b-2xl shrink-0">
          <span className="text-[11px] text-slate-500">
            {exportType === 'PADRAO' ? '4 colunas bancárias' : `${selectedColumns.length} colunas selecionadas`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-download-excel"
              onClick={handleExport}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white transition-colors flex items-center gap-2 shadow-xs"
            >
              <Download className="h-4 w-4" />
              <span>Baixar Arquivo {fileFormat === 'XLSX' ? 'Excel (.xlsx)' : 'CSV (.csv)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
