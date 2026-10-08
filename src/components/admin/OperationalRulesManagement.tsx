import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Plus,
  CheckCircle2,
  Trash2,
  Edit2,
  Globe,
  Building,
  Check,
  X,
  Layers,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { OperationalRule, Product, Convenio } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

export const OperationalRulesManagement: React.FC = () => {
  const [rules, setRules] = useState<OperationalRule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'GLOBAL' | 'EXCLUSIVE'>('EXCLUSIVE');
  const [active, setActive] = useState(true);
  const [appliesToAllProducts, setAppliesToAllProducts] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [appliesToAllConvenios, setAppliesToAllConvenios] = useState(true);
  const [selectedConvenioIds, setSelectedConvenioIds] = useState<string[]>([]);
  const [minInstallments, setMinInstallments] = useState<number | ''>('');
  const [maxInstallments, setMaxInstallments] = useState<number | ''>('');
  const [minContractValue, setMinContractValue] = useState<number | ''>('');
  const [maxContractValue, setMaxContractValue] = useState<number | ''>('');
  const [requiresCipBalance, setRequiresCipBalance] = useState(false);
  const [allowsMultipleAde, setAllowsMultipleAde] = useState(true);

  const activeUser = StorageService.getActiveUser();
  const currentTenant = StorageService.getCurrentTenant();
  const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    rule: OperationalRule | null;
  }>({
    isOpen: false,
    rule: null,
  });

  const loadData = async () => {
    const [syncedRules, syncedConvenios] = await Promise.all([
      StorageService.fetchAndSyncOperationalRules(true),
      StorageService.fetchAndSyncConvenios(true),
    ]);
    setRules(syncedRules);
    setProducts(StorageService.getProducts(true));
    setConvenios(syncedConvenios);
  };

  useEffect(() => {
    void loadData();
    const handleStorageUpdate = () => void loadData();
    window.addEventListener('credit_gestao_storage_update', handleStorageUpdate);
    window.addEventListener('tenantUpdated', handleStorageUpdate);
    return () => {
      window.removeEventListener('credit_gestao_storage_update', handleStorageUpdate);
      window.removeEventListener('tenantUpdated', handleStorageUpdate);
    };
  }, []);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setScope(isMaster ? 'GLOBAL' : 'EXCLUSIVE');
    setActive(true);
    setAppliesToAllProducts(true);
    setSelectedProductIds([]);
    setAppliesToAllConvenios(true);
    setSelectedConvenioIds([]);
    setMinInstallments('');
    setMaxInstallments('');
    setMinContractValue('');
    setMaxContractValue('');
    setRequiresCipBalance(false);
    setAllowsMultipleAde(true);
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification('O nome da regra é obrigatório.', 'error');
      return;
    }

    try {
      const payload: Omit<OperationalRule, 'id' | 'createdAt' | 'updatedAt'> = {
        name: name.trim(),
        description: description.trim() || undefined,
        scope,
        active,
        appliesToAllProducts,
        productIds: appliesToAllProducts ? [] : selectedProductIds,
        appliesToAllConvenios,
        convenioIds: appliesToAllConvenios ? [] : selectedConvenioIds,
        minInstallments: minInstallments !== '' ? Number(minInstallments) : undefined,
        maxInstallments: maxInstallments !== '' ? Number(maxInstallments) : undefined,
        minContractValue: minContractValue !== '' ? Number(minContractValue) : undefined,
        maxContractValue: maxContractValue !== '' ? Number(maxContractValue) : undefined,
        requiresCipBalance,
        allowsMultipleAde,
        tenantId: scope === 'EXCLUSIVE' ? currentTenant.id : undefined,
      };

      if (isEditing && editingId) {
        await StorageService.updateOperationalRule(editingId, payload);
        showNotification(`Regra "${name.trim()}" atualizada com sucesso!`);
      } else {
        await StorageService.createOperationalRule(payload);
        showNotification(`Regra "${name.trim()}" cadastrada com sucesso!`);
      }

      await loadData();
      resetForm();
    } catch (err: any) {
      showNotification(err.message || 'Erro ao processar regra.', 'error');
    }
  };

  const handleEdit = (r: OperationalRule) => {
    if (r.scope === 'GLOBAL' && !isMaster) {
      showNotification('Apenas o Administrador Master pode editar regras globais.', 'error');
      return;
    }
    setIsEditing(true);
    setEditingId(r.id);
    setName(r.name);
    setDescription(r.description || '');
    setScope(r.scope);
    setActive(r.active);
    setAppliesToAllProducts(r.appliesToAllProducts);
    setSelectedProductIds(r.productIds || []);
    setAppliesToAllConvenios(r.appliesToAllConvenios);
    setSelectedConvenioIds(r.convenioIds || []);
    setMinInstallments(r.minInstallments !== undefined ? r.minInstallments : '');
    setMaxInstallments(r.maxInstallments !== undefined ? r.maxInstallments : '');
    setMinContractValue(r.minContractValue !== undefined ? r.minContractValue : '');
    setMaxContractValue(r.maxContractValue !== undefined ? r.maxContractValue : '');
    setRequiresCipBalance(r.requiresCipBalance);
    setAllowsMultipleAde(r.allowsMultipleAde);
  };

  const handleDelete = (r: OperationalRule) => {
    if (r.scope === 'GLOBAL' && !isMaster) {
      showNotification('Apenas o Administrador Master pode excluir regras globais.', 'error');
      return;
    }
    setDeleteModalConfig({
      isOpen: true,
      rule: r,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModalConfig.rule) return;
    try {
      await StorageService.deleteOperationalRule(deleteModalConfig.rule.id);
      loadData();
      showNotification(`Regra ${deleteModalConfig.rule.name} excluída com sucesso.`);
      setDeleteModalConfig({ isOpen: false, rule: null });
    } catch (err: any) {
      showNotification(err.message || 'Erro ao excluir regra.', 'error');
    }
  };

  const toggleProductSelection = (pId: string) => {
    setSelectedProductIds(prev =>
      prev.includes(pId) ? prev.filter(x => x !== pId) : [...prev, pId]
    );
  };

  const toggleConvenioSelection = (cId: string) => {
    setSelectedConvenioIds(prev =>
      prev.includes(cId) ? prev.filter(x => x !== cId) : [...prev, cId]
    );
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <X className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Cadastro / Edição Form */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isEditing ? 'Editar Regra Operacional' : 'Cadastrar Nova Regra Operacional'}
            </h3>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer font-semibold"
            >
              Cancelar Edição
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nome da Regra *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Padrão INSS ou Regra Portabilidade"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Descrição da Regra
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Parâmetros de prazos e valores permitidos"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden"
              />
            </div>

            {isMaster && !isEditing && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Escopo da Regra *
                </label>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden"
                >
                  <option value="GLOBAL">GLOBAL (Todas as empresas)</option>
                  <option value="EXCLUSIVE">EXCLUSIVO (Empresa atual)</option>
                </select>
              </div>
            )}
          </div>

          {/* Vínculo de Convênios */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                <span>Convênios Aplicáveis</span>
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={appliesToAllConvenios}
                  onChange={e => setAppliesToAllConvenios(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
                <span>Aplica-se a Todos os Convênios</span>
              </label>
            </div>

            {!appliesToAllConvenios && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {convenios.map(c => {
                  const isSelected = selectedConvenioIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleConvenioSelection(c.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vínculo de Produtos */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-purple-600" />
                <span>Produtos Aplicáveis</span>
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={appliesToAllProducts}
                  onChange={e => setAppliesToAllProducts(e.target.checked)}
                  className="rounded border-slate-300 text-purple-600 focus:ring-0"
                />
                <span>Aplica-se a Todos os Produtos</span>
              </label>
            </div>

            {!appliesToAllProducts && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {products.map(p => {
                  const isSelected = selectedProductIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProductSelection(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Parâmetros Operacionais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Parcelas Mínimas
              </label>
              <input
                type="number"
                min="1"
                value={minInstallments}
                onChange={e => setMinInstallments(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 12"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Parcelas Máximas
              </label>
              <input
                type="number"
                min="1"
                value={maxInstallments}
                onChange={e => setMaxInstallments(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 84 ou 96"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Valor Mínimo (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={minContractValue}
                onChange={e => setMinContractValue(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 500"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Valor Máximo (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={maxContractValue}
                onChange={e => setMaxContractValue(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 150000"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requiresCipBalance}
                  onChange={e => setRequiresCipBalance(e.target.checked)}
                  className="rounded border-slate-300 text-purple-600 focus:ring-0"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Exige saldo devedor retornado (CIP)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowsMultipleAde}
                  onChange={e => setAllowsMultipleAde(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Permite Multi-ADE
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-0"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Regra Ativa
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 shadow-xs transition-colors cursor-pointer"
            >
              {isEditing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              <span>{isEditing ? 'Atualizar Regra' : 'Salvar Regra'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Rules Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map(r => {
          const isGlobal = r.scope === 'GLOBAL';
          const canManage = isMaster || !isGlobal;

          return (
            <div
              key={r.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-2xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{r.name}</h4>
                    {r.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                      isGlobal
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                    }`}
                  >
                    {isGlobal ? <Globe className="h-3 w-3" /> : <Building className="h-3 w-3" />}
                    <span>{isGlobal ? 'GLOBAL' : 'EXCLUSIVA'}</span>
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div>
                    <strong>Convênios:</strong>{' '}
                    {r.appliesToAllConvenios
                      ? 'Todos os convênios'
                      : convenios
                          .filter(c => r.convenioIds.includes(c.id))
                          .map(c => c.name)
                          .join(', ') || 'Nenhum convênio selecionado'}
                  </div>
                  <div>
                    <strong>Produtos:</strong>{' '}
                    {r.appliesToAllProducts
                      ? 'Todos os produtos'
                      : products
                          .filter(p => r.productIds.includes(p.id))
                          .map(p => p.name)
                          .join(', ') || 'Nenhum produto selecionado'}
                  </div>
                  {(r.minInstallments || r.maxInstallments) && (
                    <div>
                      <strong>Parcelas:</strong> {r.minInstallments || 1}x até {r.maxInstallments || 'Sem limite'}x
                    </div>
                  )}
                  {(r.minContractValue || r.maxContractValue) && (
                    <div>
                      <strong>Valores:</strong> R$ {(r.minContractValue || 0).toLocaleString('pt-BR')} até{' '}
                      {r.maxContractValue ? `R$ ${r.maxContractValue.toLocaleString('pt-BR')}` : 'Sem teto'}
                    </div>
                  )}
                  {r.requiresCipBalance && (
                    <div className="text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      <span>Exige saldo CIP</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className={`text-[10px] font-bold ${r.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {r.active ? 'ATIVA' : 'INATIVA'}
                </span>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(r)}
                      className="text-slate-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
                      title="Editar regra"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                      title="Excluir regra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        itemType="Regra Operacional"
        itemName={deleteModalConfig.rule?.name || ''}
        description="A regra será removida e não mais influenciará validações de simulação ou esteira."
        onConfirm={confirmDelete}
        onClose={() => setDeleteModalConfig({ isOpen: false, rule: null })}
      />
    </div>
  );
};
