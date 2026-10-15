// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CurrencyInput } from '../src/components/common/CurrencyInput';
import { normalizeBrlInput, formatBrlInput } from '../src/lib/brlInput';
afterEach(cleanup);
function Form() { const [value, setValue] = useState(''); return <><label>Saldo<CurrencyInput required min={0.01} value={value} onValueChange={setValue} /></label><output>{JSON.stringify({ balance: Number(value) })}</output></>; }
describe('BRL monetary input', () => {
  it.each([['24.188,18', '24188.18'], ['R$ 24.188,18', '24188.18'], ['10.000,00', '10000'], ['10.000', '10000'], ['24188.18', '24188.18'], ['68,42', '68.42'], ['0,01', '0.01'], ['', ''], ['24.18818', null], ['1,2,3', null]])('normalizes %s without changing magnitude', (input, expected) => expect(normalizeBrlInput(input)).toBe(expected));
  it('formats the numeric API value using Brazilian separators', () => { expect(formatBrlInput('24188.18')).toBe('24.188,18'); expect(formatBrlInput('10000')).toBe('10.000,00'); });
  it('pastes BRL and sends the exact numeric amount to the existing form', () => {
    render(<Form />); const input = screen.getByLabelText('Saldo') as HTMLInputElement;
    fireEvent.paste(input, { clipboardData: { getData: () => 'R$ 24.188,18' } });
    expect(input.value).toBe('24.188,18'); expect(screen.getByRole('status').textContent).toBe('{"balance":24188.18}');
    expect(input.validity.valid).toBe(true);
  });
  it('preserves decimal typing, formats on blur and supports clearing', () => {
    render(<Form />); const input = screen.getByLabelText('Saldo') as HTMLInputElement;
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '10000,5' } }); fireEvent.blur(input);
    expect(input.value).toBe('10.000,50'); expect(screen.getByRole('status').textContent).toBe('{"balance":10000.5}');
    fireEvent.change(input, { target: { value: '' } }); expect(input.value).toBe(''); expect(input.validity.valueMissing).toBe(true);
  });
  it('does not submit malformed or negative values when a minimum is required', () => {
    render(<Form />); const input = screen.getByLabelText('Saldo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '24.18818' } }); expect(input.validity.valid).toBe(false);
    fireEvent.change(input, { target: { value: '-1,00' } }); expect(input.validity.valid).toBe(false);
  });
});
