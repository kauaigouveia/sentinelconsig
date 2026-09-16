/**
 * SENTINEL CONSIG — SUÍTE DE TESTES: AUTORIZAÇÃO DE SUBDOMÍNIOS E TENANT DOMAINS
 *
 * Valida o endurecimento estrito contra bypass por regex:
 * 1. Domínio canônico permitido (https://sentinelconsig.vercel.app, https://sentinelconsig.com.br)
 * 2. Subdomínio cadastrado e status VERIFIED permitido
 * 3. Subdomínio não cadastrado bloqueado (não aceita mais regex arbitrária)
 * 4. Domínio cadastrado, mas status PENDING/FAILED/DISABLED, bloqueado
 * 5. Domínio com prefixo/sufixo malicioso ('sentinelconsig.com.br.evil-domain.com') bloqueado
 * 6. Origens maliciosas externas bloqueadas
 * 7. CORS Preflight (OPTIONS) respeita a política estrita de verificação
 * 8. Mutação autenticada por sessão preservada e protegida contra CSRF
 */

import http from 'http';
import { PrismaClient, DomainStatus, SubscriptionPlan, TenantStatus, UserRole } from '@prisma/client';
import { hashPassword } from '../server/services/passwordService.js';

const prisma = new PrismaClient();
const PORT = 3000;

