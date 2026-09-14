import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  PlusCircle,
  FileSpreadsheet,
  Kanban,
  LayoutDashboard,
  Users,
  Database,
  Sliders,
  Moon,
  Sun,
  Maximize2,
  ArrowRight,
  UserCheck,
  Building2,
  Clock,
  ShieldAlert,
  X,
  FileText,
  Calculator,
} from 'lucide-react';
import { StorageService } from '../../services/storageService';
import { formatCpf } from '../../lib/utils';
import { useTheme } from '../../context/ThemeContext';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onOpenNewProduction: () => void;
  onOpenImportExcel: () => void;
  onOpenExport: () => void;
  onOpenBackupModal: () => void;
  onToggleFocusMode: () => void;
  onSelectProposal: (id: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenNewProduction,
  onOpenImportExcel,
  onOpenExport,
  onOpenBackupModal,
  onToggleFocusMode,
  onSelectProposal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toggleTheme, isDark } = useTheme();

  const proposals = useMemo(() => StorageService.getProposals(), [isOpen]);
  const clients = useMemo(() => StorageService.getClients(), [isOpen]);
  const statuses = useMemo(() => StorageService.getStatuses(), [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Actions & Navigation items
  const staticItems = useMemo(() => {
    const activeUser = StorageService.getActiveUser();
    const items = [
      {
        id: 'act-new-prod',
        title: 'Nova Produção (ADE)',
        subtitle: 'Cadastrar nova proposta de crédito consignado',
        category: 'Ações Rápidas',
        icon: PlusCircle,
        shortcut: 'Ctrl+N',
        run: () => onOpenNewProduction(),
      },
      {
        id: 'act-focus-mode',
        title: 'Alternar Modo Foco',
        subtitle: 'Ocultar ou exibir barra lateral e cabeçalho',
        category: 'Ações Rápidas',
        icon: Maximize2,
        shortcut: 'Ctrl+B',
        run: () => onToggleFocusMode(),
      },
      {
        id: 'act-backup',
        title: 'Backup & Segurança do Banco',
        subtitle: 'Exportar, agendar ou restaurar base de dados',
        category: 'Ações Rápidas',
        icon: Database,
        shortcut: 'Ctrl+Shift+B',
        run: () => onOpenBackupModal(),
      },
      {
        id: 'act-theme',
        title: isDark ? 'Ativar Modo Claro' : 'Ativar Modo Escuro',
        subtitle: 'Alternar esquema de cores visual da aplicação',
        category: 'Ações Rápidas',
        icon: isDark ? Sun : Moon,
        run: () => toggleTheme(),
      },
      {
        id: 'act-import',
        title: 'Importar Planilha Excel',
        subtitle: 'Carga em lote de propostas via arquivo .xlsx/.csv',
        category: 'Ações Rápidas',
        icon: FileSpreadsheet,
        run: () => onOpenImportExcel(),
      },
      {
        id: 'act-export',
        title: 'Exportar Propostas',
        subtitle: 'Gerar arquivo formatado com filtros personalizados',
        category: 'Ações Rápidas',
        icon: FileSpreadsheet,
        run: () => onOpenExport(),
      },
      {
        id: 'nav-gargalos',
        title: 'Relatório de Gargalos & Tempo Médio',
        subtitle: 'Análise de SLA e permanência em cada status da esteira',
        category: 'Navegação',
        icon: Sliders,
        run: () => onNavigate('relatorio-gargalos'),
      },
      {
        id: 'nav-torre',
        title: 'Torre de Controle',
        subtitle: 'Dashboard com métricas e contadores de esteira',
        category: 'Navegação',
        icon: LayoutDashboard,
        run: () => onNavigate('torre-controle'),
      },
      {
        id: 'nav-executivo',
        title: 'Dashboard Executivo',
        subtitle: 'Ranking de parceiros e tendência de 30 dias',
        category: 'Navegação',
        icon: LayoutDashboard,
        run: () => onNavigate('dashboard-executivo'),
      },
      {
        id: 'nav-simulacoes',
        title: 'Simulações (Controle de Solicitações)',
        subtitle: 'Acompanhar CPFs enviados por parceiros e conversão automática',
        category: 'Navegação',
        icon: Calculator,
        run: () => onNavigate('simulacoes'),
      },
      {
        id: 'nav-producao',
        title: 'Todas as Propostas (Produção)',
        subtitle: 'Tabela completa de propostas com filtros avançados',
        category: 'Navegação',
        icon: FileSpreadsheet,
        shortcut: 'Ctrl+P',
        run: () => onNavigate('producao'),
      },
      {
        id: 'nav-esteira',
        title: 'Esteira Kanban',
        subtitle: 'Visualização em colunas de status e movimentação',
        category: 'Navegação',
        icon: Kanban,
        shortcut: 'Ctrl+E',
        run: () => onNavigate('esteira'),
      },
      {
        id: 'nav-portabilidades',
        title: 'Portabilidades (Regra 5 Dias)',
        subtitle: 'Acompanhamento do retorno de CIP e saldos',
        category: 'Navegação',
        icon: Clock,
        run: () => onNavigate('portabilidades'),
      },
      {
        id: 'nav-clientes',
        title: 'Clientes 360º',
        subtitle: 'Visão cadastral unificada por CPF',
        category: 'Navegação',
        icon: Users,
        run: () => onNavigate('clientes'),
      },
      {
        id: 'nav-suporte',
        title: 'Central de Suporte & Pendências',
        subtitle: 'Gestão de pendências e alçadas operacionais',
        category: 'Navegação',
        icon: Clock,
        run: () => onNavigate('suporte'),
      },
      {
        id: 'nav-auditoria',
        title: 'Auditoria (AuditLog)',
        subtitle: 'Histórico completo de alterações e segurança',
        category: 'Navegação',
        icon: ShieldAlert,
        run: () => onNavigate('admin-auditoria'),
      },
    ];

    if (activeUser?.role === 'DIGITADOR') {
      return items.filter(item => item.id !== 'nav-simulacoes');
    }
    return items;
  }, [isDark, onNavigate, onOpenNewProduction, onToggleFocusMode, onOpenBackupModal, toggleTheme, onOpenImportExcel, onOpenExport]);

  // Dynamic filter matching
  const matchingItems = useMemo(() => {
    const clean = searchTerm.trim().toLowerCase();

    // 1. Static items
    const filteredStatic = staticItems.filter(
      item =>
        !clean ||
        item.title.toLowerCase().includes(clean) ||
        item.subtitle.toLowerCase().includes(clean) ||
        item.category.toLowerCase().includes(clean)
    );

    if (!clean) {
      return filteredStatic;
    }

    // 2. Proposals matching search term
    const matchedProposals = proposals
      .filter(p => {
        const client = clients.find(c => c.id === p.clientId);
        return (
          p.proposalNumber.toLowerCase().includes(clean) ||
          (client?.fullName && client.fullName.toLowerCase().includes(clean)) ||
          (client?.cpf && client.cpf.includes(clean))
        );
      })
      .slice(0, 5)
      .map(p => {
        const client = clients.find(c => c.id === p.clientId);
        const st = statuses.find(s => s.id === p.statusId);
        return {
          id: `prop-${p.id}`,
          title: `ADE ${p.proposalNumber} — ${client?.fullName || 'Cliente'}`,
          subtitle: `CPF: ${formatCpf(client?.cpf || '')} | Status: ${st?.name || 'Em Andamento'}`,
          category: 'Propostas Encontradas',
          icon: FileText,
          run: () => onSelectProposal(p.id),
        };
      });

    // 3. Clients matching search term
    const matchedClients = clients
      .filter(c => c.fullName.toLowerCase().includes(clean) || c.cpf.includes(clean))
      .slice(0, 3)
      .map(c => ({
        id: `client-${c.id}`,
        title: c.fullName,
        subtitle: `CPF: ${formatCpf(c.cpf)} | Ver histórico completo no Cliente 360`,
        category: 'Clientes Encontrados',
        icon: Users,
        run: () => {
          onNavigate('clientes');
        },
      }));

    return [...matchedProposals, ...matchedClients, ...filteredStatic];
  }, [searchTerm, staticItems, proposals, clients, statuses, onSelectProposal, onNavigate]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < matchingItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : matchingItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = matchingItems[selectedIndex];
      if (current) {
        current.run();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 p-4 pt-[10vh] backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Bar Input */}
        <div className="flex items-center px-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <Search className="h-5 w-5 text-slate-400 dark:text-slate-500 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Digite para buscar ADE, cliente, CPF, telas ou comandos rápidos..."
            className="w-full bg-transparent py-4 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {matchingItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
              Nenhum comando ou registro encontrado para "{searchTerm}".
            </div>
          ) : (
            matchingItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                      {item.category}
                    </span>
                    {(item as any).shortcut && (
                      <kbd className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                        {(item as any).shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <ArrowRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono font-bold">↑↓</kbd> navegar
            </span>
            <span>
              <kbd className="font-mono font-bold">Enter</kbd> selecionar
            </span>
            <span>
              <kbd className="font-mono font-bold">Esc</kbd> fechar
            </span>
          </div>
          <span className="font-semibold text-blue-600 dark:text-blue-400">Evolve Spotlight</span>
        </div>
      </div>
    </div>
  );
};
