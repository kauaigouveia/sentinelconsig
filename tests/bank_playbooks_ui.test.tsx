// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BankPlaybooksPanel } from '../src/components/simulation/BankPlaybooksPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('shows sourced alternatives without any bank calls and queries the isolated partner AI endpoint', async () => {
 const mock = vi.fn(async (_url: string) => new Response(JSON.stringify({ answer: 'Conforme roteiro FACTA versão junho/2026.' })));
 vi.stubGlobal('fetch', mock);
 render(<BankPlaybooksPanel portal input={{ birthDate: '1960-01-01', species: '41', operation: 'NEW', term: 108, state: 'PI' }} />);
 expect(mock).not.toHaveBeenCalled();
 expect(screen.getByText('FACTA Financeira')).toBeTruthy();
 expect(screen.getAllByText(/Possibilidade a conferir/).length).toBeGreaterThan(0);
 fireEvent.change(screen.getByLabelText('Pesquisar nos roteiros'), { target: { value: 'FACTA Piauí' } });
 expect(fireEvent.keyDown(screen.getByLabelText('Pesquisar nos roteiros'), { key: 'Enter', code: 'Enter' })).toBe(false);
 await screen.findByText('Conforme roteiro FACTA versão junho/2026.');
 expect(mock.mock.calls[0][0]).toBe('/api/partner-portal/bank-playbooks/query');
});
