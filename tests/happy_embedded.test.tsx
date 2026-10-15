// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HappyInssSimulationModal } from '../src/components/simulation/HappyInssSimulationModal';
import { HappyCltSimulationModal } from '../src/components/simulation/HappyCltSimulationModal';
import { SimulationFlowSelectorModal } from '../src/components/simulation/SimulationFlowSelectorModal';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each([HappyInssSimulationModal, HappyCltSimulationModal])('reuses the existing Happy flow inline without an overlay or automatic requests', Component => {
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  const { container } = render(<Component embedded isOpen initialData={{ cpf: '52998224725', name: 'Cliente Ficticio', phone: '11999999999' }} partners={[]} onClose={() => {}} onSuccess={() => {}} />);
  expect(container.querySelector('.fixed')).toBeNull();
  expect(screen.getByDisplayValue('Cliente Ficticio')).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('offers common modalities when only Happy is enabled, without a separate Happy INSS launch', () => {
  render(<SimulationFlowSelectorModal isOpen onClose={() => {}} onSelectFlow={() => {}} happySimulationAccessEnabled finantoEnabled={false} nossaFintechEnabled={false} />);
  expect(screen.getByText('INSS Novo')).toBeTruthy();
  expect(document.querySelector('#btn-flow-happy-inss')).toBeNull();
});
