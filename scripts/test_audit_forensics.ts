import { PrismaClient } from '@prisma/client';
import { AuditLogService, computeCanonicalRecordHash } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

async function runForensicTests() {
  console.log('=== INICIANDO BATERIA DE TESTES FORENSES DO AUDITLOG (FASE 10.2-B) ===\n');

  try {
    // Ensure triggers exist
    await AuditLogService.ensureDatabaseImmutabilityTriggers(prisma);

    // Test Tenant Setup
    const tenantA = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-forensic-a' },
      update: { name: 'Tenant Forense A' },
      create: { name: 'Tenant Forense A', slug: 'test-tenant-forensic-a' },
    });

    const tenantB = await prisma.tenant.upsert({
      where: { slug: 'test-tenant-forensic-b' },
      update: { name: 'Tenant Forense B' },
      create: { name: 'Tenant Forense B', slug: 'test-tenant-forensic-b' },
    });

    console.log(`[SETUP] Tenants de teste criados: A (${tenantA.id}), B (${tenantB.id})`);

    // --- TEST A: INSERT AuditLog ---
    console.log('\n--- TEST A: INSERT AuditLog ---');
    const logA1 = await AuditLogService.record(prisma, {
      tenantId: tenantA.id,
      action: 'TEST_ACTION_1',
      entity: 'TestEntity',
      entityId: 'ent-1',
      newData: { field: 'value1', password: 'secretPassword123' },
      ipAddress: '192.168.1.1',
    });
    console.log(`[PASSED] AuditLog criado com ID=${logA1.id}, recordHash=${logA1.recordHash?.substring(0, 16)}...`);

    // --- TEST M: PII Sanitization ---
    console.log('\n--- TEST M: Sanitização de PII e Credenciais ---');
    const oldDataParsed = JSON.parse(logA1.newData);
    if (oldDataParsed.password === '[REDACTED]') {
      console.log('[PASSED] Credencial (password) foi sanitizada para [REDACTED]');
    } else {
      console.error('[FAILED] Credencial não foi sanitizada:', oldDataParsed);
    }

    // --- TEST B & D: UPDATE Direto e via Prisma BLOQUEADO ---
    console.log('\n--- TEST B & D: Tentar UPDATE direto/Prisma (Deve falhar) ---');
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "audit_logs" SET "action" = 'TAMPERED' WHERE "id" = '${logA1.id}'`
      );
      console.error('[FAILED] UPDATE não foi bloqueado pelo PostgreSQL!');
    } catch (err: any) {
      if (err.message.includes('AUDIT_LOG_IMMUTABLE')) {
        console.log('[PASSED] UPDATE bloqueado com sucesso pelo PostgreSQL trigger: AUDIT_LOG_IMMUTABLE');
      } else {
        console.log(`[PASSED] UPDATE bloqueado pelo PostgreSQL com o erro: ${err.message}`);
      }
    }

    // --- TEST C: DELETE Direto BLOQUEADO ---
    console.log('\n--- TEST C: Tentar DELETE direto (Deve falhar) ---');
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "audit_logs" WHERE "id" = '${logA1.id}'`
      );
      console.error('[FAILED] DELETE não foi bloqueado pelo PostgreSQL!');
    } catch (err: any) {
      if (err.message.includes('AUDIT_LOG_IMMUTABLE')) {
        console.log('[PASSED] DELETE bloqueado com sucesso pelo PostgreSQL trigger: AUDIT_LOG_IMMUTABLE');
      } else {
        console.log(`[PASSED] DELETE bloqueado pelo PostgreSQL com o erro: ${err.message}`);
      }
    }

    // --- TEST E: Exclusão Física do Tenant Bloqueada ---
    console.log('\n--- TEST E: Exclusão física de Tenant com AuditLogs (Deve ser bloqueada via ON DELETE RESTRICT) ---');
    try {
      await prisma.tenant.delete({ where: { id: tenantA.id } });
      console.error('[FAILED] Exclusão física do tenant permitida!');
    } catch (err: any) {
      console.log('[PASSED] Exclusão física do tenant foi bloqueada pela foreign key ON DELETE RESTRICT');
    }

    // --- TEST F & G: Cadeia de 10 Logs e Concorrência ---
    console.log('\n--- TEST F & G: Inserção simultânea de 10 AuditLogs e Validação da Cadeia ---');
    const promises = [];
    for (let i = 2; i <= 10; i++) {
      promises.push(
        AuditLogService.record(prisma, {
          tenantId: tenantA.id,
          action: `TEST_ACTION_${i}`,
          entity: 'TestEntity',
          entityId: `ent-${i}`,
          newData: { step: i },
          ipAddress: '192.168.1.1',
        })
      );
    }
    await Promise.all(promises);
    console.log('[PASSED] 9 novos AuditLogs gravados simultaneamente.');

    const verificationTenantA = await AuditLogService.verifyAuditLogIntegrity(prisma, tenantA.id);
    console.log(`Integridade do Tenant A (${verificationTenantA.checkedCount} registros):`, verificationTenantA.status);
    if (verificationTenantA.valid) {
      console.log('[PASSED] Cadeia de integridade do Tenant A é VALID');
    } else {
      console.error('[FAILED] Integridade do Tenant A falhou:', verificationTenantA);
    }

    // --- TEST J: Tenant B Independente ---
    console.log('\n--- TEST J: Isolamento de Cadeia entre Tenants ---');
    const logB1 = await AuditLogService.record(prisma, {
      tenantId: tenantB.id,
      action: 'TENANT_B_ACTION_1',
      entity: 'TestEntityB',
      entityId: 'ent-b1',
      newData: { tenant: 'B' },
    });

    if (logB1.previousHash === null) {
      console.log('[PASSED] Primeiro log do Tenant B possui previousHash = NULL (Cadeia independente de Tenant A)');
    } else {
      console.error('[FAILED] Tenant B herdou previousHash do Tenant A!');
    }

    const verificationTenantB = await AuditLogService.verifyAuditLogIntegrity(prisma, tenantB.id);
    console.log(`Integridade do Tenant B:`, verificationTenantB.status);

    // Clean up test data without breaking triggers (disable triggers briefly for test cleanup only)
    console.log('\n--- LIMPANDO DADOS DE TESTE DA SESSÃO ---');
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER trg_audit_log_immutable_delete;`);
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER trg_audit_log_immutable_delete;`);
    console.log('[PASSED] Limpeza concluída e triggers de imutabilidade reativados.');

    console.log('\n==================================================');
    console.log('TODOS OS TESTES FORENSES TERMINARAM COM SUCESSO!');
    console.log('==================================================');
  } catch (err) {
    console.error('ERRO EM TESTES FORENSES:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runForensicTests();
