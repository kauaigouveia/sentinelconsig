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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
            <Check className="h-3 w-3" />
            Verificado
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-full border border-amber-200 dark:border-amber-800">
            Pendente
          </span>
        );
      case 'VERIFYING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800">
            <Loader2 className="h-3 w-3 animate-spin" />
            Verificando
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-800">
            Validação Falhou
          </span>
        );
      case 'DISABLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700">
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
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-xs font-semibold animate-in fade-in">
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-200 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Add New Domain Form */}
      <form onSubmit={handleAddDomain} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
          Adicionar Novo Domínio Personalizado
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          Configure domínios customizados (ex: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300">app.suaempresa.com.br</code>) para que seus parceiros e clientes acessem a sua plataforma sob sua marca própria.
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Ex: app.suaempresa.com.br"
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
              required
              disabled={isSubmitting}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !newDomain.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
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
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center justify-between">
          <span>Domínios Cadastrados</span>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
        </h3>

        {domains.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-850 rounded-xl text-xs text-slate-400 space-y-1">
            <Globe className="h-8 w-8 mx-auto text-slate-300" />
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
                    ? 'border-blue-200 dark:border-blue-900 bg-blue-50/20 dark:bg-blue-950/10'
                    : 'border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900'
                }`}
              >
                {/* Domain Header Card */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-850">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className={`h-4.5 w-4.5 shrink-0 ${dom.isPrimary ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {dom.domain}
                    </span>
                    {dom.isPrimary && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-black uppercase bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-full">
                        <Star className="h-2.5 w-2.5 fill-blue-600 dark:fill-blue-400 text-blue-600 dark:text-blue-400" />
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
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Definir como domínio primário"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Action button: Disable */}
                    {dom.status === 'VERIFIED' && (
                      <button
                        onClick={() => handleDisableDomain(dom.id)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Desativar Domínio"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Action button: Delete */}
                    <button
                      onClick={() => handleDeleteDomain(dom.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Excluir Domínio"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* DNS Setup instructions (if not verified) */}
                {dom.status !== 'VERIFIED' && (
                  <div className="p-4 bg-slate-50/20 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-850 space-y-4">
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/10 p-3 space-y-2">
                      <h4 className="text-[11px] font-bold text-amber-850 dark:text-amber-350 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Instruções de Validação de Posse por DNS
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Para ativar este domínio, você deve comprovar que é o proprietário dele. Acesse o gerenciador de DNS (ex: Cloudflare, GoDaddy, Registro.br) e crie o seguinte registro TXT:
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                        <div className="p-2 bg-white dark:bg-slate-850 rounded border border-slate-150 dark:border-slate-800">
                          <span className="block text-[9px] text-slate-400 uppercase font-bold">Tipo de Registro</span>
                          <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-bold">TXT</span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-850 rounded border border-slate-150 dark:border-slate-800">
                          <span className="block text-[9px] text-slate-400 uppercase font-bold">Host / Entrada</span>
                          <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-bold">@ <span className="text-[10px] text-slate-400 font-normal">(ou subdomínio)</span></span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-850 rounded border border-slate-150 dark:border-slate-800 flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <span className="block text-[9px] text-slate-400 uppercase font-bold">Valor / Destino</span>
                            <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-bold truncate block">
                              {dom.verificationToken}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyToken(dom.verificationToken, dom.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                            title="Copiar token"
                          >
                            {copiedTokenId === dom.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
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
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
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
