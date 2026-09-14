
import { PrismaClient } from '@prisma/client';

async function testClosedPort() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'postgresql://user:pass@127.0.0.1:5433/db' // Closed port
      }
    }
  });

  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log('Failed in', Date.now() - start, 'ms');
    console.log('Error Message:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testClosedPort();
