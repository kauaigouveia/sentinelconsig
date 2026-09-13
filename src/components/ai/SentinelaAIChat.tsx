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
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { AIChatMessage } from '../../types';

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

  const quickPrompts = [
    { label: 'Quem produziu mais hoje?', query: 'Quem produziu mais hoje e qual operador lidera o ranking?' },
    { label: 'Qual banco tem maior conversão?', query: 'Qual banco tem a maior taxa de conversão e liquidação de propostas?' },
    { label: 'Quanto falta para a meta?', query: 'Qual é o status da meta mensal e o volume financeiro liberado?' },
    { label: 'Propostas paradas em CIP', query: 'Quantas propostas estão em AGUARDAR RETORNO CIP atualmente?' },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden flex flex-col h-[700px]">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-xs">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Sentinela IA Operacional</h3>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Online
              </span>
            </div>
            <p className="text-xs text-slate-400">Consultas analíticas alimentadas pelos dados em tempo real da mesa</p>
          </div>
        </div>

        <span className="text-xs font-mono text-slate-400">
          Operador: <strong className="text-slate-200">{activeUser.name}</strong>
        </span>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.map(msg => {
          const isAssistant = msg.sender === 'SENTINELA_IA';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-2xl ${isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                  isAssistant ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white'
                }`}
              >
                {isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
              </div>

              <div
                className={`rounded-2xl p-4 text-xs shadow-2xs space-y-1 ${
                  isAssistant
                    ? 'bg-white border border-slate-200 text-slate-800'
                    : 'bg-blue-600 text-white'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
                <div className={`text-[10px] ${isAssistant ? 'text-slate-400' : 'text-blue-200'} text-right`}>
                  {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 max-w-2xl mr-auto">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl p-4 text-xs bg-white border border-slate-200 text-slate-500 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span>Analisando base de propostas e métricas da esteira...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="p-3 bg-slate-100/80 border-t border-slate-200 flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">Sugestões:</span>
        {quickPrompts.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q.query)}
            disabled={isLoading}
            className="text-xs bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 font-semibold px-2.5 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Pergunte ao Sentinela IA sobre propostas, bancos, metas ou gargalos..."
          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
          disabled={isLoading}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || isLoading}
          className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
