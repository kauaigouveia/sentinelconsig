import React, { useState } from 'react';
import {
  Users,
  Search,
  FileText,
  Clock,
  Phone,
  Mail,
  CreditCard,
  Building,
  Link2,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, formatDate, extractPartnerCode } from '../../lib/utils';
import { Client, Proposal } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';

interface Client360ViewProps {
  initialSearchCpf?: string;
}

export const Client360View: React.FC<Client360ViewProps> = ({ initialSearchCpf }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchCpf || '');
  const [selectedClientId, setSelectedClientId] = useState<string | null>('cli-maria-jose');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

  const clients = StorageService.getClients();
  const proposals = StorageService.getProposals();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();

  // Filter clients by search
  const filteredClients = clients.filter(c => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    const cleanTerm = normalizeCpf(term);
    return c.fullName.toLowerCase().includes(term) || (cleanTerm && c.cpf.includes(cleanTerm));
  });

  const selectedClient = clients.find(c => c.id === selectedClientId) || filteredClients[0];
  const clientProposals = selectedClient
    ? proposals.filter(p => p.clientId === selectedClient.id)
    : [];

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h2 className="text-base font-bold text-slate-900">Visão do Cliente 360º</h2>
        <p className="text-xs text-slate-500">
          O cliente como centro da operação: todas as ADEs, histórico, produtos e pendências consolidados
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Client Search & List */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 flex flex-col h-[650px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente por CPF ou Nome..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-8 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredClients.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 italic">
                Nenhum cliente encontrado.
              </p>
            ) : (
              filteredClients.map(c => {
                const count = proposals.filter(p => p.clientId === c.id).length;
                const isSelected = selectedClient?.id === c.id;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 shadow-xs'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {c.fullName}
                      </span>
                      <span className="bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[10px]">
                        {count} ADEs
                      </span>
                    </div>
                    <p className="font-mono text-xs text-slate-500 mt-0.5">
                      {formatCpf(c.cpf)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Client 360 Profile & Proposals */}
        <div className="lg:col-span-2 space-y-4">
          {selectedClient ? (
            <>
              {/* Profile Card */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-base">
                      {selectedClient.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedClient.fullName}
                      </h3>
                      <p className="text-xs font-mono font-bold text-blue-700">
                        CPF: {formatCpf(selectedClient.cpf)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                    {clientProposals.length} propostas vinculadas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 pt-1">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span>{selectedClient.phone || 'Telefone não cadastrado'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{selectedClient.email || 'Email não cadastrado'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span>Cadastro: {formatDate(selectedClient.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Proposals Table */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Histórico de Propostas / ADEs deste Cliente ({clientProposals.length})
                </h4>

                <div className="space-y-3">
                  {clientProposals.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Nenhuma proposta cadastrada para este cliente.
                    </p>
                  ) : (
                    clientProposals.map(p => {
                      const prod = products.find(pr => pr.id === p.productId);
                      const bank = banks.find(b => b.id === p.bankId);
                      const promoter = promoters.find(pr => pr.id === p.promoterId);
                      const partner = partners.find(pt => pt.id === p.partnerId);
                      const status = statuses.find(s => s.id === p.statusId);

                      return (
                        <div
                          key={p.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2 hover:bg-white hover:shadow-xs transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-slate-900">
                                ADE {p.proposalNumber}
                              </span>
                              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                {prod?.name}
                              </span>
                              {p.relatedPortabilityId && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                  <Link2 className="h-3 w-3" />
                                  <span>Vinculado a Portabilidade</span>
                                </span>
                              )}
                            </div>

                            <span
                              className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs"
                              style={{ backgroundColor: status?.color || '#64748b' }}
                            >
                              {status?.name}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 pt-2 border-t border-slate-200/60">
                            <div>
                              <span className="text-[10px] uppercase text-slate-400 block">Banco</span>
                              <span className="font-semibold text-slate-800">{bank?.name}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-slate-400 block">Promotora</span>
                              <span className="font-semibold text-slate-800">{promoter?.name}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-slate-400 block">Parceiro</span>
                              <span className="font-semibold text-slate-800">
                                {partner?.login} ({partner ? extractPartnerCode(partner.login) : ''})
                              </span>
                            </div>
                            <div className="text-right">
                              <button
                                onClick={() => setDetailProposalId(p.id)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Ver Detalhes</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-xs">
              Selecione um cliente ao lado para ver sua ficha completa 360º.
            </div>
          )}
        </div>
      </div>

      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          onClose={() => setDetailProposalId(null)}
          onProposalUpdated={() => {}}
        />
      )}
    </div>
  );
};
