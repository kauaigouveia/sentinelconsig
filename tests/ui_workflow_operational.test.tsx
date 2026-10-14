// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../src/services/storageService',()=>({StorageService:{getActiveUser:()=>({role:'MASTER',customPermissions:['tasks.view','proposals.view']})}}));
vi.mock('../src/services/realtimeService',()=>({realtimeHub:{subscribe:()=>()=>{}}}));
import { MyTaskQueueView } from '../src/components/agenda/MyTaskQueueView';
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(async(url,options:any)=>{
  if(String(url)!=='/api/my-work'||(options?.method||'GET')!=='GET')throw new Error('Network forbidden');
  return {ok:true,json:async()=>[{kind:'operational',id:'t1',title:'Tarefa fictícia atrasada',priority:'HIGH',dueDate:'2001-01-01',completed:false,proposal:{id:'p1',proposalNumber:'SAFE'}},{kind:'operational',id:'t2',title:'Tarefa fictícia futura',priority:'LOW',dueDate:'2099-01-01',completed:false}]};
})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('Minha Fila Premium preserva organização e navegação',()=>{
  it('organiza prazos, pesquisa e navega para proposta sem concluir tarefas',async()=>{
    const navigate=vi.fn();render(<MyTaskQueueView onNavigate={navigate} />);
    await screen.findByText('Tarefa fictícia atrasada');
    expect(screen.getByText('Tarefa fictícia futura')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Proposta SAFE'}));
    expect(navigate).toHaveBeenCalledWith('/propostas/p1');
    fireEvent.change(screen.getByLabelText('Buscar tarefas por título, cliente, proposta ou parceiro'),{target:{value:'atrasada'}});
    expect(screen.queryByText('Tarefa fictícia futura')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
