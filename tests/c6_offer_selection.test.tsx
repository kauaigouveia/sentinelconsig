// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { C6SimulationResults, c6SelectedCondition } from '../src/components/simulation/C6SimulationResults';
import { inssSimulationDraft } from '../server/services/inssSimulationDraft';
import type { SimulationRequest } from '../src/types';
afterEach(cleanup);
const offer = { id: 'c6-demo-0001-108', name: 'Tabela C6 fictícia', amount: 22044.97, contractAmount: 23000, installment: 500, term: 108, rate: 1.85 };
it('selects the exact C6 offer and preserves its bank values in the existing draft', () => {
  function Workspace() { const [selected, setSelected] = useState<SimulationRequest['selectedCondition']>(); return <><C6SimulationResults offers={[offer]} selected={selected} onSelect={setSelected} /><output>{selected ? JSON.stringify(inssSimulationDraft({ operationType: 'NEW', customerData: { birthDate: '1980-01-01', benefitNumber: '0000000001', benefitType: 41 }, selectedCondition: selected }).selectedCondition) : ''}</output></>; }
  render(<Workspace />); fireEvent.click(screen.getByRole('button', { name: 'Selecionar oferta' }));
  expect(screen.getByRole('button', { name: 'Oferta selecionada' }).getAttribute('aria-pressed')).toBe('true');
  expect(JSON.parse(screen.getByRole('status').textContent || '{}')).toMatchObject({ provider: 'C6', tableId: offer.id, amount: 22044.97, installment: 500, term: 108, rate: 1.85 });
});
it('does not mark another offer selected when the bank repeats an identifier', () => {
  render(<C6SimulationResults offers={[offer, { ...offer, amount: 21627.63 }]} selected={c6SelectedCondition(offer)!} onSelect={() => {}} />);
  expect(screen.getAllByRole('button', { name: 'Oferta selecionada' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Selecionar oferta' }).getAttribute('aria-pressed')).toBe('false');
});
it('blocks invalid amounts and preserves the spreadsheet-only portability restriction', () => {
  expect(c6SelectedCondition({ ...offer, amount: -1 })).toBeNull(); expect(c6SelectedCondition({ ...offer, installment: NaN })).toBeNull();
  render(<C6SimulationResults offers={[{ ...offer, amount: 0 }]} onSelect={() => {}} />);
  expect((screen.getByRole('button', { name: 'Selecionar oferta' }) as HTMLButtonElement).disabled).toBe(true);
  const body = { customerData: { birthDate: '1980-01-01', benefitNumber: '0000000001', benefitType: 41 }, selectedCondition: c6SelectedCondition(offer) };
  expect(inssSimulationDraft({ ...body, operationType: 'REFIN' }).selectedCondition.provider).toBe('C6');
  expect(() => inssSimulationDraft({ ...body, operationType: 'PORT_REFIN' })).toThrow('planilha');
});
