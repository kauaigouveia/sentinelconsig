import { PrismaClient, UserRole, TenantStatus } from '@prisma/client';

const prisma = new PrismaClient();

const ROOT_TENANT_ID = 'cmu0951dy0000s6zs0etffry0';
const ROOT_TENANT_SLUG = 'sentinel-consig';
const PLATFORM_MASTER_EMAIL = 'kauaigouveia@gmail.com';

async function cleanupAndAudit() {
  console.log('========================================================================');
  console.log('SENTINEL CONSIG — LIMPEZA FINAL DOS DADOS DE TESTE DO WHITE-LABEL');
  console.log('========================================================================\n');

  // 1. AUDITORIA INICIAL
  console.log('--- 1. CONTAGEM INICIAL POR TABELA ---');
  const initialCounts = {
    tenantsTotal: await prisma.tenant.count(),
    tenantsActive: await prisma.tenant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    users: await prisma.user.count(),
    sessions: await prisma.session.count(),
    tenantDomains: await prisma.tenantDomain.count(),
    whiteLabelConfigs: await prisma.whiteLabelConfig.count(),
    clients: await prisma.client.count(),
    proposals: await prisma.proposal.count(),
    ades: await prisma.aDE.count(),
    partners: await prisma.partner.count(),
    promoters: await prisma.promoter.count(),
    banks: await prisma.bank.count(),
    products: await prisma.product.count(),
    proposalStatuses: await prisma.proposalStatus.count(),
    notifications: await prisma.notification.count(),
    tasks: await prisma.task.count(),
    comments: await prisma.comment.count(),
    statusHistories: await prisma.statusHistory.count(),
    importJobs: await prisma.importJob.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.dir(initialCounts, { depth: null });

  console.log('\n--- 2. IDENTIFICAÇÃO DOS REGISTROS EXISTENTES ---');
  const initialTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, tradeName: true, slug: true, status: true, deletedAt: true },
  });
  console.log('Tenants encontrados:', initialTenants);

  const initialUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, tenantId: true },
  });
  console.log('Usuários encontrados:', initialUsers);

  const testTenants = initialTenants.filter(
    (t) => t.id !== ROOT_TENANT_ID && t.slug !== ROOT_TENANT_SLUG
  );
  const testUsers = initialUsers.filter(
    (u) => u.role !== UserRole.PLATFORM_MASTER && u.email !== PLATFORM_MASTER_EMAIL
  );

  console.log('\nTenants de teste a inativar/remover:', testTenants.map((t) => `${t.name} (${t.slug})`));
  console.log('Usuários de teste a remover:', testUsers.map((u) => `${u.name} (${u.email})`));

  // 3. EXECUÇÃO DA LIMPEZA
  console.log('\n--- 3. EXECUTANDO PURGA DE DADOS DE TESTE ---');

  const testTenantIds = testTenants.map((t) => t.id);

  // Sessions
  const deletedSessions = await prisma.session.deleteMany({
    where: {
      OR: [
        { user: { tenantId: { in: testTenantIds } } },
        { user: { role: { not: UserRole.PLATFORM_MASTER } } },
        { user: { email: { not: PLATFORM_MASTER_EMAIL } } },
      ],
    },
  });
  console.log(`- Sessões de teste removidas: ${deletedSessions.count}`);

  // ImportJobs
  const deletedImportJobs = await prisma.importJob.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- ImportJobs de teste removidos: ${deletedImportJobs.count}`);

  // StatusHistories
  const deletedStatusHistories = await prisma.statusHistory.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- StatusHistories de teste removidos: ${deletedStatusHistories.count}`);

  // Comments
  const deletedComments = await prisma.comment.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Comments de teste removidos: ${deletedComments.count}`);

  // Tasks
  const deletedTasks = await prisma.task.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Tasks de teste removidos: ${deletedTasks.count}`);

  // Notifications
  const deletedNotifications = await prisma.notification.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Notifications de teste removidas: ${deletedNotifications.count}`);

  // ADEs
  const deletedADEs = await prisma.aDE.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- ADEs de teste removidos: ${deletedADEs.count}`);

  // Proposals
  const deletedProposals = await prisma.proposal.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Propostas de teste removidas: ${deletedProposals.count}`);

  // Clients
  const deletedClients = await prisma.client.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Clientes de teste removidos: ${deletedClients.count}`);

  // Products
  const deletedProducts = await prisma.product.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Produtos de teste removidos: ${deletedProducts.count}`);

  // Banks / BankPromoters
  const deletedBanks = await prisma.bank.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Bancos de teste removidos: ${deletedBanks.count}`);

  // Promoters
  const deletedPromoters = await prisma.promoter.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Promotoras de teste removidas: ${deletedPromoters.count}`);

  // Partners
  const deletedPartners = await prisma.partner.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- Parceiros de teste removidos: ${deletedPartners.count}`);

  // ProposalStatuses
  const deletedProposalStatuses = await prisma.proposalStatus.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- ProposalStatuses de teste removidos: ${deletedProposalStatuses.count}`);

  // TenantDomains
  const deletedTenantDomains = await prisma.tenantDomain.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- TenantDomains de teste removidos: ${deletedTenantDomains.count}`);

  // WhiteLabelConfigs
  const deletedWhiteLabelConfigs = await prisma.whiteLabelConfig.deleteMany({
    where: {
      OR: [
        { tenantId: { in: testTenantIds } },
        { tenantId: { not: ROOT_TENANT_ID } },
      ],
    },
  });
  console.log(`- WhiteLabelConfigs de teste removidos: ${deletedWhiteLabelConfigs.count}`);

  // Deleta usuários de teste
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      OR: [
        { id: { in: testUsers.map((u) => u.id) } },
        {
          AND: [
            { role: { not: UserRole.PLATFORM_MASTER } },
            { email: { not: PLATFORM_MASTER_EMAIL } },
          ],
        },
      ],
    },
  });
  console.log(`- Usuários de teste removidos: ${deletedUsers.count}`);

  // Marca tenants de teste como CANCELLED e soft-deleted (preservando integridade do AuditLog imutável)
  for (const t of testTenants) {
    try {
      await prisma.tenant.delete({ where: { id: t.id } });
      console.log(`- Tenant de teste ${t.slug} totalmente deletado do banco.`);
    } catch {
      await prisma.tenant.update({
        where: { id: t.id },
        data: {
          status: TenantStatus.CANCELLED,
          deletedAt: new Date(),
          deletedBy: 'SYSTEM_PURGE',
        },
      });
      console.log(`- Tenant de teste ${t.slug} inativado/soft-deleted (preservado por conta de restrição de integridade em AuditLog imutável).`);
    }
  }

  // 4. AUDITORIA FINAL
  console.log('\n--- 4. CONTAGEM FINAL APÓS LIMPEZA ---');
  const finalCounts = {
    tenantsActive: await prisma.tenant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    tenantsTotal: await prisma.tenant.count(),
    users: await prisma.user.count(),
    sessions: await prisma.session.count(),
    tenantDomains: await prisma.tenantDomain.count(),
    whiteLabelConfigs: await prisma.whiteLabelConfig.count(),
    clients: await prisma.client.count(),
    proposals: await prisma.proposal.count(),
    ades: await prisma.aDE.count(),
    partners: await prisma.partner.count(),
    promoters: await prisma.promoter.count(),
    banks: await prisma.bank.count(),
    products: await prisma.product.count(),
    proposalStatuses: await prisma.proposalStatus.count(),
    notifications: await prisma.notification.count(),
    tasks: await prisma.task.count(),
    comments: await prisma.comment.count(),
    statusHistories: await prisma.statusHistory.count(),
    importJobs: await prisma.importJob.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.dir(finalCounts, { depth: null });

  console.log('\n--- 5. CONFIRMAÇÃO DA PRESERVAÇÃO DE DADOS ---');
  const activeTenants = await prisma.tenant.findMany({ where: { status: 'ACTIVE', deletedAt: null } });
  console.log('Tenants Ativos na plataforma:', activeTenants.map((t) => `${t.name} (ID: ${t.id}, Slug: ${t.slug})`));

  const remainingUsers = await prisma.user.findMany();
  console.log('Usuários Ativos na plataforma:', remainingUsers.map((u) => `${u.name} (Email: ${u.email}, Role: ${u.role})`));

  console.log(`Total AuditLog mantidos intactos (sem modificação/exclusão): ${finalCounts.auditLogs}`);

  console.log('\n========================================================================');
  console.log('LIMPEZA FINAL CONCLUÍDA COM SUCESSO!');
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

cleanupAndAudit().catch(async (err) => {
  console.error('Erro durante a limpeza do banco:', err);
  await prisma.$disconnect();
  process.exit(1);
});
