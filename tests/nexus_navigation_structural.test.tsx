// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {NexusNavigation} from '../src/components/nexus/NexusNavigation';
import {NexusPageContext} from '../src/components/nexus/NexusPageContext';
import {visibleNavigation} from '../src/components/redesign/navigation';
import {readFileSync} from 'node:fs';
afterEach(()=>{cleanup();document.body.style.overflow='';});

it('utiliza navegação mobile inferior e não reutiliza o drawer antigo',()=>{
  const navigate=vi.fn(),search=vi.fn();
  render(<NexusNavigation role="MASTER" path="/simulacoes" navigate={navigate} onSearch={search}/>);
  expect(screen.getByRole('navigation',{name:'Navegação inferior'})).toBeTruthy();
  expect(screen.getByRole('navigation',{name:'Acesso rápido'})).toBeTruthy();
  expect(screen.queryByText('Seu espaço de trabalho')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Buscar no Sentinel'}));
  expect(search).toHaveBeenCalledOnce();
  const bottom=screen.getByRole('navigation',{name:'Navegação inferior'});
  const link=within(bottom).getByRole('link',{name:/Simular crédito/});
  expect(link.getAttribute('aria-current')).toBe('page');
  fireEvent.click(link);
  expect(navigate).toHaveBeenCalledWith('/simulacoes');
});
it('abre painel completo de aplicativos e fecha por Escape',()=>{
  const navigate=vi.fn();
  render(<NexusNavigation role="MASTER" path="/propostas" navigate={navigate} onSearch={()=>{}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Todos os aplicativos'}));
  expect(screen.getByRole('dialog',{name:'Todos os aplicativos'})).toBeTruthy();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('dialog',{name:'Todos os aplicativos'})).toBeNull();
  expect(document.body.style.overflow).toBe('');
});
it('liga cabeçalho de módulo à navegação de aplicativos sem inventar rotas',()=>{
  const navigate=vi.fn();
  render(<>
    <NexusNavigation role="MASTER" path="/propostas" navigate={navigate} onSearch={()=>{}}/>
    <NexusPageContext role="MASTER" path="/propostas" navigate={navigate}
      onApps={()=>window.dispatchEvent(new Event('sentinel:nexus-apps'))}/>
  </>);
  expect(screen.getByRole('heading',{name:'Propostas'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Abrir todos os aplicativos'}));
  expect(screen.getByRole('dialog',{name:'Todos os aplicativos'})).toBeTruthy();
  expect(visibleNavigation('MASTER').some(item=>item.path==='/propostas')).toBe(true);
});
it('mantém permissões como fonte da navegação, sem links de administração indevidos',()=>{
  const items=visibleNavigation('DIGITADOR');
  render(<NexusNavigation role="DIGITADOR" path="/" navigate={()=>{}} onSearch={()=>{}}/>);
  const knownPaths=new Set(items.map(item=>item.path));
  for(const link of screen.getAllByRole('link')){
    const href=link.getAttribute('href');
    if(href && href.startsWith('/'))expect(knownPaths.has(href)).toBe(true);
  }
});
it('troca o AppShell para Nexus somente no workspace e mantém versão clássica',()=>{
  const app=readFileSync('src/App.tsx','utf8');
  const css=readFileSync('src/styles/sentinel-nexus.css','utf8');
  const navigationCss=readFileSync('src/components/nexus/nexus-navigation.css','utf8');
  const preview=readFileSync('src/workspace-preview.tsx','utf8');
  expect(app).toContain('<NexusNavigation');
  expect(app).toContain('<NexusPageContext');
  expect(app).toContain('NexusHome');
  expect(app).toContain('s6-root');
  expect(app).toContain("choice === 'classic'");
  expect(css).toContain('.s6-root.s4-root.s3-root');
  expect(navigationCss).toContain('.nx-mobile-bottom');
  expect(navigationCss).toContain('.nx-launcher');
  expect(navigationCss).toContain('max-width:980px');
  expect(css).toContain('prefers-reduced-motion');
  expect(preview).toContain('<NexusHome');
});
