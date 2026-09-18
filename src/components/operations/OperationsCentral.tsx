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
  const [healthStatus, setHealthStatus] = useState<string>('OPERATIONAL');
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState<number>(0);

  // Consulta status rápido para os badges das abas
  useEffect(() => {
    const fetchQuickBadges = async () => {
      try {
        const [resHealth, resAnnounce] = await Promise.all([
          fetch('/api/monitoring/health', { credentials: 'include' }),
          fetch('/api/announcements', { credentials: 'include' }),
        ]);

        if (resHealth.ok) {
          const h = await resHealth.json();
          setHealthStatus(h.overallStatus || 'OPERATIONAL');
        }

        if (resAnnounce.ok) {
          const a = await resAnnounce.json();
          const list = Array.isArray(a) ? a : a.data || [];
          const unread = list.filter((item: any) => !item.read).length;
          setUnreadAnnouncementsCount(unread);
        }
      } catch (err) {
        // Silently catch in background poll
      }
    };

    fetchQuickBadges();
    const interval = setInterval(fetchQuickBadges, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenAnnouncementsWithIncident = (incident: ApiIncident) => {
    setIncidentToAnnounce(incident);
    setActiveTab('ANNOUNCEMENTS');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Principal da Central Inteligente de Operações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#080d18] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                Central Inteligente de Operações
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                  Sentinel Consig
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Saúde de APIs em tempo real, Copilot Operacional com IA generativa e Central de Comunicados da equipe.
              </p>
            </div>
          </div>
        </div>

        {/* Badge de Conformidade & Isolamento */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start md:self-auto text-xs text-slate-600 dark:text-slate-300">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="font-semibold text-[11px]">Tenant Isolado & Multi-Tenant Seguro</span>
        </div>
      </div>

      {/* Navegação por Abas Integradas */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        {/* Aba 1: Monitoramento de APIs */}
        <button
          onClick={() => setActiveTab('MONITORING')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'MONITORING'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Monitoramento de APIs</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'MONITORING'
                ? 'bg-white/20 text-white'
                : healthStatus === 'OPERATIONAL'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
            }`}
          >
            {healthStatus === 'OPERATIONAL' ? '100% OK' : 'Alerta'}
          </span>
        </button>

        {/* Aba 2: Assistente Operacional IA */}
        <button
          onClick={() => setActiveTab('AI_ASSISTANT')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'AI_ASSISTANT'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Bot className="h-4 w-4" />
          <span>Assistente Operacional IA</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'AI_ASSISTANT'
                ? 'bg-white/20 text-white'
                : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
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
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Megaphone className="h-4 w-4" />
          <span>Central de Comunicados</span>
          {unreadAnnouncementsCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'ANNOUNCEMENTS'
                  ? 'bg-white text-blue-600'
                  : 'bg-blue-500 text-white animate-pulse'
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
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Assistente Operacional Sentinela AI
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Consultas seguras em linguagem natural sobre APIs, comunicados, esteira e esteiras bancárias do seu tenant.
                </p>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 self-end sm:self-auto font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
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
