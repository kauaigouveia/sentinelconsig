// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../src/components/admin/automations/AutomationVisualBuilder',()=>({AutomationVisualBuilder:({onCancel}:any)=><button onClick={onCancel}>Cancelar construtor local</button>}));
vi.mock('../src/components/admin/automations/AutomationTestModal',()=>({AutomationTestModal:()=>null}));
vi.mock('../src/components/admin/automations/AutomationExecutionTimelineModal',()=>({AutomationExecutionTimelineModal:()=>null}));
import { CentralAutomacoes } from '../src/components/admin/CentralAutomacoes';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if(!String(url).startsWith('/api/automations')||(options?.method||'GET')!=='GET')throw new Error('Network forbidden');
  return {ok:true,json:async()=>String(url).endsWith('/catalog')?{triggers:[],actions:[],operators:[]}:String(url).endsWith('/metrics')?null:[]};
})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Automações Premium sem execução ou gravação',()=>{
  it('preserva quatro áreas e abertura/cancelamento do builder',async()=>{
    render(<CentralAutomacoes />);
    await screen.findByRole('button',{name:'Nova Automação'});
    expect(screen.getByRole('button',{name:/Regras de Automação/})).toBeTruthy();
    expect(screen.getByRole('button',{name:/Histórico/})).toBeTruthy();
    expect(screen.getByRole('button',{name:/Métricas & Desempenho/})).toBeTruthy();
    expect(screen.getByRole('button',{name:/Biblioteca de Modelos/})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Nova Automação'}));
    fireEvent.click(screen.getByRole('button',{name:'Cancelar construtor local'}));
    expect(screen.queryByRole('button',{name:'Cancelar construtor local'})).toBeNull();
    expect(vi.mocked(fetch).mock.calls.every(([,options])=>!options?.method||options.method==='GET')).toBe(true);
  });
});
