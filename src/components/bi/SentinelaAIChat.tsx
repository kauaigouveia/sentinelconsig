import React, { useState } from 'react';
import { Bot, Send, Sparkles, CheckCircle, Lock } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface SentinelaAIChatProps {
  startDate?: string;
  endDate?: string;
}

interface Message {
  id: string;
  sender: 'user' | 'sentinela';
  text: string;
  sources?: string[];
  toolsUsed?: { toolName: string; success: boolean; rbacBlocked?: boolean }[];
  timestamp: string;
  error?: boolean;
}

export const SentinelaAIChat: React.FC<SentinelaAIChatProps> = ({ startDate, endDate }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'sentinela',
      text: 'Olá! Como posso ajudar?',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const getAuthHeaders = (): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  };

  const handleSend = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/sentinela/query', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          message: queryText,
          context: { startDate, endDate },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao comunicar com a Sentinela AI.');
      }

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        sender: 'sentinela',
        text: data.answer || 'Nenhuma resposta retornada.',
        sources: data.sources || [],
        toolsUsed: data.toolsUsed || [],
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `err-${Date.now()}`,
        sender: 'sentinela',
        text: `Não foi possível processar sua consulta: ${err?.message || 'Erro de conexão.'}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'Qual a produção total paga e digitada este mês?',
    'Quais bancos possuem a maior taxa de conversão?',
    'Existem gargalos ou estouros de SLA na esteira?',
    'Qual a pontuação de saúde (Health Score) atual?',
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      {/* Header */}
      <div className="bg-slate-900 dark:bg-slate-950 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-100">Sentinela AI</h3>
            <p className="text-xs text-slate-400">Inteligência Gerencial</p>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/40">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : msg.error
                  ? 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 rounded-tl-none'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-none'
              }`}
            >
              {msg.sender === 'user' ? (
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
              ) : (
                <MarkdownRenderer content={msg.text} />
              )}

              {/* Tools & Sources metadata for AI responses */}
              {msg.sender === 'sentinela' && !msg.error && (
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px] space-y-1 text-slate-500 dark:text-slate-400">
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center mt-1">
                      <span className="font-medium text-slate-600 dark:text-slate-300 mr-1">Ferramentas:</span>
                      {msg.toolsUsed.map((t, idx) => (
                        <span
                          key={idx}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 ${
                            t.rbacBlocked
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : t.success
                              ? 'bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                              : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {t.rbacBlocked ? <Lock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" /> : <CheckCircle className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />}
                          <span>{t.toolName}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div
                className={`text-[10px] mt-1 text-right ${
                  msg.sender === 'user' ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 text-xs py-2 px-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 w-fit shadow-xs">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
            <span>Consultando os dados operacionais da sua empresa...</span>
          </div>
        )}
      </div>

      {/* Quick suggestions if few messages */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 bg-slate-100/60 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              disabled={loading}
              className="text-xs bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 transition-colors shadow-xs text-left cursor-pointer"
            >
              ⚡ {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Pergunte à Sentinela AI (ex: Qual o banco com maior conversão?)..."
          disabled={loading}
          className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2 rounded-lg transition-colors shadow-xs cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
