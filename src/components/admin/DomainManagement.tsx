import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Star,
  XCircle,
  HelpCircle,
  ExternalLink,
  Power
} from 'lucide-react';
import { StorageService } from '../../services/storageService';

interface TenantDomain {
  id: string;
  domain: string;
  status: 'PENDING' | 'VERIFYING' | 'VERIFIED' | 'FAILED' | 'DISABLED';
  verificationToken: string;
  isPrimary: boolean;
  verifiedAt?: string | null;
  createdAt: string;
}

interface DomainManagementProps {
  tenantId?: string; // If PLATFORM_MASTER is viewing a specific tenant
}

export const DomainManagement: React.FC<DomainManagementProps> = ({ tenantId }) => {
  const activeUser = StorageService.getActiveUser();
  const effectiveTenantId = tenantId || activeUser?.tenantId;

  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    if (!effectiveTenantId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/tenants/${effectiveTenantId}/domains`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao carregar domínios do servidor.');
      }
      const data = await res.json();
      setDomains(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão.');
    } finally {
      setIsLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = newDomain.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/tenants/${effectiveTenantId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: trimmed })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao registrar domínio.');
      }

      setNewDomain('');
      setSuccessMsg('Domínio adicionado com sucesso! Siga as instruções de validação de DNS abaixo.');
      await fetchDomains();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao adicionar domínio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyDns = async (domainId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setVerifyingId(domainId);

    try {
      const res = await fetch(`/api/admin/tenants/${effectiveTenantId}/domains/${domainId}/verify`, {
        method: 'POST'
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'A verificação de DNS falhou.');
      }

      setSuccessMsg('Domínio verificado com sucesso! Ele agora está ativo para resolução.');
      await fetchDomains();
    } catch (err: any) {
      setErrorMsg(err.message || 'DNS ainda não propagado ou token inválido. Tente novamente em instantes.');
      await fetchDomains(); // update state
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSetPrimary = async (domainId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/tenants/${effectiveTenantId}/domains/${domainId}/primary`, {
        method: 'POST'
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao definir domínio primário.');
      }

      setSuccessMsg('Domínio primário atualizado com sucesso.');
      await fetchDomains();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na requisição.');
    }
  };

  const handleDisableDomain = async (domainId: string) => {
    if (!window.confirm('Tem certeza que deseja desativar este domínio? Ele não responderá mais por este tenant.')) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/tenants/${effectiveTenantId}/domains/${domainId}/disable`, {
        method: 'POST'
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao desativar domínio.');
      }

      setSuccessMsg('Domínio desativado.');
      await fetchDomains();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na requisição.');
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir permanentemente este domínio?')) {
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/tenants/${effectiveTenantId}/domains/${domainId}`, {
        method: 'DELETE'
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir domínio.');
      }

      setSuccessMsg('Domínio removido.');
      await fetchDomains();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na exclusão.');
    }
  };

  const handleCopyToken = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTokenId(id);
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const getStatusBadge = (status: TenantDomain['status']) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[var(--success-bg)] dark:bg-[var(--success-bg)] text-[var(--success-text)] dark:text-[var(--success-text)] rounded-full border border-[var(--success-border)] dark:border-[var(--success-border)]">
            <Check className="h-3 w-3" />
            Verificado
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] rounded-full border border-[var(--warning-border)] dark:border-[var(--warning-border)]">
            Pendente
          </span>
        );
      case 'VERIFYING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] rounded-full border border-[var(--field-border)] dark:border-[var(--field-border)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Verificando
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)] rounded-full border border-[var(--danger-border)] dark:border-[var(--danger-border)]">
            Validação Falhou
          </span>
        );
      case 'DISABLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] rounded-full border border-[var(--field-border)] dark:border-[var(--field-border)]">
            Desativado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Messages */}
      {successMsg && (
        <div className="p-3 bg-[var(--success-bg)] dark:bg-[var(--success-bg)] border border-[var(--success-border)] dark:border-[var(--success-border)] rounded-xl flex items-center gap-2 text-[var(--success-text)] dark:text-[var(--success-text)] text-xs font-semibold animate-in fade-in">
          <Check className="h-4 w-4 shrink-0 text-[var(--success-text)]" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] rounded-xl flex items-center gap-2 text-[var(--danger-text)] dark:text-[var(--danger-text)] text-xs font-semibold animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-[var(--danger-text)]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Add New Domain Form */}
      <form onSubmit={handleAddDomain} className="bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider">
          Adicionar Novo Domínio Personalizado
        </h3>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Configure domínios customizados (ex: <code className="font-mono bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] px-1 py-0.5 rounded text-[var(--text-secondary)] dark:text-[var(--text-primary)]">app.suaempresa.com.br</code>) para que seus parceiros e clientes acessem a sua plataforma sob sua marca própria.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Ex: app.suaempresa.com.br"
              className="w-full pl-9 pr-3 py-2 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--focus)]"
              required
              disabled={isSubmitting}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !newDomain.trim()}
            className="px-4 py-2 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all  disabled:opacity-90"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span>Adicionar</span>
          </button>
        </div>
      </form>

      {/* Domain List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] uppercase tracking-wider flex items-center justify-between">
          <span>Domínios Cadastrados</span>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--link)]" />}
        </h3>

        {domains.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl text-xs text-[var(--text-secondary)] space-y-1">
            <Globe className="h-8 w-8 mx-auto text-[var(--text-primary)]" />
            <p className="font-medium">Nenhum domínio customizado cadastrado.</p>
            <p className="text-[10px]">Utilize o formulário acima para adicionar o primeiro.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {domains.map((dom) => (
              <div
                key={dom.id}
                className={`border rounded-xl transition-all overflow-hidden ${
                  dom.isPrimary
                    ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--info-bg)] dark:bg-[var(--info-bg)]'
                    : 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)]'
                }`}
              >
                {/* Domain Header Card */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] border-b border-[var(--field-border)] dark:border-[var(--field-border)]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className={`h-4.5 w-4.5 shrink-0 ${dom.isPrimary ? 'text-[var(--link)]' : 'text-[var(--text-secondary)]'}`} />
                    <span className="font-bold text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                      {dom.domain}
                    </span>
                    {dom.isPrimary && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-black uppercase bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] rounded-full">
                        <Star className="h-2.5 w-2.5 fill-[var(--text-secondary)] dark:fill-[var(--text-secondary)] text-[var(--link)] dark:text-[var(--link)]" />
                        Primário
                      </span>
                    )}
                    {getStatusBadge(dom.status)}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Action button: Set Primary */}
                    {dom.status === 'VERIFIED' && !dom.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(dom.id)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--link)] dark:hover:text-[var(--link)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                        title="Definir como domínio primário"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Action button: Disable */}
                    {dom.status === 'VERIFIED' && (
                      <button
                        onClick={() => handleDisableDomain(dom.id)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--warning-text)] dark:hover:text-[var(--warning-text)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                        title="Desativar Domínio"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Action button: Delete */}
                    <button
                      onClick={() => handleDeleteDomain(dom.id)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--danger-text)] dark:hover:text-[var(--danger-text)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                      title="Excluir Domínio"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* DNS Setup instructions (if not verified) */}
                {dom.status !== 'VERIFIED' && (
                  <div className="p-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border-t border-[var(--field-border)] dark:border-[var(--field-border)] space-y-4">
                    <div className="rounded-lg border border-[var(--warning-border)] dark:border-[var(--warning-border)] bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] p-3 space-y-2">
                      <h4 className="text-[11px] font-bold text-[var(--warning-text)] dark:text-[var(--warning-text)] uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Instruções de Validação de Posse por DNS
                      </h4>
                      <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] leading-relaxed">
                        Para ativar este domínio, você deve comprovar que é o proprietário dele. Acesse o gerenciador de DNS (ex: Cloudflare, GoDaddy, Registro.br) e crie o seguinte registro TXT:
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                        <div className="p-2 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                          <span className="block text-[9px] text-[var(--text-secondary)] uppercase font-bold">Tipo de Registro</span>
                          <span className="font-mono text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold">TXT</span>
                        </div>
                        <div className="p-2 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)]">
                          <span className="block text-[9px] text-[var(--text-secondary)] uppercase font-bold">Host / Entrada</span>
                          <span className="font-mono text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold">@ <span className="text-[10px] text-[var(--text-secondary)] font-normal">(ou subdomínio)</span></span>
                        </div>
                        <div className="p-2 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded border border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <span className="block text-[9px] text-[var(--text-secondary)] uppercase font-bold">Valor / Destino</span>
                            <span className="font-mono text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold truncate block">
                              {dom.verificationToken}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyToken(dom.verificationToken, dom.id)}
                            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded"
                            title="Copiar token"
                          >
                            {copiedTokenId === dom.id ? (
                              <Check className="h-3.5 w-3.5 text-[var(--success-text)]" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleVerifyDns(dom.id)}
                          disabled={verifyingId === dom.id}
                          className="px-3 py-1.5 bg-[var(--action)] hover:bg-[var(--action-hover)] text-[var(--action-ink)] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all  disabled:opacity-90"
                        >
                          {verifyingId === dom.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Verificando...</span>
                            </>
                          ) : (
                            <>
                              <span>Verificar Registro DNS</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
