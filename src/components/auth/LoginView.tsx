import React, { useState, useEffect } from 'react';
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { User } from '../../types';
import { ROLE_CONFIG, getRoleEmoji } from '../../lib/roleUtils';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const allUsers = StorageService.getUsers();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick preset login handler
  const handleQuickLogin = (user: User) => {
    setIsSubmitting(true);
    setTimeout(() => {
      StorageService.loginUser(user);
      setIsSubmitting(false);
      onLoginSuccess();
    }, 300);
  };

  // Manual Form submit handler
  const [whiteLabel, setWhiteLabel] = useState(StorageService.getWhiteLabel());

  useEffect(() => {
    const handleWlUpdate = () => {
      setWhiteLabel(StorageService.getWhiteLabel());
    };
    window.addEventListener('whiteLabelUpdated', handleWlUpdate);
    window.addEventListener('storage', handleWlUpdate);
    return () => {
      window.removeEventListener('whiteLabelUpdated', handleWlUpdate);
      window.removeEventListener('storage', handleWlUpdate);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim()) {
      setErrorMsg('Informe o e-mail de acesso.');
      return;
    }

    if (!password.trim()) {
      setErrorMsg('Informe a senha de acesso.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: password.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.message || data.error || 'Credenciais inválidas.');
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        StorageService.loginUser(data.user);
        setIsSubmitting(false);
        onLoginSuccess();
      } else {
        setErrorMsg('Erro inesperado na resposta de autenticação.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg('Não foi possível conectar ao servidor de autenticação. Verifique sua conexão.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-slate-900 text-slate-100 font-sans antialiased relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Dynamic Background Glow Effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-600/20 via-purple-600/10 to-transparent blur-3xl pointer-events-none" />

      {/* Top Brand Header */}
      <header className="p-6 md:p-8 flex items-center justify-between z-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center shrink-0">
            {whiteLabel.logoUrl ? (
              <img
                src={whiteLabel.logoUrl}
                alt={whiteLabel.companyName}
                className="h-full w-full object-contain filter drop-shadow-md rounded-lg"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-sm flex items-center justify-center shadow-sm">
                {whiteLabel.companyName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-white leading-tight">
              {whiteLabel.companyName}
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              {whiteLabel.tradeName || 'Central Integrada de Consignados & Esteira de Produção'}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/80 text-xs text-slate-400 backdrop-blur-md">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Ambiente Seguro & Auditado</span>
        </div>
      </header>

      {/* Main Login Card Area */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-6 z-10 my-auto">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 md:p-8 shadow-2xl backdrop-blur-xl relative">
            <div className="mb-6 text-center">
              <div className="h-16 w-16 mx-auto mb-3 flex items-center justify-center">
                {whiteLabel.logoUrl ? (
                  <img
                    src={whiteLabel.logoUrl}
                    alt={whiteLabel.companyName}
                    className="h-full w-full object-contain filter drop-shadow-lg rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xl flex items-center justify-center shadow-lg">
                    {whiteLabel.companyName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <h3 className="text-xl font-extrabold text-white">Acesso ao Sistema</h3>
              <p className="text-xs text-slate-400 mt-1">Entre com seu e-mail corporativo e senha cadastrados</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  E-mail de Acesso *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={`seu.email@${whiteLabel.companyName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'promotora'}.com.br`}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Senha *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/90 pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                  />
                  <span>Lembrar sessão neste navegador</span>
                </label>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Autenticando...</span>
                ) : (
                  <>
                    <span>Entrar no Sistema</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-slate-800 text-center text-xs text-slate-500 z-10 max-w-7xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-2">
        <p>© 2026 {whiteLabel.companyName}. Todos os direitos reservados.</p>
        <p className="flex items-center gap-1 text-[11px]">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>SLA e Portabilidades monitoradas em tempo real (24/7)</span>
        </p>
      </footer>
    </div>
  );
};
