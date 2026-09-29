import React, { useState, useEffect, useRef } from 'react';
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
import { ActionBar } from '../ui/ActionBar';
import { realtimeHub } from '../../services/realtimeService';

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
  channel: 'PORTAL' | 'WHATSAPP';
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
  id: string;
  conversationId: string;
  senderType: 'PARTNER' | 'SUPPORT' | 'SYSTEM';
  senderId?: string | null;
  senderName?: string | null;
  message: string;
  channel: 'PORTAL' | 'WHATSAPP';
  externalMessageId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export const CentralAtendimentoView: React.FC = () => {
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
  const [searchTerm, setSearchTerm] = useState('');

  const [replyText, setReplyText] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async (autoSelectFirst = false) => {
    setIsLoadingList(true);
    try {
      const q = new URLSearchParams();
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (channelFilter !== 'ALL') q.set('channel', channelFilter);
      if (searchTerm.trim()) q.set('search', searchTerm.trim());

      const [resConv, resMetrics] = await Promise.all([
        fetch(`/api/support/conversations?${q.toString()}`),
        fetch('/api/support/metrics'),
      ]);

      if (resConv.ok) {
        const list = await resConv.json();
        setConversations(list);
        if (autoSelectFirst && list.length > 0 && !activeConversationId) {
          setActiveConversationId(list[0].id);
        }
      }

      if (resMetrics.ok) {
        const met = await resMetrics.json();
        setMetrics(met);
      }
    } catch (err) {
      console.error('[CentralAtendimentoView] Erro ao carregar atendimentos:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  const fetchMessages = async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/support/conversations/${encodeURIComponent(convId)}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConversationData(data.conversation);
        setMessages(data.messages);
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('[CentralAtendimentoView] Erro ao carregar mensagens:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations(true);

    const unsub = realtimeHub.subscribe('*', (event) => {
      if (event?.type === 'SUPPORT_MESSAGE_RECEIVED' || event?.type === 'SUPPORT_CONVERSATION_CREATED') {
        if (event?.data?.conversationId === activeConversationId) {
          fetchMessages(activeConversationId);
        }
        fetchConversations(false);
      }
    });

    return () => unsub();
  }, [activeConversationId, statusFilter, channelFilter]);

  useEffect(() => {
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    }
  }, [activeConversationId]);

  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !activeConversationId || isSending) return;

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
      setMessages((prev) => [...prev, createdMsg]);
      setTimeout(scrollToBottom, 50);
      fetchConversations(false);
    } catch (err: any) {
      alert(err?.message || 'Falha ao enviar resposta.');
      setReplyText(text);
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED') => {
    if (!activeConversationId) return;
    try {
      const res = await fetch(`/api/support/conversations/${encodeURIComponent(activeConversationId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const updated = await res.json();
        setActiveConversationData((prev: any) => ({ ...prev, status: updated.status }));
        fetchConversations(false);
      }
    } catch (err) {
      console.error('[CentralAtendimentoView] Erro ao alterar status:', err);
    }
  };

  return (
    <div className="space-y-4 select-none animate-in fade-in duration-200">
      {/* Top Action Bar */}
      <ActionBar
        title="Central de Atendimento & Suporte ao Parceiro"
        subtitle="Gestão de conversas, dúvidas operacionais e integração com Portal & WhatsApp"
        count={metrics.totalActive}
        badgeText={`${metrics.totalMessagesToday} mensagens hoje`}
        badgeColor="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        rightActions={
          <button
            onClick={() => fetchConversations(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizar</span>
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          onClick={() => setStatusFilter('OPEN')}
          className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 hover:border-amber-400 transition-all cursor-pointer shadow-2xs flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Chamados Abertos
            </span>
            <p className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {metrics.openCount}
            </p>
          </div>
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('IN_PROGRESS')}
          className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 hover:border-blue-400 transition-all cursor-pointer shadow-2xs flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Em Atendimento
            </span>
            <p className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 mt-0.5">
              {metrics.inProgressCount}
            </p>
          </div>
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Headphones className="h-4 w-4" />
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('RESOLVED')}
          className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 hover:border-emerald-400 transition-all cursor-pointer shadow-2xs flex items-center justify-between"
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Resolvidos
            </span>
            <p className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {metrics.resolvedCount}
            </p>
          </div>
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="h-[calc(100vh-290px)] min-h-[500px] flex flex-col md:flex-row gap-4">
        {/* Left Side: Conversation Queue & Filters */}
        <div className="w-full md:w-88 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden shrink-0">
          {/* Filters Bar */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchConversations(false)}
                placeholder="Buscar parceiro, proposta ou assunto..."
                className="w-full h-8 pl-8 pr-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-1">
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'OPEN', label: 'Abertos' },
                { id: 'IN_PROGRESS', label: 'Em Curso' },
                { id: 'RESOLVED', label: 'Resolvidos' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex-1 py-1 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversations Queue */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {isLoadingList ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-2">
                <div className="h-6 w-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[11px] text-slate-400">Carregando fila...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                <MessageSquare className="h-6 w-6 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="font-bold text-slate-600 dark:text-slate-300">Nenhum chamado nesta visualização</p>
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeConversationId;
                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveConversationId(c.id)}
                    className={`p-3 transition-colors cursor-pointer text-xs space-y-1 ${
                      isActive
                        ? 'bg-blue-500/10 dark:bg-blue-500/15 border-l-3 border-blue-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-slate-900 dark:text-white truncate">
                          {c.partnerName || 'Parceiro'}
                        </span>
                        {c.partnerCode && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {c.partnerCode}
                          </span>
                        )}
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-mono shrink-0">
                        {new Date(c.lastMessageAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {c.subject || 'Atendimento'}
                    </p>

                    {c.proposalNumber && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-semibold">
                        Proposta #{c.proposalNumber} {c.bankName ? `• ${c.bankName}` : ''}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-0.5">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                            c.status === 'RESOLVED'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : c.status === 'IN_PROGRESS'
                              ? 'bg-blue-500/10 text-blue-500'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}
                        >
                          {c.status === 'RESOLVED' ? 'Resolvido' : c.status === 'IN_PROGRESS' ? 'Em Tratativa' : 'Aberto'}
                        </span>

                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {c.channel}
                        </span>
                      </div>

                      {c.unreadCount > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
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
        <div className="flex-1 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          {activeConversationData ? (
            <>
              {/* Chat Header */}
              <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-xs text-slate-900 dark:text-white">
                      {activeConversationData.partnerName}
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      Cód: {activeConversationData.partnerCode}
                    </span>
                    <span
                      className={`text-[9.5px] font-black uppercase px-1.5 py-0.2 rounded ${
                        activeConversationData.status === 'RESOLVED'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : 'bg-blue-500/10 text-blue-500'
                      }`}
                    >
                      {activeConversationData.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeConversationData.subject}{' '}
                    {activeConversationData.proposalNumber ? `• Proposta #${activeConversationData.proposalNumber}` : ''}
                  </p>
                </div>

                {/* Status Action Buttons */}
                <div className="flex items-center gap-1.5">
                  {activeConversationData.status !== 'RESOLVED' ? (
                    <button
                      onClick={() => handleUpdateStatus('RESOLVED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Concluir Atendimento</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpdateStatus('IN_PROGRESS')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>Reabrir</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/30 dark:bg-slate-950/20">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-6 w-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400">
                    Nenhuma mensagem registrada nesta conversa.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isStaff = m.senderType === 'SUPPORT';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                          <span className="font-bold text-slate-600 dark:text-slate-300">
                            {isStaff ? `${m.senderName || 'Suporte'} (Você)` : `${m.senderName || 'Parceiro'}`}
                          </span>
                          <span>•</span>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div
                          className={`p-3 rounded-2xl max-w-[80%] text-xs font-medium leading-relaxed shadow-2xs ${
                            isStaff
                              ? 'bg-blue-600 text-white rounded-tr-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input Form */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Digite sua resposta para o parceiro..."
                  className="flex-1 h-9.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || isSending}
                  className="h-9.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  {isSending ? (
                    <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Responder</span>
                      <Send className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-400 space-y-2">
              <Headphones className="h-10 w-10 text-slate-300 dark:text-slate-700" />
              <p className="font-bold text-slate-600 dark:text-slate-300">Nenhum atendimento selecionado</p>
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
