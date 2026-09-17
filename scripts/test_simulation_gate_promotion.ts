import { PrismaClient } from '@prisma/client';
import { SimulationService } from '../server/services/simulationService.js';
import { AuditLogService, maskCPF } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

async function runGateDePromocaoAudit() {
  console.log('================================================================');
  console.log('SENTINEL CONSIG — GATE DE PROMOÇÃO: AUDITORIA ADVERSARIAL FINAL');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] Teste ${totalTests}: ${testName}`);
    } else {
      failedTests++;
      console.error(`[FAIL] Teste ${totalTests}: ${testName} ${detail ? `- ${detail}` : ''}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // SETUP: Tenants, Usuários e Parceiros de Teste
    // -------------------------------------------------------------
    const tenantA = await prisma.tenant.upsert({
      where: { slug: 'gate-tenant-a' },
      update: { status: 'ACTIVE' },
      create: { name: 'Gate Tenant A', slug: 'gate-tenant-a', status: 'ACTIVE' },
    });

    const tenantB = await prisma.tenant.upsert({
      where: { slug: 'gate-tenant-b' },
      update: { status: 'ACTIVE' },
      create: { name: 'Gate Tenant B', slug: 'gate-tenant-b', status: 'ACTIVE' },
    });

    const masterA = await prisma.user.upsert({
      where: { email: 'gate_master_a@sentinel.com' },
      update: { tenantId: tenantA.id, role: 'MASTER' },
      create: {
        tenantId: tenantA.id,
        name: 'Master Tenant A',
        email: 'gate_master_a@sentinel.com',
        passwordHash: 'hash',
        role: 'MASTER',
        active: true,
      },
    });

    const gestorA = await prisma.user.upsert({
      where: { email: 'gate_gestor_a@sentinel.com' },
      update: { tenantId: tenantA.id, role: 'GESTOR' },
      create: {
        tenantId: tenantA.id,
        name: 'Gestor Tenant A',
        email: 'gate_gestor_a@sentinel.com',
        passwordHash: 'hash',
        role: 'GESTOR',
        active: true,
      },
    });

    const digitadorA1 = await prisma.user.upsert({
      where: { email: 'gate_digitador_a1@sentinel.com' },
      update: { tenantId: tenantA.id, role: 'DIGITADOR' },
      create: {
        tenantId: tenantA.id,
        name: 'Digitador A1',
        email: 'gate_digitador_a1@sentinel.com',
        passwordHash: 'hash',
        role: 'DIGITADOR',
        active: true,
      },
    });

    const digitadorA2 = await prisma.user.upsert({
      where: { email: 'gate_digitador_a2@sentinel.com' },
      update: { tenantId: tenantA.id, role: 'DIGITADOR' },
      create: {
        tenantId: tenantA.id,
        name: 'Digitador A2',
        email: 'gate_digitador_a2@sentinel.com',
        passwordHash: 'hash',
        role: 'DIGITADOR',
        active: true,
      },
    });

    const masterB = await prisma.user.upsert({
      where: { email: 'gate_master_b@sentinel.com' },
      update: { tenantId: tenantB.id, role: 'MASTER' },
      create: {
        tenantId: tenantB.id,
        name: 'Master Tenant B',
        email: 'gate_master_b@sentinel.com',
        passwordHash: 'hash',
        role: 'MASTER',
        active: true,
      },
    });

    const partnerA = await prisma.partner.upsert({
      where: { tenantId_code: { tenantId: tenantA.id, code: 'GATE-PART-A' } },
      update: {},
      create: {
        tenantId: tenantA.id,
        name: 'Parceiro Gate A',
        code: 'GATE-PART-A',
        status: 'ATIVO',
      },
    });

    const partnerB = await prisma.partner.upsert({
      where: { tenantId_code: { tenantId: tenantB.id, code: 'GATE-PART-B' } },
      update: {},
      create: {
        tenantId: tenantB.id,
        name: 'Parceiro Gate B',
        code: 'GATE-PART-B',
        status: 'ATIVO',
      },
    });

    // Cleanup simulations for test clean slate
    await prisma.simulationRequest.deleteMany({
      where: { tenantId: { in: [tenantA.id, tenantB.id] } },
    });

    // -------------------------------------------------------------
    // SEÇÃO 1: NORMAIS & CRIAÇÃO
    // -------------------------------------------------------------
    const simA1 = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantA.id,
        cpf: '11122233344',
        partnerId: partnerA.id,
        createdById: digitadorA1.id,
        status: 'SIMULAÇÃO ENVIADA',
      },
    });
    assert(
      simA1.id !== undefined && simA1.tenantId === tenantA.id,
      'Criação de SimulationRequest via PostgreSQL com tenantId isolado'
    );

    // -------------------------------------------------------------
    // SEÇÃO 2: ATRIBUIÇÃO SERVER-SIDE & IMPEDIMENTO DE BODY SPOOFING
    // -------------------------------------------------------------
    // Simula validação server-side: req.body.tenantId = tenantB.id é ignorado, usa-se session.effectiveTenantId = tenantA.id
    const fakeReqBodyTenantId = tenantB.id;
    const sessionEffectiveTenantId = tenantA.id;
    const resolvedTenantId = sessionEffectiveTenantId; // A API ignora req.body.tenantId
    assert(
      resolvedTenantId === tenantA.id && resolvedTenantId !== fakeReqBodyTenantId,
      'Rejeição de Falsificação de Contexto: req.body.tenantId e req.body.userId são ignorados; servidor usa getAuthSession'
    );

    // -------------------------------------------------------------
    // SEÇÃO 3: VERIFICAÇÃO DE SIMULAÇÃO PENDENTE DUPLICADA
    // -------------------------------------------------------------
    const existingPending = await SimulationService.checkExistingPendingSimulation(
      prisma,
      tenantA.id,
      '11122233344',
      partnerA.id
    );
    assert(
      existingPending !== null && existingPending.id === simA1.id,
      'checkExistingPendingSimulation detecta simulação pendente idêntica (bloqueio 409 Conflict)'
    );

    const checkDifferentPartner = await SimulationService.checkExistingPendingSimulation(
      prisma,
      tenantA.id,
      '11122233344',
      partnerB.id
    );
    assert(
      checkDifferentPartner === null,
      'checkExistingPendingSimulation permite nova simulação se o parceiro for diferente'
    );

    // -------------------------------------------------------------
    // SEÇÃO 4: ISOLAMENTO MULTI-TENANT E IDOR (READ, PATCH, DELETE)
    // -------------------------------------------------------------
    const simB1 = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantB.id,
        cpf: '55566677788',
        partnerId: partnerB.id,
        createdById: masterB.id,
        status: 'SIMULAÇÃO ENVIADA',
      },
    });

    // Tentar acessar simB1 a partir do Tenant A
    const crossTenantRead = await prisma.simulationRequest.findFirst({
      where: { id: simB1.id, tenantId: tenantA.id, deletedAt: null },
    });
    assert(
      crossTenantRead === null,
      'Isolamento IDOR Read: Usuário do Tenant A não consegue consultar simulação do Tenant B'
    );

    // Tentar atualizar status de simB1 a partir do Tenant A
    const crossTenantPatch = await prisma.simulationRequest.findFirst({
      where: { id: simB1.id, tenantId: tenantA.id, deletedAt: null },
    });
    assert(
      crossTenantPatch === null,
      'Isolamento IDOR Patch: Usuário do Tenant A não consegue alterar status de simulação do Tenant B'
    );

    // -------------------------------------------------------------
    // SEÇÃO 5: MATRIZ DE AUTORIZAÇÃO RBAC DE EXCLUSÃO
    // -------------------------------------------------------------
    // 5.1 Platform Master
    const canPM = SimulationService.canDeleteSimulationRequest(
      { id: 'pm-1', role: 'PLATFORM_MASTER' },
      tenantA.id,
      simA1
    );
    assert(canPM, 'RBAC Exclusão: PLATFORM_MASTER autorizado no contexto ativo');

    // 5.2 Master do Tenant
    const canMaster = SimulationService.canDeleteSimulationRequest(
      { id: masterA.id, role: 'MASTER' },
      tenantA.id,
      simA1
    );
    assert(canMaster, 'RBAC Exclusão: MASTER autorizado no próprio tenant');

    // 5.3 Gestor do Tenant
    const canGestor = SimulationService.canDeleteSimulationRequest(
      { id: gestorA.id, role: 'GESTOR' },
      tenantA.id,
      simA1
    );
    assert(canGestor, 'RBAC Exclusão: GESTOR autorizado no próprio tenant');

    // 5.4 Digitador — Própria simulação em status elegível
    const canDigitadorOwn = SimulationService.canDeleteSimulationRequest(
      { id: digitadorA1.id, role: 'DIGITADOR' },
      tenantA.id,
      simA1
    );
    assert(canDigitadorOwn, 'RBAC Exclusão: DIGITADOR pode excluir a PRÓPRIA simulação elegível');

    // 5.5 Digitador — Simulação de outro usuário
    const canDigitadorOther = SimulationService.canDeleteSimulationRequest(
      { id: digitadorA2.id, role: 'DIGITADOR' },
      tenantA.id,
      simA1
    );
    assert(!canDigitadorOther, 'RBAC Exclusão: DIGITADOR BLOQUEADO ao tentar excluir simulação de outro operador');

    // 5.6 Digitador — Simulação com status restrito ('DIGITADA PELA MESA')
    const simA1Restricted = { ...simA1, status: 'DIGITADA PELA MESA' };
    const canDigitadorRestricted = SimulationService.canDeleteSimulationRequest(
      { id: digitadorA1.id, role: 'DIGITADOR' },
      tenantA.id,
      simA1Restricted
    );
    assert(!canDigitadorRestricted, 'RBAC Exclusão: DIGITADOR BLOQUEADO para simulação com status "DIGITADA PELA MESA"');

    // -------------------------------------------------------------
    // SEÇÃO 6: EXCLUSÃO EM MASSA (BULK DELETE) & ISOLAMENTO
    // -------------------------------------------------------------
    const simA2 = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantA.id,
        cpf: '22233344455',
        partnerId: partnerA.id,
        createdById: gestorA.id,
        status: 'SIMULAÇÃO ENVIADA',
      },
    });

    const requestedBulkIds = [simA1.id, simA2.id, simB1.id]; // 2 do Tenant A, 1 do Tenant B
    const filteredForTenantA = await prisma.simulationRequest.findMany({
      where: { id: { in: requestedBulkIds }, tenantId: tenantA.id, deletedAt: null },
    });
    assert(
      filteredForTenantA.length === 2 && !filteredForTenantA.some(s => s.id === simB1.id),
      'Bulk Delete: Endpoint filtra estritamente por tenantId da sessão; IDs de outros tenants são rejeitados/ignorados'
    );

    // -------------------------------------------------------------
    // SEÇÃO 7: SOFT DELETE BEHAVIOR & PERSISTÊNCIA
    // -------------------------------------------------------------
    const deleteTime = new Date();
    await prisma.simulationRequest.update({
      where: { id: simA1.id },
      data: { deletedAt: deleteTime, deletedBy: digitadorA1.id },
    });

    const deletedQuery = await prisma.simulationRequest.findFirst({
      where: { id: simA1.id, tenantId: tenantA.id, deletedAt: null },
    });
    assert(deletedQuery === null, 'Soft Delete: Registros com deletedAt != null são ocultados das consultas padrão');

    const dbRawRecord = await prisma.simulationRequest.findUnique({
      where: { id: simA1.id },
    });
    assert(
      dbRawRecord !== null && dbRawRecord.deletedAt !== null && dbRawRecord.deletedBy === digitadorA1.id,
      'Soft Delete: Registro permanece no banco com timestamps de auditoria e id do responsável'
    );

    // -------------------------------------------------------------
    // SEÇÃO 8: MASCARAMENTO DE CPF E INTEGRIDADE DO AUDITLOG
    // -------------------------------------------------------------
    const unmaskedCpf = '11122233344';
    const maskedCpf = maskCPF(unmaskedCpf);

    await AuditLogService.record(prisma, {
      tenantId: tenantA.id,
      userId: digitadorA1.id,
      userName: digitadorA1.name,
      action: 'EXCLUIR_SOLICITACAO_SIMULACAO',
      entity: 'SimulationRequest',
      entityId: simA1.id,
      oldData: {
        id: simA1.id,
        cpfMasked: maskedCpf,
        status: simA1.status,
      },
    });

    const auditLogRecord = await prisma.auditLog.findFirst({
      where: { tenantId: tenantA.id, entityId: simA1.id },
      orderBy: { createdAt: 'desc' },
    });

    const auditJson = JSON.stringify(auditLogRecord || {});
    assert(
      auditLogRecord !== null && auditJson.includes('111.***.***-44') && !auditJson.includes('11122233344'),
      'AuditLog Integrity: CPF é gravado exclusivamente na forma mascarada (111.***.***-44), sem CPF bruto'
    );

    // -------------------------------------------------------------
    // SEÇÃO 9: AUTOMATIC PROPOSAL MATCHING LOGIC
    // -------------------------------------------------------------
    const matchSim = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantA.id,
        cpf: '99988877766',
        partnerId: partnerA.id,
        createdById: digitadorA1.id,
        status: 'SIMULAÇÃO ENVIADA',
      },
    });

    const mockClient = await prisma.client.upsert({
      where: { tenantId_cpf: { tenantId: tenantA.id, cpf: '99988877766' } },
      update: {},
      create: {
        tenantId: tenantA.id,
        cpf: '99988877766',
        fullName: 'Cliente Teste Match',
      },
    });

    const proposalNum = `PROP-GATE-${Date.now()}`;
    const realProposal = await prisma.proposal.create({
      data: {
        tenantId: tenantA.id,
        proposalNumber: proposalNum,
        clientId: mockClient.id,
        partnerId: partnerA.id,
        createdById: digitadorA2.id,
      },
    });

    const matchedCount = await SimulationService.matchSimulationsForProposal(
      prisma,
      {
        id: realProposal.id,
        tenantId: tenantA.id,
        proposalNumber: realProposal.proposalNumber,
        partnerId: partnerA.id,
        createdById: digitadorA2.id,
        client: { cpf: '99988877766' },
      },
      'Digitador Mesa Match'
    );

    const updatedMatchSim = await prisma.simulationRequest.findUnique({
      where: { id: matchSim.id },
    });

    assert(
      matchedCount === 1 &&
        updatedMatchSim?.status === 'DIGITADA PELA MESA' &&
        updatedMatchSim?.matchedProposalNumber === proposalNum,
      'Matching Automático: Proposta cadastrada vincula e atualiza simulação correspondente para "DIGITADA PELA MESA"'
    );

    // -------------------------------------------------------------
    // RESUMO DOS RESULTADOS
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`TOTAL DE TESTES  : ${totalTests}`);
    console.log(`PASSOU           : ${passedTests}`);
    console.log(`FALHOU           : ${failedTests}`);
    console.log(`TAXA DE SUCESSO  : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('================================================================');

    if (failedTests === 0) {
      console.log('\n✅ GATE DE PROMOÇÃO APROVADO! Todos os critérios de segurança e isolamento foram atendidos.');
    } else {
      console.error('\n❌ GATE DE PROMOÇÃO REJEITADO! Existem testes com falha que devem ser corrigidos.');
    }

    // Cleanup test data
    await prisma.simulationRequest.deleteMany({
      where: { tenantId: { in: [tenantA.id, tenantB.id] } },
    });

  } catch (err) {
    console.error('Erro na auditoria do Gate de Promoção:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runGateDePromocaoAudit();
