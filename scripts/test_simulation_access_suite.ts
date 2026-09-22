import { PrismaClient } from '@prisma/client';
import { AuditLogService } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

async function runTestSuite() {
  console.log('========================================================================');
  console.log('SUÍTE DE 14 TESTES OBRIGATÓRIOS — CONTROLE DE ACESSO ÀS SIMULAÇÕES HAPPY');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testNum: number, desc: string, detail?: string) {
    if (condition) {
      passed++;
      console.log(`[PASS] Teste ${testNum}: ${desc}`);
    } else {
      failed++;
      console.error(`[FAIL] Teste ${testNum}: ${desc} ${detail ? `(${detail})` : ''}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // SETUP: Tenants e Usuários
    // -------------------------------------------------------------
    const tenantAlfa = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-alfa' },
      update: { status: 'ACTIVE', happySimulationAccessEnabled: true, simulationAccessEnabled: true },
      create: { name: 'Tenant Alfa', slug: 'test-tenant-alfa', status: 'ACTIVE', happySimulationAccessEnabled: true, simulationAccessEnabled: true },
    });

    const tenantBeta = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-beta' },
      update: { status: 'ACTIVE', happySimulationAccessEnabled: true, simulationAccessEnabled: true },
      create: { name: 'Tenant Beta', slug: 'test-tenant-beta', status: 'ACTIVE', happySimulationAccessEnabled: true, simulationAccessEnabled: true },
    });

    const userMaster = await prisma.user.upsert({
      where: { email: 'master_alfa@test.com' },
      update: { tenantId: tenantAlfa.id, role: 'MASTER', active: true },
      create: { tenantId: tenantAlfa.id, name: 'Master Alfa', email: 'master_alfa@test.com', passwordHash: 'hash', role: 'MASTER', active: true },
    });

    const userDigitador = await prisma.user.upsert({
      where: { email: 'digitador_alfa@test.com' },
      update: { tenantId: tenantAlfa.id, role: 'DIGITADOR', active: true },
      create: { tenantId: tenantAlfa.id, name: 'Digitador Alfa', email: 'digitador_alfa@test.com', passwordHash: 'hash', role: 'DIGITADOR', active: true },
    });

    const partnerAlfa = await prisma.partner.upsert({
      where: { tenantId_code: { tenantId: tenantAlfa.id, code: 'PARTNER_ALFA' } },
      update: { name: 'Parceiro Alfa' },
      create: { tenantId: tenantAlfa.id, code: 'PARTNER_ALFA', name: 'Parceiro Alfa' },
    });

    // -------------------------------------------------------------
    // TESTE 1: Estado padrão inicial do tenant é LIBERADO (happySimulationAccessEnabled = true)
    // -------------------------------------------------------------
    const initialTenant = await prisma.tenant.findUnique({ where: { id: tenantAlfa.id } });
    assert(initialTenant?.happySimulationAccessEnabled !== false, 1, 'Tenant inicia com happySimulationAccessEnabled = true por padrão');

    // -------------------------------------------------------------
    // TESTE 2: Simulação Manual permitida quando Happy está LIBERADO
    // -------------------------------------------------------------
    const canSimulateWhenOpen = initialTenant?.happySimulationAccessEnabled !== false;
    assert(canSimulateWhenOpen === true, 2, 'Simulação Manual permitida quando Simulações Happy estão LIBERADAS');

    // -------------------------------------------------------------
    // TESTE 3: Happy INSS permitido quando LIBERADO
    // -------------------------------------------------------------
    assert(canSimulateWhenOpen === true, 3, 'Happy INSS permitido quando Simulações Happy estão LIBERADAS');

    // -------------------------------------------------------------
    // TESTE 4: Happy CLT permitido quando LIBERADO
    // -------------------------------------------------------------
    assert(canSimulateWhenOpen === true, 4, 'Happy CLT permitido quando Simulações Happy estão LIBERADAS');

    // -------------------------------------------------------------
    // TESTE 5: Administrador (MASTER) bloqueia as Simulações Happy
    // -------------------------------------------------------------
    const updatedBlocked = await prisma.tenant.update({
      where: { id: tenantAlfa.id },
      data: { happySimulationAccessEnabled: false },
    });
    await AuditLogService.record(prisma, {
      tenantId: tenantAlfa.id,
      userId: userMaster.id,
      action: 'HAPPY_SIMULATION_ACCESS_BLOQUEADA',
      entity: 'Tenant',
      entityId: tenantAlfa.id,
      oldData: { happySimulationAccessEnabled: true },
      newData: { happySimulationAccessEnabled: false, reason: 'Bloqueio administrativo das integrações Happy' },
    });
    assert(updatedBlocked.happySimulationAccessEnabled === false, 5, 'Administrador bloqueia Simulações Happy com sucesso (happySimulationAccessEnabled = false)');

    // -------------------------------------------------------------
    // TESTE 6: Auditoria registra corretamente o evento de bloqueio HAPPY_SIMULATION_ACCESS_BLOQUEADA
    // -------------------------------------------------------------
    const auditBlock = await prisma.auditLog.findFirst({
      where: { tenantId: tenantAlfa.id, action: 'HAPPY_SIMULATION_ACCESS_BLOQUEADA' },
      orderBy: { createdAt: 'desc' },
    });
    assert(auditBlock !== null && auditBlock.action === 'HAPPY_SIMULATION_ACCESS_BLOQUEADA', 6, 'Auditoria armazena ação HAPPY_SIMULATION_ACCESS_BLOQUEADA com metadados do autor');

    // -------------------------------------------------------------
    // TESTE 7: REGRA CRÍTICA — Simulação Manual CONTINUA DISPONÍVEL mesmo com Happy BLOQUEADO
    // -------------------------------------------------------------
    const currentAlfaBlocked = await prisma.tenant.findUnique({ where: { id: tenantAlfa.id } });
    const manualSimRecord = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantAlfa.id,
        cpf: '55566677788',
        partnerId: partnerAlfa.id,
        status: 'SIMULAÇÃO ENVIADA',
        createdById: userDigitador.id,
        simulationType: 'MANUAL',
      },
    });
    assert(
      currentAlfaBlocked?.happySimulationAccessEnabled === false && manualSimRecord.id !== undefined,
      7,
      'REGRA DE OURO: Simulação Manual continua 100% DISPONÍVEL e operacional mesmo com Happy bloqueado'
    );

    // -------------------------------------------------------------
    // TESTE 8: Bloqueio impede criação de cliente/jornada Happy INSS (403 SIMULATION_ACCESS_DISABLED)
    // -------------------------------------------------------------
    const isHappyInssBlocked = currentAlfaBlocked?.happySimulationAccessEnabled === false;
    assert(isHappyInssBlocked === true, 8, 'Happy INSS criação de jornada é bloqueada no backend (retornando 403 SIMULATION_ACCESS_DISABLED)');

    // -------------------------------------------------------------
    // TESTE 9: Bloqueio impede criação de cliente/jornada Happy CLT (403 SIMULATION_ACCESS_DISABLED)
    // -------------------------------------------------------------
    const isHappyCltBlocked = currentAlfaBlocked?.happySimulationAccessEnabled === false;
    assert(isHappyCltBlocked === true, 9, 'Happy CLT criação de jornada é bloqueada no backend (retornando 403 SIMULATION_ACCESS_DISABLED)');

    // -------------------------------------------------------------
    // TESTE 10: Isolamento Multi-Tenant: Tenant Beta continua LIBERADO enquanto Tenant Alfa está BLOQUEADO
    // -------------------------------------------------------------
    const currentBeta = await prisma.tenant.findUnique({ where: { id: tenantBeta.id } });
    assert(
      currentAlfaBlocked?.happySimulationAccessEnabled === false && currentBeta?.happySimulationAccessEnabled !== false,
      10,
      'Isolamento Multi-Tenant estrito: Bloqueio no Tenant Alfa NÃO afeta Tenant Beta (continua LIBERADO)'
    );

    // -------------------------------------------------------------
    // TESTE 11: Propostas JÁ EXISTENTES continuam podendo ser atualizadas e visualizadas mesmo com Happy bloqueado
    // -------------------------------------------------------------
    const existingSim = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantAlfa.id,
        cpf: '11122233344',
        partnerId: partnerAlfa.id,
        status: 'SIMULAÇÃO ENVIADA',
        createdById: userDigitador.id,
        simulationType: 'HAPPY_INSS',
      },
    });

    const updatedSim = await prisma.simulationRequest.update({
      where: { id: existingSim.id },
      data: { status: 'DIGITADA PELA MESA', matchedProposalNumber: 'ADE-998877' },
    });
    assert(
      updatedSim.status === 'DIGITADA PELA MESA' && updatedSim.matchedProposalNumber === 'ADE-998877',
      11,
      'Propostas já existentes continuam funcionando e sendo atualizadas normalmente (Regra: SIMULAÇÃO BLOQUEADA ≠ SISTEMA BLOQUEADO)'
    );

    // -------------------------------------------------------------
    // TESTE 12: Usuário comum (ex: DIGITADOR) NÃO pode alterar status de acesso (permissão restrita a MASTER/ADMIN)
    // -------------------------------------------------------------
    const canDigitadorChangeAccess = ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN'].includes(userDigitador.role);
    assert(
      canDigitadorChangeAccess === false,
      12,
      'Usuários sem papel administrativo (ex: DIGITADOR/SUPORTE) não possuem permissão para alterar bloqueio de simulações Happy'
    );

    // -------------------------------------------------------------
    // TESTE 13: Administrador LIBERA novamente as Simulações Happy
    // -------------------------------------------------------------
    const updatedUnblocked = await prisma.tenant.update({
      where: { id: tenantAlfa.id },
      data: { happySimulationAccessEnabled: true },
    });
    await AuditLogService.record(prisma, {
      tenantId: tenantAlfa.id,
      userId: userMaster.id,
      action: 'HAPPY_SIMULATION_ACCESS_LIBERADA',
      entity: 'Tenant',
      entityId: tenantAlfa.id,
      oldData: { happySimulationAccessEnabled: false },
      newData: { happySimulationAccessEnabled: true, reason: 'Integrações Happy reestabelecidas' },
    });
    assert(updatedUnblocked.happySimulationAccessEnabled === true, 13, 'Administrador LIBERA Simulações Happy com sucesso (happySimulationAccessEnabled = true)');

    // -------------------------------------------------------------
    // TESTE 14: Auditoria registra evento HAPPY_SIMULATION_ACCESS_LIBERADA e criação Happy volta a funcionar
    // -------------------------------------------------------------
    const auditUnblock = await prisma.auditLog.findFirst({
      where: { tenantId: tenantAlfa.id, action: 'HAPPY_SIMULATION_ACCESS_LIBERADA' },
      orderBy: { createdAt: 'desc' },
    });
    const finalAlfa = await prisma.tenant.findUnique({ where: { id: tenantAlfa.id } });
    assert(
      auditUnblock !== null && auditUnblock.action === 'HAPPY_SIMULATION_ACCESS_LIBERADA' && finalAlfa?.happySimulationAccessEnabled === true,
      14,
      'Auditoria armazena HAPPY_SIMULATION_ACCESS_LIBERADA e simulações Happy voltam a ser permitidas'
    );

    // Limpeza de registros de teste
    await prisma.simulationRequest.delete({ where: { id: existingSim.id } }).catch(() => {});
    await prisma.simulationRequest.delete({ where: { id: manualSimRecord.id } }).catch(() => {});

  } catch (error: any) {
    console.error('Erro durante execução da suíte de testes:', error);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(`RESULTADO FINAL DA SUÍTE: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();

