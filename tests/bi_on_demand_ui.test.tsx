// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>{
  const names=['fetchOverview','fetchProduction','fetchConversion','fetchBanks','fetchProducts','fetchConvenios','fetchPartners','fetchOperators','fetchPendencies','fetchBottlenecks','fetchCancellations','fetchRefusals','fetchIntegrations','fetchOperationalHealth','fetchComparison','fetchRankings'];
  return Object.fromEntries(names.map(name=>[name,vi.fn().mockResolvedValue(null)]));
});
vi.mock('../src/services/biApiService',()=>({BIApiService:{...mocks,exportBI:vi.fn()}}));
vi.mock('../src/services/realtimeService',()=>({RealtimeService:{getInstance:()=>({subscribe:()=>()=>{}})}}));
vi.mock('../src/components/bi/BIFilterBar',()=>({BIFilterBar:({onFilterChange}:any)=><button type="button" onClick={()=>onFilterChange({period:'7d'})}>Alterar período</button>}));
import {ExecutiveBIDashboard} from '../src/components/bi/ExecutiveBIDashboard';
beforeEach(()=>{vi.useFakeTimers();Object.values(mocks).forEach((mock:any)=>mock.mockClear());});
afterEach(()=>{cleanup();vi.useRealTimers();});
const flush=async()=>{await act(async()=>{await vi.advanceTimersByTimeAsync(300);});};
it('abre a Visão Executiva com 4 consultas e carrega bancos/produtos apenas na visita às abas',async()=>{
 render(<ExecutiveBIDashboard/>);
 await flush();
 for(const name of ['fetchOverview','fetchProduction','fetchComparison','fetchOperationalHealth'])expect(mocks[name]).toHaveBeenCalledTimes(1);
 expect(Object.values(mocks).reduce((count:number,fn:any)=>count+fn.mock.calls.length,0)).toBe(4);
 fireEvent.click(screen.getByRole('button',{name:'Bancos'}));
 await flush();
 expect(mocks.fetchBanks).toHaveBeenCalledTimes(1);
 expect(mocks.fetchPartners).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Produtos & Convênios'}));
 await flush();
 expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
 expect(mocks.fetchConvenios).toHaveBeenCalledTimes(1);
 expect(mocks.fetchRefusals).not.toHaveBeenCalled();
});
it('filtros acionam somente a aba ativa, preservando os outros indicadores sem novos pedidos',async()=>{
 render(<ExecutiveBIDashboard/>);
 await flush();
 fireEvent.click(screen.getByRole('button',{name:'Bancos'}));
 await flush();
 fireEvent.click(screen.getByRole('button',{name:'Alterar período'}));
 await flush();
 expect(mocks.fetchBanks).toHaveBeenCalledTimes(2);
 expect(mocks.fetchOverview).toHaveBeenCalledTimes(1);
 expect(mocks.fetchRankings).not.toHaveBeenCalled();
});
