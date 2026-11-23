import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const slogan = 'Inteligência em cada operação.';
const retired = [
  'Inteligência que antecipa. Controle que transforma.',
  'Veja. Antecipe. Comande.',
  'Mais espaço<br/>para o que importa.',
  'Sua operação, mais próxima.',
];

describe('Sentinel Consig — institutional slogan and separate login experiences', () => {
  it('displays the new slogan in the partner and operational login layout', () => {
    const auth = read('src/components/auth/AuthFrame.tsx');
    expect(auth).toContain('wb-auth--partner');
    expect(auth).toContain('wb-auth--operations');
    expect(auth).toContain('<h2>Inteligência em<br/>cada operação.</h2>');
    expect(auth).toContain('<p>Inteligência em cada operação.<br/>');
    expect(auth).toContain('Acesse seu portal.');
    expect(auth).toContain('Entre no seu espaço.');
    expect(auth).toContain('Simule com confiança');
    expect(auth).toContain('Acompanhe a operação');
  });

  it('keeps partner and employee authentication forms on the shared frame', () => {
    const partner = read('src/components/partner-portal/PartnerPortalLogin.tsx');
    const employee = read('src/components/auth/LoginView.tsx');
    expect(partner).toContain('portal>');
    expect(partner).toContain('PartnerTurnstile');
    expect(employee).toContain('<AuthFrame');
    expect(employee).not.toContain('<PartnerTurnstile');
  });

  it('updates brand identity, metadata and all known institutional old slogan locations', () => {
    const files = [
      'src/components/auth/AuthFrame.tsx',
      'src/lib/branding.ts',
      'index.html',
      'public/manifest.json',
      'public/whitelabel.json',
      'src/services/storageService.ts',
      'src/components/dashboard/ExecutiveDashboard.tsx',
      'src/components/CommandCenter/CommandCenterView.tsx',
      'src/components/intelligence/SentinelIntelligenceDashboard.tsx',
      'src/components/common/ErrorBoundary.tsx',
    ];
    for (const file of files) {
      const content = read(file);
      for (const phrase of retired) expect(content, file).not.toContain(phrase);
      expect(content, file).toContain(slogan.replace(' em cada operação.', ''));
    }
    expect(read('src/lib/branding.ts')).toContain(`tagline: '${slogan}'`);
    expect(read('index.html')).toContain('<title>Sentinel Consig</title>');
    expect(read('index.html')).toContain(slogan);
  });

  it('styles the partner login separately without affecting the employee login', () => {
    const css = read('src/styles/workbench.css');
    expect(css).toContain('.wb-auth--partner .wb-auth-introduction');
    expect(css).not.toContain('.wb-auth--operations .wb-auth-introduction{');
  });
});
