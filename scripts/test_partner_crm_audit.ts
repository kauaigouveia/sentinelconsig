import { PrismaClient, PriorityLevel, StandardStatusCategory } from '@prisma/client';
import { PartnerCrmService } from '../server/services/partnerCrmService.js';

const prisma = new PrismaClient();

async function runAudit() {
  console.log('====================================================');
  console.log('STARTING TECHNICAL AUDIT: FASE 5 - CRM DE PARCEIROS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${details || ''}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: FUNDAMENTAL RULE - PARTNER NÃO É USER
    // -------------------------------------------------------------
    console.log('\n--- 1. AUDIT: REGRA FUNDAMENTAL (PARTNER NÃO É USER) ---');
    const partnerFields = Object.keys((prisma as any).partner?.fields || {});
    // Verify no password, token, user credentials in partner model
    const prohibitedFields = ['password', 'passwordHash', 'token', 'refreshToken', 'role', 'loginAttempts'];
    const foundProhibited = prohibitedFields.filter(f => partnerFields.includes(f));
    assert(foundProhibited.length === 0, 'Partner model contains zero auth/user-credential fields', foundProhibited.join(', '));

    // -------------------------------------------------------------
    // SETUP TEST TENANTS & USERS
    // -------------------------------------------------------------
    const tenantA = await prisma.tenant.upsert({
      where: { slug: 'tenant-audit-a' },
      update: {},
      create: {
        name: 'Tenant Audit A',
        slug: 'tenant-audit-a',
        cnpj: '00000000000101',
      },
    });

    const tenantB = await prisma.tenant.upsert({
      where: { slug: 'tenant-audit-b' },
      update: {},
      create: {
        name: 'Tenant Audit B',
        slug: 'tenant-audit-b',
        cnpj: '00000000000202',
      },
    });

    const userA = await prisma.user.upsert({
      where: { email: 'audit.userA@example.com' },
      update: { tenantId: tenantA.id },
      create: {
        name: 'Operador Tenant A',
        email: 'audit.userA@example.com',
        passwordHash: 'dummy_hash_for_audit',
        role: 'GESTOR',
        tenantId: tenantA.id,
        active: true,
      },
    });

    const userB = await prisma.user.upsert({
      where: { email: 'audit.userB@example.com' },
      update: { tenantId: tenantB.id },
      create: {
        name: 'Operador Tenant B',
        email: 'audit.userB@example.com',
        passwordHash: 'dummy_hash_for_audit',
        role: 'GESTOR',
        tenantId: tenantB.id,
        active: true,
      },
    });

    // -------------------------------------------------------------
    // TEST 2: MULTI-TENANT ISOLATION (CREATE & QUERY)
    // -------------------------------------------------------------
    console.log('\n--- 2. AUDIT: ISOLAMENTO MULTI-TENANT ---');

    // Clean previous audit partners if any
    await prisma.partnerTask.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.partnerNote.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.partnerInteraction.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.partner.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });

    const partnerA = await prisma.partner.create({
      data: {
        tenantId: tenantA.id,
        name: 'CORRETORA AUDIT A',
        code: 'CORR_A',
        status: 'ATIVO',
        email: 'contato@corretoraA.com',
        phone: '11999990001',
      },
    });

    const partnerB = await prisma.partner.create({
      data: {
        tenantId: tenantB.id,
        name: 'CORRETORA AUDIT B',
        code: 'CORR_B',
        status: 'ATIVO',
        email: 'contato@corretoraB.com',
        phone: '11999990002',
      },
    });

    // Tenant A listing should NOT see Partner B
    const listTenantA = await PartnerCrmService.listPartners(prisma, tenantA.id, {});
    const seesPartnerB = listTenantA.data.some(p => p.id === partnerB.id);
    assert(!seesPartnerB, 'Tenant A listing excludes Tenant B partner');

    // Tenant A detail lookup of Partner B should return null
    const detailsBFromA = await PartnerCrmService.getPartnerDetails(prisma, tenantA.id, partnerB.id);
    assert(detailsBFromA === null, 'Tenant A cannot query details of Tenant B partner');

    // Tenant A creating interaction on Partner B should throw error
    let crossTenantInteractionError = false;
    try {
      await PartnerCrmService.createInteraction(prisma, tenantA.id, userA.id, userA.name, {
        partnerId: partnerB.id,
        type: 'LIGAÇÃO',
        subject: 'Tentativa Cross-tenant',
      });
    } catch (e) {
      crossTenantInteractionError = true;
    }
    assert(crossTenantInteractionError, 'Tenant A cannot create interaction on Tenant B partner');

    // Tenant A creating note on Partner B should throw error
    let crossTenantNoteError = false;
    try {
      await PartnerCrmService.createNote(prisma, tenantA.id, userA.id, userA.name, {
        partnerId: partnerB.id,
        content: 'Tentativa Cross-tenant Note',
      });
    } catch (e) {
      crossTenantNoteError = true;
    }
    assert(crossTenantNoteError, 'Tenant A cannot create note on Tenant B partner');

    // Tenant A creating task on Partner B should throw error
    let crossTenantTaskError = false;
    try {
      await PartnerCrmService.createTask(prisma, tenantA.id, userA.id, userA.name, {
        partnerId: partnerB.id,
        title: 'Tentativa Cross-tenant Task',
      });
    } catch (e) {
      crossTenantTaskError = true;
    }
    assert(crossTenantTaskError, 'Tenant A cannot create task on Tenant B partner');

    // -------------------------------------------------------------
    // TEST 3: INTERACTIONS, NOTES, TASKS & AUDIT TRAIL
    // -------------------------------------------------------------
    console.log('\n--- 3. AUDIT: INTERAÇÕES, NOTAS, TAREFAS & AUDITORIA ---');

    const interaction1 = await PartnerCrmService.createInteraction(prisma, tenantA.id, userA.id, userA.name, {
      partnerId: partnerA.id,
      type: 'REUNIÃO',
      subject: 'Alinhamento Comercial Mensal',
      description: 'Discussão de metas para o próximo trimestre',
      result: 'Acordada meta de R$ 500k',
      nextAction: 'Enviar tabela de comissionamento',
    });
    assert(!!interaction1.id, 'Created interaction successfully');
    assert(interaction1.type === 'REUNIÃO', 'Interaction type preserved');

    const note1 = await PartnerCrmService.createNote(prisma, tenantA.id, userA.id, userA.name, {
      partnerId: partnerA.id,
      content: 'Parceiro prefere contato pelo WhatsApp pela manhã.',
    });
    assert(!!note1.id, 'Created internal note successfully');

    const task1 = await PartnerCrmService.createTask(prisma, tenantA.id, userA.id, userA.name, {
      partnerId: partnerA.id,
      title: 'Enviar tabela de taxas atualizada',
      priority: 'HIGH' as PriorityLevel,
      assignedToId: userA.id,
    });
    assert(!!task1.id, 'Created task / follow-up successfully');
    assert(task1.status === 'PENDENTE', 'New task status is PENDENTE');

    const updatedTask = await PartnerCrmService.updateTask(prisma, tenantA.id, userA.id, userA.name, task1.id, {
      status: 'CONCLUIDA',
    });
    assert(updatedTask.status === 'CONCLUIDA', 'Task completed successfully');
    assert(!!updatedTask.completedAt, 'Task completed timestamp set');

    // -------------------------------------------------------------
    // TEST 4: TIMELINE CONSOLIDATION & CPF MASKING
    // -------------------------------------------------------------
    console.log('\n--- 4. AUDIT: TIMELINE & MASCARAMENTO LGPD ---');

    // Create a mock proposal for Partner A
    const clientA = await prisma.client.create({
      data: {
        tenantId: tenantA.id,
        cpf: '12345678901',
        fullName: 'CLIENTE TESTE AUDIT',
        phone: '11988887777',
      },
    });

    const bankA = await prisma.bank.findFirst({
      where: { tenantId: tenantA.id },
    }) || await prisma.bank.create({
      data: {
        tenantId: tenantA.id,
        name: 'BANCO C6',
        code: '626',
        color: '#242424',
        status: 'ATIVO',
      },
    });

    const proposalA = await prisma.proposal.create({
      data: {
        tenantId: tenantA.id,
        clientId: clientA.id,
        partnerId: partnerA.id,
        bankId: bankA.id,
        proposalNumber: 'PROP-AUDIT-001',
        contractValue: 10000,
        releasedValue: 8500,
        standardCategory: StandardStatusCategory.PAGO,
      },
    });

    const timeline = await PartnerCrmService.getPartnerTimeline(prisma, tenantA.id, partnerA.id);
    assert(timeline.length >= 4, 'Timeline consolidates interactions, notes, tasks, and proposals', `Count: ${timeline.length}`);

    // Verify CPF masking in proposal timeline item
    const propTimelineItem = timeline.find(t => t.type === 'PROPOSAL');
    assert(!!propTimelineItem, 'Proposal found in timeline');
    assert(propTimelineItem?.subtitle?.includes('123.***.***-01') === true, 'Client CPF is masked in timeline item subtitle', propTimelineItem?.subtitle);

    // -------------------------------------------------------------
    // TEST 5: METRICS CALCULATION
    // -------------------------------------------------------------
    console.log('\n--- 5. AUDIT: MÉTRICAS & INDICADORES OPERACIONAIS ---');

    const metrics = await PartnerCrmService.getPartnerMetrics(prisma, tenantA.id, partnerA.id, '30d');
    assert(metrics.summary.totalCount === 1, 'Metrics totalCount matches real proposals', `Expected 1, got ${metrics.summary.totalCount}`);
    assert(metrics.summary.totalContractValue === 10000, 'Metrics totalContractValue accurate', `Expected 10000, got ${metrics.summary.totalContractValue}`);
    assert(metrics.summary.approvedCount === 1, 'Metrics approvedCount accurate', `Expected 1, got ${metrics.summary.approvedCount}`);
    assert(metrics.summary.approvalRate === 100, 'Metrics approvalRate accurate', `Expected 100%, got ${metrics.summary.approvalRate}%`);

    // Clean up test data
    await prisma.proposal.delete({ where: { id: proposalA.id } });
    await prisma.client.delete({ where: { id: clientA.id } });
    await prisma.partnerTask.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.partnerNote.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.partnerInteraction.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.partner.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });

    console.log('\n====================================================');
    console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Audit encountered unexpected error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAudit();
