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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--scrim)] backdrop-blur-xs animate-in fade-in select-none">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center font-bold">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
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
              <p className="text-[11px] text-[var(--text-secondary)] font-medium">Detalhes e acompanhamento do contrato</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="h-8 w-8 border-3 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
              <span className="text-[var(--text-secondary)] font-medium">Carregando detalhes...</span>
            </div>
          ) : error || !data ? (
            <div role="alert" className="flex flex-col items-center gap-4 p-6 text-center text-[var(--danger-text)] font-semibold bg-[var(--danger-bg)] rounded-xl border border-[var(--danger-border)]">
              <span>{error || 'Proposta não encontrada ou acesso restrito.'}</span>
              {error && (
                <button
                  type="button"
                  onClick={() => setRetryCount(count => count + 1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger-text)] transition hover:bg-[var(--danger-bg)]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Client & Bank Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                    Proponente / Cliente
                  </span>
                  <p className="text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">{data.clientName}</p>
                  <p className="text-xs font-mono text-[var(--text-secondary)]">CPF: {data.clientCpfMasked}</p>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                    Instituição Financeira & Produto
                  </span>
                  <p className="text-sm font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">{data.bankName}</p>
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {data.productName} {data.convenioName ? `• ${data.convenioName}` : ''}
                  </p>
                </div>
              </div>

              {/* Financial Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]">
                  <span className="text-[10px] font-bold uppercase text-[var(--text-secondary)] block">Volume Contrato</span>
                  <span className="text-sm font-mono font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    {formatCurrency(data.contractValue)}
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)]">
                  <span className="text-[10px] font-bold uppercase text-[var(--success-text)] dark:text-[var(--success-text)] block">
                    Líquido Liberado
                  </span>
                  <span className="text-sm font-mono font-black text-[var(--success-text)] dark:text-[var(--success-text)]">
                    {formatCurrency(data.releasedValue)}
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold uppercase text-[var(--text-secondary)] block">Parcela / Prazo</span>
                  <span className="text-sm font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    {data.installmentsCount}x de {formatCurrency(data.installmentValue)}
                  </span>
                </div>
              </div>

              {/* Portability CIP Box (if applicable) */}
              {(data.debtBalance !== null || data.cipNumber || data.originalBankCode) && (
                <div className="p-3.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] space-y-2">
                  <div className="flex items-center gap-1.5 text-[var(--link)] dark:text-[var(--link)] font-bold text-xs">
                    <Layers className="h-4 w-4" />
                    <span>Dados de Portabilidade (CIP)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-[var(--link)] dark:text-[var(--link)] block">Banco Originador:</span>
                      <span className="font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {data.originalBankCode || 'Não informado'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--link)] dark:text-[var(--link)] block">Nº CIP:</span>
                      <span className="font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {data.cipNumber || 'Em emissão'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--link)] dark:text-[var(--link)] block">Saldo Devedor:</span>
                      <span className="font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {data.debtBalance ? formatCurrency(data.debtBalance) : 'Aguardando'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline Amigável */}
              <div className="space-y-3">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-[var(--text-secondary)] block">
                  Linha do Tempo da Proposta
                </span>

                <div className="space-y-3 border-l-2 border-[var(--field-border)] dark:border-[var(--field-border)] ml-2 pl-4">
                  {data.timeline.map((step, idx) => (
                    <div key={step.id || idx} className="relative">
                      <div
                        className={`absolute -left-[23px] top-0.5 h-3.5 w-3.5 rounded-full border-2 ${
                          step.completed
                            ? 'bg-[var(--info-bg)] border-[var(--field-border)] dark:border-[var(--field-border)]  ring-2 ring-[var(--focus)]'
                            : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] border-[var(--field-border)] dark:border-[var(--field-border)]'
                        }`}
                      />
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs">{step.title}</p>
                          {step.date && (
                            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                              {new Date(step.date).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pendências Abertas / Histórico */}
              {data.pendencies.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-[var(--warning-text)] dark:text-[var(--warning-text)] block">
                    Pendências & Regularizações ({data.pendencies.length})
                  </span>
                  <div className="space-y-1.5">
                    {data.pendencies.map((pen) => (
                      <div
                        key={pen.id}
                        className="p-2.5 rounded-lg border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-xs"
                      >
                        <div className="flex items-center justify-between font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-0.5">
                          <span>{pen.title}</span>
                          <span
                            className={`text-[9.5px] font-black uppercase px-1.5 py-0.2 rounded ${
                              pen.status === 'RESOLVIDA'
                                ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                                : 'bg-[var(--warning-bg)] text-[var(--warning-text)]'
                            }`}
                          >
                            {pen.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{pen.description}</p>
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
          <div className="p-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] flex items-center justify-between gap-3 shrink-0">
            <button
              onClick={() => onOpenChatForProposal(data.id, data.proposalNumber)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold transition-colors cursor-pointer shadow-xs"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Falar sobre esta proposta</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
