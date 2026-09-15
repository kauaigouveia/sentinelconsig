import { PrismaClient } from '@prisma/client';
import { SaasUsageService } from './saasUsageService.js';

export type TenantHealthStatus = 'EXCELLENT' | 'GOOD' | 'ATTENTION' | 'RISK' | 'CRITICAL';

export function getHealthStatus(score: number): TenantHealthStatus {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'GOOD';
  if (score >= 60) return 'ATTENTION';
  if (score >= 40) return 'RISK';
  return 'CRITICAL';
}

export class TenantHealthService {
  /**
   * Computes the SaaS Tenant Health Score (THS) from 0 to 100.
   * Based on four axes: Users (30%), Storage (30%), AI (20% - Skip), and Activity (20%).
   * 
   * Axis Scores:
   * - Users:
   *   < 70%: 100
   *   70-84%: 80
   *   85-94%: 50
   *   95-100%: 20
   *   > 100%: 0
   * - Storage:
   *   < 70%: 100
   *   70-84%: 80
   *   85-94%: 50
   *   95-100%: 20
   *   > 100%: 0
   * - AI: Not measured. Skip, weight redistributed.
   * - Activity: Based on proposal velocity over the last 30 days:
   *   >= 10 proposals: 100
   *   >= 5 proposals: 80
   *   >= 1 proposals: 50
   *   0 proposals but has history: 20
   *   0 proposals total: 10
   */
  public static async getTenantHealth(prisma: PrismaClient, tenantId: string) {
    const usage = await SaasUsageService.getTenantUsage(prisma, tenantId);

    // Eixo A: Users Health
    let usersScore = 100;
    const uPercent = usage.users.usagePercent;
    if (uPercent > 100) usersScore = 0;
    else if (uPercent >= 95) usersScore = 20;
    else if (uPercent >= 85) usersScore = 50;
    else if (uPercent >= 70) usersScore = 80;

    // Eixo B: Storage Health
    let storageScore = 100;
    const sPercent = usage.storage.storageUsagePercent;
    if (sPercent > 100) storageScore = 0;
    else if (sPercent >= 95) storageScore = 20;
    else if (sPercent >= 85) storageScore = 50;
    else if (sPercent >= 70) storageScore = 80;

    // Eixo C: AI (Not Measured)
    const aiScore = null;

    // Eixo D: Activity Health (deterministic based on last 30 days proposals)
    let activityScore = 100;
    const recentPropsCount = usage.proposals.proposalsLast30Days;
    const totalPropsCount = usage.proposals.totalProposals;
    
    if (recentPropsCount >= 10) activityScore = 100;
    else if (recentPropsCount >= 5) activityScore = 80;
    else if (recentPropsCount >= 1) activityScore = 50;
    else if (totalPropsCount > 0) activityScore = 20;
    else activityScore = 10;

    // Weight Calculations
    const weights = {
      users: 30,
      storage: 30,
      ai: 0, // AI is not measured currently, so weight is 0
      activity: 20
    };

    const availableWeight = weights.users + weights.storage + weights.ai + weights.activity; // 80

    const weightedScoreSum = 
      (usersScore * weights.users) + 
      (storageScore * weights.storage) + 
      (activityScore * weights.activity);

    const finalScore = Math.max(0, Math.min(100, Math.round(weightedScoreSum / availableWeight)));

    return {
      score: finalScore,
      status: getHealthStatus(finalScore),
      axes: {
        users: {
          score: usersScore,
          percent: uPercent,
          status: usage.users.status
        },
        storage: {
          score: storageScore,
          percent: sPercent,
          status: usage.storage.status
        },
        ai: {
          status: 'NOT_MEASURED',
          score: null,
          percent: 0
        },
        activity: {
          score: activityScore,
          recentProposals30d: recentPropsCount,
          totalProposals: totalPropsCount
        }
      },
      measuredAxes: ['users', 'storage', 'activity'],
      availableWeight,
      generatedAt: new Date()
    };
  }
}
