// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SimulationFlowSelectorModal } from '../src/components/simulation/SimulationFlowSelectorModal';

afterEach(cleanup);
it('opens the existing CLT and FGTS flows through their accessible product buttons', () => {
  const select = vi.fn();
  render(<SimulationFlowSelectorModal isOpen onClose={() => {}} onSelectFlow={select} />);
  fireEvent.click(screen.getByRole('button', { name: /Crédito do trabalhador/ }));
  expect(select).toHaveBeenLastCalledWith('CLT_MULTI');
  fireEvent.click(screen.getByRole('button', { name: /Antecipação FGTS/ }));
  expect(select).toHaveBeenLastCalledWith('FGTS_MULTI');
});
