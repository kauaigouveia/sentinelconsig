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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl  border border-[var(--field-border)] dark:border-[var(--field-border)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Provision Success View */}
        {provisionResult ? (
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] rounded-2xl flex items-center justify-center mx-auto border border-[var(--success-border)] shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                {provisionResult.title || 'Parceiro cadastrado com sucesso!'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                {provisionResult.partnerName} ({provisionResult.partnerCode})
              </p>
            </div>

            {provisionResult.portalAccess.created && provisionResult.portalAccess.temporaryPassword ? (
              <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-3">
                  <Key className="w-4 h-4 text-[var(--link)] dark:text-[var(--link)]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Acesso ao Portal do Parceiro
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Portal Link */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] block">
                        Portal
                      </span>
                      <a
                        href={portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[var(--link)] dark:text-[var(--link)] hover:underline break-all flex items-center gap-1 mt-0.5"
                      >
                        {portalUrl}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  </div>

                  {/* Login */}
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] block">
                        Login
                      </span>
                      <span className="font-mono font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] break-all select-all">
                        {provisionResult.portalAccess.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(provisionResult.portalAccess.email || '', 'login')}
                      className="px-2.5 py-1.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                    >
                      {copiedField === 'login' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[var(--success-text)]" />
                          <span className="text-[var(--success-text)] dark:text-[var(--success-text)]">Copiado!</span>
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
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)]">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] block">
                        Senha Temporária
                      </span>
                      <span className="font-mono font-bold text-[var(--link)] dark:text-[var(--link)] text-sm select-all">
                        {provisionResult.portalAccess.temporaryPassword}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(provisionResult.portalAccess.temporaryPassword || '', 'password')}
                      className="px-2.5 py-1.5 text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
                    >
                      {copiedField === 'password' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[var(--success-text)]" />
                          <span className="text-[var(--success-text)] dark:text-[var(--success-text)]">Copiada!</span>
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

                <div className="p-3 bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] rounded-xl text-[11px] text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[var(--warning-text)] mt-0.5" />
                  <p>
                    <strong>Por segurança, a senha temporária será exibida somente agora.</strong> O parceiro deverá
                    definir uma nova senha individual no primeiro acesso.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] border border-[var(--warning-border)] dark:border-[var(--warning-border)] rounded-xl text-xs text-[var(--warning-text)] dark:text-[var(--warning-text)] flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-[var(--warning-text)] mt-0.5" />
                <div>
                  <span className="font-semibold block">Acesso ao portal pendente</span>
                  <p className="mt-0.5">
                    {provisionResult.portalAccess.message ||
                      'Parceiro criado, mas o acesso ao portal não foi gerado porque não há e-mail cadastrado.'}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-1">
                    Você pode gerar o acesso posteriormente através do Perfil 360° do Parceiro após cadastrar um e-mail válido.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
              {provisionResult.portalAccess.created && provisionResult.portalAccess.temporaryPassword && (
                <button
                  type="button"
                  onClick={() => handleCopy(copyAllText, 'all')}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-[var(--field-border)] dark:border-[var(--field-border)]"
                >
                  {copiedField === 'all' ? (
                    <>
                      <Check className="w-4 h-4 text-[var(--success-text)]" />
                      <span className="text-[var(--success-text)] dark:text-[var(--success-text)]">Credenciais copiadas!</span>
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
                className="w-full sm:w-auto px-5 py-2.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-semibold   transition-all"
              >
                Concluir e Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] rounded-xl">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-lg">
                    {partner ? 'Editar Parceiro Comercial' : 'Cadastrar Novo Parceiro Comercial'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                    Cadastro interno confidencial para acompanhamento de produção e CRM
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] p-2 rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {errorMsg && (
                <div className="p-3.5 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] rounded-xl text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Razão Social / Nome do Parceiro *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="Ex: CORRETORA ALPHA CONSIG LTDA"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full pl-3 pr-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-medium uppercase"
                    />
                  </div>
                </div>

                {/* Código Institucional */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Código / Login Institucional *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: ALPHA01 ou CORR_88"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-mono font-bold uppercase"
                  />
                  <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                    Identificador único interno deste parceiro
                  </span>
                </div>

                {/* Promotora Vinculada */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider">
                      Promotora Vinculada
                    </label>
                    {loadingPromoters && (
                      <span className="text-[11px] text-[var(--link)] font-medium flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 border-2 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
                        Carregando promotoras...
                      </span>
                    )}
                  </div>
                  <select
                    value={promoterId}
                    onChange={e => setPromoterId(e.target.value)}
                    disabled={loadingPromoters}
                    className="w-full px-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-medium disabled:opacity-90"
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
                    <div className="flex items-center justify-between mt-1 text-[11px] text-[var(--danger-text)]">
                      <span>Erro ao carregar promotoras</span>
                      <button
                        type="button"
                        onClick={fetchPromoters}
                        className="text-[var(--link)] hover:underline font-semibold cursor-pointer"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}
                  {!loadingPromoters && !promotersError && displayPromoters.length === 0 && (
                    <span className="text-[11px] text-[var(--warning-text)] mt-1 block">
                      Nenhuma promotora disponível
                    </span>
                  )}
                </div>

                {/* Responsável Interno (Assigned User) */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Operador / Gerente de Contas
                  </label>
                  <select
                    value={assignedUserId}
                    onChange={e => setAssignedUserId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-medium"
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
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Status Cadastral
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStatus('ATIVO')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                        status === 'ATIVO'
                          ? 'bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-text)] dark:text-[var(--success-text)] ring-2 ring-[var(--success-border)]'
                          : 'bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 text-[var(--success-text)]" />
                      Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus('INATIVO')}
                      className={`flex-1 py-2 px-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                        status === 'INATIVO'
                          ? 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] ring-2 ring-[var(--danger-border)]'
                          : 'bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 text-[var(--danger-text)]" />
                      Inativo
                    </button>
                  </div>
                </div>

                {/* CNPJ / CPF */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Documento (CNPJ / CPF)
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0000-00"
                    value={document}
                    onChange={e => setDocument(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-medium"
                  />
                </div>

                {/* Telefone / WhatsApp */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Telefone / WhatsApp Comercial
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-medium"
                  />
                </div>

                {/* Email Comercial */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider">
                      E-mail de Contato Comercial
                    </label>
                    <span className="text-[11px] text-[var(--link)] dark:text-[var(--link)] font-medium">
                      Utilizado como login no Portal do Parceiro
                    </span>
                  </div>
                  <input
                    type="email"
                    placeholder="contato@parceiro.com.br"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] font-medium"
                  />
                  <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                    Ao cadastrar com e-mail válido, o acesso ao Portal do Parceiro (/parceiro) é provisionado automaticamente com senha temporária segura.
                  </span>
                </div>

                {/* Seção Portal do Parceiro na Edição */}
                {partner && (
                  <div className="md:col-span-2 mt-2 p-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-2.5">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-[var(--link)] dark:text-[var(--link)]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                          Portal do Parceiro (/parceiro)
                        </span>
                      </div>
                      {loadingPortalAccess ? (
                        <span className="text-[11px] text-[var(--text-secondary)]">Verificando acesso...</span>
                      ) : portalAccess ? (
                        portalAccess.active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)] border border-[var(--success-border)] dark:border-[var(--success-border)]">
                            <span className="w-2 h-2 rounded-full bg-[var(--success-bg)] animate-pulse" />
                            ATIVO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)] border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
                            <span className="w-2 h-2 rounded-full bg-[var(--danger-bg)]" />
                            DESATIVADO
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[var(--warning-bg)] text-[var(--warning-text)] dark:bg-[var(--warning-bg)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
                          <span className="w-2 h-2 rounded-full bg-[var(--warning-bg)]" />
                          PENDENTE
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-semibold">Login do Portal</span>
                        <span className="font-mono font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                          {portalAccess?.email || email.trim() || partner.email || 'Nenhum e-mail cadastrado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[var(--text-secondary)] block text-[10px] uppercase font-semibold">Último Acesso</span>
                        <span className="text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
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
                          className="px-3 py-1.5 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-90"
                        >
                          <Key className="w-3.5 h-3.5 text-[var(--link)]" />
                          {resettingAccess ? 'Redefinindo...' : 'Redefinir acesso'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOpenGenerateAccessConfirm}
                          disabled={generatingAccess || resettingAccess}
                          className="px-3.5 py-1.5 bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] rounded-xl text-xs font-semibold flex items-center gap-1.5   transition-all disabled:opacity-90"
                        >
                          <Key className="w-3.5 h-3.5" />
                          {generatingAccess ? 'Gerando...' : 'Gerar Acesso'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] text-sm font-semibold rounded-xl   transition-all flex items-center gap-2 disabled:opacity-90"
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
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-2xl  border border-[var(--field-border)] dark:border-[var(--field-border)] w-full max-w-md overflow-hidden p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center shrink-0 border border-[var(--field-border)]">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                    Gerar acesso ao Portal do Parceiro?
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
                    Confirme as informações antes de gerar a credencial inicial.
                  </p>
                </div>
              </div>

              <div className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 space-y-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)] block tracking-wider">
                    E-mail:
                  </span>
                  <span className="font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm select-all">
                    {email.trim() || partner?.email || 'Nenhum e-mail informado'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-semibold text-[var(--text-secondary)] block tracking-wider">
                    Portal:
                  </span>
                  <span className="font-mono text-[var(--link)] dark:text-[var(--link)] break-all select-all">
                    {typeof window !== 'undefined' ? `${window.location.origin}/parceiro` : 'https://grupoevolve.sentinelconsig.com.br/parceiro'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)]">
                <button
                  type="button"
                  onClick={() => setConfirmGenerateModal(false)}
                  disabled={generatingAccess}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteGenerateAccess}
                  disabled={generatingAccess}
                  className="px-5 py-2.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-xl text-xs font-semibold   transition-all flex items-center gap-2 disabled:opacity-90"
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
