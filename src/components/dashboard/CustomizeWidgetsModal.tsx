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

  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Personalizar Dashboard Executivo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Arraste para reordenar, oculte ou ajuste a largura dos widgets conforme sua preferência
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
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
                    ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs'
                    : 'border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-60'
                } ${draggedIndex === index ? 'ring-2 ring-blue-500 border-blue-500 scale-[1.01]' : ''}`}
              >
                {/* Left: Drag Handle & Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Arrastar para reordenar"
                  >
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {widget.title}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {categoryLabels[widget.category] || widget.category}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                        {widget.colSpan === 2 ? 'Largura Total (100%)' : 'Meia Largura (50%)'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
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
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleMove(index, 'DOWN')}
                    disabled={isLast}
                    title="Mover para baixo"
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>

                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

                  {/* Toggle Width */}
                  <button
                    onClick={() => handleToggleColSpan(widget.id)}
                    title={widget.colSpan === 2 ? 'Mudar para 50% de largura' : 'Mudar para 100% de largura'}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
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
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800'
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
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
          <button
            onClick={onResetToDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restaurar Padrão</span>
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors"
          >
            <Check className="h-4 w-4" />
            <span>Concluir Personalização</span>
          </button>
        </div>
      </div>
    </div>
  );
};
