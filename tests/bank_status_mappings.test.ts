import { describe, expect, it, vi } from 'vitest';
import { resolveMappedBankStatus, saveBankStatusMappings, updateMappedProviderProposal } from '../server/services/bankStatusMappings';
function fixture() {
  const configs = new Map<string, any>();
  const statuses = [{ id: 'stage-a', tenantId: 'a', name: 'Status customizado', code: 'CUSTOM', active: true, automaticChangeAllowed: true, standardCategory: 'ESTEIRA' }, { id: 'stage-b', tenantId: 'b', name: 'Outra empresa', active: true, automaticChangeAllowed: true }, { id: 'manual', tenantId: 'a', active: true, automaticChangeAllowed: false }];
  const prisma: any = {
    promoter: { findMany: vi.fn(async ({ where }) => where.tenantId === 'a' && ['dg', 'prospecta'].includes(where.id) ? [{ id: where.id, name: where.id }] : []) },
    systemConfig: { findUnique: vi.fn(async ({ where }) => configs.get(JSON.stringify(where.tenantId_configKey)) || null), upsert: vi.fn(async ({ where, create }) => { configs.set(JSON.stringify(where.tenantId_configKey), create); return create; }) },
    proposalStatus: {
      findMany: vi.fn(async ({ where }) => statuses.filter(row => row.tenantId === where.tenantId && row.active && row.automaticChangeAllowed && where.id.in.includes(row.id))),
      findFirst: vi.fn(async ({ where }) => statuses.find(row => row.id === where.id && row.tenantId === where.tenantId && row.active && row.automaticChangeAllowed) || null),
    },
    proposal: { update: vi.fn(async ({ data }) => data) }, statusHistory: { create: vi.fn(async () => ({})) },
  };
  prisma.$transaction = async (callback: any) => callback(prisma);
  return { prisma, configs };
}
describe('status mappings by company, bank and promoter (memory only)', () => {
  it('applies numeric FACTA mapping to the returned full status only in the configured connection', async () => {
    const { prisma } = fixture();
    await saveBankStatusMappings(prisma, 'a', 'dg', 'facta', [{ externalStatus: '215', internalStatusId: 'stage-a' }]);
    expect(await resolveMappedBankStatus(prisma, 'a', 'dg', 'facta', ['215 - AGUARDA AVERBAÇÃO'])).toMatchObject({ id: 'stage-a' });
    expect(await resolveMappedBankStatus(prisma, 'a', 'prospecta', 'facta', ['215'])).toBeNull();
    expect(await resolveMappedBankStatus(prisma, 'a', 'dg', 'c6', ['215'])).toBeNull();
    expect(await resolveMappedBankStatus(prisma, 'b', 'dg', 'facta', ['215'])).toBeNull();
  });
  it('rejects a foreign status, a foreign promoter and statuses that forbid automatic changes', async () => {
    const { prisma } = fixture();
    await expect(saveBankStatusMappings(prisma, 'a', 'dg', 'facta', [{ externalStatus: '215', internalStatusId: 'stage-b' }])).rejects.toThrow();
    await expect(saveBankStatusMappings(prisma, 'b', 'dg', 'facta', [])).rejects.toThrow();
    await expect(saveBankStatusMappings(prisma, 'a', 'dg', 'facta', [{ externalStatus: '215', internalStatusId: 'manual' }])).rejects.toThrow();
    expect(prisma.systemConfig.upsert).not.toHaveBeenCalled();
  });
  it('rejects duplicate source keys and preserves unmatched statuses', async () => {
    const { prisma } = fixture();
    await expect(saveBankStatusMappings(prisma, 'a', 'dg', 'facta', [{ externalStatus: 'Pendência', internalStatusId: 'stage-a' }, { externalStatus: 'PENDENCIA', internalStatusId: 'stage-a' }])).rejects.toThrow();
    expect(await resolveMappedBankStatus(prisma, 'a', 'dg', 'facta', ['UNKNOWN'])).toBeNull();
  });
  it('records custom status history in the same transaction as provider values', async () => {
    const { prisma } = fixture();
    await updateMappedProviderProposal(prisma, { id: 'proposal', tenantId: 'a', statusId: 'old' }, { installmentValue: 123.45 }, { id: 'stage-a', name: 'Custom', standardCategory: 'ESTEIRA' }, 'user', 'FINANTO');
    expect(prisma.proposal.update.mock.calls[0][0].data).toMatchObject({ installmentValue: 123.45, statusId: 'stage-a', standardCategory: 'ESTEIRA' });
    expect(prisma.statusHistory.create.mock.calls[0][0].data).toMatchObject({ tenantId: 'a', proposalId: 'proposal', statusId: 'stage-a', userId: 'user' });
  });
});
