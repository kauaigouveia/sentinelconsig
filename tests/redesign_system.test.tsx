// @vitest-environment jsdom
import React, { useState } from 'react';
import {PreviewSidebar} from '../src/components/redesign/PreviewSidebar';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Button, Input, Tabs, Modal, Table } from '../src/components/ui/DesignSystem';
import { paletteStyle, contrastRatio } from '../src/lib/presentationPalette';
import { readFileSync } from 'node:fs';
afterEach(cleanup);
describe('Design system visual, without APIs', () => {
    it('maintains accessible labels, native validation and callback behavior', () => { const click = vi.fn(); render(<><label>Nome<Input required/></label><Button onClick={click}>Continuar</Button></>); expect((screen.getByLabelText('Nome') as HTMLInputElement).required).toBe(true); fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); expect(click).toHaveBeenCalledTimes(1); });
    it('navigates tabs by keyboard and skips disabled tabs', () => { function Fixture() { const [value, setValue] = useState('a'); return <Tabs label="Áreas" value={value} onChange={setValue} items={[{ id: 'a', label: 'Primeira' }, { id: 'b', label: 'Indisponível', disabled: true }, { id: 'c', label: 'Última' }]}/>; } render(<Fixture />); const first = screen.getByRole('tab', { name: 'Primeira' }); first.focus(); fireEvent.keyDown(first, { key: 'ArrowRight' }); expect(screen.getByRole('tab', { name: 'Última' }).getAttribute('aria-selected')).toBe('true'); expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Última' })); });
    it('closes a dialog on Escape and returns focus to its trigger', () => { function Fixture() { const [open, setOpen] = useState(false); return <><Button onClick={() => setOpen(true)}>Abrir</Button><Modal open={open} title="Revisão" onClose={() => setOpen(false)}><Input aria-label="Detalhe"/></Modal></>; } render(<Fixture />); const trigger = screen.getByRole('button', { name: 'Abrir' }); trigger.focus(); fireEvent.click(trigger); expect(screen.getByRole('dialog', { name: 'Revisão' })).toBeTruthy(); fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger); });
    it('sorts financial rows without mutating source records', () => { const rows = [{ id: 'a', amount: 300 }, { id: 'b', amount: 100 }]; render(<Table caption="Ofertas fictícias" rows={rows} rowKey={row => row.id} columns={[{ key: 'amount', label: 'Valor', render: row => row.amount, compare: (a, b) => a.amount - b.amount }]}/>); fireEvent.click(screen.getByRole('button', { name: /Valor/ })); expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['100', '300']); expect(rows[0].id).toBe('a'); });
    it('uses the official default palette and preserves custom brand with contrasting ink', () => { const css = readFileSync('src/styles/tokens.css', 'utf8'); expect(css).toContain('--bg-canvas:#06141B'); expect(css).toContain('--action:var(--primary-color,var(--action-default))'); expect(paletteStyle(null)).toMatchObject({ '--primary-color': 'initial' }); for (let r = 0; r <= 255; r += 51)
        for (let g = 0; g <= 255; g += 51)
            for (let b = 0; b <= 255; b += 51) {
                const color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
                const style = paletteStyle(color) as Record<string, string>;
                expect(style['--primary-color']).toBe(color);
                const ink = style['--brand-ink'].includes('dark') ? [0, 0, 0] : [255, 255, 255];
                expect(contrastRatio([r, g, b], ink)).toBeGreaterThanOrEqual(4.5);
            } });
});

describe('Navegação sem redundância', () => {
  function media() { vi.stubGlobal('matchMedia', () => ({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})); }
  afterEach(() => vi.unstubAllGlobals());
  it('abre apenas a categoria atual, mantendo integrações acessíveis e busca expansível', () => {
    media(); const navigate=vi.fn();
    render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={navigate}/>);
    expect(screen.getByRole('button',{name:'Produção'}).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button',{name:'Integrações'}).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button',{name:'Integrações'}));
    fireEvent.click(screen.getByRole('link',{name:'Hub de Integrações'}));
    expect(navigate).toHaveBeenCalledWith('/integracoes');
    fireEvent.change(screen.getByRole('textbox',{name:'Encontrar página'}),{target:{value:'Saúde'}});
    expect(screen.getByRole('link',{name:'Saúde das APIs'})).toBeTruthy();
  });
  it('recolhe os atalhos e não repete favoritos na lista de recentes', () => {
    media(); const {container,rerender}=render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={()=>{}} favorites={['/propostas']} recent={['/propostas','/propostas','/central-pendencias']}/>);
    const shortcuts=container.querySelector('details')!;
    expect(shortcuts.open).toBe(false);
    expect(shortcuts.querySelectorAll('a[href="/propostas"]').length).toBe(1);
    expect(shortcuts.querySelectorAll('a[href="/central-pendencias"]').length).toBe(1);
    rerender(<PreviewSidebar role="MASTER" path="/integracoes" navigate={()=>{}}/>);
    expect(screen.getByRole('button',{name:'Integrações'}).getAttribute('aria-expanded')).toBe('true');
  });
});
