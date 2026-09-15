import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  User,
  HelpCircle,
  TrendingUp,
  Building2,
  Clock,
  Layers,
  CheckCircle2,
  Plus,
  MessageSquare,
  ChevronRight,
  ShieldCheck,
  Database,
  Coins,
  Target,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { AIChatMessage } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { ActionBar } from '../ui/ActionBar';

export const SentinelaAIChat: React.FC = () => {
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'SENTINELA_IA',
      text: 'Olá! Sou o **Sentinela IA**, seu assistente de inteligência operacional da mesa. Posso analisar suas propostas, gargalos de CIP, conversão por banco e acompanhamento de metas em tempo real. O que você gostaria de consultar hoje?',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeUser = StorageService.getActiveUser();
  const proposals = StorageService.getProposals();
  const statuses = StorageService.getStatuses();
  const banks = StorageService.getBanks();

  // Quick Operational Context Metrics
  const pagasCount = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'PAGO';
  }).length;
  const totalVolume = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
  const cipCount = proposals.filter(p => {
    const s = statuses.find(st => st.id === p.statusId);
    return s?.code === 'AGUARDAR_RETORNO_CIP';
  }).length;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || isLoading) return;

    const userMsg: AIChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'USER',
      text: queryText,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await StorageService.askSentinelaAI(queryText);
      const aiMsg: AIChatMessage = {
        id: `msg_a_${Date.now()}`,
        sender: 'SENTINELA_IA',
        text: responseText,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: AIChatMessage = {
        id: `msg_err_${Date.now()}`,
        sender: 'SENTINELA_IA',
        text: 'Desculpe, ocorreu um erro ao processar sua consulta. Por favor, tente novamente.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([
      {
        id: `msg-welcome-${Date.now()}`,
        sender: 'SENTINELA_IA',
        text: 'Nova sessão iniciada. Como posso apoiar sua operação de crédito agora?',
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const quickPrompts = [
    { label: 'Quem produziu mais hoje?', query: 'Quem produziu mais hoje e qual operador lidera o ranking?' },
    { label: 'Qual banco tem maior conversão?', query: 'Qual banco tem a maior taxa de conversão e liquidação de propostas?' },
    { label: 'Quanto falta para a meta?', query: 'Qual é o status da meta mensal e o volume financeiro liberado?' },
    { label: 'Propostas paradas em CIP', query: 'Quantas propostas estão em AGUARDAR RETORNO CIP atualmente e qual o valor retido?' },
  ];

  return (
    <div className="space-y-4">
      <ActionBar
        title="Sentinela IA — Copiloto de Mesa & Crédito"
        subtitle="Inteligência operacional conectada à base em tempo real para auditoria de SLA, conversão e liquidação"
        badgeText="COPILOTO ANALÍTICO"
        badgeColor="bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800"
      />

      {/* Main Copilot Shell */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-2xs overflow-hidden flex flex-col md:flex-row h-[700px]">
        {/* LEFT SIDEBAR: Conversas & Contexto da Mesa */}
        <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#090e1a] p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-4">
            <button
              onClick={handleNewConversation}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs py-2.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Consulta / Conversa</span>
            </button>

            {/* Quick Context Pillars */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Contexto Atual da Mesa
              </span>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Volume Total:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(totalVolume)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Pagas:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{pagasCount} contratos</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-slate-500 text-[11px]">Retido CIP:</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">{cipCount} em espera</span>
                </div>
              </div>
            </div>

            {/* Quick Suggestions */}
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Tópicos Frequentes
              </span>
              <div className="space-y-1">
                {quickPrompts.map(p => (
                  <button
                    key={p.label}
                    onClick={() => handleSend(p.query)}
                    className="w-full text-left p-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <span className="truncate">{p.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Motor de IA Conectado à Base</span>
          </div>
        </div>

        {/* RIGHT AREA: Chat Flow */}
        <div className="flex-1 flex flex-col justify-between bg-white dark:bg-[#0f172a]">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0c1220] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-xs">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Sentinela Copilot</span>
                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ONLINE
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">Respostas baseadas nos dados oficiais da sua empresa.</p>
              </div>
            </div>
          </div>

          {/* Messages Flow */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(m => {
              const isAi = m.sender === 'SENTINELA_IA';
              return (
                <div
                  key={m.id}
                  className={`flex gap-3 max-w-3xl ${isAi ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                >
                  <div
                    className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      isAi
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isAi ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>

                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                      isAi
                        ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/60'
                        : 'bg-blue-600 text-white shadow-xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <span
                      className={`text-[9px] mt-1.5 block ${
                        isAi ? 'text-slate-400' : 'text-blue-200'
                      }`}
                    >
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 p-2 font-medium animate-pulse">
                <Bot className="h-4 w-4" />
                <span>Sentinela IA está analisando a esteira de crédito...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input & Prompt Chips */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0c1220] space-y-2.5">
            {/* Prompt Chips Bar */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
              {quickPrompts.map(qp => (
                <button
                  key={qp.label}
                  onClick={() => handleSend(qp.query)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-purple-400 whitespace-nowrap transition-colors cursor-pointer"
                >
                  {qp.label}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Pergunte ao Sentinela IA sobre propostas, bancos, atrasos ou metas..."
                disabled={isLoading}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-purple-500 focus:outline-hidden transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-xl bg-purple-600 hover:bg-purple-500 text-white p-2.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
