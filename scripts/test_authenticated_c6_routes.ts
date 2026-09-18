process.env.NODE_ENV = 'test';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../server.js';
import { hashPassword } from '../server/services/passwordService.js';

const prisma = new PrismaClient();

async function testAuthenticatedC6ApiRoutes() {
  console.log('=== TESTE DE ROTAS AUTENTICADAS C6 BANK (HTTP REAL VIA SUPERTEST) ===\n');

  const tenantAlphaId = 'test-auth-tenant-alpha-' + Date.now();
  const tenantBetaId = 'test-auth-tenant-beta-' + Date.now();

  try {
    // 1. Setup Tenants & Users
    const passwordHash = await hashPassword('MasterSecret123!');
    
    await prisma.tenant.createMany({
      data: [
        { id: tenantAlphaId, name: 'Correspondente Alpha', slug: 'corr-alpha-' + Date.now(), status: 'ACTIVE' },
        { id: tenantBetaId, name: 'Correspondente Beta', slug: 'corr-beta-' + Date.now(), status: 'ACTIVE' },
      ],
    });

    const userAlpha = await prisma.user.create({
      data: {
        email: `alpha_${Date.now()}@sentinel.test`,
        name: 'Admin Alpha',
        passwordHash: passwordHash,
        role: 'MASTER',
        tenant: { connect: { id: tenantAlphaId } },
        active: true,
      },
    });

    const userBeta = await prisma.user.create({
      data: {
        email: `beta_${Date.now()}@sentinel.test`,
        name: 'Admin Beta',
        passwordHash: passwordHash,
        role: 'MASTER',
        tenant: { connect: { id: tenantBetaId } },
        active: true,
      },
    });

    // 2. Login User Alpha to get Session Cookie
    console.log('[1/7] Efetuando login do Tenant Alpha...');
    const loginAlphaRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userAlpha.email, password: 'MasterSecret123!' });

    if (loginAlphaRes.status !== 200) {
      throw new Error(`Falha no login do usuário Alpha: ${loginAlphaRes.status}`);
    }
    const cookieAlpha = loginAlphaRes.headers['set-cookie'];
    console.log('  -> SUCESSO: Login efetuado e cookie de sessão obtido.');

    // 3. Test GET /api/integrations/c6/config (Initial Empty State)
    console.log('\n[2/7] Testando GET /api/integrations/c6/config autenticado (Tenant Alpha)...');
    const getConfigAlpha1 = await request(app)
      .get('/api/integrations/c6/config')
      .set('Cookie', cookieAlpha);

    console.log('  -> Status:', getConfigAlpha1.status);
    console.log('  -> Config:', getConfigAlpha1.body);
    if (getConfigAlpha1.status === 200 && getConfigAlpha1.body.hasPassword === false && !getConfigAlpha1.body.password) {
      console.log('  -> SUCESSO: Configuração inicial carregada sem expor senha.');
    } else {
      throw new Error(`Falha no GET config inicial: ${getConfigAlpha1.status}`);
    }

    // 4. Test POST /api/integrations/c6/config (Save Credentials)
    console.log('\n[3/7] Testando POST /api/integrations/c6/config autenticado (Tenant Alpha)...');
    const saveConfigAlpha = await request(app)
      .post('/api/integrations/c6/config')
      .set('Cookie', cookieAlpha)
      .send({
        username: 'c6_api_user_alpha',
        password: 'C6_Super_Secret_Password_999!',
        baseUrl: 'https://marketplace-proposal-service-api-p.c6bank.info',
        autoSyncEnabled: true,
        syncIntervalMinutes: 25,
      });

    console.log('  -> Status:', saveConfigAlpha.status);
    console.log('  -> Body:', saveConfigAlpha.body);
    if (saveConfigAlpha.status === 200 && saveConfigAlpha.body.success) {
      console.log('  -> SUCESSO: Configuração salva com sucesso.');
    } else {
      throw new Error(`Falha ao salvar configuração: ${saveConfigAlpha.status}`);
    }

    // 5. Test GET /api/integrations/c6/config (Verify Saved State without Password Leak)
    console.log('\n[4/7] Verificando GET /api/integrations/c6/config pós-salvamento...');
    const getConfigAlpha2 = await request(app)
      .get('/api/integrations/c6/config')
      .set('Cookie', cookieAlpha);

    if (
      getConfigAlpha2.status === 200 &&
      getConfigAlpha2.body.username === 'c6_api_user_alpha' &&
      getConfigAlpha2.body.hasPassword === true &&
      !getConfigAlpha2.body.password &&
      getConfigAlpha2.body.syncIntervalMinutes === 25
    ) {
      console.log('  -> SUCESSO: Configuração retornada com username, hasPassword=true, sem vazar senha!');
    } else {
      throw new Error(`Falha na verificação de configuração salva: ${JSON.stringify(getConfigAlpha2.body)}`);
    }

    // 6. Test GET /api/integrations/c6/status
    console.log('\n[5/7] Testando GET /api/integrations/c6/status...');
    const getStatusAlpha = await request(app)
      .get('/api/integrations/c6/status')
      .set('Cookie', cookieAlpha);

    console.log('  -> Status:', getStatusAlpha.status);
    console.log('  -> Body:', getStatusAlpha.body);
    if (getStatusAlpha.status === 200 && (typeof getStatusAlpha.body.pendingProposalsCount === 'number' || typeof getStatusAlpha.body.pendingCount === 'number')) {
      console.log('  -> SUCESSO: Status do worker retornado com sucesso.');
    } else {
      throw new Error(`Falha no GET status: ${getStatusAlpha.status}`);
    }

    // 7. Test POST /api/integrations/c6/test-connection
    console.log('\n[6/7] Testando POST /api/integrations/c6/test-connection com credenciais de formulário...');
    const testConnRes = await request(app)
      .post('/api/integrations/c6/test-connection')
      .set('Cookie', cookieAlpha)
      .send({
        username: 'user_inexistente_teste',
        password: 'senha_inexistente_teste',
      });

    console.log('  -> Status:', testConnRes.status);
    console.log('  -> Body:', testConnRes.body);
    if (testConnRes.status === 200 && testConnRes.body.success === false && typeof testConnRes.body.message === 'string') {
      console.log('  -> SUCESSO: Teste de conexão executado e diagnosticado com precisão.');
    } else {
      throw new Error(`Falha no endpoint test-connection: ${testConnRes.status}`);
    }

    // 8. Multi-Tenant Isolation Test (Tenant Beta must NOT see Tenant Alpha config)
    console.log('\n[7/7] Testando Isolamento Multi-Tenant (Tenant Beta)...');
    const loginBetaRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userBeta.email, password: 'MasterSecret123!' });
    const cookieBeta = loginBetaRes.headers['set-cookie'];

    const getConfigBeta = await request(app)
      .get('/api/integrations/c6/config')
      .set('Cookie', cookieBeta);

    if (getConfigBeta.status === 200 && !getConfigBeta.body.username && getConfigBeta.body.hasPassword === false) {
      console.log('  -> SUCESSO: Tenant Beta não enxerga configurações do Tenant Alpha (Isolamento total).');
    } else {
      throw new Error(`Falha no isolamento multi-tenant: ${JSON.stringify(getConfigBeta.body)}`);
    }

    console.log('\n======================================================================');
    console.log('TODAS AS ROTAS DA API C6 FORAM VALIDADAS COM SUCESSO ABSOLUTO!');
    console.log('======================================================================\n');
  } finally {
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});
    await prisma.systemConfig.deleteMany({ where: { tenantId: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAlphaId, tenantBetaId] } } }).catch(() => {});
    await prisma.$disconnect();
  }
}

testAuthenticatedC6ApiRoutes().catch((err) => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
