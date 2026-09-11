import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Sliders,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Holiday } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-blue-600" />
          <span>Feriados & Configurações de SLA</span>
        </h2>
        <p className="text-xs text-slate-500">
          Calendário de dias úteis para a regra de Portabilidade. Fins de semana (sábado e domingo) e feriados aqui listados são desconsiderados do cálculo.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* SLA Setting */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Sliders className="h-4 w-4 text-blue-600" />
          <span>Meta de Dias Úteis para Saldo Retornado (Portabilidade CIP)</span>
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={30}
            value={balanceDays}
            onChange={e => setBalanceDays(Number(e.target.value))}
            className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900"
          />
          <span className="text-xs text-slate-600">
            dias úteis (Padrão regulatório da CIP: <strong>5 dias úteis</strong>)
          </span>
          <button
            onClick={handleSaveConfig}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs"
          >
            Salvar Meta
          </button>
        </div>
      </div>

      {/* Add Holiday Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Cadastrar Feriado Bancário / Nacional
        </h3>
        <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Data *</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Feriado *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Tiradentes"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar Feriado</span>
            </button>
          </div>
        </form>
      </div>

      {/* Holidays List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descrição do Feriado</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {holidays.map(h => (
              <tr key={h.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-mono font-bold text-slate-900">{h.date}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{h.name}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleRemoveHoliday(h)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
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
