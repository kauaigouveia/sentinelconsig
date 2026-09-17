import React, { useState, useEffect, useMemo } from 'react';
import {
  Handshake,
  Plus,
  CheckCircle2,
  AlertCircle,
  Building,
  Key,
  ToggleLeft,
  ToggleRight,
  Trash2,
  FileSpreadsheet,
  Upload,
  Search,
  Users,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { extractPartnerCode } from '../../lib/utils';
import { Partner } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { PartnerImportModal } from './PartnerImportModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const PartnerManagement: React.FC = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const promoters = StorageService.getPromoters();
  const proposals = StorageService.getProposals();

  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [promoterId, setPromoterId] = useState(promoters[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const derivedCode = extractPartnerCode(login);

  const loadPartnersFromApi = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/partners', {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Erro na API ao carregar parceiros (HTTP ${res.status}).`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPartners(data);
      } else {
        setPartners([]);
      }
    } catch (err: any) {
      console.error('[PartnerManagement] Error loading partners from API:', err);
      setErrorMsg(err.message || 'Falha ao carregar parceiros do servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartnersFromApi();
  }, []);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Informe o nome completo do parceiro.');
      return;
    }

    if (!login.trim()) {
      setErrorMsg('Informe o login do parceiro no formato NOME@CODIGO (ex: KAUAI@16740).');
      return;
    }

    if (!login.includes('@')) {
      setErrorMsg('O login do parceiro DEVE seguir o padrão NOME@CODIGO (ex: FOX@16715).');
      return;
    }

    try {
      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          login: login.trim().toUpperCase(),
          promoterId: promoterId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cadastrar parceiro no servidor.');
      }

      await loadPartnersFromApi();
      setSuccessMsg(`Parceiro ${data.login || login} cadastrado com sucesso! Código extraído: ${extractPartnerCode(data.login || login)}`);
      setFullName('');
      setLogin('');
      setShowAddForm(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar parceiro.');
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

  const handleDeletePartner = (p: Partner) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Parceiro Comercial',
      itemName: `${p.fullName} (${p.login})`,
      description: 'O cadastro do parceiro e seus vínculos serão removidos permanentemente.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/partners/${p.id}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Erro ao excluir parceiro no servidor.');
          }

          await loadPartnersFromApi();
          setSuccessMsg(`Parceiro ${p.login} excluído com sucesso.`);
          setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err: any) {
          setErrorMsg(err.message || 'Erro ao excluir parceiro.');
        }
      },
    });
  };

  const handleToggleActive = async (p: Partner) => {
    try {
      const res = await fetch(`/api/partners/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: !p.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao alterar status do parceiro.');
      }

      await loadPartnersFromApi();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar status do parceiro.');
    }
  };

  const activeCount = partners.filter(p => p && p.active).length;
  const filteredPartners = partners.filter(p => {
    if (!p) return false;
    const fName = String(p.fullName ?? (p as any).name ?? '').toLowerCase();
    const loginVal = String(p.login ?? (p as any).code ?? '').toLowerCase();
    const codeVal = extractPartnerCode(loginVal).toLowerCase();
    const search = searchTerm.toLowerCase();

    return (
      !searchTerm ||
      fName.includes(search) ||
      loginVal.includes(search) ||
      codeVal.includes(search)
    );
  });

  return (
    <div className="space-y-6">
      <ActionBar
        title="Gestão de Correspondentes & Parceiros"
        subtitle="Cadastro institucional, vinculação com promotoras e controle de acesso à esteira"
        badgeText="CADASTRO DE CANAIS"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>Importar Planilha</span>
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>+ Novo Parceiro</span>
            </button>
          </div>
        }
      />

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono">
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Parceiros Ativos
            </span>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-950 dark:text-blue-200">
            {activeCount} <span className="text-xs font-normal text-slate-500">/ {partners.length} total</span>
          </p>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-bold block font-sans">
            Canais habilitados para envio de propostas
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Promotoras Cadastradas
            </span>
            <Building className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {promoters.length} entidades
          </p>
          <span className="text-[11px] text-slate-500 font-bold block font-sans">
            Intermediadoras vinculadas aos canais
          </span>
        </div>

        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Padrão de Código
            </span>
            <Key className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-lg font-black text-emerald-950 dark:text-emerald-200">
            NOME@CODIGO
          </p>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold block font-sans">
            Extração automática do código do canal
          </span>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Form Dropdown */}
      {showAddForm && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Cadastrar Novo Parceiro Comercial
            </h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Fechar
            </button>
          </div>

          <form onSubmit={handleCreatePartner} className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nome do Parceiro *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ex: KAUAI PROMOTORA"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Login (NOME@CODIGO) *
              </label>
              <input
                type="text"
                required
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="Ex: KAUAI@16740"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden font-mono"
              />
              {derivedCode && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                  Código extraído: {derivedCode}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Promotora Vinculada
              </label>
              <select
                value={promoterId}
                onChange={e => setPromoterId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
              >
                {promoters.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs cursor-pointer"
              >
                Salvar Parceiro
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Partners Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Correspondentes Cadastrados ({filteredPartners.length})
            </h3>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar parceiro ou código..."
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3.5 py-2.5">Nome do Parceiro</th>
                <th className="px-3.5 py-2.5 font-mono">Login Institucional</th>
                <th className="px-3.5 py-2.5 font-mono text-center">Código</th>
                <th className="px-3.5 py-2.5">Promotora</th>
                <th className="px-3.5 py-2.5 text-center font-mono">Propostas</th>
                <th className="px-3.5 py-2.5 text-center">Status</th>
                <th className="px-3.5 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400">
                    Nenhum parceiro encontrado com o filtro informado.
                  </td>
                </tr>
              ) : (
                filteredPartners.map(p => {
                  const promoter = promoters.find(pr => pr.id === p.promoterId);
                  const pProps = proposals.filter(pr => pr.partnerId === p.id);

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                        {p.fullName}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                        {p.login}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                        {extractPartnerCode(p.login)}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600 dark:text-slate-400">
                        {promoter?.name || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-mono font-bold">
                        {pProps.length}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => handleToggleActive(p)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                            p.active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {p.active ? 'ATIVO' : 'INATIVO'}
                        </button>
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => handleDeletePartner(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Excluir parceiro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
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

      <PartnerImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportCompleted={() => {
          loadPartnersFromApi();
          setSuccessMsg('Correspondentes importados com sucesso!');
        }}
      />
    </div>
  );
};
