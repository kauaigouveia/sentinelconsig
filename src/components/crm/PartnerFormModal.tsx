import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Building,
  User,
  Mail,
  Phone,
  FileText,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Key,
  RefreshCw,
} from 'lucide-react';

interface PartnerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  partner?: any | null;
  promoters?: Array<{ id: string; name: string; status?: string; active?: boolean }>;
  users?: Array<{ id: string; name: string }>;
}

export const PartnerFormModal: React.FC<PartnerFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  partner,
  promoters: initialPromoters = [],
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

  // Portal Access for Edit Mode
  const [portalAccess, setPortalAccess] = useState<any | null>(null);
  const [loadingPortalAccess, setLoadingPortalAccess] = useState(false);
  const [resettingAccess, setResettingAccess] = useState(false);
  const [generatingAccess, setGeneratingAccess] = useState(false);
  const [confirmGenerateModal, setConfirmGenerateModal] = useState(false);

  // Success Provisioning Modal State
  const [provisionResult, setProvisionResult] = useState<{
    title?: string;
    partnerName: string;
    partnerCode: string;
    portalAccess: {
      created: boolean;
      status: 'ACTIVE' | 'PENDING';
      email: string | null;
      temporaryPassword?: string;
      portalUrl?: string;
      message?: string;
    };
  } | null>(null);

  const [copiedField, setCopiedField] = useState<'login' | 'password' | 'all' | null>(null);

  // Promoters state backed by PostgreSQL API
  const [promotersList, setPromotersList] = useState<Array<{ id: string; name: string; status?: string; active?: boolean }>>(
    initialPromoters
  );
  const [loadingPromoters, setLoadingPromoters] = useState(false);
  const [promotersError, setPromotersError] = useState<string | null>(null);

  const fetchPromoters = async () => {
    setLoadingPromoters(true);
    setPromotersError(null);
    try {
      const res = await fetch('/api/promoters');
      if (!res.ok) {
        throw new Error(`Erro ao buscar promotoras (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPromotersList(data);
      }
    } catch (err: any) {
      console.error('[PartnerFormModal] Error loading promoters:', err);
      setPromotersError(err.message || 'Erro ao carregar promotoras');
    } finally {
      setLoadingPromoters(false);
    }
  };

  const fetchPortalAccess = async (partnerId: string) => {
    setLoadingPortalAccess(true);
    try {
      const res = await fetch(`/api/partners/${partnerId}/portal-access`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setPortalAccess(data[0]);
        } else {
          setPortalAccess(null);
        }
      }
    } catch (err) {
      console.error('[PartnerFormModal] Error loading portal access:', err);
    } finally {
      setLoadingPortalAccess(false);
    }
  };

  // Sync initialPromoters if provided
  useEffect(() => {
    if (initialPromoters && initialPromoters.length > 0) {
      setPromotersList(initialPromoters);
    }
  }, [initialPromoters]);

  // Fetch fresh promoters when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchPromoters();
    }
  }, [isOpen]);

  useEffect(() => {
    if (partner) {
      setName(partner.name || partner.fullName || '');
      setCode(partner.code || partner.login || '');
      setPromoterId(partner.promoterId || partner.promoter?.id || '');
      setAssignedUserId(partner.assignedUserId || '');
      setStatus(partner.status === 'INATIVO' || partner.active === false ? 'INATIVO' : 'ATIVO');
      setEmail(partner.email || '');
      setPhone(partner.phone || '');
      setDocument(partner.document || '');
      if (partner.id) {
        if (partner.portalAccess) {
          setPortalAccess(partner.portalAccess);
        }
        fetchPortalAccess(partner.id);
      }
    } else {
      setName('');
      setCode('');
      setPromoterId('');
      setAssignedUserId('');
      setStatus('ATIVO');
      setEmail('');
      setPhone('');
      setDocument('');
      setPortalAccess(null);
    }
    setErrorMsg(null);
    setProvisionResult(null);
    setCopiedField(null);
    setConfirmGenerateModal(false);
  }, [partner, isOpen]);

  const handleOpenGenerateAccessConfirm = () => {
    const targetEmail = email.trim() || partner?.email || '';
    if (!targetEmail) {
      setErrorMsg('Cadastre um e-mail válido no parceiro antes de gerar o acesso.');
      return;
    }
    setErrorMsg(null);
    setConfirmGenerateModal(true);
  };

  const handleExecuteGenerateAccess = async () => {
    if (!partner?.id) return;
    const targetEmail = email.trim() || partner?.email || '';
    if (!targetEmail) {
      setErrorMsg('E-mail do parceiro é obrigatório para gerar o acesso.');
      return;
    }

    setGeneratingAccess(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/partners/${partner.id}/portal-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || partner.name,
          email: targetEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao gerar acesso ao portal.');
      }

      setConfirmGenerateModal(false);

      const targetPortalHost =
        data.portalAccess?.portalUrl ||
        data.portalUrl ||
        (typeof window !== 'undefined' ? `${window.location.origin}/parceiro` : 'https://grupoevolve.sentinelconsig.com.br/parceiro');

      setProvisionResult({
        title: 'ACESSO AO PORTAL GERADO',
        partnerName: partner.name || name,
        partnerCode: partner.code || code,
        portalAccess: {
          created: true,
          status: 'ACTIVE',
          email: data.portalAccess?.email || data.email || targetEmail,
          temporaryPassword: data.portalAccess?.temporaryPassword || data.temporaryPassword,
          portalUrl: targetPortalHost,
        },
      });

      await fetchPortalAccess(partner.id);
      onSaved();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao gerar acesso ao portal.');
      setConfirmGenerateModal(false);
    } finally {
      setGeneratingAccess(false);
    }
  };

  const handleResetPortalAccess = async () => {
    if (!partner?.id) return;
    if (!window.confirm('Deseja realmente redefinir o acesso ao portal? Uma nova senha temporária será gerada e as sessões atuais serão invalidadas.')) {
      return;
    }
    setResettingAccess(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/partners/${partner.id}/portal-access/reset`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao redefinir acesso ao portal.');
      }
      if (data.portalAccess) {
        setProvisionResult({
          partnerName: partner.name || name,
          partnerCode: partner.code || code,
          portalAccess: {
            created: true,
            status: 'ACTIVE',
            email: data.portalAccess.email,
            temporaryPassword: data.portalAccess.temporaryPassword,
            portalUrl: data.portalAccess.portalUrl,
          },
        });
        fetchPortalAccess(partner.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao redefinir acesso.');
    } finally {
      setResettingAccess(false);
    }
  };

  // Synthesize current partner's promoter if not present in list (e.g. inactive)
  const displayPromoters = React.useMemo(() => {
    const list = [...promotersList];
    if (partner && (partner.promoterId || partner.promoter)) {
      const pId = partner.promoterId || partner.promoter.id;
      const found = list.some(p => p.id === pId);
      if (!found && pId) {
        list.push({
          id: pId,
          name: partner.promoter?.name || partner.promoterName || 'Promotora Vinculada',
          status: 'INATIVO',
          active: false,
        });
      }
    }
    return list;
  }, [promotersList, partner]);

  if (!isOpen) return null;

  const handleCopy = async (text: string, field: 'login' | 'password' | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleCloseSuccess = () => {
    setProvisionResult(null);
    onSaved();
    onClose();
  };

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

      // Se for criação e retornou portalAccess, exibe o modal de confirmação
      if (!partner && data.portalAccess) {
        setProvisionResult({
          partnerName: data.name || payload.name,
          partnerCode: data.code || payload.code,
          portalAccess: data.portalAccess,
        });
      } else {
        onSaved();
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao processar requisição.');
    } finally {
      setLoading(false);
    }
  };

  const portalUrl =
    provisionResult?.portalAccess?.portalUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/parceiro` : 'https://grupoevolve.sentinelconsig.com.br/parceiro');

  const copyAllText = provisionResult
    ? `ACESSO AO PORTAL DO PARCEIRO\n\nLink:\n${portalUrl}\n\nLogin:\n${
        provisionResult.portalAccess.email || ''
      }\n\nSenha temporária:\n${
        provisionResult.portalAccess.temporaryPassword || ''
      }\n\nApós entrar, o sistema solicitará a troca da senha.`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Provision Success View */}
        {provisionResult ? (
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/20 shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {provisionResult.title || 'Parceiro cadastrado com sucesso!'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {provisionResult.partnerName} ({provisionResult.partnerCode})
              </p>
            </div>

            {provisionResult.portalAccess.created && provisionResult.portalAccess.temporaryPassword ? (
              <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-700/60 pb-3">
                  <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Acesso ao Portal do Parceiro
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Portal Link */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Portal
                      </span>
                      <a
                        href={portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-600 dark:text-blue-400 hover:underline break-all flex items-center gap-1 mt-0.5"
                      >
                        {portalUrl}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  </div>

                  {/* Login */}
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Login
                      </span>
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-100 break-all select-all">
                        {provisionResult.portalAccess.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(provisionResult.portalAccess.email || '', 'login')}
                      className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                    >
                      {copiedField === 'login' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar login</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Senha Temporária */}
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                        Senha Temporária
                      </span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm select-all">
                        {provisionResult.portalAccess.temporaryPassword}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(provisionResult.portalAccess.temporaryPassword || '', 'password')}
                      className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                    >
                      {copiedField === 'password' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">Copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar senha</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <p>
                    <strong>Por segurança, a senha temporária será exibida somente agora.</strong> O parceiro deverá
                    definir uma nova senha individual no primeiro acesso.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-semibold block">Acesso ao portal pendente</span>
                  <p className="mt-0.5">
                    {provisionResult.portalAccess.message ||
                      'Parceiro criado, mas o acesso ao portal não foi gerado porque não há e-mail cadastrado.'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Você pode gerar o acesso posteriormente através do Perfil 360° do Parceiro após cadastrar um e-mail válido.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
              {provisionResult.portalAccess.created && provisionResult.portalAccess.temporaryPassword && (
                <button
                  type="button"
                  onClick={() => handleCopy(copyAllText, 'all')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-700"
                >
                  {copiedField === 'all' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Credenciais copiadas!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar credenciais</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleCloseSuccess}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Promotora Vinculada
                    </label>
                    {loadingPromoters && (
                      <span className="text-[11px] text-blue-500 font-medium flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                        Carregando promotoras...
                      </span>
                    )}
                  </div>
                  <select
                    value={promoterId}
                    onChange={e => setPromoterId(e.target.value)}
                    disabled={loadingPromoters}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium disabled:opacity-60"
                  >
                    {loadingPromoters ? (
                      <option value="">Carregando promotoras...</option>
                    ) : promotersError ? (
                      <option value="">Erro ao carregar promotoras</option>
                    ) : displayPromoters.length === 0 ? (
                      <>
                        <option value="">Sem Promotora Vinculada</option>
                        <option value="" disabled>Nenhuma promotora disponível</option>
                      </>
                    ) : (
                      <>
                        <option value="">Sem Promotora Vinculada</option>
                        {displayPromoters.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.status === 'INATIVO' || p.active === false ? '(Inativa)' : ''}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  {promotersError && (
                    <div className="flex items-center justify-between mt-1 text-[11px] text-rose-500">
                      <span>Erro ao carregar promotoras</span>
                      <button
                        type="button"
                        onClick={fetchPromoters}
                        className="text-blue-500 hover:underline font-semibold cursor-pointer"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}
                  {!loadingPromoters && !promotersError && displayPromoters.length === 0 && (
                    <span className="text-[11px] text-amber-500 mt-1 block">
                      Nenhuma promotora disponível
                    </span>
                  )}
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
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      E-mail de Contato Comercial
                    </label>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                      Utilizado como login no Portal do Parceiro
                    </span>
                  </div>
                  <input
                    type="email"
                    placeholder="contato@parceiro.com.br"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Ao cadastrar com e-mail válido, o acesso ao Portal do Parceiro (/parceiro) é provisionado automaticamente com senha temporária segura.
                  </span>
                </div>

                {/* Seção Portal do Parceiro na Edição */}
                {partner && (
                  <div className="md:col-span-2 mt-2 p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          Portal do Parceiro (/parceiro)
                        </span>
                      </div>
                      {loadingPortalAccess ? (
                        <span className="text-[11px] text-slate-400">Verificando acesso...</span>
                      ) : portalAccess ? (
                        portalAccess.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            ATIVO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            <span className="w-2 h-2 rounded-full bg-rose-500" />
                            DESATIVADO
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          PENDENTE
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Login do Portal</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {portalAccess?.email || email.trim() || partner.email || 'Nenhum e-mail cadastrado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">Último Acesso</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {portalAccess?.lastLoginAt
                            ? new Date(portalAccess.lastLoginAt).toLocaleString('pt-BR')
                            : 'Nenhum acesso registrado'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2">
                      {portalAccess && portalAccess.active ? (
                        <button
                          type="button"
                          onClick={handleResetPortalAccess}
                          disabled={resettingAccess || generatingAccess}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Key className="w-3.5 h-3.5 text-blue-600" />
                          {resettingAccess ? 'Redefinindo...' : 'Redefinir acesso'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOpenGenerateAccessConfirm}
                          disabled={generatingAccess || resettingAccess}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-50"
                        >
                          <Key className="w-3.5 h-3.5" />
                          {generatingAccess ? 'Gerando...' : 'Gerar Acesso'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
          </>
        )}

        {/* Confirmação de Geração de Acesso */}
        {confirmGenerateModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Gerar acesso ao Portal do Parceiro?
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Confirme as informações antes de gerar a credencial inicial.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
                    E-mail:
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm select-all">
                    {email.trim() || partner?.email || 'Nenhum e-mail informado'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
                    Portal:
                  </span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 break-all select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/parceiro` : 'https://grupoevolve.sentinelconsig.com.br/parceiro'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setConfirmGenerateModal(false)}
                  disabled={generatingAccess}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteGenerateAccess}
                  disabled={generatingAccess}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {generatingAccess ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
