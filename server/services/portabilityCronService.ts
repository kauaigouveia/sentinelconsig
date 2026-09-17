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

  // Acquire advisory lock for concurrency protection (using arbitrary 64-bit lock key 778899)
  try {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(778899)`);
  } catch (err) {
    console.warn('[PORTABILITY CRON] Advisory lock warning (continuing transaction):', err);
  }

  // 1. National holidays static list
  const holidayDates: string[] = [
    '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01',
    '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-12-25'
  ];

  // 2. Query proposal statuses to find AGUARDAR_RETORNO_CIP and SALDO_RETORNADO
  const cipStatus = await prisma.proposalStatus.findFirst({
    where: {
      code: 'AGUARDAR_RETORNO_CIP',
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}),
    },
  });

  const saldoRetornadoStatus = await prisma.proposalStatus.findFirst({
    where: {
      code: 'SALDO_RETORNADO',
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}),
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

  // 3. Find proposals in CIP status
  const proposalsInCip = await prisma.proposal.findMany({
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

    // FIXED SLA logic without unreachable branches:
    if (businessDays >= targetDays) {
      // Reached or exceeded 5 business days: transition to SALDO_RETORNADO
      await prisma.$transaction(async (tx) => {
        // Update status
        await tx.proposal.update({
          where: { id: proposal.id },
          data: {
            statusId: saldoRetornadoStatus.id,
            updatedAt: now,
          },
        });

        // Add Status History
        await tx.statusHistory.create({
          data: {
            proposalId: proposal.id,
            tenantId: proposal.tenantId,
            statusId: saldoRetornadoStatus.id,
            statusName: saldoRetornadoStatus.name,
            notes: `Automação Cron CIP: Completou ${businessDays}/${targetDays} dias úteis em AGUARDAR RETORNO CIP. Saldo retornado.`,
          },
        });

        // Check idempotency for notification
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

        // Audit Log
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
}
