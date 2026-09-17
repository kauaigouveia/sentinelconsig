import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server';
import { runPortabilityCronServer } from '../../server/services/portabilityCronService';

describe('Integration: Portability Cron Service & Advisory Locking', () => {
  let tenantId: string;
  let clientId: string;
  let cipStatusId: string;
  let saldoRetornadoStatusId: string;

  beforeAll(async () => {
    // Clean up any potential stale records first to ensure a clean state
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    const tExisting = await prisma.tenant.findFirst({ where: { slug: 'empresa-cron' } });
    if (tExisting) {
      const tId = tExisting.id;
      await prisma.notification.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.statusHistory.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.proposal.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.client.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.proposalStatus.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tId } }).catch(() => {});
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    // Setup test Tenant
    const t = await prisma.tenant.create({
      data: { name: 'Empresa Cron', slug: 'empresa-cron', status: 'ACTIVE' },
    });
    tenantId = t.id;

    // Setup test Client
    const c = await prisma.client.create({
      data: {
        tenantId,
        cpf: '12345678901',
        fullName: 'Client Test Cron',
      },
    });
    clientId = c.id;

    // Create required statuses
    const s1 = await prisma.proposalStatus.create({
      data: {
        tenantId,
        code: 'AGUARDAR_RETORNO_CIP',
        name: 'Aguardar Retorno CIP',
        color: '#ff0000',
      },
    });
    cipStatusId = s1.id;

    const s2 = await prisma.proposalStatus.create({
      data: {
        tenantId,
        code: 'SALDO_RETORNADO',
        name: 'Saldo Retornado',
        color: '#00ff00',
      },
    });
    saldoRetornadoStatusId = s2.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    await prisma.notification.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.statusHistory.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.proposal.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.proposalStatus.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});
  });

  it('should run portability cron service successfully, acquiring advisory lock, transitioning old proposals, and creating timeline history + notification', async () => {
    // Create one proposal in CIP status that is old (6 business days ago, i.e. 8 calendar days ago to be safe from weekends)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const oldProposal = await prisma.proposal.create({
      data: {
        tenantId,
        clientId,
        proposalNumber: 'PROP-CRON-OLD',
        releasedValue: 5000,
        contractValue: 5500,
        installmentValue: 500,
        installmentsCount: 12,
        statusId: cipStatusId,
        retentionDeadline: oldDate,
        createdAt: oldDate,
        type: 'PORTABILIDADE',
      },
    });

    // Create a new proposal in CIP status (created today, should NOT transition)
    const newProposal = await prisma.proposal.create({
      data: {
        tenantId,
        clientId,
        proposalNumber: 'PROP-CRON-NEW',
        releasedValue: 1000,
        contractValue: 1100,
        installmentValue: 100,
        installmentsCount: 12,
        statusId: cipStatusId,
        retentionDeadline: new Date(),
        type: 'PORTABILIDADE',
      },
    });

    // Run the cron job service
    const result = await runPortabilityCronServer(prisma, tenantId);

    expect(result.success).toBe(true);
    expect(result.checkedCount).toBe(2);
    expect(result.saldoRetornadoCount).toBe(1);

    // Verify PROP-CRON-OLD shifted status to SALDO_RETORNADO
    const updatedOld = await prisma.proposal.findUnique({
      where: { id: oldProposal.id },
    });
    expect(updatedOld?.statusId).toBe(saldoRetornadoStatusId);

    // Verify PROP-CRON-NEW did NOT shift status
    const updatedNew = await prisma.proposal.findUnique({
      where: { id: newProposal.id },
    });
    expect(updatedNew?.statusId).toBe(cipStatusId);

    // Verify history record was created for old proposal
    const history = await prisma.statusHistory.findFirst({
      where: { proposalId: oldProposal.id },
    });
    expect(history).not.toBeNull();
    expect(history?.statusId).toBe(saldoRetornadoStatusId);
    expect(history?.notes).toContain('Automação Cron CIP');

    // Verify notification was generated for old proposal
    const notification = await prisma.notification.findFirst({
      where: { proposalId: oldProposal.id },
    });
    expect(notification).not.toBeNull();
    expect(notification?.type).toBe('CIP');

    // Verify AuditLog entry was written
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: oldProposal.id, action: 'AUTOMATION_PORTABILITY_TRANSITION' },
    });
    expect(audit).not.toBeNull();
  }, 30000);
});