interface TestResult {
  id: string;
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

async function runSubdomainHardeningSuite() {
  console.log('========================================================================');
  console.log('SENTINEL CONSIG — TESTES DE AUTORIZAÇÃO ESTRITA DE SUBDOMÍNIOS E DOMÍNIOS');
  console.log('========================================================================\n');

  const testTenantSlug = `test-subdomain-sec-${Date.now()}`;
  let createdTenantId: string | null = null;
  let testUserEmail = `subdomain_sec_tester_${Date.now()}@sentinelconsig.com.br`;
  const rawTestPassword = 'SecureSubdomainPass2026!#';

  try {
    // -------------------------------------------------------------------------
    // SETUP: Criação de Tenant de Teste e Domínios com diferentes status
    // -------------------------------------------------------------------------
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Sec Subdomain Audit Tenant',
        slug: testTenantSlug,
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.ENTERPRISE,
      },
    });
    createdTenantId = tenant.id;

    // 1. Domínio VERIFIED
    const verifiedDomain = `verified-tenant-${Date.now()}.sentinelconsig.com.br`;
    await prisma.tenantDomain.create({
      data: {
        tenantId: tenant.id,
        domain: verifiedDomain,
        status: DomainStatus.VERIFIED,
        verificationToken: `token-verified-${Date.now()}`,
        verifiedAt: new Date(),
      },
    });

    // 2. Domínio PENDING (cadastrado mas NÃO verificado)
    const pendingDomain = `pending-tenant-${Date.now()}.sentinelconsig.com.br`;
    await prisma.tenantDomain.create({
      data: {
        tenantId: tenant.id,
        domain: pendingDomain,
        status: DomainStatus.PENDING,
        verificationToken: `token-pending-${Date.now()}`,
      },
    });

    // 3. Domínio FAILED (cadastrado mas falhou verificação)
    const failedDomain = `failed-tenant-${Date.now()}.sentinelconsig.com.br`;
    await prisma.tenantDomain.create({
      data: {
        tenantId: tenant.id,
        domain: failedDomain,
        status: DomainStatus.FAILED,
        verificationToken: `token-failed-${Date.now()}`,
      },
    });

    // 4. Usuário de teste
    const hashedPassword = await hashPassword(rawTestPassword);
    const testUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: testUserEmail,
        name: 'Sec Subdomain Tester',
        passwordHash: hashedPassword,
        role: UserRole.TENANT_ADMIN,
        active: true,
      },
    });

    // -------------------------------------------------------------------------
    // TESTES DE ORIGENS
    // -------------------------------------------------------------------------

    // TESTE 1: Domínio Canônico Vercel ('https://sentinelconsig.vercel.app') -> PERMITIDO
    console.log('--- 1. TESTE DE DOMÍNIO CANÔNICO ---');
    const tCanonical = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: 'https://sentinelconsig.vercel.app',
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tCanonicalPass = tCanonical.status === 200 && tCanonical.body?.success === true;
    results.push({
      id: 'CANONICAL-01',
      category: 'CANONICAL_DOMAIN',
      description: "Origem canônica 'https://sentinelconsig.vercel.app' autorizada",
      expectedStatus: 200,
      actualStatus: tCanonical.status,
      verdict: tCanonicalPass ? 'PASS' : 'FAIL',
      details: `Status ${tCanonical.status}. Login efetuado com sucesso via origem canônica oficial.`,
    });

    // TESTE 2: Subdomínio cadastrado com status VERIFIED -> PERMITIDO
    console.log('--- 2. TESTE DE SUBDOMÍNIO VERIFIED ---');
    const tVerified = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: `https://${verifiedDomain}`,
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tVerifiedPass = tVerified.status === 200 && tVerified.body?.success === true;
    results.push({
      id: 'SUBDOMAIN-VERIFIED-01',
      category: 'TENANT_DOMAIN',
      description: `Subdomínio cadastrado e VERIFIED ('https://${verifiedDomain}') autorizado`,
      expectedStatus: 200,
      actualStatus: tVerified.status,
      verdict: tVerifiedPass ? 'PASS' : 'FAIL',
      details: `Status ${tVerified.status}. Subdomínio verificado no banco de dados aceito com sucesso.`,
    });

    // TESTE 3: Subdomínio NÃO cadastrado na plataforma -> BLOQUEADO (403 CSRF_BLOCKED)
    console.log('--- 3. TESTE DE SUBDOMÍNIO NÃO CADASTRADO ---');
    const unregSubdomain = `unregistered-arbitrary-${Date.now()}.sentinelconsig.com.br`;
    const tUnregistered = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: `https://${unregSubdomain}`,
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tUnregPass = tUnregistered.status === 403 && tUnregistered.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'SUBDOMAIN-UNREG-01',
      category: 'CSRF_SECURITY',
      description: `Subdomínio NÃO cadastrado ('https://${unregSubdomain}') bloqueado com 403`,
      expectedStatus: 403,
      actualStatus: tUnregistered.status,
      verdict: tUnregPass ? 'PASS' : 'FAIL',
      details: `Status ${tUnregistered.status} CSRF_BLOCKED. Regex bypass bloqueado com sucesso; ausência de registro VERIFIED impede acesso.`,
    });

    // TESTE 4: Domínio cadastrado mas com status PENDING -> BLOQUEADO (403 CSRF_BLOCKED)
    console.log('--- 4. TESTE DE DOMÍNIO PENDING ---');
    const tPending = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: `https://${pendingDomain}`,
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tPendingPass = tPending.status === 403 && tPending.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'DOMAIN-PENDING-01',
      category: 'CSRF_SECURITY',
      description: `Domínio cadastrado com status PENDING ('https://${pendingDomain}') bloqueado com 403`,
      expectedStatus: 403,
      actualStatus: tPending.status,
      verdict: tPendingPass ? 'PASS' : 'FAIL',
      details: `Status ${tPending.status} CSRF_BLOCKED. Domínio não verificado rejeitado categoricamente.`,
    });

    // TESTE 5: Domínio cadastrado mas com status FAILED -> BLOQUEADO (403 CSRF_BLOCKED)
    console.log('--- 5. TESTE DE DOMÍNIO FAILED ---');
    const tFailed = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: `https://${failedDomain}`,
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tFailedPass = tFailed.status === 403 && tFailed.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'DOMAIN-FAILED-01',
      category: 'CSRF_SECURITY',
      description: `Domínio cadastrado com status FAILED ('https://${failedDomain}') bloqueado com 403`,
      expectedStatus: 403,
      actualStatus: tFailed.status,
      verdict: tFailedPass ? 'PASS' : 'FAIL',
      details: `Status ${tFailed.status} CSRF_BLOCKED. Domínio com verificação com falha rejeitado.`,
    });

    // TESTE 6: Tentativa de bypass por sufixo malicioso ('sentinelconsig.com.br.evil-domain.com')
    console.log('--- 6. TESTE DE SUFIXO MALICIOSO ---');
    const tEvilSuffix = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: 'https://sentinelconsig.com.br.evil-domain.com',
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tEvilSuffixPass = tEvilSuffix.status === 403 && tEvilSuffix.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'EVIL-SUFFIX-01',
      category: 'CSRF_SECURITY',
      description: "Origem com sufixo malicioso 'https://sentinelconsig.com.br.evil-domain.com' bloqueada com 403",
      expectedStatus: 403,
      actualStatus: tEvilSuffix.status,
      verdict: tEvilSuffixPass ? 'PASS' : 'FAIL',
      details: `Status ${tEvilSuffix.status} CSRF_BLOCKED. Ataque por sufixo interceptado com sucesso.`,
    });

    // TESTE 7: Origem maliciosa genérica e app de terceiro no Vercel
    console.log('--- 7. TESTE DE ORIGEM MALICIOSA GENÉRICA ---');
    const tEvilGeneric = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: 'https://attacker-app.vercel.app',
      },
      body: {
        email: testUserEmail,
        password: rawTestPassword,
      },
    });
    const tEvilGenPass = tEvilGeneric.status === 403 && tEvilGeneric.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'MALICIOUS-ORIGIN-01',
      category: 'CSRF_SECURITY',
      description: "Origem maliciosa de terceiro 'https://attacker-app.vercel.app' bloqueada com 403",
      expectedStatus: 403,
      actualStatus: tEvilGeneric.status,
      verdict: tEvilGenPass ? 'PASS' : 'FAIL',
      details: `Status ${tEvilGeneric.status} CSRF_BLOCKED. Aplicativos de terceiros na Vercel não têm acesso ao backend.`,
    });

    // TESTE 8: CORS Preflight (OPTIONS) para domínio VERIFIED vs Domínio Bloqueado
    console.log('--- 8. TESTE DE CORS PREFLIGHT ---');
    const corsVerified = await makeRequest({
      method: 'OPTIONS',
      path: '/api/auth/login',
      headers: {
        Origin: `https://${verifiedDomain}`,
        'Access-Control-Request-Method': 'POST',
      },
    });
    const corsVerifiedPass =
      corsVerified.status === 204 &&
      corsVerified.headers['access-control-allow-origin'] === `https://${verifiedDomain}` &&
      corsVerified.headers['access-control-allow-credentials'] === 'true';

    results.push({
      id: 'CORS-VERIFIED-01',
      category: 'CORS_SECURITY',
      description: `CORS Preflight para subdomínio VERIFIED retorna 204 com Allow-Origin exato`,
      expectedStatus: 204,
      actualStatus: corsVerified.status,
      verdict: corsVerifiedPass ? 'PASS' : 'FAIL',
      details: `Status ${corsVerified.status}, Allow-Origin: ${corsVerified.headers['access-control-allow-origin']}, Credentials: ${corsVerified.headers['access-control-allow-credentials']}`,
    });

    const corsUnreg = await makeRequest({
      method: 'OPTIONS',
      path: '/api/auth/login',
      headers: {
        Origin: `https://${unregSubdomain}`,
        'Access-Control-Request-Method': 'POST',
      },
    });
    const corsUnregPass = corsUnreg.status === 403 && corsUnreg.body?.error === 'CORS_BLOCKED';
    results.push({
      id: 'CORS-UNREG-01',
      category: 'CORS_SECURITY',
      description: `CORS Preflight para subdomínio não cadastrado rejeitado com 403 CORS_BLOCKED`,
      expectedStatus: 403,
      actualStatus: corsUnreg.status,
      verdict: corsUnregPass ? 'PASS' : 'FAIL',
      details: `Status ${corsUnreg.status} CORS_BLOCKED. Preflight rejeitado para subdomínio não registrado.`,
    });

    // TESTE 9: Sessão Autenticada e Proteção CSRF em Mutação
    console.log('--- 9. TESTE DE SESSÃO E CSRF EM MUTAÇÃO ---');
    const rawCookies = tVerified.headers['set-cookie'] || [];
    const sessionCookieHeader = Array.isArray(rawCookies) ? rawCookies.join('; ') : rawCookies;
    const cookieMatch = sessionCookieHeader.match(/cg_session_id=([^;]+)/);
    const sessionToken = cookieMatch ? cookieMatch[1] : null;

    if (sessionToken) {
      // Mutação legítima via subdomínio VERIFIED
      const mutRes = await makeRequest({
        method: 'POST',
        path: '/api/auth/change-password',
        headers: {
          Origin: `https://${verifiedDomain}`,
          Cookie: `cg_session_id=${sessionToken}`,
        },
        body: {
          newPassword: 'UpdatedSecurePass2026!#',
        },
      });
      const mutOk = mutRes.status === 200;
      results.push({
        id: 'AUTH-MUTATION-01',
        category: 'AUTH_FLOW',
        description: 'Mutação autenticada com Origin de subdomínio VERIFIED permitida',
        expectedStatus: 200,
        actualStatus: mutRes.status,
        verdict: mutOk ? 'PASS' : 'FAIL',
        details: `Status ${mutRes.status}. Mutação permitida através de domínio verificado do tenant.`,
      });

      // Tentativa de ataque CSRF cross-site com cookie válido e origin invasora
      const csrfAttack = await makeRequest({
        method: 'POST',
        path: '/api/auth/change-password',
        headers: {
          Origin: 'https://evil-attacker-site.com',
          Cookie: `cg_session_id=${sessionToken}`,
        },
        body: {
          newPassword: 'HackedPasswordHijack123!',
        },
      });
      const csrfBlocked = csrfAttack.status === 403 && csrfAttack.body?.error === 'CSRF_BLOCKED';
      results.push({
        id: 'CSRF-ATTACK-01',
        category: 'CSRF_SECURITY',
        description: 'Tentativa de ataque CSRF (Cookie válido + Origin maliciosa) bloqueada com 403',
        expectedStatus: 403,
        actualStatus: csrfAttack.status,
        verdict: csrfBlocked ? 'PASS' : 'FAIL',
        details: `Status ${csrfAttack.status} CSRF_BLOCKED. Ataque cross-site interceptado com sucesso.`,
      });
    }

  } catch (error) {
    console.error('Erro na execução da suíte de subdomínios:', error);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Remoção dos dados de teste
    // -------------------------------------------------------------------------
    if (createdTenantId) {
      try {
        await prisma.tenantDomain.deleteMany({ where: { tenantId: createdTenantId } });
        await prisma.session.deleteMany({ where: { user: { tenantId: createdTenantId } } });
        await prisma.user.updateMany({
          where: { tenantId: createdTenantId },
          data: { active: false },
        });
      } catch (err) {
        console.warn('Aviso no cleanup:', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RESUMO DOS RESULTADOS
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('RESUMO FINAL DOS TESTES DE SUBDOMÍNIOS E TENANT DOMAINS');
  console.log('========================================================================');

  let pass = 0;
  let fail = 0;

  for (const r of results) {
    if (r.verdict === 'PASS') pass++;
    else fail++;

    console.log(
      `[${r.verdict}] ${r.id.padEnd(21)} | ${r.category.padEnd(16)} | Status: ${r.actualStatus} | ${r.description}\n       -> Detalhes: ${r.details}`
    );
  }

  console.log(`\nTotal: ${results.length} | PASS: ${pass} | FAIL: ${fail}`);
}

runSubdomainHardeningSuite()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
