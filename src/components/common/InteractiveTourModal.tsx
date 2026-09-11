import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Kanban,
  Search,
  Download,
  BarChart3,
  ShieldAlert,
  Clock,
  Keyboard,
  CheckCircle2,
  HelpCircle,
  Zap,
} from 'lucide-react';

interface InteractiveTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateView?: (view: string) => void;
}

interface TourStep {
  title: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  description: string;
  highlightPoints: { title: string; text: string }[];
  targetView?: string;
  actionHint?: string;
}

export const InteractiveTourModal: React.FC<InteractiveTourModalProps> = ({
  isOpen,
  onClose,
  onNavigateView,
}) => {
  if (!isOpen) return null;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const steps: TourStep[] = [
    {
      title: 'Bem-vindo ao Sistema de Produção e Esteira de Crédito',
      badge: 'Visão Geral',
      icon: Sparkles,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      description:
        'Uma plataforma completa para gestão, esteira kanban com SLA operacional, conciliação de parceiros e relatórios gerenciais.',
      highlightPoints: [
        {
          title: 'Fluxo 100% Integrado',
          text: 'Cadastro de propostas (ADEs), clientes com validação estrita de CPF e alçadas de responsabilidade.',
        },
        {
          title: 'Regras de Segurança',
          text: 'Extração automática de códigos de parceiros (ex: KAUAI@16740 ➔ 16740) e trilha de auditoria permanente.',
        },
        {
          title: 'Atalhos Globais',
          text: 'Use Ctrl+K para busca rápida, Ctrl+N para nova produção e Alt+F para Modo Foco.',
        },
      ],
      targetView: 'torre-controle',
    },
    {
      title: 'Esteira Kanban com Indicadores Visuais de SLA',
      badge: 'Operação Ágil',
      icon: Kanban,
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      description:
        'Acompanhe o status de cada ADE em tempo real com barras de progresso que alertam sobre vencimento de prazos operacionais.',
      highlightPoints: [
        {
          title: 'Barras de Progresso SLA',
          text: 'Cores dinâmicas (Verde: No Prazo, Laranja: ≥75% de atenção, Vermelho: Estourado).',
        },
        {
          title: 'Filtro de Urgência',
          text: 'Filtre apenas propostas com risco de estouro de prazo operacional para priorizar atendimento.',
        },
        {
          title: 'Movimentação Rápida',
          text: 'Avance ou retroceda etapas da esteira diretamente pelos botões de navegação no card.',
        },
      ],
      targetView: 'kanban',
      actionHint: 'Acesse a Esteira Kanban no menu lateral para visualizar as colunas e alertas.',
    },
    {
      title: 'Busca Global, Paleta de Comandos & Atalhos',
      badge: 'Produtividade',
      icon: Search,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      description:
        'Localize qualquer proposta, cliente, parceiro ou módulo em milissegundos sem tirar as mãos do teclado.',
      highlightPoints: [
        {
          title: 'Ctrl + K (Paleta de Comandos)',
          text: 'Abra a central de navegação rápida e execute ações operacionais instantaneamente.',
        },
        {
          title: 'Ctrl + F / Ctrl + N',
          text: 'Foco direto no campo de busca ou abertura imediata do formulário de nova proposta.',
        },
        {
          title: 'Modo Foco (Alt + F)',
          text: 'Oculte cabeçalhos e barras laterais para maximizar a área de trabalho em tabelas densas.',
        },
      ],
      targetView: 'producao',
    },
    {
      title: 'Exportação Seletiva de Dados (Excel e CSV)',
      badge: 'Inteligência de Dados',
      icon: Download,
      iconBg: 'bg-teal-100',
      iconColor: 'text-teal-600',
      description:
        'Gere relatórios customizados escolhendo exatamente quais colunas incluir ou use o layout padrão bancário.',
      highlightPoints: [
        {
          title: 'Formatos XLSX e CSV',
          text: 'Compatibilidade total com Excel, Google Sheets e ferramentas de BI corporativo.',
        },
        {
          title: 'Presets Inteligentes',
          text: 'Selecione rapidamente conjuntos predefinidos (Operacional, Financeiro ou Auditoria Completa).',
        },
        {
          title: 'Higienização de Dados',
          text: 'Garante que os códigos de parceiros e CPFs sejam exportados no formato esperado pelos bancos.',
        },
      ],
    },
    {
      title: 'Dashboard Executivo & Gamificação da Equipe',
      badge: 'Gestão & Performance',
      icon: BarChart3,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      description:
        'Métricas estratégicas com gráficos Recharts para acompanhar tendências em 30 dias, gargalos e performance individual.',
      highlightPoints: [
        {
          title: 'Leaderboard de Operadores',
          text: 'Ranking de pontuação e taxas de conversão de propostas pagas para engajamento da equipe.',
        },
        {
          title: 'Relatório de Gargalos',
          text: 'Tempo médio de permanência em cada status para identificar onde as propostas ficam retidas.',
        },
        {
          title: 'Volume por Banco Parceiro',
          text: 'Distribuição financeira e volumetria por instituição bancária e promotora.',
        },
      ],
      targetView: 'dashboard-executivo',
    },
    {
      title: 'Segurança, Diagnóstico Técnico e Backup Agendado',
      badge: 'Confiabilidade',
      icon: ShieldAlert,
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      description:
        'Trilha de auditoria imutável, log detalhado de exceções para suporte técnico e backups automáticos via cron.',
      highlightPoints: [
        {
          title: 'Diagnóstico de Exceções',
          text: 'Captura detalhada de falhas em importações com cópia de diagnóstico em JSON em 1 clique.',
        },
        {
          title: 'Backup Automático Agendado',
          text: 'Exportações programadas com retenção de snapshots para segurança total dos dados da esteira.',
        },
        {
          title: 'Confirmação Universal',
          text: 'Proteção contra exclusões ou edições acidentais em ações críticas do sistema.',
        },
      ],
      targetView: 'auditoria',
    },
  ];

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      if (steps[nextIndex].targetView && onNavigateView) {
        onNavigateView(steps[nextIndex].targetView!);
      }
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1;
      setCurrentStepIndex(prevIndex);
      if (steps[prevIndex].targetView && onNavigateView) {
        onNavigateView(steps[prevIndex].targetView!);
      }
    }
  };

  const handleComplete = () => {
    try {
      localStorage.setItem('cg_tour_completed', 'true');
    } catch {
      // safe fallback
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300 ease-out"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              <Zap className="h-3 w-3" /> Passo {currentStepIndex + 1} de {steps.length}: {currentStep.badge}
            </span>
          </div>

          <button
            onClick={handleComplete}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
            title="Pular Tour"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Main Visual Title Header */}
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${currentStep.iconBg} ${currentStep.iconColor} shrink-0 shadow-2xs`}>
              <currentStep.icon className="h-7 w-7" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 leading-snug">
                {currentStep.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {currentStep.description}
              </p>
            </div>
          </div>

          {/* Highlight Points Card List */}
          <div className="space-y-2.5 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
              Destaques e Recursos Principais:
            </span>

            {currentStep.highlightPoints.map((pt, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-800">{pt.title}: </strong>
                  <span className="text-slate-600 leading-relaxed">{pt.text}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Action Hint / Navigation trigger */}
          {currentStep.targetView && onNavigateView && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50/60 border border-blue-200/60 text-[11px] text-blue-900">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>Visualizando tela correspondente ao fundo</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateView(currentStep.targetView!)}
                className="font-bold underline hover:text-blue-800"
              >
                Ir para módulo
              </button>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-2xl">
          <button
            onClick={handleComplete}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline"
          >
            Pular Tour
          </button>

          <div className="flex items-center gap-2">
            <button
              disabled={currentStepIndex === 0}
              onClick={handlePrev}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Anterior</span>
            </button>

            <button
              id="btn-tour-next-step"
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition-colors"
            >
              <span>{isLastStep ? 'Concluir Tour' : 'Próximo'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
