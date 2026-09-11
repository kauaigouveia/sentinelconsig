import React, { useState } from 'react';
import {
  X,
  Clock,
  User,
  Building,
  CreditCard,
  FileText,
  AlertCircle,
  CheckCircle2,
  Send,
  Link2,
  Calendar,
  Layers,
  Shield,
  MessageSquare,
  Trash2,
  Edit3,
  DollarSign,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatDate, formatCpf, extractPartnerCode, formatCurrency, parseCurrency } from '../../lib/utils';
import { Proposal, Status, PendencyType, PendencyPriority } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

interface ProposalDetailModalProps {
  proposalId: string | null;
  onClose: () => void;
  onProposalUpdated: () => void;
}

export const ProposalDetailModal: React.FC<ProposalDetailModalProps> = ({
  proposalId,
  onClose,
  onProposalUpdated,
}) => {
  if (!proposalId) return null;

  const proposal = StorageService.getProposalById(proposalId);
  const activeUser = StorageService.getActiveUser();

  if (!proposal) return null;

  const client = StorageService.getClients().find(c => c.id === proposal.clientId);
  const product = StorageService.getProducts().find(p => p.id === proposal.productId);
  const bank = StorageService.getBanks().find(b => b.id === proposal.bankId);
  const promoter = StorageService.getPromoters().find(p => p.id === proposal.promoterId);
  const partner = StorageService.getPartners().find(p => p.id === proposal.partnerId);
  const currentStatus = StorageService.getStatuses().find(s => s.id === proposal.statusId);
  const digitizer = StorageService.getUsers().find(u => u.id === proposal.digitizerId);
  const allStatuses = StorageService.getStatuses().filter(s => s.active);

  // Related proposals of this client
  const otherClientProposals = StorageService.getProposalsByClientId(proposal.clientId).filter(
    p => p.id !== proposal.id
  );

  // Related Refin / Portability
  const relatedPort = proposal.relatedPortabilityId
    ? StorageService.getProposalById(proposal.relatedPortabilityId)
    : null;

  // Active tab in modal
  const [activeTab, setActiveTab] = useState<'HISTORICO' | 'PENDENCIAS' | 'COMENTARIOS' | 'CLIENTE'>('HISTORICO');

  // Status update form
  const [selectedStatusId, setSelectedStatusId] = useState(proposal.statusId);
  const [statusObservation, setStatusObservation] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState(false);

  // New Pendency Form
  const [pendencyType, setPendencyType] = useState<PendencyType>('DOCUMENTACAO');
  const [pendencyDesc, setPendencyDesc] = useState('');
  const [pendencyPriority, setPendencyPriority] = useState<PendencyPriority>('NORMAL');

  // New Comment Form
  const [commentText, setCommentText] = useState('');

  // Financial values editing
  const [isEditingFinancials, setIsEditingFinancials] = useState(false);
  const [editDisbursedStr, setEditDisbursedStr] = useState(
    proposal.disbursedValue !== undefined ? String(proposal.disbursedValue) : ''
  );
  const [editBalanceStr, setEditBalanceStr] = useState(
    proposal.contractBalance !== undefined ? String(proposal.contractBalance) : ''
  );
  const [financialsSuccess, setFinancialsSuccess] = useState(false);

  const handleSaveFinancials = () => {
    const parsedDisbursed = editDisbursedStr.trim() ? parseCurrency(editDisbursedStr) : undefined;
    const parsedBalance = editBalanceStr.trim() ? parseCurrency(editBalanceStr) : undefined;

    try {
      StorageService.updateProposalFinancials(
        proposal.id,
        {
          disbursedValue: parsedDisbursed,
          contractBalance: parsedBalance,
        },
        'MANUAL'
      );
      setFinancialsSuccess(true);
      setTimeout(() => {
        setFinancialsSuccess(false);
        setIsEditingFinancials(false);
        onProposalUpdated();
      }, 800);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar valores da proposta.');
    }
  };

  const handleUpdateStatus = () => {
    if (selectedStatusId === proposal.statusId && !statusObservation) return;

    setStatusUpdating(true);
    try {
      StorageService.updateProposalStatus(
        proposal.id,
        selectedStatusId,
        statusObservation || undefined,
        activeUser,
        'MANUAL'
      );
      setStatusSuccess(true);
      setStatusObservation('');
      setTimeout(() => {
        setStatusSuccess(false);
        setStatusUpdating(false);
        onProposalUpdated();
      }, 1000);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status.');
      setStatusUpdating(false);
    }
  };

  const handleAddPendency = () => {
    if (!pendencyDesc.trim()) return;
    StorageService.addPendency({
      proposalId: proposal.id,
      type: pendencyType,
      description: pendencyDesc.trim(),
      priority: pendencyPriority,
    });
    setPendencyDesc('');
    onProposalUpdated();
  };

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    itemType: string;
    itemName: string;
    description?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    itemType: '',
    itemName: '',
    onConfirm: () => {},
  });

  const handleResolvePendency = (pendencyId: string) => {
    StorageService.resolvePendency(pendencyId, 'Resolvido pelo usuário');
    onProposalUpdated();
  };

  const handleDeletePendency = (pen: { id: string; type: string; description: string }) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Pendência Operacional',
      itemName: `${pen.type}: ${pen.description}`,
      description: 'A pendência será removida da proposta definitivamente.',
      onConfirm: () => {
        try {
          StorageService.deletePendency(pen.id);
          onProposalUpdated();
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir pendência.');
        }
      },
    });
  };

  const handleDeleteProposal = () => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Proposta de Crédito',
      itemName: `ADE ${proposal.proposalNumber}`,
      description: 'A exclusão removerá o registro e todos os históricos, pendências e comentários vinculados.',
      onConfirm: () => {
        try {
          StorageService.deleteProposal(proposal.id);
          onProposalUpdated();
          onClose();
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir proposta.');
        }
      },
    });
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    StorageService.addComment({
      proposalId: proposal.id,
      text: commentText.trim(),
    });
    setCommentText('');
    onProposalUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[92vh] border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: currentStatus?.color || '#3b82f6' }}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 font-mono">
                  ADE {proposal.proposalNumber}
                </h2>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs"
                  style={{ backgroundColor: currentStatus?.color || '#64748b' }}
                >
                  {currentStatus?.name}
                </span>
                <span className="text-xs text-slate-400">|</span>
                <span className="text-xs font-semibold text-slate-600">
                  Alçada: {currentStatus?.responsible}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Cliente: <strong className="text-slate-800">{client?.fullName || 'CLIENTE NÃO NOMEADO'}</strong> {client?.cpf ? `(${formatCpf(client.cpf)})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 bg-white border-b border-slate-100 text-xs text-slate-600">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Produto</span>
            <span className="font-semibold text-slate-900">{product?.name}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Banco × Promotora</span>
            <span className="font-semibold text-slate-900">
              {bank?.name} / {promoter?.name}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Parceiro</span>
            <span className="font-semibold text-slate-900">
              {partner?.login} ({partner ? extractPartnerCode(partner.login) : ''})
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Digitador / Data</span>
            <span className="font-medium text-slate-800">
              {digitizer?.name} • {formatDate(proposal.createdAt)}
            </span>
          </div>
        </div>

        {/* Financial Information Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-500">
                Valor Liberado Cliente:
              </span>
              <span className="font-mono font-bold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {proposal.disbursedValue !== undefined ? formatCurrency(proposal.disbursedValue) : 'Não informado'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-500">
                Saldo Contrato (Portabilidade):
              </span>
              <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {proposal.contractBalance !== undefined ? formatCurrency(proposal.contractBalance) : 'Não informado'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsEditingFinancials(prev => !prev)}
            className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-white border border-slate-300 hover:border-blue-400 px-2.5 py-1 rounded-md transition-colors"
          >
            <Edit3 className="h-3 w-3" />
            <span>{isEditingFinancials ? 'Cancelar Edição' : 'Ajustar Valores'}</span>
          </button>
        </div>

        {/* Financial Inline Form */}
        {isEditingFinancials && (
          <div className="px-6 py-3 bg-blue-50/60 border-b border-blue-200 flex flex-wrap items-end gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-700 mb-1">
                Valor Liberado para Cliente (R$)
              </label>
              <input
                type="text"
                value={editDisbursedStr}
                onChange={e => setEditDisbursedStr(e.target.value)}
                placeholder="Ex: 1.250,00"
                className="w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-700 mb-1">
                Saldo do Contrato / Quitação (R$)
              </label>
              <input
                type="text"
                value={editBalanceStr}
                onChange={e => setEditBalanceStr(e.target.value)}
                placeholder="Ex: 15.420,00"
                className="w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <button
              onClick={handleSaveFinancials}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Salvar Valores</span>
            </button>
            {financialsSuccess && (
              <span className="text-emerald-700 font-bold text-xs py-1">Valores atualizados com sucesso!</span>
            )}
          </div>
        )}

        {/* Related Portability Banner if exists */}
        {relatedPort && (
          <div className="px-6 py-2 bg-purple-50 border-b border-purple-200 flex items-center justify-between text-xs text-purple-900">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-purple-600" />
              <span>
                Esta proposta é um <strong>REFIN DA PORTABILIDADE</strong> vinculado à Portabilidade ADE: <strong>{relatedPort.proposalNumber}</strong>
              </span>
            </div>
            <span className="bg-purple-200 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">
              VÍNCULO ATIVO
            </span>
          </div>
        )}

        {/* Status Update Action Bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Alterar Status da Proposta
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedStatusId}
              onChange={e => setSelectedStatusId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              {allStatuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.responsible})
                </option>
              ))}
            </select>

            <input
              type="text"
              value={statusObservation}
              onChange={e => setStatusObservation(e.target.value)}
              placeholder="Motivo / Observação da alteração..."
              className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />

            <button
              onClick={handleUpdateStatus}
              disabled={statusUpdating}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-1.5 text-xs font-bold text-white transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{statusUpdating ? 'Gravando...' : 'Gravar Novo Status'}</span>
            </button>
          </div>
          {statusSuccess && (
            <p className="text-[11px] text-emerald-600 font-semibold mt-1">
              Status atualizado com sucesso e registrado na linha do tempo!
            </p>
          )}
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-200 px-6 gap-6 text-xs font-semibold text-slate-500">
          <button
            onClick={() => setActiveTab('HISTORICO')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'HISTORICO'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent hover:text-slate-800'
            }`}
          >
            Histórico de Status ({proposal.statusHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('PENDENCIAS')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'PENDENCIAS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent hover:text-slate-800'
            }`}
          >
            Pendências ({proposal.pendencies.length})
          </button>
          <button
            onClick={() => setActiveTab('COMENTARIOS')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'COMENTARIOS'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent hover:text-slate-800'
            }`}
          >
            Comentários Internos ({proposal.comments.length})
          </button>
          <button
            onClick={() => setActiveTab('CLIENTE')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'CLIENTE'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent hover:text-slate-800'
            }`}
          >
            Outras Propostas do Cliente ({otherClientProposals.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: HISTÓRICO */}
          {activeTab === 'HISTORICO' && (
            <div className="space-y-4">
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {proposal.statusHistory.map((item, idx) => {
                  const s = StorageService.getStatusById(item.newStatusId);
                  return (
                    <div key={item.id || idx} className="relative group">
                      <div
                        className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full ring-4 ring-white"
                        style={{ backgroundColor: s?.color || '#3b82f6' }}
                      />
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                        <div className="flex items-center justify-between font-semibold text-slate-800 mb-1">
                          <span className="text-sm font-bold">{s?.name || 'Status'}</span>
                          <span className="text-slate-400 text-[11px]">
                            {formatDate(item.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-500 text-[11px] mb-1.5">
                          <span>
                            Alterado por: <strong>{item.userName}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Origem: <strong className="text-blue-600">{item.origin}</strong>
                          </span>
                          <span>•</span>
                          <span>Alçada: {s?.responsible}</span>
                        </div>
                        {item.observation && (
                          <p className="rounded bg-white p-2 text-slate-700 border border-slate-100 italic">
                            "{item.observation}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PENDÊNCIAS */}
          {activeTab === 'PENDENCIAS' && (
            <div className="space-y-6">
              {/* Add Pendency Form */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <h4 className="text-xs font-bold text-amber-900 uppercase mb-2">
                  Abrir Nova Pendência
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                  <select
                    value={pendencyType}
                    onChange={e => setPendencyType(e.target.value as any)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="DOCUMENTACAO">DOCUMENTAÇÃO</option>
                    <option value="BANCO">BANCO</option>
                    <option value="PARCEIRO">PARCEIRO</option>
                    <option value="CLIENTE">CLIENTE</option>
                    <option value="CORBAN">CORBAN</option>
                    <option value="CIP">CIP</option>
                    <option value="SISTEMA">SISTEMA</option>
                  </select>

                  <select
                    value={pendencyPriority}
                    onChange={e => setPendencyPriority(e.target.value as any)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="BAIXA">PRIORIDADE BAIXA</option>
                    <option value="NORMAL">PRIORIDADE NORMAL</option>
                    <option value="ALTA">PRIORIDADE ALTA</option>
                    <option value="URGENTE">URGENTE</option>
                  </select>

                  <button
                    onClick={handleAddPendency}
                    className="rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 transition-colors"
                  >
                    + Registrar Pendência
                  </button>
                </div>
                <input
                  type="text"
                  value={pendencyDesc}
                  onChange={e => setPendencyDesc(e.target.value)}
                  placeholder="Descreva o motivo da pendência (ex: Comprovante de endereço ilegível)..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              {/* List */}
              <div className="space-y-2">
                {proposal.pendencies.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">
                    Nenhuma pendência ativa nesta proposta.
                  </p>
                ) : (
                  proposal.pendencies.map(pen => (
                    <div
                      key={pen.id}
                      className={`flex items-start justify-between rounded-lg border p-3 text-xs ${
                        pen.status === 'RESOLVIDA'
                          ? 'border-emerald-200 bg-emerald-50/40 text-slate-500'
                          : 'border-rose-200 bg-rose-50/40 text-slate-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              pen.status === 'RESOLVIDA'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {pen.status}
                          </span>
                          <span className="font-bold text-slate-700">{pen.type}</span>
                          <span className="text-slate-400 text-[10px]">
                            {formatDate(pen.openedAt)}
                          </span>
                        </div>
                        <p className="font-medium">{pen.description}</p>
                        {pen.resolvedAt && (
                          <p className="text-[11px] text-emerald-700">
                            Resolvido em: {formatDate(pen.resolvedAt)} {pen.resolvedByUserName ? `por ${pen.resolvedByUserName}` : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {pen.status === 'ABERTA' && (
                          <button
                            onClick={() => handleResolvePendency(pen.id)}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            Resolver
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePendency(pen)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                          title="Excluir pendência"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COMENTÁRIOS INTERNOS */}
          {activeTab === 'COMENTARIOS' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Escreva um comentário interno (visível apenas para a equipe)..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  onClick={handleAddComment}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar</span>
                </button>
              </div>

              <div className="space-y-2">
                {proposal.comments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">
                    Nenhum comentário registrado ainda.
                  </p>
                ) : (
                  proposal.comments.map(c => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-bold text-slate-800">{c.userName}</span>
                        <span>{formatDate(c.createdAt)}</span>
                      </div>
                      <p className="text-slate-800">{c.comment}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CLIENTE 360 & OUTRAS PROPOSTAS */}
          {activeTab === 'CLIENTE' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
                <h4 className="text-xs font-bold uppercase text-slate-700 mb-2">
                  Dados do Cliente
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <span className="text-slate-400 block">Nome Completo:</span>
                    <strong className="text-slate-800">{client?.fullName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">CPF:</span>
                    <strong className="text-slate-800">{formatCpf(client?.cpf || '')}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Telefone:</span>
                    <span className="text-slate-800">{client?.phone || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">E-mail:</span>
                    <span className="text-slate-800">{client?.email || 'Não informado'}</span>
                  </div>
                </div>
              </div>

              <h4 className="text-xs font-bold uppercase text-slate-700">
                Demais Propostas Cadastradas para este CPF ({otherClientProposals.length})
              </h4>

              {otherClientProposals.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                  Este cliente possui apenas esta proposta cadastrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {otherClientProposals.map(p => {
                    const st = StorageService.getStatusById(p.statusId);
                    const prod = StorageService.getProducts().find(pr => pr.id === p.productId);
                    const bk = StorageService.getBanks().find(b => b.id === p.bankId);
                    const pt = StorageService.getPartners().find(pt => pt.id === p.partnerId);

                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-2xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-mono font-bold text-slate-900">
                            <span>ADE {p.proposalNumber}</span>
                            <span className="font-sans text-[11px] font-semibold text-blue-600">
                              • {prod?.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Banco: {bk?.name} | Parceiro: {pt?.login} ({pt ? extractPartnerCode(pt.login) : ''})
                          </p>
                        </div>

                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ backgroundColor: st?.color || '#64748b' }}
                        >
                          {st?.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-xl">
          <button
            onClick={handleDeleteProposal}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors"
            title="Excluir proposta permanentemente"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Excluir Proposta</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-white border border-slate-300 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalConfig.onConfirm}
        itemType={deleteModalConfig.itemType}
        itemName={deleteModalConfig.itemName}
        description={deleteModalConfig.description}
      />
    </div>
  );
};
