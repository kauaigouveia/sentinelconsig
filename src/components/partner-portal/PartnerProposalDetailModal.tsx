import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Building2,
  Coins,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  DollarSign,
  Layers,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { PartnerPortalClient, PartnerProposalDetailData } from '../../services/partnerPortalClient';
import { formatCurrency } from '../../lib/utils';

interface PartnerProposalDetailModalProps {
  proposalId: string | null;
  onClose: () => void;
  onOpenChatForProposal: (proposalId: string, proposalNumber: string) => void;
}

export const PartnerProposalDetailModal: React.FC<PartnerProposalDetailModalProps> = ({
  proposalId,
  onClose,
  onOpenChatForProposal,
}) => {
  const [data, setData] = useState<PartnerProposalDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!proposalId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setData(null);

    PartnerPortalClient.getProposalDetail(proposalId)
      .then((res) => {
        if (isMounted) setData(res);
      })
      .catch((err) => {
        if (isMounted) setError(err?.message || 'Erro ao carregar proposta.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [proposalId, retryCount]);

  if (!proposalId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in select-none">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                  #{data?.proposalNumber || '...'}
                </span>
                {data && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                    style={{
                      backgroundColor: `${data.statusColor}15`,
                      color: data.statusColor,
                      border: `1px solid ${data.statusColor}30`,
                    }}
                  >
                    {data.statusName}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Detalhes e acompanhamento do contrato</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="h-8 w-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-slate-400 font-medium">Carregando detalhes...</span>
            </div>
          ) : error || !data ? (
            <div role="alert" className="flex flex-col items-center gap-4 p-6 text-center text-rose-400 font-semibold bg-rose-500/10 rounded-xl border border-rose-500/20">
              <span>{error || 'Proposta não encontrada ou acesso restrito.'}</span>
              {error && (
                <button
                  type="button"
                  onClick={() => setRetryCount(count => count + 1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 transition hover:bg-rose-500/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Client & Bank Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Proponente / Cliente
                  </span>
                  <p className="text-sm font-black text-slate-900 dark:text-white truncate">{data.clientName}</p>
                  <p className="text-xs font-mono text-slate-500">CPF: {data.clientCpfMasked}</p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Instituição Financeira & Produto
                  </span>
                  <p className="text-sm font-black text-slate-900 dark:text-white truncate">{data.bankName}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {data.productName} {data.convenioName ? `• ${data.convenioName}` : ''}
                  </p>
                </div>
              </div>

              {/* Financial Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Volume Contrato</span>
                  <span className="text-sm font-mono font-black text-slate-900 dark:text-white">
                    {formatCurrency(data.contractValue)}
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
                  <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">
                    Líquido Liberado
                  </span>
                  <span className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(data.releasedValue)}
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Parcela / Prazo</span>
                  <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">
                    {data.installmentsCount}x de {formatCurrency(data.installmentValue)}
                  </span>
                </div>
              </div>

              {/* Portability CIP Box (if applicable) */}
              {(data.debtBalance !== null || data.cipNumber || data.originalBankCode) && (
                <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-bold text-xs">
                    <Layers className="h-4 w-4" />
                    <span>Dados de Portabilidade (CIP)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-purple-600/80 dark:text-purple-400 block">Banco Originador:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {data.originalBankCode || 'Não informado'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-600/80 dark:text-purple-400 block">Nº CIP:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {data.cipNumber || 'Em emissão'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-600/80 dark:text-purple-400 block">Saldo Devedor:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {data.debtBalance ? formatCurrency(data.debtBalance) : 'Aguardando'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline Amigável */}
              <div className="space-y-3">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                  Linha do Tempo da Proposta
                </span>

                <div className="space-y-3 border-l-2 border-slate-200 dark:border-slate-800 ml-2 pl-4">
                  {data.timeline.map((step, idx) => (
                    <div key={step.id || idx} className="relative">
                      <div
                        className={`absolute -left-[23px] top-0.5 h-3.5 w-3.5 rounded-full border-2 ${
                          step.completed
                            ? 'bg-blue-600 border-white dark:border-slate-900 shadow-xs ring-2 ring-blue-500/20'
                            : 'bg-slate-300 dark:bg-slate-700 border-white dark:border-slate-900'
                        }`}
                      />
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-900 dark:text-white text-xs">{step.title}</p>
                          {step.date && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(step.date).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pendências Abertas / Histórico */}
              {data.pendencies.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                    Pendências & Regularizações ({data.pendencies.length})
                  </span>
                  <div className="space-y-1.5">
                    {data.pendencies.map((pen) => (
                      <div
                        key={pen.id}
                        className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100 mb-0.5">
                          <span>{pen.title}</span>
                          <span
                            className={`text-[9.5px] font-black uppercase px-1.5 py-0.2 rounded ${
                              pen.status === 'RESOLVIDA'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-amber-500/10 text-amber-500'
                            }`}
                          >
                            {pen.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{pen.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {data && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={() => onOpenChatForProposal(data.id, data.proposalNumber)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors cursor-pointer shadow-xs"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Falar sobre esta proposta</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
