import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, prisma } from '../../server';
import type { Server } from 'http';
import fs from 'fs';
import path from 'path';

describe('Integration: Database Backup & Restore with SHA-256 Checksum Validation', () => {
  let server: Server;
  let baseUrl: string;
  let tenantId: string;
  let masterUserId: string;
  let masterToken: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'string' ? 0 : addr?.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Clean up any potential stale records first to ensure a clean state
    await prisma.session.deleteMany({ where: { user: { email: 'master.backup@sentinel.com' } } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { user: { email: 'master.backup@sentinel.com' } } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    const tExisting = await prisma.tenant.findFirst({ where: { slug: 'empresa-backup' } });
    if (tExisting) {
      const tId = tExisting.id;
      await prisma.backup.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.proposal.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.client.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.userTenantMembership.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tId } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: 'master.backup@sentinel.com' } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    // Create test tenant
    const t = await prisma.tenant.create({
      data: { name: 'Empresa Backup', slug: 'empresa-backup', status: 'ACTIVE' },
    });
    tenantId = t.id;

    // Create PLATFORM_MASTER user
    const master = await prisma.user.create({
      data: {
        name: 'Master Backup',
        email: 'master.backup@sentinel.com',
        passwordHash: 'dummy',
        role: 'PLATFORM_MASTER',
        active: true,
      },
    });
    masterUserId = master.id;

    // Setup Master session
    masterToken = 'master-backup-session-token';
    await prisma.session.create({
      data: {
        userId: masterUserId,
        token: masterToken,
        expiresAt: new Date(Date.now() + 1000 * 3600),
        effectiveTenantId: tenantId,
        activeRole: 'PLATFORM_MASTER',
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    await prisma.backup.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.proposal.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.client.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: masterUserId } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: masterUserId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should create backup snapshot file with correct JSON serialization and persist details in DB', async () => {
    const res = await fetch(`${baseUrl}/api/admin/backups`, {
      method: 'POST',
      headers: {
        Cookie: `cg_session_id=${masterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Manual Integration Snapshot',
        type: 'MANUAL',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.backup.id).toBeDefined();
    expect(data.backup.status).toBe('COMPLETED');
    expect(data.backup.checksumSha256).toBeDefined();

    // Verify file exists on server disk
    const fileExists = fs.existsSync(data.backup.storagePath);
    expect(fileExists).toBe(true);

    // Verify content calculation and integrity of generated JSON file
    const content = fs.readFileSync(data.backup.storagePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.data.users).toBeDefined();
    expect(parsed.data.proposals).toBeDefined();
  });

  it('should succeed in restoring the backup snapshot after verifying SHA-256 hash checksum matches', async () => {
    const listRes = await fetch(`${baseUrl}/api/admin/backups`, {
      headers: { Cookie: `cg_session_id=${masterToken}` },
    });
    const backups = await listRes.json();
    const targetBackup = backups[0];

    expect(targetBackup).toBeDefined();

    const restoreRes = await fetch(`${baseUrl}/api/admin/backups/${targetBackup.id}/restore`, {
      method: 'POST',
      headers: { Cookie: `cg_session_id=${masterToken}` },
    });

    expect(restoreRes.status).toBe(200);
    const restoreData = await restoreRes.json();
    expect(restoreData.success).toBe(true);
    expect(restoreData.message).toContain('sucesso');

    // Verify pre-restore snapshot record was auto-created
    const preSnap = await prisma.backup.findFirst({
      where: { type: 'PRE_RESTORE', tenantId: null },
    });
    expect(preSnap).not.toBeNull();

    // Verify audit log entry was logged
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'backup.restored' },
    });
    expect(audit).not.toBeNull();
  });
});
