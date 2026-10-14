import React, { useEffect, useRef, useState } from 'react';
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
  Copy,
  X,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { normalizeCpf, formatCpf, formatDate, formatCurrency, extractPartnerCode } from '../../lib/utils';
import { Client, Proposal, DocumentItem, DocumentType, ClientCommunication, ClientNote } from '../../types';
import { ProposalDetailModal } from '../production/ProposalDetailModal';
import { ActionBar } from '../ui/ActionBar';
import { StatusBadge } from '../ui/StatusBadge';
import { EmptyState } from '../ui/EmptyState';
import { toastService } from '../ui/toastService';
import { hasPermission } from '../../lib/permissions';
import { realtimeHub } from '../../services/realtimeService';

interface Client360ViewProps {
  premium?: boolean;
  initialSearchCpf?: string;
}

type TabType = 'overview' | 'proposals' | 'contracts' | 'timeline' | 'documents' | 'communications' | 'notes';

export const Client360View: React.FC<Client360ViewProps> = ({ initialSearchCpf, premium = false }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchCpf || '');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [detailProposalId, setDetailProposalId] = useState<string | null>(null);
  const [clientDocuments, setClientDocuments] = useState<DocumentItem[]>([]);

  // Document modal/form state
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState<DocumentType>('RG');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const documentUploadInProgressRef = useRef(false);
  const documentFileInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp form state
  const [waMessage, setWaMessage] = useState('');
  const [waTemplate, setWaTemplate] = useState('Atualização de Andamento');
  const [isSendingCommunication, setIsSendingCommunication] = useState(false);
  const communicationInProgressRef = useRef(false);
  const [clientCommunications, setClientCommunications] = useState<ClientCommunication[]>([]);

  // Internal Note form state
  const [noteText, setNoteText] = useState('');
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const noteSaveInProgressRef = useRef(false);

  const clients = StorageService.getClients();
  const proposals = StorageService.getProposals();
  const products = StorageService.getProducts();
  const banks = StorageService.getBanks();
  const promoters = StorageService.getPromoters();
  const partners = StorageService.getPartners();
  const statuses = StorageService.getStatuses();
  const history = StorageService.getHistory();
  const activeUser = StorageService.getActiveUser();
  const canManageClientData = hasPermission(activeUser?.role, activeUser?.customPermissions, 'clients.create') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'clients.update');
  const canUpdateClientData = hasPermission(activeUser?.role, activeUser?.customPermissions, 'clients.update');
  const canDeleteClientDocuments = hasPermission(activeUser?.role, activeUser?.customPermissions, 'clients.delete');

  // Filter clients by search
  const filteredClients = clients.filter(c => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    const cleanTerm = normalizeCpf(term);
    return c.fullName.toLowerCase().includes(term) || (cleanTerm && c.cpf.includes(cleanTerm));
  });

  const selectedClient = filteredClients.find(c => c.id === selectedClientId) || filteredClients[0];
  const selectedClientRef = useRef<string | null>(selectedClient?.id ?? null);
  selectedClientRef.current = selectedClient?.id ?? null;
  const clientProposals = selectedClient
    ? proposals.filter(p => p.clientId === selectedClient.id)
    : [];

  const clientProposalIds = new Set(clientProposals.map(p => p.id));
  const clientHistory = history
    .filter(h => clientProposalIds.has(h.proposalId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());


  useEffect(() => {
    if (initialSearchCpf !== undefined) {
      setSearchTerm(initialSearchCpf);
      setSelectedClientId(null);
    }
  }, [initialSearchCpf]);

  useEffect(() => {
    setNoteText('');
    setWaMessage('');
  }, [selectedClient?.id]);

  useEffect(() => {
    const loadDocuments = () => {
      setClientDocuments(selectedClient ? StorageService.getDocumentsByClient(selectedClient.id) : []);
    };
    loadDocuments();
    window.addEventListener('credit_gestao_storage_update', loadDocuments);
    return () => window.removeEventListener('credit_gestao_storage_update', loadDocuments);
  }, [selectedClient?.id]);

  useEffect(() => {
    if (!selectedClient) {
      setClientNotes([]);
      return;
    }
    let cancelled = false;
    const loadNotes = () => {
      fetch(`/api/clients/${encodeURIComponent(selectedClient.id)}/notes`, { credentials: 'include' })
        .then(async res => {
          if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.error || 'Não foi possível carregar as notas.');
          }
          return res.json();
        })
        .then((notes: ClientNote[]) => {
          if (!cancelled) setClientNotes(Array.isArray(notes) ? notes : []);
        })
        .catch(err => {
          if (!cancelled) {
            setClientNotes([]);
            console.error('[CLIENT NOTES LOAD ERROR]', err);
            toastService.error('Erro ao carregar notas', err.message || 'Tente novamente.');
          }
        });
    };
    loadNotes();
    const unsubscribeRealtime = realtimeHub.subscribe('CLIENT_NOTE_CREATED', event => {
      if (event.entityId === selectedClient.id) loadNotes();
    });
    window.addEventListener('credit_gestao_storage_update', loadNotes);
    return () => {
      cancelled = true;
      unsubscribeRealtime();
      window.removeEventListener('credit_gestao_storage_update', loadNotes);
    };
  }, [selectedClient?.id]);

  useEffect(() => {
    if (!selectedClient) {
      setClientCommunications([]);
      return;
    }
    let cancelled = false;
    const loadCommunications = async () => {
      try {
        const response = await fetch(`/api/clients/${encodeURIComponent(selectedClient.id)}/communications`, { credentials: 'include' });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || 'Não foi possível carregar o histórico de comunicações.');
        }
        const data = await response.json();
        if (!cancelled) {
          const serverItems: ClientCommunication[] = Array.isArray(data) ? data : [];
          const localLegacyItems = StorageService.getCommunicationsByClient(selectedClient.id);
          const knownIds = new Set(serverItems.map(item => item.id));
          setClientCommunications([
            ...serverItems,
            ...localLegacyItems.filter(item => !knownIds.has(item.id)),
          ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        }
      } catch (error) {
        if (!cancelled) {
          setClientCommunications([]);
          console.error('[CLIENT COMMUNICATIONS LOAD ERROR]', error);
          toastService.error('Erro ao carregar histórico', error instanceof Error ? error.message : 'Tente novamente.');
        }
      }
    };
    void loadCommunications();
    const unsubscribeRealtime = realtimeHub.subscribe('CLIENT_COMMUNICATION_CREATED', event => {
      if (event.entityId === selectedClient.id) void loadCommunications();
    });
    return () => {
      cancelled = true;
      unsubscribeRealtime();
    };
  }, [selectedClient?.id]);

  // Financial aggregates
  const totalDisbursed = clientProposals.reduce((sum, p) => sum + (p.disbursedValue || 0), 0);
  const totalBalance = clientProposals.reduce((sum, p) => sum + (p.contractBalance || 0), 0);
  const paidProposalsCount = clientProposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  }).length;

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !docName.trim() || documentUploadInProgressRef.current) return;
    if (!selectedFile) {
      toastService.error('Arquivo obrigatório', 'Selecione o arquivo que deseja anexar.');
      return;
    }
    if (selectedFile.size <= 0 || selectedFile.size > 15 * 1024 * 1024) {
      toastService.error('Tamanho de arquivo inválido', 'Selecione um arquivo com até 15 MB.');
      return;
    }

    documentUploadInProgressRef.current = true;
    setIsUploadingDoc(true);
    try {
      const mimeType = selectedFile.type || 'application/octet-stream';
      const fileSize = selectedFile.size;
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Str = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64Str);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

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

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Erro de upload' }));
        throw new Error(errJson.error || 'Erro ao enviar documento para o Azure Storage.');
      }
      const docData = await res.json();
      const savedDocument = StorageService.addDocument({
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
      if (selectedClientRef.current === selectedClient.id) {
        setClientDocuments(current => [savedDocument, ...current.filter(document => document.id !== savedDocument.id)]);
      }
      toastService.success('Documento Anexado', `Documento ${docName} salvo com sucesso.`);
      setDocName('');
      setSelectedFile(null);
      if (documentFileInputRef.current) documentFileInputRef.current.value = '';
    } catch (err: any) {
      console.error('Falha no upload do documento:', err);
      toastService.error('Erro', err.message || 'Falha ao enviar documento.');
    } finally {
      documentUploadInProgressRef.current = false;
      setIsUploadingDoc(false);
    }
  };

  const handleSendCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !waMessage.trim() || communicationInProgressRef.current) return;

    const clientId = selectedClient.id;
    const message = waMessage.trim();
    const recipient = selectedClient.whatsapp || selectedClient.phone;
    const phoneDigits = recipient?.replace(/\D/g, '') || '';
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      toastService.error('Telefone inválido', 'Cadastre um telefone válido para abrir a conversa no WhatsApp.');
      return;
    }

    const whatsappNumber = phoneDigits.length <= 11 ? `55${phoneDigits}` : phoneDigits;
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    // Reserve the tab during the user gesture, but only navigate after the history is saved.
    const whatsappWindow = window.open('', '_blank');
    if (!whatsappWindow) {
      toastService.error('WhatsApp bloqueado', 'Permita a abertura de nova aba para continuar o envio.');
      return;
    }
    whatsappWindow.document.title = 'Preparando mensagem';
    whatsappWindow.document.body.textContent = 'Salvando o registro da comunicação…';
    communicationInProgressRef.current = true;
    setIsSendingCommunication(true);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/communications`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, messageContent: message, templateName: waTemplate, eventType: 'AVULSO' }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível salvar o histórico da comunicação.');
      }
      const created = await response.json() as ClientCommunication;
      if (selectedClientRef.current === clientId) {
        setClientCommunications(current => [created, ...current.filter(item => item.id !== created.id)]);
        setWaMessage('');
      }
      whatsappWindow.opener = null;
      whatsappWindow.location.href = whatsappUrl;
      toastService.success('WhatsApp aberto', 'Revise e confirme o envio na conversa. O registro ficou salvo no histórico.');
    } catch (error) {
      whatsappWindow.close();
      toastService.error('Histórico não salvo', error instanceof Error ? error.message : 'Não foi possível salvar o histórico da comunicação.');
    } finally {
      communicationInProgressRef.current = false;
      setIsSendingCommunication(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !noteText.trim() || noteSaveInProgressRef.current) return;
    const clientId = selectedClient.id;
    const note = noteText.trim();
    noteSaveInProgressRef.current = true;
    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível salvar a nota.');
      }
      const created = await res.json() as ClientNote;
      if (selectedClientRef.current === clientId) {
        setClientNotes(current => [created, ...current.filter(note => note.id !== created.id)]);
        setNoteText('');
      }
      toastService.success('Nota salva', 'A equipe já pode consultar esta anotação.');
    } catch (err: any) {
      toastService.error('Erro ao salvar nota', err.message || 'Tente novamente.');
    } finally {
      noteSaveInProgressRef.current = false;
      setIsSavingNote(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    const document = clientDocuments.find(item => item.id === documentId);
    if (!window.confirm(`Excluir ${document?.name || 'este documento'}? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Não foi possível excluir o documento.');
      }
      StorageService.removeDocumentFromCache(documentId);
      setClientDocuments(current => current.filter(item => item.id !== documentId));
      toastService.success('Documento excluído', 'O documento foi removido do sistema.');
    } catch (err: any) {
      toastService.error('Erro ao excluir', err.message || 'Não foi possível excluir o documento.');
    }
  };

  return (
    <div className={`space-y-4 ${premium ? 'p2-live-module p2-live-clients' : ''}`}>
      {/* Title */}
      <ActionBar
        title="Visão do Cliente 360º"
        count={filteredClients.length}
        financialTotal={selectedClient ? `CPF: ${formatCpf(selectedClient.cpf)}` : undefined}
      />

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 ${premium ? 'p2-client-layout' : ''}`}>
        {/* Left Column: Client Search & List */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs space-y-3 flex flex-col h-[min(70vh,760px)] min-h-[320px] lg:h-[760px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar cliente por CPF ou Nome..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-8 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 focus:outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredClients.length === 0 ? (
              <EmptyState
                title="Nenhum cliente encontrado"
                description="Nenhum registro corresponde ao termo pesquisado."
                actionLabel="Limpar Busca"
                onAction={() => setSearchTerm('')}
              />
            ) : (
              filteredClients.map(c => {
                const count = proposals.filter(p => p.clientId === c.id).length;
                const isSelected = selectedClient?.id === c.id;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-500 shadow-xs ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {c.fullName}
                      </span>
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                        {count} ADEs
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      <span className="font-mono">{formatCpf(c.cpf)}</span>
                      {c.convenio && (
                        <span className="text-[10px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1 rounded font-semibold">
                          {c.convenio}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: 360 Client Profile & Navigation */}
        <div className={`lg:col-span-2 space-y-4 ${premium ? 'p2-client-detail' : ''}`}>
          {selectedClient ? (
            <>
              {/* Profile Card & KPI Header */}
              <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4 ${premium ? 'p2-client-profile' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold flex items-center justify-center text-lg shadow-xs">
                      {selectedClient.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{selectedClient.fullName}</span>
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        <span className="flex items-center gap-1">
                          CPF: <strong className="text-slate-800 dark:text-slate-200">{formatCpf(selectedClient.cpf)}</strong>
                          <button
                            onClick={() => toastService.copyToClipboard(selectedClient.cpf, 'CPF')}
                            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Copiar CPF"
                            aria-label="Copiar CPF"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </span>
                        {selectedClient.matricula && (
                          <span className="flex items-center gap-1">
                            | Matrícula: <strong>{selectedClient.matricula}</strong>
                            <button
                              onClick={() => toastService.copyToClipboard(selectedClient.matricula || '', 'Matrícula')}
                              className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Copiar Matrícula"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                        {selectedClient.convenio && (
                          <span className="bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-1.5 py-0.2 rounded font-sans text-[10px] font-bold">
                            {selectedClient.convenio}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Liberado</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono">
                        {formatCurrency(totalDisbursed)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Total de Propostas</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">{clientProposals.length} ADEs</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Propostas Pagas</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">{paidProposalsCount}</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Saldo Retornado CIP</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(totalBalance)}</span>
                  </div>
                  <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-2.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block">Margem Estimada</span>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">
                      {selectedClient.margemDisponivel ? formatCurrency(selectedClient.margemDisponivel) : 'R$ 0,00'}
                    </span>
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className={`flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pt-2 text-xs ${premium ? 'p2-client-tabs' : ''}`} role={premium ? 'navigation' : undefined} aria-label={premium ? 'Seções do cliente' : undefined}>
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
                        aria-current={premium && isActive ? 'page' : undefined}
                        className={`flex items-center gap-1.5 px-3 py-2 font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                          isActive
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/30'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'
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
              <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs min-h-[400px] ${premium ? 'p2-client-content' : ''}`}>
                {/* 1. VISÃO GERAL */}
                {activeTab === 'overview' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-3 p-4 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span>Dados Cadastrais</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Nome Completo</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedClient.fullName}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">CPF</span>
                            <div className="flex items-center gap-1 font-semibold font-mono text-slate-800 dark:text-slate-200">
                              <span>{formatCpf(selectedClient.cpf)}</span>
                              <button
                                onClick={() => toastService.copyToClipboard(selectedClient.cpf, 'CPF')}
                                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                                title="Copiar CPF"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Telefone Principal</span>
                            <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                              <span>{selectedClient.phone || 'Não informado'}</span>
                              {selectedClient.phone && (
                                <button
                                  onClick={() => toastService.copyToClipboard(selectedClient.phone || '', 'Telefone')}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                                  title="Copiar Telefone"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">WhatsApp</span>
                            <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                              <span>{selectedClient.whatsapp || selectedClient.phone || 'Não informado'}</span>
                              {(selectedClient.whatsapp || selectedClient.phone) && (
                                <button
                                  onClick={() => toastService.copyToClipboard(selectedClient.whatsapp || selectedClient.phone || '', 'WhatsApp')}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                                  title="Copiar WhatsApp"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">E-mail</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedClient.email || 'Não informado'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 p-4 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Building className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span>Vínculo Funcional & Margem</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Convênio</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedClient.convenio || 'Não informado'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Matrícula / Benefício</span>
                            <div className="flex items-center gap-1 font-semibold font-mono text-slate-800 dark:text-slate-200">
                              <span>{selectedClient.matricula || 'Não informado'}</span>
                              {selectedClient.matricula && (
                                <button
                                  onClick={() => toastService.copyToClipboard(selectedClient.matricula!, 'Matrícula')}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                                  title="Copiar Matrícula"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Margem Consignável</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                              {selectedClient.margemDisponivel != null ? formatCurrency(selectedClient.margemDisponivel) : 'Não informada'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">UF / Cidade</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{[selectedClient.city, selectedClient.state].filter(Boolean).join(' - ') || 'Não informado'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Observação Cadastral</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedClient.observation || 'Sem observações especiais.'}</span>
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
                        const status = (p as any).status || statuses.find(s => s.id === p.statusId || s.code === (p as any).status?.code);

                        return (
                          <div
                            key={p.id}
                            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-2 hover:bg-white dark:hover:bg-slate-900 hover:shadow-xs transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                                  <span>ADE {p.proposalNumber}</span>
                                  <button
                                    onClick={() => toastService.copyToClipboard(p.proposalNumber, 'ADE')}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                                    title="Copiar ADE"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded">
                                  {prod?.name}
                                </span>
                                {p.relatedPortabilityId && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/80 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded">
                                    <Link2 className="h-3 w-3" />
                                    <span>Vinculado a Portabilidade</span>
                                  </span>
                                )}
                              </div>

                              <StatusBadge status={status} />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                              <div>
                                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Banco</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{bank?.name}</span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Valor Liberado</span>
                                <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(p.disbursedValue || 0)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 block">Saldo Retornado</span>
                                <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                                  {formatCurrency(p.contractBalance || 0)}
                                </span>
                              </div>
                              <div className="text-right">
                                <button
                                  onClick={() => setDetailProposalId(p.id)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 cursor-pointer"
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
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full min-w-[680px] text-xs text-left">
                        <thead className="bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-3">ADE / Proposta</th>
                            <th className="p-3">Produto</th>
                            <th className="p-3">Banco</th>
                            <th className="p-3 text-right">Valor Liberado (Líq.)</th>
                            <th className="p-3 text-right">Saldo Devedor CIP</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                          {clientProposals.map(p => {
                            const prod = products.find(pr => pr.id === p.productId);
                            const bank = banks.find(b => b.id === p.bankId);
                            const status = (p as any).status || statuses.find(s => s.id === p.statusId || s.code === (p as any).status?.code);
                            return (
                              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">{p.proposalNumber}</td>
                                <td className="p-3 font-medium">{prod?.name}</td>
                                <td className="p-3">{bank?.name}</td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(p.disbursedValue || 0)}
                                </td>
                                <td className="p-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                                  {formatCurrency(p.contractBalance || 0)}
                                </td>
                                <td className="p-3">
                                  <StatusBadge status={status} />
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
                      <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 space-y-4 pl-4">
                        {clientHistory.map(h => (
                          <div key={h.id} className="relative">
                            <div className="absolute -left-[23px] top-0.5 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-white dark:ring-slate-900" />
                            <div className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-slate-100">{h.action}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{formatDate(h.createdAt)}</span>
                              </div>
                              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                                Status: <strong className="text-slate-800 dark:text-slate-200">{h.previousStatusName || 'Início'}</strong> → <strong className="text-blue-600 dark:text-blue-400">{h.newStatusName}</strong>
                              </p>
                              {h.observation && (
                                <p className="text-slate-500 dark:text-slate-400 italic text-[11px] mt-0.5 bg-slate-50 dark:bg-slate-900 p-1.5 rounded">
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
                    {canManageClientData ? (
                    <form onSubmit={handleAddDocument} className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <input
                        type="text"
                        value={docName}
                        onChange={e => setDocName(e.target.value)}
                        maxLength={180}
                        placeholder="Nome do Documento (Ex: RG_Frente.pdf)"
                        className="sm:col-span-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                        required
                      />
                      <select
                        value={docType}
                        onChange={e => setDocType(e.target.value as DocumentType)}
                        className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                      >
                        <option value="RG">RG</option>
                        <option value="CNH">CNH</option>
                        <option value="COMPROVANTE_RENDA">Comprovante de Renda / Contracheque</option>
                        <option value="EXTRATO_INSS">Extrato do INSS</option>
                        <option value="COMPROVANTE_RESIDENCIA">Comprovante de Residência</option>
                        <option value="CONTRATO_ASSINADO">Contrato Assinado</option>
                        <option value="PROCURACAO">Procuração</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                      <input
                        ref={documentFileInputRef}
                        type="file"
                        disabled={isUploadingDoc}
                        onChange={e => {
                          const file = e.target.files?.[0] || null;
                          setSelectedFile(file);
                          if (file && !docName) {
                            setDocName(file.name);
                          }
                        }}
                        className="text-xs text-slate-600 dark:text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 dark:file:bg-blue-950 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100"
                      />
                      <button
                        type="submit"
                        disabled={isUploadingDoc}
                        className="flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-1.5 px-3 rounded disabled:opacity-50 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{isUploadingDoc ? 'Enviando...' : 'Anexar'}</span>
                      </button>
                    </form>
                    ) : (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                        Seu perfil pode consultar documentos, mas não possui permissão para anexar novos arquivos.
                      </p>
                    )}

                    {/* Documents List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {clientDocuments.length === 0 ? (
                        <p className="text-xs text-slate-400 italic col-span-2 py-4 text-center">
                          Nenhum documento anexado para este cliente.
                        </p>
                      ) : (
                        clientDocuments.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-xs transition-all">
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-lg">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="overflow-hidden">
                                <span className="font-bold text-xs text-slate-900 dark:text-slate-100 block truncate">{doc.name}</span>
                                <span className="text-[10px] text-slate-400 block">{doc.type} • {doc.uploadedByUserName}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"
                                title="Abrir ou baixar"
                                aria-label={`Abrir ou baixar documento ${doc.name}`}
                              >
                                <Eye className="h-4 w-4" />
                              </a>
                              {canDeleteClientDocuments && <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded cursor-pointer"
                                title="Excluir"
                                aria-label={`Excluir documento ${doc.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>}
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
                    {canUpdateClientData ? <form onSubmit={handleSendCommunication} className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <MessageSquare className="h-4 w-4" />
                          <span>Disparo de Notificação WhatsApp</span>
                        </span>
                        <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {selectedClient.phone || selectedClient.whatsapp || 'Telefone não cadastrado'}
                        </span>
                      </div>
                      <textarea
                        value={waMessage}
                        onChange={e => setWaMessage(e.target.value)}
                        placeholder="Digite a mensagem para o cliente..."
                        className="w-full rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                        rows={2}
                        required
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 flex-wrap">
                          {['Aviso CIP', 'Aviso Saldo Retornado', 'Proposta Paga'].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setWaMessage(`Olá ${selectedClient.fullName}! Atualização da sua proposta: ${t}. Acompanhe com a nossa mesa de crédito.`)}
                              className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-800 cursor-pointer"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                        <button
                          type="submit"
                          disabled={isSendingCommunication || (!selectedClient.phone && !selectedClient.whatsapp)}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-1.5 px-3 rounded cursor-pointer"
                        >
                          <Send className={`h-3.5 w-3.5 ${isSendingCommunication ? 'animate-pulse' : ''}`} />
                          <span>{isSendingCommunication ? 'Preparando…' : 'Enviar Mensagem'}</span>
                        </button>
                      </div>
                    </form> : <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">Seu perfil pode consultar o histórico, mas não possui permissão para registrar comunicações.</p>}

                    {/* Messages History */}
                    <div className="space-y-2">
                      {clientCommunications.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4 text-center">
                          Nenhuma comunicação enviada ainda para este cliente.
                        </p>
                      ) : (
                        clientCommunications.map(comm => (
                          <div key={comm.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>{comm.templateName || 'WhatsApp'}</span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">{formatDate(comm.createdAt)}</span>
                            </div>
                            <p className="text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
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
                    {hasPermission(activeUser?.role, activeUser?.customPermissions, 'clients.update') ? <form onSubmit={handleAddNote} className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Adicionar nota interna sobre o cliente..."
                        maxLength={5000}
                        className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden"
                        rows={2}
                        required
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{noteText.length}/5.000</span>
                        <button
                          type="submit"
                          disabled={isSavingNote || !noteText.trim()}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-1.5 px-4 rounded disabled:opacity-50 cursor-pointer"
                        >
                          {isSavingNote ? 'Salvando...' : 'Salvar Nota'}
                        </button>
                      </div>
                    </form>
                      : <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">Seu perfil pode consultar as anotações, mas não possui permissão para adicionar novas notas.</p>}

                    <div className="space-y-2">
                      {clientNotes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-4 text-center">
                          Nenhuma anotação interna registrada para este cliente.
                        </p>
                      ) : (
                        clientNotes.map(n => (
                          <div key={n.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900 dark:text-slate-100">{n.authorName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{formatDate(n.createdAt)}</span>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded border border-slate-100 dark:border-slate-800">
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
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-12 text-center text-slate-400 text-xs">
              Selecione um cliente ao lado para ver sua ficha completa 360º.
            </div>
          )}
        </div>
      </div>

      {detailProposalId && (
        <ProposalDetailModal
          proposalId={detailProposalId}
          proposalIdsList={clientProposals.map(p => p.id)}
          onSelectProposal={setDetailProposalId}
          onClose={() => setDetailProposalId(null)}
          onProposalUpdated={() => {}}
        />
      )}
    </div>
  );
};
