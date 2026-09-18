import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'evolvepromotora' } });
  console.log(tenant);
}
main().finally(() => prisma.$disconnect());
