import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app, { prisma } from '../../server';

describe('Integration: Partner Promoter Binding & Single Source of Truth', () => {
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let sessionCookie: string;

  beforeAll(async () => {
    // Create Test Tenants
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Promoter Test Tenant',
        slug: `prom-test-${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    tenantId = tenant.id;

    const otherTenant = await prisma.tenant.create({
      data: {
        name: 'Other Tenant',
        slug: `other-prom-test-${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    otherTenantId = otherTenant.id;

    // Create Admin User for tenant
    const user = await prisma.user.create({
      data: {
        name: 'Admin Tester',
        email: `admin-tester-${Date.now()}@sentinel.com`,
        passwordHash: 'dummy',
        role: 'TENANT_ADMIN',
        active: true,
        tenantId,
      },
    });
    userId = user.id;

    await prisma.userTenantMembership.create({
      data: {
        userId,
        tenantId,
        role: 'TENANT_ADMIN',
        customPermissions: {
          set: [
            'partners.view',
            'partners.create',
            'partners.update',
            'partners.delete',
            'partners.crm.view',
            'partners.crm.create',
            'partners.crm.update',
            'partners.crm.admin',
          ],
        },
        active: true,
      },
    });

    const sessionToken = `session-prom-test-${Date.now()}`;
    await prisma.session.create({
      data: {
        userId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 1000 * 3600),
        effectiveTenantId: tenantId,
        activeRole: 'TENANT_ADMIN',
        activePermissions: {
          set: [
            'partners.view',
            'partners.create',
            'partners.update',
            'partners.delete',
            'partners.crm.view',
            'partners.crm.create',
            'partners.crm.update',
            'partners.crm.admin',
          ],
        },
      },
    });
    sessionCookie = `cg_session_id=${sessionToken}`;
  }, 30000);

  afterAll(async () => {
    await prisma.partner.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => {});
    await prisma.bankPromoter.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => {});
    await prisma.promoter.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => {});
    await prisma.bank.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.userTenantMembership.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } }).catch(() => {});
  });

  it('GET /api/promoters should return official promoters (DG, PROSPECTA, CREDITPRO) from PostgreSQL for tenant', async () => {
    const res = await request(app)
      .get('/api/promoters')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const names = res.body.map((p: any) => p.name);
    expect(names).toContain('DG');
    expect(names).toContain('PROSPECTA');
    expect(names).toContain('CREDITPRO');

    const dg = res.body.find((p: any) => p.name === 'DG');
    expect(dg).toBeDefined();
    expect(dg.id).toBeTruthy();
    expect(dg.tenantId).toBe(tenantId);
    expect(dg.status).toBe('ATIVO');
    expect(dg.active).toBe(true);
  }, 15000);

  it('POST /api/partners should bind selected promoter (DG) and persist in PostgreSQL', async () => {
    // 1. Get DG promoter ID
    const promRes = await request(app)
      .get('/api/promoters')
      .set('Cookie', sessionCookie);
    const dg = promRes.body.find((p: any) => p.name === 'DG');
    expect(dg).toBeDefined();

    // 2. Create partner with promoterId = dg.id
    const partnerPayload = {
      name: 'ALPHA CONSIG TESTE',
      code: `ALPHA_${Date.now()}`,
      promoterId: dg.id,
      email: 'alpha@teste.com',
      status: 'ATIVO',
    };

    const createRes = await request(app)
      .post('/api/partners')
      .set('Cookie', sessionCookie)
      .send(partnerPayload);

    expect(createRes.status).toBe(200);
    expect(createRes.body.id).toBeTruthy();
    expect(createRes.body.name).toBe('ALPHA CONSIG TESTE');
    expect(createRes.body.promoterId).toBe(dg.id);

    // 3. Verify in PostgreSQL directly
    const dbPartner = await prisma.partner.findUnique({
      where: { id: createRes.body.id },
      include: { promoter: true },
    });
    expect(dbPartner).not.toBeNull();
    expect(dbPartner?.promoterId).toBe(dg.id);
    expect(dbPartner?.promoter?.name).toBe('DG');

    // 4. Query GET /api/partners and confirm promoter object is returned
    const listRes = await request(app)
      .get('/api/partners')
      .set('Cookie', sessionCookie);
    expect(listRes.status).toBe(200);
    const fetched = listRes.body.find((p: any) => p.id === createRes.body.id);
    expect(fetched).toBeDefined();
    expect(fetched.promoterId).toBe(dg.id);
    expect(fetched.promoter?.name).toBe('DG');

    // 5. Query GET /api/partners?crm=true and confirm promoter object is returned
    const crmRes = await request(app)
      .get('/api/partners?crm=true')
      .set('Cookie', sessionCookie);
    expect(crmRes.status).toBe(200);
    const crmPartner = crmRes.body.data.find((p: any) => p.id === createRes.body.id);
    expect(crmPartner).toBeDefined();
    expect(crmPartner.promoterId).toBe(dg.id);
    expect(crmPartner.promoter?.name).toBe('DG');

    // 6. Query GET /api/partners/:id and confirm details include promoter
    const detailRes = await request(app)
      .get(`/api/partners/${createRes.body.id}`)
      .set('Cookie', sessionCookie);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(createRes.body.id);
    expect(detailRes.body.promoterId).toBe(dg.id);
    expect(detailRes.body.promoter?.name).toBe('DG');
  }, 20000);

  it('PUT /api/partners/:id should update linked promoter to PROSPECTA and persist in PostgreSQL', async () => {
    // 1. Get promoters
    const promRes = await request(app)
      .get('/api/promoters')
      .set('Cookie', sessionCookie);
    const dg = promRes.body.find((p: any) => p.name === 'DG');
    const prospecta = promRes.body.find((p: any) => p.name === 'PROSPECTA');

    // 2. Create partner with DG
    const partner = await prisma.partner.create({
      data: {
        tenantId,
        name: 'BETA CONSIG TESTE',
        code: `BETA_${Date.now()}`,
        promoterId: dg.id,
        status: 'ATIVO',
      },
    });

    // 3. Update to PROSPECTA
    const updateRes = await request(app)
      .put(`/api/partners/${partner.id}`)
      .set('Cookie', sessionCookie)
      .send({
        name: 'BETA CONSIG ATUALIZADO',
        promoterId: prospecta.id,
      });

    expect(updateRes.status).toBe(200);

    // 4. Verify in PostgreSQL
    const updatedDb = await prisma.partner.findUnique({
      where: { id: partner.id },
      include: { promoter: true },
    });
    expect(updatedDb?.promoterId).toBe(prospecta.id);
    expect(updatedDb?.promoter?.name).toBe('PROSPECTA');
  }, 20000);

  it('Adversarial: should reject linking a promoter belonging to another tenant', async () => {
    // 1. Create promoter in Other Tenant
    const otherPromoter = await prisma.promoter.create({
      data: {
        tenantId: otherTenantId,
        name: 'PROMOTORA DO OUTRO TENANT',
        code: `OTHER_${Date.now()}`,
        status: 'ATIVO',
      },
    });

    // 2. Attempt to create partner in Tenant Alpha with otherPromoter.id
    const res = await request(app)
      .post('/api/partners')
      .set('Cookie', sessionCookie)
      .send({
        name: 'CROSS TENANT MALICIOUS PARTNER',
        code: `CROSS_${Date.now()}`,
        promoterId: otherPromoter.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválida ou pertence a outro tenant/i);
  }, 15000);
});
