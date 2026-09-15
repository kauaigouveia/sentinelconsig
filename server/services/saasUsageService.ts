import { PrismaClient } from '@prisma/client';

export type UsageStatus = 'NORMAL' | 'WARNING' | 'ALERT' | 'CRITICAL' | 'EXCEEDED';

export function getUsageStatus(percent: number): UsageStatus {
  if (percent > 100) return 'EXCEEDED';
  if (percent >= 95) return 'CRITICAL';
  if (percent >= 85) return 'ALERT';
  if (percent >= 70) return 'WARNING';
  return 'NORMAL';
}

export class SaasUsageService {
  public static async getTenantUsage(prisma: PrismaClient, tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
    if (!tenant) {
      throw new Error('Tenant não encontrado');
    }

    // 1. Users metrics (excluding deleted users)
    const [totalUsers, activeUsers, inactiveUsers] = await Promise.all([
      prisma.user.count({
        where: { tenantId, deletedAt: null }
      }),
      prisma.user.count({
        where: { tenantId, active: true, deletedAt: null }
      }),
      prisma.user.count({
        where: { tenantId, active: false, deletedAt: null }
      })
    ]);

    // 2. Align Date thresholds with America/Sao_Paulo (UTC-3)
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = spFormatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '01';
    const year = parseInt(getPart('year'), 10);
    const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
    const day = parseInt(getPart('day'), 10);

    const makeSpDate = (y: number, m: number, d: number, hour: number, min: number, sec: number, ms: number): Date => {
      // Offset -3h shifted by +3h
      return new Date(Date.UTC(y, m, d, hour + 3, min, sec, ms));
    };

    const startOfCurrentMonth = makeSpDate(year, month, 1, 0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 3. Proposals metrics (excluding soft deleted)
    const [
      totalProposals,
      proposalsCurrentMonth,
      proposalsLast30Days,
      proposalsActive,
      proposalsCompleted
    ] = await Promise.all([
      prisma.proposal.count({
        where: { tenantId, deletedAt: null }
      }),
      prisma.proposal.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: startOfCurrentMonth }
        }
      }),
      prisma.proposal.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.proposal.count({
        where: {
          tenantId,
          deletedAt: null,
          standardCategory: { in: ['ESTEIRA', 'ANDAMENTO', 'PENDENTE'] }
        }
      }),
      prisma.proposal.count({
        where: {
          tenantId,
          deletedAt: null,
          standardCategory: 'PAGO'
        }
      })
    ]);

    // 4. Storage (ClientDocument aggregation - fileSizeBytes)
    const storageSum = await prisma.clientDocument.aggregate({
      where: { tenantId },
      _sum: { fileSizeBytes: true }
    });

    const storageUsedBytes = storageSum._sum.fileSizeBytes || 0;
    const storageUsedMb = Number((storageUsedBytes / (1024 * 1024)).toFixed(2));
    const storageLimitMb = tenant.storageLimitMb;

    // Calc percents & statuses
    const usersPercent = tenant.maxUsers > 0 
      ? Number(((activeUsers / tenant.maxUsers) * 100).toFixed(2))
      : 0;

    const proposalsPercent = tenant.maxProposals > 0
      ? Number(((totalProposals / tenant.maxProposals) * 100).toFixed(2))
      : 0;

    const storagePercent = storageLimitMb > 0
      ? Number(((storageUsedMb / storageLimitMb) * 100).toFixed(2))
      : 0;

    return {
      users: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        limit: tenant.maxUsers,
        usagePercent: usersPercent,
        status: getUsageStatus(usersPercent)
      },
      proposals: {
        totalProposals,
        proposalsCurrentMonth,
        proposalsLast30Days,
        proposalsActive,
        proposalsCompleted,
        limit: tenant.maxProposals,
        usagePercent: proposalsPercent,
        status: getUsageStatus(proposalsPercent)
      },
      storage: {
        storageUsedBytes,
        storageUsedMb,
        storageLimitMb,
        storageUsagePercent: storagePercent,
        status: getUsageStatus(storagePercent)
      }
    };
  }
}
