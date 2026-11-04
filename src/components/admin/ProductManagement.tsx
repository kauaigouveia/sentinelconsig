import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  CheckCircle2,
  ShieldAlert,
  Trash2,
  FileSpreadsheet,
  Check,
  Tag,
  ShieldCheck,
  FileText,
  SlidersHorizontal,
  Edit2,
  Globe,
  Building,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Product, Convenio } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { ProductImportModal } from './ProductImportModal';
import { ActionBar } from '../ui/ActionBar';
import { ConvenioManagement } from './ConvenioManagement';
import { OperationalRulesManagement } from './OperationalRulesManagement';
import { hasPermission } from '../../lib/permissions';

export const ProductManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'convenios' | 'produtos' | 'regras'>('convenios');
  const [products, setProducts] = useState<Product[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);

  // Product Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('NOVO');
  const [scope, setScope] = useState<'GLOBAL' | 'EXCLUSIVE'>('EXCLUSIVE');
  const [requiresPort, setRequiresPort] = useState(false);
  const [allowsMultipleAde, setAllowsMultipleAde] = useState(true);
  const [active, setActive] = useState(true);
  const [appliesToAllConvenios, setAppliesToAllConvenios] = useState(true);
  const [selectedConvenioIds, setSelectedConvenioIds] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'GLOBAL' | 'EXCLUSIVE'>('ALL');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const activeUser = StorageService.getActiveUser();
  const currentTenant = StorageService.getCurrentTenant();
  const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';
  const canViewProducts = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'products.view');
  const canCreateProducts = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'products.create');
  const canUpdateProducts = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'products.update');
  const canDeleteProducts = activeUser?.role === 'PLATFORM_MASTER' || hasPermission(activeUser?.role, activeUser?.customPermissions, 'products.delete');

  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({
    isOpen: false,
    product: null,
  });

  const loadData = async () => {
    const [syncedProducts, syncedConvenios] = await Promise.all([
      StorageService.fetchAndSyncProducts(true),
      StorageService.fetchAndSyncConvenios(true),
    ]);
    setProducts(syncedProducts);
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
    setCode('');
    setDescription('');
    setType('NOVO');
    setScope(isMaster ? 'GLOBAL' : 'EXCLUSIVE');
    setRequiresPort(false);
    setAllowsMultipleAde(true);
    setActive(true);
    setAppliesToAllConvenios(true);
    setSelectedConvenioIds([]);
  };

  const showNotification = (text: string, notifType: 'success' | 'error' = 'success') => {
    setMessage({ text, type: notifType });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification('O nome da linha de produto é obrigatório.', 'error');
      return;
    }

    try {
      const payload = {
        name: name.trim().toUpperCase(),
        code: code.trim().toUpperCase() || undefined,
        description: description.trim() || undefined,
        type: requiresPort ? 'PORTABILIDADE' : type,
        scope,
        active,
        allowsMultipleAde,
        requiresPortabilityRelation: requiresPort,
        convenioIds: appliesToAllConvenios ? [] : selectedConvenioIds,
        tenantId: scope === 'EXCLUSIVE' ? currentTenant.id : undefined,
      };

      if (isEditing && editingId) {
        await StorageService.updateProduct(editingId, payload);
        showNotification(`Produto "${name.trim().toUpperCase()}" atualizado com sucesso!`);
      } else {
        await StorageService.createProduct(payload);
        showNotification(`Produto "${name.trim().toUpperCase()}" cadastrado com sucesso!`);
      }

      await loadData();
      resetForm();
    } catch (err: any) {
      showNotification(err.message || 'Erro ao processar produto.', 'error');
    }
  };

  const handleEditProduct = (p: Product) => {
    if ((p.scope ?? 'GLOBAL') === 'GLOBAL' && !isMaster) {
      showNotification('Apenas o Administrador Master pode editar produtos globais.', 'error');
      return;
    }
    setIsEditing(true);
    setEditingId(p.id);
    setName(p.name);
    setCode(p.code || '');
    setDescription(p.description || '');
    setType(p.type || 'CONSIGNADO');
    setScope(p.scope || 'GLOBAL');
    setRequiresPort(Boolean(p.requiresPortabilityRelation));
    setAllowsMultipleAde(p.allowsMultipleAde !== undefined ? p.allowsMultipleAde : true);
    setActive(p.active !== undefined ? p.active : true);
    if (p.convenioIds && p.convenioIds.length > 0) {
      setAppliesToAllConvenios(false);
      setSelectedConvenioIds(p.convenioIds);
    } else {
      setAppliesToAllConvenios(true);
      setSelectedConvenioIds([]);
    }
  };

  const handleDeleteProduct = (p: Product) => {
    if ((p.scope ?? 'GLOBAL') === 'GLOBAL' && !isMaster) {
      showNotification('Apenas administradores Master podem excluir produtos globais.', 'error');
      return;
    }
    setDeleteModalConfig({
      isOpen: true,
      product: p,
    });
  };

  const confirmDelete = async () => {
    if (!deleteModalConfig.product) return;
    try {
      await StorageService.deleteProduct(deleteModalConfig.product.id);
      await loadData();
      showNotification(`Produto ${deleteModalConfig.product.name} excluído com sucesso.`);
      setDeleteModalConfig({ isOpen: false, product: null });
    } catch (err: any) {
      showNotification(err.message || 'Erro ao excluir produto.', 'error');
    }
  };

  const toggleConvenioSelection = (cId: string) => {
    setSelectedConvenioIds(prev =>
      prev.includes(cId) ? prev.filter(x => x !== cId) : [...prev, cId]
    );
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch =
      searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesScope =
      scopeFilter === 'ALL' ||
      (scopeFilter === 'GLOBAL' && (p.scope ?? 'GLOBAL') === 'GLOBAL') ||
      (scopeFilter === 'EXCLUSIVE' && p.scope === 'EXCLUSIVE');

    return matchesSearch && matchesScope;
  });

  const portCount = products.filter(p => p.requiresPortabilityRelation || p.type === 'PORTABILIDADE').length;
  const standardCount = products.length - portCount;

  return (
    <div className="space-y-6">
      <ActionBar
        title="Módulo de Convênios, Produtos & Regras"
        subtitle="Gerenciamento unificado de convênios de crédito, catálogo de produtos e matriz de regras operacionais com suporte a escopo Global e Exclusivo"
        badgeText="CONVÊNIOS & PRODUTOS"
        badgeColor="bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]"
      />

      {/* Tabs Switcher */}
      <div className="flex border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
        <button
          type="button"
          onClick={() => setActiveTab('convenios')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'convenios'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Convênios ({convenios.length})</span>
        </button>

        {canViewProducts && <button
          type="button"
          onClick={() => setActiveTab('produtos')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'produtos'
              ? 'border-[var(--field-border)] text-[var(--link)] dark:text-[var(--link)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Produtos ({products.length})</span>
        </button>}

        <button
          type="button"
          onClick={() => setActiveTab('regras')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeTab === 'regras'
              ? 'border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)] bg-[var(--success-bg)] dark:bg-[var(--success-bg)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Regras Operacionais</span>
        </button>
      </div>

      {/* Tab 1: Convênios */}
      {activeTab === 'convenios' && <ConvenioManagement />}

      {/* Tab 3: Regras Operacionais */}
      {activeTab === 'regras' && <OperationalRulesManagement />}

      {/* Tab 2: Produtos */}
      {activeTab === 'produtos' && canViewProducts && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono">
            <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
              <div className="flex items-center justify-between font-sans">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
                  Total de Produtos
                </span>
                <Layers className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
              </div>
              <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
                {products.length} linhas
              </p>
              <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block font-sans">
                Opções disponíveis no formulário de digitação
              </span>
            </div>

            <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)] p-4  space-y-1.5">
              <div className="flex items-center justify-between font-sans">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--link)] dark:text-[var(--link)]">
                  Portabilidade / Refin da Port
                </span>
                <ShieldCheck className="h-4 w-4 text-[var(--link)] dark:text-[var(--link)]" />
              </div>
              <p className="text-2xl font-black text-[var(--link)] dark:text-[var(--link)]">
                {portCount} produtos
              </p>
              <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold block font-sans">
                Exigem vínculo de saldo CIP
              </span>
            </div>

            <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-4  space-y-1.5">
              <div className="flex items-center justify-between font-sans">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                  Consignado & Cartão
                </span>
                <Tag className="h-4 w-4 text-[var(--text-secondary)]" />
              </div>
              <p className="text-2xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {standardCount} produtos
              </p>
              <span className="text-[11px] text-[var(--text-secondary)] font-bold block font-sans">
                Novo, Refin, Cartão RMC/RCC
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

          {/* Form Criar/Editar Produto */}
          {(isEditing ? canUpdateProducts : canCreateProducts) && <div className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5  space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center font-bold">
                  {isEditing ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  {isEditing ? 'Editar Linha de Produto' : 'Cadastrar Nova Linha de Produto'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isEditing && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] cursor-pointer font-semibold mr-2"
                  >
                    Cancelar Edição
                  </button>
                )}
                {canCreateProducts && <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-3 py-1.5 text-[11px] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--link)] dark:text-[var(--link)]" />
                  Importar Produtos
                </button>}
              </div>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Nome da Linha de Produto *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: NOVO DIGITAL DATAPREV"
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
                    placeholder="Ex: NOVO, CARTAO"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase font-mono focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Tipo de Operação *
                  </label>
                  <select
                    value={type}
                    onChange={e => {
                      setType(e.target.value);
                      if (e.target.value === 'PORTABILIDADE' || e.target.value === 'REFIN_PORTABILIDADE') {
                        setRequiresPort(true);
                      }
                    }}
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
                  >
                    <option value="NOVO">Empréstimo Consignado (NOVO)</option>
                    <option value="REFIN">Refinanciamento (REFIN)</option>
                    <option value="PORTABILIDADE">Portabilidade de Crédito (PORTABILIDADE)</option>
                    <option value="REFIN_PORTABILIDADE">Refinanciamento da Portabilidade (REFIN_PORTABILIDADE)</option>
                    <option value="CARTAO_RMC">Cartão Consignado RMC (CARTAO_RMC)</option>
                    <option value="CARTAO_RCC">Cartão Benefício RCC (CARTAO_RCC)</option>
                    <option value="SAQUE_COMPLEMENTAR">Saque Complementar (SAQUE_COMPLEMENTAR)</option>
                  </select>
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
                    Descrição Detalhada
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Ex: Contrato de crédito consignado para aposentados"
                    className="w-full rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--focus)]"
                  />
                </div>
              </div>

              {/* Vínculo com Convênios */}
              <div className="p-3.5 rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[var(--link)]" />
                    <span>Convênios Compatíveis com este Produto</span>
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={appliesToAllConvenios}
                      onChange={e => setAppliesToAllConvenios(e.target.checked)}
                      className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-0"
                    />
                    <span>Compatível com Todos os Convênios</span>
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
                              ? 'bg-[var(--action)] text-[var(--text-primary)] border-[var(--field-border)]'
                              : 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)]'
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

              {/* Checkboxes de Parâmetros */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={requiresPort}
                      onChange={e => setRequiresPort(e.target.checked)}
                      className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      Exige vínculo com Portabilidade (Refin da Port)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowsMultipleAde}
                      onChange={e => setAllowsMultipleAde(e.target.checked)}
                      className="rounded border-[var(--field-border)] text-[var(--link)] focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      Permite Multi-ADE
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={e => setActive(e.target.checked)}
                      className="rounded border-[var(--field-border)] text-[var(--success-text)] focus:ring-0"
                    />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      Produto Ativo
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] font-bold text-xs px-4 py-2  transition-colors cursor-pointer"
                >
                  {isEditing ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{isEditing ? 'Atualizar Produto' : 'Salvar Produto'}</span>
                </button>
              </div>
            </form>
          </div>}

          {canCreateProducts && <ProductImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onImportCompleted={async () => {
              await loadData();
            }}
          />}

          {/* Filters Bar */}
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
            </div>
          </div>

          {/* Grid de Produtos Cadastrados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredProducts.map(p => {
              const isPort = p.requiresPortabilityRelation || p.type === 'PORTABILIDADE';
              const isGlobal = (p.scope ?? 'GLOBAL') === 'GLOBAL';
              const canEdit = canUpdateProducts && (isMaster || !isGlobal);
              const canDelete = canDeleteProducts && (isMaster || !isGlobal);

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]  space-y-3 flex flex-col justify-between transition-all ${
                    p.active
                      ? 'border-[var(--field-border)] dark:border-[var(--field-border)]'
                      : 'border-[var(--field-border)] dark:border-[var(--field-border)] opacity-70 bg-[var(--bg-canvas)]'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{p.name}</span>
                          {p.code && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                              {p.code}
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                            isPort
                              ? 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                              : 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                          }`}
                        >
                          {p.type || (isPort ? 'PORTABILIDADE' : 'CONSIGNADO')}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${
                            isGlobal
                              ? 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                              : 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
                          }`}
                        >
                          {isGlobal ? <Globe className="h-2.5 w-2.5" /> : <Building className="h-2.5 w-2.5" />}
                          <span>{isGlobal ? 'GLOBAL' : 'EXCLUSIVO'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
                      <div className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-[var(--success-text)]" />
                        <span>Permite Multi-ADE / Desdobramentos</span>
                      </div>
                      {isPort && (
                        <div className="flex items-center gap-1.5 text-[var(--link)] dark:text-[var(--link)] font-medium">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>Exige vínculo de saldo CIP</span>
                        </div>
                      )}
                      <div className="text-[10px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] pt-1">
                        <strong>Convênios:</strong>{' '}
                        {p.convenioIds && p.convenioIds.length > 0
                          ? convenios
                              .filter(c => p.convenioIds!.includes(c.id))
                              .map(c => c.name)
                              .join(', ') || 'Nenhum'
                          : 'Todos os convênios'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between">
                    <span
                      className={`text-[10px] font-bold ${
                        p.active ? 'text-[var(--success-text)] dark:text-[var(--success-text)]' : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {p.active ? 'ATIVO NA ESTEIRA' : 'INATIVO'}
                    </span>

                    <div className="flex items-center gap-1">
                      {(canEdit || canDelete) && (
                        <>
                          {canEdit && <>
                          <button
                            onClick={() => handleEditProduct(p)}
                            className="text-[var(--text-secondary)] hover:text-[var(--link)] p-1 rounded-lg transition-colors cursor-pointer"
                            title="Editar produto"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          </>}
                          {canDelete && <>
                          <button
                            onClick={() => handleDeleteProduct(p)}
                            className="text-[var(--text-secondary)] hover:text-[var(--danger-text)] p-1 rounded-lg transition-colors cursor-pointer"
                            title="Excluir produto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          </>}
                        </>
                      )}
                      {!canEdit && !canDelete && (
                        <span className="text-[10px] text-[var(--text-secondary)] italic">Padrão da Plataforma</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <DeleteConfirmationModal
            isOpen={deleteModalConfig.isOpen}
            itemType="Linha de Produto"
            itemName={deleteModalConfig.product?.name || ''}
            description="O produto será excluído das opções de cadastro de propostas e filtros operacionais."
            onConfirm={confirmDelete}
            onClose={() => setDeleteModalConfig({ isOpen: false, product: null })}
          />
        </div>
      )}
    </div>
  );
};
