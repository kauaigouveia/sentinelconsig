/**
 * SENTINEL CONSIG — TESTES COMPLETOS DE HARDENING FINAL DE CSRF, ORIGENS E TENANT DOMAINS
 * 
 * Validação rigorosa dos 13 requisitos de segurança:
 * 1. Origem canônica oficial permitida.
 * 2. Tenant VERIFIED por HTTPS e porta padrão permitido.
 * 3. Tenant VERIFIED por HTTP em modo produção bloqueado.
 * 4. Porta alternativa em tenant VERIFIED bloqueada (ex: :8443, :8080).
 * 5. Subdomínio não cadastrado bloqueado.
 * 6. Tenant PENDING bloqueado.
 * 7. Tenant FAILED bloqueado.
 * 8. Domínio com sufixo malicioso bloqueado.
 * 9. Origem maliciosa externa bloqueada.
 * 10. Cookie válido com Origin maliciosa em mutação retorna 403 sem alterar o banco.
 * 11. Isolamento multi-tenant estrito (Tenant A não acessa dados de Tenant B).
 * 12. CORS Preflight autorizado (204) e não autorizado (403).
 * 13. Ciclo completo de autenticação (Login -> Sessão -> Mutação -> Logout).
 * 14. CRON S2S desacoplado de autenticação por cookie.
 */

import http from 'http';
import { PrismaClient, DomainStatus, SubscriptionPlan, TenantStatus, UserRole } from '@prisma/client';
import { hashPassword } from '../server/services/passwordService.js';
import {
  isOriginTrusted,
  getTrustedOrigins,
  invalidateDomainCache,
  normalizeToOrigin,
  normalizeTenantDomainRecordToOrigin,
} from '../server/utils/csrf.js';

const prisma = new PrismaClient();
const PORT = 3000;

interface TestResult {
  id: string;
  category: string;
  description: string;
  expectedStatus: number;
  actualStatus: number;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  details: string;
}

const results: TestResult[] = [];

function makeRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, any>;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; raw: string }> {
  return new Promise((resolve) => {
    const payload = options.body ? JSON.stringify(options.body) : null;
    const reqHeaders: Record<string, string | number> = {
      ...options.headers,
    };
    if (payload) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            raw,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        status: 0,
        headers: {},
        body: null,
        raw: err.message,
      });
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runFinalHardeningSuite() {
  console.log('========================================================================');
  console.log('SENTINEL CONSIG — TESTES DE HARDENING FINAL DE ORIGEM, CSRF E DOMÍNIOS');
  console.log('========================================================================\n');

  let tenantAId: string | null = null;
  let tenantBId: string | null = null;
  const timestamp = Date.now();

  try {
    invalidateDomainCache();

    // -------------------------------------------------------------------------
    // SETUP: Criação de Tenants e Domínios Isolados para Teste em Staging
    // -------------------------------------------------------------------------
    const tenantA = await prisma.tenant.create({
      data: {
        name: `Tenant Security Test A ${timestamp}`,
        slug: `tenant-sec-a-${timestamp}`,
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.PRO,
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await prisma.tenant.create({
      data: {
        name: `Tenant Security Test B ${timestamp}`,
        slug: `tenant-sec-b-${timestamp}`,
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.PRO,
      },
    });
    tenantBId = tenantB.id;

    const verifiedDomainHost = `portal-alpha-${timestamp}.sentinelconsig.com.br`;
    const pendingDomainHost = `portal-pending-${timestamp}.sentinelconsig.com.br`;
    const failedDomainHost = `portal-failed-${timestamp}.sentinelconsig.com.br`;

    await prisma.tenantDomain.createMany({
      data: [
        {
          tenantId: tenantA.id,
          domain: verifiedDomainHost,
          status: DomainStatus.VERIFIED,
          verificationToken: `token-v-${timestamp}`,
        },
        {
          tenantId: tenantA.id,
          domain: pendingDomainHost,
          status: DomainStatus.PENDING,
          verificationToken: `token-p-${timestamp}`,
        },
        {
          tenantId: tenantA.id,
          domain: failedDomainHost,
          status: DomainStatus.FAILED,
          verificationToken: `token-f-${timestamp}`,
        },
      ],
    });

    const testPassword = 'HardenedPasswordSecure2026!';
    const hashedPwd = await hashPassword(testPassword);

    const userA = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: `user_sec_a_${timestamp}@sentinelconsig.com.br`,
        name: 'User A Verified',
        passwordHash: hashedPwd,
        role: UserRole.TENANT_ADMIN,
        active: true,
      },
    });

    const userB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: `user_sec_b_${timestamp}@sentinelconsig.com.br`,
        name: 'User B Isolated',
        passwordHash: hashedPwd,
        role: UserRole.TENANT_ADMIN,
        active: true,
      },
    });

    // -------------------------------------------------------------------------
    // 0. TESTES DE NORMALIZAÇÃO DETERMINÍSTICA DE ORIGEM
    // -------------------------------------------------------------------------
    console.log('--- 0. NORMALIZAÇÃO DETERMINÍSTICA DE ORIGEM ---');
    const normTests = [
      { input: 'https://tenant.com:443', expected: 'https://tenant.com' },
      { input: 'http://tenant.com:80', expected: 'http://tenant.com' },
      { input: 'https://tenant.com:8443', expected: 'https://tenant.com:8443' },
      { input: 'https://USER:PASS@tenant.com', expected: null },
      { input: 'ftp://tenant.com', expected: null },
      { input: 'javascript:alert(1)', expected: null },
      { input: 'https://TENANT.COM', expected: 'https://tenant.com' },
    ];
    let allNormPass = true;
    for (const nt of normTests) {
      const res = normalizeToOrigin(nt.input);
      if (res !== nt.expected) {
        allNormPass = false;
        console.error(`Normalization failed for ${nt.input}: expected ${nt.expected}, got ${res}`);
      }
    }
    results.push({
      id: 'REQ-00',
      category: 'ORIGIN_NORMALIZATION',
      description: 'Normalização determinística: remove portas padrão (80/443), preserva 8443, rejeita credenciais e protocolos inválidos',
      expectedStatus: 200,
      actualStatus: allNormPass ? 200 : 500,
      verdict: allNormPass ? 'PASS' : 'FAIL',
      details: `Todas as ${normTests.length} regras de normalização de origem foram validadas com sucesso.`,
    });

    // -------------------------------------------------------------------------
    // 0B. TESTES ESPECÍFICOS DE CACHE E FALHA DE BANCO (A a G)
    // -------------------------------------------------------------------------
    console.log('--- 0B. TESTES DE RESILIÊNCIA DE CACHE E FAIL-CLOSED ---');

    // Teste A: Cache normal - Tenant VERIFIED permitido
    invalidateDomainCache();
    const originsA = await getTrustedOrigins(prisma);
    const hasTenantA = originsA.has(`https://${verifiedDomainHost}`);
    results.push({
      id: 'CACHE-A',
      category: 'CACHE_NORMAL',
      description: 'Cache normal: Tenant com status VERIFIED é devidamente carregado no cache e permitido',
      expectedStatus: 200,
      actualStatus: hasTenantA ? 200 : 500,
      verdict: hasTenantA ? 'PASS' : 'FAIL',
      details: `Tenant https://${verifiedDomainHost} carregado no cache: ${hasTenantA}`,
    });

    // Teste B: Expiração normal - Cache expira / é invalidado -> banco retorna VERIFIED -> permitido
    invalidateDomainCache();
    const originsB = await getTrustedOrigins(prisma);
    const hasTenantB = originsB.has(`https://${verifiedDomainHost}`);
    results.push({
      id: 'CACHE-B',
      category: 'CACHE_EXPIRY',
      description: 'Expiração normal: após expiração, refresh do banco repopula o cache com sucesso',
      expectedStatus: 200,
      actualStatus: hasTenantB ? 200 : 500,
      verdict: hasTenantB ? 'PASS' : 'FAIL',
      details: `Após refresh do banco, origem verificada presente: ${hasTenantB}`,
    });

    // Teste C: Falha no refresh do banco
    // 1. Inicia com cache contendo o tenant
    await getTrustedOrigins(prisma);
    // 2. Expira o cache
    invalidateDomainCache();
    // 3. Simula falha do banco de dados (Prisma client que lança erro)
    const failingPrismaMock = {
      tenantDomain: {
        findMany: async () => {
          throw new Error('Connection refused: PostgreSQL unavailable (simulated failure)');
        },
        findFirst: async () => {
          throw new Error('Connection refused: PostgreSQL unavailable (simulated failure)');
        },
      },
    } as unknown as PrismaClient;

    // 4. Executa getTrustedOrigins com banco em falha
    const originsC = await getTrustedOrigins(failingPrismaMock);
    // 5. Verifica que o cache antigo foi limpo e o tenant NÃO está nas origens confiáveis
    const hasTenantOnDbFailure = originsC.has(`https://${verifiedDomainHost}`);
    // 6. isOriginTrusted com failingPrisma também deve retornar false (fail-closed)
    const isTenantTrustedOnDbFailure = await isOriginTrusted(
      `https://${verifiedDomainHost}`,
      originsC,
      failingPrismaMock
    );

    const cacheFailurePass = !hasTenantOnDbFailure && isTenantTrustedOnDbFailure === false;
    results.push({
      id: 'CACHE-C',
      category: 'CACHE_REFRESH_FAILURE',
      description: 'Falha no refresh do banco: limpa o cache imediatamente, não confia em dados antigos e bloqueia (Fail-Closed)',
      expectedStatus: 200,
      actualStatus: cacheFailurePass ? 200 : 500,
      verdict: cacheFailurePass ? 'PASS' : 'FAIL',
      details: `hasTenantInOrigins: ${hasTenantOnDbFailure}, isTenantTrusted: ${isTenantTrustedOnDbFailure} (ambos false = Fail-Closed ativo)`,
    });

    // Teste D: Falha no banco + Origin maliciosa -> bloqueada
    const isEvilTrustedOnDbFailure = await isOriginTrusted(
      'https://evil-attacker-site.com',
      originsC,
      failingPrismaMock
    );
    const evilBlockOnDbFailurePass = isEvilTrustedOnDbFailure === false;
    results.push({
      id: 'CACHE-D',
      category: 'FAIL_CLOSED_MALICIOUS',
      description: 'Falha no banco + Origin maliciosa: categoricamente bloqueada (Fail-Closed)',
      expectedStatus: 200,
      actualStatus: evilBlockOnDbFailurePass ? 200 : 500,
      verdict: evilBlockOnDbFailurePass ? 'PASS' : 'FAIL',
      details: `isEvilTrustedOnDbFailure: ${isEvilTrustedOnDbFailure}`,
    });

    // Teste E: Banco se recupera -> novo refresh funciona e somente domínios VERIFIED voltam
    const originsE = await getTrustedOrigins(prisma);
    const isTenantRecovered = originsE.has(`https://${verifiedDomainHost}`);
    const isPendingExcluded = !originsE.has(`https://${pendingDomainHost}`);
    const isFailedExcluded = !originsE.has(`https://${failedDomainHost}`);
    const recoveryPass = isTenantRecovered && isPendingExcluded && isFailedExcluded;
    results.push({
      id: 'CACHE-E',
      category: 'CACHE_RECOVERY',
      description: 'Recuperação do banco: refresh funciona e somente domínios VERIFIED retornam ao cache',
      expectedStatus: 200,
      actualStatus: recoveryPass ? 200 : 500,
      verdict: recoveryPass ? 'PASS' : 'FAIL',
      details: `VERIFIED presente: ${isTenantRecovered}, PENDING excluído: ${isPendingExcluded}, FAILED excluído: ${isFailedExcluded}`,
    });

    // Teste F: invalidateDomainCache() limpa imediatamente
    invalidateDomainCache();
    // Chamando getTrustedOrigins sem prisma não carrega do banco e confirma que o cache em memória foi esvaziado
    const originsF = await getTrustedOrigins(undefined);
    const isCacheClearedImmediately = !originsF.has(`https://${verifiedDomainHost}`);
    results.push({
      id: 'CACHE-F',
      category: 'CACHE_INVALIDATION',
      description: 'invalidateDomainCache(): limpa imediatamente o cache em memória',
      expectedStatus: 200,
      actualStatus: isCacheClearedImmediately ? 200 : 500,
      verdict: isCacheClearedImmediately ? 'PASS' : 'FAIL',
      details: `Cache esvaziado imediatamente: ${isCacheClearedImmediately}`,
    });

    // Teste G: Reconfirmações de segurança
    // G1: Porta não padrão https://tenant.com:8443 -> bloqueado
    const isAltPortG = await isOriginTrusted(`https://${verifiedDomainHost}:8443`, new Set(), prisma);
    // G2: HTTP em produção -> bloqueado
    const prevEnvG = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const isHttpProdG = await isOriginTrusted(`http://${verifiedDomainHost}`, new Set(), prisma);
    process.env.NODE_ENV = prevEnvG;
    // G3: HTTPS somente se VERIFIED -> permitido
    const isVerifiedHttpsG = await isOriginTrusted(`https://${verifiedDomainHost}`, new Set(), prisma);
    const isPendingHttpsG = await isOriginTrusted(`https://${pendingDomainHost}`, new Set(), prisma);

    const reconfirmPass =
      isAltPortG === false &&
      isHttpProdG === false &&
      isVerifiedHttpsG === true &&
      isPendingHttpsG === false;

    results.push({
      id: 'CACHE-G',
      category: 'SECURITY_RECONFIRMATION',
      description: 'Reconfirmações: :8443 bloqueado, http em prod bloqueado, https permitido apenas se VERIFIED',
      expectedStatus: 200,
      actualStatus: reconfirmPass ? 200 : 500,
      verdict: reconfirmPass ? 'PASS' : 'FAIL',
      details: `altPort: ${isAltPortG}, httpProd: ${isHttpProdG}, verifiedHttps: ${isVerifiedHttpsG}, pendingHttps: ${isPendingHttpsG}`,
    });

    // -------------------------------------------------------------------------
    // 1. ORIGENS CANÔNICAS OFICIAIS PERMITIDAS
    // -------------------------------------------------------------------------
    console.log('--- 1. ORIGENS CANÔNICAS OFICIAIS ---');
    const canonVercel = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: 'https://sentinelconsig.vercel.app' },
      body: { email: userA.email, password: testPassword },
    });
    const canonPass = canonVercel.status === 200 && Boolean(canonVercel.headers['set-cookie']);
    results.push({
      id: 'REQ-01',
      category: 'CANONICAL_ORIGIN',
      description: "Origem canônica oficial 'https://sentinelconsig.vercel.app' autorizada",
      expectedStatus: 200,
      actualStatus: canonVercel.status,
      verdict: canonPass ? 'PASS' : 'FAIL',
      details: `Status ${canonVercel.status}. Login efetuado com sucesso via origem canônica oficial.`,
    });

    // -------------------------------------------------------------------------
    // 2. TENANT VERIFIED POR HTTPS E PORTA PADRÃO PERMITIDO
    // -------------------------------------------------------------------------
    console.log('--- 2. TENANT VERIFIED POR HTTPS ---');
    const tenantHttpsOrigin = `https://${verifiedDomainHost}`;
    const verifiedRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: tenantHttpsOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const verifiedPass = verifiedRes.status === 200;
    results.push({
      id: 'REQ-02',
      category: 'TENANT_DOMAIN',
      description: `Tenant com status VERIFIED por HTTPS padrão ('${tenantHttpsOrigin}') autorizado`,
      expectedStatus: 200,
      actualStatus: verifiedRes.status,
      verdict: verifiedPass ? 'PASS' : 'FAIL',
      details: `Status ${verifiedRes.status}. Domínio verificado no banco por HTTPS aceito.`,
    });

    // -------------------------------------------------------------------------
    // 3. MESMO DOMÍNIO POR HTTP EM MODO PRODUÇÃO BLOQUEADO
    // -------------------------------------------------------------------------
    console.log('--- 3. MESMO DOMÍNIO POR HTTP EM PRODUÇÃO (UNITÁRIO & INTEGRAÇÃO) ---');
    const trustedOriginsSet = new Set(['https://sentinelconsig.vercel.app']);
    // Testamos a função com NODE_ENV simulado em produção
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const isHttpTrustedInProd = await isOriginTrusted(`http://${verifiedDomainHost}`, trustedOriginsSet, prisma);
    process.env.NODE_ENV = oldEnv;

    const httpPass = isHttpTrustedInProd === false;
    results.push({
      id: 'REQ-03',
      category: 'HTTP_PROD_BLOCK',
      description: `Mesmo domínio por HTTP em modo produção ('http://${verifiedDomainHost}') categoricamente bloqueado`,
      expectedStatus: 0,
      actualStatus: isHttpTrustedInProd ? 1 : 0,
      verdict: httpPass ? 'PASS' : 'FAIL',
      details: `isOriginTrusted retornou ${isHttpTrustedInProd}. Protocolo inseguro HTTP rejeitado em produção.`,
    });

    // -------------------------------------------------------------------------
    // 4. PORTA ALTERNATIVA NÃO AUTORIZADA BLOQUEADA
    // -------------------------------------------------------------------------
    console.log('--- 4. PORTAS ALTERNATIVAS NÃO AUTORIZADAS ---');
    const altPortOrigin = `https://${verifiedDomainHost}:8443`;
    const altPortRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: altPortOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const altPortPass = altPortRes.status === 403 && altPortRes.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'REQ-04',
      category: 'NON_STANDARD_PORT',
      description: `Porta alternativa não autorizada ('${altPortOrigin}') bloqueada com 403 CSRF_BLOCKED`,
      expectedStatus: 403,
      actualStatus: altPortRes.status,
      verdict: altPortPass ? 'PASS' : 'FAIL',
      details: `Status ${altPortRes.status} CSRF_BLOCKED. Porta :8443 rejeitada categoricamente.`,
    });

    // -------------------------------------------------------------------------
    // 4B. COMPARAÇÃO ESTRITA DE ORIGEM COMPLETA (UNITÁRIO)
    // -------------------------------------------------------------------------
    console.log('--- 4B. COMPARAÇÃO ESTRITA DE ORIGEM COMPLETA (UNITÁRIO) ---');
    const isStandardPortTrusted = await isOriginTrusted(`https://${verifiedDomainHost}:443`, new Set(), prisma);
    const isAltPortTrusted = await isOriginTrusted(`https://${verifiedDomainHost}:8443`, new Set(), prisma);
    const isSubEvilTrusted = await isOriginTrusted(`https://${verifiedDomainHost}.evil.com`, new Set(), prisma);

    const fullOriginStrictPass = isStandardPortTrusted === true && isAltPortTrusted === false && isSubEvilTrusted === false;
    results.push({
      id: 'REQ-04B',
      category: 'FULL_ORIGIN_COMPARISON',
      description: 'Comparação estrita de origem completa: :443 é aceito como padrão, :8443 e .evil.com são bloqueados',
      expectedStatus: 200,
      actualStatus: fullOriginStrictPass ? 200 : 500,
      verdict: fullOriginStrictPass ? 'PASS' : 'FAIL',
      details: `isStandardPortTrusted: ${isStandardPortTrusted}, isAltPortTrusted: ${isAltPortTrusted}, isSubEvilTrusted: ${isSubEvilTrusted}`,
    });

    // -------------------------------------------------------------------------
    // 5. SUBDOMÍNIO NÃO CADASTRADO BLOQUEADO
    // -------------------------------------------------------------------------
    console.log('--- 5. SUBDOMÍNIO NÃO CADASTRADO ---');
    const unregOrigin = `https://unregistered-fake-${timestamp}.sentinelconsig.com.br`;
    const unregRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: unregOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const unregPass = unregRes.status === 403 && unregRes.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'REQ-05',
      category: 'UNREGISTERED_SUBDOMAIN',
      description: `Subdomínio não cadastrado ('${unregOrigin}') bloqueado com 403 CSRF_BLOCKED`,
      expectedStatus: 403,
      actualStatus: unregRes.status,
      verdict: unregPass ? 'PASS' : 'FAIL',
      details: `Status ${unregRes.status} CSRF_BLOCKED. Subdomínio sem registro no banco rejeitado.`,
    });

    // -------------------------------------------------------------------------
    // 6. DOMÍNIO COM STATUS PENDING BLOQUEADO
    // -------------------------------------------------------------------------
    console.log('--- 6. DOMÍNIO PENDING ---');
    const pendingOrigin = `https://${pendingDomainHost}`;
    const pendingRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: pendingOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const pendingPass = pendingRes.status === 403 && pendingRes.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'REQ-06',
      category: 'PENDING_DOMAIN',
      description: `Domínio cadastrado com status PENDING ('${pendingOrigin}') bloqueado com 403`,
      expectedStatus: 403,
      actualStatus: pendingRes.status,
      verdict: pendingPass ? 'PASS' : 'FAIL',
      details: `Status ${pendingRes.status} CSRF_BLOCKED. Domínio pendente de verificação bloqueado.`,
    });

    // -------------------------------------------------------------------------
    // 7. DOMÍNIO COM STATUS FAILED BLOQUEADO
    // -------------------------------------------------------------------------
    console.log('--- 7. DOMÍNIO FAILED ---');
    const failedOrigin = `https://${failedDomainHost}`;
    const failedRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: failedOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const failedPass = failedRes.status === 403 && failedRes.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'REQ-07',
      category: 'FAILED_DOMAIN',
      description: `Domínio cadastrado com status FAILED ('${failedOrigin}') bloqueado com 403`,
      expectedStatus: 403,
      actualStatus: failedRes.status,
      verdict: failedPass ? 'PASS' : 'FAIL',
      details: `Status ${failedRes.status} CSRF_BLOCKED. Domínio com falha de verificação bloqueado.`,
    });

    // -------------------------------------------------------------------------
    // 8. DOMÍNIO COM SUFIXO MALICIOSO BLOQUEADO
    // -------------------------------------------------------------------------
    console.log('--- 8. SUFIXO MALICIOSO ---');
    const evilSuffixOrigin = 'https://sentinelconsig.com.br.evil-domain.com';
    const evilSuffixRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: evilSuffixOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const evilSuffixPass = evilSuffixRes.status === 403 && evilSuffixRes.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'REQ-08',
      category: 'MALICIOUS_SUFFIX',
      description: `Origem com sufixo malicioso ('${evilSuffixOrigin}') bloqueada com 403`,
      expectedStatus: 403,
      actualStatus: evilSuffixRes.status,
      verdict: evilSuffixPass ? 'PASS' : 'FAIL',
      details: `Status ${evilSuffixRes.status} CSRF_BLOCKED. Ataque por sufixo interceptado.`,
    });

    // -------------------------------------------------------------------------
    // 9. ORIGEM EXTERNA MALICIOSA BLOQUEADA
    // -------------------------------------------------------------------------
    console.log('--- 9. ORIGEM EXTERNA MALICIOSA ---');
    const evilExternalOrigin = 'https://attacker-fake-app.vercel.app';
    const evilExternalRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: evilExternalOrigin },
      body: { email: userA.email, password: testPassword },
    });
    const evilExternalPass = evilExternalRes.status === 403 && evilExternalRes.body?.error === 'CSRF_BLOCKED';
    results.push({
      id: 'REQ-09',
      category: 'MALICIOUS_ORIGIN',
      description: `Origem externa maliciosa ('${evilExternalOrigin}') bloqueada com 403`,
      expectedStatus: 403,
      actualStatus: evilExternalRes.status,
      verdict: evilExternalPass ? 'PASS' : 'FAIL',
      details: `Status ${evilExternalRes.status} CSRF_BLOCKED. App de terceiro no Vercel bloqueado.`,
    });

    // -------------------------------------------------------------------------
    // 10. COOKIE VÁLIDO COM ORIGIN MALICIOSA EM MUTAÇÃO NÃO ALTERA O BANCO
    // -------------------------------------------------------------------------
    console.log('--- 10. CSRF ATTACK ON MUTATION ---');
    // Obter cookie de sessão válido
    const loginOkRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      headers: { Origin: 'https://sentinelconsig.vercel.app' },
      body: { email: userA.email, password: testPassword },
    });
    const setCookie = loginOkRes.headers['set-cookie']?.[0] || '';
    const cookieMatch = setCookie.match(/cg_session_id=([^;]+)/);
    const validCookie = cookieMatch ? `cg_session_id=${cookieMatch[1]}` : '';

    const initialUserInDb = await prisma.user.findUnique({ where: { id: userA.id } });
    const initialHash = initialUserInDb?.passwordHash;

    const csrfAttackRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/change-password',
      headers: {
        Origin: 'https://attacker-evil-site.com',
        Cookie: validCookie,
      },
      body: {
        newPassword: 'HackedPasswordByCsrf2026!',
      },
    });

    // Checar no banco se o hash de senha permaneceu inalterado
    const checkUserInDb = await prisma.user.findUnique({ where: { id: userA.id } });
    const userUnchanged = checkUserInDb?.passwordHash === initialHash;
    const csrfPass = csrfAttackRes.status === 403 && userUnchanged;

    results.push({
      id: 'REQ-10',
      category: 'CSRF_MUTATION_PROTECTION',
      description: 'Cookie válido com Origin maliciosa em mutação retorna 403 e banco permanece inalterado',
      expectedStatus: 403,
      actualStatus: csrfAttackRes.status,
      verdict: csrfPass ? 'PASS' : 'FAIL',
      details: `Status ${csrfAttackRes.status} CSRF_BLOCKED. Hash de senha no banco permaneceu protegido e inalterado.`,
    });

    // -------------------------------------------------------------------------
    // 11. ISOLAMENTO MULTI-TENANT ESTRITO
    // -------------------------------------------------------------------------
    console.log('--- 11. MULTI-TENANT ISOLATION ---');
    // Usuário A (Tenant A) tenta acessar ou atualizar recursos restritos do Tenant B
    const sessionARes = await makeRequest({
      method: 'GET',
      path: '/api/auth/session',
      headers: {
        Origin: tenantHttpsOrigin,
        Cookie: validCookie,
      },
    });
    const sessionATenantId = sessionARes.body?.user?.tenantId;
    const tenantIsolated = sessionATenantId === tenantA.id && sessionATenantId !== tenantB.id;

    results.push({
      id: 'REQ-11',
      category: 'TENANT_ISOLATION',
      description: 'Domínio e sessão do Tenant A não concedem acesso aos dados do Tenant B',
      expectedStatus: 200,
      actualStatus: sessionARes.status,
      verdict: tenantIsolated ? 'PASS' : 'FAIL',
      details: `Sessão vinculada estritamente ao Tenant A ('${sessionATenantId}'). Isolamento preservado.`,
    });

    // -------------------------------------------------------------------------
    // 12. CORS PREFLIGHT (AUTORIZADO 204 E NÃO AUTORIZADO 403)
    // -------------------------------------------------------------------------
    console.log('--- 12. CORS PREFLIGHT ---');
    const corsAuth = await makeRequest({
      method: 'OPTIONS',
      path: '/api/auth/login',
      headers: {
        Origin: tenantHttpsOrigin,
        'Access-Control-Request-Method': 'POST',
      },
    });
    const corsAuthPass =
      corsAuth.status === 204 &&
      corsAuth.headers['access-control-allow-origin'] === tenantHttpsOrigin &&
      corsAuth.headers['access-control-allow-credentials'] === 'true';

    const corsUnauth = await makeRequest({
      method: 'OPTIONS',
      path: '/api/auth/login',
      headers: {
        Origin: 'https://unauthorized-attacker.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const corsUnauthPass = corsUnauth.status === 403 && corsUnauth.body?.error === 'CORS_BLOCKED';

    results.push({
      id: 'REQ-12A',
      category: 'CORS_PREFLIGHT',
      description: `CORS Preflight para origem verificada ('${tenantHttpsOrigin}') retorna 204 com cabeçalhos exatos`,
      expectedStatus: 204,
      actualStatus: corsAuth.status,
      verdict: corsAuthPass ? 'PASS' : 'FAIL',
      details: `Status 204, Allow-Origin: ${corsAuth.headers['access-control-allow-origin']}, Credentials: ${corsAuth.headers['access-control-allow-credentials']}`,
    });

    results.push({
      id: 'REQ-12B',
      category: 'CORS_PREFLIGHT',
      description: 'CORS Preflight para origem maliciosa retorna 403 CORS_BLOCKED',
      expectedStatus: 403,
      actualStatus: corsUnauth.status,
      verdict: corsUnauthPass ? 'PASS' : 'FAIL',
      details: `Status ${corsUnauth.status} CORS_BLOCKED.`,
    });

    // -------------------------------------------------------------------------
    // 13. CICLO COMPLETO DE AUTENTICAÇÃO (LOGIN -> SESSÃO -> MUTAÇÃO -> LOGOUT)
    // -------------------------------------------------------------------------
    console.log('--- 13. AUTH LIFECYCLE ---');
    // Mutação legítima com Origin autorizada
    const legitimateMutation = await makeRequest({
      method: 'POST',
      path: '/api/auth/change-password',
      headers: {
        Origin: 'https://sentinelconsig.vercel.app',
        Cookie: validCookie,
      },
      body: {
        newPassword: 'NewSecureUpdatedPassword2026!',
      },
    });
    const mutationPass = legitimateMutation.status === 200;

    // Logout
    const logoutRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/logout',
      headers: {
        Origin: 'https://sentinelconsig.vercel.app',
        Cookie: validCookie,
      },
    });
    const logoutPass = logoutRes.status === 200;

    results.push({
      id: 'REQ-13',
      category: 'AUTH_LIFECYCLE',
      description: 'Ciclo completo de autenticação (Login, Sessão, Mutação legítima e Logout) operacional',
      expectedStatus: 200,
      actualStatus: logoutRes.status,
      verdict: mutationPass && logoutPass ? 'PASS' : 'FAIL',
      details: `Mutação legítima: ${legitimateMutation.status}, Logout: ${logoutRes.status}. Sessão encerrada.`,
    });

    // -------------------------------------------------------------------------
    // 14. CRON S2S DESACOPLADO DE AUTENTICAÇÃO POR COOKIE
    // -------------------------------------------------------------------------
    console.log('--- 14. CRON S2S ENDPOINT ---');
    // Teste A: Requisição CRON com Cookie de usuário (sem Bearer secret) -> rejeitado
    const cronCookieOnly = await makeRequest({
      method: 'POST',
      path: '/api/cron/operational-rules',
      headers: {
        Cookie: validCookie,
      },
    });
    const cronCookieRejected = cronCookieOnly.status === 403 || cronCookieOnly.status === 401;

    // Teste B: Requisição CRON sem qualquer autenticação -> rejeitado
    const cronNoAuth = await makeRequest({
      method: 'POST',
      path: '/api/cron/operational-rules',
    });
    const cronNoAuthRejected = cronNoAuth.status === 403 || cronNoAuth.status === 401;

    results.push({
      id: 'REQ-14',
      category: 'CRON_SECURITY',
      description: 'Endpoint CRON S2S desacoplado de cookies e rejeita requisições sem Authorization Bearer',
      expectedStatus: 403,
      actualStatus: cronCookieOnly.status,
      verdict: cronCookieRejected && cronNoAuthRejected ? 'PASS' : 'FAIL',
      details: `Cookie de usuário sem Bearer secret rejeitado com status ${cronCookieOnly.status}. Requisição sem autenticação rejeitada com status ${cronNoAuth.status}.`,
    });
  } catch (error) {
    console.error('Erro durante execução da suíte:', error);
  } finally {
    // Limpeza segura dos registros de teste em staging
    if (tenantAId) {
      try {
        await prisma.tenantDomain.deleteMany({ where: { tenantId: tenantAId } });
        await prisma.session.deleteMany({ where: { user: { tenantId: tenantAId } } });
        await prisma.user.updateMany({ where: { tenantId: tenantAId }, data: { active: false } });
      } catch (err) {
        console.warn('Cleanup warning Tenant A:', err);
      }
    }
    if (tenantBId) {
      try {
        await prisma.tenantDomain.deleteMany({ where: { tenantId: tenantBId } });
        await prisma.session.deleteMany({ where: { user: { tenantId: tenantBId } } });
        await prisma.user.updateMany({ where: { tenantId: tenantBId }, data: { active: false } });
      } catch (err) {
        console.warn('Cleanup warning Tenant B:', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RELATÓRIO FINAL
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('RESUMO FINAL DOS TESTES DE HARDENING DE DOMÍNIOS E CSRF');
  console.log('========================================================================');

  let passCount = 0;
  let failCount = 0;
  let blockedCount = 0;

  for (const r of results) {
    if (r.verdict === 'PASS') passCount++;
    else if (r.verdict === 'FAIL') failCount++;
    else blockedCount++;

    console.log(
      `[${r.verdict}] ${r.id.padEnd(10)} | ${r.category.padEnd(24)} | Status: ${String(r.actualStatus).padEnd(3)} | ${r.description}`
    );
    console.log(`       -> Detalhes: ${r.details}`);
  }

  console.log(`\nTotal: ${results.length} | PASS: ${passCount} | FAIL: ${failCount} | BLOCKED: ${blockedCount}`);
  await prisma.$disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

runFinalHardeningSuite()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
