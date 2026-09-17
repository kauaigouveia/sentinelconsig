import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, prisma } from '../../server';
import type { Server } from 'http';

describe('Integration: Multi-tenant Isolation & Adversarial Input Protection', () => {
  let server: Server;
  let baseUrl: string;
  let tenantAlphaId: string;
  let tenantBetaId: string;
  let alphaUserId: string;
  let betaUserId: string;
  let clientAlphaId: string;
  let clientBetaId: string;

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
    const existingTenants = await prisma.tenant.findMany({
      where: { slug: { in: ['tenant-alpha', 'tenant-beta'] } }
    });
    for (const t of existingTenants) {
      await prisma.proposal.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
      await prisma.client.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
      await prisma.userTenantMembership.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
    }
    await prisma.userTenantMembership.deleteMany({ where: { user: { email: { in: ['alpha@sentinel.com', 'beta@sentinel.com'] } } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: ['alpha@sentinel.com', 'beta@sentinel.com'] } } }).catch(() => {});

    // Create Tenant Alpha
    const tAlpha = await prisma.tenant.create({
      data: { name: 'Tenant Alpha', slug: 'tenant-alpha', status: 'ACTIVE' },
    });
    tenantAlphaId = tAlpha.id;

    // Create Tenant Beta
    const tBeta = await prisma.tenant.create({
      data: { name: 'Tenant Beta', slug: 'tenant-beta', status: 'ACTIVE' },
    });
    tenantBetaId = tBeta.id;

    // Create test clients
    const cAlpha = await prisma.client.create({
      data: {
        tenantId: tenantAlphaId,
        cpf: '11111111111',
        fullName: 'Client Alpha',
      },
    });
    clientAlphaId = cAlpha.id;

    const cBeta = await prisma.client.create({
      data: {
        tenantId: tenantBetaId,
        cpf: '22222222222',
        fullName: 'Client Beta',
      },
    });
    clientBetaId = cBeta.id;

    // Create user Alpha
    const uAlpha = await prisma.user.create({
      data: {
        name: 'User Alpha',
        email: 'alpha@sentinel.com',
        passwordHash: 'dummy',
        role: 'DIGITADOR',
        active: true,
        tenantId: tenantAlphaId,
      },
    });
    alphaUserId = uAlpha.id;

    // Create user Beta
    const uBeta = await prisma.user.create({
      data: {
        name: 'User Beta',
        email: 'beta@sentinel.com',
        passwordHash: 'dummy',
        role: 'DIGITADOR',
        active: true,
        tenantId: tenantBetaId,
      },
    });
    betaUserId = uBeta.id;

    // Memberships
    await prisma.userTenantMembership.create({
      data: {
        userId: alphaUserId,
        tenantId: tenantAlphaId,
        role: 'DIGITADOR',
        customPermissions: { set: ['proposals.view'] },
        active: true,
      },
    });

    await prisma.userTenantMembership.create({
      data: {
        userId: betaUserId,
        tenantId: tenantBetaId,
        role: 'DIGITADOR',
        customPermissions: { set: ['proposals.view'] },
        active: true,
      },
    });

    // Seed test proposals
    await prisma.proposal.create({
      data: {
        tenantId: tenantAlphaId,
        clientId: clientAlphaId,
        proposalNumber: 'PROP-ALPHA-123',
        releasedValue: 1000,
        contractValue: 1200,
        installmentValue: 100,
        installmentsCount: 12,
        type: 'PORTABILIDADE',
      },
    });

    await prisma.proposal.create({
      data: {
        tenantId: tenantBetaId,
        clientId: clientBetaId,
        proposalNumber: 'PROP-BETA-456',
        releasedValue: 2000,
        contractValue: 2400,
        installmentValue: 200,
        installmentsCount: 12,
        type: 'PORTABILIDADE',
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.proposal.deleteMany({ where: { tenantId: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});
    await prisma.client.deleteMany({ where: { tenantId: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: { in: [alphaUserId, betaUserId] } } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { userId: { in: [alphaUserId, betaUserId] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [alphaUserId, betaUserId] } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should strictly return only Tenant Alpha proposals when accessed by Tenant Alpha user, ignoring any query parameters or headers specifying Tenant Beta', async () => {
    const alphaToken = 'session-alpha-token';
    await prisma.session.create({
      data: {
        userId: alphaUserId,
        token: alphaToken,
        expiresAt: new Date(Date.now() + 1000 * 3600),
        effectiveTenantId: tenantAlphaId,
        activeRole: 'DIGITADOR',
        activePermissions: { set: ['proposals.view'] },
      },
    });

    // Attempt adversarial query parameter and header injection
    const res = await fetch(`${baseUrl}/api/proposals?tenantId=${tenantBetaId}`, {
      headers: {
        Cookie: `cg_session_id=${alphaToken}`,
        'X-Tenant-Id': tenantBetaId,
      },
    });

    expect(res.status).toBe(200);
    const proposals = await res.json();

    // Verify only alpha proposal is returned
    expect(proposals.length).toBe(1);
    expect(proposals[0].proposalNumber).toBe('PROP-ALPHA-123');
    expect(proposals[0].tenantId).toBe(tenantAlphaId);
  });

  it('should block Tenant Alpha user from reading Tenant Beta proposals directly', async () => {
    const alphaToken = 'session-alpha-token';

    // Verify that attempting to fetch proposals does not leak beta data
    const res = await fetch(`${baseUrl}/api/proposals`, {
      headers: {
        Cookie: `cg_session_id=${alphaToken}`,
      },
    });

    const proposals = await res.json();
    const leakedBeta = proposals.some((p: any) => p.proposalNumber === 'PROP-BETA-456');
    expect(leakedBeta).toBe(false);
  });
});
