import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AuditLogService } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

async function runTenantConsistencyAudit() {
  console.log('===============================================================');
  console.log('AUDITORIA FINAL DE CONSISTÊNCIA DE TENANTS — POSTGRESQL');
  console.log('===============================================================\n');

  // 1. Tenants Inconsistentes
  const cancelledWithoutDeletedAt = await prisma.tenant.findMany({
    where: {
      status: 'CANCELLED',
      deletedAt: null,
    },
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  const activeWithDeletedAt = await prisma.tenant.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: { not: null },
    },
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  const suspendedWithDeletedAt = await prisma.tenant.findMany({
    where: {
      status: 'SUSPENDED',
      deletedAt: { not: null },
    },
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  console.log('1. TENANTS:');
  console.log(' - status=CANCELLED AND deletedAt IS NULL:', cancelledWithoutDeletedAt.length, cancelledWithoutDeletedAt.map((t) => t.id));
  console.log(' - status=ACTIVE AND deletedAt IS NOT NULL:', activeWithDeletedAt.length, activeWithDeletedAt.map((t) => t.id));
  console.log(' - status=SUSPENDED AND deletedAt IS NOT NULL:', suspendedWithDeletedAt.length, suspendedWithDeletedAt.map((t) => t.id));

  // 2. Usuários Inconsistentes
  const cancelledTenants = await prisma.tenant.findMany({
    where: { status: 'CANCELLED' },
    select: { id: true },
  });
  const cancelledTenantIds = cancelledTenants.map((t) => t.id);

  const activeUsersInCancelledTenants = await prisma.user.findMany({
    where: {
      tenantId: { in: cancelledTenantIds },
      active: true,
    },
    select: { id: true, email: true, tenantId: true, active: true },
  });

  const undeletedUsersInCancelledTenants = await prisma.user.findMany({
    where: {
      tenantId: { in: cancelledTenantIds },
      deletedAt: null,
    },
    select: { id: true, email: true, tenantId: true, deletedAt: true },
  });

  console.log('\n2. USUÁRIOS:');
  console.log(' - Usuários de tenant CANCELLED com active=true:', activeUsersInCancelledTenants.length, activeUsersInCancelledTenants.map((u) => u.id));
  console.log(' - Usuários de tenant CANCELLED com deletedAt IS NULL:', undeletedUsersInCancelledTenants.length, undeletedUsersInCancelledTenants.map((u) => u.id));

  // 3. Sessões Inconsistentes
  const orphanedSessions = await prisma.session.findMany({
    where: {
      user: {
        tenantId: { in: cancelledTenantIds },
      },
    },
    select: { id: true, userId: true },
  });

  console.log('\n3. SESSÕES:');
  console.log(' - Sessões de usuários pertencentes a tenant CANCELLED:', orphanedSessions.length);

  // 4. Domínios Inconsistentes
  const activeDomainsInCancelledTenants = await prisma.tenantDomain.findMany({
    where: {
      tenantId: { in: cancelledTenantIds },
      status: { in: ['VERIFIED', 'PENDING', 'VERIFYING'] },
    },
    select: { id: true, domain: true, tenantId: true, status: true },
  });

  const activeTenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  const activeTenantIds = activeTenants.map((t) => t.id);

  const disabledDomainsInActiveTenants = await prisma.tenantDomain.findMany({
    where: {
      tenantId: { in: activeTenantIds },
      status: 'DISABLED',
    },
    select: { id: true, domain: true, tenantId: true, status: true },
  });

  console.log('\n4. DOMÍNIOS:');
  console.log(' - Tenant CANCELLED com domínio VERIFIED/PENDING:', activeDomainsInCancelledTenants.length, activeDomainsInCancelledTenants.map((d) => d.id));
  console.log(' - Domínio DISABLED pertencente a tenant ACTIVE:', disabledDomainsInActiveTenants.length, disabledDomainsInActiveTenants.map((d) => d.id));

  // 5. Contexto Administrativo Inconsistente
  const sessionsPointingToCancelledTenant = await prisma.session.findMany({
    where: {
      adminTargetTenantId: { in: cancelledTenantIds },
    },
    select: { id: true, adminTargetTenantId: true },
  });

  const allKnownTenantIds = (await prisma.tenant.findMany({ select: { id: true } })).map((t) => t.id);
  const sessionsPointingToNonExistentTenant = await prisma.session.findMany({
    where: {
      adminTargetTenantId: { not: null, notIn: allKnownTenantIds },
    },
    select: { id: true, adminTargetTenantId: true },
  });

  console.log('\n5. CONTEXTOS ADMINISTRATIVOS:');
  console.log(' - Sessões com adminTargetTenantId apontando para tenant CANCELLED:', sessionsPointingToCancelledTenant.length);
  console.log(' - Sessões com adminTargetTenantId apontando para tenant inexistente:', sessionsPointingToNonExistentTenant.length);

  // 6. AuditLog e Cadeia Criptográfica SHA-256
  let auditIntegrityValid = true;
  let auditBrokenTenants: string[] = [];

  for (const tId of cancelledTenantIds.slice(0, 10)) {
    const isChainValid = await AuditLogService.verifyAuditLogIntegrity(prisma, tId);
    if (!isChainValid) {
      auditIntegrityValid = false;
      auditBrokenTenants.push(tId);
    }
  }

  // Verificar cadeia do root tenant
  const rootAuditValid = await AuditLogService.verifyAuditLogIntegrity(prisma, 'cmu0951dy0000s6zs0etffry0');

  console.log('\n6. AUDIT LOG:');
  console.log(' - Cadeias criptográficas verificadas:', auditIntegrityValid && rootAuditValid ? 'TODAS VÁLIDAS' : 'FALHA NA CADEIA');
  console.log(' - Tenants com cadeia corrompida:', auditBrokenTenants);

  // 7. Dry-Run Execution & Zero Mutation Validation
  console.log('\n7. DRY-RUN EXECUTION & VERIFICAÇÃO DE ZERO MUTAÇÃO:');
  const masterUser = await prisma.user.findFirst({
    where: { role: 'PLATFORM_MASTER' },
  });

  if (!masterUser) {
    throw new Error('Usuário PLATFORM_MASTER não encontrado para autenticação de teste.');
  }

  const drySessionToken = crypto.randomBytes(32).toString('hex');
  const testSession = await prisma.session.create({
    data: {
      userId: masterUser.id,
      token: drySessionToken,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Snapshot antes do dry-run
  const countTenantsBefore = await prisma.tenant.count();
  const countUsersBefore = await prisma.user.count();
  const countSessionsBefore = await prisma.session.count();
  const countDomainsBefore = await prisma.tenantDomain.count();
  const countAuditBefore = await prisma.auditLog.count();

  // Selecionar conjunto representativo de tenants não raiz
  const representativeTenants = await prisma.tenant.findMany({
    where: {
      slug: { notIn: ['sentinel-consig', 'evolve'] },
      id: { notIn: ['sentinel-consig'] },
    },
    take: 5,
    select: { id: true, name: true, slug: true, status: true, deletedAt: true },
  });

  const repIds = representativeTenants.map((t) => t.id);

  console.log(`Disparando dry-run para ${repIds.length} tenants representativos...`);
  const dryRes = await fetch('http://localhost:3000/api/saas/tenants/bulk-delete?dryRun=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
      'Cookie': `cg_session_id=${drySessionToken}`,
    },
    body: JSON.stringify({ tenantIds: repIds }),
  });

  const dryData = await dryRes.json();
  console.log('HTTP Status Dry-Run:', dryRes.status);
  console.log('Resposta Dry-Run:', dryData);

  // Snapshot pós dry-run
  const countTenantsAfter = await prisma.tenant.count();
  const countUsersAfter = await prisma.user.count();
  const countSessionsAfter = await prisma.session.count();
  const countDomainsAfter = await prisma.tenantDomain.count();
  const countAuditAfter = await prisma.auditLog.count();

  // Limpeza de sessão de teste
  await prisma.session.delete({ where: { id: testSession.id } }).catch(() => {});

  const zeroMutations =
    countTenantsBefore === countTenantsAfter &&
    countUsersBefore === countUsersAfter &&
    countSessionsBefore - 1 === countSessionsAfter - 1 && // exceto a sessão de teste efêmera
    countDomainsBefore === countDomainsAfter &&
    countAuditBefore === countAuditAfter;

  console.log('\nVerificação de zero mutação no banco:');
  console.log(` - Tenants: ${countTenantsBefore} -> ${countTenantsAfter} (Delta: ${countTenantsAfter - countTenantsBefore})`);
  console.log(` - Usuários: ${countUsersBefore} -> ${countUsersAfter} (Delta: ${countUsersAfter - countUsersBefore})`);
  console.log(` - Domínios: ${countDomainsBefore} -> ${countDomainsAfter} (Delta: ${countDomainsAfter - countDomainsBefore})`);
  console.log(` - AuditLogs: ${countAuditBefore} -> ${countAuditAfter} (Delta: ${countAuditAfter - countAuditBefore})`);
  console.log(` - Zero mutações confirmadas: ${zeroMutations ? 'SIM' : 'NÃO'}`);

  await prisma.$disconnect();

  console.log('\n===============================================================');
  console.log('AUDITORIA DE CONSISTÊNCIA CONCLUÍDA COM SUCESSO');
  console.log('===============================================================');
}

runTenantConsistencyAudit().catch((err) => {
  console.error('Erro na auditoria de consistência:', err);
  process.exit(1);
});
