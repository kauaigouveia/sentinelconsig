
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  try {
    console.log('--- USERS MASTER ---');
    const masters = await prisma.user.findMany({
      where: { role: 'PLATFORM_MASTER' },
      select: { id: true, name: true, email: true, role: true, tenantId: true }
    });
    console.log(JSON.stringify(masters, null, 2));

    console.log('\n--- SYSTEM STATS ---');
    const tenantCount = await prisma.tenant.count();
    const userCount = await prisma.user.count();
    const configCount = await prisma.whiteLabelConfig.count();
    console.log({ tenantCount, userCount, configCount });

    console.log('\n--- MIGRATIONS ---');
    // Consulta direta na tabela de controle do Prisma
    const migrations = await prisma.$queryRaw`SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC`;
    console.log(JSON.stringify(migrations, null, 2));

    // Teste de Tenant Isolation (Exemplo: Clientes de Tenant A não aparecem em Tenant B)
    console.log('\n--- TENANT ISOLATION CHECK ---');
    const tenants = await prisma.tenant.findMany({ take: 2 });
    if (tenants.length >= 2) {
      const clientsT1 = await prisma.client.count({ where: { tenantId: tenants[0].id } });
      const clientsT2 = await prisma.client.count({ where: { tenantId: tenants[1].id } });
      console.log(`Tenant 1 (${tenants[0].name}): ${clientsT1} clients`);
      console.log(`Tenant 2 (${tenants[1].name}): ${clientsT2} clients`);
    }

  } catch (err) {
    console.error('Error during check:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
