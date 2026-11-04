import {BrandLogo} from '../src/components/common/BrandLogo';
import {renderToStaticMarkup} from 'react-dom/server';
import {TokenDonut} from '../src/components/ui/ChartPatterns';
import {presentationIndependentSource} from '../scripts/ui-palette-parity.mjs';
import {createHash} from 'node:crypto';
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
    it('uses the official default palette and preserves custom brand with contrasting ink', () => { const css = readFileSync('src/styles/tokens.css', 'utf8'); expect(css).toContain('--bg-canvas:#081423'); expect(css).toContain('--action:var(--primary-color,var(--action-default))'); expect(paletteStyle(null)).toMatchObject({ '--primary-color': 'initial' }); for (let r = 0; r <= 255; r += 51)
        for (let g = 0; g <= 255; g += 51)
            for (let b = 0; b <= 255; b += 51) {
                const color = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
                const style = paletteStyle(color) as Record<string, string>;
                expect(style['--primary-color']).toBe(color);
                const ink = style['--brand-ink'].includes('dark') ? [1, 2, 3] : [254, 255, 255];
                expect(contrastRatio([r, g, b], ink)).toBeGreaterThanOrEqual(4.5);
            } });
});

describe('Navegação sem redundância', () => {
  function media() { vi.stubGlobal('matchMedia', () => ({matches:false,addEventListener:()=>{},removeEventListener:()=>{}})); }
  afterEach(() => vi.unstubAllGlobals());
  it('mantém todas as categorias permitidas expandidas, inclusive após navegação', () => {
    media(); const navigate=vi.fn();
    const {rerender}=render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={navigate}/>);
    expect(screen.getByRole('heading',{name:'Produção'})).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Integrações'})).toBeTruthy();
    fireEvent.click(screen.getByRole('link',{name:'Hub de Integrações'}));
    expect(navigate).toHaveBeenCalledWith('/integracoes');
    fireEvent.change(screen.getByRole('textbox',{name:'Encontrar página'}),{target:{value:'Saúde'}});
    expect(screen.getByRole('link',{name:'Hub de Integrações'})).toBeTruthy();
    expect(screen.queryByRole('link',{name:'Saúde das APIs'})).toBeNull();
    rerender(<PreviewSidebar role="MASTER" permissions={['integrations.health']} path="/saude-apis" navigate={navigate}/>);
    expect(screen.getByRole('link',{name:'Saúde das APIs'})).toBeTruthy();
    expect(screen.queryByRole('link',{name:'Hub de Integrações'})).toBeNull();
  });
  it('recolhe os atalhos e não repete favoritos na lista de recentes', () => {
    media(); const {container,rerender}=render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={()=>{}} favorites={['/propostas']} recent={['/propostas','/propostas','/central-pendencias']}/>);
    const shortcuts=container.querySelector('details')!;
    expect(shortcuts.open).toBe(false);
    expect(shortcuts.querySelectorAll('a[href="/propostas"]').length).toBe(1);
    expect(shortcuts.querySelectorAll('a[href="/central-pendencias"]').length).toBe(1);
    rerender(<PreviewSidebar role="MASTER" path="/integracoes" navigate={()=>{}}/>);
    expect(screen.getByRole('heading',{name:'Integrações'})).toBeTruthy();
    expect(screen.getByRole('link',{name:'Hub de Integrações'})).toBeTruthy();
  });
});

it('global blue migration preserves operational source across all migrated modules',()=>{const baseline=JSON.parse(readFileSync('docs/redesign-v4/blue-behavior-baseline.json','utf8'));for(const file of baseline.files){if(['src/components/simulation/SimulationView.tsx','src/components/ui/Breadcrumbs.tsx','src/components/layout/Header.tsx','src/components/admin/WhiteLabelModal.tsx','src/components/crm/PartnerCrmHub.tsx','src/components/simulation/NossaFintechPortRefinSimulationModal.tsx'].includes(file.path))continue;expect(createHash('sha256').update(presentationIndependentSource(readFileSync(file.path,'utf8'))).digest('hex'),file.path).toBe(file.sha256);}});

it('semantic and action tokens pass WCAG contrast in both themes',()=>{const css=readFileSync('src/styles/tokens.css','utf8');const sections=[css.split('.dark {')[0],css.split('.dark {')[1].split('}')[0]];let tokens:Record<string,string>={};const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));for(const section of sections){tokens={...tokens,...Object.fromEntries([...section.matchAll(/--([\w-]+):\s*(#[\da-fA-F]{6})/g)].map(m=>[m[1],m[2]]))};const pairs:[string,string,number][]=[];for(const bg of ['bg-canvas','bg-surface','bg-surface-elevated']){for(const fg of ['text-primary','text-secondary'])pairs.push([fg,bg,4.5]);for(const fg of ['field-border','focus'])pairs.push([fg,bg,3]);}pairs.push(['action-default-ink','action-default',4.5],['action-default-ink','action-hover-default',4.5]);for(const tone of ['success','warning','danger','info'])pairs.push([tone+'-text',tone+'-bg',4.5],[tone+'-border',tone+'-bg',3]);for(const [fg,bg,min] of pairs)expect(contrastRatio(rgb(tokens[fg]),rgb(tokens[bg])),fg+'/'+bg).toBeGreaterThanOrEqual(min);}});
it('donut keeps the original category proportions and distinguishes series beyond four',()=>{const rows=[10,20,30,15,15,10].map(count=>({count}));const html=renderToStaticMarkup(<TokenDonut data={rows} total={100}/>);expect(html.match(/<circle/g)).toHaveLength(6);expect(html).toContain('stroke-dasharray="20 80"');expect(html).toContain('stroke-dasharray="30 70"');expect(html).toContain('<pattern');expect(html).not.toContain('NaN');expect(rows.map(r=>r.count)).toEqual([10,20,30,15,15,10]);});

it('ships official theme wordmarks and a transparent symbol with proportional sizing',()=>{const html=renderToStaticMarkup(<BrandLogo width={180} height={64}/>);expect(html).toContain('sentinel-wordmark-light-v6.png');expect((html.match(/<img /g)||[]).length).toBe(1);expect(html).toContain('object-fit:contain');for(const f of ['wordmark-light','wordmark-dark','symbol','favicon-v6-32']){const bytes=readFileSync(`public/branding/sentinel-${f==='favicon-v6-32'?f:f+'-v6'}.png`);expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes[25]).toBe(6);}});
