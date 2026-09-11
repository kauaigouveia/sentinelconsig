import React, { useState } from 'react';
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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { extractPartnerCode } from '../../lib/utils';
import { Partner } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { PartnerImportModal } from './PartnerImportModal';

export const PartnerManagement: React.FC = () => {
  const [partners, setPartners] = useState<Partner[]>(() => StorageService.getPartners());
  const promoters = StorageService.getPromoters();

  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [promoterId, setPromoterId] = useState(promoters[0]?.id || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const derivedCode = extractPartnerCode(login);

  const handleCreatePartner = (e: React.FormEvent) => {
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
      const created = StorageService.createPartner({
        fullName: fullName.trim(),
        login: login.trim().toUpperCase(),
        promoterId,
      });

      setPartners(StorageService.getPartners());
      setSuccessMsg(`Parceiro ${created.login} cadastrado com sucesso! Código extraído: ${extractPartnerCode(created.login)}`);
      setFullName('');
      setLogin('');
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
      onConfirm: () => {
        try {
          StorageService.deletePartner(p.id);
          setPartners(StorageService.getPartners());
          setSuccessMsg(`Parceiro ${p.login} excluído com sucesso.`);
          setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err: any) {
          setErrorMsg(err.message || 'Erro ao excluir parceiro.');
        }
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Handshake className="h-5 w-5 text-blue-600" />
            <span>Gestão de Parceiros</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cadastro simplificado de parceiros comerciais. Login estrito no formato NOME@CODIGO com extração automática do código numérico.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors shrink-0"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span>Importar Planilha em Lote</span>
        </button>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Novo Parceiro Comercial
        </h3>

        <form onSubmit={handleCreatePartner} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome Completo do Parceiro *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Ex: KAUAI AMORIM"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Login Único (NOME@CODIGO) *
            </label>
            <input
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="Ex: KAUAI@16740"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-hidden uppercase"
            />
            {derivedCode && (
              <span className="text-[10px] text-blue-600 font-semibold mt-0.5 block">
                Código que será exportado: <strong>{derivedCode}</strong>
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Promotora de Vínculo Padrão *
            </label>
            <div className="flex gap-2">
              <select
                value={promoterId}
                onChange={e => setPromoterId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-hidden"
              >
                {promoters.map(pr => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Cadastrar</span>
              </button>
            </div>
          </div>
        </form>

        {errorMsg && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Partners List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Login Único</th>
                <th className="px-4 py-3">Código Derivado (extractPartnerCode)</th>
                <th className="px-4 py-3">Nome Completo</th>
                <th className="px-4 py-3">Promotora Vinculada</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {partners.map(p => {
                const promoter = promoters.find(pr => pr.id === p.promoterId);
                const code = extractPartnerCode(p.login);

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {p.login}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">
                      {code}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {p.fullName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        {promoter?.name || 'Geral'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> Ativo
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeletePartner(p)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                        title="Excluir parceiro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      <PartnerImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportCompleted={() => setPartners(StorageService.getPartners())}
      />
    </div>
  );
};
