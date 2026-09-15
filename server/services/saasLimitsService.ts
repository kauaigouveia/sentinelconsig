import { PrismaClient } from '@prisma/client';
import { SaasUsageService, getUsageStatus } from './saasUsageService.js';

export class SaasLimitsService {
  public static async getTenantLimits(prisma: PrismaClient, tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
    if (!tenant) {
      throw new Error('Tenant não encontrado');
    }

    const usage = await SaasUsageService.getTenantUsage(prisma, tenantId);

    const maxUsers = tenant.maxUsers;
    const maxProposals = tenant.maxProposals;
    const storageLimitMb = tenant.storageLimitMb;

    return {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
      enabledModules: tenant.enabledModules,
      limits: {
        maxUsers: {
          value: maxUsers,
          configured: maxUsers !== null && maxUsers !== undefined && maxUsers > 0
        },
        maxProposals: {
          value: maxProposals,
          configured: maxProposals !== null && maxProposals !== undefined && maxProposals > 0
        },
        storageLimitMb: {
          value: storageLimitMb,
          configured: storageLimitMb !== null && storageLimitMb !== undefined && storageLimitMb > 0
        }
      },
      usage: {
        activeUsers: usage.users.activeUsers,
        totalProposals: usage.proposals.totalProposals,
        storageUsedMb: usage.storage.storageUsedMb
      },
      percents: {
        usersUsagePercent: usage.users.usagePercent,
        proposalsUsagePercent: usage.proposals.usagePercent,
        storageUsagePercent: usage.storage.storageUsagePercent
      },
      statuses: {
        usersStatus: usage.users.status,
        proposalsStatus: usage.proposals.status,
        storageStatus: usage.storage.status
      }
    };
  }
}
