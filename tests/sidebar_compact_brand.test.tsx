// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PreviewSidebar } from '../src/components/redesign/PreviewSidebar';
beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}))));
afterEach(() => {cleanup();vi.unstubAllGlobals();});
it('troca a logo completa pelo símbolo ao recolher e restaura ao expandir', () => {
  render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={vi.fn()}/>);
  expect(screen.getByAltText('Sentinel Consig').getAttribute('src')).toContain('wordmark');
  fireEvent.click(screen.getByRole('button', {name: 'Recolher sidebar'}));
  expect(screen.getByAltText('Sentinel Consig').getAttribute('src')).toContain('symbol');
  expect(screen.getByAltText('Sentinel Consig').parentElement?.style.width).toBe('32px');
  fireEvent.click(screen.getByRole('button', {name: 'Expandir sidebar'}));
  expect(screen.getByAltText('Sentinel Consig').getAttribute('src')).toContain('wordmark');
});
it('mantém a logo completa na gaveta de navegação aberta', () => {
  render(<PreviewSidebar role="MASTER" path="/simulacoes" navigate={vi.fn()} mobileOpen closeMobile={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', {name: 'Recolher sidebar'}));
  expect(screen.getByAltText('Sentinel Consig').getAttribute('src')).toContain('wordmark');
});
