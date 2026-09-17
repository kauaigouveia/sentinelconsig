import { PrismaClient } from '@prisma/client';
import { AuditLogService } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

interface NormalizationPlan {
  tenantsToSoftDelete: Array<{ id: string; name: string; slug: string; currentStatus: string; currentDeletedAt: Date | null }>;
  suspendedTenantsToFix: Array<{ id: string; name: string; slug: string; currentStatus: string; currentDeletedAt: Date | null }>;
  usersToSoftDelete: Array<{ id: string; email: string; tenantId: string | null; currentActive: boolean; currentDeletedAt: Date | null }>;
  sessionsToRevoke: Array<{ id: string; userId: string }>;
  domainsToDisable: Array<{ id: string; domain: string; tenantId: string; currentStatus: string }>;
}

async function analyzeNormalizationPlan(): Promise<NormalizationPlan> {
  // 1. Tenants CANCELLED com deletedAt NULL
  const tenantsToSoftDelete = await prisma.tenant.findMany({
    where: {
      status: 'CANCELLED',
      deletedAt: null,
    },
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  // 2. Tenants SUSPENDED com deletedAt NOT NULL
  const suspendedTenantsToFix = await prisma.tenant.findMany({
    where: {
      status: 'SUSPENDED',
      deletedAt: { not: null },
    },
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  // 3. Usuários de tenants CANCELLED (ou que serão CANCELLED) com active=true ou deletedAt=null
  const cancelledTenants = await prisma.tenant.findMany({
    where: { status: 'CANCELLED' },
    select: { id: true },
  });
  const allCancelledTenantIds = Array.from(
    new Set([...cancelledTenants.map((t) => t.id), ...tenantsToSoftDelete.map((t) => t.id)])
  );

  const usersToSoftDelete = await prisma.user.findMany({
    where: {
      tenantId: { in: allCancelledTenantIds },
      OR: [{ active: true }, { deletedAt: null }],
    },
    select: { id: true, email: true, tenantId: true, active: true, deletedAt: true },
  });

  // 4. Sessões de usuários desses tenants
  const targetUserIds = usersToSoftDelete.map((u) => u.id);
  const sessionsToRevoke = await prisma.session.findMany({
    where: {
      OR: [
        { userId: { in: targetUserIds } },
        { user: { tenantId: { in: allCancelledTenantIds } } },
      ],
    },
    select: { id: true, userId: true },
  });

  // 5. Domínios de tenants CANCELLED que ainda estão ativos
  const domainsToDisable = await prisma.tenantDomain.findMany({
    where: {
      tenantId: { in: allCancelledTenantIds },
      status: { not: 'DISABLED' },
    },
    select: { id: true, domain: true, tenantId: true, status: true },
  });

  return {
    tenantsToSoftDelete: tenantsToSoftDelete.map(t => ({ id: t.id, name: t.name, slug: t.slug, currentStatus: t.status, currentDeletedAt: t.deletedAt })),
    suspendedTenantsToFix: suspendedTenantsToFix.map(t => ({ id: t.id, name: t.name, slug: t.slug, currentStatus: t.status, currentDeletedAt: t.deletedAt })),
    usersToSoftDelete: usersToSoftDelete.map(u => ({ id: u.id, email: u.email, tenantId: u.tenantId, currentActive: u.active, currentDeletedAt: u.deletedAt })),
    sessionsToRevoke,
    domainsToDisable: domainsToDisable.map((d) => ({ id: d.id, domain: d.domain, tenantId: d.tenantId, currentStatus: d.status })),
  };
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('========================================================================');
  console.log(`SCRIPT DE NORMALIZAÇÃO DE ESTADO DE TENANTS (${isDryRun ? 'DRY-RUN' : 'EXECUÇÃO PERSISTENTE'})`);
  console.log('========================================================================\n');

  const plan = await analyzeNormalizationPlan();

  console.log('### TENANTS:');
  console.log('ID | Estado atual | Estado esperado | Mudança');
  console.log('---|---|---|---');
  for (const t of plan.tenantsToSoftDelete) {
    console.log(`${t.id} | status=CANCELLED, deletedAt=NULL | status=CANCELLED, deletedAt=NOW | Set deletedAt timestamp`);
  }
  for (const t of plan.suspendedTenantsToFix) {
    console.log(`${t.id} | status=SUSPENDED, deletedAt=${t.currentDeletedAt?.toISOString()} | status=SUSPENDED, deletedAt=NULL | Reset deletedAt to NULL`);
  }
  if (plan.tenantsToSoftDelete.length === 0 && plan.suspendedTenantsToFix.length === 0) {
    console.log('(Nenhum tenant inconsistente encontrado)');
  }

  console.log('\n### USERS:');
  console.log('ID | Email | Estado atual | Estado esperado | Mudança');
  console.log('---|---|---|---|---');
  for (const u of plan.usersToSoftDelete) {
    console.log(`${u.id} | ${u.email} | active=${u.currentActive}, deletedAt=${u.currentDeletedAt} | active=false, deletedAt=NOW | Soft delete user & deactivate`);
  }
  if (plan.usersToSoftDelete.length === 0) {
    console.log('(Nenhum usuário inconsistente encontrado)');
  }

  console.log('\n### OTHER:');
  console.log(`- Sessões a serem revogadas: ${plan.sessionsToRevoke.length}`);
  console.log(`- Domínios a serem desabilitados (DISABLED): ${plan.domainsToDisable.length}`);

  if (isDryRun) {
    console.log('\n========================================================================');
    console.log('MODO DRY-RUN CONCLUÍDO. NENHUMA ALTERAÇÃO PERSISTIDA NO BANCO DE DADOS.');
    console.log('========================================================================');
    await prisma.$disconnect();
    return;
  }

  console.log('\nIniciando normalização em transação atômica no PostgreSQL...');
  const now = new Date();
  const normalizerActor = 'system-normalizer';

  await prisma.$transaction(async (tx) => {
    // 1. Normalizar tenants CANCELLED (definir deletedAt)
    if (plan.tenantsToSoftDelete.length > 0) {
      const ids = plan.tenantsToSoftDelete.map((t) => t.id);
      await tx.tenant.updateMany({
        where: { id: { in: ids } },
        data: {
          deletedAt: now,
          deletedBy: normalizerActor,
          status: 'CANCELLED',
        },
      });

      for (const t of plan.tenantsToSoftDelete) {
        await AuditLogService.record(tx as any, {
          tx: tx as any,
          tenantId: t.id,
          userName: 'System Normalizer',
          action: 'TENANT_STATE_NORMALIZED',
          entity: 'Tenant',
          entityId: t.id,
          oldData: { status: t.currentStatus, deletedAt: null },
          newData: { status: 'CANCELLED', deletedAt: now, reason: 'Normalização canônica de soft delete' },
        });
      }
    }

    // 2. Normalizar tenant SUSPENDED (resetar deletedAt para null)
    if (plan.suspendedTenantsToFix.length > 0) {
      const ids = plan.suspendedTenantsToFix.map((t) => t.id);
      await tx.tenant.updateMany({
        where: { id: { in: ids } },
        data: {
          deletedAt: null,
          deletedBy: null,
          status: 'SUSPENDED',
        },
      });

      for (const t of plan.suspendedTenantsToFix) {
        await AuditLogService.record(tx as any, {
          tx: tx as any,
          tenantId: t.id,
          userName: 'System Normalizer',
          action: 'TENANT_STATE_NORMALIZED',
          entity: 'Tenant',
          entityId: t.id,
          oldData: { status: t.currentStatus, deletedAt: t.currentDeletedAt },
          newData: { status: 'SUSPENDED', deletedAt: null, reason: 'Normalização canônica de tenant suspenso' },
        });
      }
    }

    // 3. Normalizar usuários de tenants CANCELLED
    if (plan.usersToSoftDelete.length > 0) {
      const uids = plan.usersToSoftDelete.map((u) => u.id);
      await tx.user.updateMany({
        where: { id: { in: uids } },
        data: {
          active: false,
          deletedAt: now,
          deletedBy: normalizerActor,
        },
      });
    }

    // 4. Revogar sessões vinculadas
    if (plan.sessionsToRevoke.length > 0) {
      const sids = plan.sessionsToRevoke.map((s) => s.id);
      await tx.session.deleteMany({
        where: { id: { in: sids } },
      });
    }

    // 5. Desabilitar domínios
    if (plan.domainsToDisable.length > 0) {
      const dids = plan.domainsToDisable.map((d) => d.id);
      await tx.tenantDomain.updateMany({
        where: { id: { in: dids } },
        data: { status: 'DISABLED' },
      });
    }
  }, { timeout: 30000 });

  console.log('✅ Normalização transacional concluída com sucesso!');
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('Erro na normalização:', err);
  process.exit(1);
});
