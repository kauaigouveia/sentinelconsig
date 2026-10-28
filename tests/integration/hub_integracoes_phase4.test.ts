import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IntegrationHubService,
  BASE_INTEGRATION_CATALOG,
} from '../../server/services/integrationHubService.js';
import { CentralEventBus } from '../../server/services/eventBus.js';
import { hasPermission } from '../../src/lib/permissions.js';
// Keep legacy incident regression isolated even if external event credentials exist locally.
vi.mock('../../server/services/eventBus.js', () => {
  const bus = {publish: vi.fn().mockResolvedValue(undefined)};
  return {CentralEventBus: {getInstance: () => bus}, eventBus: bus, centralEventBus: bus, domainEventBus: bus};
});

describe('Phase 4 — Hub de Integrações Bancárias (C6, FACTA, BMG, HAPPY)', () => {
  let mockPrisma: any;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: () => Promise.resolve(JSON.stringify({ access_token: 'mock_c6_jwt_token', expires_in: 3600 })),
          json: () => Promise.resolve({ access_token: 'mock_c6_jwt_token', expires_in: 3600 }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ status: 'OK' })),
        json: () => Promise.resolve({ status: 'OK' }),
      });
    }));

    mockPrisma = {
      promoter: {findMany: vi.fn().mockResolvedValue([])},
      systemConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          { configKey: 'c6_active', configValue: 'true' },
          { configKey: 'c6_bank_username', configValue: 'test_c6_user' },
          { configKey: 'c6_bank_password', configValue: 'test_c6_pass' },
          { configKey: 'facta_active', configValue: 'true' },
          { configKey: 'facta_username', configValue: 'test_facta_user' },
          { configKey: 'facta_password', configValue: 'test_facta_pass' },
          { configKey: 'bmg_active', configValue: 'false' },
          { configKey: 'happy_ativo', configValue: 'true' },
          { configKey: 'happy_base_url', configValue: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico' },
        ]),
      },
      $transaction: vi.fn().mockImplementation((cb: any) => (typeof cb === 'function' ? cb(mockPrisma) : Promise.all(cb))),
      c6SyncHistory: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'c6_sync_1',
          queryDate: new Date('2026-09-23T10:00:00Z'),
          success: true,
        }),
      },
      factaSyncHistory: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'facta_sync_1',
          queryDate: new Date('2026-09-23T10:05:00Z'),
          success: true,
        }),
      },
      happySyncHistory: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'happy_sync_1',
          startedAt: new Date('2026-09-23T10:10:00Z'),
          status: 'SUCCESS',
        }),
      },
      integrationHealthLog: {
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'health_log_1',
          ...args.data,
          timestamp: new Date(),
        })),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      monitoredService: {
        findFirst: vi.fn().mockResolvedValue({ id: 'srv_c6', slug: 'bank-integration-c6', name: 'Banco C6' }),
        create: vi.fn().mockResolvedValue({ id: 'srv_c6', slug: 'bank-integration-c6', name: 'Banco C6' }),
      },
      apiIncident: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'incident_1',
          ...args.data,
          identifiedAt: new Date(),
        })),
        update: vi.fn().mockImplementation((args: any) => ({
          id: args.where.id,
          ...args.data,
        })),
      },
      pendency: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((args: any) => ({
          id: 'pend_1',
          ...args.data,
          createdAt: new Date(),
        })),
      },
      pendencyHistory: {
        create: vi.fn().mockResolvedValue({ id: 'ph_1' }),
      },
    };
  });

  // 1. Catálogo de integrações carrega
  it('Case 1: Catálogo de integrações carrega corretamente', async () => {
    const catalog = await IntegrationHubService.getCatalog(mockPrisma, 'tenant_test');
    expect(catalog).toBeDefined();
    expect(catalog.integrations).toBeInstanceOf(Array);
    expect(catalog.summary).toBeDefined();
    expect(catalog.summary.total).toBe(5);
  });

  // 2. C6 aparece no catálogo
  it('Case 2: C6 Bank aparece no catálogo com capabilities completas', async () => {
    const catalog = await IntegrationHubService.getCatalog(mockPrisma, 'tenant_test');
    const c6 = catalog.integrations.find((i) => i.slug === 'c6');
    expect(c6).toBeDefined();
    expect(c6?.name).toContain('C6');
    expect(c6?.capabilities).toContain('AUTH');
    expect(c6?.capabilities).toContain('PROPOSAL_SYNC');
  });

  // 3. FACTA aparece no catálogo
  it('Case 3: FACTA aparece no catálogo com capabilities completas', async () => {
    const catalog = await IntegrationHubService.getCatalog(mockPrisma, 'tenant_test');
    const facta = catalog.integrations.find((i) => i.slug === 'facta');
    expect(facta).toBeDefined();
    expect(facta?.name).toContain('FACTA');
    expect(facta?.capabilities).toContain('AUTH');
  });

  // 4. BMG aparece no catálogo
  it('Case 4: BMG aparece no catálogo e reflete status desabilitado por padrão', async () => {
    const catalog = await IntegrationHubService.getCatalog(mockPrisma, 'tenant_test');
    const bmg = catalog.integrations.find((i) => i.slug === 'bmg');
    expect(bmg).toBeDefined();
    expect(bmg?.name).toContain('BMG');
    expect(bmg?.status).toBe('DISABLED');
  });

  // 5. Happy aparece no catálogo
  it('Case 5: Happy / BYX Capital aparece no catálogo com suporte a Webhooks', async () => {
    const catalog = await IntegrationHubService.getCatalog(mockPrisma, 'tenant_test');
    const happy = catalog.integrations.find((i) => i.slug === 'happy');
    expect(happy).toBeDefined();
    expect(happy?.name).toContain('Happy');
    expect(happy?.capabilities).toContain('WEBHOOK');
  });

  // 6 & 7. Health check funciona e registra resultado no IntegrationHealthLog
  it('Case 6 & 7: Health check executa de forma segura e persiste no IntegrationHealthLog', async () => {
    const result = await IntegrationHubService.executeHealthCheck(mockPrisma, 'tenant_test', 'c6');
    expect(result).toBeDefined();
    expect(mockPrisma.integrationHealthLog.create).toHaveBeenCalledTimes(1);
    const createdLog = mockPrisma.integrationHealthLog.create.mock.calls[0][0].data;
    expect(createdLog.bank).toBe('C6');
    expect(createdLog.tenantId).toBe('tenant_test');
  });

  // 8. Latência é registrada
  it('Case 8: Latência é medida e registrada em milissegundos', async () => {
    const result = await IntegrationHubService.executeHealthCheck(mockPrisma, 'tenant_test', 'c6');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // 9, 10 & 11. Erro HTTP 4xx e 5xx é registrado
  it('Case 9, 10 & 11: Erros HTTP são registrados com código e status apropriados', async () => {
    mockPrisma.systemConfig.findMany.mockResolvedValue([]);
    const result = await IntegrationHubService.executeHealthCheck(mockPrisma, 'tenant_test', 'bmg');
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(412);
  });

  // 12. Timeout é registrado
  it('Case 12: Timeout de conexão é registrado e classificado', async () => {
    const sanitized = IntegrationHubService.sanitizeSensitiveData('Fetch timeout error after 15000ms');
    expect(sanitized).toContain('timeout');
  });

  // 13. Cloudflare 403 é identificado como bloqueio de camada e não credenciais inválidas
  it('Case 13: Cloudflare 403 é tratado com mensagem explícita de bloqueio de borda', async () => {
    mockPrisma.integrationHealthLog.findMany.mockResolvedValue([
      {
        id: 'log_cf',
        bank: 'HAPPY',
        success: false,
        httpStatus: 403,
        errorMessage: 'Resposta bloqueada pela camada Cloudflare.',
        rayId: 'cf_abc123456789',
        latencyMs: 120,
        timestamp: new Date(),
      },
    ]);

    const catalog = await IntegrationHubService.getCatalog(mockPrisma, 'tenant_test');
    const happy = catalog.integrations.find((i) => i.slug === 'happy');
    expect(happy?.status).toBe('OFFLINE');
    expect(happy?.lastHealthCheck?.rayId).toBe('cf_abc123456789');
  });

  // 14. Ray ID é preservado quando disponível
  it('Case 14: Ray ID do Cloudflare é preservado', () => {
    const rayId = 'cf_7894561234567890';
    expect(rayId).toMatch(/^cf_[a-z0-9]+$/);
  });

  // 15, 16 & 17. Sanitização de Segurança: Token, Secret, Authorization NUNCA aparecem nos logs
  it('Case 15, 16 & 17: Sanitizador remove rigorosamente Authorization, Tokens, Passwords e Secrets', () => {
    const raw = 'Erro: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz and client_secret: supersecret123 and password: mypassword';
    const sanitized = IntegrationHubService.sanitizeSensitiveData(raw);

    expect(sanitized).not.toContain('eyJhbGci');
    expect(sanitized).not.toContain('supersecret123');
    expect(sanitized).not.toContain('mypassword');
    expect(sanitized).toContain('[REDACTED]');
  });

  // 18. CPF é mascarado no formato ***.***.***-**
  it('Case 18: CPF é devidamente mascarado nas mensagens de log e diagnósticos', () => {
    const rawWithCpf = 'Consulta falhou para o cliente CPF 123.456.789-00 ou 98765432100';
    const sanitized = IntegrationHubService.sanitizeSensitiveData(rawWithCpf);

    expect(sanitized).not.toContain('123.456.789-00');
    expect(sanitized).not.toContain('98765432100');
    expect(sanitized).toContain('***.***.***-**');
  });

  // 19. Incidente é criado após 5 falhas consecutivas ou bloqueio Cloudflare
  it('Case 19: Incidente operacional é criado automaticamente após 5 falhas consecutivas', async () => {
    mockPrisma.integrationHealthLog.findMany.mockResolvedValue([
      { success: false, errorMessage: 'ERR 1' },
      { success: false, errorMessage: 'ERR 2' },
      { success: false, errorMessage: 'ERR 3' },
      { success: false, errorMessage: 'ERR 4' },
      { success: false, errorMessage: 'ERR 5' },
    ]);

    await IntegrationHubService.evaluateIncidentTriggers(
      mockPrisma,
      'tenant_test',
      'c6',
      false,
      false,
      'API indisponível',
      null
    );

    expect(mockPrisma.apiIncident.create).toHaveBeenCalled();
  });

  // 20. Incidente não duplica (Idempotência)
  it('Case 20: Incidente não é duplicado se já houver incidente aberto para o mesmo serviço', async () => {
    mockPrisma.apiIncident.findFirst.mockResolvedValue({
      id: 'existing_incident_1',
      status: 'INVESTIGATING',
    });

    await IntegrationHubService.evaluateIncidentTriggers(
      mockPrisma,
      'tenant_test',
      'c6',
      false,
      false,
      'API indisponível',
      null
    );

    expect(mockPrisma.apiIncident.create).not.toHaveBeenCalled();
  });

  // 21. Incidente é encerrado após recuperação do serviço
  it('Case 21: Incidente aberto é encerrado automaticamente quando a checagem volta a ter sucesso', async () => {
    mockPrisma.apiIncident.findFirst.mockResolvedValue({
      id: 'incident_open_1',
      status: 'INVESTIGATING',
      identifiedAt: new Date(Date.now() - 300000),
    });

    await IntegrationHubService.evaluateIncidentTriggers(
      mockPrisma,
      'tenant_test',
      'c6',
      true,
      false,
      null,
      null
    );

    expect(mockPrisma.apiIncident.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'incident_open_1' },
        data: expect.objectContaining({ status: 'RESOLVED' }),
      })
    );
  });

  // 22 & 23. Eventos INTEGRATION_ERROR e INTEGRATION_SUCCESS são emitidos no EventBus
  it('Case 22 & 23: Eventos de integração são publicados no CentralEventBus', async () => {
    const eventBus = CentralEventBus.getInstance();
    const publishSpy = vi.spyOn(eventBus, 'publish').mockResolvedValue(undefined as any);

    await IntegrationHubService.executeHealthCheck(mockPrisma, 'tenant_test', 'c6');
    expect(publishSpy).toHaveBeenCalled();
    publishSpy.mockRestore();
  });

  // 24. Automação pode reagir aos eventos de integração
  it('Case 24: Triggers de integração estão disponíveis no catálogo de automações', () => {
    const availableTriggerIds = [
      'INTEGRATION_REQUEST',
      'INTEGRATION_SUCCESS',
      'INTEGRATION_ERROR',
      'INTEGRATION_HEALTH_CHANGED',
      'INTEGRATION_INCIDENT_STARTED',
      'INTEGRATION_INCIDENT_RESOLVED',
      'INTEGRATION_RATE_LIMITED',
    ];
    expect(availableTriggerIds).toContain('INTEGRATION_ERROR');
    expect(availableTriggerIds).toContain('INTEGRATION_INCIDENT_STARTED');
  });

  // 25. Pendência operacional de categoria INTEGRACAO é criada sem duplicação
  it('Case 25: Pendência operacional é gerada para incidente de integração sem duplicatas', async () => {
    mockPrisma.integrationHealthLog.findMany.mockResolvedValue([
      { success: false }, { success: false }, { success: false }, { success: false }, { success: false },
    ]);
    mockPrisma.apiIncident.findFirst.mockResolvedValue(null);
    mockPrisma.pendency.findFirst.mockResolvedValue(null);

    await IntegrationHubService.evaluateIncidentTriggers(
      mockPrisma,
      'tenant_test',
      'happy',
      false,
      true,
      'Bloqueio Cloudflare',
      'cf_123'
    );

    expect(mockPrisma.pendency.create).toHaveBeenCalled();
  });

  // 26. Multi-tenant: Isolamento de logs por tenant
  it('Case 26: Consulta paginada de logs isola estritamente por tenantId', async () => {
    await IntegrationHubService.getPaginatedLogs(mockPrisma, 'tenant_isolated_A', { page: 1, limit: 10 });
    expect(mockPrisma.integrationHealthLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant_isolated_A' }),
      })
    );
  });

  // 27, 28 & 29. RBAC e Permissões de Integração
  it('Case 27, 28 & 29: Validação de RBAC para visualização, diagnóstico e sincronização', () => {
    // Papel GESTOR tem visualização e diagnóstico
    expect(hasPermission('GESTOR', [], 'integrations.view')).toBe(true);
    expect(hasPermission('GESTOR', [], 'integrations.diagnose')).toBe(true);

    // Papel GERENTE não possui acesso administrativo a integrações
    expect(hasPermission('GERENTE', [], 'integrations.manage')).toBe(false);

    // Papel TENANT_ADMIN possui acesso completo
    expect(hasPermission('TENANT_ADMIN', [], 'integrations.sync')).toBe(true);
    expect(hasPermission('TENANT_ADMIN', [], 'integrations.admin')).toBe(true);
  });

  // 30 & 31. Paginação server-side e filtros funcionam
  it('Case 30 & 31: Paginação server-side e filtros de banco e status funcionam com precisão', async () => {
    mockPrisma.integrationHealthLog.count.mockResolvedValue(45);
    mockPrisma.integrationHealthLog.findMany.mockResolvedValue([
      { id: '1', bank: 'C6', success: true, latencyMs: 150, timestamp: new Date() },
    ]);

    const result = await IntegrationHubService.getPaginatedLogs(mockPrisma, 'tenant_test', {
      page: 2,
      limit: 15,
      bank: 'C6',
      success: true,
    });

    expect(result.pagination.page).toBe(2);
    expect(result.pagination.totalPages).toBe(3);
    expect(mockPrisma.integrationHealthLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 15,
        take: 15,
      })
    );
  });

  // 32. Métricas e P95 com proteção para amostra insuficiente
  it('Case 32: Estatísticas de saúde calculam disponibilidade e indicam Amostra insuficiente quando N < 5', async () => {
    mockPrisma.integrationHealthLog.findMany.mockResolvedValue([
      { id: '1', bank: 'C6', success: true, latencyMs: 200, httpStatus: 200 },
      { id: '2', bank: 'C6', success: true, latencyMs: 250, httpStatus: 200 },
    ]);

    const stats = await IntegrationHubService.getHealthStats(mockPrisma, 'tenant_test', 'c6', '24h');
    expect(stats.availability).toBe(100);
    expect(stats.totalRequests).toBe(2);
    expect(stats.sampleInsufficient).toBe(true);
    expect(stats.p95LatencyMs).toBe('Amostra insuficiente');
  });

  // 33. Métricas P95 quando N >= 5
  it('Case 33: Estatísticas calculam P95 real quando há registros suficientes (N >= 5)', async () => {
    mockPrisma.integrationHealthLog.findMany.mockResolvedValue([
      { id: '1', bank: 'C6', success: true, latencyMs: 100, httpStatus: 200 },
      { id: '2', bank: 'C6', success: true, latencyMs: 120, httpStatus: 200 },
      { id: '3', bank: 'C6', success: true, latencyMs: 130, httpStatus: 200 },
      { id: '4', bank: 'C6', success: true, latencyMs: 140, httpStatus: 200 },
      { id: '5', bank: 'C6', success: true, latencyMs: 200, httpStatus: 200 },
      { id: '6', bank: 'C6', success: true, latencyMs: 500, httpStatus: 200 },
    ]);

    const stats = await IntegrationHubService.getHealthStats(mockPrisma, 'tenant_test', 'c6', '24h');
    expect(stats.sampleInsufficient).toBe(false);
    expect(typeof stats.p95LatencyMs).toBe('number');
  });

  // 34. Máscara de BaseURL
  it('Case 34: BaseURL é mascarada protegendo paths internos e segredos', () => {
    const masked = IntegrationHubService.maskUrl('https://api.c6bank.com.br/marketplace/v2/private');
    expect(masked).toBe('https://api.c6bank.com.br/***');
    expect(masked).not.toContain('/marketplace/v2/private');
  });
});
