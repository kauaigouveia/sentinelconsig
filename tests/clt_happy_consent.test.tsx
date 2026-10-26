// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HappyCltSimulationModal } from '../src/components/simulation/HappyCltSimulationModal';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('does not fabricate a Dataprev authorization timestamp or call Happy without explicit evidence in the shared journey', () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const ui = render(<HappyCltSimulationModal embedded sharedIdentity isOpen initialData={{ cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999' }} partners={[]} onClose={() => {}} onSuccess={() => {}} />);
  expect((screen.getByLabelText('Data e hora da autorização Dataprev') as HTMLInputElement).value).toBe('');
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.submit(ui.container.querySelector('form')!);
  expect(screen.getByText(/Informe a data\/hora da autorização Dataprev já concedida/)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Data e hora da autorização Dataprev'), { target: { value: '26102026120000' } });
  fireEvent.submit(ui.container.querySelector('form')!);
  expect(fetcher).not.toHaveBeenCalled();
});
