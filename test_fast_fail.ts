
import { PrismaClient } from '@prisma/client';

async function testFastFail() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://user:pass@non-existent-host:5432/db'
      }
    }
  });

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log('Failed in', Date.now() - start, 'ms');
    console.log('Error Code:', err.code);
    console.log('Error Message:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testFastFail();
