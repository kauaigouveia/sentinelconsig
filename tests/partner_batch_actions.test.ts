import { describe, it, expect, vi } from 'vitest';
import { runPartnerBatch } from '../src/services/partnerBatchActions';

describe('partner batch actions with mocked HTTP only', () => {
  const targets = [{ id: 'a', name: 'Fictício A', code: 'A' }, { id: 'b', name: 'Fictício B', code: 'B' }];
  it('resets unique selected partners and returns their individual credentials', async () => {
    const request = vi.fn(async (url: string) => new Response(JSON.stringify({ portalAccess: { email: 'test@example.test', temporaryPassword: `fictional-${url}`, portalUrl: 'https://example.test/parceiro' } }), { status: 200 }));
    const progress = vi.fn();
    const rows = await runPartnerBatch('reset', [...targets, targets[0]], progress, request as any);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe('/api/partners/a/portal-access/reset');
    expect(rows.every(row => row.success && row.password)).toBe(true);
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });
  it('deletes only selected IDs and reports partial failures without retrying', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('{"success":true}')).mockResolvedValueOnce(new Response('{"error":"Falha fictícia"}', { status: 500 }));
    const rows = await runPartnerBatch('delete', targets, () => {}, request);
    expect(request.mock.calls[0]).toEqual(['/api/partners/a', { method: 'DELETE', credentials: 'include' }]);
    expect(rows.map(row => row.success)).toEqual([true, false]);
    expect(rows[1].status).toBe('Falha fictícia');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('stops sending mutations when authorization fails', async () => {
    const request = vi.fn(async () => new Response('{"error":"Sem permissão"}', { status: 403 }));
    const rows = await runPartnerBatch('reset', targets, () => {}, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(rows.every(row => !row.success && !row.password)).toBe(true);
  });
  it('does not claim a reset succeeded if the new password was not returned', async () => {
    const rows = await runPartnerBatch('reset', [targets[0]], () => {}, vi.fn(async () => new Response('{}')));
    expect(rows[0].success).toBe(false);
  });
});
