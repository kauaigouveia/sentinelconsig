
import { PrismaClient } from '@prisma/client';

async function checkLogs() {
  const prisma = new PrismaClient();
  try {
    console.log('Checking recent AuditLogs for errors...');
    const logs = await prisma.auditLog.findMany({
      where: {
        action: { contains: 'ERROR' }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    console.log('Recent Error Logs:', logs);
  } catch (err) {
    console.error('Failed to query AuditLogs:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkLogs();
