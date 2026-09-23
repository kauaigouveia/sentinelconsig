import { PrismaClient, IncidentSeverity, IncidentStatus } from '@prisma/client';
import { CentralEventBus } from '../eventBus';

export interface CommandAlert {
  id: string;
  tenantId: string;
  type: 'CRITICAL_INCIDENT' | 'SLA_NEAR_BREACH' | 'SLA_BREACHED' | 'INTEGRATION_OFFLINE' | 'CRITICAL_INSIGHT';
  severity: IncidentSeverity;
  title: string;
  message: string;
  entityId?: string;
  entityType?: 'INCIDENT' | 'INTEGRATION' | 'INSIGHT';
  dedupKey: string;
  createdAt: Date;
}

export class CommandAlertEngine {
  private static alertCache = new Map<string, Date>(); // dedupKey -> emittedAt

  /**
   * Evaluate active alerts for tenant
   */
  static async evaluateAlerts(prisma: PrismaClient, tenantId: string): Promise<CommandAlert[]> {
    const alerts: CommandAlert[] = [];
    const now = new Date();

    // 1. Check for CRITICAL open incidents
    const criticalIncidents = await prisma.incident.findMany({
      where: {
        tenantId,
        severity: IncidentSeverity.CRITICAL,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED, IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATING] },
      },
      take: 10,
    });

    for (const inc of criticalIncidents) {
      const dedupKey = `CRITICAL_INCIDENT_${tenantId}_${inc.id}`;
      alerts.push({
        id: `alt_${inc.id}_crit`,
        tenantId,
        type: 'CRITICAL_INCIDENT',
        severity: IncidentSeverity.CRITICAL,
        title: `Incidente Crítico Ativo: ${inc.incidentNumber}`,
        message: `${inc.title} (${inc.impactSummary || 'Sem resumo de impacto'})`,
        entityId: inc.id,
        entityType: 'INCIDENT',
        dedupKey,
        createdAt: inc.createdAt,
      });
    }

    // 2. Check for SLA Near Breach (>80%) and Breached
    const activeIncidents = await prisma.incident.findMany({
      where: {
        tenantId,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED, IncidentStatus.INVESTIGATING, IncidentStatus.MITIGATING] },
      },
      take: 25,
    });

    for (const inc of activeIncidents) {
      const elapsedMs = now.getTime() - inc.createdAt.getTime();
      const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
      const targetMinutes = inc.slaMinutesTarget || 240;
      const percent = Math.round((elapsedMinutes / targetMinutes) * 100);

      if (percent >= 100) {
        const dedupKey = `SLA_BREACHED_${tenantId}_${inc.id}`;
        alerts.push({
          id: `alt_${inc.id}_breached`,
          tenantId,
          type: 'SLA_BREACHED',
          severity: IncidentSeverity.HIGH,
          title: `SLA Estourado: ${inc.incidentNumber}`,
          message: `O incidente '${inc.title}' ultrapassou a meta de SLA (${elapsedMinutes}m de ${targetMinutes}m).`,
          entityId: inc.id,
          entityType: 'INCIDENT',
          dedupKey,
          createdAt: now,
        });
      } else if (percent >= 80) {
        const dedupKey = `SLA_NEAR_${tenantId}_${inc.id}`;
        alerts.push({
          id: `alt_${inc.id}_near`,
          tenantId,
          type: 'SLA_NEAR_BREACH',
          severity: IncidentSeverity.MEDIUM,
          title: `SLA Próximo do Limite: ${inc.incidentNumber}`,
          message: `Incidente '${inc.title}' consumiu ${percent}% do tempo limite de SLA (${elapsedMinutes}m de ${targetMinutes}m).`,
          entityId: inc.id,
          entityType: 'INCIDENT',
          dedupKey,
          createdAt: now,
        });
      }
    }

    // 3. Emit new un-cached alerts via CentralEventBus
    for (const alert of alerts) {
      const lastEmitted = this.alertCache.get(alert.dedupKey);
      const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes deduplication cooldown
      if (!lastEmitted || now.getTime() - lastEmitted.getTime() > COOLDOWN_MS) {
        this.alertCache.set(alert.dedupKey, now);
        CentralEventBus.getInstance().emit('COMMAND_ALERT_CREATED', alert);
      }
    }

    return alerts;
  }
}
