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
  onOpenNewProduction: () => void;
  onOpenImportExcel: () => void;
  onOpenExport: () => void;
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
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenImportExcel}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Importar Planilha</span>
            </button>

            <button
              onClick={onOpenExport}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Exportar</span>
            </button>

            <button
              onClick={onOpenNewProduction}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ Nova Produção</span>
            </button>
          </div>
        }
      />

      {/* Operator Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          title="Digitadas Hoje"
          value={digitadasHoje.length}
          subtitle={`Volume: ${formatCurrency(totalDisbursedHoje)}`}
          icon={<Clock className="h-4 w-4 text-blue-600" />}
          variant="primary"
        />

        <MetricCard
          title="Minha Produção Total"
          value={myProposals.length}
          subtitle={`Volume: ${formatCurrency(totalDisbursedGeral)}`}
          icon={<DollarSign className="h-4 w-4 text-slate-600" />}
        />

        <MetricCard
          title="Pendentes de Anexo/Doc"
          value={pendentesAnexo.length}
          subtitle="Aguardando documentação"
          icon={<AlertCircle className="h-4 w-4 text-amber-600" />}
          variant="warning"
        />

        <MetricCard
          title="Pagas / Liquidadas"
          value={pagas.length}
          subtitle={`Liberado: ${formatCurrency(totalDisbursedPago)}`}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          variant="success"
        />
      </div>

      {/* Work Queue */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Fila de Trabalho de Digitação ({filteredList.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar ADE, Cliente ou CPF..."
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
              />
            </div>

            <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterTab('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-500'
                }`}
              >
                Todas ({myProposals.length})
              </button>
              <button
                onClick={() => setFilterTab('TODAY')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'TODAY' ? 'bg-blue-600 text-white' : 'text-slate-500'
                }`}
              >
                Hoje ({digitadasHoje.length})
              </button>
              <button
                onClick={() => setFilterTab('PENDING')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'PENDING' ? 'bg-amber-600 text-white' : 'text-slate-500'
                }`}
              >
                Pendentes ({pendentesAnexo.length})
              </button>
              <button
                onClick={() => setFilterTab('PAID')}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  filterTab === 'PAID' ? 'bg-emerald-600 text-white' : 'text-slate-500'
                }`}
              >
                Pagas ({pagas.length})
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400">
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
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-3.5 py-2.5">
                        <button
                          onClick={() => setSelectedProposalId(p.id)}
                          className="font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {p.proposalNumber}
                        </button>
                        <span className="text-[10px] text-slate-400 block">{formatDate(p.createdAt)}</span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="font-bold text-slate-900 dark:text-white block">{client?.fullName}</span>
                        <span className="text-[10px] font-mono text-slate-500">{formatCpf(client?.cpf || '')}</span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="text-slate-900 dark:text-white font-medium block">{bank?.name}</span>
                        <span className="text-[10px] text-slate-500">{product?.name}</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">
                        {partner?.login || '—'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <StatusBadge status={getEffectiveStatus(p)} />
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(p.disbursedValue || 0)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => setSelectedProposalId(p.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
