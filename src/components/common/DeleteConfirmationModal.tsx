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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  border border-[var(--danger-border)] dark:border-[var(--danger-border)] overflow-hidden transition-colors">
        {/* Top Accent Strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5   " />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-full bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center justify-center mb-3.5 ring-8 ring-[var(--danger-border)] dark:ring-[var(--danger-border)]">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
            Esta operação é permanente e não poderá ser desfeita.
          </p>
        </div>

        {/* Target Item Card */}
        <div className="my-4 rounded-xl border border-[var(--danger-border)] dark:border-[var(--danger-border)] bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] p-3 text-left">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="rounded bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--danger-text)] dark:text-[var(--danger-text)]">
              {itemType}
            </span>
          </div>
          <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] break-all">{itemName}</p>
          {description && (
            <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1 font-medium">{description}</p>
          )}
        </div>

        {/* Form with Security Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]" />
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
                className={`w-full rounded-xl border px-3.5 py-2.5 pr-10 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] outline-none transition-all placeholder:text-[var(--text-secondary)] dark:placeholder:text-[var(--text-secondary)] ${
                  error
                    ? 'border-[var(--danger-border)] dark:border-[var(--danger-border)] ring-2 ring-[var(--danger-border)] dark:ring-[var(--danger-border)]'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] focus:border-[var(--danger-border)] focus:ring-2 focus:ring-[var(--danger-border)] dark:focus:ring-[var(--danger-border)]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] p-0.5"
                title={showPassword ? 'Ocultar' : 'Visualizar'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {error ? (
              <p className="mt-1.5 text-[11px] font-semibold text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{error}</span>
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Digite a palavra <strong>EXCLUIR</strong> para confirmar.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] px-4 py-2 text-xs font-bold text-[var(--danger-text)]  transition-colors"
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

