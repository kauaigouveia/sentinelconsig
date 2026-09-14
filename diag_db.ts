
import { PrismaClient } from '@prisma/client';

async function diagnose() {
  console.log('--- DATABASE DIAGNOSIS ---');
  
  const dbUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (!dbUrl) {
    console.log('DATABASE_URL: MISSING');
  } else {
    try {
      const url = new URL(dbUrl);
      console.log('DATABASE_URL: PRESENT');
      console.log('  Host:', url.hostname);
      console.log('  Port:', url.port || '5432');
      console.log('  Database:', url.pathname.slice(1));
      console.log('  Params:', url.search);
    } catch (e) {
      console.log('DATABASE_URL: INVALID FORMAT');
    }
  }

  if (!directUrl) {
    console.log('DIRECT_URL: MISSING');
  } else {
    try {
      const url = new URL(directUrl);
      console.log('DIRECT_URL: PRESENT');
      console.log('  Host:', url.hostname);
      console.log('  Port:', url.port || '5432');
      console.log('  Database:', url.pathname.slice(1));
      console.log('  Params:', url.search);
    } catch (e) {
      console.log('DIRECT_URL: INVALID FORMAT');
    }
  }

  const prisma = new PrismaClient();

  try {
    console.log('\nTesting connection with SELECT 1...');
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log('SELECT 1: SUCCESS', result);
  } catch (err) {
    console.error('SELECT 1: FAILED');
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
  }

  try {
    console.log('\nCounting records...');
    const tenants = await prisma.tenant.count();
    console.log('Tenants:', tenants);
    
    const users = await prisma.user.count();
    console.log('Users:', users);
    
    const whiteLabel = await prisma.whiteLabelConfig.count();
    console.log('WhiteLabelConfigs:', whiteLabel);
  } catch (err) {
    console.error('Count records: FAILED');
    console.error('Error Message:', err.message);
  }

  await prisma.$disconnect();
}

diagnose();
