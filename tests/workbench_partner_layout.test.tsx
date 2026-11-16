// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({authenticated:true}));
vi.mock('../src/hooks/useTenantBranding', () => ({useTenantBranding: () => ({branding:{companyName:'Empresa Exemplo',status:'PLATFORM_DEFAULT',logoUrl:null}})}));
vi.mock('../src/services/partnerPortalClient', () => ({PartnerPortalClient:{
  getSession: async () => ({authenticated:state.authenticated, access:{id:'access',name:'Parceiro Exemplo'}, partner:{id:'partner',name:'Parceiro Exemplo',code:'DEMO'},tenant:{id:'tenant',name:'Empresa Exemplo'}}), getUnreadCount: async () => 0,
}}));
vi.mock('../src/components/partner-portal/PartnerPortalDashboard', () => ({PartnerPortalDashboard:({onNavigate}:any) => <button onClick={() => onNavigate('propostas',{standardCategory:'PENDENTE'})}>Abrir pendências</button>}));
vi.mock('../src/components/partner-portal/PartnerProposalsView', () => ({PartnerProposalsView:({initialStatusCategory}:any) => <p>Carteira filtrada: {initialStatusCategory || 'todas'}</p>}));
vi.mock('../src/components/partner-portal/PartnerProfileView', () => ({PartnerProfileView:() => <p>Cadastro do parceiro</p>}));
vi.mock('../src/components/partner-portal/PartnerSimulationsView', () => ({PartnerSimulationsView:() => <p>Simulação do parceiro</p>}));
vi.mock('../src/components/partner-portal/PartnerSupportView', () => ({PartnerSupportView:() => <p>Atendimento do parceiro</p>}));
vi.mock('../src/components/partner-portal/PartnerPortalLogin', () => ({PartnerPortalLogin:() => <p>Entrar no portal</p>}));
import { PartnerPortalLayout } from '../src/components/partner-portal/PartnerPortalLayout';
import { ThemeProvider } from '../src/context/ThemeContext';
beforeEach(() => {state.authenticated=true;localStorage.clear();vi.stubGlobal('matchMedia',() => ({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(() => {cleanup();vi.unstubAllGlobals();});
it('navega sem barra lateral e preserva os filtros enviados pelo painel', async () => {
  const {container}=render(<ThemeProvider><PartnerPortalLayout/></ThemeProvider>);
  await screen.findByRole('navigation',{name:'Navegação do parceiro'});
  expect(container.querySelector('aside')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Abrir pendências'}));
  expect(screen.getByText('Carteira filtrada: PENDENTE')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Atendimento'}));
  expect(screen.getByText('Atendimento do parceiro')).toBeTruthy();
});
it('exige a sessão do parceiro antes de exibir as ferramentas', async () => {
  state.authenticated=false;
  render(<ThemeProvider><PartnerPortalLayout/></ThemeProvider>);
  await screen.findByText('Entrar no portal');
  expect(screen.queryByRole('navigation',{name:'Navegação do parceiro'})).toBeNull();
});
