
import { PrismaClient } from '@prisma/client';

async function checkTenants() {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany();
    console.log('Tenants:', tenants.map(t => ({ id: t.id, name: t.name, slug: t.slug })));
  } catch (err) {
    console.error('Failed to query tenants:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTenants();
