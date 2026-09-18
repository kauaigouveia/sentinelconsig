const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const partners = await prisma.partner.findMany({
     where: { tenantId: 'cmu0951dy0000s6zs0etffry0' }
  });
  console.log(JSON.stringify(partners, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
