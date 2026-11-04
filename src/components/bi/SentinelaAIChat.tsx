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
    'Como está a saúde e latência das APIs e bancos integrados?',
    'Quais os comunicados operacionais ativos para a equipe?',
    'Existem gargalos ou estouros de SLA na esteira?',
    'Quais bancos possuem a maior taxa de conversão?',
    'Qual a produção total paga e digitada este mês?',
  ];

  return (
    <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] rounded-xl  border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      {/* Header */}
      <div className="bg-[var(--bg-surface)] dark:bg-[var(--bg-canvas)] text-[var(--text-primary)] px-5 py-3.5 flex items-center justify-between border-b border-[var(--field-border)]">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--info-bg)] flex items-center justify-center text-[var(--text-primary)] font-bold shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[var(--text-primary)]">Sentinela AI</h3>
            <p className="text-xs text-[var(--text-secondary)]">Inteligência Gerencial</p>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[var(--bg-canvas)] dark:bg-[var(--bg-canvas)]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm  ${
                msg.sender === 'user'
                  ? 'bg-[var(--info-bg)] text-[var(--text-primary)] rounded-tr-none'
                  : msg.error
                  ? 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] border border-[var(--danger-border)] dark:border-[var(--danger-border)] text-[var(--danger-text)] dark:text-[var(--danger-text)] rounded-tl-none'
                  : 'bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] rounded-tl-none'
              }`}
            >
              {msg.sender === 'user' ? (
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
              ) : (
                <MarkdownRenderer content={msg.text} />
              )}

              {/* Tools & Sources metadata for AI responses */}
              {msg.sender === 'sentinela' && !msg.error && (
                <div className="mt-3 pt-2 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px] space-y-1 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center mt-1">
                      <span className="font-medium text-[var(--text-secondary)] dark:text-[var(--text-primary)] mr-1">Ferramentas:</span>
                      {msg.toolsUsed.map((t, idx) => (
                        <span
                          key={idx}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center space-x-1 ${
                            t.rbacBlocked
                              ? 'bg-[var(--warning-bg)] dark:bg-[var(--warning-bg)] text-[var(--warning-text)] dark:text-[var(--warning-text)] border border-[var(--warning-border)] dark:border-[var(--warning-border)]'
                              : t.success
                              ? 'bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--field-border)] dark:border-[var(--field-border)]'
                              : 'bg-[var(--danger-bg)] dark:bg-[var(--danger-bg)] text-[var(--danger-text)] dark:text-[var(--danger-text)]'
                          }`}
                        >
                          {t.rbacBlocked ? <Lock className="w-2.5 h-2.5 text-[var(--warning-text)] dark:text-[var(--warning-text)]" /> : <CheckCircle className="w-2.5 h-2.5 text-[var(--success-text)] dark:text-[var(--success-text)]" />}
                          <span>{t.toolName}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div
                className={`text-[10px] mt-1 text-right ${
                  msg.sender === 'user' ? 'text-[var(--link)]' : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center space-x-2 text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-xs py-2 px-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] rounded-lg border border-[var(--field-border)] dark:border-[var(--field-border)] w-fit shadow-xs">
            <Sparkles className="w-4 h-4 text-[var(--link)] dark:text-[var(--link)] animate-spin" />
            <span>Consultando os dados operacionais da sua empresa...</span>
          </div>
        )}
      </div>

      {/* Quick suggestions if few messages */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface)] border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex flex-wrap gap-1.5">
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              disabled={loading}
              className="text-xs bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-canvas)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] px-2.5 py-1 rounded-full border border-[var(--field-border)] dark:border-[var(--field-border)] transition-colors  text-left cursor-pointer"
            >
              ⚡ {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input Form */}
      <div className="p-3 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] border-t border-[var(--field-border)] dark:border-[var(--field-border)] flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Pergunte à Sentinela AI (ex: Qual o banco com maior conversão?)..."
          disabled={loading}
          className="flex-1 bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-lg px-3.5 py-2 text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] focus:border-[var(--field-border)]"
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="bg-[var(--action)] hover:bg-[var(--action-hover)] disabled:opacity-90 text-[var(--text-primary)] p-2 rounded-lg transition-colors  cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
