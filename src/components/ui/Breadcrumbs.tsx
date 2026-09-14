import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  view?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  currentView: string;
  onNavigate: (view: string) => void;
  subItem?: string;
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  currentView,
  onNavigate,
  subItem,
  className = '',
}) => {
  // Map current view to structured path
  const getHierarchy = (): BreadcrumbItem[] => {
    switch (currentView) {
      // Visão Geral
      case 'torre-controle':
        return [
          { label: 'Visão Geral' },
          { label: 'Torre de Controle', view: 'torre-controle' },
        ];
      case 'dashboard-executivo':
        return [
          { label: 'Visão Geral' },
          { label: 'Dashboard Executivo', view: 'dashboard-executivo' },
        ];
      case 'tv-monitor':
        return [
          { label: 'Visão Geral' },
          { label: 'Monitor TV (Ao Vivo)', view: 'tv-monitor' },
        ];
      case 'radar-comercial':
        return [
          { label: 'Visão Geral' },
          { label: 'Radar Comercial & BI', view: 'radar-comercial' },
        ];
      case 'sentinela-ai':
        return [
          { label: 'Inteligência' },
          { label: 'Sentinela IA Copilot', view: 'sentinela-ai' },
        ];
      case 'gamificacao':
        return [
          { label: 'Operação' },
          { label: 'Conquistas & Metas', view: 'gamificacao' },
        ];
      case 'relatorio-gargalos':
        return [
          { label: 'Gestão' },
          { label: 'Gargalos & Permanência', view: 'relatorio-gargalos' },
        ];

      // Operação
      case 'home-digitador':
        return [
          { label: 'Operação' },
          { label: 'Minha Produção', view: 'home-digitador' },
        ];
      case 'producao':
        return [
          { label: 'Operação' },
          { label: 'Todas as Propostas', view: 'producao' },
        ];
      case 'esteira':
        return [
          { label: 'Operação' },
          { label: 'Esteira Kanban', view: 'esteira' },
        ];
      case 'portabilidades':
        return [
          { label: 'Operação' },
          { label: 'Portabilidades (CIP 5 Dias)', view: 'portabilidades' },
        ];
      case 'agenda-operacional':
        return [
          { label: 'Operação' },
          { label: 'Agenda & Tarefas', view: 'agenda-operacional' },
        ];

      // Simulações
      case 'simulacoes':
        return [
          { label: 'Simulações' },
          { label: 'Esteira de Simulações', view: 'simulacoes' },
        ];

      // Clientes
      case 'clientes':
      case 'busca-cpf':
      case 'pesquisa-cpf':
        return [
          { label: 'Clientes' },
          { label: 'Clientes 360º & CRM', view: 'clientes' },
        ];

      // Gestão
      case 'financeiro-geral':
        return [
          { label: 'Gestão' },
          { label: 'Fluxo de Caixa Financeiro', view: 'financeiro-geral' },
        ];
      case 'parceiros':
        return [
          { label: 'Gestão' },
          { label: 'Parceiros Comerciais', view: 'parceiros' },
        ];
      case 'promotoras':
      case 'admin-bancos':
        return [
          { label: 'Gestão' },
          { label: 'Promotoras & Bancos', view: 'promotoras' },
        ];
      case 'suporte':
      case 'pendencias':
      case 'sla':
        return [
          { label: 'Gestão' },
          { label: 'Central de Suporte & SLA', view: 'suporte' },
        ];

      // Administração
      case 'admin-usuarios':
        return [
          { label: 'Administração' },
          { label: 'Usuários & Perfis', view: 'admin-usuarios' },
        ];
      case 'admin-produtos':
        return [
          { label: 'Administração' },
          { label: 'Produtos & Regras', view: 'admin-produtos' },
        ];
      case 'admin-status':
      case 'admin-import-status':
        return [
          { label: 'Administração' },
          { label: 'Status & Regras', view: 'admin-status' },
        ];
      case 'admin-calendario':
        return [
          { label: 'Administração' },
          { label: 'Feriados & Prazos SLA', view: 'admin-calendario' },
        ];
      case 'admin-auditoria':
        return [
          { label: 'Administração' },
          { label: 'Auditoria & Logs de Segurança', view: 'admin-auditoria' },
        ];

      // Plataforma SaaS
      case 'saas-tenants':
        return [
          { label: 'Plataforma' },
          { label: 'SaaS & Gestão de Tenants', view: 'saas-tenants' },
        ];

      default:
        return [
          { label: 'Sistema' },
          { label: currentView },
        ];
    }
  };

  const items = getHierarchy();

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 select-none ${className}`}
    >
      <button
        onClick={() => onNavigate('torre-controle')}
        className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
        title="Início"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="font-medium">Início</span>
      </button>

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1 && !subItem;
        return (
          <React.Fragment key={idx}>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {item.label}
              </span>
            ) : item.view ? (
              <button
                onClick={() => item.view && onNavigate(item.view)}
                className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <span>{item.label}</span>
            )}
          </React.Fragment>
        );
      })}

      {subItem && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
          <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[200px]">
            {subItem}
          </span>
        </>
      )}
    </nav>
  );
};
