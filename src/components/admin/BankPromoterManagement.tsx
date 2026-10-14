import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Layers,
  CheckSquare,
  Square,
  Trash2,
  Building,
  ShieldCheck,
  Check,
  Loader2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Bank, Promoter } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';
import { BankBatchImport } from './BankBatchImport';
import { hasPermission } from '../../lib/permissions';

export const BankPromoterManagement: React.FC = () => {
  const activeUser = StorageService.getActiveUser();
  const canCreateBanks = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'banks.create');
  const [banks, setBanks] = useState<Bank[]>(() => StorageService.getBanks());
  const [promoters, setPromoters] = useState<Promoter[]>(() => StorageService.getPromoters());
  const [bankPromoters, setBankPromoters] = useState<any[]>(() => StorageService.getBankPromoters());
  const [newBankName, setNewBankName] = useState('');
  const [newBankCode, setNewBankCode] = useState('');
  const [newPromoterName, setNewPromoterName] = useState('');
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [banksRes, promRes, bpRes] = await Promise.all([
        fetch('/api/banks'),
        fetch('/api/promoters'),
        fetch('/api/bank-promoters'),
      ]);

      if (banksRes.ok) {
        const banksData = await banksRes.json();
        if (Array.isArray(banksData)) {
          StorageService.cacheBanksFromApi(banksData);
          setBanks(StorageService.getBanks());
        }
      } else {
        setBanks(StorageService.getBanks());
      }

      if (promRes.ok) {
        const promData = await promRes.json();
        if (Array.isArray(promData)) {
          StorageService.cachePromotersFromApi(promData);
          setPromoters(StorageService.getPromoters());
        }
      } else {
        setPromoters(StorageService.getPromoters());
      }

      if (bpRes.ok) {
        const bpData = await bpRes.json();
        if (Array.isArray(bpData)) {
          StorageService.cacheBankPromotersFromApi(bpData);
          setBankPromoters(StorageService.getBankPromoters());
        }
      } else {
        setBankPromoters(StorageService.getBankPromoters());
      }
    } catch (err) {
      console.warn('[BankPromoterManagement] Erro ao sincronizar com backend, usando cache:', err);
      setBanks(StorageService.getBanks());
      setPromoters(StorageService.getPromoters());
      setBankPromoters(StorageService.getBankPromoters());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim()) return;

    try {
      const payload = {
        name: newBankName.trim().toUpperCase(),
        code: newBankCode.trim() || undefined,
      };

      const res = await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao cadastrar banco no servidor.');
      }

      setNewBankName('');
      setNewBankCode('');
      setMessage('Banco cadastrado com sucesso!');
      await refresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar banco.');
    }
  };

  const handleCreatePromoter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromoterName.trim()) return;

    try {
      const cleanName = newPromoterName.trim().toUpperCase();
      const res = await fetch('/api/promoters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao cadastrar promotora no servidor.');
      }

      setNewPromoterName('');
      setMessage('Promotora cadastrada com sucesso!');
      await refresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar promotora.');
    }
  };

  const handleToggleBankPromoter = async (bankId: string, promoterId: string, current: boolean) => {
    try {
      const res = await fetch('/api/bank-promoters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankId,
          promoterId,
          status: current ? 'INATIVO' : 'ATIVO',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao atualizar matriz Banco × Promotora.');
      }

      setMessage('Vínculo Banco × Promotora atualizado!');
      await refresh();
      setTimeout(() => setMessage(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar vínculo Banco × Promotora.');
    }
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
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/banks/${bank.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || 'Erro ao excluir banco.');
          }

          setMessage(`Banco ${bank.name} excluído com sucesso.`);
          await refresh();
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
      itemType: 'Promotora / Corban',
      itemName: promoter.name,
      description: 'A promotora e seus vínculos ativos serão desvinculados permanentemente.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/promoters/${promoter.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || 'Erro ao excluir promotora.');
          }

          setMessage(`Promotora ${promoter.name} excluída com sucesso.`);
          await refresh();
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir promotora.');
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <ActionBar
        title="Bancos, Promotoras & Matriz de Vínculos"
        subtitle="Instituições financeiras integradas e habilitação de promotoras por banco na esteira"
        badgeText="ESTRUTURA BANCÁRIA"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Bancos Homologados
            </span>
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-950 dark:text-blue-200">
            {banks.length} instituições
          </p>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-bold block font-sans">
            Bancos cadastrados na plataforma
          </span>
        </div>

        <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/60 bg-cyan-50/40 dark:bg-cyan-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
              Promotoras Parceiras
            </span>
            <Building className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-cyan-950 dark:text-cyan-200">
            {promoters.length} entidades
          </p>
          <span className="text-[11px] text-cyan-700 dark:text-cyan-400 font-bold block font-sans">
            Promotoras habilitadas para digitação
          </span>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Creation Panels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bancos */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Adicionar Banco
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{banks.length} cadastrados</span>
          </div>

          <form onSubmit={handleCreateBank} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Nome *</label>
                <input
                  type="text"
                  required
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  placeholder="Ex: BANCO DAYCOVAL"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Código FEBRABAN</label>
                <input
                  type="text"
                  value={newBankCode}
                  onChange={e => setNewBankCode(e.target.value)}
                  placeholder="Ex: 707"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Salvar Banco</span>
            </button>
          </form>
          {canCreateBanks && <BankBatchImport onCompleted={refresh} />}

          <div className="space-y-2 pt-2">
            {banks.map(bank => (
              <div
                key={bank.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
              >
                <div>
                  <span className="font-bold text-xs text-slate-900 dark:text-white">{bank.name}</span>
                  {bank.code && (
                    <span className="ml-2 font-mono text-[10px] text-slate-400">Cód: {bank.code}</span>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteBank(bank)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Excluir banco"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Promotoras */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Adicionar Promotora
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase">{promoters.length} cadastradas</span>
          </div>

          <form onSubmit={handleCreatePromoter} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Nome da Promotora *</label>
              <input
                type="text"
                required
                value={newPromoterName}
                onChange={e => setNewPromoterName(e.target.value)}
                placeholder="Ex: PROMOTORA ALPHA CONSIG"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs py-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Salvar Promotora</span>
            </button>
          </form>

          <div className="space-y-2 pt-2">
            {promoters.map(promoter => (
              <div
                key={promoter.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
              >
                <span className="font-bold text-xs text-slate-900 dark:text-white">{promoter.name}</span>
                <button
                  onClick={() => handleDeletePromoter(promoter)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Excluir promotora"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Matriz de Vínculos Banco x Promotora */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Matriz de Ativação Cruzada (Banco × Promotora)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Clique para ativar ou desativar o vínculo</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5">Banco / Instituição</th>
                {promoters.map(pr => (
                  <th key={pr.id} className="px-3.5 py-2.5 text-center">
                    {pr.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {banks.map(bank => (
                <tr key={bank.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                    {bank.name}
                  </td>
                  {promoters.map(promoter => {
                    const isLinked = bankPromoters.some(
                      bp => bp.bankId === bank.id && bp.promoterId === promoter.id && bp.active
                    );
                    return (
                      <td key={promoter.id} className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => handleToggleBankPromoter(bank.id, promoter.id, isLinked)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isLinked
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                          }`}
                        >
                          {isLinked ? <Check className="h-4 w-4" /> : <div className="h-4 w-4" />}
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
