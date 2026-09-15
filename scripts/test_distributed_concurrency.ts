import { PrismaClient } from '@prisma/client';
import { AuditLogService } from '../server/services/auditLogService.js';

// We instantiate multiple independent Prisma clients to simulate distinct serverless instances/containers
const client1 = new PrismaClient();
const client2 = new PrismaClient();
const client3 = new PrismaClient();
const clients = [client1, client2, client3];

async function runDistributedConcurrencyTests() {
  console.log('=== INICIANDO BATERIA DE TESTES DE CONCORRÊNCIA DISTRIBUÍDA (FASE 10.2-B.1) ===\n');

  try {
    // Setup tenants
    const tenantA = await client1.tenant.upsert({
      where: { slug: 'test-dist-tenant-a' },
      update: { name: 'Tenant Distribuído A' },
      create: { name: 'Tenant Distribuído A', slug: 'test-dist-tenant-a' },
    });

    const tenantB = await client1.tenant.upsert({
      where: { slug: 'test-dist-tenant-b' },
      update: { name: 'Tenant Distribuído B' },
      create: { name: 'Tenant Distribuído B', slug: 'test-dist-tenant-b' },
    });

    console.log(`[SETUP] Tenants criados: A (${tenantA.id}), B (${tenantB.id})`);

    // --- TEST 1: 20 Operações Concorrentes no Mesmo Tenant (Múltiplos Clientes/Instâncias) ---
    console.log('\n--- TEST 1: Executando 20 gravações concorrentes simulando instâncias independentes (Tenant A) ---');
    const tasks20 = [];
    for (let i = 1; i <= 20; i++) {
      const selectedClient = clients[i % clients.length];
      tasks20.push(
        AuditLogService.record(selectedClient, {
          tenantId: tenantA.id,
          action: `DIST_ACTION_20_${i}`,
          entity: 'DistEntity',
          entityId: `id-${i}`,
          newData: { seq: i, instance: i % clients.length },
          ipAddress: '10.0.0.1',
        })
      );
    }

    const results20 = await Promise.all(tasks20);
    console.log(`[PASSED] ${results20.filter(Boolean).length}/20 gravações concluídas.`);

    // Verify Integrity for Tenant A
    const verify20 = await AuditLogService.verifyAuditLogIntegrity(client1, tenantA.id);
    console.log(`[VERIFY 20] Status Tenant A (${verify20.checkedCount} logs):`, verify20.status);
    if (!verify20.valid) {
      console.error('[FAILED] Quebra na cadeia com 20 inserções concorrentes:', verify20);
      process.exit(1);
    } else {
      console.log('[PASSED] Cadeia de 20 logs totalmente linear e VÁLIDA sem nenhum branching!');
    }

    // --- TEST 2: 50 Operações Concorrentes no Mesmo Tenant ---
    console.log('\n--- TEST 2: Executando 50 gravações concorrentes adicionais (Tenant A) ---');
    const tasks50 = [];
    for (let i = 1; i <= 50; i++) {
      const selectedClient = clients[i % clients.length];
      tasks50.push(
        AuditLogService.record(selectedClient, {
          tenantId: tenantA.id,
          action: `DIST_ACTION_50_${i}`,
          entity: 'DistEntity',
          entityId: `id-50-${i}`,
          newData: { seq: i, payload: 'heavy-test' },
          ipAddress: '10.0.0.2',
        })
      );
    }

    const results50 = await Promise.all(tasks50);
    console.log(`[PASSED] ${results50.filter(Boolean).length}/50 gravações concluídas.`);

    // Verify Integrity for Tenant A
    const verify50 = await AuditLogService.verifyAuditLogIntegrity(client1, tenantA.id);
    console.log(`[VERIFY 50] Status Tenant A (${verify50.checkedCount} logs no total):`, verify50.status);
    if (!verify50.valid) {
      console.error('[FAILED] Quebra na cadeia com 50 inserções concorrentes:', verify50);
      process.exit(1);
    } else {
      console.log('[PASSED] Cadeia de 70 logs (20+50) totalmente VÁLIDA sem nenhum branching!');
    }

    // --- TEST 3: Intercalando Multi-Tenants Simultâneos (Tenant A e Tenant B) ---
    console.log('\n--- TEST 3: Executando 30 gravações simultâneas distribuídas entre Tenant A e Tenant B ---');
    const multiTasks = [];
    for (let i = 1; i <= 30; i++) {
      const isTenantA = i % 2 === 0;
      const tId = isTenantA ? tenantA.id : tenantB.id;
      const selectedClient = clients[i % clients.length];
      multiTasks.push(
        AuditLogService.record(selectedClient, {
          tenantId: tId,
          action: `MULTI_ACTION_${i}`,
          entity: 'MultiEntity',
          entityId: `multi-${i}`,
          newData: { tenant: isTenantA ? 'A' : 'B', index: i },
        })
      );
    }

    await Promise.all(multiTasks);

    const verifyA_final = await AuditLogService.verifyAuditLogIntegrity(client1, tenantA.id);
    const verifyB_final = await AuditLogService.verifyAuditLogIntegrity(client1, tenantB.id);

    console.log(`[VERIFY MULTI] Tenant A (${verifyA_final.checkedCount} logs):`, verifyA_final.status);
    console.log(`[VERIFY MULTI] Tenant B (${verifyB_final.checkedCount} logs):`, verifyB_final.status);

    if (verifyA_final.valid && verifyB_final.valid) {
      console.log('[PASSED] Ambas as cadeias (Tenant A e Tenant B) mantiveram integridade perfeita independentemente!');
    } else {
      console.error('[FAILED] Erro de integridade em multi-tenant:', { verifyA_final, verifyB_final });
      process.exit(1);
    }

    // Clean up test data
    console.log('\n--- LIMPANDO DADOS DE TESTE ---');
    await client1.$executeRawUnsafe(`ALTER TABLE "audit_logs" DISABLE TRIGGER trg_audit_log_immutable_delete;`);
    await client1.auditLog.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await client1.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await client1.$executeRawUnsafe(`ALTER TABLE "audit_logs" ENABLE TRIGGER trg_audit_log_immutable_delete;`);
    console.log('[PASSED] Limpeza concluída e triggers reabilitados.');

    console.log('\n================================================================');
    console.log('TODOS OS TESTES DE CONCORRÊNCIA DISTRIBUÍDA FORAM APROVADOS!');
    console.log('================================================================');
  } catch (err) {
    console.error('ERRO EM TESTE DE CONCORRÊNCIA DISTRIBUÍDA:', err);
    process.exit(1);
  } finally {
    await Promise.all(clients.map(c => c.$disconnect()));
  }
}

runDistributedConcurrencyTests();
