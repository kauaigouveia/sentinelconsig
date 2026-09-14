import React, { useState } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Holiday } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const HolidayManagement: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>(() => StorageService.getHolidays());
  const [config, setConfig] = useState(() => StorageService.getConfig());

  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [balanceDays, setBalanceDays] = useState(config.portabilityBalanceDays);
  const [message, setMessage] = useState<string | null>(null);

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

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) return;

    try {
      StorageService.createHoliday({
        date,
        name: name.trim(),
      });
      setHolidays(StorageService.getHolidays());
      setDate('');
      setName('');
      setMessage('Feriado cadastrado com sucesso no calendário!');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveHoliday = (h: Holiday) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Feriado / Calendário',
      itemName: `${h.date} - ${h.name}`,
      description: 'O feriado será removido da contagem de dias úteis da esteira de portabilidade.',
      onConfirm: () => {
        StorageService.deleteHoliday(h.id);
        setHolidays(StorageService.getHolidays());
        setMessage('Feriado removido com sucesso.');
        setTimeout(() => setMessage(null), 3000);
      },
    });
  };

  const handleSaveConfig = () => {
    StorageService.updateConfig({ portabilityBalanceDays: balanceDays });
    setConfig(StorageService.getConfig());
    setMessage(`Meta de SLA atualizada para ${balanceDays} dias úteis!`);
    setTimeout(() => setMessage(null), 3000);
  };

  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <ActionBar
        title="Feriados Nacionais & SLA Regulatório CIP"
        subtitle="Calendário oficial de dias úteis para cálculo de SLA de portabilidade e retenção bancária"
        badgeText="CALENDÁRIO REGULATÓRIO"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono">
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Feriados Registrados
            </span>
            <CalendarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-950 dark:text-blue-200">
            {holidays.length} dias
          </p>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-bold block font-sans">
            Desconsiderados na contagem útil
          </span>
        </div>

        <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">
              Prazo Regulatório CIP
            </span>
            <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-950 dark:text-purple-200">
            {balanceDays} dias úteis
          </p>
          <span className="text-[11px] text-purple-700 dark:text-purple-400 font-bold block font-sans">
            Resolução BACEN / CIP
          </span>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Motor de Contagem
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-lg font-black text-emerald-950 dark:text-emerald-200">
            AUTOMÁTICO
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold block font-sans">
            Fins de semana e feriados expurgados
          </span>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* SLA Configuration Box */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <Sliders className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Parâmetros de SLA para Retorno de Saldo Devedor (CIP)
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Meta Regulamentar em Dias Úteis:
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={balanceDays}
            onChange={e => setBalanceDays(Number(e.target.value))}
            className="w-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono font-bold text-center focus:outline-hidden"
          />
          <button
            onClick={handleSaveConfig}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 shadow-xs transition-colors cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Salvar Parâmetro</span>
          </button>
        </div>
      </div>

      {/* Add Holiday Form */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
          Adicionar Feriado ao Calendário
        </h3>

        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Data do Feriado *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome do Feriado / Descrição *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Tiradentes"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
            />
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Adicionar Feriado</span>
          </button>
        </form>
      </div>

      {/* Holiday Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Calendário de Feriados Ativos ({sortedHolidays.length})
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5 font-mono">Data (AAAA-MM-DD)</th>
                <th className="px-3.5 py-2.5">Nome / Motivo</th>
                <th className="px-3.5 py-2.5 text-center">Status</th>
                <th className="px-3.5 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {sortedHolidays.map(h => (
                <tr key={h.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-3.5 py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {h.date}
                  </td>
                  <td className="px-3.5 py-2.5 text-slate-900 dark:text-white font-bold">{h.name}</td>
                  <td className="px-3.5 py-2.5 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      NÃO ÚTIL
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-center">
                    <button
                      onClick={() => handleRemoveHoliday(h)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Excluir feriado"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
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
