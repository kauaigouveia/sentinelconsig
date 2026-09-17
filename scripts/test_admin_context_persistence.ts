/**
 * TESTE DE PERSISTÊNCIA DO CONTEXTO ADMINISTRATIVO (POSTGRESQL AUTHORITATIVE)
 *
 * Valida que o AdminContextManager NÃO depende exclusivamente da memória do processo:
 * 1. PLATAFORMA → Empresa A → Reinício de processo (limpeza de memória) → GET /api/auth/session
 * 2. Empresa A → Empresa B → Reinício de processo → GET /api/auth/session
 * 3. Empresa B → PLATAFORMA → Reinício de processo → GET /api/auth/session
 * 4. TTL Expiration persistido
 * 5. Invalidação automática após Soft Delete de tenant
 * 6. Isolamento entre múltiplos PLATFORM_MASTERs concorrentes
 * 7. Limpeza total de sessão em logout
 */

import { PrismaClient } from '@prisma/client';
import { AdminContextManager } from '../server/utils/adminContext';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface TestResult {
  code: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

async function simulateSessionResolution(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { tenant: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  let effectiveTenantId = session.user.tenantId;
  let adminContext: any = null;

  if (session.user.role === 'PLATFORM_MASTER') {
    // 1. Primário: Colunas persistentes na tabela sessions do PostgreSQL
    if (session.adminTargetTenantId && session.adminContextExpiresAt) {
      if (new Date(session.adminContextExpiresAt) > new Date()) {
        const targetTenant = await prisma.tenant.findUnique({
          where: { id: session.adminTargetTenantId },
        });

        if (targetTenant && !targetTenant.deletedAt && targetTenant.status !== 'CANCELLED') {
          adminContext = {
            targetTenantId: targetTenant.id,
            targetTenantName: session.adminTargetTenantName || targetTenant.name,
            switchedAt: session.adminSwitchedAt || session.createdAt,
            expiresAt: session.adminContextExpiresAt,
          };
          effectiveTenantId = targetTenant.id;
          AdminContextManager.warmCache(session.id, adminContext);
        } else {
          await AdminContextManager.clearContext(session.id, prisma);
        }
      } else {
        await AdminContextManager.clearContext(session.id, prisma);
      }
    } else {
      // 2. Fallback: cache em memória
      const cached = AdminContextManager.getContext(session.id);
      if (cached) {
        adminContext = cached;
        effectiveTenantId = cached.targetTenantId;
      }
    }
  }

  return {
    authenticated: true,
    user: {
      id: session.user.id,
      name: session.user.name,
      role: session.user.role,
      tenantId: session.user.tenantId,
    },
    effectiveTenantId,
    adminContext,
    sessionId: session.id,
  };
}

async function runPersistenceSuite() {
  console.log('========================================================================');
  console.log('INICIANDO ADVERSARIAL VALIDATION: PERSISTÊNCIA DO CONTEXTO ADMINISTRATIVO');
  console.log('========================================================================\n');

  try {
    // Setup: Carregar PLATFORM_MASTER e Empresas A e B
    let masterUser = await prisma.user.findFirst({
      where: { role: 'PLATFORM_MASTER', active: true },
    });

    if (!masterUser) {
      masterUser = await prisma.user.create({
        data: {
          name: 'Master Platform Admin',
          email: 'master.persistent@sentinelconsig.com.br',
          role: 'PLATFORM_MASTER',
          passwordHash: 'dummy-hash',
          active: true,
        },
      });
    }

    let tenantA = await prisma.tenant.findFirst({
      where: { id: 'tenant_adv_a', deletedAt: null },
    });
    if (!tenantA) {
      tenantA = await prisma.tenant.upsert({
        where: { slug: 'adv-tenant-a' },
        update: { deletedAt: null, status: 'ACTIVE' },
        create: {
          id: 'tenant_adv_a',
          name: 'EMPRESA A TESTE',
          slug: 'adv-tenant-a',
          status: 'ACTIVE',
          cnpj: '11.111.111/0001-11',
        },
      });
    }

    let tenantB = await prisma.tenant.findFirst({
      where: { id: 'tenant_adv_b', deletedAt: null },
    });
    if (!tenantB) {
      tenantB = await prisma.tenant.upsert({
        where: { slug: 'adv-tenant-b' },
        update: { deletedAt: null, status: 'ACTIVE' },
        create: {
          id: 'tenant_adv_b',
          name: 'EMPRESA B TESTE',
          slug: 'adv-tenant-b',
          status: 'ACTIVE',
          cnpj: '22.222.222/0001-22',
        },
      });
    }

    console.log(`[SETUP] Master User: ${masterUser.email} (${masterUser.id})`);
    console.log(`[SETUP] Empresa A: ${tenantA.name} (${tenantA.id})`);
    console.log(`[SETUP] Empresa B: ${tenantB.name} (${tenantB.id})\n`);

    // Criar sessão de teste no banco
    const sessionToken = `test-token-${crypto.randomUUID()}`;
    const sessionRecord = await prisma.session.create({
      data: {
        userId: masterUser.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // -------------------------------------------------------------------------
    // TESTE 1: PLATAFORMA → Empresa A → Reinício do Processo
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 1: PLATAFORMA → Empresa A → REINÍCIO DO PROCESSO...');

    // 1.1 Alternar para Empresa A com persistência no banco
    await AdminContextManager.setContext(
      sessionRecord.id,
      tenantA.id,
      tenantA.name,
      masterUser.id,
      prisma
    );

    // 1.2 Verificar que está persistido no PostgreSQL
    const dbSessionAfterA = await prisma.session.findUnique({
      where: { id: sessionRecord.id },
    });
    const dbPersistedA = dbSessionAfterA?.adminTargetTenantId === tenantA.id;

    // 1.3 SIMULAÇÃO DO REINÍCIO COMPLETO DO PROCESSO (Limpeza de todo o heap de memória)
    AdminContextManager.resetMemoryCacheForTesting();
    const memoryAfterRestart = AdminContextManager.getContext(sessionRecord.id);
    const memoryIsClean = memoryAfterRestart === null;

    // 1.4 Chamar resolução de sessão SEM executar POST /api/saas/context-switch
    const sessionResolvedA = await simulateSessionResolution(sessionToken);

    const test1Pass =
      dbPersistedA &&
      memoryIsClean &&
      sessionResolvedA?.effectiveTenantId === tenantA.id &&
      sessionResolvedA?.adminContext?.targetTenantId === tenantA.id &&
      sessionResolvedA?.adminContext?.targetTenantName === tenantA.name;

    results.push({
      code: 'PERSIST_1',
      name: 'PLATAFORMA → Empresa A sobrevive a reinício do processo',
      expected: `effectiveTenantId: ${tenantA.id}, targetTenantName: ${tenantA.name}, memória zerada antes da leitura`,
      actual: `effectiveTenantId: ${sessionResolvedA?.effectiveTenantId}, targetTenantName: ${sessionResolvedA?.adminContext?.targetTenantName}, memória zerada: ${memoryIsClean}`,
      status: test1Pass ? 'PASS' : 'FAIL',
      details: 'Valida que o estado administrativo é resgatado do PostgreSQL mesmo após o heap Node.js ser reiniciado.',
    });

    // -------------------------------------------------------------------------
    // TESTE 2: Empresa A → Empresa B → Reinício do Processo
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 2: Empresa A → Empresa B → REINÍCIO DO PROCESSO...');

    // 2.1 Alternar de Empresa A para Empresa B
    await AdminContextManager.setContext(
      sessionRecord.id,
      tenantB.id,
      tenantB.name,
      masterUser.id,
      prisma
    );

    // 2.2 Simular novo reinício de processo / nova instância backend
    AdminContextManager.resetMemoryCacheForTesting();

    // 2.3 Resolução da sessão
    const sessionResolvedB = await simulateSessionResolution(sessionToken);

    const test2Pass =
      sessionResolvedB?.effectiveTenantId === tenantB.id &&
      sessionResolvedB?.adminContext?.targetTenantId === tenantB.id &&
      sessionResolvedB?.adminContext?.targetTenantName === tenantB.name;

    results.push({
      code: 'PERSIST_2',
      name: 'Empresa A → Empresa B sobrevive a reinício do processo',
      expected: `effectiveTenantId: ${tenantB.id}, targetTenantName: ${tenantB.name}`,
      actual: `effectiveTenantId: ${sessionResolvedB?.effectiveTenantId}, targetTenantName: ${sessionResolvedB?.adminContext?.targetTenantName}`,
      status: test2Pass ? 'PASS' : 'FAIL',
      details: 'Valida a transição de um tenant para outro com gravação no banco e resiliência após reboot.',
    });

    // -------------------------------------------------------------------------
    // TESTE 3: Empresa B → PLATAFORMA (Exit) → Reinício do Processo
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 3: Empresa B → PLATAFORMA → REINÍCIO DO PROCESSO...');

    // 3.1 Executar saída do contexto administrativo
    await AdminContextManager.clearContext(sessionRecord.id, prisma);

    // 3.2 Simular reinício do processo
    AdminContextManager.resetMemoryCacheForTesting();

    // 3.3 Resolução da sessão
    const sessionResolvedExit = await simulateSessionResolution(sessionToken);

    const expectedGlobalTenant = masterUser.tenantId || null;
    const test3Pass =
      sessionResolvedExit?.effectiveTenantId === expectedGlobalTenant &&
      sessionResolvedExit?.adminContext === null;

    results.push({
      code: 'PERSIST_3',
      name: 'Empresa B → PLATAFORMA (Exit) persiste retorno ao escopo global',
      expected: `effectiveTenantId: ${expectedGlobalTenant || 'null (global)'}, adminContext: null`,
      actual: `effectiveTenantId: ${sessionResolvedExit?.effectiveTenantId || 'null'}, adminContext: ${JSON.stringify(sessionResolvedExit?.adminContext)}`,
      status: test3Pass ? 'PASS' : 'FAIL',
      details: 'Valida que a saída do contexto limpa as colunas do PostgreSQL e impede re-ativação fantasma após reboot.',
    });

    // -------------------------------------------------------------------------
    // TESTE 4: Contexto Expirado após TTL Persistido
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 4: TTL EXPIRADO NO BANCO...');

    // 4.1 Setar contexto com data de expiração no passado no banco
    await prisma.session.update({
      where: { id: sessionRecord.id },
      data: {
        adminTargetTenantId: tenantA.id,
        adminTargetTenantName: tenantA.name,
        adminSwitchedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        adminContextExpiresAt: new Date(Date.now() - 1000), // Expirado há 1 segundo
      },
    });

    AdminContextManager.resetMemoryCacheForTesting();

    const sessionResolvedExpired = await simulateSessionResolution(sessionToken);

    const test4Pass =
      sessionResolvedExpired?.adminContext === null &&
      sessionResolvedExpired?.effectiveTenantId === (masterUser.tenantId || null);

    results.push({
      code: 'PERSIST_4',
      name: 'Contexto expirado por TTL é automaticamente descartado e limpo',
      expected: 'adminContext: null, retorno ao escopo de origem',
      actual: `adminContext: ${JSON.stringify(sessionResolvedExpired?.adminContext)}, effectiveTenantId: ${sessionResolvedExpired?.effectiveTenantId || 'null'}`,
      status: test4Pass ? 'PASS' : 'FAIL',
      details: 'Valida expiração de segurança temporal mesmo sem reinício de sessão.',
    });

    // -------------------------------------------------------------------------
    // TESTE 5: Invalidação Automática se Tenant for Soft-Deleted / Cancelado
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 5: SOFT DELETE DO TENANT ALVO...');

    // 5.1 Criar tenant temporário para deletar
    const tempTenant = await prisma.tenant.create({
      data: {
        name: 'Tenant Temporario Persistencia',
        slug: `temp-persist-${Date.now()}`,
        status: 'ACTIVE',
        cnpj: '11.222.333/0001-99',
      },
    });

    // 5.2 Alternar contexto para ele
    await AdminContextManager.setContext(
      sessionRecord.id,
      tempTenant.id,
      tempTenant.name,
      masterUser.id,
      prisma
    );

    // 5.3 Realizar Soft Delete do tenant e invocar limpeza
    await prisma.tenant.update({
      where: { id: tempTenant.id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
    await AdminContextManager.clearContextByTenantId(tempTenant.id, prisma);

    AdminContextManager.resetMemoryCacheForTesting();

    const sessionResolvedDeleted = await simulateSessionResolution(sessionToken);

    const test5Pass =
      sessionResolvedDeleted?.adminContext === null &&
      sessionResolvedDeleted?.effectiveTenantId === (masterUser.tenantId || null);

    results.push({
      code: 'PERSIST_5',
      name: 'Contexto invalidado e limpo do banco quando tenant sofre soft delete',
      expected: 'adminContext: null após exclusão do tenant',
      actual: `adminContext: ${JSON.stringify(sessionResolvedDeleted?.adminContext)}, effectiveTenantId: ${sessionResolvedDeleted?.effectiveTenantId || 'null'}`,
      status: test5Pass ? 'PASS' : 'FAIL',
      details: 'Garante que o PLATFORM_MASTER nunca permaneça contextualizado em um tenant excluído ou cancelado.',
    });

    // Limpar tenant temporário
    await prisma.tenant.delete({ where: { id: tempTenant.id } }).catch(() => {});

    // -------------------------------------------------------------------------
    // TESTE 6: Isolamento entre Múltiplos PLATFORM_MASTERs Concorrentes
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 6: ISOLAMENTO ENTRE MÚLTIPLAS SESSÕES CONCORRENTES...');

    // 6.1 Criar duas sessões distintas
    const token1 = `multi-master-1-${crypto.randomUUID()}`;
    const token2 = `multi-master-2-${crypto.randomUUID()}`;

    const session1 = await prisma.session.create({
      data: { userId: masterUser.id, token: token1, expiresAt: new Date(Date.now() + 3600000) },
    });
    const session2 = await prisma.session.create({
      data: { userId: masterUser.id, token: token2, expiresAt: new Date(Date.now() + 3600000) },
    });

    // 6.2 Sessão 1 alterna para Empresa A; Sessão 2 alterna para Empresa B
    await AdminContextManager.setContext(session1.id, tenantA.id, tenantA.name, masterUser.id, prisma);
    await AdminContextManager.setContext(session2.id, tenantB.id, tenantB.name, masterUser.id, prisma);

    // 6.3 Simular reinício completo
    AdminContextManager.resetMemoryCacheForTesting();

    // 6.4 Resolução concorrente
    const resolved1 = await simulateSessionResolution(token1);
    const resolved2 = await simulateSessionResolution(token2);

    const test6Pass =
      resolved1?.effectiveTenantId === tenantA.id &&
      resolved2?.effectiveTenantId === tenantB.id &&
      resolved1?.adminContext?.targetTenantId === tenantA.id &&
      resolved2?.adminContext?.targetTenantId === tenantB.id;

    results.push({
      code: 'PERSIST_6',
      name: 'Isolamento estrito entre múltiplas sessões persistentes no banco',
      expected: `Sessão 1 -> ${tenantA.id}, Sessão 2 -> ${tenantB.id}`,
      actual: `Sessão 1 -> ${resolved1?.effectiveTenantId}, Sessão 2 -> ${resolved2?.effectiveTenantId}`,
      status: test6Pass ? 'PASS' : 'FAIL',
      details: 'Garante que sessões simultâneas de PLATFORM_MASTER não sofram contaminação de contexto.',
    });

    // Limpeza de sessões de teste
    await prisma.session.deleteMany({
      where: { id: { in: [sessionRecord.id, session1.id, session2.id] } },
    });

    // -------------------------------------------------------------------------
    // TESTE 7: Limpeza Total em Logout
    // -------------------------------------------------------------------------
    console.log('>>> EXECUTANDO TESTE 7: LIMPEZA TOTAL EM LOGOUT...');

    const logoutToken = `logout-token-${crypto.randomUUID()}`;
    const logoutSession = await prisma.session.create({
      data: {
        userId: masterUser.id,
        token: logoutToken,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    await AdminContextManager.setContext(logoutSession.id, tenantA.id, tenantA.name, masterUser.id, prisma);
    
    // Simular logout: clear context and delete session
    await AdminContextManager.clearContext(logoutSession.id, prisma);
    await prisma.session.delete({ where: { id: logoutSession.id } });

    AdminContextManager.resetMemoryCacheForTesting();

    const resolvedAfterLogout = await simulateSessionResolution(logoutToken);

    const test7Pass = resolvedAfterLogout === null;

    results.push({
      code: 'PERSIST_7',
      name: 'Logout encerra sessão e destrói contexto administrativo no banco e cache',
      expected: 'Sessão destruída (null)',
      actual: resolvedAfterLogout === null ? 'Sessão destruída (null)' : 'Sessão ainda acessível',
      status: test7Pass ? 'PASS' : 'FAIL',
      details: 'Garante que o logout revoga irrevogavelmente tanto a sessão quanto qualquer contexto ativo.',
    });

  } catch (err: any) {
    console.error('Erro fatal durante execução da suíte de persistência:', err);
    results.push({
      code: 'PERSIST_FATAL',
      name: 'Execução da Suíte de Persistência',
      expected: 'Sem erros fatais',
      actual: err.message,
      status: 'FAIL',
    });
  } finally {
    await prisma.$disconnect();
  }

  // -------------------------------------------------------------------------
  // RELATÓRIO FINAL
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('RELATÓRIO FINAL — VALIDAÇÃO DE PERSISTÊNCIA DO CONTEXTO ADMINISTRATIVO');
  console.log('========================================================================\n');

  let passedCount = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅ [PASS]' : '❌ [FAIL]';
    if (r.status === 'PASS') passedCount++;
    console.log(`${icon} ${r.code}: ${r.name}`);
    console.log(`    Esperado: ${r.expected}`);
    console.log(`    Obtido:   ${r.actual}`);
    if (r.details) console.log(`    Detalhe:  ${r.details}`);
    console.log('------------------------------------------------------------------------');
  }

  console.log(`\nRESUMO: ${passedCount}/${results.length} testes aprovados.`);
  if (passedCount === results.length) {
    console.log('STATUS: TODOS OS CRITÉRIOS DE PERSISTÊNCIA FORAM ATENDIDOS COM SUCESSO!\n');
  } else {
    console.error('STATUS: FALHA NA VALIDAÇÃO DE PERSISTÊNCIA!\n');
    process.exit(1);
  }
}

runPersistenceSuite();
