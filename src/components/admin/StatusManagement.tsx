import {configurationColorValues} from '../../data/configurationColorValues';
import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Shield,
  CheckCircle2,
  AlertTriangle,
  X,
  Save,
  Info,
  Clock,
  Layers,
  Check,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { ProposalStatus, Alcada } from '../../types';
import { ActionBar } from '../ui/ActionBar';
import { hasPermission } from '../../lib/permissions';

const ALCADA_OPTIONS: { value: Alcada; label: string; color: string; desc: string }[] = [
  {
    value: 'CLIENTE',
    label: 'CLIENTE',
    color: 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]',
    desc: 'Pendência ou ação direta do cliente final (ex: formalização, biometria, assinar link).',
  },
  {
    value: 'PARCEIRO',
    label: 'PARCEIRO',
    color: 'bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]',
    desc: 'Ação pendente do Agente/Parceiro de vendas (ex: reenviar documentos, sanar divergência).',
  },
  {
    value: 'BANCO',
    label: 'BANCO',
    color: 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    desc: 'Aguardando processamento e retorno da instituição financeira / CIP / Dataprev.',
  },
  {
    value: 'NOSSA EQUIPE',
    label: 'NOSSA EQUIPE',
    color: 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    desc: 'Análise, digitação ou aprovação interna pela equipe da Corban / Mesa de Crédito.',
  },
  {
    value: 'SISTEMA',
    label: 'SISTEMA',
    color: 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] border-[var(--field-border)] dark:border-[var(--field-border)]',
    desc: 'Status automáticos ou conclusivos de encerramento da esteira (ex: Integrado, Pago, Cancelado).',
  },
];

const PRESET_COLORS = [
  configurationColorValues.color_64748b, // Slate
  configurationColorValues.color_eab308, // Yellow
  configurationColorValues.color_3b82f6, // Blue
  configurationColorValues.color_8b5cf6, // Purple
  configurationColorValues.color_10b981, // Emerald
  configurationColorValues.color_ef4444, // Red
  configurationColorValues.color_f97316, // Orange
  configurationColorValues.color_06b6d4, // Cyan
  configurationColorValues.color_22c55e, // Green
  configurationColorValues.color_ec4899, // Pink
  configurationColorValues.color_6366f1, // Indigo
  configurationColorValues.color_14b8a6, // Teal
];

