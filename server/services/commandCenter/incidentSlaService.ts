import { PrismaClient, IncidentSeverity, IncidentType } from '@prisma/client';
import { SlaStatusResult } from './commandCenterTypes';

export const DEFAULT_SLA_MATRIX: Record<IncidentSeverity, { acknowledgeMinutes: number; resolveMinutes: number }> = {
  [IncidentSeverity.CRITICAL]: { acknowledgeMinutes: 15, resolveMinutes: 120 },
  [IncidentSeverity.HIGH]: { acknowledgeMinutes: 30, resolveMinutes: 240 },
  [IncidentSeverity.MEDIUM]: { acknowledgeMinutes: 60, resolveMinutes: 480 },
  [IncidentSeverity.LOW]: { acknowledgeMinutes: 120, resolveMinutes: 1440 },
};

export class IncidentSlaService {
  /**
   * Get SLA Targets for a specific severity and type, taking tenant custom configs into account
   */
  static async getSlaTargets(
    prisma: PrismaClient,
    tenantId: string,
    severity: IncidentSeverity,
    type?: IncidentType | null
  ): Promise<{ acknowledgeMinutes: number; resolveMinutes: number }> {
    const defaults = DEFAULT_SLA_MATRIX[severity] || DEFAULT_SLA_MATRIX[IncidentSeverity.MEDIUM];

    try {
      const customConfig = await prisma.incidentSlaConfig.findFirst({
        where: {
          tenantId,
          severity,
          OR: [{ type: type || null }, { type: null }],
        },
        orderBy: { type: 'asc' }, // specific type override first
      });

      if (customConfig) {
        return {
          acknowledgeMinutes: customConfig.acknowledgeMinutes,
          resolveMinutes: customConfig.resolveMinutes,
        };
      }
    } catch (e) {
      // Fallback to defaults
    }

    return defaults;
  }

  /**
   * Calculate current SLA status for an incident
   */
  static calculateSlaStatus(
    createdAt: Date,
    resolvedAt: Date | null,
    slaMinutesTarget: number,
    acknowledgeTarget: number,
    acknowledgedAt: Date | null,
    now: Date = new Date()
  ): SlaStatusResult {
    const end = resolvedAt || now;
    const elapsedMs = end.getTime() - createdAt.getTime();
    const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));

    const deadline = new Date(createdAt.getTime() + slaMinutesTarget * 60 * 1000);
    const consumedPercent = slaMinutesTarget > 0 ? Math.round((elapsedMinutes / slaMinutesTarget) * 100) : 0;

    let slaStatus: 'DENTRO_SLA' | 'PROXIMO_SLA' | 'SLA_ESTOURADO' = 'DENTRO_SLA';
    if (consumedPercent >= 100) {
      slaStatus = 'SLA_ESTOURADO';
    } else if (consumedPercent >= 80) {
      slaStatus = 'PROXIMO_SLA';
    }

    return {
      severity: IncidentSeverity.MEDIUM, // default fallback
      targetMinutes: slaMinutesTarget,
      acknowledgeMinutesTarget: acknowledgeTarget,
      elapsedMinutes,
      consumedPercent,
      slaStatus,
      deadline,
      isBreached: consumedPercent >= 100,
      isNearBreach: consumedPercent >= 80 && consumedPercent < 100,
    };
  }

  /**
   * Get tenant SLA matrix config
   */
  static async getTenantSlaConfigs(prisma: PrismaClient, tenantId: string) {
    const customConfigs = await prisma.incidentSlaConfig.findMany({
      where: { tenantId },
    });

    const severities: IncidentSeverity[] = [
      IncidentSeverity.CRITICAL,
      IncidentSeverity.HIGH,
      IncidentSeverity.MEDIUM,
      IncidentSeverity.LOW,
    ];

    return severities.map((severity) => {
      const custom = customConfigs.find((c) => c.severity === severity && !c.type);
      const defaults = DEFAULT_SLA_MATRIX[severity];
      return {
        severity,
        acknowledgeMinutes: custom?.acknowledgeMinutes ?? defaults.acknowledgeMinutes,
        resolveMinutes: custom?.resolveMinutes ?? defaults.resolveMinutes,
        isCustom: !!custom,
      };
    });
  }

  /**
   * Update or upsert tenant SLA config for a severity
   */
  static async updateTenantSlaConfig(
    prisma: PrismaClient,
    tenantId: string,
    severity: IncidentSeverity,
    acknowledgeMinutes: number,
    resolveMinutes: number
  ) {
    return prisma.incidentSlaConfig.upsert({
      where: {
        tenantId_severity_type: {
          tenantId,
          severity,
          type: null as any,
        },
      },
      create: {
        tenantId,
        severity,
        acknowledgeMinutes,
        resolveMinutes,
      },
      update: {
        acknowledgeMinutes,
        resolveMinutes,
      },
    });
  }
}
