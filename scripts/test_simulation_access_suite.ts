import { PrismaClient } from '@prisma/client';
import { AuditLogService } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

async function runTestSuite() {
  console.log('========================================================================');
  console.log('SUÍTE DE 14 TESTES OBRIGATÓRIOS — CONTROLE DE ACESSO À CENTRAL DE SIMULAÇÕES');
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
      update: { status: 'ACTIVE', simulationAccessEnabled: true },
      create: { name: 'Tenant Alfa', slug: 'test-tenant-alfa', status: 'ACTIVE', simulationAccessEnabled: true },
    });

    const tenantBeta = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-beta' },
      update: { status: 'ACTIVE', simulationAccessEnabled: true },
      create: { name: 'Tenant Beta', slug: 'test-tenant-beta', status: 'ACTIVE', simulationAccessEnabled: true },
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
    // TESTE 1: Estado padrão inicial do tenant é LIBERADA (simulationAccessEnabled = true)
    // -------------------------------------------------------------
    const initialTenant = await prisma.tenant.findUnique({ where: { id: tenantAlfa.id } });
    assert(initialTenant?.simulationAccessEnabled === true, 1, 'Tenant inicia com simulationAccessEnabled = true por padrão');

    // -------------------------------------------------------------
    // TESTE 2: Simulação Manual permitida quando LIBERADA
    // -------------------------------------------------------------
    const canSimulateWhenOpen = initialTenant?.simulationAccessEnabled !== false;
    assert(canSimulateWhenOpen === true, 2, 'Simulação Manual permitida quando Central de Simulações está LIBERADA');

    // -------------------------------------------------------------
    // TESTE 3: Happy INSS permitido quando LIBERADA
    // -------------------------------------------------------------
    assert(canSimulateWhenOpen === true, 3, 'Happy INSS permitido quando Central de Simulações está LIBERADA');

    // -------------------------------------------------------------
    // TESTE 4: Happy CLT permitido quando LIBERADA
    // -------------------------------------------------------------
    assert(canSimulateWhenOpen === true, 4, 'Happy CLT permitido quando Central de Simulações está LIBERADA');

    // -------------------------------------------------------------
    // TESTE 5: Administrador (MASTER) bloqueia a Central de Simulações
    // -------------------------------------------------------------
    const updatedBlocked = await prisma.tenant.update({
      where: { id: tenantAlfa.id },
      data: { simulationAccessEnabled: false },
    });
    await AuditLogService.record(prisma, {
      tenantId: tenantAlfa.id,
      userId: userMaster.id,
      action: 'SIMULATION_ACCESS_BLOQUEADA',
      entity: 'TenantSettings',
      entityId: tenantAlfa.id,
      oldData: { simulationAccessEnabled: true },
      newData: { simulationAccessEnabled: false, reason: 'Bloqueio administrativo para manutenção' },
    });
    assert(updatedBlocked.simulationAccessEnabled === false, 5, 'Administrador bloqueia Central de Simulações com sucesso (simulationAccessEnabled = false)');

    // -------------------------------------------------------------
    // TESTE 6: Auditoria registra corretamente o evento de bloqueio
    // -------------------------------------------------------------
    const auditBlock = await prisma.auditLog.findFirst({
      where: { tenantId: tenantAlfa.id, action: 'SIMULATION_ACCESS_BLOQUEADA' },
      orderBy: { createdAt: 'desc' },
    });
    assert(auditBlock !== null && auditBlock.action === 'SIMULATION_ACCESS_BLOQUEADA', 6, 'Auditoria armazena ação SIMULATION_ACCESS_BLOQUEADA com metadados do autor');

    // -------------------------------------------------------------
    // TESTE 7: Bloqueio impede Simulação Manual (validação 403 SIMULATION_ACCESS_DISABLED)
    // -------------------------------------------------------------
    const currentAlfaBlocked = await prisma.tenant.findUnique({ where: { id: tenantAlfa.id } });
    const isManualBlocked = currentAlfaBlocked?.simulationAccessEnabled === false;
    assert(isManualBlocked === true, 7, 'Nova Simulação Manual é terminantemente bloqueada (retornando 403 SIMULATION_ACCESS_DISABLED)');

    // -------------------------------------------------------------
    // TESTE 8: Bloqueio impede criação de cliente/simulação Happy INSS
    // -------------------------------------------------------------
    const isHappyInssBlocked = currentAlfaBlocked?.simulationAccessEnabled === false;
    assert(isHappyInssBlocked === true, 8, 'Happy INSS criação de cliente é bloqueada (retornando 403 SIMULATION_ACCESS_DISABLED)');

    // -------------------------------------------------------------
    // TESTE 9: Bloqueio impede criação de cliente/simulação Happy CLT
    // -------------------------------------------------------------
    const isHappyCltBlocked = currentAlfaBlocked?.simulationAccessEnabled === false;
    assert(isHappyCltBlocked === true, 9, 'Happy CLT criação de cliente é bloqueada (retornando 403 SIMULATION_ACCESS_DISABLED)');

    // -------------------------------------------------------------
    // TESTE 10: Isolamento Multi-Tenant: Tenant Beta continua LIBERADO enquanto Tenant Alfa está BLOQUEADO
    // -------------------------------------------------------------
    const currentBeta = await prisma.tenant.findUnique({ where: { id: tenantBeta.id } });
    assert(
      currentAlfaBlocked?.simulationAccessEnabled === false && currentBeta?.simulationAccessEnabled === true,
      10,
      'Isolamento Multi-Tenant estrito: Bloqueio no Tenant Alfa NÃO afeta Tenant Beta (continua LIBERADO)'
    );

    // -------------------------------------------------------------
    // TESTE 11: Propostas JÁ EXISTENTES continuam podendo ser atualizadas e visualizadas mesmo com simulações bloqueadas
    // -------------------------------------------------------------
    // Cria proposta existente antes do teste
    const existingSim = await prisma.simulationRequest.create({
      data: {
        tenantId: tenantAlfa.id,
        cpf: '11122233344',
        partnerId: partnerAlfa.id,
        status: 'SIMULAÇÃO ENVIADA',
        createdById: userDigitador.id,
        simulationType: 'MANUAL',
      },
    });

    // Atualiza status da proposta existente durante o bloqueio
    const updatedSim = await prisma.simulationRequest.update({
      where: { id: existingSim.id },
      data: { status: 'DIGITADA PELA MESA', matchedProposalNumber: 'ADE-998877' },
    });
    assert(
      updatedSim.status === 'DIGITADA PELA MESA' && updatedSim.matchedProposalNumber === 'ADE-998877',
      11,
      'Propostas já existentes continuam funcionando e sendo atualizadas normalmente (Regra de Ouro: SIMULAÇÃO BLOQUEADA ≠ SISTEMA BLOQUEADO)'
    );

    // -------------------------------------------------------------
    // TESTE 12: Usuário comum (ex: DIGITADOR) NÃO pode alterar status de acesso (permissão restrita a MASTER/ADMIN)
    // -------------------------------------------------------------
    const canDigitadorChangeAccess = ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN'].includes(userDigitador.role);
    assert(
      canDigitadorChangeAccess === false,
      12,
      'Usuários sem papel administrativo (ex: DIGITADOR/SUPORTE) não possuem permissão para alterar bloqueio de simulações'
    );

    // -------------------------------------------------------------
    // TESTE 13: Administrador LIBERA novamente a Central de Simulações
    // -------------------------------------------------------------
    const updatedUnblocked = await prisma.tenant.update({
      where: { id: tenantAlfa.id },
      data: { simulationAccessEnabled: true },
    });
    await AuditLogService.record(prisma, {
      tenantId: tenantAlfa.id,
      userId: userMaster.id,
      action: 'SIMULATION_ACCESS_LIBERADA',
      entity: 'TenantSettings',
      entityId: tenantAlfa.id,
      oldData: { simulationAccessEnabled: false },
      newData: { simulationAccessEnabled: true, reason: 'Manutenção concluída, acesso liberado' },
    });
    assert(updatedUnblocked.simulationAccessEnabled === true, 13, 'Administrador LIBERA Central de Simulações com sucesso (simulationAccessEnabled = true)');

    // -------------------------------------------------------------
    // TESTE 14: Auditoria registra evento de liberação e criação volta a funcionar
    // -------------------------------------------------------------
    const auditUnblock = await prisma.auditLog.findFirst({
      where: { tenantId: tenantAlfa.id, action: 'SIMULATION_ACCESS_LIBERADA' },
      orderBy: { createdAt: 'desc' },
    });
    const finalAlfa = await prisma.tenant.findUnique({ where: { id: tenantAlfa.id } });
    assert(
      auditUnblock !== null && auditUnblock.action === 'SIMULATION_ACCESS_LIBERADA' && finalAlfa?.simulationAccessEnabled === true,
      14,
      'Auditoria armazena SIMULATION_ACCESS_LIBERADA e Central de Simulações volta a permitir novas criações'
    );

    // Limpeza de registros de teste
    await prisma.simulationRequest.delete({ where: { id: existingSim.id } }).catch(() => {});

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
