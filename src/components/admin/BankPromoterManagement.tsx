import React, { useState } from 'react';
import {
  Building2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Layers,
  CheckSquare,
  Square,
  Trash2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Bank, Promoter } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

export const BankPromoterManagement: React.FC = () => {
  const [banks, setBanks] = useState<Bank[]>(() => StorageService.getBanks());
  const [promoters, setPromoters] = useState<Promoter[]>(() => StorageService.getPromoters());
  const [newBankName, setNewBankName] = useState('');
  const [newBankCode, setNewBankCode] = useState('');
  const [newPromoterName, setNewPromoterName] = useState('');

  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    setBanks(StorageService.getBanks());
    setPromoters(StorageService.getPromoters());
  };

  const handleCreateBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim()) return;

    try {
      StorageService.createBank({
        name: newBankName.trim().toUpperCase(),
        code: newBankCode.trim() || undefined,
      });
      setNewBankName('');
      setNewBankCode('');
      setMessage('Banco cadastrado com sucesso!');
      refresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreatePromoter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromoterName.trim()) return;

    try {
      StorageService.createPromoter({
        name: newPromoterName.trim().toUpperCase(),
      });
      setNewPromoterName('');
      setMessage('Promotora cadastrada com sucesso!');
      refresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleBankPromoter = (bankId: string, promoterId: string, current: boolean) => {
    StorageService.toggleBankPromoter(bankId, promoterId, !current);
    setMessage('Vínculo Banco × Promotora atualizado!');
    refresh();
    setTimeout(() => setMessage(null), 2500);
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

  const handleDeleteBank = (bank: Bank) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Instituição Bancária',
      itemName: bank.name + (bank.code ? ` (Cód: ${bank.code})` : ''),
      description: 'O banco e todos os seus vínculos com promotoras cadastradas serão permanentemente removidos.',
      onConfirm: () => {
        try {
          StorageService.deleteBank(bank.id);
          setMessage(`Banco ${bank.name} excluído com sucesso.`);
          refresh();
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir banco.');
        }
      },
    });
  };

  const handleDeletePromoter = (promoter: Promoter) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Promotora / Correspondente',
      itemName: promoter.name,
      description: 'A promotora e seus vínculos cadastrados com as instituições bancárias serão permanentemente removidos.',
      onConfirm: () => {
        try {
          StorageService.deletePromoter(promoter.id);
          setMessage(`Promotora ${promoter.name} excluída com sucesso.`);
          refresh();
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir promotora.');
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <span>Matriz de Bancos & Promotoras</span>
        </h2>
        <p className="text-xs text-slate-500">
          Regra de Negócio Central: Defina estritamente quais promotoras estão habilitadas para cada instituição bancária
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* MATRIX TABLE */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Matriz de Vínculos Habilitados (BankPromoter)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Instituição Bancária</th>
                {promoters.map(pr => (
                  <th key={pr.id} className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span>Promotora: {pr.name}</span>
                      <button
                        onClick={() => handleDeletePromoter(pr)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                        title={`Excluir Promotora ${pr.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {banks.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-bold text-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <span>{b.name} {b.code ? `(${b.code})` : ''}</span>
                      <button
                        onClick={() => handleDeleteBank(b)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                        title={`Excluir Banco ${b.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  {promoters.map(pr => {
                    const isAllowed = StorageService.isBankPromoterAllowed(b.id, pr.id);
                    return (
                      <td key={pr.id} className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleBankPromoter(b.id, pr.id, isAllowed)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            isAllowed
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          {isAllowed ? (
                            <>
                              <CheckSquare className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Habilitada</span>
                            </>
                          ) : (
                            <>
                              <Square className="h-3.5 w-3.5" />
                              <span>Desabilitada</span>
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* New Bank Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Cadastrar Novo Banco
          </h4>
          <form onSubmit={handleCreateBank} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do Banco *
              </label>
              <input
                type="text"
                value={newBankName}
                onChange={e => setNewBankName(e.target.value)}
                placeholder="Ex: BANCO PAN"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Código Compensação (Opcional)
              </label>
              <input
                type="text"
                value={newBankCode}
                onChange={e => setNewBankCode(e.target.value)}
                placeholder="Ex: 623"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
            >
              + Salvar Banco
            </button>
          </form>

          {/* Banks List */}
          <div className="pt-3 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Bancos Cadastrados ({banks.length})
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {banks.map(b => (
                <div key={b.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-50 border border-slate-100 text-xs">
                  <span className="font-semibold text-slate-800">{b.name} {b.code ? `(${b.code})` : ''}</span>
                  <button
                    onClick={() => handleDeleteBank(b)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title={`Excluir Banco ${b.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* New Promoter Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Cadastrar Nova Promotora
          </h4>
          <form onSubmit={handleCreatePromoter} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome da Promotora *
              </label>
              <input
                type="text"
                value={newPromoterName}
                onChange={e => setNewPromoterName(e.target.value)}
                placeholder="Ex: ALPHA PROMOTORA"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 uppercase"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
            >
              + Salvar Promotora
            </button>
          </form>

          {/* Promoters List */}
          <div className="pt-3 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Promotoras Cadastradas ({promoters.length})
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {promoters.map(pr => (
                <div key={pr.id} className="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-50 border border-slate-100 text-xs">
                  <span className="font-semibold text-slate-800">{pr.name}</span>
                  <button
                    onClick={() => handleDeletePromoter(pr)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title={`Excluir Promotora ${pr.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
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
