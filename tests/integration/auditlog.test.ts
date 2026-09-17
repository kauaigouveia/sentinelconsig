import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../server';
import { AuditLogService } from '../../server/services/auditLogService';

describe('Integration: Cryptographic AuditLog SHA-256 Hash Chaining & Tamper Detection', () => {
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    // Disable triggers to clean up potential stale records first to ensure a clean state
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    
    // Clean up stale user if exists
    await prisma.user.deleteMany({ where: { email: 'user-audit@sentinel.com' } }).catch(() => {});

    const tExisting = await prisma.tenant.findFirst({ where: { slug: 'empresa-audit' } });
    if (tExisting) {
      await prisma.auditLog.deleteMany({ where: { tenantId: tExisting.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tExisting.id } }).catch(() => {});
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    // Setup unique tenant for isolated audit logging tests
    const t = await prisma.tenant.create({
      data: { name: 'Empresa Audit', slug: 'empresa-audit', status: 'ACTIVE' },
    });
    tenantId = t.id;

    // Create real user for foreign key constraint
    const u = await prisma.user.create({
      data: {
        name: 'Audit User',
        email: 'user-audit@sentinel.com',
        passwordHash: 'dummy',
        role: 'DIGITADOR',
        active: true,
      },
    });
    userId = u.id;
  });

  afterAll(async () => {
    // Clean up all test audit logs, user and test tenant
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});
  });

  it('should create successive audit logs forming a valid cryptographic SHA-256 hash chain and verify integrity successfully', async () => {
    // Write 1st log entry
    const log1 = await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName: 'Audit Operator',
      action: 'PROPOSAL_CREATED',
      entity: 'Proposal',
      entityId: 'prop-111',
      newData: { amount: 500 },
    });

    if (!log1) {
      console.error('AuditLogService.record returned falsy. DLQ:', AuditLogService.getFailedQueue());
    }

    expect(log1).not.toBeNull();
    expect(log1?.recordHash).toBeDefined();

    // Write 2nd log entry (should automatically link to the previous log)
    const log2 = await AuditLogService.record(prisma, {
      tenantId,
      userId,
      userName: 'Audit Operator',
      action: 'PROPOSAL_APPROVED',
      entity: 'Proposal',
      entityId: 'prop-111',
      oldData: { amount: 500 },
      newData: { amount: 500, status: 'APPROVED' },
    });

    expect(log2).not.toBeNull();
    // 2nd log's previousHash MUST match 1st log's recordHash
    expect(log2?.previousHash).toBe(log1?.recordHash);

    // Verify chain is valid
    const verification = await AuditLogService.verifyAuditLogIntegrity(prisma, tenantId);
    expect(verification.valid).toBe(true);
    expect(verification.status).toBe('VALID');
    expect(verification.checkedCount).toBe(2);
  });

  it('should detect tamper-evidence (chain breakage) if an intermediate audit log entry is maliciously modified directly in the database', async () => {
    // Find log 1 in DB
    const firstLog = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'PROPOSAL_CREATED' },
    });

    expect(firstLog).not.toBeNull();

    // Maliciously tamper with the data of the first log entry directly (bypassing the AuditLogService!)
    // To simulate direct database tampering, we disable triggers, perform the update, and re-enable them.
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`);
    await prisma.auditLog.update({
      where: { id: firstLog!.id },
      data: {
        newData: JSON.stringify({ amount: 999999 }), // Altered payload!
      },
    });
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`);

    // Run verification on the chain
    const verification = await AuditLogService.verifyAuditLogIntegrity(prisma, tenantId);

    // The integrity check MUST fail!
    expect(verification.valid).toBe(false);
    expect(verification.status).toBe('INVALID');
    expect(verification.brokenAtId).toBe(firstLog!.id);
    expect(verification.error).toContain('Adulteração detectada');
  });
});
