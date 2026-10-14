import { describe, it, expect, vi } from 'vitest';
import { integrationConfigStore, withIntegrationPromoter, integrationCacheKey, resolveBankPromoter } from '../server/services/bankPromoterConfig';
import { FactaBankService } from '../server/services/factaBankService';
import { C6BankService } from '../server/services/c6BankService';
import { HappyBankService } from '../server/services/happyBankService';

function fixture() {
  const promoters = [{ id: 'dg', name: 'DG PROMOTORA', tenantId: 'a' }, { id: 'prospecta', name: 'PROSPECTA', tenantId: 'a' }, { id: 'other', name: 'DG', tenantId: 'b' }];
  const rows = [{ tenantId: 'a', configKey: 'facta_username', configValue: 'fictional-dg', isSecret: false }, { tenantId: 'a', configKey: 'facta_password', configValue: 'fictional-secret', isSecret: true }];
  const prisma: any = {
    promoter: { findMany: vi.fn(async ({ where }: any) => promoters.filter(row => row.tenantId === where.tenantId && (!where.id || row.id === where.id))) },
    systemConfig: {
      findMany: vi.fn(async ({ where }: any) => rows.filter(row => row.tenantId === where.tenantId && (typeof where.configKey === 'string' ? row.configKey === where.configKey : where.configKey.in ? where.configKey.in.includes(row.configKey) : row.configKey.startsWith(where.configKey.startsWith)))),
      findUnique: vi.fn(async ({ where }: any) => rows.find(row => row.tenantId === where.tenantId_configKey.tenantId && row.configKey === where.tenantId_configKey.configKey) || null),
      upsert: vi.fn(async (args: any) => { const row = rows.find(row => row.tenantId === args.where.tenantId_configKey.tenantId && row.configKey === args.where.tenantId_configKey.configKey); if (row) { Object.assign(row, args.update); return row; } rows.push(args.create); return args.create; }),
    },
  };
  // Apply the default name filter as PostgreSQL would.
  prisma.promoter.findMany.mockImplementation(async ({ where }: any) => promoters.filter(row => row.tenantId === where.tenantId && (where.id ? row.id === where.id : !where.OR || where.OR.some((condition: any) => condition.name.equals.toUpperCase() === row.name.toUpperCase()))));
  return { prisma, rows };
}

