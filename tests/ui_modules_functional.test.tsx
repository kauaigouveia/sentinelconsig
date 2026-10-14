// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { inspectModule } from '../scripts/ui-module-manifest.mjs';
import { RecordWorkspace } from '../src/components/ui/RecordWorkspace';
afterEach(cleanup);
const baseline = JSON.parse(readFileSync('docs/ui-redesign/modules-functional-baseline.json','utf8'));
describe('Paridade local dos módulos operacionais', () => {
  it.each(baseline.modules)('$path preserva todos os controles e bindings', (module: any) => {
    const current = inspectModule(module.path);
    for (const control of module.controls) expect(current.controls.some(item => item.tag === control.tag && control.attrs.every((attr: string) => item.attrs.includes(attr)))).toBe(true);
  });
  it.each(baseline.modules)('$path preserva as expressões operacionais', (module: any) => {
    const current = inspectModule(module.path);
    for (const [name,values] of Object.entries(module.expressions)) expect(current.expressions[name]).toEqual(values);
  });
});
describe('Workspace Premium reutiliza conteúdo operacional', () => {
  it('mantém filtro montado e seu valor ao recolher, chama os handlers existentes', () => {
    const mode = vi.fn(), action = vi.fn();
    render(<RecordWorkspace premium count={3} mode="list" onMode={mode} filters={<input aria-label="Filtro de teste" defaultValue="original" />} summary={<span>Resumo da fonte</span>}><button onClick={action}>Ação existente</button></RecordWorkspace>);
    fireEvent.change(screen.getByLabelText('Filtro de teste'), {target:{value:'mantido'}});
    fireEvent.click(screen.getByRole('button',{name:'Filtros'}));
    expect((screen.getByLabelText('Filtro de teste') as HTMLInputElement).value).toBe('mantido');
    fireEvent.click(screen.getByRole('button',{name:'Filtros'}));
    fireEvent.click(screen.getByRole('button',{name:'Cartões'}));
    expect(mode).toHaveBeenCalledWith('cards');
    fireEvent.click(screen.getByRole('button',{name:'Ação existente'}));
    expect(action).toHaveBeenCalledOnce();
    expect(screen.getByText('Resumo da fonte')).toBeTruthy();
  });
  it('legado continua padrão', () => {
    const {container} = render(<RecordWorkspace count={0} mode="cards" onMode={()=>{}} filters={<span>Filtro original</span>}><span>Conteúdo original</span></RecordWorkspace>);
    expect(container.querySelector('.record-workspace')).toBeTruthy();
    expect(container.querySelector('.p2-operational-workspace')).toBeNull();
  });
});
