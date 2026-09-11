import React, { useState } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCpf, formatDate, extractPartnerCode, formatCurrency } from '../../lib/utils';
import { Proposal } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';

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
  const statuses = StorageService.getStatuses();

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  // Filter proposals by this digitizer (or all if master)
  const myProposals = allProposals.filter(
    p => p.digitizerId === activeUser.id || activeUser.role === 'MASTER'
  );

  const todayStr = new Date().toISOString().split('T')[0];
  const digitadasHoje = myProposals.filter(p => p.createdAt.startsWith(todayStr));
  const pendentesAnexo = myProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PENDENTE_ANEXO_DOCUMENTACAO';
  });
  const pagas = myProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  });

  const totalDisbursedHoje = digitadasHoje.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
  const totalDisbursedGeral = myProposals.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
  const totalDisbursedPago = pagas.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Minha Produção — Operador: {activeUser.name}
          </h2>
          <p className="text-xs text-slate-500">
            Painel rápido para digitação, conferência de anexos e exportação para envio bancário
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenImportExcel}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-blue-600" />
            <span>Importar Planilha</span>
          </button>

          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            <span>Exportar Propostas</span>
          </button>

          <button
            onClick={onOpenNewProduction}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
          >
            <PlusCircle className="h-4 w-4" />
            <span>+ Nova Produção</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-blue-700">Digitadas Hoje</span>
          <p className="text-2xl font-black text-blue-800 mt-1">{digitadasHoje.length}</p>
          <span className="text-[10px] text-blue-600 font-semibold block">
            {formatCurrency(totalDisbursedHoje)}
          </span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-700">Pendente Anexo Doc</span>
          <p className="text-2xl font-black text-amber-800 mt-1">{pendentesAnexo.length}</p>
          <span className="text-[10px] text-amber-600">Aguardando envio</span>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700">Pagas</span>
          <p className="text-2xl font-black text-emerald-800 mt-1">{pagas.length}</p>
          <span className="text-[10px] text-emerald-600 font-semibold block">
            {formatCurrency(totalDisbursedPago)} creditado
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400">Total Digitadas</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{myProposals.length}</p>
          <span className="text-[10px] text-slate-500 font-semibold block">
            {formatCurrency(totalDisbursedGeral)} volume
          </span>
        </div>
      </div>

      {/* Proposals List */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Últimas Propostas Digitadas por Você ({myProposals.length})
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">ADE / Proposta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3">Parceiro</th>
                <th className="px-4 py-3">Valores</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {myProposals.slice(0, 15).map(p => {
                const client = clients.find(c => c.id === p.clientId);
                const prod = products.find(pr => pr.id === p.productId);
                const bank = banks.find(b => b.id === p.bankId);
                const partner = partners.find(pt => pt.id === p.partnerId);
                const status = statuses.find(s => s.id === p.statusId);

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      ADE {p.proposalNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {client?.fullName}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {formatCpf(client?.cpf || '')}
                    </td>
                    <td className="px-4 py-3">{prod?.name}</td>
                    <td className="px-4 py-3">{bank?.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-blue-700">
                        {partner ? extractPartnerCode(partner.login) : ''}
                      </span>
                      <span className="text-slate-400 text-[10px] block">
                        {partner?.login}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.disbursedValue ? (
                        <span className="font-bold text-emerald-700 block">
                          Lib: {formatCurrency(p.disbursedValue)}
                        </span>
                      ) : null}
                      {p.contractBalance ? (
                        <span className="text-[10px] text-indigo-600 block">
                          Saldo: {formatCurrency(p.contractBalance)}
                        </span>
                      ) : null}
                      {!p.disbursedValue && !p.contractBalance && (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white shadow-2xs"
                        style={{ backgroundColor: status?.color || '#64748b' }}
                      >
                        {status?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedProposalId(p.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProposalId && (
        <ProposalDetailModal
          proposalId={selectedProposalId}
          onClose={() => setSelectedProposalId(null)}
          onProposalUpdated={() => {}}
        />
      )}
    </div>
  );
};
