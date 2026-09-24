import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useRouter } from '../../router';

export interface BreadcrumbItem {
  label: string;
  path?: string;
  view?: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  currentView?: string;
  onNavigate?: (view: string) => void;
  subItem?: string;
  className?: string;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  currentView: propView,
  onNavigate: propNavigate,
  subItem,
  className = '',
}) => {
  let routerContext: ReturnType<typeof useRouter> | null = null;
  try {
    routerContext = useRouter();
  } catch {
    // RouterContext might not be available in isolated tests
  }

  const navigate = routerContext?.navigate;
  const activeRoute = routerContext?.activeRoute;
  const params = routerContext?.params || {};
  const currentView = propView || routerContext?.currentView || 'torre-controle';

  const handleNavigate = (target: string) => {
    if (propNavigate) {
      propNavigate(target);
    } else if (navigate) {
      navigate(target);
    }
  };

  // Map view/route to structured hierarchy
  const getHierarchy = (): BreadcrumbItem[] => {
    // 1. If active route defines dynamic breadcrumbs generator
    if (activeRoute?.getBreadcrumbs) {
      const items = activeRoute.getBreadcrumbs(params);
      return items.map((item) => ({
        label: item.label,
        path: item.path,
        view: item.path,
      }));
    }

    // 2. Fallback based on currentView identifier
    switch (currentView) {
      // Visão Geral / Dashboard
      case 'torre-controle':
        return [
          { label: 'Visão Geral' },
          { label: 'Torre de Controle', path: '/dashboard' },
        ];
      case 'dashboard-executivo':
      case 'bi':
        return [
          { label: 'Gestão' },
          { label: 'BI Operacional', path: '/bi' },
        ];
      case 'tv-monitor':
        return [
          { label: 'Visão Geral' },
          { label: 'Monitor TV (Ao Vivo)', path: '/tv-monitor' },
        ];
      case 'radar-comercial':
        return [
          { label: 'Gestão' },
          { label: 'Radar Comercial & BI', path: '/radar-comercial' },
        ];
      case 'sentinela-ai':
      case 'intelligence':
        return [
          { label: 'Gestão' },
          { label: 'Sentinel Intelligence', path: '/intelligence' },
        ];
      case 'central-operacoes':
        return [
          { label: 'Operação' },
          { label: 'Central de Operações', path: '/central-operacoes' },
        ];
      case 'gamificacao':
        return [
          { label: 'Operação' },
          { label: 'Conquistas & Metas', path: '/gamificacao' },
        ];
      case 'relatorio-gargalos':
        return [
          { label: 'Gestão' },
          { label: 'Gargalos & Permanência', path: '/relatorio-gargalos' },
        ];

      // Operação
      case 'home-digitador':
        return [
          { label: 'Operação' },
          { label: 'Minha Produção', path: '/dashboard' },
        ];
      case 'producao':
      case 'propostas':
        return [
          { label: 'Operação' },
          { label: 'Propostas', path: '/propostas' },
        ];
      case 'esteira':
        return [
          { label: 'Operação' },
          { label: 'Esteira Kanban', path: '/esteira' },
        ];
      case 'portabilidades':
      case 'portabilidade':
        return [
          { label: 'Operação' },
          { label: 'Portabilidade (CIP 5 Dias)', path: '/portabilidade' },
        ];
      case 'agenda-operacional':
        return [
          { label: 'Operação' },
          { label: 'Agenda & Tarefas', path: '/agenda-operacional' },
        ];

      // Simulações
      case 'simulacoes':
        return [
          { label: 'Operação' },
          { label: 'Simulações', path: '/simulacoes' },
        ];

      // Central de Pendências
      case 'central-pendencias':
      case 'pendencias':
        return [
          { label: 'Operação' },
          { label: 'Central de Pendências', path: '/central-pendencias' },
        ];

      // Hub de Integrações
      case 'hub-integracoes':
      case 'integracoes':
        return [
          { label: 'Integrações' },
          { label: 'Hub de Integrações', path: '/integracoes' },
        ];

      // Command Center
      case 'command-center':
      case 'command':
        return [
          { label: 'Gestão' },
          { label: 'Sentinel Command Center', path: '/command-center' },
        ];

      // Automações
      case 'central-automacao':
      case 'automacoes':
        return [
          { label: 'Gestão' },
          { label: 'Central de Automações', path: '/automacoes' },
        ];

      // Clientes
      case 'clientes':
      case 'busca-cpf':
      case 'pesquisa-cpf':
        return [
          { label: 'Clientes' },
          { label: 'Clientes 360º & CRM', path: '/clientes' },
        ];

      // Gestão / CRM / Promotoras
      case 'financeiro-geral':
        return [
          { label: 'Gestão' },
          { label: 'Fluxo de Caixa Financeiro', path: '/financeiro-geral' },
        ];
      case 'parceiros':
      case 'crm-parceiros':
        return [
          { label: 'Operação' },
          { label: 'CRM de Parceiros', path: '/crm-parceiros' },
        ];
      case 'promotoras':
      case 'admin-bancos':
      case 'bancos-promotoras':
        return [
          { label: 'Integrações' },
          { label: 'Bancos & Promotoras', path: '/bancos-promotoras' },
        ];
      case 'admin-c6-bank':
      case 'saude-apis':
        return [
          { label: 'Integrações' },
          { label: 'Saúde das APIs', path: '/saude-apis' },
        ];
      case 'suporte':
      case 'sla':
        return [
          { label: 'Gestão' },
          { label: 'Central de Suporte & SLA', path: '/suporte' },
        ];

      // Central de Administração
      case 'central-administracao':
      case 'administracao':
        return [
          { label: 'Administração' },
          { label: 'Central de Administração', path: '/central-administracao' },
        ];
      case 'admin-usuarios':
        return [
          { label: 'Administração' },
          { label: 'Usuários & Perfis', path: '/admin-usuarios' },
        ];
      case 'admin-produtos':
        return [
          { label: 'Administração' },
          { label: 'Produtos & Regras', path: '/admin-produtos' },
        ];
      case 'admin-status':
      case 'admin-import-status':
        return [
          { label: 'Administração' },
          { label: 'Status & Regras', path: '/admin-status' },
        ];
      case 'admin-calendario':
        return [
          { label: 'Administração' },
          { label: 'Feriados & Prazos SLA', path: '/admin-calendario' },
        ];
      case 'admin-auditoria':
        return [
          { label: 'Administração' },
          { label: 'Auditoria & Segurança', path: '/admin-auditoria' },
        ];
      case 'admin-comunicados':
        return [
          { label: 'Administração' },
          { label: 'Comunicados', path: '/admin-comunicados' },
        ];

      // Plataforma SaaS
      case 'saas-tenants':
      case 'empresas-assinaturas':
        return [
          { label: 'Plataforma' },
          { label: 'Empresas & Assinaturas', path: '/empresas-assinaturas' },
        ];
      case 'admin-plano-consumo':
      case 'meu-plano':
        return [
          { label: 'Plataforma' },
          { label: 'Meu Plano & Consumo', path: '/meu-plano' },
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
        onClick={() => handleNavigate('/dashboard')}
        className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer"
        title="Início"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="font-medium">Início</span>
      </button>

      {items.map((item, idx) => {
        const isLast = idx === items.length - 1 && !subItem;
        const target = item.path || item.view;

        return (
          <React.Fragment key={idx}>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            {isLast ? (
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {item.label}
              </span>
            ) : target ? (
              <button
                onClick={() => handleNavigate(target)}
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
