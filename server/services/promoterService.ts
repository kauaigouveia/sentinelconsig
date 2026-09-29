import { PrismaClient } from '@prisma/client';

export interface DefaultPromoterDef {
  name: string;
  code: string;
  status: string;
}

export const DEFAULT_PROMOTERS: DefaultPromoterDef[] = [
  { name: 'DG', code: 'DG', status: 'ATIVO' },
  { name: 'PROSPECTA', code: 'PROSPECTA', status: 'ATIVO' },
  { name: 'CREDITPRO', code: 'CREDITPRO', status: 'ATIVO' },
];

export const DEFAULT_BANKS = [
  { name: 'C6 BANK', code: '336', color: '#1e3a8a', status: 'ATIVO' },
  { name: 'BRB', code: '070', color: '#0284c7', status: 'ATIVO' },
  { name: 'DAYCOVAL', code: '707', color: '#ea580c', status: 'ATIVO' },
  { name: 'FACTA FINANCEIRA', code: '149', color: '#dc2626', status: 'ATIVO' },
  { name: 'CREFISA', code: '069', color: '#059669', status: 'ATIVO' },
  { name: 'ICRED', code: '811', color: '#7c3aed', status: 'ATIVO' },
];

/**
 * Garante que os registros oficiais de promotoras padrão existam no PostgreSQL para o tenant.
 * Fonte única da verdade (Single Source of Truth).
 */
export async function ensureDefaultPromotersForTenant(prisma: PrismaClient, tenantId: string) {
  if (!tenantId) return [];

  for (const p of DEFAULT_PROMOTERS) {
    const exists = await prisma.promoter.findFirst({
      where: {
        tenantId,
        OR: [
          { code: { equals: p.code, mode: 'insensitive' } },
          { name: { equals: p.name, mode: 'insensitive' } },
        ],
      },
    });

    if (!exists) {
      try {
        await prisma.promoter.create({
          data: {
            tenantId,
            name: p.name,
            code: p.code,
            status: p.status,
          },
        });
      } catch (err: any) {
        // Se já existe com outro case ou concorrência, ignora
      }
    }
  }

  return prisma.promoter.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Garante promotoras padrão para todos os tenants ativos no PostgreSQL.
 */
export async function ensureDefaultPromotersForAllTenants(prisma: PrismaClient) {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const t of tenants) {
      await ensureDefaultPromotersForTenant(prisma, t.id);
    }
  } catch (err) {
    console.warn('[PromoterService] Falha ao sincronizar promotoras para todos os tenants:', err);
  }
}

/**
 * Garante bancos padrão para o tenant no PostgreSQL.
 */
export async function ensureDefaultBanksForTenant(prisma: PrismaClient, tenantId: string) {
  if (!tenantId) return [];

  for (const b of DEFAULT_BANKS) {
    const exists = await prisma.bank.findFirst({
      where: {
        tenantId,
        OR: [
          { code: { equals: b.code, mode: 'insensitive' } },
          { name: { equals: b.name, mode: 'insensitive' } },
        ],
      },
    });

    if (!exists) {
      try {
        await prisma.bank.create({
          data: {
            tenantId,
            name: b.name,
            code: b.code,
            color: b.color,
            status: b.status,
          },
        });
      } catch (err: any) {
        // Ignora duplicidade concorrente
      }
    }
  }

  return prisma.bank.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Garante matriz padrão de bancos x promotoras para o tenant no PostgreSQL.
 */
export async function ensureDefaultBankPromotersForTenant(prisma: PrismaClient, tenantId: string) {
  if (!tenantId) return [];

  const [banks, promoters] = await Promise.all([
    prisma.bank.findMany({ where: { tenantId, status: 'ATIVO' } }),
    prisma.promoter.findMany({ where: { tenantId, status: 'ATIVO' } }),
  ]);

  for (const bank of banks) {
    for (const promoter of promoters) {
      const exists = await prisma.bankPromoter.findFirst({
        where: { tenantId, bankId: bank.id, promoterId: promoter.id },
      });
      if (!exists) {
        try {
          await prisma.bankPromoter.create({
            data: {
              tenantId,
              bankId: bank.id,
              promoterId: promoter.id,
              login: 'DEFAULT',
              status: 'ATIVO',
            },
          });
        } catch {
          // Ignora
        }
      }
    }
  }

  return prisma.bankPromoter.findMany({
    where: { tenantId },
    include: { bank: true, promoter: true },
  });
}
