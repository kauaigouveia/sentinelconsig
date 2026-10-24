// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { InstitutionalFooter } from '../src/components/layout/InstitutionalFooter';
import { ThemeProvider } from '../src/context/ThemeContext';
import { buildMetadata } from '../scripts/buildMetadata';

const sha = 'a'.repeat(40);
const metadata = { revision: sha, builtAt: '2026-10-24T12:00:00.000Z' };
const footer = (companyName = 'Empresa sintética A', userName = 'Operadora sintética', build = metadata) =>
  <ThemeProvider><InstitutionalFooter companyName={companyName} userName={userName} build={build} /></ThemeProvider>;
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Rodapé institucional autenticado', () => {
  it('shows real revision, build date and current authenticated context', () => {
    render(footer());
    expect(screen.getByText('© 2026 Sentinel Consig.')).toBeTruthy();
    expect(screen.getByText('Build aaaaaaaa')).toBeTruthy();
    expect(screen.getByTitle('Revisão ' + sha)).toBeTruthy();
    expect(screen.getByText('Empresa sintética A')).toBeTruthy();
    expect(screen.getByText('Operadora sintética')).toBeTruthy();
    expect(screen.getByTitle(/Build:/).getAttribute('datetime')).toBe(metadata.builtAt);
  });
  it('does not invent a version or date when metadata is absent or invalid', () => {
    const { rerender } = render(footer('Empresa A', 'Pessoa A', { revision: null as any, builtAt: null as any }));
    expect(screen.queryByText(/Build /)).toBeNull();
    expect(document.querySelector('.institutional-footer-build-date')).toBeNull();
    rerender(footer('Empresa A', 'Pessoa A', { revision: '0.0.0', builtAt: 'invalid' }));
    expect(screen.queryByText(/Build /)).toBeNull();
    expect(document.querySelector('.institutional-footer-build-date')).toBeNull();
  });
  it('reflects company and user changes without loading them again', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { rerender } = render(footer());
    rerender(footer('Empresa sintética B', 'Outro acesso sintético'));
    expect(screen.queryByText('Empresa sintética A')).toBeNull();
    expect(screen.getByText('Empresa sintética B')).toBeTruthy();
    expect(screen.queryByText('Operadora sintética')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('respects the saved theme and toggles through the existing provider', () => {
    localStorage.setItem('evolve_theme', 'dark');
    render(footer());
    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema claro' }));
    expect(localStorage.getItem('evolve_theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    expect(localStorage.getItem('evolve_theme')).toBe('dark');
  });
  it('updates local time without backend calls and cleans up its timer', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { unmount } = render(footer());
    act(() => vi.advanceTimersByTime(60000));
    expect(document.querySelector('.institutional-footer-clock')?.getAttribute('datetime')).toBe('2026-10-24T12:01:00.000Z');
    expect(fetch).not.toHaveBeenCalled();
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('uses the shared authenticated shells, preserves fullscreen and avoids fixed overlays', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const portal = readFileSync('src/components/partner-portal/PartnerPortalLayout.tsx', 'utf8');
    expect(app).toContain("activeUser && !isFocusMode && effectiveView !== 'tv-monitor'");
    expect(app).toContain('<InstitutionalFooter userName={activeUser.name}');
    expect(portal).toContain('<InstitutionalFooter userName={access.name} companyName={tenant.name}');
    expect(app).not.toContain('Atualização em tempo real ativa');
    expect(app.indexOf('<InstitutionalFooter')).toBeGreaterThan(app.indexOf('</main>'));
    expect(portal.indexOf('<InstitutionalFooter')).toBeGreaterThan(portal.indexOf('</main>'));
    const css = readFileSync('src/components/layout/institutional-footer.css', 'utf8');
    expect(css).not.toMatch(/position:\s*(?:fixed|absolute)|z-index/);
    expect(css).toContain('max-width: 640px');
  });
});

describe('Public build metadata allowlist', () => {
  it('uses the actual deployment SHA and actual build timestamp, ignoring secrets', () => {
    const git = vi.fn();
    expect(buildMetadata('build', { VERCEL_GIT_COMMIT_SHA: sha, SECRET_TOKEN: 'never-public' }, git, () => new Date(metadata.builtAt)))
      .toEqual(metadata);
    expect(git).not.toHaveBeenCalled();
  });
  it('marks local modified sources and never substitutes a placeholder version', () => {
    expect(buildMetadata('serve', {}, args => args[0] === 'rev-parse' ? sha : ' M src/App.tsx'))
      .toEqual({ revision: sha + '-dirty', builtAt: null });
    expect(buildMetadata('serve', {}, () => { throw Error('no git'); }))
      .toEqual({ revision: null, builtAt: null });
    expect(buildMetadata('serve', { VERCEL_GIT_COMMIT_SHA: '<invalid>' }, () => 'invalid'))
      .toEqual({ revision: null, builtAt: null });
  });
});
