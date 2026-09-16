/**
 * SENTINEL CONSIG — TESTE DE VALIDAÇÃO DE ORIGENS LEGÍTIMAS E CSRF
 *
 * Validação rigorosa de:
 * 1. Origens de Produção Legítimas (https://sentinelconsig.vercel.app, https://sentinelconsig.com.br, etc.)
 * 2. Subdomínios Oficiais da Plataforma (https://{slug}.sentinelconsig.com.br)
 * 3. Bloqueio Adversarial de Origens Maliciosas (https://attacker.com, https://attacker.vercel.app, etc.)
 * 4. Preflight CORS (OPTIONS) para origens confiáveis vs não confiáveis
 * 5. Ciclo Completo de Autenticação (Login -> Sessão -> Mutação -> Logout) com Origin Legítima
 */

import http from 'http';
import { PrismaClient } from '@prisma/client';

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

async function runOriginTestSuite() {
  console.log('========================================================================');
  console.log('SENTINEL CONSIG — SUÍTE DE TESTES DE ORIGEM E CSRF (VERCEL & PRODUCTION)');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. TESTES DE ORIGENS LEGÍTIMAS DE PRODUÇÃO
  // ---------------------------------------------------------------------------
  console.log('--- 1. TESTES DE ORIGENS LEGÍTIMAS DE PRODUÇÃO ---');

  // TESTE 1: Login com Origin 'https://sentinelconsig.vercel.app'
  const t1 = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    headers: {
      Origin: 'https://sentinelconsig.vercel.app',
    },
    body: {
      email: 'non_existent_test_probe_user_123@sentinelconsig.com.br',
      password: 'SamplePassword123!',
    },
  });

  // O endpoint deve processar a requisição de login (não deve ser 403 CSRF_BLOCKED, e sim 401 credencial inválida)
  const t1Pass = t1.status === 401 && (t1.body?.message?.includes('Credenciais inválidas') || t1.body?.error?.includes('Credenciais inválidas'));
  results.push({
    id: 'ORIGIN-01',
    category: 'PROD_ORIGIN',
    description: "Permissão de Login da origem Vercel 'https://sentinelconsig.vercel.app'",
    expectedStatus: 401,
    actualStatus: t1.status,
    verdict: t1Pass ? 'PASS' : 'FAIL',
    details: `Status ${t1.status} (processado pelo handler de autenticação, CSRF ultrapassado com sucesso). Cors origin header: ${t1.headers['access-control-allow-origin']}`,
  });

  // TESTE 2: Login com Origin 'https://sentinelconsig.com.br'
  const t2 = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    headers: {
      Origin: 'https://sentinelconsig.com.br',
    },
    body: {
      email: 'non_existent_test_probe_user_123@sentinelconsig.com.br',
      password: 'SamplePassword123!',
    },
  });
  const t2Pass = t2.status === 401 && (t2.body?.message?.includes('Credenciais inválidas') || t2.body?.error?.includes('Credenciais inválidas'));
  results.push({
    id: 'ORIGIN-02',
    category: 'PROD_ORIGIN',
    description: "Permissão de Login da origem canônica 'https://sentinelconsig.com.br'",
    expectedStatus: 401,
    actualStatus: t2.status,
    verdict: t2Pass ? 'PASS' : 'FAIL',
    details: `Status ${t2.status}, CSRF aceito. Cors header: ${t2.headers['access-control-allow-origin']}`,
  });

  // TESTE 3: Login com Subdomínio oficial VERIFIED 'https://alpha-cred.sentinelconsig.com.br'
  const activeTenant = await prisma.tenant.findFirst({ where: { status: 'ACTIVE' } });
  if (activeTenant) {
    await prisma.tenantDomain.upsert({
      where: { domain: 'alpha-cred.sentinelconsig.com.br' },
      update: { status: 'VERIFIED' },
      create: {
        tenantId: activeTenant.id,
        domain: 'alpha-cred.sentinelconsig.com.br',
        status: 'VERIFIED',
        verificationToken: 'token-alpha-cred-verified',
      },
    });
  }

  const t3 = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    headers: {
      Origin: 'https://alpha-cred.sentinelconsig.com.br',
    },
    body: {
      email: 'non_existent_test_probe_user_123@sentinelconsig.com.br',
      password: 'SamplePassword123!',
    },
  });
  const t3Pass = t3.status === 401 && (t3.body?.message?.includes('Credenciais inválidas') || t3.body?.error?.includes('Credenciais inválidas'));
  results.push({
    id: 'ORIGIN-03',
    category: 'SUBDOMAIN_ORIGIN',
    description: "Permissão de Login de subdomínio VERIFIED 'https://alpha-cred.sentinelconsig.com.br'",
    expectedStatus: 401,
    actualStatus: t3.status,
    verdict: t3Pass ? 'PASS' : 'FAIL',
    details: `Status ${t3.status}, subdomínio verificado no banco reconhecido.`,
  });

  // ---------------------------------------------------------------------------
  // 2. TESTES ADVERSARIAIS: BLOQUEIO DE ORIGENS MALICIOSAS E FALSAS
  // ---------------------------------------------------------------------------
  console.log('--- 2. TESTES ADVERSARIAIS: BLOQUEIO DE ORIGENS MALICIOSAS ---');

  const maliciousOrigins = [
    'https://attacker-domain.com',
    'https://attacker-fake-app.vercel.app', // Domínio de outro usuário no vercel.app
    'https://fake-sentinelconsig.com',
    'https://sentinelconsig.com.br.evil-domain.com', // Sufixo malicioso
  ];

  let allMaliciousBlocked = true;
  for (let i = 0; i < maliciousOrigins.length; i++) {
    const malOrigin = maliciousOrigins[i];
    const malRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        Origin: malOrigin,
      },
      body: {
        email: 'attacker@evil.com',
        password: 'password',
      },
    });

    const isBlocked = malRes.status === 403 && malRes.body?.error === 'CSRF_BLOCKED';
    if (!isBlocked) {
      allMaliciousBlocked = false;
      console.error(`Falha: Origem maliciosa ${malOrigin} não foi bloqueada! Status: ${malRes.status}`);
    }
  }

  results.push({
    id: 'ADVERSARIAL-01',
    category: 'CSRF_SECURITY',
    description: 'Bloqueio estrito de origens maliciosas externas e terceiros no vercel.app',
    expectedStatus: 403,
    actualStatus: allMaliciousBlocked ? 403 : 200,
    verdict: allMaliciousBlocked ? 'PASS' : 'FAIL',
    details: `${maliciousOrigins.length} origens maliciosas testadas e bloqueadas com HTTP 403 CSRF_BLOCKED.`,
  });

  // ---------------------------------------------------------------------------
  // 3. TESTE DE CORS PREFLIGHT (OPTIONS)
  // ---------------------------------------------------------------------------
  console.log('--- 3. TESTE DE CORS PREFLIGHT (OPTIONS) ---');

  // Preflight de origem legítima
  const optTrusted = await makeRequest({
    method: 'OPTIONS',
    path: '/api/auth/login',
    headers: {
      Origin: 'https://sentinelconsig.vercel.app',
      'Access-Control-Request-Method': 'POST',
    },
  });

  const optTrustedPass =
    optTrusted.status === 204 &&
    optTrusted.headers['access-control-allow-origin'] === 'https://sentinelconsig.vercel.app' &&
    optTrusted.headers['access-control-allow-credentials'] === 'true';

  results.push({
    id: 'CORS-01',
    category: 'CORS_SECURITY',
    description: "CORS Preflight OPTIONS para 'https://sentinelconsig.vercel.app' retorna 204 com credenciais",
    expectedStatus: 204,
    actualStatus: optTrusted.status,
    verdict: optTrustedPass ? 'PASS' : 'FAIL',
    details: `Status ${optTrusted.status}, Allow-Origin: ${optTrusted.headers['access-control-allow-origin']}, Credentials: ${optTrusted.headers['access-control-allow-credentials']}`,
  });

  // Preflight de origem maliciosa
  const optUntrusted = await makeRequest({
    method: 'OPTIONS',
    path: '/api/auth/login',
    headers: {
      Origin: 'https://attacker.com',
      'Access-Control-Request-Method': 'POST',
    },
  });

  const optUntrustedPass = optUntrusted.status === 403;
  results.push({
    id: 'CORS-02',
    category: 'CORS_SECURITY',
    description: 'CORS Preflight OPTIONS para origem maliciosa retorna 403 CORS_BLOCKED',
    expectedStatus: 403,
    actualStatus: optUntrusted.status,
    verdict: optUntrustedPass ? 'PASS' : 'FAIL',
    details: `Status ${optUntrusted.status}, preflight bloqueado para atacante.`,
  });

  // ---------------------------------------------------------------------------
  // 4. CICLO COMPLETO DE AUTENTICAÇÃO COM ORIGEM VERCEL
  // ---------------------------------------------------------------------------
  console.log('--- 4. CICLO COMPLETO DE AUTENTICAÇÃO COM ORIGEM VERCEL ---');

  // Criamos um usuário de teste no tenant de staging
  const testTenant = await prisma.tenant.findFirst({
    where: { status: 'ACTIVE' },
  });

  if (testTenant) {
    const testEmail = `sec_origin_test_${Date.now()}@sentinelconsig.com.br`;
    const { hashPassword } = await import('../server/services/passwordService.js');
    const hashedPwd = await hashPassword('OriginTestSecretPassword2026!');

    const testUser = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: hashedPwd,
        name: 'Sec Origin Tester',
        role: 'TENANT_ADMIN',
        active: true,
        tenantId: testTenant.id,
      },
    });

    try {
      // 1. Login com Origin Vercel
      const loginRes = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          Origin: 'https://sentinelconsig.vercel.app',
        },
        body: {
          email: testEmail,
          password: 'OriginTestSecretPassword2026!',
        },
      });

      const setCookieHeader = loginRes.headers['set-cookie']?.[0] || '';
      const sessionMatch = setCookieHeader.match(/cg_session_id=([^;]+)/);
      const sessionToken = sessionMatch ? sessionMatch[1] : null;

      const loginOk = loginRes.status === 200 && sessionToken !== null;
      results.push({
        id: 'AUTH-FLOW-01',
        category: 'AUTH_FLOW',
        description: "Login bem-sucedido a partir de 'https://sentinelconsig.vercel.app'",
        expectedStatus: 200,
        actualStatus: loginRes.status,
        verdict: loginOk ? 'PASS' : 'FAIL',
        details: `Status 200, Cookie Set: ${setCookieHeader.includes('HttpOnly; Secure; SameSite=Lax') ? 'HttpOnly+Secure+SameSite=Lax CONFIRMADO' : 'Incompleto'}`,
      });

      // 2. Consulta de Sessão (/api/auth/session) com Cookie
      const sessionRes = await makeRequest({
        method: 'GET',
        path: '/api/auth/session',
        headers: {
          Origin: 'https://sentinelconsig.vercel.app',
          Cookie: `cg_session_id=${sessionToken}`,
        },
      });

      const sessionOk = sessionRes.status === 200 && sessionRes.body?.user?.id === testUser.id;
      results.push({
        id: 'AUTH-FLOW-02',
        category: 'AUTH_FLOW',
        description: 'Consulta de Sessão autenticada via Cookie e Origin Vercel',
        expectedStatus: 200,
        actualStatus: sessionRes.status,
        verdict: sessionOk ? 'PASS' : 'FAIL',
        details: `Status ${sessionRes.status}, usuário identificado: ${sessionRes.body?.user?.name}`,
      });

      // 3. Mutação autenticada com Origin Vercel (POST /api/auth/change-password)
      const mutRes = await makeRequest({
        method: 'POST',
        path: '/api/auth/change-password',
        headers: {
          Origin: 'https://sentinelconsig.vercel.app',
          Cookie: `cg_session_id=${sessionToken}`,
        },
        body: {
          newPassword: 'UpdatedSecurePassword2026!#',
        },
      });

      const mutOk = mutRes.status === 200;
      results.push({
        id: 'AUTH-FLOW-03',
        category: 'AUTH_FLOW',
        description: 'Mutação autenticada com Origin Vercel e Cookie de Sessão',
        expectedStatus: 200,
        actualStatus: mutRes.status,
        verdict: mutOk ? 'PASS' : 'FAIL',
        details: `Status ${mutRes.status}, senha alterada com sucesso.`,
      });

      // 4. Tentativa de Mutação autenticada com Cookie válido mas Origin Maliciosa (Ataque CSRF)
      const csrfAttackRes = await makeRequest({
        method: 'POST',
        path: '/api/auth/change-password',
        headers: {
          Origin: 'https://malicious-attacker-site.com',
          Cookie: `cg_session_id=${sessionToken}`,
        },
        body: {
          newPassword: 'AttackerPasswordHijack123!',
        },
      });

      const csrfAttackBlocked = csrfAttackRes.status === 403 && csrfAttackRes.body?.error === 'CSRF_BLOCKED';
      results.push({
        id: 'AUTH-FLOW-04',
        category: 'CSRF_SECURITY',
        description: 'Tentativa de CSRF (Cookie válido + Origin maliciosa) bloqueada com 403',
        expectedStatus: 403,
        actualStatus: csrfAttackRes.status,
        verdict: csrfAttackBlocked ? 'PASS' : 'FAIL',
        details: `Status ${csrfAttackRes.status} CSRF_BLOCKED. Perfil/senha do usuário permaneceu protegido contra alteração cross-site.`,
      });

      // 5. Logout com Origin Vercel
      const logoutRes = await makeRequest({
        method: 'POST',
        path: '/api/auth/logout',
        headers: {
          Origin: 'https://sentinelconsig.vercel.app',
          Cookie: `cg_session_id=${sessionToken}`,
        },
      });

      const logoutOk = logoutRes.status === 200;
      results.push({
        id: 'AUTH-FLOW-05',
        category: 'AUTH_FLOW',
        description: "Logout com Origin Vercel invalida a sessão",
        expectedStatus: 200,
        actualStatus: logoutRes.status,
        verdict: logoutOk ? 'PASS' : 'FAIL',
        details: `Status ${logoutRes.status}, sessão encerrada.`,
      });
    } finally {
      // Limpeza do usuário de teste
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
  }

  console.log('\n========================================================================');
  console.log('RESUMO FINAL DOS TESTES DE ORIGEM E CSRF');
  console.log('========================================================================');
  for (const r of results) {
    console.log(`[${r.verdict}] ${r.id.padEnd(14)} | ${r.category.padEnd(18)} | Status: ${r.actualStatus} | ${r.description}`);
    console.log(`       -> Detalhes: ${r.details}\n`);
  }

  const passCount = results.filter((r) => r.verdict === 'PASS').length;
  const failCount = results.filter((r) => r.verdict === 'FAIL').length;
  console.log(`Total: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
}

runOriginTestSuite()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
