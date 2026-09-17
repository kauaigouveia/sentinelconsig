import { PrismaClient } from '@prisma/client';
import { AuditLogService } from '../server/services/auditLogService.js';
import { AdminContextManager } from '../server/utils/adminContext.js';
import { TenantResolver } from '../server/utils/tenantResolver.js';

const prisma = new PrismaClient();

async function diagnose() {
  console.log('====================================================');
  console.log('DIAGNÓSTICO DA EXCLUSÃO EM MASSA DE TENANTS (39 IDs)');
  console.log('====================================================\n');

  // 1. Fetch tenants exactly as UI does
  const rootSlugs = ['sentinel-consig', 'evolve'];
  const rootIds = ['tenant_evolve', 'sentinel-consig'];

  const allTenants = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      status: { not: 'CANCELLED' },
    },
    include: {
      _count: {
        select: {
          users: true,
          proposals: true,
          clients: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const selectableTenants = allTenants.filter(
    (t) => !rootSlugs.includes(t.slug) && !rootIds.includes(t.id)
  );

  console.log(`Total de tenants ativos/não cancelados no DB: ${allTenants.length}`);
  console.log(`Total de tenants selecionáveis (não root): ${selectableTenants.length}`);

  const tenantIds = selectableTenants.map((t) => t.id);
  console.log('IDs selecionados para o lote:', tenantIds);

  const actor = await prisma.user.findFirst({
    where: { role: 'PLATFORM_MASTER' },
  });

  if (!actor) {
    console.error('PLATFORM_MASTER não encontrado!');
    return;
  }

  console.log(`\nActor PLATFORM_MASTER: ${actor.email} (${actor.id})`);

  // Step-by-step instrumented test inside a ROLLBACK transaction
  console.log('\n--- INICIANDO SIMULAÇÃO INSTRUMENTADA (COM ROLLBACK) ---');

  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const actorId = actor.id;
      const targetIds = tenantIds;

      console.log(`[STEP 10] Atualizando ${targetIds.length} tenants para CANCELLED...`);
      const tenantRes = await tx.tenant.updateMany({
        where: { id: { in: targetIds } },
        data: {
          status: 'CANCELLED',
          deletedAt: now,
          deletedBy: actorId,
        },
      });
      console.log(`[STEP 10 SUCCESS] Tenants atualizados: ${tenantRes.count}`);

      console.log(`[STEP 11] Atualizando usuários dos tenants...`);
      const userRes = await tx.user.updateMany({
        where: { tenantId: { in: targetIds }, deletedAt: null },
        data: {
          deletedAt: now,
          deletedBy: actorId,
          active: false,
        },
      });
      console.log(`[STEP 11 SUCCESS] Usuários atualizados: ${userRes.count}`);

      console.log(`[STEP 12] Invalidando sessões dos usuários dos tenants...`);
      const sessionRes = await tx.session.deleteMany({
        where: { user: { tenantId: { in: targetIds } } },
      });
      console.log(`[STEP 12 SUCCESS] Sessões deletadas: ${sessionRes.count}`);

      console.log(`[STEP 13] Limpando contexto administrativo ativo de sessões...`);
      const adminCtxRes = await tx.session.updateMany({
        where: { adminTargetTenantId: { in: targetIds } },
        data: {
          adminTargetTenantId: null,
          adminTargetTenantName: null,
          adminSwitchedAt: null,
          adminContextExpiresAt: null,
        },
      });
      console.log(`[STEP 13 SUCCESS] Contextos limpos: ${adminCtxRes.count}`);

      // Simular se tem algum domínio vinculado
      console.log(`[STEP 14] Verificando domínios dos tenants...`);
      const domains = await tx.tenantDomain.findMany({
        where: { tenantId: { in: targetIds } },
      });
      console.log(`[STEP 14 SUCCESS] Domínios encontrados: ${domains.length}`);

      // Simular rollback intencional para não alterar o banco
      throw new Error('__INTENTIONAL_DRY_RUN_ROLLBACK__');
    });
  } catch (err: any) {
    if (err.message === '__INTENTIONAL_DRY_RUN_ROLLBACK__') {
      console.log('\n✅ Transação de banco executou com 100% de sucesso (Rollback intencional aplicado).');
    } else {
      console.error('\n❌ ERRO NA TRANSAÇÃO PRISMA:');
      console.error('Nome:', err.name);
      console.error('Mensagem:', err.message);
      console.error('Código Prisma:', err.code);
      console.error('Meta:', err.meta);
      console.error('Stack:', err.stack);
    }
  }

  // Agora vamos testar os passos pós-transação (AuditLog e EventBus e AdminContextManager)
  console.log('\n--- TESTANDO PASSOS PÓS-TRANSAÇÃO (AuditLog e Caches) ---');
  for (let i = 0; i < selectableTenants.length; i++) {
    const t = selectableTenants[i];
    console.log(`[POST-TX ${i + 1}/${selectableTenants.length}] Testando AuditLog para tenant ${t.id} (${t.name})...`);
    try {
      // AuditLog individual
      await AuditLogService.record(prisma, {
        tenantId: t.id,
        userId: actor.id,
        userName: actor.name,
        action: 'tenant.bulk_deleted_test_dryrun',
        entity: 'Tenant',
        entityId: t.id,
        newData: {
          operation: 'DRY_RUN_TEST',
          tenantName: t.name,
          tenantSlug: t.slug,
        },
      });
      console.log(`[POST-TX ${i + 1} SUCCESS] AuditLog gravado.`);
    } catch (err: any) {
      console.error(`❌ [POST-TX ${i + 1} ERROR] Falha no AuditLog do tenant ${t.id}:`);
      console.error('Nome:', err.name);
      console.error('Mensagem:', err.message);
      console.error('Código:', err.code);
      console.error('Meta:', err.meta);
      break;
    }
  }

  await prisma.$disconnect();
}

diagnose().catch(console.error);
