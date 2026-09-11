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
          stripColor: 'from-amber-500 to-orange-500',
          iconBg: 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 ring-amber-50 dark:ring-amber-950/30',
          Icon: AlertTriangle,
          btnBg: 'bg-amber-600 hover:bg-amber-700 text-white',
          border: 'border-amber-100 dark:border-amber-900/50',
          badgeBg: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900',
        };
      case 'info':
        return {
          stripColor: 'from-blue-500 to-indigo-600',
          iconBg: 'bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 ring-blue-50 dark:ring-blue-950/30',
          Icon: Info,
          btnBg: 'bg-blue-600 hover:bg-blue-700 text-white',
          border: 'border-blue-100 dark:border-blue-900/50',
          badgeBg: 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-900',
        };
      case 'danger':
      default:
        return {
          stripColor: 'from-rose-500 to-red-600',
          iconBg: 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 ring-rose-50 dark:ring-rose-950/30',
          Icon: ShieldAlert,
          btnBg: 'bg-rose-600 hover:bg-rose-700 text-white',
          border: 'border-rose-100 dark:border-rose-900/50',
          badgeBg: 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-900',
        };
    }
  };

  const style = getSeverityStyles();
  const IconComponent = style.Icon;
  const defaultConfirmText = severity === 'danger' ? 'Confirmar Exclusão' : 'Confirmar Ação';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border ${style.border} overflow-hidden transition-colors`}>
        {/* Top Accent Strip */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${style.stripColor}`} />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex flex-col items-center text-center">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center mb-3 ring-8 ${style.iconBg}`}>
            <IconComponent className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            {message}
          </p>
        </div>

        {/* Item Details Breakdown */}
        {itemDetails.length > 0 && (
          <div className={`my-4 rounded-xl border p-3 text-left space-y-2 ${style.badgeBg}`}>
            {itemDetails.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">{item.label}:</span>
                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span className="rounded bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                      {item.badge}
                    </span>
                  )}
                  <span className="font-bold text-slate-900 dark:text-slate-100">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Impact Warning */}
        {impactWarning && (
          <div className="my-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3 text-left flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              {impactWarning}
            </p>
          </div>
        )}

        {/* Security / Confirmation Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {(requiredConfirmationText || requireMasterPassword) && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    {requiredConfirmationText
                      ? `Digite "${requiredConfirmationText}" para confirmar`
                      : 'Senha de Segurança Master'}
                  </span>
                </span>
                {requiredConfirmationText && (
                  <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-bold">
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
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                    requireMasterPassword ? 'pr-10' : ''
                  } ${
                    error
                      ? 'border-rose-300 dark:border-rose-800 ring-2 ring-rose-100 dark:ring-rose-950'
                      : 'border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950'
                  }`}
                />

                {requireMasterPassword && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {error && (
                <p className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {cancelButtonText}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition-colors disabled:opacity-50 ${style.btnBg}`}
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
