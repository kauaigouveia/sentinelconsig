import { describe, it, expect, vi } from 'vitest';
import { ensureDefaultStatusesForTenant, DEFAULT_PROPOSAL_STATUSES } from '../../server/services/statusService.js';

describe('Official Proposal Status Loading & Auto-Seeding Tests', () => {
  const tenantId = 'tenant_status_test_123';

  it('auto-seeds 11 default proposal statuses when database table is empty for tenant', async () => {
    let mockCount = 0;
    let createdRecords: any[] = [];

    const mockPrisma: any = {
      proposalStatus: {
        count: vi.fn().mockImplementation(async () => mockCount),
        createMany: vi.fn().mockImplementation(async (params: { data: any[] }) => {
          createdRecords = params.data;
          mockCount = params.data.length;
          return { count: params.data.length };
        }),
      },
    };

    await ensureDefaultStatusesForTenant(mockPrisma, tenantId);

    expect(mockPrisma.proposalStatus.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mockPrisma.proposalStatus.createMany).toHaveBeenCalledTimes(1);
    expect(createdRecords.length).toBe(11);
    expect(createdRecords[0].code).toBe('AGUARDAR_FORMALIZACAO');
    expect(createdRecords[0].tenantId).toBe(tenantId);
  });

  it('does not duplicate statuses if tenant already has status records', async () => {
    const mockPrisma: any = {
      proposalStatus: {
        count: vi.fn().mockResolvedValue(11),
        createMany: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await ensureDefaultStatusesForTenant(mockPrisma, tenantId);

    expect(mockPrisma.proposalStatus.count).toHaveBeenCalledWith({ where: { tenantId } });
    expect(mockPrisma.proposalStatus.createMany).not.toHaveBeenCalled();
  });

  it('verifies DEFAULT_PROPOSAL_STATUSES structure contains mandatory fields for PostgreSQL', () => {
    expect(DEFAULT_PROPOSAL_STATUSES.length).toBe(11);

    for (const status of DEFAULT_PROPOSAL_STATUSES) {
      expect(status).toHaveProperty('name');
      expect(status).toHaveProperty('code');
      expect(status).toHaveProperty('color');
      expect(status).toHaveProperty('standardCategory');
      expect(status).toHaveProperty('slaHours');
      expect(status).toHaveProperty('order');
      expect(status).toHaveProperty('active', true);
    }
  });
});
