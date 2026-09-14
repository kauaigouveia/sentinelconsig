
import { PrismaClient } from '@prisma/client';

async function testTime() {
  const prisma = new PrismaClient();
  const start = Date.now();
  try {
    console.log('Testing connection...');
    await prisma.$queryRaw`SELECT 1`;
    const end = Date.now();
    console.log(`Connection established in ${end - start}ms`);
  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testTime();
