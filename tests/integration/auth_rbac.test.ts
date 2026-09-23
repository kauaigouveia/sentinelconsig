import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, prisma } from '../../server';
import type { Server } from 'http';

describe('Integration: Multi-tenant RBAC & Tenant Switching', () => {
  let server: Server;
  let baseUrl: string;
  let tenant1Id: string;
  let tenant2Id: string;
  let masterUserId: string;
  let regularUserId: string;

  beforeAll(async () => {
    // Start Express server on ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'string' ? 0 : addr?.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Clean up any potential stale records first to ensure a clean state
    await prisma.session.deleteMany({ where: { token: { in: ['regular-session-token-123', 'master-session-token-999'] } } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    const existingTenants = await prisma.tenant.findMany({
      where: { slug: { in: ['empresa-alfa', 'empresa-beta'] } }
    });
    for (const t of existingTenants) {
      try {
        await prisma.proposal.deleteMany({ where: { tenantId: t.id } });
        await prisma.client.deleteMany({ where: { tenantId: t.id } });
        await prisma.auditLog.deleteMany({ where: { tenantId: t.id } });
        await prisma.userTenantMembership.deleteMany({ where: { tenantId: t.id } });
        await prisma.tenant.delete({ where: { id: t.id } });
      } catch (err: any) {
        console.error(`[TEARDOWN ERROR] Failed to delete tenant ${t.slug}:`, err.message || err);
        throw err;
      }
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { user: { email: { in: ['master.integration@sentinel.com', 'regular.integration@sentinel.com'] } } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: ['master.integration@sentinel.com', 'regular.integration@sentinel.com'] } } }).catch(() => {});

    // Create active test tenants
    const t1 = await prisma.tenant.create({
      data: { name: 'Empresa Alfa', slug: 'empresa-alfa', status: 'ACTIVE' },
    });
    tenant1Id = t1.id;

    const t2 = await prisma.tenant.create({
      data: { name: 'Empresa Beta', slug: 'empresa-beta', status: 'ACTIVE' },
    });
    tenant2Id = t2.id;

    // Create Platform Master user
    const master = await prisma.user.create({
      data: {
        name: 'Master Integracao',
        email: 'master.integration@sentinel.com',
        passwordHash: 'dummy',
        role: 'PLATFORM_MASTER',
        active: true,
      },
    });
    masterUserId = master.id;

    // Create Regular user
    const regular = await prisma.user.create({
      data: {
        name: 'Regular Integracao',
        email: 'regular.integration@sentinel.com',
        passwordHash: 'dummy',
        role: 'DIGITADOR',
        active: true,
        tenantId: tenant1Id,
      },
    });
    regularUserId = regular.id;

    // Setup active membership for regular user in Tenant 1 (Alfa)
    await prisma.userTenantMembership.create({
      data: {
        userId: regularUserId,
        tenantId: tenant1Id,
        role: 'DIGITADOR',
        customPermissions: { set: ['proposals.view'] },
        active: true,
      },
    });
  });

  afterAll(async () => {
    // Clean up DB records in reverse order
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: { in: [masterUserId, regularUserId] } } }).catch(() => {});
    await prisma.proposal.deleteMany({ where: { tenantId: { in: [tenant1Id, tenant2Id] } } }).catch(() => {});
    await prisma.client.deleteMany({ where: { tenantId: { in: [tenant1Id, tenant2Id] } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenant1Id, tenant2Id] } } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { userId: { in: [masterUserId, regularUserId] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [masterUserId, regularUserId] } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant1Id, tenant2Id] } } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    // Close server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should reject requests with missing cookies (fail-closed)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/session`);
    expect(res.status).toBe(401);
  });

  it('should authenticate correctly with regular user session and return tenant-specific context', async () => {
    const token = 'regular-session-token-123';
    await prisma.session.create({
      data: {
        userId: regularUserId,
        token,
        expiresAt: new Date(Date.now() + 1000 * 3600),
        effectiveTenantId: tenant1Id,
        activeRole: 'DIGITADOR',
        activePermissions: { set: ['proposals.view'] },
      },
    });

    const res = await fetch(`${baseUrl}/api/auth/session`, {
      headers: {
        Cookie: `cg_session_id=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authenticated).toBe(true);
    expect(data.user.email).toBe('regular.integration@sentinel.com');
    expect(data.user.role).toBe('DIGITADOR');
    expect(data.effectiveTenantId).toBe(tenant1Id);
  });

  it('should allow regular user to switch to another company where they have an active membership', async () => {
    // Add Beta membership for regular user
    await prisma.userTenantMembership.create({
      data: {
        userId: regularUserId,
        tenantId: tenant2Id,
        role: 'GESTOR',
        customPermissions: { set: ['proposals.view', 'proposals.create'] },
        active: true,
      },
    });

    const token = 'regular-session-token-123';

    // Request switch to Beta
    const switchRes = await fetch(`${baseUrl}/api/auth/switch-tenant`, {
      method: 'POST',
      headers: {
        Cookie: `cg_session_id=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenantId: tenant2Id }),
    });

    expect(switchRes.status).toBe(200);
    const switchData = await switchRes.json();
    expect(switchData.success).toBe(true);
    expect(switchData.role).toBe('GESTOR');
    expect(switchData.tenantId).toBe(tenant2Id);

    // Verify change is persisted in session check
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: `cg_session_id=${token}` },
    });
    const sessionData = await sessionRes.json();
    expect(sessionData.effectiveTenantId).toBe(tenant2Id);
    expect(sessionData.user.role).toBe('GESTOR');
  });

  it('should block regular user from switching to a company where they do not have active membership', async () => {
    const invasorSlug = `empresa-invasora-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const unassociatedTenant = await prisma.tenant.create({
      data: { name: 'Empresa Invasora', slug: invasorSlug, status: 'ACTIVE' },
    });

    const token = 'regular-session-token-123';

    try {
      const switchRes = await fetch(`${baseUrl}/api/auth/switch-tenant`, {
        method: 'POST',
        headers: {
          Cookie: `cg_session_id=${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId: unassociatedTenant.id }),
      });

      expect(switchRes.status).toBe(403);
    } finally {
      // Clean up
      await prisma.tenant.delete({ where: { id: unassociatedTenant.id } }).catch(() => {});
    }
  });

  it('should allow PLATFORM_MASTER to switch globally to any active tenant', async () => {
    const masterToken = 'master-session-token-999';
    await prisma.session.create({
      data: {
        userId: masterUserId,
        token: masterToken,
        expiresAt: new Date(Date.now() + 1000 * 3600),
        effectiveTenantId: tenant1Id,
        activeRole: 'PLATFORM_MASTER',
      },
    });

    const switchRes = await fetch(`${baseUrl}/api/auth/switch-tenant`, {
      method: 'POST',
      headers: {
        Cookie: `cg_session_id=${masterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenantId: tenant2Id }),
    });

    expect(switchRes.status).toBe(200);
    const switchData = await switchRes.json();
    expect(switchData.success).toBe(true);
    expect(switchData.role).toBe('PLATFORM_MASTER');
    expect(switchData.tenantId).toBe(tenant2Id);
  });
});
