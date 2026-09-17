import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, prisma } from '../../server';
import type { Server } from 'http';

describe('Integration: User and Membership Lifecycle Management', () => {
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
    await prisma.session.deleteMany({ where: { user: { email: { in: ['master.userapi@sentinel.com', 'digitador.userapi@sentinel.com'] } } } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { user: { email: { in: ['master.userapi@sentinel.com', 'digitador.userapi@sentinel.com'] } } } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    const tExisting = await prisma.tenant.findFirst({ where: { slug: 'empresa-usuarios' } });
    if (tExisting) {
      const tId = tExisting.id;
      await prisma.proposal.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.client.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.userTenantMembership.deleteMany({ where: { tenantId: tId } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tId } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: { in: ['master.userapi@sentinel.com', 'digitador.userapi@sentinel.com'] } } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    // Create test tenant
    const t = await prisma.tenant.create({
      data: { name: 'Empresa Usuarios', slug: 'empresa-usuarios', status: 'ACTIVE' },
    });
    tenantId = t.id;

    // Create PLATFORM_MASTER user
    const master = await prisma.user.create({
      data: {
        name: 'Master User API',
        email: 'master.userapi@sentinel.com',
        passwordHash: 'dummy',
        role: 'PLATFORM_MASTER',
        active: true,
      },
    });
    masterUserId = master.id;

    // Setup Master session
    masterToken = 'master-userapi-session-token';
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
    await prisma.session.deleteMany({ where: { token: masterToken } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { contains: 'userapi' } } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should successfully create a new user via POST /api/users and auto-provision their UserTenantMembership', async () => {
    const newUserEmail = 'digitador.userapi@sentinel.com';

    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: {
        Cookie: `cg_session_id=${masterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Digitador Teste',
        email: newUserEmail,
        password: 'Password@123',
        role: 'DIGITADOR',
        tenantId,
        customPermissions: ['proposals.create'],
      }),
    });

    expect(res.status).toBe(200);
    const createdUser = await res.json();
    expect(createdUser.id).toBeDefined();
    expect(createdUser.email).toBe(newUserEmail);

    // Verify UserTenantMembership was auto-created in database
    const membership = await prisma.userTenantMembership.findUnique({
      where: {
        userId_tenantId: {
          userId: createdUser.id,
          tenantId,
        },
      },
    });

    expect(membership).not.toBeNull();
    expect(membership?.role).toBe('DIGITADOR');
    expect(membership?.customPermissions).toContain('proposals.create');
  });

  it('should successfully update user details via PUT /api/users/:id and sync details to UserTenantMembership', async () => {
    // Find previously created user
    const targetUser = await prisma.user.findFirst({
      where: { email: 'digitador.userapi@sentinel.com' },
    });

    expect(targetUser).not.toBeNull();

    const res = await fetch(`${baseUrl}/api/users/${targetUser!.id}`, {
      method: 'PUT',
      headers: {
        Cookie: `cg_session_id=${masterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Digitador Nome Atualizado',
        role: 'GESTOR',
        customPermissions: ['proposals.create', 'proposals.edit'],
        active: true,
      }),
    });

    expect(res.status).toBe(200);
    const updatedUser = await res.json();
    expect(updatedUser.user.name).toBe('Digitador Nome Atualizado');

    // Verify UserTenantMembership was synchronized with update
    const membership = await prisma.userTenantMembership.findUnique({
      where: {
        userId_tenantId: {
          userId: targetUser!.id,
          tenantId,
        },
      },
    });

    expect(membership?.role).toBe('GESTOR');
    expect(membership?.customPermissions).toContain('proposals.edit');
  });
});
