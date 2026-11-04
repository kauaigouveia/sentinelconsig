import React from 'react';
import {
  Keyboard,
  X,
  PlusCircle,
  Search,
  LayoutDashboard,
  Maximize2,
  Database,
  FileSpreadsheet,
  HelpCircle,
  Kanban,
  Sliders,
  Moon,
} from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Navegação' | 'Produção & Ações' | 'Visualização';
  icon: React.ComponentType<{ className?: string }>;
}

const SHORTCUTS: ShortcutItem[] = [
  {
    keys: ['Ctrl', 'N'],
    description: 'Cadastrar nova proposta de produção (ADE)',
    category: 'Produção & Ações',
    icon: PlusCircle,
  },
  {
    keys: ['Ctrl', 'K'],
    description: 'Abrir Command Palette / Busca rápida instantânea',
    category: 'Navegação',
    icon: Search,
  },
  {
    keys: ['Ctrl', 'F'],
    description: 'Focar na barra de busca global de clientes/propostas',
    category: 'Navegação',
    icon: Search,
  },
  {
    keys: ['Ctrl', 'B'],
    description: 'Alternar Modo Foco (oculta barra lateral e cabeçalho)',
    category: 'Visualização',
    icon: Maximize2,
  },
  {
    keys: ['Alt', 'F'],
    description: 'Atalho alternativo para Modo Foco em tabelas',
    category: 'Visualização',
    icon: Maximize2,
  },
  {
    keys: ['Ctrl', 'E'],
    description: 'Ir direto para a Esteira Kanban de Produção',
    category: 'Navegação',
    icon: Kanban,
  },
  {
    keys: ['Ctrl', 'P'],
    description: 'Abrir lista completa de propostas de produção',
    category: 'Navegação',
    icon: FileSpreadsheet,
  },
  {
    keys: ['Ctrl', 'Shift', 'B'],
    description: 'Abrir painel de Backup e Segurança do Banco de Dados',
    category: 'Produção & Ações',
    icon: Database,
  },
  {
    keys: ['Ctrl', 'Shift', 'G'],
    description: 'Abrir Relatório de Gargalos & Tempo Médio por Status',
    category: 'Navegação',
    icon: Sliders,
  },
  {
    keys: ['?'],
    description: 'Exibir este guia de atalhos de teclado',
    category: 'Navegação',
    icon: HelpCircle,
  },
  {
    keys: ['Esc'],
    description: 'Sair do Modo Foco ou fechar modal ativo',
    category: 'Visualização',
    icon: X,
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const categories = ['Produção & Ações', 'Navegação', 'Visualização'] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  border border-[var(--field-border)] dark:border-[var(--field-border)] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] flex items-center justify-center">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Atalhos de Teclado Globais
              </h3>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Otimize seu fluxo diário de trabalho com comandos rápidos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Shortcuts List by Category */}
        <div className="my-4 max-h-[60vh] overflow-y-auto space-y-5 pr-1">
          {categories.map(cat => {
            const items = SHORTCUTS.filter(s => s.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                  {cat}
                </h4>
                <div className="grid grid-cols-1 gap-1.5">
                  {items.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface-elevated)] border border-[var(--field-border)] dark:border-[var(--field-border)] px-3.5 py-2.5 hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]" />
                          <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                            {item.description}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {item.keys.map((k, kIdx) => (
                            <kbd
                              key={kIdx}
                              className="rounded-md border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] shadow-2xs"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--field-border)] dark:border-[var(--field-border)] text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
          <span>Dica: Pressione <kbd className="font-mono font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">?</kbd> a qualquer momento para abrir esta janela.</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--action)] hover:bg-[var(--action-hover)] px-3.5 py-1.5 text-xs font-bold text-[var(--action-ink)] shadow-xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
