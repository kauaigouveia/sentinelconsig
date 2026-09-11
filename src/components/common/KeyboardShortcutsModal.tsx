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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Atalhos de Teclado Globais
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Otimize seu fluxo diário de trabalho com comandos rápidos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {cat}
                </h4>
                <div className="grid grid-cols-1 gap-1.5">
                  {items.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 px-3.5 py-2.5 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {item.description}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {item.keys.map((k, kIdx) => (
                            <kbd
                              key={kIdx}
                              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 shadow-2xs"
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
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Dica: Pressione <kbd className="font-mono font-bold text-slate-700 dark:text-slate-300">?</kbd> a qualquer momento para abrir esta janela.</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
