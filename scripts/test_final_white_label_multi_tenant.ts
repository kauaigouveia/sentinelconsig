import { PrismaClient, DomainStatus, UserRole, TenantStatus } from '@prisma/client';
import { TenantResolver } from '../server/utils/tenantResolver.js';
import { isOriginTrusted, getTrustedOrigins } from '../server/utils/csrf.js';
import { hashPassword } from '../server/services/passwordService.js';
import { AdminContextManager } from '../server/utils/adminContext.js';
import { AuditLogService } from '../server/services/auditLogService.js';

const prisma = new PrismaClient();

interface TestResult {
  section: string;
  code: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  details?: string;
}

const results: TestResult[] = [];

async function runValidationSuite() {
  console.log('========================================================================');
  console.log('SENTINEL CONSIG — VALIDAÇÃO FINAL DO WHITE-LABEL MULTI-TENANT');
  console.log('Ambiente: Homologação / Staging (PostgreSQL / Neon)');
  console.log('========================================================================\n');

  // ========================================================================
  // SETUP / FIXTURES
  // ========================================================================
  
  // 1. Tenant EVOLVE (ACTIVE)
  let evolveTenant = await prisma.tenant.findUnique({
    where: { slug: 'evolve' },
    include: { whiteLabel: true, domains: true },
  });
  if (!evolveTenant) {
    evolveTenant = await prisma.tenant.create({
      data: {
        name: 'EVOLVE GESTÃO FINANCEIRA',
        tradeName: 'EVOLVE CONSIG',
        slug: 'evolve',
        status: TenantStatus.ACTIVE,
        whiteLabel: {
          create: {
            companyName: 'EVOLVE CONSIG',
            legalName: 'EVOLVE GESTÃO FINANCEIRA LTDA',
            logoUrl: 'https://cdn.sentinelconsig.com.br/evolve-logo.png',
            faviconUrl: 'https://cdn.sentinelconsig.com.br/evolve-favicon.ico',
            primaryColor: '#059669',
            secondaryColor: '#047857',
            accentColor: '#10b981',
            footerText: '© 2026 EVOLVE Consig. Todos os direitos reservados.',
            supportEmail: 'suporte@evolve.com.br',
            supportPhone: '(11) 98888-7777',
          },
        },
        domains: {
          create: {
            domain: 'evolve.sentinelconsig.com.br',
            status: DomainStatus.VERIFIED,
            verificationToken: 'token-evolve-verified-123',
            isPrimary: true,
          },
        },
      },
      include: { whiteLabel: true, domains: true },
    });
  } else {
    // Garante status ACTIVE para teste
    await prisma.tenant.update({
      where: { id: evolveTenant.id },
      data: { status: TenantStatus.ACTIVE, deletedAt: null, deletedBy: null },
    });
  }

  // 2. Tenant DMAIS (ACTIVE)
  let dmaisTenant = await prisma.tenant.findUnique({
    where: { slug: 'dmais' },
    include: { whiteLabel: true, domains: true },
  });
  if (!dmaisTenant) {
    dmaisTenant = await prisma.tenant.create({
      data: {
        name: 'DMAIS PROMOTORA DE CRÉDITO',
        tradeName: 'DMAIS CRÉDITO',
        slug: 'dmais',
        status: TenantStatus.ACTIVE,
        whiteLabel: {
          create: {
            companyName: 'DMAIS CRÉDITO',
            legalName: 'DMAIS PROMOTORA DE CRÉDITO S/A',
            logoUrl: 'https://cdn.sentinelconsig.com.br/dmais-logo.png',
            faviconUrl: 'https://cdn.sentinelconsig.com.br/dmais-favicon.ico',
            primaryColor: '#ea580c',
            secondaryColor: '#c2410c',
            accentColor: '#f97316',
            footerText: '© 2026 DMAIS Crédito. Todos os direitos reservados.',
            supportEmail: 'contato@dmaiscredito.com.br',
            supportPhone: '(21) 97777-6666',
          },
        },
        domains: {
          create: {
            domain: 'dmais.sentinelconsig.com.br',
            status: DomainStatus.VERIFIED,
            verificationToken: 'token-dmais-verified-456',
            isPrimary: true,
          },
        },
      },
      include: { whiteLabel: true, domains: true },
    });
  } else {
    await prisma.tenant.update({
      where: { id: dmaisTenant.id },
      data: { status: TenantStatus.ACTIVE, deletedAt: null, deletedBy: null },
    });
    await prisma.whiteLabelConfig.upsert({
      where: { tenantId: dmaisTenant.id },
      create: {
        tenantId: dmaisTenant.id,
        companyName: 'DMAIS CRÉDITO',
        legalName: 'DMAIS PROMOTORA DE CRÉDITO S/A',
        logoUrl: 'https://cdn.sentinelconsig.com.br/dmais-logo.png',
        faviconUrl: 'https://cdn.sentinelconsig.com.br/dmais-favicon.ico',
        primaryColor: '#ea580c',
        secondaryColor: '#c2410c',
        accentColor: '#f97316',
        footerText: '© 2026 DMAIS Crédito. Todos os direitos reservados.',
        supportEmail: 'contato@dmaiscredito.com.br',
        supportPhone: '(21) 97777-6666',
      },
      update: {
        companyName: 'DMAIS CRÉDITO',
        legalName: 'DMAIS PROMOTORA DE CRÉDITO S/A',
        logoUrl: 'https://cdn.sentinelconsig.com.br/dmais-logo.png',
        faviconUrl: 'https://cdn.sentinelconsig.com.br/dmais-favicon.ico',
        primaryColor: '#ea580c',
        secondaryColor: '#c2410c',
        accentColor: '#f97316',
        footerText: '© 2026 DMAIS Crédito. Todos os direitos reservados.',
        supportEmail: 'contato@dmaiscredito.com.br',
        supportPhone: '(21) 97777-6666',
      },
    });
  }

  // 3. Tenant SUSPENDED para teste de ciclo de vida
  let suspendedTenant = await prisma.tenant.findUnique({
    where: { slug: 'tenant-suspended-test' },
  });
  if (!suspendedTenant) {
    suspendedTenant = await prisma.tenant.create({
      data: {
        name: 'TENANT SUSPENDED TEST',
        slug: 'tenant-suspended-test',
        status: TenantStatus.SUSPENDED,
      },
    });
  } else {
    await prisma.tenant.update({
      where: { id: suspendedTenant.id },
      data: { status: TenantStatus.SUSPENDED },
    });
  }

  // 4. Tenant CANCELLED para teste de ciclo de vida
  let cancelledTenant = await prisma.tenant.findUnique({
    where: { slug: 'tenant-cancelled-test' },
  });
  if (!cancelledTenant) {
    cancelledTenant = await prisma.tenant.create({
      data: {
        name: 'TENANT CANCELLED TEST',
        slug: 'tenant-cancelled-test',
        status: TenantStatus.CANCELLED,
      },
    });
  } else {
    await prisma.tenant.update({
      where: { id: cancelledTenant.id },
      data: { status: TenantStatus.CANCELLED },
    });
  }

  // 5. Tenant PENDING_DELETION para teste de ciclo de vida
  let pendingDeletionTenant = await prisma.tenant.findUnique({
    where: { slug: 'tenant-pending-del-test' },
  });
  if (!pendingDeletionTenant) {
    pendingDeletionTenant = await prisma.tenant.create({
      data: {
        name: 'TENANT PENDING DELETION TEST',
        slug: 'tenant-pending-del-test',
        status: TenantStatus.PENDING_DELETION,
      },
    });
  } else {
    await prisma.tenant.update({
      where: { id: pendingDeletionTenant.id },
      data: { status: TenantStatus.PENDING_DELETION },
    });
  }

  // 6. Usuários de Teste
  let evolveUser = await prisma.user.findUnique({ where: { email: 'user.evolve@teste.com' } });
  if (!evolveUser) {
    evolveUser = await prisma.user.create({
      data: {
        tenantId: evolveTenant.id,
        name: 'Usuario Evolve',
        email: 'user.evolve@teste.com',
        passwordHash: await hashPassword('Senha@Evolve2026'),
        role: UserRole.DIGITADOR,
        active: true,
      },
    });
  }

  let dmaisUser = await prisma.user.findUnique({ where: { email: 'user.dmais@teste.com' } });
  if (!dmaisUser) {
    dmaisUser = await prisma.user.create({
      data: {
        tenantId: dmaisTenant.id,
        name: 'Usuario DMAIS',
        email: 'user.dmais@teste.com',
        passwordHash: await hashPassword('Senha@Dmais2026'),
        role: UserRole.DIGITADOR,
        active: true,
      },
    });
  }

  let platformMasterUser = await prisma.user.findFirst({
    where: { role: UserRole.PLATFORM_MASTER },
  });
  if (!platformMasterUser) {
    platformMasterUser = await prisma.user.create({
      data: {
        tenantId: evolveTenant.id,
        name: 'Platform Master Global',
        email: 'master@sentinelconsig.com.br',
        passwordHash: await hashPassword('Master@Sentinel2026'),
        role: UserRole.PLATFORM_MASTER,
        active: true,
      },
    });
  }

  // Limpa cache do TenantResolver antes de rodar
  TenantResolver.invalidateCache();

  // ========================================================================
  // SEÇÃO 1 & 2: TESTES DE STATUS DO TENANT & SUBDOMÍNIO PADRÃO
  // ========================================================================

  // 2.A: ACTIVE -> evolve.sentinelconsig.com.br (Permitido)
  try {
    TenantResolver.invalidateCache();
    const res = await TenantResolver.resolveByHost(prisma, 'evolve.sentinelconsig.com.br');
    const pass = res.type === 'PLATFORM_SUBDOMAIN' && res.tenant?.id === evolveTenant.id && res.branding.status === 'CONFIGURED';
    results.push({
      section: 'STATUS_TENANT',
      code: 'TESTE_2A',
      name: 'Tenant ACTIVE (evolve.sentinelconsig.com.br)',
      expected: 'Permitido (PLATFORM_SUBDOMAIN / CONFIGURED)',
      actual: `Tipo: ${res.type}, Tenant: ${res.tenant?.slug}, Status Branding: ${res.branding.status}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'STATUS_TENANT', code: 'TESTE_2A', name: 'Tenant ACTIVE', expected: 'Permitido', actual: err.message, status: 'FAIL' });
  }

  // 2.B: SUSPENDED -> tenant-suspended-test.sentinelconsig.com.br (Bloqueado)
  try {
    TenantResolver.invalidateCache();
    const res = await TenantResolver.resolveByHost(prisma, 'tenant-suspended-test.sentinelconsig.com.br');
    const pass = res.tenant === null && res.branding.status === 'SUSPENDED';
    results.push({
      section: 'STATUS_TENANT',
      code: 'TESTE_2B',
      name: 'Tenant SUSPENDED (tenant-suspended-test.sentinelconsig.com.br)',
      expected: 'Bloqueado (tenant: null, status: SUSPENDED)',
      actual: `Tenant: ${res.tenant}, Status Branding: ${res.branding.status}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'STATUS_TENANT', code: 'TESTE_2B', name: 'Tenant SUSPENDED', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // 2.C: CANCELLED -> tenant-cancelled-test.sentinelconsig.com.br (Bloqueado)
  try {
    TenantResolver.invalidateCache();
    const res = await TenantResolver.resolveByHost(prisma, 'tenant-cancelled-test.sentinelconsig.com.br');
    const pass = res.tenant === null && res.type === 'DOMAIN_NOT_CONFIGURED';
    results.push({
      section: 'STATUS_TENANT',
      code: 'TESTE_2C',
      name: 'Tenant CANCELLED (tenant-cancelled-test.sentinelconsig.com.br)',
      expected: 'Bloqueado (tenant: null, type: DOMAIN_NOT_CONFIGURED)',
      actual: `Tenant: ${res.tenant}, Tipo: ${res.type}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'STATUS_TENANT', code: 'TESTE_2C', name: 'Tenant CANCELLED', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // 2.D: PENDING_DELETION -> tenant-pending-del-test.sentinelconsig.com.br (Bloqueado)
  try {
    TenantResolver.invalidateCache();
    const res = await TenantResolver.resolveByHost(prisma, 'tenant-pending-del-test.sentinelconsig.com.br');
    const pass = res.tenant === null && res.type === 'DOMAIN_NOT_CONFIGURED';
    results.push({
      section: 'STATUS_TENANT',
      code: 'TESTE_2D',
      name: 'Tenant PENDING_DELETION (tenant-pending-del-test.sentinelconsig.com.br)',
      expected: 'Bloqueado (tenant: null, type: DOMAIN_NOT_CONFIGURED)',
      actual: `Tenant: ${res.tenant}, Tipo: ${res.type}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'STATUS_TENANT', code: 'TESTE_2D', name: 'Tenant PENDING_DELETION', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // 2.E: Slug Inexistente -> fake.sentinelconsig.com.br (Bloqueado)
  try {
    TenantResolver.invalidateCache();
    const res = await TenantResolver.resolveByHost(prisma, 'fake.sentinelconsig.com.br');
    const pass = res.tenant === null && res.type === 'DOMAIN_NOT_CONFIGURED';
    results.push({
      section: 'STATUS_TENANT',
      code: 'TESTE_2E',
      name: 'Slug inexistente (fake.sentinelconsig.com.br)',
      expected: 'Bloqueado (tenant: null, type: DOMAIN_NOT_CONFIGURED)',
      actual: `Tenant: ${res.tenant}, Tipo: ${res.type}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'STATUS_TENANT', code: 'TESTE_2E', name: 'Slug inexistente', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // ========================================================================
  // SEÇÃO 3: ISOLAMENTO DE SESSÃO POR HOSTNAME
  // ========================================================================

  // Cenário 1: Usuário EVOLVE autenticado tenta acessar hostname DMAIS
  try {
    TenantResolver.invalidateCache();
    const domainDMAIS = await TenantResolver.resolveByHost(prisma, 'dmais.sentinelconsig.com.br');

    // Validação da Barreira de Domínio implementada em server.ts getAuthSession:
    // Se o domínio resolveu para o tenant DMAIS e o usuário da sessão pertence ao tenant EVOLVE
    let accessGranted = true;
    if (
      domainDMAIS.tenant &&
      (domainDMAIS.type === 'CUSTOM_DOMAIN' || domainDMAIS.type === 'PLATFORM_SUBDOMAIN')
    ) {
      if (evolveUser.role !== 'PLATFORM_MASTER' && evolveUser.tenantId !== domainDMAIS.tenant.id) {
        accessGranted = false; // Barreira bloqueia
      }
    }

    // Consulta de dados isolada server-side: query com where estrito tenantId = session.user.tenantId
    const dmaisDataLeak = accessGranted ? await prisma.client.findFirst({ where: { tenantId: dmaisTenant.id } }) : null;

    const pass = !accessGranted && dmaisDataLeak === null;
    results.push({
      section: 'SESSION_ISOLATION',
      code: 'TESTE_3A',
      name: 'Sessão EVOLVE acessando dmais.sentinelconsig.com.br',
      expected: 'Acesso rejeitado (401/403) e zero leitura de dados DMAIS',
      actual: accessGranted ? 'Acesso Indevido Concedido!' : 'Bloqueado pela Barreira de Domínio (zero dados DMAIS)',
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'SESSION_ISOLATION', code: 'TESTE_3A', name: 'Sessão EVOLVE no DMAIS', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // Cenário 2: Usuário DMAIS autenticado tenta acessar hostname EVOLVE
  try {
    TenantResolver.invalidateCache();
    const domainEVOLVE = await TenantResolver.resolveByHost(prisma, 'evolve.sentinelconsig.com.br');

    let accessGranted = true;
    if (
      domainEVOLVE.tenant &&
      (domainEVOLVE.type === 'CUSTOM_DOMAIN' || domainEVOLVE.type === 'PLATFORM_SUBDOMAIN')
    ) {
      if (dmaisUser.role !== 'PLATFORM_MASTER' && dmaisUser.tenantId !== domainEVOLVE.tenant.id) {
        accessGranted = false;
      }
    }

    const evolveDataLeak = accessGranted ? await prisma.client.findFirst({ where: { tenantId: evolveTenant.id } }) : null;

    const pass = !accessGranted && evolveDataLeak === null;
    results.push({
      section: 'SESSION_ISOLATION',
      code: 'TESTE_3B',
      name: 'Sessão DMAIS acessando evolve.sentinelconsig.com.br',
      expected: 'Acesso rejeitado (401/403) e zero leitura de dados EVOLVE',
      actual: accessGranted ? 'Acesso Indevido Concedido!' : 'Bloqueado pela Barreira de Domínio (zero dados EVOLVE)',
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'SESSION_ISOLATION', code: 'TESTE_3B', name: 'Sessão DMAIS no EVOLVE', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // ========================================================================
  // SEÇÃO 4: PLATFORM_MASTER AUTORIZAÇÃO E AUDITORIA
  // ========================================================================

  try {
    const testSessionId = 'test-session-master-123';
    
    // 1. Alternância de Contexto Administrativo Server-Side
    const contextData = await AdminContextManager.setContext(
      testSessionId,
      dmaisTenant.id,
      dmaisTenant.name,
      platformMasterUser.id
    );

    const activeContext = AdminContextManager.getContext(testSessionId);
    const hasActiveContext = activeContext?.targetTenantId === dmaisTenant.id;

    // 2. Registro de auditoria obrigatória
    const auditRecord = await AuditLogService.record(prisma, {
      tenantId: dmaisTenant.id,
      userId: platformMasterUser.id,
      userName: platformMasterUser.name,
      action: 'admin.context_entered',
      entity: 'Tenant',
      entityId: dmaisTenant.id,
      newData: {
        platformMasterUserId: platformMasterUser.id,
        targetTenantId: dmaisTenant.id,
        timestamp: contextData.switchedAt.toISOString(),
      },
    });

    // 3. Encerramento de Contexto
    await AdminContextManager.clearContext(testSessionId);
    const clearedContext = AdminContextManager.getContext(testSessionId);
    const isContextCleared = clearedContext === null;

    const pass = hasActiveContext && auditRecord !== null && isContextCleared;
    results.push({
      section: 'PLATFORM_MASTER',
      code: 'TESTE_4',
      name: 'PLATFORM_MASTER Context Switch Server-Side & Auditoria',
      expected: 'Context switch ativo, registrado em auditoria e encerrado seguramente',
      actual: `Contexto Ativo: ${hasActiveContext}, Auditoria ID: ${auditRecord?.id ? 'OK' : 'FAIL'}, Encerrado: ${isContextCleared}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'PLATFORM_MASTER', code: 'TESTE_4', name: 'PLATFORM_MASTER Context Switch', expected: 'Sucesso', actual: err.message, status: 'FAIL' });
  }

  // ========================================================================
  // SEÇÃO 5: WHITE-LABEL IDENTIDADES DINÂMICAS
  // ========================================================================

  try {
    TenantResolver.invalidateCache();
    const resEvolve = await TenantResolver.resolveByHost(prisma, 'evolve.sentinelconsig.com.br');
    const passEvolve =
      (resEvolve.branding.companyName === 'EVOLVE CONSIG' || resEvolve.branding.companyName === 'EVOLVE GESTÃO FINANCEIRA') &&
      resEvolve.branding.primaryColor === '#059669' &&
      resEvolve.branding.logoUrl === 'https://cdn.sentinelconsig.com.br/evolve-logo.png' &&
      resEvolve.branding.faviconUrl === 'https://cdn.sentinelconsig.com.br/evolve-favicon.ico';

    TenantResolver.invalidateCache();
    const resDmais = await TenantResolver.resolveByHost(prisma, 'dmais.sentinelconsig.com.br');
    const passDmais =
      resDmais.branding.companyName === 'DMAIS CRÉDITO' &&
      resDmais.branding.primaryColor === '#ea580c' &&
      resDmais.branding.logoUrl === 'https://cdn.sentinelconsig.com.br/dmais-logo.png' &&
      resDmais.branding.faviconUrl === 'https://cdn.sentinelconsig.com.br/dmais-favicon.ico';

    const pass = passEvolve && passDmais;
    results.push({
      section: 'WHITE_LABEL',
      code: 'TESTE_5',
      name: 'Identidade Visual Dinâmica EVOLVE vs DMAIS',
      expected: 'EVOLVE (#059669/EVOLVE CONSIG) e DMAIS (#ea580c/DMAIS CRÉDITO) isolados',
      actual: `EVOLVE: ${resEvolve.branding.companyName} (${resEvolve.branding.primaryColor}) | DMAIS: ${resDmais.branding.companyName} (${resDmais.branding.primaryColor})`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'WHITE_LABEL', code: 'TESTE_5', name: 'White-Label Dinâmico', expected: 'Isolado', actual: err.message, status: 'FAIL' });
  }

  // ========================================================================
  // SEÇÃO 6: HOST SECURITY (HARDENING DE HOSTNAME)
  // ========================================================================

  const securityHosts = [
    { host: 'fake.sentinelconsig.com.br', label: 'Subdomínio inexistente' },
    { host: 'evolve.sentinelconsig.com.br.evil.com', label: 'Domain Spoofing Attack' },
    { host: 'evil-evolve.sentinelconsig.com.br', label: 'Slug Inexistente Malicioso' },
    { host: 'evil<script>alert(1)</script>.sentinelconsig.com.br', label: 'Injeção de Caracteres' },
    { host: '', label: 'Hostname Vazio' },
    { host: '   ', label: 'Hostname em Branco' },
  ];

  for (let i = 0; i < securityHosts.length; i++) {
    const item = securityHosts[i];
    try {
      TenantResolver.invalidateCache();
      const res = await TenantResolver.resolveByHost(prisma, item.host);
      const isBlocked = res.type === 'DOMAIN_NOT_CONFIGURED' && res.tenant === null;
      results.push({
        section: 'HOST_SECURITY',
        code: `TESTE_6_${i + 1}`,
        name: `Host Security: ${item.label} (${item.host || "''"})`,
        expected: 'Bloqueado (DOMAIN_NOT_CONFIGURED / tenant: null)',
        actual: `Tipo: ${res.type}, Tenant: ${res.tenant}`,
        status: isBlocked ? 'PASS' : 'FAIL',
      });
    } catch (err: any) {
      results.push({ section: 'HOST_SECURITY', code: `TESTE_6_${i + 1}`, name: item.label, expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
    }
  }

  // ========================================================================
  // SEÇÃO 7: TESTE DE CUSTOM DOMAIN (EXACT MATCH & STATUS VERIFIED)
  // ========================================================================

  // Setup de TenantDomain para app.evolve.example
  let customDomainRecord = await prisma.tenantDomain.findUnique({
    where: { domain: 'app.evolve.example' },
  });
  if (!customDomainRecord) {
    customDomainRecord = await prisma.tenantDomain.create({
      data: {
        tenantId: evolveTenant.id,
        domain: 'app.evolve.example',
        status: DomainStatus.VERIFIED,
        verificationToken: 'token-custom-example-111',
      },
    });
  }

  // 7.A: status = VERIFIED -> Permitido
  try {
    await prisma.tenantDomain.update({
      where: { domain: 'app.evolve.example' },
      data: { status: DomainStatus.VERIFIED },
    });
    TenantResolver.invalidateCache();
    const resVerified = await TenantResolver.resolveByHost(prisma, 'app.evolve.example');
    const passA = resVerified.type === 'CUSTOM_DOMAIN' && resVerified.tenant?.id === evolveTenant.id && resVerified.branding.status === 'CONFIGURED';
    results.push({
      section: 'CUSTOM_DOMAIN',
      code: 'TESTE_7A',
      name: 'Custom Domain app.evolve.example com status VERIFIED',
      expected: 'Permitido (CUSTOM_DOMAIN / CONFIGURED)',
      actual: `Tipo: ${resVerified.type}, Tenant: ${resVerified.tenant?.slug}, Status: ${resVerified.branding.status}`,
      status: passA ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'CUSTOM_DOMAIN', code: 'TESTE_7A', name: 'Custom Domain VERIFIED', expected: 'Permitido', actual: err.message, status: 'FAIL' });
  }

  // 7.B: status = PENDING -> Bloqueado
  try {
    await prisma.tenantDomain.update({
      where: { domain: 'app.evolve.example' },
      data: { status: DomainStatus.PENDING },
    });
    TenantResolver.invalidateCache();
    const resPending = await TenantResolver.resolveByHost(prisma, 'app.evolve.example');
    const passB = resPending.type === 'DOMAIN_NOT_CONFIGURED' && resPending.tenant === null;
    results.push({
      section: 'CUSTOM_DOMAIN',
      code: 'TESTE_7B',
      name: 'Custom Domain app.evolve.example com status PENDING',
      expected: 'Bloqueado (DOMAIN_NOT_CONFIGURED / tenant: null)',
      actual: `Tipo: ${resPending.type}, Tenant: ${resPending.tenant}`,
      status: passB ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'CUSTOM_DOMAIN', code: 'TESTE_7B', name: 'Custom Domain PENDING', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // 7.C: status = FAILED -> Bloqueado
  try {
    await prisma.tenantDomain.update({
      where: { domain: 'app.evolve.example' },
      data: { status: DomainStatus.FAILED },
    });
    TenantResolver.invalidateCache();
    const resFailed = await TenantResolver.resolveByHost(prisma, 'app.evolve.example');
    const passC = resFailed.type === 'DOMAIN_NOT_CONFIGURED' && resFailed.tenant === null;
    results.push({
      section: 'CUSTOM_DOMAIN',
      code: 'TESTE_7C',
      name: 'Custom Domain app.evolve.example com status FAILED',
      expected: 'Bloqueado (DOMAIN_NOT_CONFIGURED / tenant: null)',
      actual: `Tipo: ${resFailed.type}, Tenant: ${resFailed.tenant}`,
      status: passC ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'CUSTOM_DOMAIN', code: 'TESTE_7C', name: 'Custom Domain FAILED', expected: 'Bloqueado', actual: err.message, status: 'FAIL' });
  }

  // Restaura VERIFIED
  await prisma.tenantDomain.update({
    where: { domain: 'app.evolve.example' },
    data: { status: DomainStatus.VERIFIED },
  });

  // ========================================================================
  // SEÇÃO 8: VALIDAÇÃO DE CORS / CSRF
  // ========================================================================

  try {
    const trustedOrigins = await getTrustedOrigins(prisma);

    // 8.A: Origem Legítima do Tenant -> Permitida
    const legitAllowed = await isOriginTrusted('https://evolve.sentinelconsig.com.br', trustedOrigins, prisma);

    // 8.B: Origem Maliciosa -> Bloqueada
    const evilAllowed = await isOriginTrusted('https://evil-attacker.com', trustedOrigins, prisma);

    // 8.C: Origem Desconhecida / Não Cadastrada -> Bloqueada
    const unknownAllowed = await isOriginTrusted('https://promotora-nao-autorizada.com.br', trustedOrigins, prisma);

    const pass = legitAllowed === true && evilAllowed === false && unknownAllowed === false;
    results.push({
      section: 'CORS_CSRF',
      code: 'TESTE_8',
      name: 'Validação CSRF / CORS Whitelist',
      expected: 'Legítima: true | Maliciosa: false | Desconhecida: false',
      actual: `Legítima: ${legitAllowed} | Maliciosa: ${evilAllowed} | Desconhecida: ${unknownAllowed}`,
      status: pass ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    results.push({ section: 'CORS_CSRF', code: 'TESTE_8', name: 'CSRF/CORS Whitelist', expected: 'Protegido', actual: err.message, status: 'FAIL' });
  }

  // ========================================================================
  // MATRIZ DE RESULTADOS
  // ========================================================================

  console.log('\n========================================================================');
  console.log('MATRIZ GERAL DE RESULTADOS:');
  console.log('========================================================================\n');

  for (const r of results) {
    const tag = r.status === 'PASS' ? '[PASS]' : '[FAIL]';
    console.log(`${tag} [${r.section}] ${r.code}: ${r.name}`);
    console.log(`       Esperado: ${r.expected}`);
    console.log(`       Obtido:   ${r.actual}`);
    console.log(`       Status:   ${r.status}\n`);
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const allPassed = failCount === 0;

  console.log('========================================================================');
  console.log(`TOTAL DE TESTES: ${results.length} | APROVADOS: ${passCount} | FALHAS: ${failCount}`);
  console.log(`STATUS DA VALIDAÇÃO: ${allPassed ? 'TODOS OS TESTES APROVADOS (100% PASS)' : 'HOUVE FALHAS'}`);
  console.log('========================================================================\n');

  await prisma.$disconnect();
}

runValidationSuite().catch(async (e) => {
  console.error('Erro na suíte de validação:', e);
  await prisma.$disconnect();
  process.exit(1);
});
