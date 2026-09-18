import React, { useState } from 'react';
import {
  Layers,
  Plus,
  CheckCircle2,
  ShieldAlert,
  Trash2,
  FileSpreadsheet,
  Zap,
  Check,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Product } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { ProductImportModal } from './ProductImportModal';
import { ActionBar } from '../ui/ActionBar';
import { MetricCard } from '../ui/MetricCard';

export const ProductManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(() => StorageService.getProducts());
  const [name, setName] = useState('');
  const [requiresPort, setRequiresPort] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      StorageService.createProduct({
        name: name.trim().toUpperCase(),
        type: requiresPort ? 'PORTABILIDADE' : 'CONSIGNADO',
        active: true,
        allowsMultipleAde: true,
        requiresPortabilityRelation: requiresPort,
      });
      setProducts(StorageService.getProducts());
      setName('');
      setRequiresPort(false);
      setMessage('Produto cadastrado com sucesso!');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      alert(err.message);
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

  const handleDeleteProduct = (p: Product) => {
    setDeleteModalConfig({
      isOpen: true,
      itemType: 'Linha de Produto',
      itemName: p.name,
      description: 'O produto será excluído das opções de cadastro de propostas e filtros operacionais.',
      onConfirm: () => {
        try {
          StorageService.deleteProduct(p.id);
          setProducts(StorageService.getProducts());
          setMessage(`Produto ${p.name} excluído com sucesso.`);
          setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
          alert(err.message || 'Erro ao excluir produto.');
        }
      },
    });
  };

  const portCount = products.filter(p => p.requiresPortabilityRelation || p.type === 'PORTABILIDADE').length;
  const standardCount = products.length - portCount;

  return (
    <div className="space-y-6">
      <ActionBar
        title="Linhas de Produto & Regras Operacionais"
        subtitle="Configuração de produtos de crédito consignado e regras de esteira (vínculos obrigatórios, multi-ADE e portabilidade)"
        badgeText="CATÁLOGO DE PRODUTOS"
        badgeColor="bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800"
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 font-mono">
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
              Total de Produtos
            </span>
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-950 dark:text-blue-200">
            {products.length} linhas
          </p>
          <span className="text-[11px] text-blue-700 dark:text-blue-400 font-bold block font-sans">
            Opções ativas no formulário de digitação
          </span>
        </div>

        <div className="rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">
              Portabilidade / Refin da Port
            </span>
            <ShieldCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-950 dark:text-purple-200">
            {portCount} produtos
          </p>
          <span className="text-[11px] text-purple-700 dark:text-purple-400 font-bold block font-sans">
            Exigem vínculo de saldo CIP
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Consignado & Cartão
            </span>
            <Tag className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">
            {standardCount} produtos
          </p>
          <span className="text-[11px] text-slate-500 font-bold block font-sans">
            Novo, Refin, Cartão RMC/RCC
          </span>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Form Criar Produto */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Cadastrar Nova Linha de Produto
          </h3>
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            Importar Produtos
          </button>
        </div>

        <form onSubmit={handleCreateProduct} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nome da Linha de Produto *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: NOVO DIGITAL DATAPREV"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white uppercase focus:outline-hidden"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={requiresPort}
              onChange={e => setRequiresPort(e.target.checked)}
              className="rounded border-slate-300 text-purple-600 focus:ring-0"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Exige vínculo com Portabilidade (Refin da Port)
            </span>
          </label>

          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Salvar Produto</span>
          </button>
        </form>
      </div>
      <ProductImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImportCompleted={async () => {
          // Trigger a refresh from backend if possible, or just reload local storage
          try {
            const res = await fetch('/api/products');
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                 const formattedProducts = data.map((pr: any) => ({
                    id: pr.id,
                    name: pr.name,
                    description: pr.description || '',
                    type: pr.type || 'NOVO',
                    allowsMultipleAde: true,
                    requiresPortabilityRelation: false, // We can sync this properly later, using defaults for now
                    active: pr.active,
                    createdAt: pr.createdAt,
                    updatedAt: pr.updatedAt,
                  }));
                  localStorage.setItem('SentinelProducts', JSON.stringify(formattedProducts));
              }
            }
          } catch (e) {
            console.error(e);
          }
          setProducts(StorageService.getProducts());
        }} 
      />

      {/* Grid de Produtos Cadastrados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {products.map(p => {
          const isPort = p.requiresPortabilityRelation || p.type === 'PORTABILIDADE';

          return (
            <div
              key={p.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-2xs space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                      isPort
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    }`}
                  >
                    {isPort ? 'PORTABILIDADE' : 'CONSIGNADO'}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Permite Multi-ADE / Desdobramentos</span>
                  </div>
                  {isPort && (
                    <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Exige vínculo de saldo CIP</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">ATIVO NA ESTEIRA</span>
                <button
                  onClick={() => handleDeleteProduct(p)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Excluir produto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
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
