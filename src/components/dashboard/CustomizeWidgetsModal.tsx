import React from 'react';
import {
  X,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  Maximize2,
  Minimize2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Check,
  Sparkles,
} from 'lucide-react';
import { ExecutiveWidgetConfig, ExecutiveWidgetId } from '../../types';

interface CustomizeWidgetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: ExecutiveWidgetConfig[];
  onUpdateWidgets: (widgets: ExecutiveWidgetConfig[]) => void;
  onResetToDefault: () => void;
}

export const CustomizeWidgetsModal: React.FC<CustomizeWidgetsModalProps> = ({
  isOpen,
  onClose,
  widgets,
  onUpdateWidgets,
  onResetToDefault,
}) => {
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);

  if (!isOpen) return null;

  const handleToggleVisibility = (id: ExecutiveWidgetId) => {
    const updated = widgets.map(w =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    onUpdateWidgets(updated);
  };

  const handleToggleColSpan = (id: ExecutiveWidgetId) => {
    const updated = widgets.map(w =>
      w.id === id ? { ...w, colSpan: w.colSpan === 1 ? (2 as const) : (1 as const) } : w
    );
    onUpdateWidgets(updated);
  };

  const handleMove = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= widgets.length) return;

    const newWidgets = [...widgets];
    const [moved] = newWidgets.splice(index, 1);
    newWidgets.splice(targetIndex, 0, moved);
    onUpdateWidgets(newWidgets);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newWidgets = [...widgets];
    const [moved] = newWidgets.splice(draggedIndex, 1);
    newWidgets.splice(index, 0, moved);
    setDraggedIndex(index);
    onUpdateWidgets(newWidgets);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const categoryLabels: Record<string, string> = {
    TRENDS: 'Tendências & Produção',
    TEAM: 'Equipe & Gamificação',
    PARTNERS: 'Parceiros & Bancos',
    OPERATIONS: 'Operações & Gargalos',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface)] p-6  space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--field-border)] dark:border-[var(--field-border)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)]">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                Personalizar Dashboard Executivo
              </h3>
              <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                Arraste para reordenar, oculte ou ajuste a largura dos widgets conforme sua preferência
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] hover:text-[var(--text-secondary)] dark:hover:bg-[var(--bg-surface-elevated)] dark:hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Widgets List */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {widgets.map((widget, index) => {
            const isFirst = index === 0;
            const isLast = index === widgets.length - 1;

            return (
              <div
                key={widget.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={e => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  widget.enabled
                    ? 'border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-surface)] dark:bg-[var(--bg-surface-elevated)] shadow-2xs'
                    : 'border-dashed border-[var(--field-border)] dark:border-[var(--field-border)] bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] opacity-60'
                } ${draggedIndex === index ? 'ring-2 ring-[var(--focus)] border-[var(--field-border)] scale-[1.01]' : ''}`}
              >
                {/* Left: Drag Handle & Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="cursor-grab active:cursor-grabbing p-1 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)]"
                    title="Arrastar para reordenar"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] truncate">
                        {widget.title}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                        {categoryLabels[widget.category] || widget.category}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--info-bg)] dark:bg-[var(--info-bg)] text-[var(--link)] dark:text-[var(--link)] border border-[var(--field-border)] dark:border-[var(--field-border)]">
                        {widget.colSpan === 2 ? 'Largura Total (100%)' : 'Meia Largura (50%)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] dark:text-[var(--text-secondary)] truncate mt-0.5">
                      {widget.description}
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  {/* Move Up/Down buttons */}
                  <button
                    onClick={() => handleMove(index, 'UP')}
                    disabled={isFirst}
                    title="Mover para cima"
                    className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 disabled:hover:bg-transparent"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(index, 'DOWN')}
                    disabled={isLast}
                    title="Mover para baixo"
                    className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] disabled:opacity-90 disabled:hover:bg-transparent"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>

                  <div className="h-4 w-px bg-[var(--bg-surface-elevated)] dark:bg-[var(--bg-surface-elevated)] mx-1" />

                  {/* Toggle Width */}
                  <button
                    onClick={() => handleToggleColSpan(widget.id)}
                    title={widget.colSpan === 2 ? 'Mudar para 50% de largura' : 'Mudar para 100% de largura'}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-[var(--field-border)] dark:border-[var(--field-border)] hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
                  >
                    {widget.colSpan === 2 ? (
                      <>
                        <Minimize2 className="h-3 w-3" />
                        <span className="text-[11px]">50%</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-3 w-3" />
                        <span className="text-[11px]">100%</span>
                      </>
                    )}
                  </button>

                  {/* Toggle Visibility */}
                  <button
                    onClick={() => handleToggleVisibility(widget.id)}
                    title={widget.enabled ? 'Ocultar widget' : 'Exibir widget'}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      widget.enabled
                        ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)] dark:border-[var(--success-border)] dark:bg-[var(--success-bg)] dark:text-[var(--success-text)]'
                        : 'border-[var(--field-border)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] dark:border-[var(--field-border)] dark:bg-[var(--bg-surface-elevated)]'
                    }`}
                  >
                    {widget.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--field-border)] dark:border-[var(--field-border)] pt-4">
          <button
            onClick={onResetToDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-secondary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface-elevated)] dark:hover:bg-[var(--bg-surface-elevated)] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restaurar Padrão</span>
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[var(--action-ink)] bg-[var(--action)] hover:bg-[var(--action-hover)] rounded-xl  transition-colors"
          >
            <Check className="h-4 w-4" />
            <span>Concluir Personalização</span>
          </button>
        </div>
      </div>
    </div>
  );
};
