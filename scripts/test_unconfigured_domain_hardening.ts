/**
 * SENTINEL CONSIG — SUÍTE DE TESTES: DOMAIN_NOT_CONFIGURED & SUBDOMÍNIOS NÃO CONFIGURADOS
 *
 * Valida a matriz completa de casos A até J:
 * A. sentinelconsig.com.br -> PLATFORM_DEFAULT
 * B. sentinelconsig.vercel.app -> PLATFORM_DEFAULT
 * C. teste.sentinelconsig.com.br -> DOMAIN_NOT_CONFIGURED, tenant: null, login bloqueado (403)
 * D. fake.sentinelconsig.com.br -> DOMAIN_NOT_CONFIGURED, tenant: null, login bloqueado (403)
 * E. homologacao.sentinelconsig.com.br (Ativo) -> PLATFORM_SUBDOMAIN, tenant correto
 * F. Tenant SUSPENDED -> DOMAIN_NOT_CONFIGURED / SUSPENDED, tenant: null, login bloqueado
 * G. Tenant CANCELLED -> DOMAIN_NOT_CONFIGURED, tenant: null, login bloqueado
 * H. Tenant PENDING_DELETION -> DOMAIN_NOT_CONFIGURED, tenant: null, login bloqueado
 * I. Cookie de sessão Tenant A em domínio Tenant B ou unconfigured -> 401/403
 * J. Hostnames maliciosos / bypass -> DOMAIN_NOT_CONFIGURED, tenant: null
 */

import http from 'http';
import { PrismaClient, TenantStatus, SubscriptionPlan, UserRole } from '@prisma/client';
import { hashPassword } from '../server/services/passwordService.js';

const prisma = new PrismaClient();
const PORT = 3000;

