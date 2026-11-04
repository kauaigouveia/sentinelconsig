import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Sliders,
  ShieldCheck,
  CalendarDays,
  Save,
  AlertCircle,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Holiday } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { hasPermission } from '../../lib/permissions';

export const HolidayManagement: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>(() => StorageService.getHolidays());
  const [config, setConfig] = useState(() => StorageService.getConfig());

  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [balanceDays, setBalanceDays] = useState(config.portabilityBalanceDays);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const activeUser = StorageService.getActiveUser();
  const canManageCalendar = hasPermission(activeUser?.role, activeUser?.customPermissions, 'settings.manage') ||
    hasPermission(activeUser?.role, activeUser?.customPermissions, 'admin.manage');

  useEffect(() => {
    StorageService.fetchAndSyncOperationalCalendar()
      .then(() => {
        setHolidays(StorageService.getHolidays());
        setConfig(StorageService.getConfig());
        setBalanceDays(StorageService.getConfig().portabilityBalanceDays);
      })
      .catch(error => {
        setMessageIsError(true);
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar calendário compartilhado.');
      });
  }, []);

  useEffect(() => {
    const syncLocalCalendar = () => {
      setHolidays(StorageService.getHolidays());
      const currentConfig = StorageService.getConfig();
      setConfig(currentConfig);
      setBalanceDays(currentConfig.portabilityBalanceDays);
    };
    window.addEventListener('credit_gestao_storage_update', syncLocalCalendar);
    return () => window.removeEventListener('credit_gestao_storage_update', syncLocalCalendar);
  }, []);

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

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCalendar || !date || !name.trim() || isSaving) return;

    try {
      setIsSaving(true);
      const nextHolidays = [...holidays, {
        id: `h-${Date.now()}`,
        date,
        name: name.trim(),
        active: true,
      }];
      await StorageService.saveOperationalCalendar(nextHolidays, balanceDays);
      setHolidays(StorageService.getHolidays());
      setDate('');
      setName('');
      setMessageIsError(false);
      setMessage('Feriado cadastrado com sucesso no calendário!');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessageIsError(true);
      setMessage(err?.message || 'Não foi possível salvar o feriado.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveHoliday = (h: Holiday) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Feriado / Calendário',
      itemName: `${h.date} - ${h.name}`,
      description: 'O feriado será removido da contagem de dias úteis da esteira de portabilidade.',
      onConfirm: async () => {
        if (!canManageCalendar || isSaving) return;
        setIsSaving(true);
        try {
          await StorageService.saveOperationalCalendar(holidays.filter(item => item.id !== h.id), balanceDays);
          setHolidays(StorageService.getHolidays());
          setMessageIsError(false);
          setMessage('Feriado removido com sucesso.');
          setTimeout(() => setMessage(null), 3000);
          setDeleteModalConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          setMessageIsError(true);
          setMessage(err?.message || 'Não foi possível remover o feriado.');
        } finally {
          setIsSaving(false);
        }
      },
    });
  };

  const handleSaveConfig = async () => {
    if (!canManageCalendar || isSaving) return;
    setIsSaving(true);
    try {
      await StorageService.saveOperationalCalendar(holidays, balanceDays);
      setConfig(StorageService.getConfig());
      setMessageIsError(false);
      setMessage(`Meta de SLA atualizada para ${balanceDays} dias úteis!`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessageIsError(true);
      setMessage(err?.message || 'Não foi possível salvar o prazo de SLA.');
    } finally {
      setIsSaving(false);
    }
  };

  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <ActionBar
        title="Feriados Nacionais & SLA Regulatório CIP"
        subtitle="Calendário oficial de dias úteis para cálculo de SLA de portabilidade e retenção bancária"
        badgeText="CALENDÁRIO REGULATÓRIO"
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono">
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Feriados Registrados
            </span>
            <CalendarIcon className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {holidays.length} dias
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block font-sans">
            Desconsiderados na contagem útil
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Prazo Regulatório CIP
            </span>
            <Clock className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {balanceDays} dias úteis
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block font-sans">
            Resolução BACEN / CIP
          </span>
        </div>

        <div className="rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--success-text)] dark:text-[var(--success-text)]">
              Motor de Contagem
            </span>
            <ShieldCheck className="h-4 w-4 text-[var(--success-text)] dark:text-[var(--success-text)]" />
          </div>
          <p className="text-lg font-black text-[var(--success-text)] dark:text-[var(--success-text)]">
            AUTOMÁTICO
          </p>
          <span className="text-[11px] text-[var(--success-text)] dark:text-[var(--success-text)] font-bold block font-sans">
            Fins de semana e feriados expurgados
          </span>
        </div>
      </div>

      {message && (
        <div role={messageIsError ? 'alert' : 'status'} className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${messageIsError ? 'border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)]' : 'border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)]'}`}>
          {messageIsError ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{message}</span>
        </div>
      )}

      {/* SLA Configuration Box */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-3">
        <div className="flex items-center gap-2 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <Sliders className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            Parâmetros de SLA para Retorno de Saldo Devedor (CIP)
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            Meta Regulamentar em Dias Úteis:
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={balanceDays}
            onChange={e => setBalanceDays(Number(e.target.value))}
            disabled={!canManageCalendar || isSaving}
            className="w-20 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-mono font-bold text-center focus:outline-hidden"
          />
          {canManageCalendar && <button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-4 py-2  transition-colors cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Salvando…' : 'Salvar Parâmetro'}</span>
          </button>}
        </div>
      </div>

      {/* Add Holiday Form */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
          Adicionar Feriado ao Calendário
        </h3>

        {canManageCalendar ? <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Data do Feriado *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={isSaving}
              className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Nome do Feriado / Descrição *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isSaving}
              placeholder="Ex: Tiradentes"
              className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs py-2.5  transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isSaving ? 'Salvando…' : 'Adicionar Feriado'}</span>
          </button>
        </form> : <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">Você tem acesso somente para consulta. Solicite a permissão de gestão de configurações para alterar feriados ou prazos.</p>}
      </div>

      {/* Holiday Table */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Calendário de Feriados Ativos ({sortedHolidays.length})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-3.5 py-2.5 font-mono">Data (AAAA-MM-DD)</th>
                <th className="px-3.5 py-2.5">Nome / Motivo</th>
                <th className="px-3.5 py-2.5 text-center">Status</th>
                {canManageCalendar && <th className="px-3.5 py-2.5 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {sortedHolidays.map(h => (
                <tr key={h.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-[var(--link)] dark:text-[var(--link)]">
                    {h.date}
                  </td>
                  <td className="px-3.5 py-2.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold">{h.name}</td>
                  <td className="px-3.5 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      NÃO ÚTIL
                    </span>
                  </td>
                  {canManageCalendar && <td className="px-3.5 py-2.5 text-center">
                    <button
                      onClick={() => handleRemoveHoliday(h)}
                      disabled={isSaving}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--danger-text)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                      title="Excluir feriado"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        itemType={deleteModalConfig.itemType}
        itemName={deleteModalConfig.itemName}
        description={deleteModalConfig.description}
        onConfirm={deleteModalConfig.onConfirm}
        onClose={() => setDeleteModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