export const StatusManagement: React.FC = () => {
  const activeUser = StorageService.getActiveUser();
  const canManageStatuses = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'statuses.manage');
  const [statuses, setStatuses] = useState<ProposalStatus[]>([]);
  const [editingStatus, setEditingStatus] = useState<ProposalStatus | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProposalStatus | null>(null);
  const [fallbackStatusId, setFallbackStatusId] = useState<string>('');
  const [proposalsCountMap, setProposalsCountMap] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formAlcada, setFormAlcada] = useState<Alcada>('NOSSA EQUIPE');
  const [formSlaHours, setFormSlaHours] = useState<number>(24);
  const [formColor, setFormColor] = useState(configurationColorValues.color_3b82f6);
  const [formActive, setFormActive] = useState(true);
  const [formFinalStatus, setFormFinalStatus] = useState(false);
  const [formManualAllowed, setFormManualAllowed] = useState(true);
  const [formAutoAllowed, setFormAutoAllowed] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const loadData = async () => {
    const list = await StorageService.fetchAndSyncStatuses();
    setStatuses(list);

    // Calculate proposal counts per status
    const proposals = StorageService.getProposals();
    const map: Record<string, number> = {};
    proposals.forEach(p => {
      map[p.statusId] = (map[p.statusId] || 0) + 1;
    });
    setProposalsCountMap(map);
  };

  useEffect(() => {
    loadData();
    const handleStorage = () => {
      const list = StorageService.getStatuses();
      setStatuses(list);
    };
    window.addEventListener('credit_gestao_storage_update', handleStorage);
    return () => window.removeEventListener('credit_gestao_storage_update', handleStorage);
  }, []);

  const openNewModal = () => {
    setEditingStatus(null);
    setFormName('');
    setFormCode('');
    setFormAlcada('NOSSA EQUIPE');
    setFormSlaHours(24);
    setFormColor(configurationColorValues.color_3b82f6);
    setFormActive(true);
    setFormFinalStatus(false);
    setFormManualAllowed(true);
    setFormAutoAllowed(true);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (s: ProposalStatus) => {
    setEditingStatus(s);
    setFormName(s.name);
    setFormCode(s.code);
    setFormAlcada(s.responsibleGroup || s.responsible);
    setFormSlaHours(s.slaHours || 0);
    setFormColor(s.color || configurationColorValues.color_3b82f6);
    setFormActive(s.active);
    setFormFinalStatus(s.finalStatus);
    setFormManualAllowed(s.manualChangeAllowed);
    setFormAutoAllowed(s.automaticChangeAllowed);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formName.trim()) {
      setErrorMsg('O nome do status é obrigatório.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingStatus) {
        await StorageService.updateStatusAsync(editingStatus.id, {
          name: formName,
          code: formCode || undefined,
          responsibleGroup: formAlcada,
          responsible: formAlcada,
          slaHours: Number(formSlaHours) || 0,
          color: formColor,
          active: formActive,
          finalStatus: formFinalStatus,
          manualChangeAllowed: formManualAllowed,
          automaticChangeAllowed: formAutoAllowed,
        });
        setSuccessMsg(`Status "${formName.toUpperCase()}" atualizado com sucesso no banco de dados.`);
      } else {
        await StorageService.addStatusAsync({
          name: formName,
          code: formCode || undefined,
          responsibleGroup: formAlcada,
          slaHours: Number(formSlaHours) || 0,
          color: formColor,
          active: formActive,
          finalStatus: formFinalStatus,
          manualChangeAllowed: formManualAllowed,
          automaticChangeAllowed: formAutoAllowed,
        });
        setSuccessMsg(`Novo status "${formName.toUpperCase()}" cadastrado com sucesso no banco de dados.`);
      }

      setIsModalOpen(false);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar o status no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAlcadaChange = async (statusId: string, newAlcada: Alcada) => {
    try {
      await StorageService.updateStatusAsync(statusId, {
        responsibleGroup: newAlcada,
        responsible: newAlcada,
      });
      await loadData();
      setSuccessMsg(`Alçada alterada para ${newAlcada} e salva no PostgreSQL.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar alçada.');
    }
  };

  const handleMoveOrder = async (id: string, direction: 'UP' | 'DOWN') => {
    const idx = statuses.findIndex(s => s.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= statuses.length) return;

    const currentList = [...statuses];
    const tempOrder = currentList[idx].order;
    currentList[idx].order = currentList[targetIdx].order;
    currentList[targetIdx].order = tempOrder;

    const itemsToReorder = currentList.map((s, i) => ({ id: s.id, order: s.order || i + 1 }));

    try {
      await StorageService.reorderStatusesAsync(itemsToReorder);
      await loadData();
    } catch (err: any) {
      console.error('Erro ao reordenar status:', err);
      alert(err.message || 'Erro ao reordenar status.');
    }
  };

  const handleDeleteRequest = (s: ProposalStatus) => {
    setDeleteTarget(s);
    setErrorMsg(null);

    // Find fallback status if proposals exist
    const count = proposalsCountMap[s.id] || 0;
    if (count > 0) {
      const other = statuses.find(st => st.id !== s.id);
      if (other) setFallbackStatusId(other.id);
    } else {
      setFallbackStatusId('');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setIsSaving(true);
    try {
      await StorageService.deleteStatusAsync(deleteTarget.id, fallbackStatusId || undefined);
      setSuccessMsg(`Status "${deleteTarget.name}" excluído com sucesso do PostgreSQL.`);
      setDeleteTarget(null);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir status.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <ActionBar
        title="Gestão de Status & Alçadas da Esteira"
        subtitle="Cadastre novos status, defina alçadas de responsabilidade, ajuste prazos de SLA e organize a esteira operacional"
        badgeText={`${statuses.length} STATUS ATIVOS`}
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
        actions={canManageStatuses ? (
          <button
            onClick={openNewModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] px-4 py-2 text-xs font-bold  transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Cadastrar Novo Status</span>
          </button>
        ) : undefined}
      />

      {/* Success Notification */}
      {successMsg && (
        <div className="rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] p-3 text-xs text-[var(--success-text)] dark:text-[var(--success-text)] flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-[var(--success-text)] shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Alçada Explanatory Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {ALCADA_OPTIONS.map(opt => (
          <div
            key={opt.value}
            className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3  space-y-1.5"
          >
            <span
              className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${opt.color}`}
            >
              {opt.label}
            </span>
            <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] leading-tight">
              {opt.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Main Statuses Table */}
      <div className="rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  overflow-hidden">
        <div className="p-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Esteira de Produção ({statuses.length} status cadastrados)
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">
            Alçadas e SLAs controlam o painel Kanban e alertas de gargalo
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-3 py-3 text-center w-16">Ordem</th>
                <th className="px-4 py-3">Nome do Status</th>
                <th className="px-3 py-3">Código no Sistema</th>
                <th className="px-4 py-3">Alçada Responsável</th>
                <th className="px-3 py-3 text-center">SLA (Horas)</th>
                <th className="px-3 py-3 text-center">Propostas</th>
                <th className="px-3 py-3 text-center">Configurações</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {statuses.map((s, index) => {
                const alcadaConfig = ALCADA_OPTIONS.find(a => a.value === (s.responsibleGroup || s.responsible));
                const count = proposalsCountMap[s.id] || 0;

                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors ${
                      !s.active ? 'opacity-50 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)]' : ''
                    }`}
                  >
                    {/* Order & Reordering */}
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-bold font-mono text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs">
                          #{s.order}
                        </span>
                        {canManageStatuses && <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveOrder(s.id, 'UP')}
                            className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] disabled:opacity-90 cursor-pointer"
                            title="Mover para cima na esteira"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === statuses.length - 1}
                            onClick={() => handleMoveOrder(s.id, 'DOWN')}
                            className="p-0.5 rounded hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] disabled:opacity-90 cursor-pointer"
                            title="Mover para baixo na esteira"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>}
                      </div>
                    </td>

                    {/* Name & Badge color */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3.5 w-3.5 rounded-full shrink-0  ring-1 ring-[var(--focus)]"
                          style={{ backgroundColor: s.color || "var(--bg-surface)" }}
                        />
                        <div>
                          <div className="font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs">
                            {s.name}
                          </div>
                          {!s.active && (
                            <span className="text-[9px] font-bold text-[var(--danger-text)] uppercase">
                              (Inativo)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Code */}
                    <td className="px-3 py-3 font-mono text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                      {s.code}
                    </td>

                    {/* Alçada Responsável (With quick change selector) */}
                    <td className="px-4 py-3">
                      {canManageStatuses ? <select
                        value={s.responsibleGroup || s.responsible}
                        onChange={e => handleQuickAlcadaChange(s.id, e.target.value as Alcada)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[var(--focus)] ${
                          alcadaConfig?.color || 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]'
                        }`}
                        title="Clique para alterar a alçada responsável deste status"
                      >
                        {ALCADA_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {opt.label}
                          </option>
                        ))}
                      </select> : <span className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{s.responsibleGroup || s.responsible}</span>}
                    </td>

                    {/* SLA Hours */}
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono font-bold text-[11px]">
                        <Clock className="h-3 w-3 text-[var(--text-secondary)]" />
                        <span>
                          {s.code === 'AGUARDAR_RETORNO_CIP'
                            ? '5 dias úteis'
                            : s.code === 'AGUARDAR_PORTABILIDADE'
                            ? 'N/A'
                            : s.slaHours ? `${s.slaHours}h` : 'Sem SLA'}
                        </span>
                      </div>
                    </td>

                    {/* Propostas no status */}
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                          count > 0
                            ? 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                            : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)]'
                        }`}
                      >
                        {count} {count === 1 ? 'proposta' : 'propostas'}
                      </span>
                    </td>

                    {/* Config Flags */}
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {s.finalStatus && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] text-[9px] font-bold uppercase"
                            title="Status Finalizador (Conclusivo)"
                          >
                            Final
                          </span>
                        )}
                        {s.manualChangeAllowed && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)] text-[9px] font-bold"
                            title="Permite Troca Manual"
                          >
                            Manual
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManageStatuses && <button
                          onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:text-[var(--link)] dark:hover:text-[var(--link)] transition-colors cursor-pointer"
                          title="Editar Status"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>}
                        {canManageStatuses && <button
                          onClick={() => handleDeleteRequest(s)}
                          className="p-1.5 rounded-lg border border-[var(--danger-border)] dark:border-[var(--danger-border)] hover:bg-[var(--danger-bg)] dark:hover:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] transition-colors cursor-pointer"
                          title="Excluir Status"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create / Edit Status */}
      {isModalOpen && canManageStatuses && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  relative">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-[var(--link)] dark:text-[var(--link)]" />
                <h3 className="text-base font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {editingStatus ? 'Editar Status da Esteira' : 'Cadastrar Novo Status'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--danger-text)] shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Nome do Status */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Nome do Status *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => {
                    setFormName(e.target.value);
                    if (!editingStatus) {
                      setFormCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
                    }
                  }}
                  placeholder="EX: PENDENTE DE ASSINATURA"
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden"
                  required
                />
              </div>

              {/* Código do Sistema */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Código Único do Sistema *
                </label>
                <input
                  type="text"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="EX: PENDENTE_ASSINATURA"
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden"
                  required
                />
                <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                  Identificador sem espaços usado em automações, relatórios e importação Excel.
                </span>
              </div>

              {/* Alçada Responsável */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                  Alçada Responsável *
                </label>
                <select
                  value={formAlcada}
                  onChange={e => setFormAlcada(e.target.value as Alcada)}
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden"
                >
                  {ALCADA_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.desc}
                    </option>
                  ))}
                </select>
              </div>

              {/* SLA & Cor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    SLA Padrão (Horas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="720"
                    value={formSlaHours}
                    onChange={e => setFormSlaHours(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:border-[var(--field-border)] focus:ring-1 focus:ring-[var(--focus)] focus:outline-hidden"
                  />
                  <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                    Defina 0 horas para status conclusivos sem estouro de SLA.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1">
                    Cor de Destaque
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formColor}
                      onChange={e => setFormColor(e.target.value)}
                      className="h-9 w-12 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-transparent p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formColor}
                      onChange={e => setFormColor(e.target.value)}
                      className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-mono text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Color Presets */}
              <div>
                <span className="text-[10px] font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] block mb-1">
                  Paleta de Cores Sugerida:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`h-6 w-6 rounded-full border border-[var(--field-border)] transition-transform cursor-pointer hover:scale-110 flex items-center justify-center ${
                        formColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-[var(--focus)] scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {formColor.toLowerCase() === c.toLowerCase() && (
                        <Check className="h-3 w-3 text-[var(--text-primary)] drop-shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkbox Flags */}
              <div className="pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={e => setFormActive(e.target.checked)}
                    className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-4 w-4"
                  />
                  <span>Status Ativo na Esteira</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={formFinalStatus}
                    onChange={e => setFormFinalStatus(e.target.checked)}
                    className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-4 w-4"
                  />
                  <span>Status Finalizador (Conclusão de proposta, ex: Pago, Cancelado, Reprovado)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={formManualAllowed}
                    onChange={e => setFormManualAllowed(e.target.checked)}
                    className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-[var(--focus)] h-4 w-4"
                  />
                  <span>Permitir Troca Manual pelos Usuários da Esteira</span>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] disabled:opacity-90 px-4 py-2 text-xs font-bold text-[var(--action-ink)]   transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? 'Salvando no Banco...' : editingStatus ? 'Salvar Alterações' : 'Cadastrar Status'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete & Migration */}
      {deleteTarget && canManageStatuses && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  relative">
            <div className="flex items-center gap-3 text-[var(--danger-text)] dark:text-[var(--danger-text)] mb-3">
              <div className="p-2 rounded-xl bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Excluir Status "{deleteTarget.name}"?
              </h3>
            </div>

            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-4 leading-relaxed">
              Tem certeza que deseja excluir o status <strong className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{deleteTarget.name}</strong>? Esta ação removerá a coluna da esteira Kanban.
            </p>

            {/* Check if proposals are bound */}
            {(proposalsCountMap[deleteTarget.id] || 0) > 0 ? (
              <div className="mb-4 p-3 rounded-xl border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-xs space-y-2">
                <div className="font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-[var(--warning-text)] dark:text-[var(--warning-text)]" />
                  <span>Atenção: Propostas Vinculadas</span>
                </div>
                <p className="text-[var(--warning-text)] dark:text-[var(--warning-text)] text-[11px]">
                  Existem <strong>{proposalsCountMap[deleteTarget.id]} propostas</strong> atualmente neste status. Escolha para qual status elas devem ser migradas antes de confirmar a exclusão:
                </p>

                <select
                  value={fallbackStatusId}
                  onChange={e => setFallbackStatusId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                  required
                >
                  {statuses
                    .filter(s => s.id !== deleteTarget.id)
                    .map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                </select>
              </div>
            ) : null}

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)]">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isSaving}
                className="rounded-xl bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] disabled:opacity-90 px-4 py-2 text-xs font-bold text-[var(--danger-text)]   transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isSaving ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
