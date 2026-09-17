import { StorageService } from './storageService';
import { calculateBusinessDays, isBusinessDay, formatDate } from '../lib/utils';
import { Proposal } from '../types';

export interface AutomationResult {
  checkedCount: number;
  saldoRetornadoCount: number;
  alertsGenerated: number;
  details: string[];
}

export class AutomationService {
  /**
   * Evaluates all portability proposals currently in AGUARDAR_RETORNO_CIP status.
   * Calculates business days elapsed since portabilitySlaStartedAt (skipping weekends & holidays).
   * If >= configured days (default 5):
   *   transitions status to SALDO_RETORNADO (unless CANCELADO or REPROVADO).
   * If = 4 or 5 days, generates warning notification.
   */
  public static async runPortabilityCron(): Promise<AutomationResult> {
    try {
      const res = await fetch('/api/internal/cron/portability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        // Sync local storage state after server cron execution
        StorageService.syncWithPostgreSQL().catch(() => {});
        return {
          checkedCount: data.checkedCount || 0,
          saldoRetornadoCount: data.saldoRetornadoCount || 0,
          alertsGenerated: data.alertsGenerated || 0,
          details: data.details || [],
        };
      }
      return {
        checkedCount: 0,
        saldoRetornadoCount: 0,
        alertsGenerated: 0,
        details: [`Erro ao executar cron server-side (HTTP ${res.status}).`],
      };
    } catch (err: any) {
      console.error('[AutomationService] Falha ao invocar cron server-side:', err);
      return {
        checkedCount: 0,
        saldoRetornadoCount: 0,
        alertsGenerated: 0,
        details: [`Falha na comunicação com o servidor: ${err.message || err}`],
      };
    }
  }

  /**
   * Helper to inspect a single proposal's SLA status
   */
  public static getPortabilitySlaInfo(proposal: Proposal): {
    businessDays: number;
    targetDays: number;
    statusBadge: 'NORMAL' | 'ATENCAO' | 'URGENTE' | 'ESTOURADO' | 'CONCLUIDO';
    progressPercent: number;
    daysRemaining: number;
  } {
    const statuses = StorageService.getStatuses();
    const holidays = StorageService.getHolidays();
    const config = StorageService.getConfig();
    const targetDays = config.portabilityBalanceDays || 5;

    const currentStatus = statuses.find(s => s.id === proposal.statusId);
    if (!currentStatus) {
      return { businessDays: 0, targetDays, statusBadge: 'NORMAL', progressPercent: 0, daysRemaining: targetDays };
    }

    if (currentStatus.code === 'SALDO_RETORNADO' || currentStatus.code === 'PAGO') {
      return { businessDays: targetDays, targetDays, statusBadge: 'CONCLUIDO', progressPercent: 100, daysRemaining: 0 };
    }

    if (currentStatus.code !== 'AGUARDAR_RETORNO_CIP') {
      return { businessDays: 0, targetDays, statusBadge: 'NORMAL', progressPercent: 0, daysRemaining: targetDays };
    }

    const startDate = proposal.portabilitySlaStartedAt || proposal.createdAt;
    const businessDays = calculateBusinessDays(startDate, new Date(), holidays);
    const progress = Math.min(100, Math.round((businessDays / targetDays) * 100));
    const remaining = Math.max(0, targetDays - businessDays);

    let badge: 'NORMAL' | 'ATENCAO' | 'URGENTE' | 'ESTOURADO' | 'CONCLUIDO' = 'NORMAL';
    if (businessDays > targetDays) {
      badge = 'ESTOURADO';
    } else if (businessDays === targetDays) {
      badge = 'URGENTE';
    } else if (businessDays === targetDays - 1) {
      badge = 'ATENCAO';
    }

    return {
      businessDays,
      targetDays,
      statusBadge: badge,
      progressPercent: progress,
      daysRemaining: remaining,
    };
  }
}
