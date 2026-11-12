import { WorkspaceSections } from '../ui/WorkspaceSections';
import { SupportConversationDetails } from './SupportConversationDetails';
import { isSupportEvent, supportConversationId } from '../../lib/supportRealtime';
import React, { useState, useEffect, useRef } from 'react';
import { SupportReplyTemplates } from './SupportReplyTemplates';
import { SimulationWhatsAppConnection } from './SimulationWhatsAppConnection';
import {
  Headphones,
  MessageSquare,
  Search,
  Filter,
  RefreshCw,
  Send,
  User,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  FileSpreadsheet,
  Phone,
  Mail,
  Smartphone,
  Layers,
  ArrowRight,
} from 'lucide-react';
import './support-workspace.css';
import { toastService } from '../ui/toastService';
import { realtimeHub } from '../../services/realtimeService';
import { StorageService } from '../../services/storageService';
import { hasPermission } from '../../lib/permissions';
import { canAccessSimulationSupport, canAccessTelegramSupport } from '../../lib/supportAccess';

interface SupportConversationAdmin {
  id: string;
  partnerId: string;
  partnerName?: string;
  partnerCode?: string;
  proposalId?: string | null;
  proposalNumber?: string | null;
  proposalClientName?: string | null;
  bankName?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  channel: 'PORTAL' | 'WHATSAPP' | 'TELEGRAM';
  department?: string;
  simulationStage?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  subject?: string | null;
  lastMessageAt: string;
  createdAt: string;
  lastMessage?: {
    id: string;
    message: string;
    senderType: 'PARTNER' | 'SUPPORT' | 'SYSTEM';
    senderName?: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
}

interface SupportMessageAdmin {
  deliveryStatus?: string;
  attachmentName?: string | null;
  id: string;
  conversationId: string;
  senderType: 'PARTNER' | 'SUPPORT' | 'SYSTEM';
  senderId?: string | null;
  senderName?: string | null;
  message: string;
  channel: 'PORTAL' | 'WHATSAPP' | 'TELEGRAM';
  externalMessageId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export const CentralAtendimentoView: React.FC = () => {
  const activeUser = StorageService.getActiveUser();
  const canReply = hasPermission(activeUser?.role, activeUser?.customPermissions, 'support.reply');
  const canManage = hasPermission(activeUser?.role, activeUser?.customPermissions, 'support.manage');
  const canViewSimulation = canAccessSimulationSupport(activeUser?.role);
  const canViewTelegram = canAccessTelegramSupport(activeUser?.role);
  const canConfigure = canViewSimulation && hasPermission(activeUser?.role, activeUser?.customPermissions, 'integrations.manage');
  const [showQueue, setShowQueue] = useState(true);
  const [toolsOpened, setToolsOpened] = useState(false);
  const sendingRef = useRef(false);
  const [conversations, setConversations] = useState<SupportConversationAdmin[]>([]);
  const [metrics, setMetrics] = useState({
    openCount: 0,
    inProgressCount: 0,
    resolvedCount: 0,
    totalActive: 0,
    totalMessagesToday: 0,
  });

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationData, setActiveConversationData] = useState<any>(null);
  const [messages, setMessages] = useState<SupportMessageAdmin[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [replyText, setReplyText] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationRequestIdRef = useRef(0);
  const messageRequestIdRef = useRef(0);
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async (autoSelectFirst = false, quiet = false) => {
    const requestId = ++conversationRequestIdRef.current;
    if (!quiet) setIsLoadingList(true);
    setConversationError(null);
    try {
      const q = new URLSearchParams();
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (channelFilter !== 'ALL') q.set('channel', channelFilter);
      if (departmentFilter !== 'ALL') q.set('department', departmentFilter);
      if (searchTerm.trim()) q.set('search', searchTerm.trim());

      const [resConv, resMetrics] = await Promise.all([
        fetch(`/api/support/conversations?${q.toString()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
        fetch('/api/support/metrics', { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
      ]);

      if (!resConv.ok) {
        const errData = await resConv.json().catch(() => ({}));
        throw new Error(errData.error || 'Não foi possível carregar os atendimentos.');
      }
      const list = await resConv.json();
      if (!Array.isArray(list)) throw new Error('A API retornou uma lista de atendimentos inválida.');
      if (requestId !== conversationRequestIdRef.current) return;
      setConversations(list);
      if (autoSelectFirst && list.length > 0 && !activeConversationIdRef.current) {
        setActiveConversationId(list[0].id);
      }

      if (resMetrics.ok) {
        const met = await resMetrics.json();
        if (requestId === conversationRequestIdRef.current) setMetrics(met);
      }
    } catch (err) {
      console.error('[CentralAtendimentoView] Erro ao carregar atendimentos:', err);
      if (requestId === conversationRequestIdRef.current) {
        setConversationError(err instanceof Error ? err.message : 'Falha ao carregar a fila de atendimento.');
      }
    } finally {
      if (requestId === conversationRequestIdRef.current) setIsLoadingList(false);
    }
  };

  const fetchMessages = async (convId: string, quiet = false) => {
    const requestId = ++messageRequestIdRef.current;
    if (!quiet) setIsLoadingMessages(true);
    setMessagesError(null);
    if (activeConversationData?.id !== convId) {
      setActiveConversationData(null);
      setMessages([]);
    }
    try {
      const res = await fetch(`/api/support/conversations/${encodeURIComponent(convId)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Não foi possível carregar as mensagens deste atendimento.');
      }
      const data = await res.json();
      if (requestId !== messageRequestIdRef.current || activeConversationIdRef.current !== convId) return;
      setActiveConversationData(data.conversation);
      const next = Array.isArray(data.messages) ? data.messages : [];
      setMessages(previous => {
        if (previous.length !== next.length || previous.some((message, index) => message.id !== next[index]?.id)) setTimeout(scrollToBottom, 100);
        return next;
      });
    } catch (err) {
      console.error('[CentralAtendimentoView] Erro ao carregar mensagens:', err);
      if (requestId === messageRequestIdRef.current && activeConversationIdRef.current === convId) {
        setMessagesError(err instanceof Error ? err.message : 'Falha ao carregar mensagens.');
      }
    } finally {
      if (requestId === messageRequestIdRef.current) setIsLoadingMessages(false);
    }
  };

  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;
  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;

  useEffect(() => {
    let needsCatchUp = false;
    return realtimeHub.onStatusChange(status => {
      if (status !== 'CONNECTED') { needsCatchUp = true; return; }
      if (!needsCatchUp) return;
      needsCatchUp = false;
      const conversationId = activeConversationIdRef.current;
      if (conversationId) void fetchMessagesRef.current(conversationId, true);
      void fetchConversationsRef.current(false, true);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let running = false;
    const refresh = async () => {
      const id = activeConversationIdRef.current;
      if (disposed || !id || running || document.visibilityState === 'hidden') return;
      running = true;
      try { await fetchMessagesRef.current(id, true); }
      finally { running = false; }
    };
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    let refreshingList = false;
    const refreshList = async () => {
      if (disposed || refreshingList || document.visibilityState === 'hidden') return;
      refreshingList = true;
      try { await fetchConversationsRef.current(false, true); }
      finally { refreshingList = false; }
    };
    const listTimer = window.setInterval(() => { void refreshList(); }, 2000);
    const onVisible = () => { void refresh(); void refreshList(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.clearInterval(listTimer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchConversations(true), 250);
    return () => window.clearTimeout(timeout);
  }, [statusFilter, channelFilter, departmentFilter, searchTerm]);

  useEffect(() => {
    const unsub = realtimeHub.subscribe('*', (event) => {
      if (isSupportEvent(event)) {
        const activeId = activeConversationIdRef.current;
        if (supportConversationId(event) === activeId && activeId) {
          void fetchMessagesRef.current(activeId, true);
        }
        void fetchConversationsRef.current(false, true);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    }
  }, [activeConversationId]);

  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !activeConversationId || activeConversationData?.id !== activeConversationId || sendingRef.current) return;

    sendingRef.current = true;
    const text = replyText.trim();
    setReplyText('');
    setIsSending(true);

    try {
      const res = await fetch(`/api/support/conversations/${encodeURIComponent(activeConversationId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao enviar resposta.');
      }

      const createdMsg = await res.json();
      if (activeConversationIdRef.current === activeConversationId) {
        // Discard reads started before the acknowledged write in this conversation.
        messageRequestIdRef.current += 1;
        setMessages((prev) => prev.some(message => message.id === createdMsg.id) ? prev : [...prev, createdMsg]);
        setTimeout(scrollToBottom, 50);
      }
      fetchConversations(false);
    } catch (err: any) {
      toastService.error('Falha ao enviar resposta', err?.message || 'Tente novamente.');
      if (activeConversationIdRef.current === activeConversationId) setReplyText(text);
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    if (!activeConversationId || activeConversationData?.id !== activeConversationId || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/support/conversations/${encodeURIComponent(activeConversationId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Não foi possível atualizar o atendimento.');
      }
      const updated = await res.json();
      setActiveConversationData((prev: any) => prev?.id === activeConversationId ? { ...prev, status: updated.status } : prev);
      void fetchConversationsRef.current(false, true);

    } catch (err) {
      console.error('[CentralAtendimentoView] Erro ao alterar status:', err);
      toastService.error('Erro ao atualizar atendimento', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="sentinel-support support-workspace">
      <header className="support-toolbar">
        <div><h1>Atendimento</h1><p>{metrics.totalActive} conversas ativas · {metrics.totalMessagesToday} mensagens hoje</p></div>
        <div className="support-toolbar-actions">
          {(canReply || canConfigure) && <details className="support-tools" onToggle={event => { if (event.currentTarget.open) setToolsOpened(true); }}>
            <summary>Ferramentas</summary>
            {toolsOpened && <div className="support-tools-content">
              {canReply && <SupportReplyTemplates canInsert={!!activeConversationId && activeConversationData?.id === activeConversationId} onInsert={text => setReplyText(current => current.trim() ? `${current}\n${text}` : text)} />}
              {canConfigure && <SimulationWhatsAppConnection />}
            </div>}
          </details>}
          <button type="button" onClick={() => void fetchConversations(false)} disabled={isLoadingList} aria-label="Atualizar atendimentos"><RefreshCw size={16} className={isLoadingList ? 'animate-spin' : ''} /></button>
        </div>
      </header>

      <WorkspaceSections label="Filas de atendimento" value={statusFilter} onChange={id => {setStatusFilter(id);setShowQueue(true);}} items={[
        {id: 'ALL', title: 'Todas as conversas', description: 'Consulte o histórico de atendimento.', icon: <Headphones size={22}/>},
        {id: 'OPEN', title: 'Aguardando atendimento', description: 'Conversas que precisam de resposta.', icon: <Clock size={22}/>, count: metrics.openCount},
        {id: 'IN_PROGRESS', title: 'Em atendimento', description: 'Continue as conversas em andamento.', icon: <MessageSquare size={22}/>, count: metrics.inProgressCount},
        {id: 'RESOLVED', title: 'Concluídos', description: 'Consulte os atendimentos encerrados.', icon: <CheckCircle2 size={22}/>, count: metrics.resolvedCount},
      ]}/>
      {/* Main Two-Column Layout */}
      <div className={`support-inbox ${showQueue ? 'support-show-queue' : 'support-show-conversation'}`}>
        {/* Left Side: Conversation Queue & Filters */}
        <div className="support-queue flex flex-col bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] overflow-hidden">
          {/* Filters Bar */}
          <div className="p-3 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Buscar conversas"
                placeholder="Buscar conversas..."
                className="w-full h-8 pl-8 pr-2.5 text-xs rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--field-border)]"
              />
            </div>

            <details className="support-filters"><summary>Filtros{channelFilter !== 'ALL' || departmentFilter !== 'ALL' ? ' · ativos' : ''}</summary>
            <select aria-label="Canal de atendimento" value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] p-2 text-xs dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)]">
              <option value="ALL">Todos os canais</option><option value="PORTAL">Portal</option><option value="WHATSAPP">WhatsApp</option>{canViewTelegram && <option value="TELEGRAM">Telegram</option>}
            </select>
            <select aria-label="Fila de atendimento" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--bg-surface)] p-2 text-xs dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)]">
              <option value="ALL">Todas as filas</option>{canViewSimulation && <option value="SIMULATION">Mesa de simulação</option>}<option value="SUPPORT">Atendimento ao parceiro</option>
            </select>
            </details>
          </div>

          {/* Conversations Queue */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--field-border)] dark:divide-[var(--field-border)]">
            {isLoadingList ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-2">
                <div className="h-6 w-6 border-2 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
                <span className="text-[11px] text-[var(--text-secondary)]">Carregando fila...</span>
              </div>
            ) : conversationError ? (
              <div className="p-6 text-center text-xs text-[var(--danger-text)] dark:text-[var(--danger-text)] space-y-2" role="alert">
                <AlertTriangle className="mx-auto h-6 w-6" />
                <p>{conversationError}</p>
                <button type="button" onClick={() => void fetchConversations(false)} className="font-bold underline underline-offset-2">Tentar novamente</button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)] space-y-2">
                <MessageSquare className="h-6 w-6 text-[var(--text-primary)] dark:text-[var(--text-secondary)] mx-auto" />
                <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nenhum chamado nesta visualização</p>
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeConversationId;
                return (
                  <div
                    key={c.id}
                    role="button" tabIndex={0} aria-pressed={isActive}
                    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); } }}
                    onClick={() => {
                      setShowQueue(false);
                      if (activeConversationId === c.id) return;
                      setActiveConversationId(c.id);
                      setActiveConversationData(null);
                      setMessages([]);
                      setMessagesError(null);
                      setReplyText('');
                    }}
                    className={`p-3 transition-colors cursor-pointer text-xs space-y-1 ${
                      isActive
                        ? 'bg-[var(--info-bg)] dark:bg-[var(--info-bg)] border-l-3 border-[var(--field-border)]'
                        : 'hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                          {c.partnerName || 'Parceiro'}
                        </span>
                        {c.partnerCode && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]">
                            {c.partnerCode}
                          </span>
                        )}
                      </div>
                      <span className="text-[9.5px] text-[var(--text-secondary)] font-mono shrink-0">
                        {new Date(c.lastMessageAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                      {c.subject || 'Atendimento'}
                    </p>

                    {c.proposalNumber && (
                      <p className="text-[10px] text-[var(--link)] dark:text-[var(--link)] font-mono font-semibold">
                        Proposta #{c.proposalNumber} {c.bankName ? `• ${c.bankName}` : ''}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-0.5">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                            c.status === 'RESOLVED'
                              ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                              : c.status === 'IN_PROGRESS'
                              ? 'bg-[var(--info-bg)] text-[var(--link)]'
                              : 'bg-[var(--warning-bg)] text-[var(--warning-text)]'
                          }`}
                        >
                          {c.status === 'RESOLVED' ? 'Resolvido' : c.status === 'IN_PROGRESS' ? 'Em Tratativa' : 'Aberto'}
                        </span>

                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]">
                          {c.channel}
                        </span>
                        {c.department === 'SIMULATION' && <span className="text-[9px] text-[var(--link)]">{c.simulationStage === 'WAITING' ? 'Aguardando mesa' : c.simulationStage === 'ATTENDING' ? 'Em simulação' : 'Coletando dados'}</span>}
                      </div>

                      {c.unreadCount > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-[var(--danger-bg)] text-[var(--danger-text)] text-[9px] font-black flex items-center justify-center">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Chat Window & Partner Overview */}
        <div className="support-chat flex flex-col bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] overflow-hidden">
              <button type="button" className="support-back" onClick={() => setShowQueue(true)}>← Conversas</button>
          {activeConversationData ? (
            <>
              {/* Chat Header */}
              <div className="support-chat-header p-3.5 border-b border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                      {activeConversationData.partnerName}
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)]">
                      Cód: {activeConversationData.partnerCode}
                    </span>
                    <span
                      className={`text-[9.5px] font-black uppercase px-1.5 py-0.2 rounded ${
                        activeConversationData.status === 'RESOLVED'
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                          : 'bg-[var(--info-bg)] text-[var(--link)]'
                      }`}
                    >
                      {activeConversationData.status === 'RESOLVED' ? 'Resolvido' : activeConversationData.status === 'IN_PROGRESS' ? 'Em atendimento' : 'Aberto'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                    {activeConversationData.subject}{' '}
                    {activeConversationData.proposalNumber ? `• Proposta #${activeConversationData.proposalNumber}` : ''}
                  </p>
                </div>

                {/* Status Action Buttons */}
                {canManage && <div className="flex items-center gap-1.5">
                  {activeConversationData.status !== 'RESOLVED' ? (
                    <button
                      onClick={() => handleUpdateStatus('RESOLVED')}
                      disabled={isUpdatingStatus}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--success-bg)] hover:bg-[var(--success-bg)] text-[var(--success-text)] text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{isUpdatingStatus ? 'Salvando...' : 'Concluir Atendimento'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpdateStatus('IN_PROGRESS')}
                      disabled={isUpdatingStatus}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>{isUpdatingStatus ? 'Salvando...' : 'Reabrir'}</span>
                    </button>
                  )}
                </div>}
              </div>

              <SupportConversationDetails key={activeConversationId} conversation={activeConversationData} />
              {messagesError && messages.length > 0 && <div role="alert" className="px-4 py-2 text-xs text-[var(--danger-text)]">{messagesError} <button type="button" className="underline" onClick={() => activeConversationId && void fetchMessages(activeConversationId, true)}>Tentar novamente</button></div>}
              {/* Chat Message List */}
              <div className="support-messages flex-1 overflow-y-auto p-4 space-y-3.5 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)]">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-6 w-6 border-2 border-[var(--field-border)] border-t-[var(--focus)] rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className={`text-center py-12 text-xs ${messagesError ? 'text-[var(--danger-text)] dark:text-[var(--danger-text)]' : 'text-[var(--text-secondary)]'}`}>
                    {messagesError ? (
                      <>
                        <p>{messagesError}</p>
                        <button type="button" onClick={() => activeConversationId && void fetchMessages(activeConversationId)} className="mt-2 font-bold underline underline-offset-2">Tentar novamente</button>
                      </>
                    ) : 'Nenhuma mensagem registrada nesta conversa.'}
                  </div>
                ) : (
                  messages.map((m) => {
                    const isStaff = m.senderType !== 'PARTNER';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[var(--text-secondary)]">
                          <span className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {m.senderType === 'SYSTEM' ? 'Canal de simulação (Automático)' : isStaff ? `${m.senderName || 'Suporte'}` : `${m.senderName || 'Parceiro'}`}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div
                          className={`support-bubble p-3 rounded-2xl max-w-[80%] text-xs font-medium leading-relaxed  ${
                            isStaff
                              ? 'bg-[var(--info-bg)] text-[var(--text-primary)] rounded-tr-xs'
                              : 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-tl-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                          {m.attachmentName && <a href={`/api/support/messages/${encodeURIComponent(m.id)}/attachment`} className="mt-2 block underline">Baixar {m.attachmentName}</a>}
                          {m.deliveryStatus === 'FAILED' && <div className="mt-2"><span>Falha no envio ao {activeConversationData?.channel === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'}. </span>{canReply && activeConversationData?.channel !== 'TELEGRAM' && <button type="button" className="underline" onClick={async () => { try { const response = await fetch(`/api/support/messages/${encodeURIComponent(m.id)}/retry`, { method: 'POST' }); if (!response.ok) throw new Error('Falha ao reenviar.'); if (activeConversationId) await fetchMessages(activeConversationId, true); } catch { toastService.error('Mensagem não enviada', 'Verifique a conexão do WhatsApp e tente novamente.'); } }}>Reenviar</button>}</div>}
                          {m.deliveryStatus === 'UNKNOWN' && <p className="mt-1 opacity-70">Entrega não confirmada. Confira com o parceiro antes de enviar novamente.</p>}
                          {m.deliveryStatus === 'SENDING' && <p className="mt-1 opacity-70">Enviando ao {activeConversationData?.channel === 'TELEGRAM' ? 'Telegram' : 'WhatsApp'}...</p>}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {canReply ? <form onSubmit={handleSendReply} className="p-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] flex items-center gap-2 shrink-0">
                <textarea
                  rows={2}
                  aria-label="Resposta para o parceiro"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite sua resposta para o parceiro..."
                  className="min-w-0 flex-1 max-h-32 resize-y px-3 py-2 text-xs rounded-xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--field-border)]"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || isSending || isLoadingMessages || activeConversationData?.id !== activeConversationId}
                  className="h-9.5 px-4 rounded-xl bg-[var(--action)] hover:bg-[var(--action-hover)] disabled:opacity-90 text-[var(--action-ink)] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  {isSending ? (
                    <div className="h-3.5 w-3.5 border-2 border-[var(--field-border)] border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Responder</span>
                      <Send className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </form> : <div className="border-t border-[var(--field-border)] bg-[var(--bg-canvas)] px-4 py-3 text-xs text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-canvas)] dark:text-[var(--text-secondary)]">Seu perfil pode consultar o atendimento, mas não possui permissão para responder.</div>}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--text-secondary)] space-y-2">
              <Headphones className="h-10 w-10 text-[var(--text-primary)] dark:text-[var(--text-secondary)]" />
              <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Nenhum atendimento selecionado</p>
              <p className="text-[11px] max-w-sm">
                Selecione um chamado na fila à esquerda para visualizar o histórico e responder ao parceiro.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
