// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartnerBatchActions } from '../src/components/crm/PartnerBatchActions';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const partners = [{ id: 'a', name: 'Parceiro fictício', code: 'A' }];
describe('partner bulk controls without production requests', () => {
  it('does not render actions without permission', () => {
    const { container } = render(<PartnerBatchActions partners={partners} selected={new Set(['a'])} onSelection={() => {}} canDelete={false} canReset={false} onCompleted={() => {}} />);
    expect(container.textContent).toBe('');
  });
  it('requires explicit confirmation and only deletes the selected target', async () => {
    const request = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    vi.stubGlobal('fetch', request);
    const onCompleted = vi.fn();
    render(<PartnerBatchActions partners={partners} selected={new Set(['a'])} onSelection={() => {}} canDelete canReset={false} onCompleted={onCompleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir selecionados' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); expect(request).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'EXCLUIR' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/api/partners/a', { method: 'DELETE', credentials: 'include' });
    expect(screen.getByRole('status').textContent).toContain('1 concluídos; 0 falhas');
  });
  it('selects only the loaded results', () => {
    const selection = vi.fn();
    render(<PartnerBatchActions partners={partners} selected={new Set()} onSelection={selection} canDelete canReset={false} onCompleted={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(selection).toHaveBeenCalledWith(new Set(['a']));
  });
});
