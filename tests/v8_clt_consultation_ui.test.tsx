// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { V8CltConsultation } from '../src/components/simulation/V8CltConsultation';
afterEach(cleanup);
const reference = { consultId: 'synthetic-consult', promoterId: 'synthetic-promoter' };
it('shows rejection as ineligibility without describing the consultation as authorized', () => {
  render(<V8CltConsultation row={{ data: { v8: { ...reference, status: 'REJECTED' } } }} selected={false} onSelect={() => {}} />);
  expect(screen.getByText('Cliente não elegível')).toBeTruthy(); expect(screen.queryByText('Consulta autorizada')).toBeNull();
});
it('displays live configurations and raw rates without a guessed percent, and selects only by explicit action', () => {
  const select = vi.fn();
  render(<V8CltConsultation row={{ data: { v8: { ...reference, status: 'SUCCESS', configurations: [{ id: 'synthetic-config', name: 'Tabela sintética', terms: [8, 38, 46], rawMonthlyRate: '0.049800' }] }, margin: { available_balance: 300 } } }} selected={false} onSelect={select} />);
  expect(screen.getByText(/0.049800/).textContent).not.toContain('%'); expect(screen.getByText(/8, 38, 46/)).toBeTruthy(); expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar consulta para acompanhamento' })); expect(select).toHaveBeenCalledOnce();
});
it('clearly describes waiting consent rather than a successful authorization', () => {
  render(<V8CltConsultation row={{ data: { v8: { ...reference, status: 'WAITING_CONSENT' } } }} selected onSelect={() => {}} />);
  expect(screen.getByText('Aguardando autorização da consulta V8')).toBeTruthy(); expect(screen.queryByRole('button', { name: /Aceitar/ })).toBeNull();
});
