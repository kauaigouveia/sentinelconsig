import { describe, expect, it, vi } from 'vitest';
import { PartnerPortalService } from '../server/services/partnerPortalService';

describe('partner responsibility attention — isolated Prisma mock', () => {
  it('counts a custom partner status as attention without changing it', async () => {
    const findMany = vi.fn(async (_query: any) => [{ id: 'example', standardCategory: 'ANDAMENTO', releasedValue: 4889.59, contractValue: 0, status: { code: 'BENEFICIO_BLOQUEADO', responsibleGroup: 'PARCEIRO', standardCategory: 'ANDAMENTO' } }]);
    const result = await PartnerPortalService.getDashboard('partner', 'tenant', { proposal: { findMany } } as any);
    expect(result.metrics.pendingCount).toBe(1);
    expect(result.metrics.inProgressCount).toBe(0);
    expect(result.recentProposals[0].statusCode).toBe('BENEFICIO_BLOQUEADO');
    expect(findMany.mock.calls[0][0].where).toEqual({ partnerId: 'partner', tenantId: 'tenant', deletedAt: null });
  });
  it('includes partner responsibility in the pending filter and keeps tenant scope', async () => {
    const findMany = vi.fn(async (_query: any) => []);
    const count = vi.fn(async () => 0);
    await PartnerPortalService.getProposals('partner', 'tenant', { standardCategory: 'PENDENTE' }, { proposal: { findMany, count } } as any);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ partnerId: 'partner', tenantId: 'tenant', deletedAt: null });
    expect(JSON.stringify(where)).toContain('responsibleGroup');
    expect(JSON.stringify(where)).toContain('PARCEIRO');
  });
});
