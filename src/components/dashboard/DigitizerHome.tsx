import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  FileSpreadsheet,
  Upload,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Eye,
  DollarSign,
  UserCheck,
  Zap,
  Filter,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCpf, formatDate, extractPartnerCode, formatCurrency } from '../../lib/utils';
import { Proposal, ProposalStatus } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { StatusBadge } from '../ui/StatusBadge';

interface DigitizerHomeProps {
  onOpenNewProduction?: () => void;
  onOpenImportExcel?: () => void;
  onOpenExport?: () => void;
}

export const DigitizerHome: React.FC<DigitizerHomeProps> = ({
  onOpenNewProduction,
  onOpenImportExcel,
  onOpenExport,
}) => {
  const activeUser = StorageService.getActiveUser();
  const allProposals = StorageService.getProposals();
  const clients = StorageService.getClients();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const partners = StorageService.getPartners();
  const [statuses, setStatuses] = useState<ProposalStatus[]>(() => StorageService.getStatuses());

  useEffect(() => {
    StorageService.fetchAndSyncStatuses().then(setStatuses).catch(() => {});
  }, []);

  const getEffectiveStatus = (p: Proposal) => {
    if ((p as any).status) return (p as any).status;
    if (!p.statusId) return null;
    return statuses.find(st => st.id === p.statusId || st.code === (p as any).status?.code) || null;
  };

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'TODAY' | 'PENDING' | 'PAID'>('ALL');

  // Filter proposals by this digitizer (or all if master)
  const myProposals = allProposals.filter(
    p => p.digitizerId === activeUser.id || activeUser.role === 'MASTER'
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const digitadasHoje = myProposals.filter(p => p.createdAt.startsWith(todayStr));
  const pendentesAnexo = myProposals.filter(p => {
    const s = getEffectiveStatus(p);
    return s?.code === 'PENDENTE_ANEXO_DOCUMENTACAO' || s?.code === 'PENDENCIA';
  });
  const pagas = myProposals.filter(p => {
    const s = getEffectiveStatus(p);
    return s?.code === 'PAGO';
  });

  const totalDisbursedHoje = digitadasHoje.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
  const totalDisbursedGeral = myProposals.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
  const totalDisbursedPago = pagas.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);

  const filteredList = myProposals.filter(p => {
    const client = clients.find(c => c.id === p.clientId);
    const matchSearch =
      !searchTerm ||
      p.proposalNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client?.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client?.cpf.includes(searchTerm);

    if (!matchSearch) return false;

    if (filterTab === 'TODAY') return p.createdAt.startsWith(todayStr);
    if (filterTab === 'PENDING') {
      const s = getEffectiveStatus(p);
      return s?.code === 'PENDENTE_ANEXO_DOCUMENTACAO' || s?.code === 'PENDENCIA';
    }
    if (filterTab === 'PAID') {
      const s = getEffectiveStatus(p);
      return s?.code === 'PAGO';
    }

    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <ActionBar
        title={`Minha Produção — Operador: ${activeUser.name}`}
        subtitle="Mesa ágil de digitação, conferência de anexos e esteira de envio bancário"
        badgeText="ESTEIRA DO DIGITADOR"
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
        actions={
          <div className="flex items-center gap-2">
            {onOpenImportExcel && <button
              onClick={onOpenImportExcel}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
              <span>Importar Planilha</span>
            </button>}

            {onOpenExport && <button
              onClick={onOpenExport}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[var(--success-text)] dark:text-[var(--success-text)]" />
              <span>Exportar</span>
            </button>}

            {onOpenNewProduction && <button
              onClick={onOpenNewProduction}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--success-bg)] hover:bg-[var(--success-bg)] px-4 py-2 text-xs font-bold text-[var(--success-text)]  transition-colors cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ Nova Produção</span>
            </button>}
          </div>
        }
      />

      {/* Operator Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          title="Digitadas Hoje"
          value={digitadasHoje.length}
          subtitle={`Volume: ${formatCurrency(totalDisbursedHoje)}`}
          icon={<Clock className="h-4 w-4 text-[var(--link)]" />}
          variant="primary"
        />

        <MetricCard
          title="Minha Produção Total"
          value={myProposals.length}
          subtitle={`Volume: ${formatCurrency(totalDisbursedGeral)}`}
          icon={<DollarSign className="h-4 w-4 text-[var(--text-secondary)]" />}
        />

        <MetricCard
          title="Pendentes de Anexo/Doc"
          value={pendentesAnexo.length}
          subtitle="Aguardando documentação"
          icon={<AlertCircle className="h-4 w-4 text-[var(--warning-text)]" />}
          variant="warning"
        />

        <MetricCard
          title="Pagas / Liquidadas"
          value={pagas.length}
          subtitle={`Liberado: ${formatCurrency(totalDisbursedPago)}`}
          icon={<CheckCircle2 className="h-4 w-4 text-[var(--success-text)]" />}
          variant="success"
        />
      </div>

      {/* Work Queue */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Fila de Trabalho de Digitação ({filteredList.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar ADE, Cliente ou CPF..."
                className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <div className="flex rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterTab('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'ALL' ? 'bg-[var(--action)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Todas ({myProposals.length})
              </button>
              <button
                onClick={() => setFilterTab('TODAY')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'TODAY' ? 'bg-[var(--action)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Hoje ({digitadasHoje.length})
              </button>
              <button
                onClick={() => setFilterTab('PENDING')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'PENDING' ? 'bg-[var(--warning-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Pendentes ({pendentesAnexo.length})
              </button>
              <button
                onClick={() => setFilterTab('PAID')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'PAID' ? 'bg-[var(--success-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                Pagas ({pagas.length})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-3.5 py-2.5 font-mono">ADE / Proposta</th>
                <th className="px-3.5 py-2.5">Cliente</th>
                <th className="px-3.5 py-2.5">Banco / Produto</th>
                <th className="px-3.5 py-2.5">Parceiro</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right font-mono">Valor Líquido</th>
                <th className="px-3.5 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-[var(--text-secondary)]">
                    Nenhuma proposta encontrada na esteira.
                  </td>
                </tr>
              ) : (
                filteredList.map(p => {
                  const client = clients.find(c => c.id === p.clientId);
                  const bank = banks.find(b => b.id === p.bankId);
                  const product = products.find(pr => pr.id === p.productId);
                  const partner = partners.find(pt => pt.id === p.partnerId);

                  return (
                    <tr key={p.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                      <td className="px-3.5 py-2.5">
                        <button
                          onClick={() => setSelectedProposalId(p.id)}
                          className="font-mono font-bold text-[var(--link)] dark:text-[var(--link)] hover:underline"
                        >
                          {p.proposalNumber}
                        </button>
                        <span className="text-[10px] text-[var(--text-secondary)] block">{formatDate(p.createdAt)}</span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] block">{client?.fullName}</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{formatCpf(client?.cpf || '')}</span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium block">{bank?.name}</span>
                        <span className="text-[10px] text-[var(--text-secondary)]">{product?.name}</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        {partner?.login || '—'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <StatusBadge status={getEffectiveStatus(p)} />
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {formatCurrency(p.disbursedValue || 0)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => setSelectedProposalId(p.id)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--link)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                          title="Detalhar Proposta"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProposalId && (
        <ProposalDetailModal
          proposalId={selectedProposalId}
          onClose={() => setSelectedProposalId(null)}
          onProposalUpdated={() => {
            // refresh data
          }}
        />
      )}
    </div>
  );
};
