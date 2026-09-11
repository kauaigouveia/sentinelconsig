import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  X,
  Trash2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemType: string;
  itemName: string;
  description?: string;
  confirmButtonText?: string;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmação de Exclusão Segura',
  itemType,
  itemName,
  description,
  confirmButtonText = 'Confirmar Exclusão',
}) => {
  const [securityInput, setSecurityInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSecurityInput('');
      setShowPassword(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityInput.trim()) {
      setError('Informe a palavra EXCLUIR para continuar.');
      return;
    }

    const isValid = StorageService.verifySecurityAuth(securityInput);
    if (!isValid) {
      setError('Palavra de confirmação inválida.');
      return;
    }

    setError(null);
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-rose-100 dark:border-rose-950/80 overflow-hidden transition-colors">
        {/* Top Accent Strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 to-red-600" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-3.5 ring-8 ring-rose-50 dark:ring-rose-950/30">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Esta operação é permanente e não poderá ser desfeita.
          </p>
        </div>

        {/* Target Item Card */}
        <div className="my-4 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/30 p-3 text-left">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="rounded bg-rose-200/80 dark:bg-rose-900/60 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-800 dark:text-rose-200">
              {itemType}
            </span>
          </div>
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 break-all">{itemName}</p>
          {description && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 font-medium">{description}</p>
          )}
        </div>

        {/* Form with Security Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <span>Verificação de Segurança *</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                value={securityInput}
                onChange={e => {
                  setSecurityInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Digite a palavra EXCLUIR"
                className={`w-full rounded-xl border px-3.5 py-2.5 pr-10 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                  error
                    ? 'border-rose-300 dark:border-rose-800 ring-2 ring-rose-100 dark:ring-rose-950'
                    : 'border-slate-300 dark:border-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:focus:ring-rose-950'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                title={showPassword ? 'Ocultar' : 'Visualizar'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error ? (
              <p className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{error}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Digite a palavra <strong>EXCLUIR</strong> para confirmar.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{confirmButtonText}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

