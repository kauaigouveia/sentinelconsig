// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import {WorkbenchNavigation} from '../src/components/workbench/WorkbenchNavigation';

beforeEach(()=>window.localStorage.removeItem('sentinel_aurora_sidebar_pinned'));
afterEach(()=>{cleanup();window.localStorage.removeItem('sentinel_aurora_sidebar_pinned');});

describe('Sentinel Aurora v5 — refatoração visual sem alterar permissões',()=>{
  it('importa a camada v5 após a v4 e permite retornar ao shell classic',()=>{
    const app=readFileSync('src/App.tsx','utf8');
    const main=readFileSync('src/main.tsx','utf8');
    expect(app).toContain('s2-root s3-root s4-root');
    expect(app).toContain('s5-root');
    expect(app).toContain("get('ui') === 'classic'");
    expect(main.indexOf("import './styles/sentinel-aurora.css'"))
      .toBeGreaterThan(main.indexOf("import './styles/workbench.css'"));
  });

  it('permite fixar e recolher a barra sem mudar a rota',()=>{
    const navigate=vi.fn();
    render(<WorkbenchNavigation path="/propostas" role="MASTER" navigate={navigate}/>);
    const sidebar=screen.getByRole('region',{name:'Navegação do Sentinel'});
    const button=screen.getByRole('button',{name:'Fixar menu lateral expandido'});
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(sidebar.className).not.toContain('wb-pinned');
    fireEvent.click(button);
    expect(sidebar.className).toContain('wb-pinned');
    expect(screen.getByRole('button',{name:'Recolher menu lateral'}).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('sentinel_aurora_sidebar_pinned')).toBe('true');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Recolher menu lateral'}));
    expect(sidebar.className).not.toContain('wb-pinned');
    expect(window.localStorage.getItem('sentinel_aurora_sidebar_pinned')).toBe('false');
  });

  it('preserva a lista de rotas autorizadas e o mapa acessível',()=>{
    const navigate=vi.fn();
    render(<WorkbenchNavigation path="/propostas" role="MASTER" navigate={navigate}/>);
    const groups=screen.getByRole('navigation',{name:'Áreas do sistema'});
    expect(within(groups).getByRole('link',{name:'Operação'})).toBeTruthy();
    expect(screen.getByRole('navigation',{name:'Ferramentas de Operação'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Todas as telas'}));
    const dialog=screen.getByRole('dialog',{name:'Mapa de telas autorizadas'});
    fireEvent.click(within(dialog).getByRole('link',{name:'Simular crédito'}));
    expect(navigate).toHaveBeenCalledWith('/simulacoes');
  });

  it('preserva menu móvel, Escape e ausência de novas rotas',()=>{
    const navigate=vi.fn();
    render(<WorkbenchNavigation path="/propostas" role="MASTER" navigate={navigate}/>);
    fireEvent.click(screen.getByRole('button',{name:/Menu/i,expanded:false}));
    expect(screen.getByRole('button',{name:/Menu/i,expanded:true})).toBeTruthy();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.getByRole('button',{name:/Menu/i,expanded:false})).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('escopa o design ao workspace, distingue claro/escuro e respeita movimento reduzido',()=>{
    const css=readFileSync('src/styles/sentinel-aurora.css','utf8');
    expect(css).toContain('.s5-root.s4-root.s3-root');
    expect(css).toContain('.dark .s5-root.s4-root.s3-root');
    expect(css).toContain('.wb-navigation:');
    expect(css).toContain('wb-pinned');
    expect(css).toContain('prefers-reduced-motion:reduce');
    expect(css).toContain('max-width:1030px');
    expect(css).toContain('.p2-bi-workspace');
    expect(css).toContain('.p2-intelligence-workspace');
    expect(css).toContain('.operation-card');
    expect(css).toContain('.s3-portal');
    expect(css).toContain('.wb-auth');
    // Nenhuma regra de navegação, financeiro ou dados no arquivo visual.
    expect(css).not.toContain('/api/');
    expect(css).not.toContain('tenantId');
  });
});
