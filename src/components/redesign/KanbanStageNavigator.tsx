import React from 'react';
export function KanbanStageNavigator({ stages, onJump }: { stages: { id: string; name: string; color?: string; count: number }[]; onJump: (id: string) => void }) {
  return <nav className="p2-stage-navigator" aria-label="Etapas da esteira">
    <span className="p2-stage-label">ETAPAS DA OPERAÇÃO</span>
    {stages.map(stage => <button type="button" key={stage.id} aria-label={`${stage.name}: ${stage.count} propostas`} onClick={() => onJump(stage.id)}>
      <i style={{background: stage.color || '#2563eb'}} aria-hidden="true" />
      <span>{stage.name}</span><strong>{stage.count}</strong>
    </button>)}
  </nav>;
}
