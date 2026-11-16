// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { WorkbenchNavigation } from '../src/components/workbench/WorkbenchNavigation';
afterEach(cleanup);
it('mostra o mapa fora do contêiner estreito da sidebar e oferece máscara de fechamento', () => {
 const {container}=render(<WorkbenchNavigation path="/propostas" role="MASTER" navigate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Todas as telas'}));
 const dialog=screen.getByRole('dialog',{name:'Mapa de telas autorizadas'});
 expect(container.querySelector('#wb-sidebar')?.contains(dialog)).toBe(false);
 expect(dialog.getAttribute('aria-modal')).toBe('true');
 expect(within(dialog).getByText('Encontre sua próxima ação')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Fechar mapa pelo fundo'}));
 expect(screen.queryByRole('dialog',{name:'Mapa de telas autorizadas'})).toBeNull();
});
it('abre o mapa no modo compacto sem exibir simultaneamente o menu móvel',()=>{
 render(<WorkbenchNavigation path="/propostas" role="MASTER" navigate={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Ver todas as telas'}));
 expect(screen.getByRole('dialog',{name:'Mapa de telas autorizadas'})).toBeTruthy();
 expect(screen.getByRole('button',{name:/Menu/i,expanded:false})).toBeTruthy();
});
it('prende o foco no diálogo e devolve foco ao comando com Escape',()=>{
 render(<WorkbenchNavigation path="/propostas" role="MASTER" navigate={vi.fn()}/>);
 const button=screen.getByRole('button',{name:'Todas as telas'});
 fireEvent.click(button);
 const dialog=screen.getByRole('dialog',{name:'Mapa de telas autorizadas'});
 const links=within(dialog).getAllByRole('link');
 links[links.length-1].focus();
 fireEvent.keyDown(document,{key:'Tab'});
 expect(document.activeElement).toBe(within(dialog).getByRole('button',{name:'Fechar mapa de telas'}));
 fireEvent.keyDown(document,{key:'Escape'});
 expect(document.activeElement).toBe(button);
});
it('remove a dependência de viewport na grade de KPI e prioriza a cascata do modal',()=>{
 const css=readFileSync('src/components/workbench/workspace-shell.css','utf8');
 expect(css).toContain('.s4-root.s3-root .wb-system-map {');
 expect(css).toContain('position:fixed; z-index:200');
 expect(css).toContain('container:sentinel-workspace / inline-size');
 expect(css).toContain('@container sentinel-workspace (max-width:670px)');
 expect(css).toContain('.s4-root.s3-root .wb-map-scrim');
});
