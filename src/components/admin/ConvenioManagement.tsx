import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Edit2,
  Globe,
  Building,
  Check,
  X,
  Power,
  Layers,
  Filter,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Convenio } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

interface ConvenioManagementProps {
  onSelectConvenio?: (convenio: Convenio) => void;
}

export const ConvenioManagement: React.FC<ConvenioManagementProps> = () => {
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'GLOBAL' | 'EXCLUSIVE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'GLOBAL' | 'EXCLUSIVE'>('EXCLUSIVE');
  const [active, setActive] = useState(true);

  // Current session info
  const activeUser = StorageService.getActiveUser();
  const currentTenant = StorageService.getCurrentTenant();
  const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    convenio: Convenio | null;
  }>({
    isOpen: false,
    convenio: null,
  });

  const loadConvenios = async () => {
    try {
      const data = await StorageService.fetchAndSyncConvenios(true);
      setConvenios(data);
    } catch (err: any) {
      console.error('Erro ao carregar convênios:', err);
    }
  };

  useEffect(() => {
    void loadConvenios();
    const handleStorageUpdate = () => void loadConvenios();
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
    setCode('');
    setDescription('');
    setScope(isMaster ? 'GLOBAL' : 'EXCLUSIVE');
    setActive(true);
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification('O nome do convênio é obrigatório.', 'error');
      return;
    }

    try {
      if (isEditing && editingId) {
        await StorageService.updateConvenio(editingId, {
          name: name.trim().toUpperCase(),
          code: code.trim().toUpperCase() || undefined,
          description: description.trim() || undefined,
          active,
        });
        showNotification(`Convênio "${name.trim().toUpperCase()}" atualizado com sucesso!`);
      } else {
        await StorageService.createConvenio({
          name: name.trim().toUpperCase(),
          code: code.trim().toUpperCase() || undefined,
          description: description.trim() || undefined,
          scope,
          active,
          tenantId: scope === 'EXCLUSIVE' ? currentTenant.id : undefined,
        });
        showNotification(`Convênio "${name.trim().toUpperCase()}" cadastrado com sucesso!`);
      }

      await loadConvenios();
      resetForm();
    } catch (err: any) {
      showNotification(err.message || 'Erro ao processar operação.', 'error');
    }
  };

  const handleEdit = (c: Convenio) => {
    if (c.scope === 'GLOBAL' && !isMaster) {
      showNotification('Apenas o Administrador Master pode editar convênios globais.', 'error');
      return;
    }
    setIsEditing(true);
    setEditingId(c.id);
    setName(c.name);
    setCode(c.code || '');
    setDescription(c.description || '');
    setScope(c.scope);
    setActive(c.active);
  };

  const handleToggleStatus = async (c: Convenio) => {
    if (c.scope === 'GLOBAL' && !isMaster) {
      showNotification('Apenas o Administrador Master pode alterar convênios globais.', 'error');
      return;
    }
    try {
      await StorageService.updateConvenio(c.id, { active: !c.active });
      await loadConvenios();
      showNotification(`Convênio ${c.name} ${!c.active ? 'ativado' : 'desativado'} com sucesso.`);
    } catch (err: any) {
      showNotification(err.message || 'Erro ao alterar status.', 'error');
    }
  };

  const handleDelete = (c: Convenio) => {
    if (c.scope === 'GLOBAL' && !isMaster) {
      showNotification('Apenas o Administrador Master pode excluir convênios globais.', 'error');
      return;
    }
    setDeleteModalConfig({
      isOpen: true,
      convenio: c,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModalConfig.convenio) return;
    try {
      await StorageService.deleteConvenio(deleteModalConfig.convenio.id);
      await loadConvenios();
      showNotification(`Convênio ${deleteModalConfig.convenio.name} excluído com sucesso.`);
      setDeleteModalConfig({ isOpen: false, convenio: null });
    } catch (err: any) {
      showNotification(err.message || 'Erro ao excluir convênio.', 'error');
    }
  };

  // Filtered List
  const filtered = convenios.filter(c => {
    const matchesSearch =
      searchQuery === '' ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.code && c.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesScope =
      scopeFilter === 'ALL' ||
      (scopeFilter === 'GLOBAL' && c.scope === 'GLOBAL') ||
      (scopeFilter === 'EXCLUSIVE' && c.scope === 'EXCLUSIVE');

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && c.active) ||
      (statusFilter === 'INACTIVE' && !c.active);

    return matchesSearch && matchesScope && matchesStatus;
  });

  const globalCount = convenios.filter(c => c.scope === 'GLOBAL').length;
  const exclusiveCount = convenios.filter(c => c.scope === 'EXCLUSIVE').length;
  const activeCount = convenios.filter(c => c.active).length;

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono">
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Total de Convênios
            </span>
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-950 dark:text-blue-200">
            {convenios.length} cadastrados
          </p>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-sans block">
            {activeCount} ativos disponíveis na esteira
          </span>
        </div>

        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
              Convênios Globais
            </span>
            <Globe className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-indigo-950 dark:text-indigo-200">
            {globalCount} globais
          </p>
          <span className="text-[11px] text-indigo-700 dark:text-indigo-400 font-sans block">
            Disponíveis para todos os parceiros e empresas
          </span>
        </div>

        <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">
              Convênios Exclusivos
            </span>
            <Building className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-950 dark:text-purple-200">
            {exclusiveCount} da empresa
          </p>
          <span className="text-[11px] text-purple-700 dark:text-purple-400 font-sans block">
            Visíveis apenas para a empresa proprietária
          </span>
        </div>
      </div>

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
            <div className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              {isEditing ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isEditing ? 'Editar Convênio' : 'Cadastrar Novo Convênio'}
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
                Nome do Convênio *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: INSS, SIAPE, GOV-SP"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white uppercase focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Código / Sigla (Opcional)
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Ex: INSS, 01, SIAPE"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white uppercase font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {isMaster && !isEditing && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Escopo de Disponibilidade *
                </label>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value as 'GLOBAL' | 'EXCLUSIVE')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  <option value="GLOBAL">GLOBAL (Todas as empresas da plataforma)</option>
                  <option value="EXCLUSIVE">EXCLUSIVO (Apenas a empresa atual)</option>
                </select>
              </div>
            )}

            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Descrição Detalhada / Regras de Aplicação
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Aposentados e pensionistas da Previdência Social"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Convênio Ativo
                </span>
              </label>

              <button
                type="submit"
                className="ml-auto flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 shadow-xs transition-colors cursor-pointer"
              >
                {isEditing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                <span>{isEditing ? 'Atualizar Convênio' : 'Cadastrar Convênio'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#0f172a] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por nome ou código..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Escopo:</span>
          </div>
          <select
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
          >
            <option value="ALL">Todos os escopos</option>
            <option value="GLOBAL">Globais</option>
            <option value="EXCLUSIVE">Exclusivos</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
          >
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Apenas Ativos</option>
            <option value="INACTIVE">Apenas Inativos</option>
          </select>
        </div>
      </div>

      {/* Grid of Convenios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filtered.map(c => {
          const isGlobal = c.scope === 'GLOBAL';
          const canManage = isMaster || !isGlobal;

          return (
            <div
              key={c.id}
              className={`p-4 rounded-xl border bg-white dark:bg-[#0f172a] shadow-2xs space-y-3 flex flex-col justify-between transition-all ${
                c.active
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-slate-200/60 dark:border-slate-800/60 opacity-70 bg-slate-50/50'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {c.name}
                      </span>
                      {c.code && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {c.code}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2">
                        {c.description}
                      </p>
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
                    <span>{isGlobal ? 'GLOBAL' : 'EXCLUSIVO'}</span>
                  </span>
                </div>

                {!isGlobal && c.tenantName && (
                  <div className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/40 p-1.5 rounded-lg border border-purple-100 dark:border-purple-900/40">
                    Empresa: {c.tenantName}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(c)}
                    disabled={!canManage}
                    title={canManage ? (c.active ? 'Desativar convênio' : 'Ativar convênio') : 'Apenas Master pode gerenciar convênios globais'}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      c.active
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                    } ${!canManage ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <Power className="h-3 w-3" />
                    <span>{c.active ? 'ATIVO' : 'INATIVO'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEdit(c)}
                        className="text-slate-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Editar convênio"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                        title="Excluir convênio"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {!canManage && (
                    <span className="text-[10px] text-slate-400 italic">Padrão da Plataforma</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-8 text-center bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
          Nenhum convênio encontrado com os filtros selecionados.
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        itemType="Convênio"
        itemName={deleteModalConfig.convenio?.name || ''}
        description={`O convênio "${deleteModalConfig.convenio?.name}" será removido das opções de produção e regras.`}
        onConfirm={confirmDelete}
        onClose={() => setDeleteModalConfig({ isOpen: false, convenio: null })}
      />
    </div>
  );
};
