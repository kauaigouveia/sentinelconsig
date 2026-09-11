import React, { useState } from 'react';
import { Layers, Plus, CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { Product } from '../../types';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';

export const ProductManagement: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(() => StorageService.getProducts());
  const [name, setName] = useState('');
  const [requiresPort, setRequiresPort] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Layers className="h-5 w-5 text-blue-600" />
          <span>Linhas de Produto & Regras</span>
        </h2>
        <p className="text-xs text-slate-500">
          Configuração de produtos operacionais e regras de vínculo (ex: REFIN DA PORTABILIDADE exige vínculo com PORTABILIDADE)
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Cadastrar Novo Produto
        </h3>
        <form onSubmit={handleCreateProduct} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome do Produto *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: NOVO DIGITAL"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 uppercase"
            />
          </div>

          <div className="flex items-center gap-2 pb-2.5">
            <input
              type="checkbox"
              id="chk-requires-port"
              checked={requiresPort}
              onChange={e => setRequiresPort(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <label htmlFor="chk-requires-port" className="text-xs font-medium text-slate-700">
              Exige vínculo com Portabilidade
            </label>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs"
          >
            + Cadastrar Produto
          </button>
        </form>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Várias ADEs por Cliente?</th>
              <th className="px-4 py-3">Exige Vínculo com Portabilidade?</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {products.map(p => (
              <tr key={p.id} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-bold text-slate-900">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="text-emerald-700 font-semibold">Sim (Multi-ADE)</span>
                </td>
                <td className="px-4 py-3">
                  {p.requiresPortabilityRelation ? (
                    <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">
                      Sim (Obrigatório)
                    </span>
                  ) : (
                    <span className="text-slate-400">Não</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 className="h-3 w-3" /> Ativo
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleDeleteProduct(p)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                    title="Excluir produto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
