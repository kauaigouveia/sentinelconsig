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
  DollarSign,
  Plus,
  Trash2,
  Send,
  MessageSquare,
  Paperclip,
  Calendar,
  Layers,
  FileSpreadsheet,
  TrendingUp,
  MapPin,
  FileCheck,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, formatDate, formatCurrency, extractPartnerCode } from '../../lib/utils';
import { Client, Proposal, DocumentItem, DocumentType, ClientCommunication, ClientNote } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';

interface Client360ViewProps {
  initialSearchCpf?: string;
}

type TabType = 'overview' | 'proposals' | 'contracts' | 'timeline' | 'documents' | 'communications' | 'notes';

export const Client360View: React.FC<Client360ViewProps> = ({ initialSearchCpf }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchCpf || '');
  const [selectedClientId, setSelectedClientId] = useState<string | null>('cli-maria-jose');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);

  // Document modal/form state
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<DocumentType>('RG');
  const [docFileUrl, setDocFileUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  // WhatsApp form state
  const [waMessage, setWaMessage] = useState('');
  const [waTemplate, setWaTemplate] = useState('Atualização de Andamento');

  // Internal Note form state
  const [noteText, setNoteText] = useState('');

  const clients = StorageService.getClients();
  const proposals = StorageService.getProposals();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const history = StorageService.getHistory();
  const activeUser = StorageService.getActiveUser();

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

  const clientProposalIds = new Set(clientProposals.map(p => p.id));
  const clientHistory = history
    .filter(h => clientProposalIds.has(h.proposalId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const clientDocuments = selectedClient ? StorageService.getDocumentsByClient(selectedClient.id) : [];
  const clientCommunications = selectedClient ? StorageService.getCommunicationsByClient(selectedClient.id) : [];
  const clientNotes = selectedClient ? StorageService.getClientNotes(selectedClient.id) : [];

  // Financial aggregates
  const totalDisbursed = clientProposals.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
  const totalBalance = clientProposals.reduce((sum, p) => sum + (p.contractBalance || 0), 0);
  const paidProposalsCount = clientProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  }).length;

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !docName.trim()) return;

    setIsUploadingDoc(true);
    try {
      let fileBase64 = 'RG9jdW1lbnRvIEV4ZW1wbG8gU2VudGluZWwgQ29uc2ln'; // Default fallback base64
      let mimeType = 'application/pdf';
      let fileSize = 1024;

      if (selectedFile) {
        mimeType = selectedFile.type || 'application/octet-stream';
        fileSize = selectedFile.size;
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Str = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64Str);
          };
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClient.id,
          name: docName.trim(),
          type: docType,
          fileBase64,
          mimeType,
        }),
      });

      if (res.ok) {
        const docData = await res.json();
        StorageService.addDocument({
          id: docData.id,
          tenantId: docData.tenantId,
          clientId: selectedClient.id,
          name: docData.name,
          type: docData.type,
          fileUrl: docData.fileUrl,
          fileSizeBytes: docData.fileSizeBytes || fileSize,
          uploadedByUserId: activeUser.id,
          uploadedByUserName: activeUser.name,
        });
      } else {
        const errJson = await res.json().catch(() => ({ error: 'Erro de upload' }));
        alert(errJson.error || 'Erro ao enviar documento para o Azure Storage.');
      }
    } catch (err: any) {
      console.error('Falha no upload do documento:', err);
      alert('Erro ao enviar documento.');
    } finally {
      setIsUploadingDoc(false);
      setDocName('');
      setDocFileUrl('');
      setSelectedFile(null);
    }
  };

  const handleSendCommunication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !waMessage.trim()) return;

    StorageService.addCommunication({
      tenantId: StorageService.getCurrentTenantId(),
      clientId: selectedClient.id,
      channel: 'WHATSAPP',
      templateName: waTemplate,
      eventType: 'AVULSO',
      recipient: selectedClient.phone || selectedClient.whatsapp || '(11) 98765-4321',
      messageContent: waMessage.trim(),
      status: 'ENVIADO',
      sentByUserId: activeUser.id,
      sentByUserName: activeUser.name,
    });

    setWaMessage('');
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !noteText.trim()) return;

    StorageService.addClientNote({
      tenantId: StorageService.getCurrentTenantId(),
      clientId: selectedClient.id,
      authorId: activeUser.id,
      authorName: activeUser.name,
      note: noteText.trim(),
    });

    setNoteText('');
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Visão do Cliente 360º (CRM Avançado)</h2>
          <p className="text-xs text-slate-500">
            Ficha completa: dados cadastrais, margens, ADEs, timeline de status, documentos, WhatsApp e notas internas
          </p>
        </div>
        {selectedClient && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
              CPF: <strong className="font-mono text-slate-900">{formatCpf(selectedClient.cpf)}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Client Search & List */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3 flex flex-col h-[760px]">
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
                        ? 'border-blue-500 bg-blue-50/80 shadow-xs'
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
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span className="font-mono">{formatCpf(c.cpf)}</span>
                      {c.convenio && <span className="text-[10px] text-blue-700 bg-blue-50 px-1 rounded">{c.convenio}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: 360 Client Profile & Navigation */}
        <div className="lg:col-span-2 space-y-4">
          {selectedClient ? (
            <>
              {/* Profile Card & KPI Header */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-lg shadow-xs">
                      {selectedClient.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedClient.fullName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <span>CPF: <strong className="text-slate-800">{formatCpf(selectedClient.cpf)}</strong></span>
                        {selectedClient.matricula && (
                          <span>| Matrícula: <strong>{selectedClient.matricula}</strong></span>
                        )}
                        {selectedClient.convenio && (
                          <span className="bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-sans text-[10px] font-bold">
                            {selectedClient.convenio}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Liberado</span>
                      <span className="font-bold text-emerald-600 text-sm font-mono">
                        {formatCurrency(totalDisbursed)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total de Propostas</span>
                    <span className="text-sm font-bold text-slate-900">{clientProposals.length} ADEs</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Propostas Pagas</span>
                    <span className="text-sm font-bold text-emerald-700">{paidProposalsCount}</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Saldo Devedor Retornado</span>
                    <span className="text-sm font-bold text-slate-800 font-mono">{formatCurrency(totalBalance)}</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Margem Estimada</span>
                    <span className="text-sm font-bold text-blue-700 font-mono">
                      {selectedClient.margemDisponivel ? formatCurrency(selectedClient.margemDisponivel) : 'R$ 0,00'}
                    </span>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pt-2 text-xs">
                  {[
                    { id: 'overview', label: 'Visão Geral', icon: FileText },
                    { id: 'proposals', label: `Propostas (${clientProposals.length})`, icon: Layers },
                    { id: 'contracts', label: 'Contratos / Valores', icon: DollarSign },
                    { id: 'timeline', label: `Timeline 360 (${clientHistory.length})`, icon: Clock },
                    { id: 'documents', label: `Documentos (${clientDocuments.length})`, icon: Paperclip },
                    { id: 'communications', label: `WhatsApp (${clientCommunications.length})`, icon: MessageSquare },
                    { id: 'notes', label: `Notas (${clientNotes.length})`, icon: AlertCircle },
                  ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex items-center gap-1.5 px-3 py-2 font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                          isActive
                            ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                            : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Contents */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs min-h-[400px]">
                {/* 1. VISÃO GERAL */}
                {activeTab === 'overview' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-3 p-4 rounded-lg border border-slate-100 bg-slate-50/50">
                        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-blue-600" />
                          <span>Dados Cadastrais</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-slate-600">
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">Nome Completo</span>
                            <span className="font-semibold text-slate-800">{selectedClient.fullName}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">CPF</span>
                            <span className="font-semibold font-mono text-slate-800">{formatCpf(selectedClient.cpf)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">Telefone Principal</span>
                            <span className="font-semibold text-slate-800">{selectedClient.phone || 'Não informado'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">WhatsApp</span>
                            <span className="font-semibold text-slate-800">{selectedClient.whatsapp || selectedClient.phone || 'Não informado'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] uppercase text-slate-400 block">E-mail</span>
                            <span className="font-semibold text-slate-800">{selectedClient.email || 'Não informado'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 p-4 rounded-lg border border-slate-100 bg-slate-50/50">
                        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Building className="h-4 w-4 text-blue-600" />
                          <span>Vínculo Funcional & Margem</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-slate-600">
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">Convênio</span>
                            <span className="font-semibold text-slate-800">{selectedClient.convenio || 'INSS / Federal'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">Matrícula / Benefício</span>
                            <span className="font-semibold font-mono text-slate-800">{selectedClient.matricula || '987654321'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">Margem Consignável</span>
                            <span className="font-semibold text-emerald-700 font-mono">
                              {selectedClient.margemDisponivel ? formatCurrency(selectedClient.margemDisponivel) : 'R$ 480,00'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 block">UF / Cidade</span>
                            <span className="font-semibold text-slate-800">{selectedClient.state ? `${selectedClient.city} - ${selectedClient.state}` : 'São Paulo - SP'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] uppercase text-slate-400 block">Observação Cadastral</span>
                            <span className="font-semibold text-slate-800">{selectedClient.observation || 'Sem observações especiais.'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. PROPOSTAS */}
                {activeTab === 'proposals' && (
                  <div className="space-y-3">
                    {clientProposals.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-6 text-center">
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
                                <span className="text-[10px] uppercase text-slate-400 block">Valor Liberado</span>
                                <span className="font-semibold font-mono text-emerald-700">
                                  {formatCurrency(p.disbursedValue || 0)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase text-slate-400 block">Saldo Retornado</span>
                                <span className="font-semibold font-mono text-slate-800">
                                  {formatCurrency(p.contractBalance || 0)}
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
                )}

                {/* 3. CONTRATOS / SALDOS */}
                {activeTab === 'contracts' && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">ADE / Proposta</th>
                            <th className="p-3">Produto</th>
                            <th className="p-3">Banco</th>
                            <th className="p-3 text-right">Valor Liberado (Líq.)</th>
                            <th className="p-3 text-right">Saldo Devedor CIP</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {clientProposals.map(p => {
                            const prod = products.find(pr => pr.id === p.productId);
                            const bank = banks.find(b => b.id === p.bankId);
                            const status = statuses.find(s => s.id === p.statusId);
                            return (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="p-3 font-mono font-bold text-slate-900">{p.proposalNumber}</td>
                                <td className="p-3 font-medium">{prod?.name}</td>
                                <td className="p-3">{bank?.name}</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-700">
                                  {formatCurrency(p.disbursedValue || 0)}
                                </td>
                                <td className="p-3 text-right font-mono font-semibold text-slate-800">
                                  {formatCurrency(p.contractBalance || 0)}
                                </td>
                                <td className="p-3">
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                    style={{ backgroundColor: status?.color || '#64748b' }}
                                  >
                                    {status?.name}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. TIMELINE 360 */}
                {activeTab === 'timeline' && (
                  <div className="space-y-4">
                    {clientHistory.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-6 text-center">
                        Nenhum evento registrado no histórico para as propostas deste cliente.
                      </p>
                    ) : (
                      <div className="relative border-l-2 border-slate-200 ml-3 space-y-4 pl-4">
                        {clientHistory.map(h => (
                          <div key={h.id} className="relative">
                            <div className="absolute -left-[23px] top-0.5 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-white" />
                            <div className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{h.action}</span>
                                <span className="text-[10px] text-slate-400">{formatDate(h.createdAt)}</span>
                              </div>
                              <p className="text-slate-600 mt-0.5">
                                Status: <strong className="text-slate-800">{h.previousStatusName || 'Início'}</strong> → <strong className="text-blue-700">{h.newStatusName}</strong>
                              </p>
                              {h.observation && (
                                <p className="text-slate-500 italic text-[11px] mt-0.5 bg-slate-50 p-1.5 rounded">
                                  "{h.observation}"
                                </p>
                              )}
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Operador: {h.userName} ({h.origin})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 5. DOCUMENTOS */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    {/* Add Document Form */}
                    <form onSubmit={handleAddDocument} className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        type="text"
                        value={docName}
                        onChange={e => setDocName(e.target.value)}
                        placeholder="Nome do Documento (Ex: RG_Frente.pdf)"
                        className="sm:col-span-2 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-hidden"
                        required
                      />
                      <select
                        value={docType}
                        onChange={e => setDocType(e.target.value as DocumentType)}
                        className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-hidden"
                      >
                        <option value="RG">RG</option>
                        <option value="CNH">CNH</option>
                        <option value="CONTRACHEQUE">Contracheque</option>
                        <option value="EXTRATO">Extrato Bancário</option>
                        <option value="COMPROVANTE_RESIDENCIA">Comprovante de Residência</option>
                        <option value="CONTRATO_ASSINADO">Contrato Assinado</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                      <input
                        type="file"
                        onChange={e => {
                          const file = e.target.files?.[0] || null;
                          setSelectedFile(file);
                          if (file && !docName) {
                            setDocName(file.name);
                          }
                        }}
                        className="text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <button
                        type="submit"
                        disabled={isUploadingDoc}
                        className="flex items-center justify-center gap-1 bg-blue-600 text-white font-bold text-xs py-1.5 px-3 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{isUploadingDoc ? 'Enviando...' : 'Anexar'}</span>
                      </button>
                    </form>

                    {/* Documents List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {clientDocuments.length === 0 ? (
                        <p className="text-xs text-slate-400 italic col-span-2 py-4 text-center">
                          Nenhum documento anexado para este cliente.
                        </p>
                      ) : (
                        clientDocuments.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:shadow-xs transition-all">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="overflow-hidden">
                                <span className="font-bold text-xs text-slate-900 block truncate">{doc.name}</span>
                                <span className="text-[10px] text-slate-400 block">{doc.type} • {doc.uploadedByUserName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                title="Visualizar"
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                              <button
                                onClick={() => StorageService.deleteDocument(doc.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 6. WHATSAPP & COMUNICAÇÕES */}
                {activeTab === 'communications' && (
                  <div className="space-y-4">
                    {/* Quick WhatsApp Dispatch */}
                    <form onSubmit={handleSendCommunication} className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                          <MessageSquare className="h-4 w-4" />
                          <span>Disparo de Notificação WhatsApp</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold text-emerald-700">
                          {selectedClient.phone || selectedClient.whatsapp || '(11) 98765-4321'}
                        </span>
                      </div>
                      <textarea
                        value={waMessage}
                        onChange={e => setWaMessage(e.target.value)}
                        placeholder="Digite a mensagem para o cliente..."
                        className="w-full rounded border border-emerald-300 bg-white p-2 text-xs text-slate-900 focus:outline-hidden"
                        rows={2}
                        required
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {['Aviso CIP', 'Aviso Saldo Retornado', 'Proposta Paga'].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setWaMessage(`Olá ${selectedClient.fullName}! Atualização da sua proposta: ${t}. Acompanhe com a nossa mesa de crédito.`)}
                              className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold hover:bg-emerald-200 cursor-pointer"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <button
                          type="submit"
                          className="flex items-center gap-1 bg-emerald-600 text-white font-bold text-xs py-1.5 px-3 rounded hover:bg-emerald-700 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>Enviar Mensagem</span>
                        </button>
                      </div>
                    </form>

                    {/* Messages History */}
                    <div className="space-y-2">
                      {clientCommunications.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4 text-center">
                          Nenhuma comunicação enviada ainda para este cliente.
                        </p>
                      ) : (
                        clientCommunications.map(comm => (
                          <div key={comm.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-emerald-700 flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>{comm.templateName || 'WhatsApp'}</span>
                              </span>
                              <span className="text-[10px] text-slate-400">{formatDate(comm.createdAt)}</span>
                            </div>
                            <p className="text-xs text-slate-800 bg-white p-2 rounded border border-slate-100">
                              {comm.messageContent}
                            </p>
                            <span className="text-[10px] text-slate-400 block">
                              Enviado por: {comm.sentByUserName} ({comm.status})
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* 7. OBSERVAÇÕES INTERNAS */}
                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    <form onSubmit={handleAddNote} className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Adicionar nota interna sobre o cliente (visível apenas para a equipe)..."
                        className="w-full rounded border border-slate-300 bg-white p-2 text-xs text-slate-900 focus:outline-hidden"
                        rows={2}
                        required
                      />
                      <div className="text-right">
                        <button
                          type="submit"
                          className="bg-blue-600 text-white font-bold text-xs py-1.5 px-4 rounded hover:bg-blue-700 cursor-pointer"
                        >
                          Salvar Nota
                        </button>
                      </div>
                    </form>

                    <div className="space-y-2">
                      {clientNotes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4 text-center">
                          Nenhuma anotação interna registrada para este cliente.
                        </p>
                      ) : (
                        clientNotes.map(n => (
                          <div key={n.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900">{n.authorName}</span>
                              <span className="text-[10px] text-slate-400">{formatDate(n.createdAt)}</span>
                            </div>
                            <p className="text-xs text-slate-700 bg-white p-2.5 rounded border border-slate-100">
                              {n.note}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
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
