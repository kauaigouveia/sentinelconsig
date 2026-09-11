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
  public static runPortabilityCron(): AutomationResult {
    const proposals = StorageService.getProposals();
    const statuses = StorageService.getStatuses();
    const holidays = StorageService.getHolidays();
    const config = StorageService.getConfig();
    const targetDays = config.portabilityBalanceDays || 5;

    const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');
    const saldoRetornadoStatus = statuses.find(s => s.code === 'SALDO_RETORNADO');

    if (!cipStatus || !saldoRetornadoStatus) {
      return { checkedCount: 0, saldoRetornadoCount: 0, alertsGenerated: 0, details: ['Status CIP ou Saldo Retornado não encontrados.'] };
    }

    const details: string[] = [];
    let checkedCount = 0;
    let saldoRetornadoCount = 0;
    let alertsGenerated = 0;

    const now = new Date();

    for (const proposal of proposals) {
      if (proposal.statusId !== cipStatus.id) continue;

      checkedCount++;
      const startDate = proposal.portabilitySlaStartedAt || proposal.createdAt;
      const businessDays = calculateBusinessDays(startDate, now, holidays);

      // Rule: After completing 5 business days, if not REPROVADO and not CANCELADO -> SALDO RETORNADO
      if (businessDays >= targetDays) {
        StorageService.updateProposalStatus(
          proposal.id,
          saldoRetornadoStatus.id,
          `Automação Vercel Cron: Completou ${businessDays}/${targetDays} dias úteis em AGUARDAR RETORNO CIP. Saldo retornado pelo banco.`,
          {
            id: 'system-cron',
            name: 'Vercel Cron Automatizado',
            email: 'cron@creditgestao.com.br',
            role: 'MASTER',
            active: true,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          'SISTEMA'
        );

        StorageService.addNotification({
          proposalId: proposal.id,
          title: 'Saldo Retornado Automaticamente',
          message: `ADE ${proposal.proposalNumber}: Atingiu ${businessDays} dias úteis em CIP. Status alterado para SALDO RETORNADO.`,
          type: 'SALDO_RETORNADO',
          priority: 'NORMAL',
        });

        saldoRetornadoCount++;
        details.push(`ADE ${proposal.proposalNumber}: Saldo retornado com ${businessDays} dias úteis.`);
      } else if (businessDays === targetDays - 1) {
        // 4th day warning (atencao)
        alertsGenerated++;
        details.push(`ADE ${proposal.proposalNumber}: Alerta 4º dia útil.`);
      } else if (businessDays === targetDays) {
        // 5th day warning (urgente)
        alertsGenerated++;
        details.push(`ADE ${proposal.proposalNumber}: No 5º dia útil em CIP.`);
      }
    }

    return {
      checkedCount,
      saldoRetornadoCount,
      alertsGenerated,
      details,
    };
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
