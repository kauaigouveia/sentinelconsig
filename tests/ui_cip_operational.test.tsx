// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const mocks=vi.hoisted(()=>({cron:vi.fn()}));
vi.mock('../src/services/storageService',()=>({StorageService:{
  getProposals:()=>[1,2].map(n=>({id:`p${n}`,proposalNumber:`SAFE-${n}`,type:'PORTABILIDADE',clientId:'c1',statusId:'s1',contractBalance:100,disbursedValue:20,createdAt:'2026-10-14T12:00:00Z'})),
  getClients:()=>[{id:'c1',fullName:'Cliente fictício',cpf:'00000000000'}],getProducts:()=>[],getBanks:()=>[],getPromoters:()=>[],getPartners:()=>[],getHolidays:()=>[],getConfig:()=>({}),getStatuses:()=>[{id:'s1',code:'AGUARDAR_RETORNO_CIP',name:'Aguardando CIP'}],
}}));
vi.mock('../src/services/automationService',()=>({AutomationService:{runPortabilityCron:mocks.cron,getPortabilitySlaInfo:(p:any)=>({businessDays:p.id==='p1'?1:7,targetDays:5,statusBadge:p.id==='p1'?'NO PRAZO':'ESTOURADO',progressPercent:20})}}));
vi.mock('../src/components/production/ProposalDetailModal',()=>({ProposalDetailModal:({proposalId}:any)=><div data-testid="detail">{proposalId}</div>}));
import { PortabilityView } from '../src/components/production/PortabilityView';
beforeEach(()=>{mocks.cron.mockClear();vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new Error('Network forbidden'))));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('CIP Premium preserva as filas, sem consultar retornos reais',()=>{
  it('mantém cinco filas, nove campos e abre detalhe sem executar cron',()=>{
    render(<PortabilityView premium />);
    const nav=screen.getByRole('navigation',{name:'Filas de portabilidade'});
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
    fireEvent.click(within(nav).getByRole('button',{name:/Atrasadas/}));
    expect(screen.queryByText('ADE SAFE-1')).toBeNull();expect(screen.getByText('ADE SAFE-2')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Ver detalhes'));
    expect(screen.getByTestId('detail').textContent).toBe('p2');
    expect(mocks.cron).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it('legado mantém os controles atuais',()=>{
    const {container}=render(<PortabilityView />);
    expect(container.querySelector('.p2-live-cip')).toBeNull();
    expect(screen.getByRole('button',{name:'Consultar Retornos de Saldo CIP'})).toBeTruthy();
    expect(mocks.cron).not.toHaveBeenCalled();
  });
});
