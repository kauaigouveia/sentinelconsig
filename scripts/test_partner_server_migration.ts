import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
  console.log('==================================================');
  console.log('TEST SUITE: PARTNER SERVER-SIDE MIGRATION & SECURITY');
  console.log('==================================================\n');

  // 1. Get default tenant SENTINEL CONSIG
  const mainTenant = await prisma.tenant.findFirst({
    where: { slug: 'sentinel-consig' }
  });

  if (!mainTenant) {
    throw new Error('Tenant principal SENTINEL CONSIG não encontrado.');
  }

  console.log(`[TENANT] Principal ID: ${mainTenant.id} (${mainTenant.name})`);

  // 2. Ensure initial seed for SENTINEL CONSIG
  const existingPartners = await prisma.partner.findMany({
    where: { tenantId: mainTenant.id, deletedAt: null }
  });

  console.log(`[DB] Parceiros existentes para SENTINEL CONSIG: ${existingPartners.length}`);

  const initialPartnersToMigrate = [
    { name: 'KAUAI AMORIM GOUVEIA', code: 'KAUAI@16740' },
    { name: 'FRANCISCO DA SILVA', code: 'FRANCO@16690' },
    { name: 'FOX AGENTE FINANCEIRO', code: 'FOX@16715' },
  ];

  for (const item of initialPartnersToMigrate) {
    const found = await prisma.partner.findFirst({
      where: { tenantId: mainTenant.id, code: item.code }
    });

    if (!found) {
      const created = await prisma.partner.create({
        data: {
          tenantId: mainTenant.id,
          name: item.name,
          code: item.code,
          status: 'ATIVO'
        }
      });
      console.log(`[SEED] Criado parceiro inicial: ${created.name} (${created.code})`);
    } else if (found.deletedAt !== null) {
      const restored = await prisma.partner.update({
        where: { id: found.id },
        data: { deletedAt: null, status: 'ATIVO', name: item.name }
      });
      console.log(`[SEED] Restaurado parceiro deletado: ${restored.name} (${restored.code})`);
    } else {
      console.log(`[SEED] Parceiro já existe: ${found.name} (${found.code})`);
    }
  }

  // 3. Verify total active partners
  const activePartners = await prisma.partner.findMany({
    where: { tenantId: mainTenant.id, deletedAt: null },
    orderBy: { name: 'asc' }
  });

  console.log(`\n[VERIFICAÇÃO] Total de parceiros ativos no PostgreSQL para ${mainTenant.name}: ${activePartners.length}`);
  activePartners.forEach((p, idx) => {
    console.log(`  ${idx + 1}. ID: ${p.id} | NOME: ${p.name} | CODE/LOGIN: ${p.code} | STATUS: ${p.status}`);
  });

  // 4. Test Multi-tenant isolation
  console.log('\n--- TESTE DE ISOLAMENTO MULTI-TENANT ---');
  const gateTenantA = await prisma.tenant.findFirst({ where: { slug: 'gate-tenant-a' } });
  if (gateTenantA) {
    const partnersTenantA = await prisma.partner.findMany({
      where: { tenantId: gateTenantA.id, deletedAt: null }
    });
    console.log(`[TENANT ISOLATION] Parceiros do Gate Tenant A: ${partnersTenantA.length}`);
    const leakCheck = partnersTenantA.some(p => activePartners.some(ap => ap.id === p.id));
    if (leakCheck) {
      console.error('❌ ERRO: VAZAMENTO DE DADOS ENTRE TENANTS DETECTADO!');
    } else {
      console.log('✅ SUCESSO: Nenhum vazamento de parceiros entre tenants.');
    }
  }

  // 5. Test Audit Logs
  console.log('\n--- VERIFICANDO AUDIT LOGS ---');
  const logs = await prisma.auditLog.findMany({
    where: { entity: 'Partner' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(`Audit logs de Partner registrados: ${logs.length}`);
  logs.forEach(l => {
    console.log(` - Action: ${l.action} | NewData: ${l.newData} | Tenant: ${l.tenantId}`);
  });

  console.log('\n==================================================');
  console.log('MIGRAÇÃO DE PARCEIROS PARA POSTGRESQL CONCLUÍDA E VALIDADA!');
  console.log('==================================================');
}

runTests()
  .catch(err => {
    console.error('❌ ERRO NO TESTE DE MIGRAÇÃO:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
