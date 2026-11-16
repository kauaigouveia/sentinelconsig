// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RecordPresentationButtons } from '../src/components/ui/RecordPresentationButtons';
afterEach(cleanup);
it('unifica os controles de visualização sem mudar os callbacks do workbench',()=>{
 const onMode=vi.fn();const {rerender}=render(<RecordPresentationButtons mode="list" onMode={onMode}/>);
 expect(screen.getByRole('button',{name:'Tabela'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Cartões'}));
 expect(onMode).toHaveBeenCalledWith('cards');
 rerender(<RecordPresentationButtons mode="cards" onMode={onMode} variant="standard"/>);
 expect(screen.getByRole('button',{name:'Lista'}).getAttribute('aria-pressed')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:'Lista'}));
 expect(onMode).toHaveBeenCalledWith('list');
});
