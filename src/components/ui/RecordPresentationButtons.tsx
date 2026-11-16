import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import type { RecordPresentation } from './RecordWorkspace';

interface Props {
  mode: RecordPresentation;
  onMode: (value: RecordPresentation) => void;
  variant?: 'standard' | 'workbench';
}
/** Shared view switch for Simulações, Propostas and legacy record workspaces. */
export function RecordPresentationButtons({ mode, onMode, variant = 'workbench' }: Props) {
  const cls = variant === 'workbench' ? 's2-button' : undefined;
  return <>
    {variant === 'standard' ? <>
      <button type="button" aria-pressed={mode === 'cards'} onClick={() => onMode('cards')}><LayoutGrid size={15} />Cartões</button>
      <button type="button" aria-pressed={mode === 'list'} onClick={() => onMode('list')}><List size={15} />Lista</button>
    </> : <>
      <button type="button" className={cls} aria-pressed={mode === 'list'} onClick={() => onMode('list')}><List size={15} />Tabela</button>
      <button type="button" className={cls} aria-pressed={mode === 'cards'} onClick={() => onMode('cards')}><LayoutGrid size={15} />Cartões</button>
    </>}
  </>;
}
