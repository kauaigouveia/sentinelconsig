
import { PrismaClient } from '@prisma/client';

async function listDbs() {
  const prisma = new PrismaClient();
  try {
    console.log('Listing all databases...');
    const dbs = await prisma.$queryRaw`SELECT datname FROM pg_database WHERE datistemplate = false;`;
    console.log('Databases:', dbs);
  } catch (err) {
    console.error('Failed to list databases:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

listDbs();
