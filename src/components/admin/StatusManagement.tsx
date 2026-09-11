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

const ALCADA_OPTIONS: { value: Alcada; label: string; color: string; desc: string }[] = [
  {
    value: 'CLIENTE',
    label: 'CLIENTE',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300 dark:border-orange-800',
    desc: 'Pendência ou ação direta do cliente final (ex: formalização, biometria, assinar link).',
  },
  {
    value: 'PARCEIRO',
    label: 'PARCEIRO',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    desc: 'Ação pendente do Agente/Parceiro de vendas (ex: reenviar documentos, sanar divergência).',
  },
  {
    value: 'BANCO',
    label: 'BANCO',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    desc: 'Aguardando processamento e retorno da instituição financeira / CIP / Dataprev.',
  },
  {
    value: 'NOSSA EQUIPE',
    label: 'NOSSA EQUIPE',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    desc: 'Análise, digitação ou aprovação interna pela equipe da Corban / Mesa de Crédito.',
  },
  {
    value: 'SISTEMA',
    label: 'SISTEMA',
    color: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
    desc: 'Status automáticos ou conclusivos de encerramento da esteira (ex: Integrado, Pago, Cancelado).',
  },
];

const PRESET_COLORS = [
  '#64748b', // Slate
  '#eab308', // Yellow
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#10b981', // Emerald
  '#ef4444', // Red
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#22c55e', // Green
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

export const StatusManagement: React.FC = () => {
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
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formActive, setFormActive] = useState(true);
  const [formFinalStatus, setFormFinalStatus] = useState(false);
  const [formManualAllowed, setFormManualAllowed] = useState(true);
  const [formAutoAllowed, setFormAutoAllowed] = useState(true);

  const loadData = () => {
    const list = StorageService.getStatuses();
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
    const handleStorage = () => loadData();
    window.addEventListener('credit_gestao_storage_update', handleStorage);
    return () => window.removeEventListener('credit_gestao_storage_update', handleStorage);
  }, []);

  const openNewModal = () => {
    setEditingStatus(null);
    setFormName('');
    setFormCode('');
    setFormAlcada('NOSSA EQUIPE');
    setFormSlaHours(24);
    setFormColor('#3b82f6');
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
    setFormColor(s.color || '#3b82f6');
    setFormActive(s.active);
    setFormFinalStatus(s.finalStatus);
    setFormManualAllowed(s.manualChangeAllowed);
    setFormAutoAllowed(s.automaticChangeAllowed);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formName.trim()) {
      setErrorMsg('O nome do status é obrigatório.');
      return;
    }

    try {
      if (editingStatus) {
        StorageService.updateStatus(editingStatus.id, {
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
        setSuccessMsg(`Status "${formName.toUpperCase()}" atualizado com sucesso.`);
      } else {
        StorageService.addStatus({
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
        setSuccessMsg(`Novo status "${formName.toUpperCase()}" cadastrado com sucesso.`);
      }

      setIsModalOpen(false);
      loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar o status.');
    }
  };

  const handleQuickAlcadaChange = (statusId: string, newAlcada: Alcada) => {
    try {
      StorageService.updateStatus(statusId, {
        responsibleGroup: newAlcada,
        responsible: newAlcada,
      });
      loadData();
      setSuccessMsg(`Alçada alterada para ${newAlcada}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar alçada.');
    }
  };

  const handleMoveOrder = (id: string, direction: 'UP' | 'DOWN') => {
    StorageService.moveStatusOrder(id, direction);
    loadData();
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

  const confirmDelete = () => {
    if (!deleteTarget) return;

    try {
      StorageService.deleteStatus(deleteTarget.id, fallbackStatusId || undefined);
      setSuccessMsg(`Status "${deleteTarget.name}" excluído com sucesso.`);
      setDeleteTarget(null);
      loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>Gestão de Status & Alçadas da Esteira</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cadastre novos status, defina alçadas de responsabilidade, ajuste prazos de SLA e organize a esteira Kanban
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 text-xs font-bold shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Cadastrar Novo Status</span>
        </button>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Alçada Explanatory Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {ALCADA_OPTIONS.map(opt => (
          <div
            key={opt.value}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs space-y-1.5"
          >
            <span
              className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${opt.color}`}
            >
              {opt.label}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              {opt.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Main Statuses Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Esteira de Produção ({statuses.length} status cadastrados)
            </span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Alçadas e SLAs controlam o painel Kanban e alertas de gargalo
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100/70 dark:bg-slate-800/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {statuses.map((s, index) => {
                const alcadaConfig = ALCADA_OPTIONS.find(a => a.value === (s.responsibleGroup || s.responsible));
                const count = proposalsCountMap[s.id] || 0;

                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                      !s.active ? 'opacity-50 bg-slate-50/40 dark:bg-slate-900/40' : ''
                    }`}
                  >
                    {/* Order & Reordering */}
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-bold font-mono text-slate-400 dark:text-slate-500 text-xs">
                          #{s.order}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveOrder(s.id, 'UP')}
                            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                            title="Mover para cima na esteira"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === statuses.length - 1}
                            onClick={() => handleMoveOrder(s.id, 'DOWN')}
                            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 cursor-pointer"
                            title="Mover para baixo na esteira"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Name & Badge color */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3.5 w-3.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10"
                          style={{ backgroundColor: s.color || '#3b82f6' }}
                        />
                        <div>
                          <div className="font-extrabold text-slate-900 dark:text-white text-xs">
                            {s.name}
                          </div>
                          {!s.active && (
                            <span className="text-[9px] font-bold text-rose-500 uppercase">
                              (Inativo)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Code */}
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {s.code}
                    </td>

                    {/* Alçada Responsável (With quick change selector) */}
                    <td className="px-4 py-3">
                      <select
                        value={s.responsibleGroup || s.responsible}
                        onChange={e => handleQuickAlcadaChange(s.id, e.target.value as Alcada)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${
                          alcadaConfig?.color || 'bg-slate-100 text-slate-800'
                        }`}
                        title="Clique para alterar a alçada responsável deste status"
                      >
                        {ALCADA_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* SLA Hours */}
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold text-[11px]">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>{s.slaHours ? `${s.slaHours}h` : 'Sem SLA'}</span>
                      </div>
                    </td>

                    {/* Propostas no status */}
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                          count > 0
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
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
                            className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 text-[9px] font-bold uppercase"
                            title="Status Finalizador (Conclusivo)"
                          >
                            Final
                          </span>
                        )}
                        {s.manualChangeAllowed && (
                          <span
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[9px] font-bold"
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
                        <button
                          onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          title="Editar Status"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRequest(s)}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                          title="Excluir Status"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {editingStatus ? 'Editar Status da Esteira' : 'Cadastrar Novo Status'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Nome do Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              {/* Código do Sistema */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Código Único do Sistema *
                </label>
                <input
                  type="text"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="EX: PENDENTE_ASSINATURA"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Identificador sem espaços usado em automações, relatórios e importação Excel.
                </span>
              </div>

              {/* Alçada Responsável */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alçada Responsável *
                </label>
                <select
                  value={formAlcada}
                  onChange={e => setFormAlcada(e.target.value as Alcada)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    SLA Padrão (Horas)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="720"
                    value={formSlaHours}
                    onChange={e => setFormSlaHours(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Defina 0 horas para status conclusivos sem estouro de SLA.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cor de Destaque
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formColor}
                      onChange={e => setFormColor(e.target.value)}
                      className="h-9 w-12 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formColor}
                      onChange={e => setFormColor(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* Color Presets */}
              <div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                  Paleta de Cores Sugerida:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`h-6 w-6 rounded-full border border-black/10 transition-transform cursor-pointer hover:scale-110 flex items-center justify-center ${
                        formColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {formColor.toLowerCase() === c.toLowerCase() && (
                        <Check className="h-3 w-3 text-white drop-shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkbox Flags */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={e => setFormActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span>Status Ativo na Esteira</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formFinalStatus}
                    onChange={e => setFormFinalStatus(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span>Status Finalizador (Conclusão de proposta, ex: Pago, Cancelado, Reprovado)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formManualAllowed}
                    onChange={e => setFormManualAllowed(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span>Permitir Troca Manual pelos Usuários da Esteira</span>
                </label>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>{editingStatus ? 'Salvar Alterações' : 'Cadastrar Status'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete & Migration */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900 p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-3">
              <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Excluir Status "{deleteTarget.name}"?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Tem certeza que deseja excluir o status <strong className="text-slate-900 dark:text-white">{deleteTarget.name}</strong>? Esta ação removerá a coluna da esteira Kanban.
            </p>

            {/* Check if proposals are bound */}
            {(proposalsCountMap[deleteTarget.id] || 0) > 0 ? (
              <div className="mb-4 p-3 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-xs space-y-2">
                <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span>Atenção: Propostas Vinculadas</span>
                </div>
                <p className="text-amber-800 dark:text-amber-300/90 text-[11px]">
                  Existem <strong>{proposalsCountMap[deleteTarget.id]} propostas</strong> atualmente neste status. Escolha para qual status elas devem ser migradas antes de confirmar a exclusão:
                </p>

                <select
                  value={fallbackStatusId}
                  onChange={e => setFallbackStatusId(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden"
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
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
