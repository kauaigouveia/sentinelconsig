import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectInconsistentData() {
  console.log('===============================================================');
  console.log('INVESTIGAÇÃO DETALHADA DOS 7 TENANTS, 24 USUÁRIOS E 1 SUSPENDED');
  console.log('===============================================================\n');

  const target7Ids = [
    'cmu4ru1ly0000s6fjla9a2rkx',
    'cmu4ru2qj0002s6fj1k7mmykb',
    'cmu4ru30q0003s6fj7hlzwysd',
    'cmu4ru35v0004s6fjbcat1yc2',
    'cmu4rt83f0003s60ubmwustb9',
    'cmu4rtm620003s67obyotoag6',
    'cmu5l41ti0004s6vq4ovqdftx',
  ];

  console.log('--- 1. DETALHES DOS 7 TENANTS (status=CANCELLED, deletedAt=null) ---');
  for (const id of target7Ids) {
    const t = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            proposals: true,
            clients: true,
            domains: true,
            partners: true,
            simulationRequests: true,
            auditLogs: true,
          },
        },
        domains: true,
        users: { select: { id: true, name: true, email: true, role: true, active: true, deletedAt: true } },
      },
    });

    if (!t) {
      console.log(`Tenant ${id}: NÃO ENCONTRADO`);
      continue;
    }

    const sessionsCount = await prisma.session.count({
      where: { user: { tenantId: id } },
    });

    const lastLogs = await prisma.auditLog.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { action: true, entity: true, createdAt: true, userName: true },
    });

    console.log(`\nTenant: ${t.name} (ID: ${t.id}, Slug: ${t.slug})`);
    console.log(` - Status: ${t.status} | deletedAt: ${t.deletedAt} | deletedBy: ${t.deletedBy}`);
    console.log(` - Criado em: ${t.createdAt.toISOString()} | Atualizado em: ${t.updatedAt.toISOString()}`);
    console.log(` - Contagens: Users=${t._count.users}, Proposals=${t._count.proposals}, Clients=${t._count.clients}, Sessions=${sessionsCount}, Domains=${t._count.domains}, Partners=${t._count.partners}, Simulations=${t._count.simulationRequests}, AuditLogs=${t._count.auditLogs}`);
    console.log(` - Usuários (${t.users.length}):`, t.users.map(u => `${u.email} (role=${u.role}, active=${u.active}, deletedAt=${u.deletedAt})`));
    console.log(` - Últimos Logs:`, lastLogs);
  }

  console.log('\n--- 2. DETALHES DO TENANT SUSPENDED (cmu5l41eh0003s6vq1wvx4a3q) ---');
  const suspId = 'cmu5l41eh0003s6vq1wvx4a3q';
  const suspTenant = await prisma.tenant.findUnique({
    where: { id: suspId },
    include: {
      _count: {
        select: {
          users: true,
          proposals: true,
          clients: true,
          domains: true,
          partners: true,
          simulationRequests: true,
          auditLogs: true,
        },
      },
      users: { select: { id: true, name: true, email: true, role: true, active: true, deletedAt: true } },
    },
  });

  if (suspTenant) {
    const lastSuspLogs = await prisma.auditLog.findMany({
      where: { tenantId: suspId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { action: true, entity: true, createdAt: true, userName: true, newData: true },
    });

    console.log(`Tenant Suspended: ${suspTenant.name} (ID: ${suspTenant.id}, Slug: ${suspTenant.slug})`);
    console.log(` - Status: ${suspTenant.status} | deletedAt: ${suspTenant.deletedAt?.toISOString()} | deletedBy: ${suspTenant.deletedBy}`);
    console.log(` - Criado em: ${suspTenant.createdAt.toISOString()} | Atualizado em: ${suspTenant.updatedAt.toISOString()}`);
    console.log(` - Contagens: Users=${suspTenant._count.users}, Proposals=${suspTenant._count.proposals}, Clients=${suspTenant._count.clients}`);
    console.log(` - Usuários (${suspTenant.users.length}):`, suspTenant.users);
    console.log(` - Últimos Logs:`, lastSuspLogs);
  } else {
    console.log(`Tenant ${suspId}: NÃO ENCONTRADO`);
  }

  await prisma.$disconnect();
}

inspectInconsistentData().catch((err) => {
  console.error('Erro na inspeção:', err);
  process.exit(1);
});
