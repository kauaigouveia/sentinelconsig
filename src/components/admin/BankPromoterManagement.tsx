import React, { useState, useEffect, useCallback, useRef } from 'react';
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

  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const [banksRes, promRes, bpRes] = await Promise.all([
        fetch('/api/banks', { cache: 'no-store' }),
        fetch('/api/promoters', { cache: 'no-store' }),
        fetch('/api/bank-promoters', { cache: 'no-store' }),
      ]);

      if (generation !== refreshGeneration.current) return;
      if (banksRes.ok) {
        const banksData = await banksRes.json();
        if (generation !== refreshGeneration.current) return;
        if (Array.isArray(banksData)) {
          StorageService.cacheBanksFromApi(banksData);
          setBanks(StorageService.getBanks());
        }
      } else {
        setBanks(StorageService.getBanks());
      }

      if (promRes.ok) {
        const promData = await promRes.json();
        if (generation !== refreshGeneration.current) return;
        if (Array.isArray(promData)) {
          StorageService.cachePromotersFromApi(promData);
          setPromoters(StorageService.getPromoters());
        }
      } else {
        setPromoters(StorageService.getPromoters());
      }

      if (bpRes.ok) {
        const bpData = await bpRes.json();
        if (generation !== refreshGeneration.current) return;
        if (Array.isArray(bpData)) {
          StorageService.cacheBankPromotersFromApi(bpData);
          setBankPromoters(StorageService.getBankPromoters());
        }
      } else {
        setBankPromoters(StorageService.getBankPromoters());
      }
    } catch (err) {
      if (generation !== refreshGeneration.current) return;
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

      const saved = await res.json();
      if (!saved?.id) throw new Error('O servidor não retornou o banco cadastrado.');
      ++refreshGeneration.current;
      StorageService.cacheBanksFromApi([...StorageService.getBanks().filter(item => item.id !== saved.id), saved]);
      setBanks(StorageService.getBanks());
      setNewBankName('');
      setNewBankCode('');
      setMessage('Banco cadastrado com sucesso!');
      void refresh();
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

      const saved = await res.json();
      if (!saved?.id) throw new Error('O servidor não retornou a promotora cadastrada.');
      ++refreshGeneration.current;
      StorageService.cachePromotersFromApi([...StorageService.getPromoters().filter(item => item.id !== saved.id), saved]);
      setPromoters(StorageService.getPromoters());
      setNewPromoterName('');
      setMessage('Promotora cadastrada com sucesso!');
      void refresh();
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
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
        rightActions={canCreateBanks ? <BankBatchImport onCompleted={refresh} /> : undefined}
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Bancos Homologados
            </span>
            <Building2 className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {banks.length} instituições
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block font-sans">
            Bancos cadastrados na plataforma
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Promotoras Parceiras
            </span>
            <Building className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {promoters.length} entidades
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block font-sans">
            Promotoras habilitadas para digitação
          </span>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl border border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Creation Panels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bancos */}
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Adicionar Banco
            </h3>
            <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">{banks.length} cadastrados</span>
          </div>

          <form onSubmit={handleCreateBank} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nome *</label>
                <input
                  type="text"
                  required
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  placeholder="Ex: BANCO DAYCOVAL"
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Código FEBRABAN</label>
                <input
                  type="text"
                  value={newBankCode}
                  onChange={e => setNewBankCode(e.target.value)}
                  placeholder="Ex: 707"
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs py-2  transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Salvar Banco</span>
            </button>
          </form>

          <div className="space-y-2 pt-2">
            {banks.map(bank => (
              <div
                key={bank.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]"
              >
                <div>
                  <span className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{bank.name}</span>
                  {bank.code && (
                    <span className="ml-2 font-mono text-[10px] text-[var(--text-secondary)]">Cód: {bank.code}</span>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteBank(bank)}
                  className="text-[var(--text-secondary)] hover:text-[var(--danger-text)] p-1 rounded-lg transition-colors cursor-pointer"
                  title="Excluir banco"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Promotoras */}
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Adicionar Promotora
            </h3>
            <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">{promoters.length} cadastradas</span>
          </div>

          <form onSubmit={handleCreatePromoter} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nome da Promotora *</label>
              <input
                type="text"
                required
                value={newPromoterName}
                onChange={e => setNewPromoterName(e.target.value)}
                placeholder="Ex: PROMOTORA ALPHA CONSIG"
                className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs py-2  transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Salvar Promotora</span>
            </button>
          </form>

          <div className="space-y-2 pt-2">
            {promoters.map(promoter => (
              <div
                key={promoter.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)]"
              >
                <span className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{promoter.name}</span>
                <button
                  onClick={() => handleDeletePromoter(promoter)}
                  className="text-[var(--text-secondary)] hover:text-[var(--danger-text)] p-1 rounded-lg transition-colors cursor-pointer"
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
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              Matriz de Ativação Cruzada (Banco × Promotora)
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">Clique para ativar ou desativar o vínculo</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
            <thead className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
              <tr>
                <th className="px-3.5 py-2.5">Banco / Instituição</th>
                {promoters.map(pr => (
                  <th key={pr.id} className="px-3.5 py-2.5 text-center">
                    {pr.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)] font-medium">
              {banks.map(bank => (
                <tr key={bank.id} className="hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]">
                  <td className="px-3.5 py-2.5 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
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
                              ? 'bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)]'
                              : 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)]'
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
