import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, prisma } from '../../server';
import type { Server } from 'http';

describe('Integration: User and Membership Lifecycle Management', () => {
  let server: Server;
  let baseUrl: string;
  let tenantId: string;
  let masterUserId: string;
  let masterToken: string;
  let runSuffix: string;
  let masterEmail: string;
  let newUserEmail: string;
  let createdUserId: string;

  beforeAll(async () => {
    runSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tenantSlug = `empresa-usuarios-${runSuffix}`;
    masterEmail = `master.userapi.${runSuffix}@sentinel.com`;
    newUserEmail = `digitador.userapi.${runSuffix}@sentinel.com`;
    masterToken = `master-userapi-token-${runSuffix}`;

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'string' ? 0 : addr?.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Create unique test tenant
    const t = await prisma.tenant.create({
      data: { name: `Empresa Usuarios ${runSuffix}`, slug: tenantSlug, status: 'ACTIVE' },
    });
    tenantId = t.id;

    // Create PLATFORM_MASTER user
    const master = await prisma.user.create({
      data: {
        name: 'Master User API',
        email: masterEmail,
        passwordHash: 'dummy',
        role: 'PLATFORM_MASTER',
        active: true,
      },
    });
    masterUserId = master.id;

    // Setup Master session
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
    // Isolated Cleanup: only clean up our own test records
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    await prisma.session.deleteMany({ where: { token: masterToken } }).catch(() => {});
    if (tenantId) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.userTenantMembership.deleteMany({ where: { tenantId } }).catch(() => {});
    }
    const userIdsToDelete = [masterUserId, createdUserId].filter(Boolean);
    if (userIdsToDelete.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIdsToDelete } } }).catch(() => {});
      await prisma.userTenantMembership.deleteMany({ where: { userId: { in: userIdsToDelete } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: userIdsToDelete } } }).catch(() => {});
    }
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should successfully create a new user via POST /api/users and auto-provision their UserTenantMembership', async () => {
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
    createdUserId = createdUser.id;

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
      where: { email: newUserEmail },
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
