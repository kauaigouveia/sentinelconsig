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
        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Total de Convênios
            </span>
            <FileText className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {convenios.length} cadastrados
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-sans block">
            {activeCount} ativos disponíveis na esteira
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Convênios Globais
            </span>
            <Globe className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {globalCount} globais
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-sans block">
            Disponíveis para todos os parceiros e empresas
          </span>
        </div>

        <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
              Convênios Exclusivos
            </span>
            <Building className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
          </div>
          <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
            {exclusiveCount} da empresa
          </p>
          <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-sans block">
            Visíveis apenas para a empresa proprietária
          </span>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'border-[var(--success-border)] dark:border-[var(--success-border)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)]'
              : 'border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)]'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-text)]" />
          ) : (
            <X className="h-4 w-4 shrink-0 text-[var(--danger-text)]" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Cadastro / Edição Form */}
      <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center font-bold">
              {isEditing ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
            </div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
              {isEditing ? 'Editar Convênio' : 'Cadastrar Novo Convênio'}
            </h3>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer font-semibold"
            >
              Cancelar Edição
            </button>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Nome do Convênio *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: INSS, SIAPE, GOV-SP"
                className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Código / Sigla (Opcional)
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Ex: INSS, 01, SIAPE"
                className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase font-mono focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
              />
            </div>

            {isMaster && !isEditing && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Escopo de Disponibilidade *
                </label>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value as 'GLOBAL' | 'EXCLUSIVE')}
                  className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
                >
                  <option value="GLOBAL">GLOBAL (Todas as empresas da plataforma)</option>
                  <option value="EXCLUSIVE">EXCLUSIVO (Apenas a empresa atual)</option>
                </select>
              </div>
            )}

            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Descrição Detalhada / Regras de Aplicação
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ex: Aposentados e pensionistas da Previdência Social"
                className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
              />
            </div>

            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-0"
                />
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Convênio Ativo
                </span>
              </label>

              <button
                type="submit"
                className="ml-auto flex items-center gap-1.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-4 py-2  transition-colors cursor-pointer"
              >
                {isEditing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                <span>{isEditing ? 'Atualizar Convênio' : 'Cadastrar Convênio'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por nome ou código..."
            className="w-full pl-9 pr-3 py-1.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Filter className="h-3.5 w-3.5" />
            <span>Escopo:</span>
          </div>
          <select
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value as any)}
            className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
          >
            <option value="ALL">Todos os escopos</option>
            <option value="GLOBAL">Globais</option>
            <option value="EXCLUSIVE">Exclusivos</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
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
              className={`p-4 rounded-xl border bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  space-y-3 flex flex-col justify-between transition-all ${
                c.active
                  ? 'border-[var(--field-border)] dark:border-[var(--field-border)]'
                  : 'border-[var(--field-border)] dark:border-[var(--field-border)] opacity-70 bg-[var(--bg-canvas)]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                        {c.name}
                      </span>
                      {c.code && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                          {c.code}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2">
                        {c.description}
                      </p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                      isGlobal
                        ? 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                        : 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                    }`}
                  >
                    {isGlobal ? <Globe className="h-3 w-3" /> : <Building className="h-3 w-3" />}
                    <span>{isGlobal ? 'GLOBAL' : 'EXCLUSIVO'}</span>
                  </span>
                </div>

                {!isGlobal && c.tenantName && (
                  <div className="text-[10px] text-[var(--link)] dark:text-[var(--link)] font-semibold bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)]">
                    Empresa: {c.tenantName}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(c)}
                    disabled={!canManage}
                    title={canManage ? (c.active ? 'Desativar convênio' : 'Ativar convênio') : 'Apenas Master pode gerenciar convênios globais'}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                      c.active
                        ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] hover:bg-[var(--success-bg)]'
                        : 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]'
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
                        className="text-[var(--text-secondary)] hover:text-[var(--link)] p-1 rounded-lg transition-colors cursor-pointer"
                        title="Editar convênio"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="text-[var(--text-secondary)] hover:text-[var(--danger-text)] p-1 rounded-lg transition-colors cursor-pointer"
                        title="Excluir convênio"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {!canManage && (
                    <span className="text-[10px] text-[var(--text-secondary)] italic">Padrão da Plataforma</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="p-8 text-center bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] text-xs">
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
