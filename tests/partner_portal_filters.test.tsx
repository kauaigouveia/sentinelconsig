// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const api = vi.hoisted(() => ({ getProposals: vi.fn(async (_args: any) => ({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } })) }));
vi.mock('../src/services/partnerPortalClient', () => ({ PartnerPortalClient: api }));
vi.mock('../src/components/partner-portal/PartnerProposalDetailModal', () => ({ PartnerProposalDetailModal: () => null }));
import { PartnerProposalsView } from '../src/components/partner-portal/PartnerProposalsView';
afterEach(() => { cleanup(); api.getProposals.mockClear(); });
describe('partner portal filters with mocked data only', () => {
  it('keeps dates in one bounded fieldset and avoids an empty third column', async () => {
    const { container } = render(<PartnerProposalsView onOpenChatForProposal={() => {}} />);
    const start = screen.getByLabelText('Data inicial das propostas'); const end = screen.getByLabelText('Data final das propostas');
    expect(start.closest('fieldset')).toBe(end.closest('fieldset'));
    expect(start.className).toContain('min-w-0'); expect(end.className).toContain('w-full');
    expect(container.querySelector('.record-workspace-no-summary')).toBeTruthy();
    fireEvent.change(start, { target: { value: '2026-10-01' } });
    await waitFor(() => expect(api.getProposals).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-10-01' })));
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(screen.getByRole('button', { name: 'Lista' }).getAttribute('aria-pressed')).toBe('true');
  });
});
