import { PrismaClient } from '@prisma/client';

export interface PortabilityCronResult {
  success: boolean;
  checkedCount: number;
  saldoRetornadoCount: number;
  alertsGenerated: number;
  details: string[];
  executedAt: string;
}

/**
 * Calculates business days between two dates, excluding weekends and statutory holidays.
 */
function calculateServerBusinessDays(startDateStr: string | Date, endDateStr: string | Date, holidayDates: string[]): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return 0;
  }

  const holidaySet = new Set(
    holidayDates.map(h => {
      try {
        return new Date(h).toISOString().split('T')[0];
      } catch {
        return h;
      }
    })
  );

  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  const targetEnd = new Date(end);
  targetEnd.setHours(0, 0, 0, 0);

  while (current < targetEnd) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    const dateIso = current.toISOString().split('T')[0];

    // Exclude Sunday (0), Saturday (6), and holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateIso)) {
      count++;
    }
  }

  return count;
}

/**
 * Runs the Portability Cron job on PostgreSQL.
 * Uses advisory lock to prevent concurrent execution across instances.
 */
export async function runPortabilityCronServer(
  prisma: PrismaClient,
  tenantId?: string
): Promise<PortabilityCronResult> {
  const executedAt = new Date().toISOString();

  // Entire operation wrapped in a single Prisma transaction
  return await prisma.$transaction(async (tx) => {
    console.log('[CRON_DEBUG] Inside transaction, acquiring advisory lock 778899...');
    // 1. Acquire advisory lock inside this transaction (using 778899)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(778899)::text as lock_res`;
    console.log('[CRON_DEBUG] Advisory lock 778899 acquired successfully.');

    // 2. National holidays static list
    const holidayDates: string[] = [
      '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01',
      '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-12-25'
    ];

    // 3. Query proposal statuses to find AGUARDAR_RETORNO_CIP and SALDO_RETORNADO
    const cipStatus = await tx.proposalStatus.findFirst({
      where: {
        code: 'AGUARDAR_RETORNO_CIP',
        ...(tenantId ? { tenantId } : {}),
      },
    });

    const saldoRetornadoStatus = await tx.proposalStatus.findFirst({
      where: {
        code: 'SALDO_RETORNADO',
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (!cipStatus || !saldoRetornadoStatus) {
      return {
        success: false,
        checkedCount: 0,
        saldoRetornadoCount: 0,
        alertsGenerated: 0,
        details: ['Status AGUARDAR_RETORNO_CIP ou SALDO_RETORNADO não configurado no banco de dados.'],
        executedAt,
      };
    }

    const targetDays = 5;

    // 4. Find proposals in CIP status
    const proposalsInCip = await tx.proposal.findMany({
      where: {
        statusId: cipStatus.id,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      include: {
        tenant: true,
        client: true,
      },
    });

    const details: string[] = [];
    let checkedCount = 0;
    let saldoRetornadoCount = 0;
    let alertsGenerated = 0;

    const now = new Date();

    for (const proposal of proposalsInCip) {
      checkedCount++;
      const startDate = proposal.retentionDeadline || proposal.createdAt;
      const businessDays = calculateServerBusinessDays(startDate, now, holidayDates);

      if (businessDays >= targetDays) {
        // Update status using transaction tx
        await tx.proposal.update({
          where: { id: proposal.id },
          data: {
            statusId: saldoRetornadoStatus.id,
            updatedAt: now,
          },
        });

        // Add Status History using transaction tx
        await tx.statusHistory.create({
          data: {
            proposalId: proposal.id,
            tenantId: proposal.tenantId,
            statusId: saldoRetornadoStatus.id,
            statusName: saldoRetornadoStatus.name,
            notes: `Automação Cron CIP: Completou ${businessDays}/${targetDays} dias úteis em AGUARDAR RETORNO CIP. Saldo retornado.`,
          },
        });

        // Check idempotency for notification using tx
        const existingNotif = await tx.notification.findFirst({
          where: {
            proposalId: proposal.id,
            type: 'CIP',
            title: 'Saldo Retornado Automaticamente',
          },
        });

        if (!existingNotif) {
          await tx.notification.create({
            data: {
              tenantId: proposal.tenantId,
              proposalId: proposal.id,
              title: 'Saldo Retornado Automaticamente',
              message: `Proposta ${proposal.proposalNumber}: Atingiu ${businessDays} dias úteis em CIP. Status alterado para SALDO RETORNADO.`,
              type: 'CIP',
              priority: 'MEDIUM',
            },
          });
        }

        // Audit Log using tx
        await tx.auditLog.create({
          data: {
            tenantId: proposal.tenantId,
            action: 'AUTOMATION_PORTABILITY_TRANSITION',
            entity: 'Proposal',
            entityId: proposal.id,
            userName: 'Sistema Cron CIP',
            newData: JSON.stringify({
              proposalNumber: proposal.proposalNumber,
              businessDays,
              fromStatus: cipStatus.name,
              toStatus: saldoRetornadoStatus.name,
            }),
          },
        });

        saldoRetornadoCount++;
        details.push(`Proposta ${proposal.proposalNumber}: Saldo retornado com ${businessDays} dias úteis.`);
      } else if (businessDays === targetDays - 1) {
        // 4th business day warning
        alertsGenerated++;
        details.push(`Proposta ${proposal.proposalNumber}: Alerta 4º dia útil em CIP.`);
      } else if (businessDays === targetDays - 2) {
        // 3rd business day notification
        alertsGenerated++;
        details.push(`Proposta ${proposal.proposalNumber}: Acompanhamento 3º dia útil em CIP.`);
      }
    }

    return {
      success: true,
      checkedCount,
      saldoRetornadoCount,
      alertsGenerated,
      details,
      executedAt,
    };
  }, {
    timeout: 30000,
    maxWait: 15000,
  });
}
