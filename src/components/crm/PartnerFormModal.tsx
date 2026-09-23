import React, { useState, useEffect } from 'react';
import { X, Save, Building, User, Mail, Phone, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface PartnerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  partner?: any | null;
  promoters: Array<{ id: string; name: string }>;
  users?: Array<{ id: string; name: string }>;
}

export const PartnerFormModal: React.FC<PartnerFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  partner,
  promoters,
  users = [],
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [promoterId, setPromoterId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [status, setStatus] = useState<'ATIVO' | 'INATIVO'>('ATIVO');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (partner) {
      setName(partner.name || partner.fullName || '');
      setCode(partner.code || partner.login || '');
      setPromoterId(partner.promoterId || '');
      setAssignedUserId(partner.assignedUserId || '');
      setStatus(partner.status === 'INATIVO' || partner.active === false ? 'INATIVO' : 'ATIVO');
      setEmail(partner.email || '');
      setPhone(partner.phone || '');
      setDocument(partner.document || '');
    } else {
      setName('');
      setCode('');
      setPromoterId(promoters[0]?.id || '');
      setAssignedUserId('');
      setStatus('ATIVO');
      setEmail('');
      setPhone('');
      setDocument('');
    }
    setErrorMsg(null);
  }, [partner, isOpen, promoters]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('O nome do parceiro é obrigatório.');
      return;
    }
    if (!code.trim()) {
      setErrorMsg('O código/identificador institucional do parceiro é obrigatório.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim().toUpperCase(),
        code: code.trim().toUpperCase(),
        promoterId: promoterId || null,
        assignedUserId: assignedUserId || null,
        status,
        active: status === 'ATIVO',
        email: email.trim() || null,
        phone: phone.trim() || null,
        document: document.trim() || null,
      };

      const url = partner ? `/api/partners/${partner.id}` : '/api/partners';
      const method = partner ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar parceiro.');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao processar requisição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-lg">
                {partner ? 'Editar Parceiro Comercial' : 'Cadastrar Novo Parceiro Comercial'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastro interno confidencial para acompanhamento de produção e CRM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Razão Social / Nome do Parceiro *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Ex: CORRETORA ALPHA CONSIG LTDA"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-3 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium uppercase"
                />
              </div>
            </div>

            {/* Código Institucional */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Código / Login Institucional *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: ALPHA01 ou CORR_88"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold uppercase"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Identificador único interno deste parceiro
              </span>
            </div>

            {/* Promotora Vinculada */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Promotora Vinculada
              </label>
              <select
                value={promoterId}
                onChange={e => setPromoterId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">Sem Promotora Vinculada</option>
                {promoters.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Responsável Interno (Assigned User) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Operador / Gerente de Contas
              </label>
              <select
                value={assignedUserId}
                onChange={e => setAssignedUserId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">Nenhum operador atribuído</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Cadastral */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Status Cadastral
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStatus('ATIVO')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    status === 'ATIVO'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Ativo
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('INATIVO')}
                  className={`flex-1 py-2 px-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    status === 'INATIVO'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-700 dark:text-rose-300 ring-2 ring-rose-500/20'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                  Inativo
                </button>
              </div>
            </div>

            {/* CNPJ / CPF */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Documento (CNPJ / CPF)
              </label>
              <input
                type="text"
                placeholder="00.000.000/0000-00"
                value={document}
                onChange={e => setDocument(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            {/* Telefone / WhatsApp */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Telefone / WhatsApp Comercial
              </label>
              <input
                type="text"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            {/* Email Comercial */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                E-mail de Contato Comercial
              </label>
              <input
                type="email"
                placeholder="contato@parceiro.com.br"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Salvando...' : partner ? 'Atualizar Parceiro' : 'Cadastrar Parceiro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
