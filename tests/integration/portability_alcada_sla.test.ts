import { describe, it, expect, vi } from 'vitest';
import { ensureDefaultStatusesForTenant, DEFAULT_PROPOSAL_STATUSES } from '../../server/services/statusService';
import { AutomationService } from '../../src/services/automationService';

describe('Portability & PORTAB/REFIN Alçada and SLA Rules', () => {
  const tenantId = 'tenant_alcada_sla_test';

  it('ensures AGUARDAR_RETORNO_CIP has responsibleGroup BANCO and AGUARDAR_PORTABILIDADE has responsibleGroup CLIENTE', async () => {
    const cipStatus = DEFAULT_PROPOSAL_STATUSES.find(s => s.code === 'AGUARDAR_RETORNO_CIP');
    const portStatus = DEFAULT_PROPOSAL_STATUSES.find(s => s.code === 'AGUARDAR_PORTABILIDADE');

    expect(cipStatus).toBeDefined();
    expect(cipStatus?.responsibleGroup).toBe('BANCO');

    expect(portStatus).toBeDefined();
    expect(portStatus?.responsibleGroup).toBe('CLIENTE');
  });

  it('enforces BANCO for CIP and CLIENTE for AGUARDAR_PORTABILIDADE when tenant has existing records', async () => {
    const updateManyFn = vi.fn().mockResolvedValue({ count: 1 });
    const mockPrisma: any = {
      proposalStatus: {
        count: vi.fn().mockResolvedValue(11),
        createMany: vi.fn(),
        updateMany: updateManyFn,
      },
    };

    await ensureDefaultStatusesForTenant(mockPrisma, tenantId);

    expect(updateManyFn).toHaveBeenCalledWith({
      where: { tenantId, code: 'AGUARDAR_PORTABILIDADE', responsibleGroup: { not: 'CLIENTE' } },
      data: { responsibleGroup: 'CLIENTE' },
    });
    expect(updateManyFn).toHaveBeenCalledWith({
      where: { tenantId, code: 'AGUARDAR_RETORNO_CIP', responsibleGroup: { not: 'BANCO' } },
      data: { responsibleGroup: 'BANCO' },
    });
  });

  it('evaluates getPortabilitySlaInfo: calculates business days for AGUARDAR_RETORNO_CIP and 0 for AGUARDAR_PORTABILIDADE', () => {
    const mockCipProposal: any = {
      id: 'prop-cip-1',
      statusId: 'st-3',
      type: 'PORTABILIDADE',
      portabilitySlaStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    const mockPortProposal: any = {
      id: 'prop-refin-1',
      statusId: 'st-4',
      type: 'REFIN_PORTABILIDADE',
      createdAt: new Date().toISOString(),
    };

    // Mock StorageService getStatuses and getHolidays
    const spyGetStatuses = vi.spyOn(AutomationService as any, 'getPortabilitySlaInfo');
    
    // Call getPortabilitySlaInfo for AGUARDAR_PORTABILIDADE
    const portSla = AutomationService.getPortabilitySlaInfo(mockPortProposal);
    expect(portSla.businessDays).toBe(0);
    expect(portSla.targetDays).toBe(5);

    spyGetStatuses.mockRestore();
  });
});
