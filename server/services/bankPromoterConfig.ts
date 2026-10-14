import type { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

const integrationScope = new AsyncLocalStorage<{ promoterId: string }>();
export function currentIntegrationPromoter() { return integrationScope.getStore()?.promoterId; }
export function withIntegrationPromoter<T>(promoterId: string, action: () => T): T {
  return integrationScope.run({ promoterId }, action);
}
export function integrationCacheKey(tenantId: string) { return `${tenantId}:${currentIntegrationPromoter() || 'legacy-dg'}`; }

export async function resolveBankPromoter(prisma: PrismaClient, tenantId: string, promoterId?: string, legacyName?: string) {
  const matches = await prisma.promoter.findMany({
    where: { tenantId, status: 'ATIVO', ...(promoterId ? { id: promoterId } : { OR: [{ name: { equals: legacyName || 'DG', mode: 'insensitive' } }, { name: { equals: 'DG PROMOTORA', mode: 'insensitive' } }] }) },
    select: { id: true, name: true }, take: 2,
  });
  if (matches.length !== 1) throw new Error('Selecione uma promotora ativa da empresa para esta conexão bancária.');
  return matches[0];
}

export function bankPromoterConfigKey(bank: string, promoterId: string, key: string) {
  return `integration:${bank}:${promoterId}:${key}`;
}

export async function readBankPromoterConfig(prisma: PrismaClient, tenantId: string, bank: string, promoterId: string, legacyName?: string) {
  const promoter = await resolveBankPromoter(prisma, tenantId, promoterId);
  const prefix = bankPromoterConfigKey(bank, promoter.id, '');
  const rows = await prisma.systemConfig.findMany({ where: { tenantId, configKey: { startsWith: prefix } } });
  const scoped = new Map(rows.map(row => [row.configKey.slice(prefix.length), row.configValue]));
  // Existing FACTA credentials belong to DG. Never inherit them for another promoter.
  const allowLegacy = ['DG', 'DG PROMOTORA'].includes(promoter.name.trim().toUpperCase()) && legacyName === 'DG';
  if (allowLegacy) {
    const legacy = await prisma.systemConfig.findMany({ where: { tenantId, configKey: { startsWith: `${bank}_` } } });
    for (const row of legacy) if (!scoped.has(row.configKey)) scoped.set(row.configKey, row.configValue);
  }
  return { promoter, values: scoped, allowLegacy };
}

/** Config-only adapter: keeps provider keys intact while storing each connection separately.
 * Does not change proposal queries, transactions, authorization or financial payloads.
 */
export async function integrationConfigStore(prisma: PrismaClient, tenantId: string, bank: string) {
  const promoter = await resolveBankPromoter(prisma, tenantId, currentIntegrationPromoter(), 'DG');
  const prefix = bankPromoterConfigKey(bank, promoter.id, '');
  const legacy = ['DG', 'DG PROMOTORA'].includes(promoter.name.trim().toUpperCase());
  const key = (value: any): any => {
    if (typeof value === 'string') return prefix + value;
    if (value?.in) return { ...value, in: value.in.map((item: string) => prefix + item) };
    if (typeof value?.startsWith === 'string') return { ...value, startsWith: prefix + value.startsWith };
    throw new Error('Filtro de configuração bancária não suportado.');
  };
  const normalize = (row: any) => row && ({ ...row, configKey: row.configKey?.startsWith(prefix) ? row.configKey.slice(prefix.length) : row.configKey });
  return {
    async findMany(args: any) {
      const where = { ...args.where, tenantId, configKey: key(args.where.configKey) };
      const scoped = await prisma.systemConfig.findMany({ ...args, where });
      const original = legacy ? await prisma.systemConfig.findMany({ ...args, where: { ...args.where, tenantId } }) : [];
      return [...new Map([...original, ...scoped.map(normalize)].map(row => [row.configKey, row])).values()];
    },
    async findUnique(args: any) {
      const originalKey = args.where.tenantId_configKey.configKey;
      const row = await prisma.systemConfig.findUnique({ ...args, where: { tenantId_configKey: { tenantId, configKey: key(originalKey) } } });
      if (row || !legacy) return normalize(row);
      return prisma.systemConfig.findUnique({ ...args, where: { tenantId_configKey: { tenantId, configKey: originalKey } } });
    },
    async upsert(args: any) {
      const configKey = key(args.where.tenantId_configKey.configKey);
      return normalize(await prisma.systemConfig.upsert({ ...args, where: { tenantId_configKey: { tenantId, configKey } }, create: { ...args.create, tenantId, configKey } }));
    },
    async deleteMany(args: any) {
      const scoped = await prisma.systemConfig.deleteMany({ ...args, where: { ...args.where, tenantId, configKey: key(args.where.configKey) } });
      const original = legacy ? await prisma.systemConfig.deleteMany({ ...args, where: { ...args.where, tenantId } }) : { count: 0 };
      return { count: scoped.count + original.count };
    },
    async update(args: any) {
      const originalKey = args.where.tenantId_configKey.configKey;
      const configKey = key(originalKey);
      const scoped = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey } } });
      if (!scoped && legacy) {
        const original = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: originalKey } } });
        if (original) return normalize(await prisma.systemConfig.create({ data: { tenantId, configKey, configValue: original.configValue, isSecret: original.isSecret, ...args.data } }));
      }
      return normalize(await prisma.systemConfig.update({ ...args, where: { tenantId_configKey: { tenantId, configKey } } }));
    },
    async create(args: any) {
      return normalize(await prisma.systemConfig.create({ ...args, data: { ...args.data, tenantId, configKey: key(args.data.configKey) } }));
    },
    allowLegacy: legacy,
    promoterId: promoter.id,
  };
}
