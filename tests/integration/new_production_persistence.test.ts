import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, prisma } from '../../server';
import type { Server } from 'http';

describe('Integration: New Production Persistence and Deletion Sync', () => {
  let server: Server;
  let baseUrl: string;
  let tenantId: string;
  let userId: string;
  let clientId: string;
  let partnerId: string;
  let bankId: string;
  let promoterId: string;
  let productId: string;
  let statusId: string;
  const uniqueId = Math.random().toString(36).substring(2, 10);
  const sessionToken = `persistence-token-${uniqueId}`;

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

    // Create Test Tenant with unique slug to guarantee idempotency
    const tenant = await prisma.tenant.create({
      data: { name: `Persistence Tenant ${uniqueId}`, slug: `persistence-tenant-${uniqueId}`, status: 'ACTIVE' },
    });
    tenantId = tenant.id;

    // Create User with unique email
    const user = await prisma.user.create({
      data: {
        name: 'Persistence User',
        email: `persistence.user.${uniqueId}@sentinel.com`,
        passwordHash: 'dummy',
        role: 'GESTOR',
        active: true,
        tenantId,
      },
    });
    userId = user.id;

    // Setup active membership
    await prisma.userTenantMembership.create({
      data: {
        userId,
        tenantId,
        role: 'GESTOR',
        active: true,
      },
    });

    // Create Session
    await prisma.session.create({
      data: {
        userId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 1000 * 3600),
        effectiveTenantId: tenantId,
        activeRole: 'GESTOR',
        activePermissions: { set: ['proposals.view', 'proposals.create', 'proposals.delete'] },
      },
    });

    // Create Client
    const client = await prisma.client.create({
      data: {
        tenantId,
        cpf: '12345678901',
        fullName: 'TEST PERSISTENCE CLIENT',
      },
    });
    clientId = client.id;

    // Create Partner
    const partner = await prisma.partner.create({
      data: {
        tenantId,
        name: 'Test Partner',
        code: `TEST_PARTNER_${uniqueId}`,
        status: 'ACTIVE',
      },
    });
    partnerId = partner.id;

    // Create Bank
    const bank = await prisma.bank.create({
      data: {
        tenantId,
        name: 'Banco de Testes',
        code: '999',
        status: 'ATIVO',
      },
    });
    bankId = bank.id;

    // Create Promoter
    const promoter = await prisma.promoter.create({
      data: {
        tenantId,
        name: 'Promotora de Testes',
        code: 'PROM_TEST',
        status: 'ATIVO',
      },
    });
    promoterId = promoter.id;

    // Setup Bank-Promoter relation (enable promoter for bank)
    await prisma.bankPromoter.create({
      data: {
        tenantId,
        bankId,
        promoterId,
        login: 'test_login',
      },
    });

    // Create Product
    const product = await prisma.product.create({
      data: {
        name: 'PORTABILIDADE TEST',
        code: 'PORT_TEST',
        type: 'PORTABILIDADE',
        active: true,
        scope: 'GLOBAL',
      },
    });
    productId = product.id;

    // Create Status
    const status = await prisma.proposalStatus.create({
      data: {
        tenantId,
        name: 'Aguardando Formalização',
        code: 'AGUARDAR_FORMALIZACAO',
        responsibleGroup: 'CLIENTE',
        color: '#ff0000',
        order: 1,
      },
    });
    statusId = status.id;
  });

  afterAll(async () => {
    // Teardown everything
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER USER`).catch(() => {});
    await prisma.statusHistory.deleteMany({ where: { proposal: { tenantId } } }).catch(() => {});
    await prisma.proposal.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.client.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.partner.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.bankPromoter.deleteMany({ where: { bankId } }).catch(() => {});
    await prisma.promoter.deleteMany({ where: { id: promoterId } }).catch(() => {});
    await prisma.bank.deleteMany({ where: { id: bankId } }).catch(() => {});
    await prisma.proposalStatus.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER USER`).catch(() => {});

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Scenario 1: Creates proposal successfully via API and ensures it is returned', async () => {
    const postRes = await fetch(`${baseUrl}/api/proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cg_session_id=${sessionToken}`,
      },
      body: JSON.stringify({
        proposalNumber: 'ADE-TEST-111',
        clientId,
        bankId,
        promoterId,
        partnerId,
        productId,
        statusId,
        type: 'PORTABILIDADE',
        releasedValue: 1500,
        contractValue: 1500,
      }),
    });

    expect(postRes.status).toBe(201);
    const created = await postRes.json();
    expect(created.proposalNumber).toBe('ADE-TEST-111');

    // Fetch and make sure it is there
    const getRes = await fetch(`${baseUrl}/api/proposals`, {
      headers: { Cookie: `cg_session_id=${sessionToken}` },
    });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.some((p: any) => p.proposalNumber === 'ADE-TEST-111')).toBe(true);
  });

  it('Scenario 2: Deletes a proposal persistently and confirms it never reappears even after subsequent actions', async () => {
    // 1. Find proposal ID
    const getRes = await fetch(`${baseUrl}/api/proposals`, {
      headers: { Cookie: `cg_session_id=${sessionToken}` },
    });
    const list = await getRes.json();
    const target = list.find((p: any) => p.proposalNumber === 'ADE-TEST-111');
    expect(target).toBeDefined();

    // 2. DELETE IT
    const deleteRes = await fetch(`${baseUrl}/api/proposals/${target.id}`, {
      method: 'DELETE',
      headers: { Cookie: `cg_session_id=${sessionToken}` },
    });
    expect(deleteRes.status).toBe(200);

    // 3. Confirm it is gone immediately
    const getResAfter = await fetch(`${baseUrl}/api/proposals`, {
      headers: { Cookie: `cg_session_id=${sessionToken}` },
    });
    const listAfter = await getResAfter.json();
    expect(listAfter.some((p: any) => p.id === target.id)).toBe(false);

    // 4. Create another proposal to verify synchronization or state refresh does not leak/resurrect the old one
    const postRes2 = await fetch(`${baseUrl}/api/proposals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `cg_session_id=${sessionToken}`,
      },
      body: JSON.stringify({
        proposalNumber: 'ADE-TEST-222',
        clientId,
        bankId,
        promoterId,
        partnerId,
        productId,
        statusId,
        type: 'PORTABILIDADE',
        releasedValue: 2000,
        contractValue: 2000,
      }),
    });
    expect(postRes2.status).toBe(201);

    // 5. Final verification: old one remains deleted, new one exists
    const getResFinal = await fetch(`${baseUrl}/api/proposals`, {
      headers: { Cookie: `cg_session_id=${sessionToken}` },
    });
    const listFinal = await getResFinal.json();
    expect(listFinal.some((p: any) => p.proposalNumber === 'ADE-TEST-111')).toBe(false);
    expect(listFinal.some((p: any) => p.proposalNumber === 'ADE-TEST-222')).toBe(true);
  });
}, 60000);
