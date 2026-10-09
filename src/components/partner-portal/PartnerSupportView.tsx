import React, { useState, useEffect, useRef } from 'react';
import { SupportRating } from './SupportRating';
import {
  MessageSquare,
  Send,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Headphones,
  RefreshCw,
  User,
  Shield,
} from 'lucide-react';
import {
  PartnerPortalClient,
  PartnerSupportConversation,
  PartnerSupportMessage,
} from '../../services/partnerPortalClient';
import { realtimeHub } from '../../services/realtimeService';
import { toastService } from '../ui/toastService';

interface PartnerSupportViewProps {
  initialProposalId?: string | null;
  initialProposalNumber?: string | null;
}

export const PartnerSupportView: React.FC<PartnerSupportViewProps> = ({
  initialProposalId,
  initialProposalNumber,
}) => {
  const [conversations, setConversations] = useState<PartnerSupportConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversationData, setActiveConversationData] = useState<any>(null);
  const [messages, setMessages] = useState<PartnerSupportMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const isSendingRef = useRef(false);

  // New Conversation Modal
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newProposalId, setNewProposalId] = useState(initialProposalId || '');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  const messageRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const fetchConversationsRef = useRef<(autoSelectFirst?: boolean, quiet?: boolean) => Promise<void>>(async () => {});
  const fetchMessagesRef = useRef<(convId: string, quiet?: boolean) => Promise<void>>(async () => {});

  activeConversationIdRef.current = activeConversationId;

  const selectConversation = (conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
    setActiveConversationData(null);
    setMessages([]);
    setMessagesError(null);
    setInputText('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async (autoSelectFirst = true, quiet = false) => {
    const requestId = ++listRequestRef.current;
    if (!quiet) setIsLoadingList(true);
    setError(null);
    try {
      const list = await PartnerPortalClient.getConversations();
      if (requestId !== listRequestRef.current) return;
      setConversations(list);

      if (autoSelectFirst && list.length > 0 && !activeConversationIdRef.current) {
        selectConversation(list[0].id);
      }
    } catch (err: any) {
      if (requestId !== listRequestRef.current) return;
      setError(err?.message || 'Erro ao carregar atendimentos.');
    } finally {
      if (requestId === listRequestRef.current) setIsLoadingList(false);
    }
  };

  const fetchMessages = async (convId: string, quiet = false) => {
    const requestId = ++messageRequestRef.current;
    if (!quiet) setIsLoadingMessages(true);
    setMessagesError(null);
    try {
      const res = await PartnerPortalClient.getConversationMessages(convId);
      if (requestId !== messageRequestRef.current || activeConversationIdRef.current !== convId) return;
      setActiveConversationData(res.conversation);
      setMessages(previous => {
        if (previous.length !== res.messages.length || previous.some((message, index) => message.id !== res.messages[index]?.id)) setTimeout(scrollToBottom, 100);
        return res.messages;
      });
    } catch (err: any) {
      if (requestId !== messageRequestRef.current || activeConversationIdRef.current !== convId) return;
      console.error('[PartnerSupportView] Erro ao carregar mensagens:', err);
      setMessagesError(err?.message || 'Não foi possível carregar as mensagens.');
    } finally {
      if (requestId === messageRequestRef.current) setIsLoadingMessages(false);
    }
  };

  fetchConversationsRef.current = fetchConversations;
  fetchMessagesRef.current = fetchMessages;

  useEffect(() => {
    fetchConversations(true);

    // Realtime Listener
    const unsub = realtimeHub.subscribe('*', (event) => {
      if (['SUPPORT_MESSAGE_RECEIVED', 'SUPPORT_CONVERSATION_CREATED', 'SUPPORT_CONVERSATION_STATUS_CHANGED'].includes(event?.type || '')) {
        const conversationId = activeConversationIdRef.current;
        if (event?.data?.conversationId === conversationId && conversationId) {
          fetchMessagesRef.current(conversationId);
        }
        fetchConversationsRef.current(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (disposed || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const conversationId = activeConversationIdRef.current;
        if (conversationId) await fetchMessagesRef.current(conversationId, true);
      } finally { running = false; }
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
    if (!activeConversationId) {
      setIsLoadingMessages(false);
      return;
    }
    if (activeConversationId) {
      fetchMessages(activeConversationId);
    }
  }, [activeConversationId]);

  // Se inicializado com proposta específica, cria ou abre a conversa diretamente
  useEffect(() => {
    if (initialProposalId) {
      PartnerPortalClient.createConversation({
        proposalId: initialProposalId,
        subject: `Atendimento Proposta #${initialProposalNumber || initialProposalId.slice(0, 8)}`,
      })
        .then((conv) => {
          fetchConversations(false);
          selectConversation(conv.id);
        })
        .catch((err) => {
          console.warn('[PartnerSupportView] Erro ao auto-abrir conversa de proposta:', err);
        });
    }
  }, [initialProposalId, initialProposalNumber]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeConversationId || isSendingRef.current) return;

    const conversationId = activeConversationId;
    const text = inputText.trim();
    setInputText('');
    isSendingRef.current = true;
    setIsSending(true);

    try {
      const newMsg = await PartnerPortalClient.sendMessage(conversationId, text);
      if (activeConversationIdRef.current !== conversationId) return;
      setMessages((prev) => [...prev, newMsg]);
      setTimeout(scrollToBottom, 50);
      fetchConversations(false);
    } catch (err: any) {
      toastService.error('Falha ao enviar mensagem', err?.message || 'Tente novamente.');
      if (activeConversationIdRef.current === conversationId) setInputText(text); // recupera o texto apenas no atendimento de origem
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleCreateNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || isCreatingConversation) return;

    setIsCreatingConversation(true);
    try {
      const conv = await PartnerPortalClient.createConversation({
        subject: newSubject.trim(),
        proposalId: newProposalId.trim() || undefined,
      });

      setIsNewConvModalOpen(false);
      setNewSubject('');
      setNewProposalId('');
      await fetchConversations(false);
      selectConversation(conv.id);
    } catch (err: any) {
      toastService.error('Falha ao criar atendimento', err?.message || 'Tente novamente.');
    } finally {
      setIsCreatingConversation(false);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] min-h-[500px] flex flex-col md:flex-row gap-4 select-none animate-in fade-in duration-150">
      {/* Coluna da Esquerda: Lista de Conversas */}
      <div className="w-full md:w-80 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden shrink-0">
        {/* Header Lista */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-blue-500" />
            <span className="font-black text-xs text-slate-900 dark:text-white uppercase tracking-tight">
              Atendimentos
            </span>
          </div>

          <button
            onClick={() => setIsNewConvModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo</span>
          </button>
        </div>

        {/* Lista Itens */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {isLoadingList ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-2">
              <div className="h-6 w-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-[11px] text-slate-400">Carregando conversas...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="h-6 w-6 text-rose-500 mx-auto" />
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              <button type="button" onClick={() => fetchConversations(true)} className="mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                <RefreshCw className="h-3 w-3" /> Tentar novamente
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-2">
              <MessageSquare className="h-6 w-6 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="font-bold text-slate-600 dark:text-slate-300">Nenhum atendimento iniciado</p>
              <p className="text-[11px]">Clique em "Novo" para abrir um chamado com a mesa de suporte.</p>
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`p-3 transition-colors cursor-pointer text-xs space-y-1 ${
                    isActive
                      ? 'bg-blue-500/10 dark:bg-blue-500/15 border-l-3 border-blue-600'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-slate-900 dark:text-white truncate max-w-[170px]">
                      {c.subject || 'Atendimento Geral'}
                    </span>
                    <span className="text-[9.5px] text-slate-400 font-mono shrink-0">
                      {new Date(c.lastMessageAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>

                  {c.proposalNumber && (
                    <div className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold font-mono">
                      <FileSpreadsheet className="h-3 w-3" />
                      <span>Proposta #{c.proposalNumber}</span>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {c.lastMessage?.message || 'Sem mensagens'}
                  </p>

                  <div className="flex items-center justify-between pt-0.5">
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

      {/* Coluna da Direita: Janela de Chat */}
      <div className="flex-1 flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {activeConversationId ? (
          <>
            {activeConversationData ? <>
            {/* Chat Top Bar */}
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between shrink-0">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-xs text-slate-900 dark:text-white truncate">
                    {activeConversationData.subject || 'Atendimento'}
                  </h3>
                  <span
                    className={`text-[9.5px] font-black uppercase px-1.5 py-0.2 rounded ${
                      activeConversationData.status === 'RESOLVED'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-blue-500/10 text-blue-500'
                    }`}
                  >
                    {['RESOLVED', 'CLOSED'].includes(activeConversationData.status) ? 'Concluído' : 'Em Atendimento'}
                  </span>
                </div>
                {activeConversationData.proposalNumber && (
                  <p className="text-[10.5px] text-slate-400 truncate">
                    Vinculado à proposta <strong>#{activeConversationData.proposalNumber}</strong>{' '}
                    {activeConversationData.proposalClientName ? `(${activeConversationData.proposalClientName})` : ''}
                  </p>
                )}
              </div>

              <button
                onClick={() => activeConversationId && fetchMessages(activeConversationId)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                title="Atualizar mensagens"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/30 dark:bg-slate-950/20">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-6 w-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : messagesError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <AlertCircle className="h-6 w-6 text-rose-500" />
                  <p className="text-xs text-rose-600 dark:text-rose-400">{messagesError}</p>
                  <button type="button" onClick={() => fetchMessages(activeConversationId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <RefreshCw className="h-3 w-3" /> Tentar novamente
                  </button>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  Envie a primeira mensagem para iniciar o diálogo com a equipe.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderType === 'PARTNER';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                        <span className="font-bold text-slate-600 dark:text-slate-300">
                          {isMe ? 'Você (Parceiro)' : m.senderName || 'Mesa de Suporte'}
                        </span>
                        <span>•</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div
                        className={`p-3 rounded-2xl max-w-[80%] text-xs font-medium leading-relaxed shadow-2xs ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-tr-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-xs'
                        }`}
                      >
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                          {m.attachmentName && <a className="mt-2 block underline" href={`/api/partner-portal/support/messages/${encodeURIComponent(m.id)}/attachment`}>Baixar {m.attachmentName}</a>}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Form */}
            {activeConversationData?.id === activeConversationId && <SupportRating key={activeConversationId} conversation={activeConversationData} onRated={() => { if (activeConversationId) void fetchMessages(activeConversationId, true); }} />}
            {activeConversationData?.channel === 'WHATSAPP' ? <p className="border-t border-slate-200 p-3 text-xs dark:border-slate-800">Continue esta conversa pelo WhatsApp do canal de simulação.</p> : <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!activeConversationData || activeConversationData.id !== activeConversationId || isLoadingMessages}
                placeholder="Digite sua mensagem para o suporte..."
                className="flex-1 h-9.5 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending || !activeConversationData || activeConversationData.id !== activeConversationId || isLoadingMessages}
                className="h-9.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                {isSending ? (
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Enviar</span>
                    <Send className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </form>}
            </> : (
              <div className="flex-1 flex items-center justify-center">
                {isLoadingMessages ? <div className="h-6 w-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /> : <p className="text-xs text-slate-500">Carregando atendimento...</p>}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-slate-400 space-y-2">
            <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="font-bold text-slate-600 dark:text-slate-300">Nenhum atendimento selecionado</p>
            <p className="text-[11px] max-w-sm">
              Selecione uma conversa ao lado ou clique em "+ Novo" para tirar dúvidas sobre propostas e esteiras.
            </p>
          </div>
        )}
      </div>

      {/* Modal Novo Atendimento */}
      {isNewConvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 text-xs">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
              Novo Atendimento de Suporte
            </h3>

            <form onSubmit={handleCreateNewConversation} className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">Assunto / Motivo</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Ex: Dúvida sobre margem / pendência de contrato"
                  required
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  ID da Proposta (Opcional)
                </label>
                <input
                  type="text"
                  value={newProposalId}
                  onChange={(e) => setNewProposalId(e.target.value)}
                  placeholder="ID da proposta para vinculação direta"
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewConvModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingConversation}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  {isCreatingConversation ? 'Criando...' : 'Iniciar Atendimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