describe('bank connections by promoter (memory-only)', () => {
  it('does not supply server-wide FACTA credentials to another company', async () => {
    const { prisma } = fixture();
    vi.stubEnv('FACTA_USERNAME', 'fictional-global'); vi.stubEnv('FACTA_PASSWORD', 'fictional-global-secret');
    try {
      const config = await FactaBankService.getTenantConfig(prisma, 'b', 'other');
      expect(config.username).toBe(''); expect(config.hasPassword).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });
  it('keeps existing FACTA credentials exclusively with DG', async () => {
    const { prisma } = fixture();
    expect((await FactaBankService.getTenantConfig(prisma, 'a', 'dg')).username).toBe('fictional-dg');
    const prospecta = await FactaBankService.getTenantConfig(prisma, 'a', 'prospecta');
    expect(prospecta.username).toBe(''); expect(prospecta.hasPassword).toBe(false); expect(prospecta.enabled).toBe(false);
  });
  it('rejects a promoter belonging to another company', async () => {
    const { prisma } = fixture();
    await expect(resolveBankPromoter(prisma, 'a', 'other')).rejects.toThrow();
    expect(prisma.systemConfig.findMany).not.toHaveBeenCalled();
  });
  it.each(['c6', 'happy', 'bmg', 'finanto', 'nossa-fintech'])('separates %s configuration writes', async bank => {
    const { prisma, rows } = fixture();
    await withIntegrationPromoter('prospecta', async () => {
      const store = await integrationConfigStore(prisma, 'a', bank);
      await store.upsert({ where: { tenantId_configKey: { tenantId: 'a', configKey: 'example' } }, create: { tenantId: 'a', configKey: 'example', configValue: 'fictional', isSecret: true }, update: { configValue: 'fictional' } });
      expect((await store.findUnique({ where: { tenantId_configKey: { tenantId: 'a', configKey: 'example' } } })).configKey).toBe('example');
    });
    expect(rows.at(-1)?.configKey).toBe(`integration:${bank}:prospecta:example`);
    await withIntegrationPromoter('dg', async () => expect(await (await integrationConfigStore(prisma, 'a', bank)).findUnique({ where: { tenantId_configKey: { tenantId: 'a', configKey: 'example' } } })).toBeNull());
  });
  it('isolates asynchronous scopes and token keys', async () => {
    const results = await Promise.all(['dg', 'prospecta'].map(id => withIntegrationPromoter(id, async () => { await Promise.resolve(); return integrationCacheKey('a'); })));
    expect(results).toEqual(['a:dg', 'a:prospecta']); expect(integrationCacheKey('a')).toBe('a:legacy-dg');
  });
  it('never matches FACTA identifiers outside the source promoter', async () => {
    const { prisma } = fixture(); prisma.proposal = { findMany: vi.fn(async () => []) };
    await FactaBankService.findMatchingProposal(prisma, 'a', { proposta: 'example' }, 'prospecta');
    expect(prisma.proposal.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 'a', promoterId: 'prospecta' });
  });
  it('blocks a proposal with no promoter before any bank call or write', async () => {
    const { prisma } = fixture(); prisma.proposal = { findFirst: vi.fn(async () => ({ id: 'p', promoterId: null })), update: vi.fn() };
    await expect(FactaBankService.syncProposalStatus(prisma, 'p', 'a')).rejects.toThrow('promotora');
    expect(prisma.proposal.update).not.toHaveBeenCalled(); expect(prisma.systemConfig.findMany).not.toHaveBeenCalled();
  });
  it('uses the C6 proposal promoter instead of the caller selection', async () => {
    const { prisma } = fixture(); prisma.proposal = { findMany: vi.fn(async () => [{ id: 'p', promoterId: 'prospecta' }]) };
    const spy = vi.spyOn(C6BankService as any, 'syncScopedProposalStatus').mockImplementation(async () => ({ scope: integrationCacheKey('a') }));
    try {
      const result: any = await withIntegrationPromoter('dg', () => C6BankService.syncProposalStatus(prisma, 'p', 'a'));
      expect(result.scope).toBe('a:prospecta');
    } finally { spy.mockRestore(); }
  });
  it('uses the Happy proposal promoter instead of the caller selection', async () => {
    const { prisma } = fixture(); prisma.proposal = { findFirst: vi.fn(async () => ({ id: 'p', promoterId: 'prospecta' })) };
    const spy = vi.spyOn(HappyBankService as any, 'syncScopedProposal').mockImplementation(async () => ({ scope: integrationCacheKey('a') }));
    try {
      const result: any = await withIntegrationPromoter('dg', () => HappyBankService.syncProposal(prisma, 'a', 'p'));
      expect(result.scope).toBe('a:prospecta');
    } finally { spy.mockRestore(); }
  });
  it('holds a shared Happy webhook when its source connection cannot be identified', async () => {
    const findMany = vi.fn();
    const prisma: any = {
      happyWebhookEvent: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'event' })), update: vi.fn(async () => ({})) },
      systemConfig: { findMany: vi.fn(async () => [{ tenantId: 'a', configKey: 'integration:happy:prospecta:happy_ativo' }]) },
      promoter: { findFirst: vi.fn(async () => ({ name: 'PROSPECTA' })) }, proposal: { findMany },
    };
    const result = await HappyBankService.processWebhook(prisma, { request_id: 'fictional-event' } as any);
    expect(result).toMatchObject({ unmatched: true, processed: false });
    expect(findMany).not.toHaveBeenCalled();
    expect(prisma.happyWebhookEvent.update.mock.calls[0][0].data.processingStatus).toBe('UNMATCHED');
  });
});
