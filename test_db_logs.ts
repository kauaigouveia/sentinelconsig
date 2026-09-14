
import { PrismaClient } from '@prisma/client';

async function testWithLogs() {
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  
  try {
    console.log('Testing connection with logs...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('Success');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

testWithLogs();
