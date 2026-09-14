
import { PrismaClient } from '@prisma/client';

async function diagnose() {
  console.log('--- DATABASE METADATA DIAGNOSIS ---');
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  const prismaDirect = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DIRECT_URL
      }
    }
  });

  try {
    console.log('Testing POOLED connection...');
    const start = Date.now();
    const metadata = await prisma.$queryRaw`
      SELECT 
        current_database() as db_name,
        current_schema() as schema_name,
        current_user as user_name,
        inet_server_addr() as server_ip,
        version() as pg_version
    `;
    const elapsed = Date.now() - start;
    console.log('POOLED SUCCESS (', elapsed, 'ms):', metadata);

    console.log('\nCounting records...');
    const tenants = await prisma.tenant.count();
    const users = await prisma.user.count();
    const configs = await prisma.whiteLabelConfig.count();
    console.log('Tenants:', tenants);
    console.log('Users:', users);
    console.log('WhiteLabelConfigs:', configs);

  } catch (err) {
    console.error('POOLED FAILED:', err.message);
  }

  try {
    console.log('\nTesting DIRECT connection...');
    const start = Date.now();
    const res = await prismaDirect.$queryRaw`SELECT 1 as ok`;
    const elapsed = Date.now() - start;
    console.log('DIRECT SUCCESS (', elapsed, 'ms):', res);
  } catch (err) {
    console.error('DIRECT FAILED:', err.message);
  }

  await prisma.$disconnect();
  await prismaDirect.$disconnect();
}

diagnose();
