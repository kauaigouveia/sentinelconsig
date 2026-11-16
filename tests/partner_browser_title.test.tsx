// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { browserBrandTitle } from '../src/lib/branding';
import { useTenantBranding } from '../src/hooks/useTenantBranding';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

it('keeps the product title when asynchronous tenant branding loads in the partner portal', async () => {
  window.history.replaceState({}, '', '/parceiro');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'ACTIVE',domainType:'PLATFORM_DEFAULT',companyName:'Evolve Promotora'})}));
  function Branding() { useTenantBranding(); return null; }
  render(<Branding/>);
  await waitFor(() => expect(document.title).toBe('Sentinel Consig | Portal do parceiro'));
});

it('uses the portal title for nested routes and preserves company titles elsewhere', () => {
  expect(browserBrandTitle('/parceiro/propostas', 'Evolve Promotora')).toBe('Sentinel Consig | Portal do parceiro');
  expect(browserBrandTitle('/propostas', 'Empresa de teste')).toBe('Empresa de teste | Sentinel Consig');
  expect(browserBrandTitle('/parceiros', 'Empresa de teste')).toBe('Empresa de teste | Sentinel Consig');
});
