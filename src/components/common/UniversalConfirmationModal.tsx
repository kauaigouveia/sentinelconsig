import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  Lock,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';

export interface UniversalConfirmationItemDetail {
  label: string;
  value: string;
  badge?: string;
}

export interface UniversalConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  message?: string;
  severity?: 'danger' | 'warning' | 'info';
  requiredConfirmationText?: string; // e.g. 'EXCLUIR', 'RESTAURAR', 'CONFIRMAR'
  requireMasterPassword?: boolean;
  itemDetails?: UniversalConfirmationItemDetail[];
  impactWarning?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export const UniversalConfirmationModal: React.FC<UniversalConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirmação de Ação',
  message = 'Por favor, revise as informações antes de prosseguir com esta operação.',
  severity = 'danger',
  requiredConfirmationText,
  requireMasterPassword = false,
  itemDetails = [],
  impactWarning,
  confirmButtonText,
  cancelButtonText = 'Cancelar',
}) => {
  const [inputText, setInputText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setShowPassword(false);
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (requiredConfirmationText) {
      const match = inputText.trim().toUpperCase() === requiredConfirmationText.trim().toUpperCase();
      const isMasterAuth = StorageService.verifySecurityAuth(inputText);

      if (!match && !isMasterAuth) {
        setError(`Digite exatamente "${requiredConfirmationText}" para autorizar a operação.`);
        return;
      }
    }

    if (requireMasterPassword) {
      const isAuth = StorageService.verifySecurityAuth(inputText);
      if (!isAuth) {
        setError('Senha master ou autorização de segurança inválida.');
        return;
      }
    }

    setError(null);
    try {
      setIsLoading(true);
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Ocorreu um erro ao processar a solicitação.');
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityStyles = () => {
    switch (severity) {
      case 'warning':
        return {
          stripColor: ' ',
          iconBg: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] ring-[var(--warning-border)] dark:ring-[var(--warning-border)]',
          Icon: AlertTriangle,
          btnBg: 'bg-[var(--warning-bg)] hover:bg-[var(--warning-bg)] text-[var(--text-primary)]',
          border: 'border-[var(--warning-border)] dark:border-[var(--warning-border)]',
          badgeBg: 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border-[var(--warning-border)] dark:border-[var(--warning-border)]',
        };
      case 'info':
        return {
          stripColor: ' ',
          iconBg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] ring-[var(--focus)] dark:ring-[var(--focus)]',
          Icon: Info,
          btnBg: 'bg-[var(--info-bg)] hover:bg-[var(--info-bg)] text-[var(--text-primary)]',
          border: 'border-[var(--field-border)] dark:border-[var(--field-border)]',
          badgeBg: 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border-[var(--field-border)] dark:border-[var(--field-border)]',
        };
      case 'danger':
      default:
        return {
          stripColor: ' ',
          iconBg: 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] ring-[var(--danger-border)] dark:ring-[var(--danger-border)]',
          Icon: ShieldAlert,
          btnBg: 'bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)] text-[var(--text-primary)]',
          border: 'border-[var(--danger-border)] dark:border-[var(--danger-border)]',
          badgeBg: 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] border-[var(--danger-border)] dark:border-[var(--danger-border)]',
        };
    }
  };

  const style = getSeverityStyles();
  const IconComponent = style.Icon;
  const defaultConfirmText = severity === 'danger' ? 'Confirmar Exclusão' : 'Confirmar Ação';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`relative w-full max-w-lg rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  border ${style.border} overflow-hidden transition-colors`}>
        {/* Top Accent Strip */}
        <div className={`absolute top-0 left-0 right-0 h-1.5  ${style.stripColor}`} />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors disabled:opacity-90"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex flex-col items-center text-center">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-3 ring-8 ${style.iconBg}`}>
            <IconComponent className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{title}</h3>
          <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1 max-w-md">
            {message}
          </p>
        </div>

        {/* Item Details Breakdown */}
        {itemDetails.length > 0 && (
          <div className={`my-4 rounded-xl border p-3 text-left space-y-2 ${style.badgeBg}`}>
            {itemDetails.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">{item.label}:</span>
                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span className="rounded bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-1.5 py-0.5 text-[10px] font-bold border border-[var(--field-border)] dark:border-[var(--field-border)]">
                      {item.badge}
                    </span>
                  )}
                  <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Impact Warning */}
        {impactWarning && (
          <div className="my-3 rounded-lg bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] p-3 text-left flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-[var(--warning-text)] shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-medium">
              {impactWarning}
            </p>
          </div>
        )}

        {/* Security / Confirmation Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {(requiredConfirmationText || requireMasterPassword) && (
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <span>
                    {requiredConfirmationText
                      ? `Digite "${requiredConfirmationText}" para confirmar`
                      : 'Senha de Segurança Master'}
                  </span>
                </span>
                {requiredConfirmationText && (
                  <span className="font-mono text-[11px] text-[var(--link)] dark:text-[var(--link)] font-bold">
                    {requiredConfirmationText}
                  </span>
                )}
              </label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : requireMasterPassword ? 'password' : 'text'}
                  autoFocus
                  value={inputText}
                  disabled={isLoading}
                  onChange={e => {
                    setInputText(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    requiredConfirmationText
                      ? `Digite ${requiredConfirmationText}`
                      : 'Informe a senha de autorização'
                  }
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] outline-none transition-all placeholder:text-[var(--text-secondary)] dark:placeholder:text-[var(--text-secondary)] ${
                    requireMasterPassword ? 'pr-10' : ''
                  } ${
                    error
                      ? 'border-[var(--danger-border)] dark:border-[var(--danger-border)] ring-2 ring-[var(--danger-border)] dark:ring-[var(--danger-border)]'
                      : 'border-[var(--field-border)] dark:border-[var(--field-border)] focus:border-[var(--field-border)] focus:ring-2 focus:ring-[var(--focus)] dark:focus:ring-[var(--focus)]'
                  }`}
                />

                {requireMasterPassword && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] p-0.5"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {error && (
                <p className="mt-1.5 text-[11px] font-semibold text-[var(--danger-text)] dark:text-[var(--danger-text)] flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors disabled:opacity-90"
            >
              {cancelButtonText}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold  transition-colors disabled:opacity-90 ${style.btnBg}`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>{confirmButtonText || defaultConfirmText}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
