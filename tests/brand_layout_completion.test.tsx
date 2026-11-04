// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {readFileSync} from 'node:fs';
vi.mock('../src/router',()=>({useRouter:()=>({activeRoute:{getBreadcrumbs:()=>[{label:'Início',path:'/'},{label:'Operação'},{label:'Simulações',path:'/simulacoes'}]}})}));
import {Breadcrumbs} from '../src/components/ui/Breadcrumbs';
import {PreviewSidebar} from '../src/components/redesign/PreviewSidebar';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows home only once and keeps its navigation',()=>{const navigate=vi.fn();render(<Breadcrumbs currentView="simulacoes" onNavigate={navigate}/>);expect(screen.getAllByText('Início')).toHaveLength(1);expect(screen.getByText('Simulações')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Início'}));expect(navigate).toHaveBeenCalledWith('/dashboard');});
it('keeps tenant logo and tenant name instead of the Sentinel wordmark',()=>{vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));const {container}=render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={()=>{}} brandName="Empresa sintética" brandLogo="/synthetic-brand.png"/>);expect(container.querySelector('img')?.getAttribute('src')).toBe('/synthetic-brand.png');expect(screen.getByText('Empresa sintética')).toBeTruthy();expect(container.querySelector('.sentinel-logo')).toBeNull();});
it('uses one control height for header alignment and larger mobile targets',()=>{const css=readFileSync('src/styles/tokens.css','utf8');expect(css).toContain('--header-control-height:36px');expect(css).toContain('--header-control-height:44px');const header=readFileSync('src/components/layout/Header.tsx','utf8');expect(header).toContain('h-[var(--header-control-height)]');});
