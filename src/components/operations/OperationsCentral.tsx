import React, { useState, useEffect } from 'react';
import {
  Activity,
  Bot,
  Megaphone,
  Radio,
  ShieldCheck,
  Sparkles,
  Server,
  Zap,
  Info,
} from 'lucide-react';
import { ApiMonitoringTab, ApiIncident } from './ApiMonitoringTab';
import { AnnouncementsTab } from './AnnouncementsTab';
import { SentinelaAIChat } from '../bi/SentinelaAIChat';

export const OperationsCentral: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'MONITORING' | 'AI_ASSISTANT' | 'ANNOUNCEMENTS'>('MONITORING');
  const [incidentToAnnounce, setIncidentToAnnounce] = useState<ApiIncident | null>(null);
  const [healthStatus, setHealthStatus] = useState<string>('CHECKING');
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState<number>(0);

  // Consulta status rápido para os badges das abas
  useEffect(() => {
    const fetchQuickBadges = async () => {
      try {
        const [resHealth, resAnnounce] = await Promise.all([
          fetch('/api/monitoring/health', { credentials: 'include' }),
          fetch('/api/announcements/unread-count', { credentials: 'include' }),
        ]);

        if (resHealth.ok) {
          const h = await resHealth.json();
          setHealthStatus(h.overallStatus || 'UNKNOWN');
        } else {
          setHealthStatus('UNKNOWN');
        }

        if (resAnnounce.ok) {
          const count = await resAnnounce.json();
          setUnreadAnnouncementsCount(Math.max(0, Number(count?.count) || 0));
        }
      } catch (err) {
        // Silently catch in background poll
        setHealthStatus('UNKNOWN');
      }
    };

    fetchQuickBadges();
    window.addEventListener('sentinel:announcements-updated', fetchQuickBadges);
    const interval = setInterval(fetchQuickBadges, 60000);
    return () => {
      window.removeEventListener('sentinel:announcements-updated', fetchQuickBadges);
      clearInterval(interval);
    };
  }, []);

  const handleOpenAnnouncementsWithIncident = (incident: ApiIncident) => {
    setIncidentToAnnounce(incident);
    setActiveTab('ANNOUNCEMENTS');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Principal da Central Inteligente de Operações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)]">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[var(--text-secondary)] dark:text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                Central Inteligente de Operações
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
                  Sentinel Consig
                </span>
              </h1>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)] mt-0.5">
                Saúde de APIs em tempo real, Copilot Operacional com IA generativa e Central de Comunicados da equipe.
              </p>
            </div>
          </div>
        </div>

        {/* Badge de Conformidade & Isolamento */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] border border-[var(--field-border)] dark:border-[var(--field-border)] self-start md:self-auto text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
          <ShieldCheck className="h-4 w-4 text-[var(--success-text)] shrink-0" />
          <span className="font-semibold text-[11px]">Tenant Isolado & Multi-Tenant Seguro</span>
        </div>
      </div>

      {/* Navegação por Abas Integradas */}
      <div className="flex items-center gap-2 border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-2 overflow-x-auto p2-operation-tabs">
        {/* Aba 1: Monitoramento de APIs */}
        <button
          onClick={() => setActiveTab('MONITORING')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'MONITORING'
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Monitoramento de APIs</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'MONITORING'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
              : healthStatus === 'OPERATIONAL'
              ? 'bg-[var(--success-bg)] text-[var(--success-text)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
              : healthStatus === 'CHECKING' || healthStatus === 'UNKNOWN'
              ? 'bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:bg-[var(--bg-surface-elevated)] dark:text-[var(--text-primary)]'
              : 'bg-[var(--danger-bg)] text-[var(--danger-text)] dark:bg-[var(--danger-bg)] dark:text-[var(--danger-text)]'
            }`}
          >
            {healthStatus === 'OPERATIONAL' ? 'Status OK' : healthStatus === 'CHECKING' ? 'Verificando' : healthStatus === 'UNKNOWN' ? 'Sem resposta' : 'Alerta'}
          </span>
        </button>

        {/* Aba 2: Assistente Operacional IA */}
        <button
          onClick={() => setActiveTab('AI_ASSISTANT')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'AI_ASSISTANT'
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <Bot className="h-4 w-4" />
          <span>Assistente Operacional IA</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'AI_ASSISTANT'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)]'
                : 'bg-[var(--info-bg)] text-[var(--link)] dark:bg-[var(--info-bg)] dark:text-[var(--link)]'
            }`}
          >
            Gemini 3.8
          </span>
        </button>

        {/* Aba 3: Central de Comunicados */}
        <button
          onClick={() => setActiveTab('ANNOUNCEMENTS')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'ANNOUNCEMENTS'
              ? 'bg-[var(--action)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)]'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          <span>Central de Comunicados</span>
          {unreadAnnouncementsCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'ANNOUNCEMENTS'
                  ? 'bg-[var(--bg-surface)] text-[var(--link)]'
                  : 'bg-[var(--info-bg)] text-[var(--text-primary)] animate-pulse'
              }`}
            >
              {unreadAnnouncementsCount} novos
            </span>
          )}
        </button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      {activeTab === 'MONITORING' && (
        <ApiMonitoringTab
          onOpenAnnouncementsTabWithIncident={handleOpenAnnouncementsWithIncident}
        />
      )}

      {activeTab === 'AI_ASSISTANT' && (
        <div className="space-y-4">
          <div className="     border border-[var(--field-border)] dark:border-[var(--field-border)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[var(--info-bg)] text-[var(--text-primary)] flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  Assistente Operacional Sentinela AI
                </h3>
                <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                  Consultas seguras em linguagem natural sobre APIs, comunicados, esteira e esteiras bancárias do seu tenant.
                </p>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] flex items-center gap-1.5 self-end sm:self-auto font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--success-text)]" />
              <span>Apenas leitura (Read-Only) com Mascaramento PII</span>
            </div>
          </div>

          <SentinelaAIChat />
        </div>
      )}

      {activeTab === 'ANNOUNCEMENTS' && (
        <AnnouncementsTab
          initialIncidentToPublish={incidentToAnnounce}
          onClearInitialIncident={() => setIncidentToAnnounce(null)}
        />
      )}
    </div>
  );
};
