import { describe, expect, it, vi } from 'vitest';
import { proposalProviderVisibility } from '../src/lib/proposalProviders';
import { syncProposalBatch } from '../src/services/proposalBatchSync';
describe('proposal API controls, no live requests', () => {
  it('hides unrelated providers on a FACTA proposal without external links', () => {
    expect(proposalProviderVisibility({} as any, { name: 'FACTA FINANCEIRA', code: '149' })).toEqual({ finanto: false, nossa: false });
    expect(proposalProviderVisibility({ finantoSimulationId: 'fictional' } as any, { name: 'FACTA' })).toEqual({ finanto: true, nossa: false });
    expect(proposalProviderVisibility({} as any, { name: 'Nossa Fintech' })).toEqual({ finanto: false, nossa: true });
  });
  it('routes each unique proposal to its bank API and skips unsupported or unbound records', async () => {
    const banks: any = [{ id: 'facta', code: '149' }, { id: 'c6', code: '336' }, { id: 'bmg', code: '318' }, { id: 'happy', name: 'Happy' }, { id: 'other', code: '999' }];
    const rows: any = banks.map((bank: any) => ({ id: bank.id, proposalNumber: bank.id, bankId: bank.id, promoterId: 'fictional-promoter' }));
    rows.push({ id: 'finanto', proposalNumber: 'F', promoterId: 'other-promoter', finantoSimulationId: 'real-link-fixture' }, { id: 'nossa', proposalNumber: 'N', promoterId: 'other-promoter', nossaFintechDebtKey: 'real-link-fixture' }, { id: 'unbound', proposalNumber: 'U', bankId: 'facta' }, rows[0]);
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response('{"success":true}'));
    const result = await syncProposalBatch(rows, banks, () => {}, request);
    expect(request.mock.calls.map(call => call[0])).toEqual(['/api/proposals/facta/facta-sync', '/api/proposals/c6/c6-sync', '/api/integrations/bmg/proposals/bmg/sync', '/api/proposals/happy/happy-sync', '/api/proposals/finanto/finanto-sync', '/api/proposals/nossa/nossa-fintech-sync']);
    expect(result.filter(row => row.state === 'SKIPPED')).toHaveLength(2);
  });
  it('does not query conflicting provider bindings', async () => {
    const request = vi.fn();
    const result = await syncProposalBatch([{ id: 'a', proposalNumber: 'A', promoterId: 'dg', finantoSimulationId: 'f', nossaFintechDebtKey: 'n' }] as any, [], () => {}, request);
    expect(request).not.toHaveBeenCalled(); expect(result[0].state).toBe('FAILED');
  });
});