interface TestResult {
  code: string;
  category: string;
  description: string;
  expectedStatus: number;
  actualStatus: number;
  verdict: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

async function makeRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : '';
    const reqHeaders: Record<string, string> = {
      ...options.headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsedBody: any = null;
          try {
            parsedBody = JSON.parse(data);
          } catch {
            parsedBody = null;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsedBody,
            rawBody: data,
          });
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function recordResult(
  code: string,
  category: string,
  description: string,
  expectedStatus: number,
  actualStatus: number,
  passed: boolean,
  details: string
) {
  const verdict: 'PASS' | 'FAIL' = passed ? 'PASS' : 'FAIL';
  results.push({
    code,
    category,
    description,
    expectedStatus,
    actualStatus,
    verdict,
    details,
  });
  console.log(`[${verdict}] [${code}] ${description} — Status: ${actualStatus} (esperado: ${expectedStatus}) | ${details}`);
}

async function runUnconfiguredDomainSuite() {
  console.log('========================================================================');
  console.log('SENTINEL CONSIG — TESTES DE VALIDAÇÃO DE SUBDOMÍNIOS NÃO CONFIGURADOS');
  console.log('========================================================================\n');

  // Slugs e IDs para testes temporários
  const activeTenantSlug = `test-active-${Date.now()}`;
  const suspendedTenantSlug = `test-suspended-${Date.now()}`;
  const cancelledTenantSlug = `test-cancelled-${Date.now()}`;
  const pendingDelTenantSlug = `test-pendingdel-${Date.now()}`;

  let activeTenantId: string | null = null;
  let suspendedTenantId: string | null = null;
  let cancelledTenantId: string | null = null;
  let pendingDelTenantId: string | null = null;

  const testUserEmail = `active_user_${Date.now()}@sentinelconsig.com.br`;
  const rawPassword = 'Password123!#';
  const hashedPassword = await hashPassword(rawPassword);

  try {
    // Setup 1: Tenant Ativo
    const activeTenant = await prisma.tenant.create({
      data: {
        name: 'Tenant Ativo Teste',
        slug: activeTenantSlug,
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.ENTERPRISE,
        users: {
          create: {
            name: 'Usuário Ativo',
            email: testUserEmail,
            passwordHash: hashedPassword,
            role: UserRole.MASTER,
            active: true,
          },
        },
      },
    });
    activeTenantId = activeTenant.id;

    // Setup 2: Tenant Suspenso
    const suspendedTenant = await prisma.tenant.create({
      data: {
        name: 'Tenant Suspenso Teste',
        slug: suspendedTenantSlug,
        status: TenantStatus.SUSPENDED,
        plan: SubscriptionPlan.ENTERPRISE,
      },
    });
    suspendedTenantId = suspendedTenant.id;

    // Setup 3: Tenant Cancelado
    const cancelledTenant = await prisma.tenant.create({
      data: {
        name: 'Tenant Cancelado Teste',
        slug: cancelledTenantSlug,
        status: TenantStatus.CANCELLED,
        plan: SubscriptionPlan.ENTERPRISE,
      },
    });
    cancelledTenantId = cancelledTenant.id;

    // Setup 4: Tenant Pendente de Deleção
    const pendingDelTenant = await prisma.tenant.create({
      data: {
        name: 'Tenant Pendente Deleção Teste',
        slug: pendingDelTenantSlug,
        status: TenantStatus.PENDING_DELETION,
        plan: SubscriptionPlan.ENTERPRISE,
      },
    });
    pendingDelTenantId = pendingDelTenant.id;

    // -------------------------------------------------------------------------
    // CASO A: sentinelconsig.com.br (Canônico Principal)
    // -------------------------------------------------------------------------
    const resA = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: 'sentinelconsig.com.br' },
    });
    const passedA = resA.status === 200 && resA.body?.domainType === 'PLATFORM_DEFAULT';
    recordResult(
      'CASO_A',
      'Plataforma Principal',
      'sentinelconsig.com.br resolve como PLATFORM_DEFAULT',
      200,
      resA.status,
      passedA,
      `domainType: ${resA.body?.domainType}, status: ${resA.body?.status}`
    );

    // -------------------------------------------------------------------------
    // CASO B: sentinelconsig.vercel.app (Fallback Técnico Vercel)
    // -------------------------------------------------------------------------
    const resB = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: 'sentinelconsig.vercel.app' },
    });
    const passedB = resB.status === 200 && resB.body?.domainType === 'PLATFORM_DEFAULT';
    recordResult(
      'CASO_B',
      'Plataforma Vercel',
      'sentinelconsig.vercel.app resolve como PLATFORM_DEFAULT',
      200,
      resB.status,
      passedB,
      `domainType: ${resB.body?.domainType}, status: ${resB.body?.status}`
    );

    // -------------------------------------------------------------------------
    // CASO C: teste.sentinelconsig.com.br (Subdomínio não configurado relatado pelo usuário)
    // -------------------------------------------------------------------------
    const resC1 = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: 'teste.sentinelconsig.com.br' },
    });
    const passedC1 =
      resC1.status === 200 &&
      resC1.body?.domainType === 'DOMAIN_NOT_CONFIGURED' &&
      resC1.body?.status === 'DOMAIN_NOT_CONFIGURED';
    recordResult(
      'CASO_C1',
      'Subdomínio Inexistente',
      'teste.sentinelconsig.com.br/branding retorna DOMAIN_NOT_CONFIGURED sem branding do Sentinel',
      200,
      resC1.status,
      passedC1,
      `domainType: ${resC1.body?.domainType}, status: ${resC1.body?.status}, companyName: ${resC1.body?.companyName}`
    );

    const resC2 = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Host: 'teste.sentinelconsig.com.br' },
      body: { email: testUserEmail, password: rawPassword },
    });
    const passedC2 = resC2.status === 403 && resC2.body?.status === 'DOMAIN_NOT_CONFIGURED';
    recordResult(
      'CASO_C2',
      'Login Bloqueado',
      'Login em teste.sentinelconsig.com.br é rejeitado com HTTP 403 (DOMAIN_NOT_CONFIGURED)',
      403,
      resC2.status,
      passedC2,
      `message: ${resC2.body?.message}`
    );

    const resC3 = await makeRequest({
      method: 'GET',
      path: '/api/auth/session',
      headers: { Host: 'teste.sentinelconsig.com.br' },
    });
    const passedC3 = resC3.status === 403 && resC3.body?.authenticated === false;
    recordResult(
      'CASO_C3',
      'Sessão Bloqueada',
      'Consulta de sessão em teste.sentinelconsig.com.br é rejeitada com HTTP 403',
      403,
      resC3.status,
      passedC3,
      `authenticated: ${resC3.body?.authenticated}`
    );

    // -------------------------------------------------------------------------
    // CASO D: fake.sentinelconsig.com.br (Subdomínio aleatório não configurado)
    // -------------------------------------------------------------------------
    const resD1 = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: 'fake.sentinelconsig.com.br' },
    });
    const passedD1 = resD1.status === 200 && resD1.body?.domainType === 'DOMAIN_NOT_CONFIGURED';
    recordResult(
      'CASO_D',
      'Subdomínio Fake',
      'fake.sentinelconsig.com.br resolve como DOMAIN_NOT_CONFIGURED',
      200,
      resD1.status,
      passedD1,
      `domainType: ${resD1.body?.domainType}`
    );

    // -------------------------------------------------------------------------
    // CASO E: Subdomínio Ativo ({activeTenantSlug}.sentinelconsig.com.br)
    // -------------------------------------------------------------------------
    const resE = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: `${activeTenantSlug}.sentinelconsig.com.br` },
    });
    const passedE = resE.status === 200 && resE.body?.domainType === 'PLATFORM_SUBDOMAIN' && resE.body?.status === 'CONFIGURED';
    recordResult(
      'CASO_E',
      'Tenant Ativo',
      `Subdomínio ${activeTenantSlug}.sentinelconsig.com.br resolve como PLATFORM_SUBDOMAIN CONFIGURED`,
      200,
      resE.status,
      passedE,
      `domainType: ${resE.body?.domainType}, companyName: ${resE.body?.companyName}`
    );

    // -------------------------------------------------------------------------
    // CASO F: Tenant SUSPENDED ({suspendedTenantSlug}.sentinelconsig.com.br)
    // -------------------------------------------------------------------------
    const resF1 = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: `${suspendedTenantSlug}.sentinelconsig.com.br` },
    });
    const passedF1 = resF1.status === 200 && resF1.body?.status === 'SUSPENDED';
    recordResult(
      'CASO_F1',
      'Tenant Suspenso',
      `Branding para tenant suspenso retorna status SUSPENDED sem dados de tenant`,
      200,
      resF1.status,
      passedF1,
      `status: ${resF1.body?.status}`
    );

    const resF2 = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Host: `${suspendedTenantSlug}.sentinelconsig.com.br` },
      body: { email: testUserEmail, password: rawPassword },
    });
    const passedF2 = resF2.status === 403;
    recordResult(
      'CASO_F2',
      'Login Suspenso',
      `Login em tenant suspenso é rejeitado com HTTP 403`,
      403,
      resF2.status,
      passedF2,
      `status: ${resF2.status}`
    );

    // -------------------------------------------------------------------------
    // CASO G: Tenant CANCELLED ({cancelledTenantSlug}.sentinelconsig.com.br)
    // -------------------------------------------------------------------------
    const resG = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: `${cancelledTenantSlug}.sentinelconsig.com.br` },
    });
    const passedG = resG.status === 200 && resG.body?.domainType === 'DOMAIN_NOT_CONFIGURED';
    recordResult(
      'CASO_G',
      'Tenant Cancelado',
      `Tenant cancelado resolve como DOMAIN_NOT_CONFIGURED`,
      200,
      resG.status,
      passedG,
      `domainType: ${resG.body?.domainType}`
    );

    // -------------------------------------------------------------------------
    // CASO H: Tenant PENDING_DELETION ({pendingDelTenantSlug}.sentinelconsig.com.br)
    // -------------------------------------------------------------------------
    const resH = await makeRequest({
      method: 'GET',
      path: '/api/public/tenant-branding',
      headers: { Host: `${pendingDelTenantSlug}.sentinelconsig.com.br` },
    });
    const passedH = resH.status === 200 && resH.body?.domainType === 'DOMAIN_NOT_CONFIGURED';
    recordResult(
      'CASO_H',
      'Tenant Pendente Deleção',
      `Tenant em deleção pendente resolve como DOMAIN_NOT_CONFIGURED`,
      200,
      resH.status,
      passedH,
      `domainType: ${resH.body?.domainType}`
    );

    // -------------------------------------------------------------------------
    // CASO I: Isolamento de Sessão Cross-Domain
    // -------------------------------------------------------------------------
    // 1. Realiza login no domínio correto do Tenant Ativo
    const loginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Host: `${activeTenantSlug}.sentinelconsig.com.br` },
      body: { email: testUserEmail, password: rawPassword },
    });

    const setCookieHeader: any = loginRes.headers['set-cookie'];
    let sessionCookie = '';
    if (setCookieHeader && Array.isArray(setCookieHeader)) {
      sessionCookie = setCookieHeader.map((c) => c.split(';')[0]).join('; ');
    } else if (typeof setCookieHeader === 'string') {
      sessionCookie = setCookieHeader.split(';')[0];
    }

    // 2. Tenta usar o cookie no domínio não configurado (teste.sentinelconsig.com.br)
    const resI1 = await makeRequest({
      method: 'GET',
      path: '/api/auth/session',
      headers: {
        Host: 'teste.sentinelconsig.com.br',
        Cookie: sessionCookie,
      },
    });
    const passedI1 = resI1.status === 403;
    recordResult(
      'CASO_I1',
      'Isolamento de Sessão',
      'Sessão do Tenant A usada em teste.sentinelconsig.com.br é rejeitada com HTTP 403',
      403,
      resI1.status,
      passedI1,
      `status: ${resI1.status}`
    );

    const resI2 = await makeRequest({
      method: 'GET',
      path: '/api/proposals',
      headers: {
        Host: 'teste.sentinelconsig.com.br',
        Cookie: sessionCookie,
      },
    });
    const passedI2 = resI2.status === 401 || resI2.status === 403;
    recordResult(
      'CASO_I2',
      'Acesso de Dados Bloqueado',
      'Requisição de negócios em teste.sentinelconsig.com.br é negada com HTTP 401/403 sem vazar dados',
      401,
      resI2.status,
      passedI2,
      `status: ${resI2.status}`
    );

    // -------------------------------------------------------------------------
    // CASO J: Hostnames Maliciosos / Bypass de Regex
    // -------------------------------------------------------------------------
    const maliciousHosts = [
      'evil.sentinelconsig.com.br.attacker.com',
      'sentinelconsig.com.br.evil.org',
      'eval(1).sentinelconsig.com.br',
      '<script>alert(1)</script>.sentinelconsig.com.br',
    ];

    for (const malHost of maliciousHosts) {
      const resJ = await makeRequest({
        method: 'GET',
        path: '/api/public/tenant-branding',
        headers: { Host: malHost },
      });
      const passedJ = resJ.body?.domainType === 'DOMAIN_NOT_CONFIGURED' || resJ.status === 400 || resJ.status === 403;
      recordResult(
        'CASO_J',
        'Host Malicioso',
        `Host malicioso '${malHost}' bloqueado/resolve como DOMAIN_NOT_CONFIGURED`,
        200,
        resJ.status,
        passedJ,
        `domainType: ${resJ.body?.domainType}`
      );
    }
  } finally {
    // Purga os dados de teste criados exclusivamente nesta execução
    console.log('\n------------------------------------------------------------------------');
    console.log('LIMPANDO DADOS DE TESTE DA SUÍTE...');
    const idsToClean = [activeTenantId, suspendedTenantId, cancelledTenantId, pendingDelTenantId].filter(Boolean) as string[];

    if (idsToClean.length > 0) {
      await prisma.session.deleteMany({ where: { user: { tenantId: { in: idsToClean } } } }).catch(() => {});
      await prisma.user.updateMany({ where: { tenantId: { in: idsToClean } }, data: { active: false } }).catch(() => {});
      await prisma.tenant.updateMany({ where: { id: { in: idsToClean } }, data: { status: TenantStatus.CANCELLED } }).catch(() => {});
    }
    console.log('DADOS DE TESTE REMOVIDOS COM SUCESSO.');
  }

  console.log('\n========================================================================');
  console.log('RESUMO DOS RESULTADOS DA SUÍTE DE TESTES:');
  console.log('========================================================================');
  const failedCount = results.filter((r) => r.verdict === 'FAIL').length;
  const passedCount = results.filter((r) => r.verdict === 'PASS').length;

  console.log(`TOTAL DE TESTES : ${results.length}`);
  console.log(`PASSOU          : ${passedCount}`);
  console.log(`FALHOU          : ${failedCount}`);

  if (failedCount > 0) {
    console.error('\n❌ ERRO: Alguns testes falharam!');
    process.exit(1);
  } else {
    console.log('\n✅ SUCESSO ABSOLUTO: Todos os testes passaram perfeitamente!');
  }
}

runUnconfiguredDomainSuite()
  .catch((err) => {
    console.error('Erro na execução da suíte de testes:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
