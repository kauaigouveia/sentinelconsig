import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';
import crypto from 'crypto';
import { hashPassword } from '../../server/services/passwordService';

describe('Integration & Adversarial: Partner Portal & Support Central', () => {
  let tenantAId: string;
  let tenantBId: string;
  let partnerAId: string;
  let partnerBId: string;
  let partnerAAccessId: string;
  let partnerBAccessId: string;
  let partnerAToken: string;
  let partnerBToken: string;
  let staffUserId: string;
  let staffToken: string;
  let bankId: string;
  let productId: string;
  let proposalStatusId: string;
  let proposalAId: string;
  let proposalBId: string;

  const partnerAEmail = `partner.a.${Date.now()}@sentineltest.com`;
  const partnerBEmail = `partner.b.${Date.now()}@sentineltest.com`;
  const staffEmail = `staff.support.${Date.now()}@sentineltest.com`;
  const partnerPassword = 'SecretPassword@123';

  beforeAll(async () => {
    // 1. Setup Tenant A
    const tenantA = await prisma.tenant.create({
      data: {
        name: 'Tenant A Test Corretora',
        slug: `tenant-a-${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    tenantAId = tenantA.id;

    // 2. Setup Tenant B (para teste de isolamento multitenant)
    const tenantB = await prisma.tenant.create({
      data: {
        name: 'Tenant B Test Corretora',
        slug: `tenant-b-${Date.now()}`,
        status: 'ACTIVE',
      },
    });
    tenantBId = tenantB.id;

    // 3. Setup Bank, Product, ProposalStatus
    const bank = await prisma.bank.create({
      data: {
        tenantId: tenantAId,
        name: 'Banco Sentinel Test',
        code: '999',
      },
    });
    bankId = bank.id;

    const product = await prisma.product.create({
      data: {
        tenantId: tenantAId,
        name: 'Novo Consignado INSS',
        code: 'INSS_NOVO',
      },
    });
    productId = product.id;

    const status = await prisma.proposalStatus.create({
      data: {
        tenantId: tenantAId,
        name: 'Em Análise',
        code: 'ANALISE',
        standardCategory: 'ESTEIRA',
      },
    });
    proposalStatusId = status.id;

    // 4. Setup Partner A & Partner B
    const partnerA = await prisma.partner.create({
      data: {
        tenantId: tenantAId,
        name: 'Parceiro Alpha VIP',
        code: 'PARC-ALP-01',
        phone: '11998877665',
        status: 'ATIVO',
      },
    });
    partnerAId = partnerA.id;

    const partnerB = await prisma.partner.create({
      data: {
        tenantId: tenantAId,
        name: 'Parceiro Beta Exclusivo',
        code: 'PARC-BET-02',
        phone: '11991122334',
        status: 'ATIVO',
      },
    });
    partnerBId = partnerB.id;

    // 5. Setup PartnerPortalAccess for Partner A and Partner B (using hashed passwords)
    const passwordHash = await hashPassword(partnerPassword);

    const accessA = await prisma.partnerPortalAccess.create({
      data: {
        tenantId: tenantAId,
        partnerId: partnerAId,
        name: 'Representante Alpha',
        email: partnerAEmail,
        passwordHash,
        active: true,
        mustChangePassword: false,
      },
    });
    partnerAAccessId = accessA.id;

    const accessB = await prisma.partnerPortalAccess.create({
      data: {
        tenantId: tenantAId,
        partnerId: partnerBId,
        name: 'Representante Beta',
        email: partnerBEmail,
        passwordHash,
        active: true,
        mustChangePassword: false,
      },
    });
    partnerBAccessId = accessB.id;

    // 6. Setup Proposals for Partner A and Partner B
    const clientA = await prisma.client.create({
      data: {
        tenantId: tenantAId,
        fullName: 'Cliente de Teste Alpha',
        cpf: '12345678901',
      },
    });

    const proposalA = await prisma.proposal.create({
      data: {
        tenantId: tenantAId,
        partnerId: partnerAId,
        clientId: clientA.id,
        bankId,
        productId,
        statusId: proposalStatusId,
        proposalNumber: 'PROP-ALPHA-1001',
        type: 'NOVO',
        contractValue: 15000.0,
        releasedValue: 14200.0,
        installmentValue: 450.0,
        installmentsCount: 84,
      },
    });
    proposalAId = proposalA.id;

    const clientB = await prisma.client.create({
      data: {
        tenantId: tenantAId,
        fullName: 'Cliente de Teste Beta Secreto',
        cpf: '98765432100',
      },
    });

    const proposalB = await prisma.proposal.create({
      data: {
        tenantId: tenantAId,
        partnerId: partnerBId,
        clientId: clientB.id,
        bankId,
        productId,
        statusId: proposalStatusId,
        proposalNumber: 'PROP-BETA-2002',
        type: 'PORTABILIDADE',
        contractValue: 50000.0,
        releasedValue: 48000.0,
        installmentValue: 1200.0,
        installmentsCount: 96,
        debtBalance: 32000.0,
        originalBankCode: '341',
        cipNumber: 'CIP-998877',
      },
    });
    proposalBId = proposalB.id;

    // 7. Setup Internal Staff User with support permissions
    const staffUser = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        name: 'Operador Mesa Suporte',
        email: staffEmail,
        passwordHash,
        role: 'SUPORTE',
        active: true,
      },
    });
    staffUserId = staffUser.id;

    staffToken = crypto.randomBytes(32).toString('hex');
    await prisma.session.create({
      data: {
        userId: staffUser.id,
        token: staffToken,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        effectiveTenantId: tenantAId,
        activeRole: 'SUPORTE',
        activePermissions: ['support.view', 'support.reply', 'support.manage', 'proposals.view'],
      },
    });
  });

  afterAll(async () => {
    // Cleanup created data
    await prisma.partnerPortalSession.deleteMany({
      where: { partnerId: { in: [partnerAId, partnerBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.supportMessage.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.supportConversation.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.pendency.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.proposal.deleteMany({
      where: { id: { in: [proposalAId, proposalBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.client.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.partnerPortalAccess.deleteMany({
      where: { partnerId: { in: [partnerAId, partnerBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.partner.deleteMany({
      where: { id: { in: [partnerAId, partnerBId].filter(Boolean) } },
    }).catch(() => {});
    await prisma.session.deleteMany({
      where: { userId: staffUserId },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: staffUserId },
    }).catch(() => {});
    await prisma.proposalStatus.deleteMany({
      where: { id: proposalStatusId },
    }).catch(() => {});
    await prisma.product.deleteMany({
      where: { id: productId },
    }).catch(() => {});
    await prisma.bank.deleteMany({
      where: { id: bankId },
    }).catch(() => {});
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId].filter(Boolean) } },
    }).catch(() => {});
  });

  describe('1. Autenticação Segura e Sessão do Portal do Parceiro', () => {
    it('deve rejeitar credenciais inválidas', async () => {
      const res = await request(app)
        .post('/api/partner-portal/auth/login')
        .send({ email: partnerAEmail, password: 'WrongPassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('deve autenticar Partner A com sucesso e gerar cookie cg_partner_session_id', async () => {
      const res = await request(app)
        .post('/api/partner-portal/auth/login')
        .send({ email: partnerAEmail, password: partnerPassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.partner.id).toBe(partnerAId);
      expect(res.body.access.email).toBe(partnerAEmail);

      partnerAToken = res.body.token;

      // Autentica Partner B também para testes de isolamento cruzado
      const resB = await request(app)
        .post('/api/partner-portal/auth/login')
        .send({ email: partnerBEmail, password: partnerPassword });

      expect(resB.status).toBe(200);
      partnerBToken = resB.body.token;
    });

    it('deve recuperar a sessão autenticada a partir do token/cookie', async () => {
      const res = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.partner.id).toBe(partnerAId);
      expect(res.body.partner.name).toBe('Parceiro Alpha VIP');
      expect(res.body.tenant.id).toBe(tenantAId);
    });

    it('deve rejeitar requisição sem sessão válida', async () => {
      const res = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Cookie', ['cg_partner_session_id=invalid_token_12345']);

      expect(res.status).toBe(401);
      expect(res.body.authenticated).toBe(false);
    });
  });

  describe('2. Isolamento Estrito de Propostas e Dashboard do Parceiro', () => {
    it('deve listar apenas as propostas pertencentes ao Partner A', async () => {
      const res = await request(app)
        .get('/api/partner-portal/proposals')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].id).toBe(proposalAId);
      expect(res.body.items[0].proposalNumber).toBe('PROP-ALPHA-1001');
      // Garante que a proposta B NÃO aparece
      const containsProposalB = res.body.items.some((p: any) => p.id === proposalBId);
      expect(containsProposalB).toBe(false);
    });

    it('deve mascarar CPF do proponente na listagem do portal', async () => {
      const res = await request(app)
        .get('/api/partner-portal/proposals')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      const item = res.body.items[0];
      expect(item.clientCpfMasked).toMatch(/^\*\*\*\.\*\*\*\.\d{3}-\*\*$/);
    });

    it('deve obter detalhes e timeline da proposta do Partner A com sucesso', async () => {
      const res = await request(app)
        .get(`/api/partner-portal/proposals/${proposalAId}`)
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(proposalAId);
      expect(res.body.clientName).toBe('Cliente de Teste Alpha');
      expect(res.body.timeline).toBeInstanceOf(Array);
      expect(res.body.timeline.length).toBeGreaterThan(0);
      // Confirma que dados operacionais internos confidenciais NÃO vazaram
      expect(res.body.internalRules).toBeUndefined();
      expect(res.body.commissionOperator).toBeUndefined();
    });

    it('ADVERSARIAL: Partner A tentando consultar proposta do Partner B deve ser bloqueado com 404 seguro', async () => {
      const res = await request(app)
        .get(`/api/partner-portal/proposals/${proposalBId}`)
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      // Isolamento estrito: proposta não existe no escopo do parceiro
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/não encontrada|não vinculada/i);
    });

    it('deve calcular métricas do dashboard exclusivamente com dados do Partner A', async () => {
      const res = await request(app)
        .get('/api/partner-portal/dashboard')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.metrics.totalProposals).toBe(1);
      expect(res.body.metrics.totalContract).toBe(15000);
      expect(res.body.recentProposals.length).toBe(1);
      expect(res.body.recentProposals[0].id).toBe(proposalAId);
    });
  });

  describe('3. Central de Atendimento & Chat Suporte (Portal <-> Mesa Operacional)', () => {
    let conversationId: string;

    it('Partner A deve conseguir abrir um chamado/conversa para sua proposta', async () => {
      const res = await request(app)
        .post('/api/partner-portal/support/conversations')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`])
        .send({
          proposalId: proposalAId,
          subject: 'Dúvida sobre margem aprovada',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.partnerId).toBe(partnerAId);
      expect(res.body.proposalId).toBe(proposalAId);

      conversationId = res.body.id;
    });

    it('ADVERSARIAL: Partner A tentando vincular conversa à proposta do Partner B deve ser rejeitado', async () => {
      const res = await request(app)
        .post('/api/partner-portal/support/conversations')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`])
        .send({
          proposalId: proposalBId, // Proposta do parceiro B!
          subject: 'Tentativa de violação de posse',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/não pertence a este parceiro|não encontrada/i);
    });

    it('Partner A deve enviar mensagem no atendimento', async () => {
      const res = await request(app)
        .post(`/api/partner-portal/support/conversations/${conversationId}/messages`)
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`])
        .send({ message: 'Olá equipe, quando o saldo será liberado?' });

      expect(res.status).toBe(201);
      expect(res.body.senderType).toBe('PARTNER');
      expect(res.body.message).toBe('Olá equipe, quando o saldo será liberado?');
    });

    it('ADVERSARIAL: Partner B tentando enviar mensagem na conversa do Partner A deve ser rejeitado', async () => {
      const res = await request(app)
        .post(`/api/partner-portal/support/conversations/${conversationId}/messages`)
        .set('Cookie', [`cg_partner_session_id=${partnerBToken}`])
        .send({ message: 'Tentando espionar chamado do concorrente' });

      expect(res.status).toBe(400);
    });

    it('Mesa de Suporte interna (Staff) deve listar a conversa na Central de Atendimento', async () => {
      const res = await request(app)
        .get('/api/support/conversations')
        .set('Cookie', [`cg_session_id=${staffToken}`]);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      const found = res.body.find((c: any) => c.id === conversationId);
      expect(found).toBeDefined();
      expect(found.partnerName).toBe('Parceiro Alpha VIP');
      expect(found.unreadCount).toBeGreaterThan(0);
    });

    it('Operador interno deve responder ao parceiro', async () => {
      const res = await request(app)
        .post(`/api/support/conversations/${conversationId}/messages`)
        .set('Cookie', [`cg_session_id=${staffToken}`])
        .send({ message: 'Olá! A proposta está em fase final de averbação bancária.' });

      expect(res.status).toBe(201);
      expect(res.body.senderType).toBe('SUPPORT');
    });

    it('Partner A deve visualizar contador de mensagens não lidas incrementado', async () => {
      const res = await request(app)
        .get('/api/partner-portal/support/unread-count')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });

    it('Partner A ao carregar mensagens deve marcar como lida e zerar unread count', async () => {
      const res = await request(app)
        .get(`/api/partner-portal/support/conversations/${conversationId}/messages`)
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(2);

      // Checa se unread-count zerou
      const unreadRes = await request(app)
        .get('/api/partner-portal/support/unread-count')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(unreadRes.body.count).toBe(0);
    });
  });

  describe('4. Webhook WhatsApp & Idempotência de Mensagens', () => {
    it('deve validar assinatura do webhook (hub.verify_token)', async () => {
      const res = await request(app)
        .get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=sentinel_wa_secret_token&hub.challenge=CHALLENGE_CODE_123');

      expect(res.status).toBe(200);
      expect(res.text).toBe('CHALLENGE_CODE_123');
    });

    it('deve processar mensagem recebida via WhatsApp e associar ao parceiro pelo telefone', async () => {
      const externalId = `wa_msg_${Date.now()}_abc`;

      const res = await request(app)
        .post('/api/webhooks/whatsapp')
        .send({
          tenantId: tenantAId,
          externalMessageId: externalId,
          senderPhone: '5511998877665', // Telefone cadastrado no Parceiro A
          senderName: 'Diretor Comercial Alpha',
          message: 'Mensagem enviada via WhatsApp oficial',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('processed');
    });

    it('IDEMPOTÊNCIA: Envio duplicado do mesmo webhook WhatsApp deve ser ignorado sem duplicar mensagens', async () => {
      const duplicateExternalId = `wa_msg_duplicate_test_${Date.now()}`;

      // Primeiro disparo
      const res1 = await request(app)
        .post('/api/webhooks/whatsapp')
        .send({
          tenantId: tenantAId,
          externalMessageId: duplicateExternalId,
          senderPhone: '5511998877665',
          message: 'Mensagem única de teste de idempotência',
        });

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('processed');

      // Segundo disparo com o mesmo externalMessageId
      const res2 = await request(app)
        .post('/api/webhooks/whatsapp')
        .send({
          tenantId: tenantAId,
          externalMessageId: duplicateExternalId,
          senderPhone: '5511998877665',
          message: 'Mensagem única de teste de idempotência',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('already_processed');
    });
  });

  describe('5. Alteração de Senha e Logout no Portal do Parceiro', () => {
    it('deve alterar a senha do parceiro', async () => {
      const res = await request(app)
        .post('/api/partner-portal/auth/change-password')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`])
        .send({ newPassword: 'NovaSenhaSegura@2026' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('deve realizar logout e invalidar a sessão', async () => {
      const res = await request(app)
        .post('/api/partner-portal/auth/logout')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(res.status).toBe(200);

      // Sessão deve estar invalidada no banco
      const checkRes = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Cookie', [`cg_partner_session_id=${partnerAToken}`]);

      expect(checkRes.status).toBe(401);
    });
  });

  describe('6. Gate Adversarial: Gestão de Acessos & Desativação', () => {
    let tenantBStaffToken: string;
    let tenantBStaffUserId: string;

    beforeAll(async () => {
      const userB = await prisma.user.create({
        data: {
          tenantId: tenantBId,
          name: 'Operador Tenant B',
          email: `staff.tenantb.${Date.now()}@sentineltest.com`,
          passwordHash: 'dummy',
          role: 'GESTOR',
          active: true,
        },
      });
      tenantBStaffUserId = userB.id;

      tenantBStaffToken = crypto.randomBytes(32).toString('hex');
      await prisma.session.create({
        data: {
          userId: userB.id,
          token: tenantBStaffToken,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          effectiveTenantId: tenantBId,
          activeRole: 'GESTOR',
          activePermissions: ['partners.update', 'partners.crm.admin'],
        },
      });
    });

    afterAll(async () => {
      await prisma.session.deleteMany({ where: { userId: tenantBStaffUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: tenantBStaffUserId } }).catch(() => {});
    });

    it('ADVERSARIAL: Operador do Tenant B tentando listar acessos de Partner do Tenant A deve receber 404', async () => {
      const res = await request(app)
        .get(`/api/partners/${partnerAId}/portal-access`)
        .set('Cookie', [`cg_session_id=${tenantBStaffToken}`]);

      expect(res.status).toBe(404);
    });

    it('ADVERSARIAL: Operador do Tenant B tentando criar acesso para Partner do Tenant A deve receber 404', async () => {
      const res = await request(app)
        .post(`/api/partners/${partnerAId}/portal-access`)
        .set('Cookie', [`cg_session_id=${tenantBStaffToken}`])
        .send({ name: 'Hacker', email: 'hack@test.com' });

      expect(res.status).toBe(404);
    });

    it('DESATIVAÇÃO: Quando PartnerPortalAccess.active = false, novo login e sessão existente são bloqueados', async () => {
      // 1. Desativa o acesso do Partner B
      await prisma.partnerPortalAccess.update({
        where: { id: partnerBAccessId },
        data: { active: false },
      });

      // 2. Novo login deve ser bloqueado com 403
      const loginRes = await request(app)
        .post('/api/partner-portal/auth/login')
        .send({ email: partnerBEmail, password: partnerPassword });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error).toMatch(/desativado/i);

      // 3. Sessão previamente ativa do Partner B deve ser imediatamente rejeitada com 401
      const sessionRes = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Cookie', [`cg_partner_session_id=${partnerBToken}`]);

      expect(sessionRes.status).toBe(401);

      // 4. Endpoints protegidos do portal devem rejeitar o usuário desativado
      const proposalsRes = await request(app)
        .get('/api/partner-portal/proposals')
        .set('Cookie', [`cg_partner_session_id=${partnerBToken}`]);

      expect(proposalsRes.status).toBe(401);
    });
  });

  describe('7. Gate Adversarial: RBAC Granular da Central de Atendimento', () => {
    let viewOnlyToken: string;
    let viewOnlyUserId: string;

    beforeAll(async () => {
      const viewOnlyUser = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          name: 'Operador Apenas Leitura',
          email: `viewonly.${Date.now()}@sentineltest.com`,
          passwordHash: 'dummy',
          role: 'DIGITADOR',
          active: true,
        },
      });
      viewOnlyUserId = viewOnlyUser.id;

      viewOnlyToken = crypto.randomBytes(32).toString('hex');
      await prisma.session.create({
        data: {
          userId: viewOnlyUser.id,
          token: viewOnlyToken,
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          effectiveTenantId: tenantAId,
          activeRole: 'DIGITADOR',
          activePermissions: ['support.view'], // APENAS visualização, SEM reply ou manage
        },
      });
    });

    afterAll(async () => {
      await prisma.session.deleteMany({ where: { userId: viewOnlyUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: viewOnlyUserId } }).catch(() => {});
    });

    it('Operador com apenas support.view pode listar conversas', async () => {
      const res = await request(app)
        .get('/api/support/conversations')
        .set('Cookie', [`cg_session_id=${viewOnlyToken}`]);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
    });

    it('ADVERSARIAL: Operador sem support.reply deve ser bloqueado ao tentar responder', async () => {
      const conversations = await prisma.supportConversation.findMany({ where: { tenantId: tenantAId } });
      expect(conversations.length).toBeGreaterThan(0);

      const res = await request(app)
        .post(`/api/support/conversations/${conversations[0].id}/messages`)
        .set('Cookie', [`cg_session_id=${viewOnlyToken}`])
        .send({ message: 'Tentativa não autorizada de resposta' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Permissão insuficiente/i);
    });

    it('ADVERSARIAL: Operador sem support.manage deve ser bloqueado ao tentar alterar status da conversa', async () => {
      const conversations = await prisma.supportConversation.findMany({ where: { tenantId: tenantAId } });

      const res = await request(app)
        .patch(`/api/support/conversations/${conversations[0].id}/status`)
        .set('Cookie', [`cg_session_id=${viewOnlyToken}`])
        .send({ status: 'RESOLVED' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Permissão insuficiente/i);
    });
  });

  describe('8. Gate Adversarial: Sanitização e Ausência de Dados Sensíveis', () => {
    let freshPartnerToken: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/partner-portal/auth/login')
        .send({ email: partnerAEmail, password: 'NovaSenhaSegura@2026' });

      freshPartnerToken = loginRes.body.token;
    });

    it('Respostas JSON do portal nunca devem expor passwordHash ou tokens de banco', async () => {
      const res = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Cookie', [`cg_partner_session_id=${freshPartnerToken}`]);

      expect(res.status).toBe(200);
      const str = JSON.stringify(res.body);
      expect(str).not.toContain('passwordHash');
      expect(str).not.toContain('password_hash');
      expect(str).not.toContain('AuditLog');
    });

    it('Listagem e Detalhes de propostas mascaram CPF e não expõem regras internas ou auditoria', async () => {
      const res = await request(app)
        .get(`/api/partner-portal/proposals/${proposalAId}`)
        .set('Cookie', [`cg_partner_session_id=${freshPartnerToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.clientCpfMasked).toMatch(/^\*\*\*\.\*\*\*\.\d{3}-\*\*$/);
      expect(res.body.auditLogs).toBeUndefined();
      expect(res.body.internalSla).toBeUndefined();
      expect(res.body.commissionOperator).toBeUndefined();
    });
  });

  describe('9. Respeito Rigoroso ao Tenant da URL e Isolamento por Host / Subdomínio (GRUPO EVOLVE)', () => {
    let evolveTenantId: string;
    let evolvePartnerId: string;
    let evolveAccessId: string;
    const evolvePartnerEmail = `partner.evolve.${Date.now()}@sentineltest.com`;
    const evolvePassword = 'EvolveSecure@123';
    let evolveSessionToken: string;

    beforeAll(async () => {
      // Busca ou cria o tenant GRUPO EVOLVE com slug grupoevolve
      let evolveTenant = await prisma.tenant.findUnique({
        where: { slug: 'grupoevolve' },
        include: { whiteLabel: true },
      });

      if (!evolveTenant) {
        evolveTenant = await prisma.tenant.create({
          data: {
            name: 'GRUPO EVOLVE',
            tradeName: 'EVOLVE PROMOTORA',
            slug: 'grupoevolve',
            status: 'ACTIVE',
            whiteLabel: {
              create: {
                companyName: 'GRUPO EVOLVE',
                logoUrl: 'https://i.ibb.co/hFDZ5wDc/Chat-GPT-Image-17-de-set-de-2026-23-21-36.png',
              },
            },
          },
          include: { whiteLabel: true },
        });
      }
      evolveTenantId = evolveTenant.id;

      // Cria parceiro do GRUPO EVOLVE
      const evolvePartner = await prisma.partner.create({
        data: {
          tenantId: evolveTenantId,
          name: 'Parceiro Exclusivo Evolve',
          code: `EVO-${Date.now().toString().slice(-4)}`,
          status: 'ATIVO',
          email: evolvePartnerEmail,
        },
      });
      evolvePartnerId = evolvePartner.id;

      // Cria acesso ao portal para o parceiro Evolve
      const passwordHash = await hashPassword(evolvePassword);
      const access = await prisma.partnerPortalAccess.create({
        data: {
          tenantId: evolveTenantId,
          partnerId: evolvePartnerId,
          name: 'Operador Evolve',
          email: evolvePartnerEmail,
          passwordHash,
          active: true,
          mustChangePassword: false,
        },
      });
      evolveAccessId = access.id;
    });

    afterAll(async () => {
      await prisma.partnerPortalSession.deleteMany({ where: { partnerId: evolvePartnerId } }).catch(() => {});
      await prisma.partnerPortalAccess.deleteMany({ where: { id: evolveAccessId } }).catch(() => {});
      await prisma.partner.deleteMany({ where: { id: evolvePartnerId } }).catch(() => {});
    });

    it('deve resolver public branding com companyName "GRUPO EVOLVE" ao acessar pelo host grupoevolve.sentinelconsig.com.br', async () => {
      const res = await request(app)
        .get('/api/public/tenant-branding')
        .set('Host', 'grupoevolve.sentinelconsig.com.br');

      expect(res.status).toBe(200);
      expect(res.body.companyName).toBe('GRUPO EVOLVE');
      expect(res.body.status).toBe('CONFIGURED');
      expect(res.body.domainType).toBe('PLATFORM_SUBDOMAIN');
    });

    it('ADVERSARIAL: deve rejeitar login no subdomínio grupoevolve com credenciais de parceiro pertencente a outro tenant', async () => {
      // partnerAEmail pertence ao tenantAId, não ao grupoevolve
      const res = await request(app)
        .post('/api/partner-portal/auth/login')
        .set('Host', 'grupoevolve.sentinelconsig.com.br')
        .send({ email: partnerAEmail, password: 'NovaSenhaSegura@2026' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/inválidas|não cadastrado/i);
    });

    it('deve autenticar com sucesso parceiro do GRUPO EVOLVE quando acessado pelo host grupoevolve.sentinelconsig.com.br', async () => {
      const res = await request(app)
        .post('/api/partner-portal/auth/login')
        .set('Host', 'grupoevolve.sentinelconsig.com.br')
        .send({ email: evolvePartnerEmail, password: evolvePassword });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant.name).toBe('GRUPO EVOLVE');
      expect(res.body.tenant.id).toBe(evolveTenantId);
      expect(res.body.partner.id).toBe(evolvePartnerId);
      evolveSessionToken = res.body.token;
    });

    it('ADVERSARIAL: se uma sessão válida de outro tenant for apresentada ao host grupoevolve, o backend DEVE rejeitar (401)', async () => {
      // partnerBToken pertence a tenantBId, não a grupoevolve
      const res = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Host', 'grupoevolve.sentinelconsig.com.br')
        .set('Cookie', [`cg_partner_session_id=${partnerBToken}`]);

      expect(res.status).toBe(401);
      expect(res.body.authenticated).toBe(false);
    });

    it('deve validar e retornar contexto do GRUPO EVOLVE quando a sessão correta é apresentada ao host do GRUPO EVOLVE', async () => {
      const res = await request(app)
        .get('/api/partner-portal/auth/session')
        .set('Host', 'grupoevolve.sentinelconsig.com.br')
        .set('Cookie', [`cg_partner_session_id=${evolveSessionToken}`]);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.tenant.name).toBe('GRUPO EVOLVE');
      expect(res.body.tenant.id).toBe(evolveTenantId);
      expect(res.body.partner.id).toBe(evolvePartnerId);
    });
  });
});
