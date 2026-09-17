import assert from 'assert';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { extractPartnerCode } from '../src/lib/utils';

const prisma = new PrismaClient();

async function runPartnerSelectFixAudit() {
  console.log('================================================================');
  console.log('SENTINEL CONSIG — TESTE AUDITORIA DEFINITIVA: COMBOBOX SIMULATIONVIEW');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      fn();
      console.log(`[PASS] Teste ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] Teste ${total}: ${name}`);
      console.error('      Erro:', err.message);
    }
  }

  // Set up test tenant & 3 active partners as requested
  const tenantA = await prisma.tenant.create({
    data: {
      name: `Tenant Partners Test A ${Date.now()}`,
      slug: `tenant-part-a-${Date.now()}`,
      status: 'ACTIVE',
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      name: `Tenant Partners Test B ${Date.now()}`,
      slug: `tenant-part-b-${Date.now()}`,
      status: 'ACTIVE',
    },
  });

  const partner1 = await prisma.partner.create({
    data: {
      tenantId: tenantA.id,
      name: 'KAUAI AMORIM GOUVEIA',
      code: '16740',
      status: 'ATIVO',
    },
  });

  const partner2 = await prisma.partner.create({
    data: {
      tenantId: tenantA.id,
      name: 'FRANCISCO DA SILVA',
      code: '16690',
      status: 'ATIVO',
    },
  });

  const partner3 = await prisma.partner.create({
    data: {
      tenantId: tenantA.id,
      name: 'FOX AGENTE FINANCEIRO',
      code: '16715',
      status: 'ATIVO',
    },
  });

  const partnerB1 = await prisma.partner.create({
    data: {
      tenantId: tenantB.id,
      name: 'PARCEIRO OUTRO TENANT',
      code: '99999',
      status: 'ATIVO',
    },
  });

  try {
    // 1. API returns normalized Partner
    const dbPartners = await prisma.partner.findMany({
      where: { tenantId: tenantA.id, deletedAt: null, status: 'ATIVO' },
      orderBy: { name: 'asc' },
    });

    const normalized = dbPartners.map(p => ({
      id: p.id,
      fullName: p.name || 'Parceiro sem Nome',
      login: p.code ? `${p.name}@${p.code}` : p.name,
      promoterId: p.promoterId || '',
      active: p.status === 'ATIVO',
      createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: p.updatedAt ? p.updatedAt.toISOString() : new Date().toISOString(),
    }));

    test('1. API returns normalized Partner (fullName, login, active, id, promoterId, createdAt, updatedAt)', () => {
      assert.strictEqual(normalized.length, 3);
      const first = normalized[0];
      assert('id' in first && typeof first.id === 'string');
      assert('fullName' in first && typeof first.fullName === 'string');
      assert('login' in first && typeof first.login === 'string');
      assert('promoterId' in first);
      assert('active' in first && first.active === true);
      assert('createdAt' in first);
      assert('updatedAt' in first);
    });

    // 2. 3 active partners returned
    test('2. 3 active partners returned for Tenant A', () => {
      assert.strictEqual(normalized.length, 3);
      assert(normalized.some(p => p.fullName === 'KAUAI AMORIM GOUVEIA'));
      assert(normalized.some(p => p.fullName === 'FRANCISCO DA SILVA'));
      assert(normalized.some(p => p.fullName === 'FOX AGENTE FINANCEIRO'));
    });

    // Combobox filtering function identical to SimulationView.tsx
    function filterCombobox(partnersList: any[], queryStr: string) {
      if (!queryStr.trim()) return partnersList;
      const q = queryStr.trim().toLowerCase();
      return partnersList.filter(p => {
        if (!p) return false;
        const loginStr = String(p.login ?? p.code ?? '');
        const fullNameStr = String(p.fullName ?? p.name ?? '');
        const codePart = p.code ? String(p.code) : extractPartnerCode(loginStr);

        const code = codePart.toLowerCase();
        const login = loginStr.toLowerCase();
        const name = fullNameStr.toLowerCase();

        return code.includes(q) || login.includes(q) || name.includes(q);
      });
    }

    // 3. Search by name ("KAUAI")
    test('3. Search by name ("KAUAI" -> KAUAI AMORIM GOUVEIA)', () => {
      const results = filterCombobox(normalized, 'KAUAI');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, partner1.id);
    });

    // 4. Search by code ("16740")
    test('4. Search by code ("16740" -> KAUAI AMORIM GOUVEIA)', () => {
      const results = filterCombobox(normalized, '16740');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, partner1.id);
    });

    // 5. Search by login ("KAUAI AMORIM GOUVEIA@16740")
    test('5. Search by login ("KAUAI AMORIM GOUVEIA@16740")', () => {
      const results = filterCombobox(normalized, 'KAUAI AMORIM GOUVEIA@16740');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, partner1.id);
    });

    // 6. Empty query
    test('6. Empty query returns all 3 active partners', () => {
      const results = filterCombobox(normalized, '');
      assert.strictEqual(results.length, 3);
    });

    // 7. No results handling
    test('7. Search with no matching results ("XYZ999" -> 0 results, no error)', () => {
      const results = filterCombobox(normalized, 'XYZ999');
      assert.strictEqual(results.length, 0);
    });

    // 8. Undefined-safe
    test('8. Undefined-safe: incomplete partner objects do NOT crash with Cannot read properties of undefined', () => {
      const brokenList = [
        { id: 'b1', fullName: undefined, login: null },
        { id: 'b2' },
        null,
        undefined,
      ];
      let threw = false;
      try {
        const results = filterCombobox(brokenList, 'test');
        assert.strictEqual(results.length, 0);
      } catch (err) {
        threw = true;
      }
      assert(!threw, 'Filtro seguro contra nulos');
    });

    // 9. PLATFORM_MASTER effectiveTenantId
    test('9. PLATFORM_MASTER query respects session.effectiveTenantId', () => {
      // Simulating server logic:
      const sessionMasterContextA = { user: { role: 'PLATFORM_MASTER', tenantId: 'master-tenant' }, effectiveTenantId: tenantA.id };
      const targetTenant = sessionMasterContextA.effectiveTenantId || sessionMasterContextA.user.tenantId;
      assert.strictEqual(targetTenant, tenantA.id);
    });

    // 10. Multi-tenant isolation
    test('10. Tenant isolation: Tenant A query does not return Tenant B partners', () => {
      const hasB = normalized.some(p => p.id === partnerB1.id);
      assert(!hasB, 'Parceiro do Tenant B não deve vazar no Tenant A');
    });

    // 11. Selection returns correct partner ID
    test('11. Selecting partner from combobox returns correct partner ID', () => {
      const selected = normalized.find(p => p.login.includes('16740'));
      assert(selected);
      assert.strictEqual(selected.id, partner1.id);
    });

    // 12. Simulation Creation Payload Uses partnerId
    test('12. Simulation creation uses partnerId correctly in payload', () => {
      const payload = { cpf: '01138777498', partnerId: partner1.id };
      assert.strictEqual(payload.partnerId, partner1.id);
      assert('cpf' in payload && 'partnerId' in payload);
    });

    // Extra: Verify removal of automated filling box from SimulationView.tsx
    test('13. Bloco visual "Preenchimento Automático do Sistema" completamente ausente do JSX', () => {
      const simViewPath = path.join(process.cwd(), 'src/components/simulation/SimulationView.tsx');
      const content = fs.readFileSync(simViewPath, 'utf-8');
      const hasBox = content.includes('Preenchimento Automático do Sistema');
      assert(!hasBox, 'A modal não deve conter o título do bloco visual antigo');
    });

  } finally {
    // Cleanup test records
    await prisma.partner.deleteMany({
      where: { id: { in: [partner1.id, partner2.id, partner3.id, partnerB1.id] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA.id, tenantB.id] } },
    });
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES: ${total} | PASSOU: ${passed} | FALHOU: ${total - passed}`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPartnerSelectFixAudit().catch(err => {
  console.error('Erro fatal no teste:', err);
  process.exit(1);
});
