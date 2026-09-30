import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../../server/services/passwordService';

describe('Partner Portal Auto-Provisioning & Security Gate Suite', () => {
  let tenantAId: string;
  let tenantBId: string;
  let adminUserAId: string;
  let adminTokenA: string;
  let adminUserBId: string;
  let adminTokenB: string;

  const testTimestamp = Date.now();
  const emailShared = `shared.partner.${testTimestamp}@example.com`;

  let createdPartnerAId: string;
  let createdPartnerAAccessId: string;
  let temporaryPasswordA: string;

  let createdPartnerNoEmailId: string;
  let createdPartnerBId: string;

  beforeAll(async () => {
    // 1. Setup Tenant A
    const tenantA = await prisma.tenant.create({
      data: {
        name: 'GRUPO EVOLVE TEST A',
        slug: `evolve-a-${testTimestamp}`,
        status: 'ACTIVE',
      },
    });
    tenantAId = tenantA.id;

    // 2. Setup Tenant B
    const tenantB = await prisma.tenant.create({
      data: {
        name: 'GRUPO EVOLVE TEST B',
        slug: `evolve-b-${testTimestamp}`,
        status: 'ACTIVE',
      },
    });
    tenantBId = tenantB.id;

    const pwdHash = await hashPassword('AdminSecurePass123!');

    // Admin Tenant A
    const adminUserA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        name: 'Admin Evolve A',
        email: `admin.a.${testTimestamp}@evolve.com`,
        passwordHash: pwdHash,
        role: 'TENANT_ADMIN',
        active: true,
      },
    });
    adminUserAId = adminUserA.id;
    adminTokenA = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        userId: adminUserA.id,
        token: adminTokenA,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        effectiveTenantId: tenantAId,
        activeRole: 'TENANT_ADMIN',
        activePermissions: ['partners.create', 'partners.view', 'partners.update', 'partners.crm.admin'],
      },
    });

    // Admin Tenant B
    const adminUserB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        name: 'Admin Evolve B',
        email: `admin.b.${testTimestamp}@evolve.com`,
        passwordHash: pwdHash,
        role: 'TENANT_ADMIN',
        active: true,
      },
    });
    adminUserBId = adminUserB.id;
    adminTokenB = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        userId: adminUserB.id,
        token: adminTokenB,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        effectiveTenantId: tenantBId,
        activeRole: 'TENANT_ADMIN',
        activePermissions: ['partners.create', 'partners.view', 'partners.update', 'partners.crm.admin'],
      },
    });
  });

  afterAll(async () => {
    // Cleanup sessions, accesses, partners, tenants
    await prisma.partnerPortalSession.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    }).catch(() => {});
    await prisma.partnerPortalAccess.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    }).catch(() => {});
    await prisma.partner.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    }).catch(() => {});
    await prisma.session.deleteMany({
      where: { userId: { in: [adminUserAId, adminUserBId] } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [adminUserAId, adminUserBId] } },
    }).catch(() => {});
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    }).catch(() => {});
  });

  // 1. Criar Partner com e-mail → Partner criado → PartnerPortalAccess criado
  it('1. Deve criar Partner e provisionar automaticamente PartnerPortalAccess atômico ao fornecer e-mail válido', async () => {
    const res = await request(app)
      .post('/api/partners')
      .set('Cookie', [`cg_session_id=${adminTokenA}`])
      .send({
        name: 'KAUAI COMERCIAL',
        code: `KAUAI-${testTimestamp}`,
        email: emailShared,
        phone: '11988887777',
        status: 'ATIVO',
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('KAUAI COMERCIAL');
    expect(res.body.portalAccess).toBeDefined();
    expect(res.body.portalAccess.created).toBe(true);
    expect(res.body.portalAccess.status).toBe('ACTIVE');
    expect(res.body.portalAccess.email).toBe(emailShared);
    expect(res.body.portalAccess.temporaryPassword).toBeDefined();
    expect(res.body.portalAccess.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    createdPartnerAId = res.body.id;
    temporaryPasswordA = res.body.portalAccess.temporaryPassword;

    // Verifica no PostgreSQL
    const access = await prisma.partnerPortalAccess.findFirst({
      where: { partnerId: createdPartnerAId, tenantId: tenantAId },
    });
    expect(access).not.toBeNull();
    expect(access?.email).toBe(emailShared);
    expect(access?.active).toBe(true);
    expect(access?.mustChangePassword).toBe(true);
    expect(access?.lastLoginAt).toBeNull();
    createdPartnerAAccessId = access!.id;
  });

  // 2. Criar Partner sem e-mail → Partner criado → acesso pendente
  it('2. Deve criar Partner sem e-mail com portalAccess = PENDENTE e mensagem informativa', async () => {
    const res = await request(app)
      .post('/api/partners')
      .set('Cookie', [`cg_session_id=${adminTokenA}`])
      .send({
        name: 'ALPHA SEM EMAIL',
        code: `ALPHA-${testTimestamp}`,
        status: 'ATIVO',
      });

    expect(res.status).toBe(200);
    expect(res.body.portalAccess).toBeDefined();
    expect(res.body.portalAccess.created).toBe(false);
    expect(res.body.portalAccess.status).toBe('PENDING');
    expect(res.body.portalAccess.message).toContain('não há e-mail cadastrado');
    expect(res.body.portalAccess.temporaryPassword).toBeUndefined();

    createdPartnerNoEmailId = res.body.id;

    // Confirma que nenhum PartnerPortalAccess foi criado
    const access = await prisma.partnerPortalAccess.findFirst({
      where: { partnerId: createdPartnerNoEmailId },
    });
    expect(access).toBeNull();
  });

  // 3. Criar Partner duas vezes → não criar acesso duplicado / rejeitar duplicação
  it('3. Não deve duplicar login nem criar acessos extras ao tentar recriar o mesmo parceiro', async () => {
    const res = await request(app)
      .post('/api/partners')
      .set('Cookie', [`cg_session_id=${adminTokenA}`])
      .send({
        name: 'KAUAI COMERCIAL',
        code: `KAUAI-${testTimestamp}`,
        email: emailShared,
      });

    expect(res.status).toBe(400);

    const totalAccesses = await prisma.partnerPortalAccess.count({
      where: { partnerId: createdPartnerAId, tenantId: tenantAId },
    });
    expect(totalAccesses).toBe(1);
  });

  // 4. Editar Partner → não criar acesso novo
  it('4. Ao editar dados cadastrais do Partner, não deve criar registros adicionais de PartnerPortalAccess', async () => {
    const res = await request(app)
      .put(`/api/partners/${createdPartnerAId}`)
      .set('Cookie', [`cg_session_id=${adminTokenA}`])
      .send({
        name: 'KAUAI COMERCIAL ATUALIZADO',
        phone: '11999990000',
        status: 'ATIVO',
      });

    expect(res.status).toBe(200);

    const accesses = await prisma.partnerPortalAccess.findMany({
      where: { partnerId: createdPartnerAId, tenantId: tenantAId },
    });
    expect(accesses.length).toBe(1);
  });

  // 5. Reset de acesso → nova senha temporária → sessão antiga invalidada
  it('5. Reset de acesso deve gerar nova senha temporária e invalidar sessões anteriores', async () => {
    // 5.1 Realizar login com senha temporária atual para criar uma sessão
    const loginRes = await request(app)
      .post('/api/partner-portal/auth/login')
      .send({
        email: emailShared,
        password: temporaryPasswordA,
      });

    expect(loginRes.status).toBe(200);
    const oldSessionToken = loginRes.body.token;
    expect(oldSessionToken).toBeDefined();

    // Valida que a sessão está ativa
    const checkSession1 = await request(app)
      .get('/api/partner-portal/auth/session')
      .set('Cookie', [`cg_partner_session_id=${oldSessionToken}`]);
    expect(checkSession1.status).toBe(200);
    expect(checkSession1.body.authenticated).toBe(true);

    // 5.2 Admin executa Reset do acesso
    const resetRes = await request(app)
      .post(`/api/partners/${createdPartnerAId}/portal-access/reset`)
      .set('Cookie', [`cg_session_id=${adminTokenA}`]);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.portalAccess.temporaryPassword).toBeDefined();
    const newTemporaryPassword = resetRes.body.portalAccess.temporaryPassword;
    expect(newTemporaryPassword).not.toBe(temporaryPasswordA);

    // 5.3 Valida que a sessão anterior foi invalidada (401)
    const checkSession2 = await request(app)
      .get('/api/partner-portal/auth/session')
      .set('Cookie', [`cg_partner_session_id=${oldSessionToken}`]);
    expect(checkSession2.status).toBe(401);
    expect(checkSession2.body.authenticated).toBe(false);

    // 5.4 Valida que a senha antiga não funciona mais
    const loginFail = await request(app)
      .post('/api/partner-portal/auth/login')
      .send({
        email: emailShared,
        password: temporaryPasswordA,
      });
    expect(loginFail.status).toBe(401);

    // 5.5 Valida que a nova senha temporária funciona
    const loginSuccess = await request(app)
      .post('/api/partner-portal/auth/login')
      .send({
        email: emailShared,
        password: newTemporaryPassword,
      });
    expect(loginSuccess.status).toBe(200);
    expect(loginSuccess.body.success).toBe(true);
  });

  // 6 & 7. Partner de Tenant A → Tenant A, Partner de Tenant B → Tenant B
  it('6 & 7. Provisionamento respeita rigorosamente o isolamento por tenantId', async () => {
    // Cria parceiro no Tenant B
    const resB = await request(app)
      .post('/api/partners')
      .set('Cookie', [`cg_session_id=${adminTokenB}`])
      .send({
        name: 'BETA COMERCIAL',
        code: `BETA-${testTimestamp}`,
        email: `beta.${testTimestamp}@example.com`,
        status: 'ATIVO',
      });

    expect(resB.status).toBe(200);
    createdPartnerBId = resB.body.id;

    const accessB = await prisma.partnerPortalAccess.findFirst({
      where: { partnerId: createdPartnerBId },
    });
    expect(accessB?.tenantId).toBe(tenantBId);
    expect(accessB?.tenantId).not.toBe(tenantAId);
  });

  // 8. Mesmo e-mail em tenants diferentes → acessos independentes
  it('8. Mesmo e-mail cadastrado em tenants diferentes deve gerar acessos independentes', async () => {
    // Cria parceiro no Tenant B com o MESMO e-mail usado no Tenant A
    const resSameEmailB = await request(app)
      .post('/api/partners')
      .set('Cookie', [`cg_session_id=${adminTokenB}`])
      .send({
        name: 'KAUAI FILIAL B',
        code: `KAUAI-FILIAL-${testTimestamp}`,
        email: emailShared, // mesmo email
        status: 'ATIVO',
      });

    expect(resSameEmailB.status).toBe(200);
    expect(resSameEmailB.body.portalAccess.created).toBe(true);

    const accessInA = await prisma.partnerPortalAccess.findFirst({
      where: { email: emailShared, tenantId: tenantAId },
    });
    const accessInB = await prisma.partnerPortalAccess.findFirst({
      where: { email: emailShared, tenantId: tenantBId },
    });

    expect(accessInA).not.toBeNull();
    expect(accessInB).not.toBeNull();
    expect(accessInA?.id).not.toBe(accessInB?.id);
    expect(accessInA?.tenantId).toBe(tenantAId);
    expect(accessInB?.tenantId).toBe(tenantBId);
  });

  // 9. Senha temporária → passwordHash persistido → senha não persistida em texto
  it('9. Senha temporária deve ser salva apenas como Argon2id hash no PostgreSQL e nunca em texto puro', async () => {
    const access = await prisma.partnerPortalAccess.findUnique({
      where: { id: createdPartnerAAccessId },
    });

    expect(access?.passwordHash).toBeDefined();
    expect(access?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(access?.passwordHash).not.toContain(temporaryPasswordA);
    expect((access as any).temporaryPassword).toBeUndefined();
    expect((access as any).password).toBeUndefined();
  });

  // 10. Logs & Retornos futuros → senha não aparece
  it('10. Consultas e listagens GET /api/partners e /api/partners/:id/portal-access nunca retornam hash nem senhas', async () => {
    const resGetPartners = await request(app)
      .get('/api/partners')
      .set('Cookie', [`cg_session_id=${adminTokenA}`]);

    expect(resGetPartners.status).toBe(200);
    const partnersJson = JSON.stringify(resGetPartners.body);
    expect(partnersJson).not.toContain('passwordHash');
    expect(partnersJson).not.toContain('temporaryPassword');

    const resGetAccess = await request(app)
      .get(`/api/partners/${createdPartnerAId}/portal-access`)
      .set('Cookie', [`cg_session_id=${adminTokenA}`]);

    expect(resGetAccess.status).toBe(200);
    const accessJson = JSON.stringify(resGetAccess.body);
    expect(accessJson).not.toContain('passwordHash');
    expect(accessJson).not.toContain('temporaryPassword');
  });

  // 11. Auditoria → evento criado sem segredo
  it('11. Registros de auditoria devem auditar eventos sem incluir senhas ou tokens', async () => {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId: tenantAId,
        action: { in: ['PARTNER_PORTAL_ACCESS_CREATED', 'PARTNER_PORTAL_ACCESS_RESET'] },
      },
    });

    expect(auditLogs.length).toBeGreaterThan(0);
    for (const log of auditLogs) {
      const logStr = JSON.stringify(log);
      expect(logStr).not.toContain('temporaryPassword');
      expect(logStr).not.toContain('passwordHash');
      expect(logStr).not.toContain(temporaryPasswordA);
    }
  });

  // 12. Desativação → novo login bloqueado → sessão existente invalidada
  it('12. Desativação do acesso bloqueia novos logins (403) e invalida sessões existentes', async () => {
    const hostA = `evolve-a-${testTimestamp}.sentinelconsig.com.br`;

    // 12.1 Gera novo reset e login para ter sessão ativa
    const resetRes = await request(app)
      .post(`/api/partners/${createdPartnerAId}/portal-access/reset`)
      .set('Cookie', [`cg_session_id=${adminTokenA}`]);

    const activeTempPassword = resetRes.body.portalAccess.temporaryPassword;

    const loginRes = await request(app)
      .post('/api/partner-portal/auth/login')
      .set('Host', hostA)
      .send({ email: emailShared, password: activeTempPassword });
    expect(loginRes.status).toBe(200);
    const activeToken = loginRes.body.token;

    // 12.2 Admin desativa o acesso
    const disableRes = await request(app)
      .patch(`/api/partners/${createdPartnerAId}/portal-access/${createdPartnerAAccessId}`)
      .set('Cookie', [`cg_session_id=${adminTokenA}`])
      .send({ active: false });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.active).toBe(false);

    // 12.3 Tentativa de usar sessão existente deve retornar 401
    const checkSession = await request(app)
      .get('/api/partner-portal/auth/session')
      .set('Host', hostA)
      .set('Cookie', [`cg_partner_session_id=${activeToken}`]);
    expect(checkSession.status).toBe(401);

    // 12.4 Tentativa de novo login deve ser bloqueada (403)
    const newLogin = await request(app)
      .post('/api/partner-portal/auth/login')
      .set('Host', hostA)
      .send({ email: emailShared, password: activeTempPassword });
    expect(newLogin.status).toBe(403);
    expect(newLogin.body.error).toContain('desativado');
  });

  // =========================================================================
  // GERAÇÃO MANUAL DE ACESSO PARA PARCEIROS EXISTENTES COM STATUS PENDENTE
  // =========================================================================
  describe('Geração Manual de Acesso ao Portal para Parceiros Existentes (PENDENTE)', () => {
    let pendingPartnerId: string;
    let pendingPartnerNoEmailId: string;
    const pendingPartnerEmail = `kauai.existente.${testTimestamp}@teste.com.br`;
    let generatedTemporaryPassword = '';
    let operatorTokenA2 = '';

    beforeAll(async () => {
      // 1. Partner pré-existente no Tenant A com e-mail, mas sem PartnerPortalAccess (PENDENTE)
      const p1 = await prisma.partner.create({
        data: {
          tenantId: tenantAId,
          name: 'KAUAI COMERCIAL EXISTENTE',
          code: `KAUAI-PENDENTE-${testTimestamp}`,
          email: pendingPartnerEmail,
          phone: '11977776666',
          status: 'ATIVO',
        },
      });
      pendingPartnerId = p1.id;

      // 2. Partner pré-existente no Tenant A sem e-mail e sem PartnerPortalAccess
      const p2 = await prisma.partner.create({
        data: {
          tenantId: tenantAId,
          name: 'PARTNER SEM EMAIL EXISTENTE',
          code: `SEM-EMAIL-${testTimestamp}`,
          email: null,
          status: 'ATIVO',
        },
      });
      pendingPartnerNoEmailId = p2.id;

      // 3. Outro operador/sessão no Tenant A (simulando outro dispositivo / navegador)
      const op2 = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          name: 'Operador Secundario Tenant A',
          email: `operador2.${testTimestamp}@evolve.com`,
          passwordHash: await hashPassword('SecurePass123!'),
          role: 'GESTOR',
          active: true,
        },
      });
      operatorTokenA2 = crypto.randomBytes(32).toString('hex');
      await prisma.session.create({
        data: {
          userId: op2.id,
          token: operatorTokenA2,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest-device-2',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          effectiveTenantId: tenantAId,
          activeRole: 'GESTOR',
          activePermissions: ['partners.view', 'partners.update', 'partners.crm.admin'],
        },
      });
    });

    // 1. Partner pendente + e-mail válido → gerar acesso
    it('1. Deve gerar acesso ao portal com sucesso para partner pendente com e-mail válido', async () => {
      // Verifica que está pendente (sem acessos) antes da operação
      const beforeCheck = await request(app)
        .get(`/api/partners/${pendingPartnerId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`]);
      expect(beforeCheck.status).toBe(200);
      expect(beforeCheck.body).toEqual([]);

      // Operação: POST /api/partners/:id/portal-access
      const res = await request(app)
        .post(`/api/partners/${pendingPartnerId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`])
        .send({
          name: 'KAUAI COMERCIAL EXISTENTE',
          email: pendingPartnerEmail,
        });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe(true);
      expect(res.body.email).toBe(pendingPartnerEmail);
      expect(res.body.temporaryPassword).toBeDefined();
      expect(typeof res.body.temporaryPassword).toBe('string');
      expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect(res.body.portalUrl).toBeDefined();
      expect(res.body.portalAccess).toBeDefined();
      expect(res.body.portalAccess.created).toBe(true);
      expect(res.body.portalAccess.status).toBe('ACTIVE');

      generatedTemporaryPassword = res.body.temporaryPassword;
    });

    // 2. Partner pendente sem e-mail → rejeitar geração
    it('2. Deve rejeitar geração de acesso para partner pendente que não possui e-mail cadastrado (HTTP 400)', async () => {
      const res = await request(app)
        .post(`/api/partners/${pendingPartnerNoEmailId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`])
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('E-mail do parceiro é obrigatório');
    });

    // 3. Partner já com acesso → não criar duplicado
    it('3. Não deve permitir criar acesso duplicado para partner que já possui acesso ativo (HTTP 400)', async () => {
      const res = await request(app)
        .post(`/api/partners/${pendingPartnerId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`])
        .send({
          email: pendingPartnerEmail,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('já possui um acesso ativo');

      const count = await prisma.partnerPortalAccess.count({
        where: { partnerId: pendingPartnerId, tenantId: tenantAId },
      });
      expect(count).toBe(1);
    });

    // 4. Gerar acesso novamente → somente ação explícita de reset
    it('4. Nova senha para parceiro já provisionado deve ocorrer exclusivamente via endpoint explícito de reset', async () => {
      const resetRes = await request(app)
        .post(`/api/partners/${pendingPartnerId}/portal-access/reset`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`]);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.portalAccess.temporaryPassword).toBeDefined();
      expect(resetRes.body.portalAccess.temporaryPassword).not.toBe(generatedTemporaryPassword);

      generatedTemporaryPassword = resetRes.body.portalAccess.temporaryPassword;
    });

    // 5. Tenant A tentando gerar acesso para Partner B → bloqueado (404/403)
    it('5. Tenant A não pode gerar acesso para Partner pertencente ao Tenant B (Isolamento)', async () => {
      const resCrossTenant = await request(app)
        .post(`/api/partners/${createdPartnerBId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`])
        .send({
          email: 'invasao@exemplo.com',
        });

      expect(resCrossTenant.status).toBe(404);
      expect(resCrossTenant.body.error).toContain('não encontrado');
    });

    // 6. Senha temporária não persistida em texto
    it('6. Senha temporária gerada não deve ser persistida em texto puro no banco de dados', async () => {
      const access = await prisma.partnerPortalAccess.findFirst({
        where: { partnerId: pendingPartnerId, tenantId: tenantAId },
      });

      expect(access).not.toBeNull();
      expect(access!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(access!.passwordHash).not.toContain(generatedTemporaryPassword);
      expect((access as any).password).toBeUndefined();
      expect((access as any).temporaryPassword).toBeUndefined();
    });

    // 7. PasswordHash não exposto
    it('7. PasswordHash e senha temporária nunca devem ser expostos nas consultas da API', async () => {
      // 7.1 GET /api/partners/:id/portal-access
      const resGetAccess = await request(app)
        .get(`/api/partners/${pendingPartnerId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`]);

      expect(resGetAccess.status).toBe(200);
      const strAccess = JSON.stringify(resGetAccess.body);
      expect(strAccess).not.toContain('passwordHash');
      expect(strAccess).not.toContain('argon2id');
      expect(strAccess).not.toContain(generatedTemporaryPassword);

      // 7.2 GET /api/partners
      const resGetPartners = await request(app)
        .get('/api/partners')
        .set('Cookie', [`cg_session_id=${adminTokenA}`]);

      expect(resGetPartners.status).toBe(200);
      const strPartners = JSON.stringify(resGetPartners.body);
      expect(strPartners).not.toContain('passwordHash');
      expect(strPartners).not.toContain(generatedTemporaryPassword);
    });

    // 8. Auditoria sem senha
    it('8. Eventos de auditoria devem ser registrados sem gravar senhas ou hashes de autenticação', async () => {
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenantAId,
          entity: 'PARTNER_PORTAL_ACCESS',
        },
      });

      expect(logs.length).toBeGreaterThan(0);
      for (const log of logs) {
        const serialized = JSON.stringify(log);
        expect(serialized).not.toContain('passwordHash');
        expect(serialized).not.toContain(generatedTemporaryPassword);
      }
    });

    // 9. Status muda PENDENTE → ATIVO
    it('9. Status do parceiro deve refletir ATIVO na consulta após o provisionamento manual', async () => {
      const res = await request(app)
        .get(`/api/partners/${pendingPartnerId}/portal-access`)
        .set('Cookie', [`cg_session_id=${adminTokenA}`]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].active).toBe(true);
      expect(res.body[0].email).toBe(pendingPartnerEmail);
      expect(res.body[0].lastLoginAt).toBeNull();
      expect(res.body[0].mustChangePassword).toBe(true);
    });

    // 10. F5 mantém ATIVO
    it('10. Múltiplas requisições subsequentes (simulando F5/refresh) mantêm o status ATIVO de forma persistente', async () => {
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .get(`/api/partners/${pendingPartnerId}/portal-access`)
          .set('Cookie', [`cg_session_id=${adminTokenA}`]);

        expect(res.status).toBe(200);
        expect(res.body[0].active).toBe(true);
        expect(res.body[0].email).toBe(pendingPartnerEmail);
      }
    });

    // 11. Outro dispositivo enxerga ATIVO
    it('11. Outro operador/sessão (outro dispositivo) enxerga o acesso do parceiro como ATIVO imediatamente', async () => {
      const resOp2 = await request(app)
        .get(`/api/partners/${pendingPartnerId}/portal-access`)
        .set('Cookie', [`cg_session_id=${operatorTokenA2}`]);

      expect(resOp2.status).toBe(200);
      expect(resOp2.body.length).toBe(1);
      expect(resOp2.body[0].active).toBe(true);
      expect(resOp2.body[0].email).toBe(pendingPartnerEmail);
    });

    // 12. Login do parceiro funciona com a senha temporária
    it('12. Login do parceiro no portal (/parceiro) deve funcionar utilizando a senha temporária gerada', async () => {
      const hostA = `evolve-a-${testTimestamp}.sentinelconsig.com.br`;

      const loginRes = await request(app)
        .post('/api/partner-portal/auth/login')
        .set('Host', hostA)
        .send({
          email: pendingPartnerEmail,
          password: generatedTemporaryPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.access.email).toBe(pendingPartnerEmail);
      expect(loginRes.body.access.active).toBe(true);
    });

    // 13. Primeiro login exige troca da senha
    it('13. Primeiro login do parceiro deve exigir obrigatoriamente a troca da senha (mustChangePassword: true)', async () => {
      const hostA = `evolve-a-${testTimestamp}.sentinelconsig.com.br`;

      const loginRes = await request(app)
        .post('/api/partner-portal/auth/login')
        .set('Host', hostA)
        .send({
          email: pendingPartnerEmail,
          password: generatedTemporaryPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.access.mustChangePassword).toBe(true);

      // Valida flag no banco de dados
      const dbAccess = await prisma.partnerPortalAccess.findFirst({
        where: { partnerId: pendingPartnerId, tenantId: tenantAId },
      });
      expect(dbAccess?.mustChangePassword).toBe(true);
      expect(dbAccess?.lastLoginAt).not.toBeNull(); // Registrou o primeiro login
    });
  });
});
