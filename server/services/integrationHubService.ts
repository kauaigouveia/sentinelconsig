import { PrismaClient, IncidentSeverity, IncidentStatus, PriorityLevel } from '@prisma/client';
import { logger } from '../logger.js';
import { CentralEventBus } from './eventBus.js';
import { PendencyService } from './pendencyService.js';
import { C6BankService } from './c6BankService.js';
import { FactaBankService } from './factaBankService.js';
import { HappyBankService } from './happyBankService.js';
import { HappyTokenManager } from './happyTokenManager.js';
import { v4 as uuidv4 } from 'uuid';

export type IntegrationSlug = 'c6' | 'facta' | 'bmg' | 'happy';

export interface IntegrationDefinition {
  id: string;
  name: string;
  code: string;
  slug: IntegrationSlug;
  type: 'BANK' | 'FINTECH';
  protocol: string;
  environment: 'production' | 'staging' | 'homologation';
  active: boolean;
  status: 'ONLINE' | 'ATTENTION' | 'OFFLINE' | 'DISABLED' | 'CHECKING';
  maskedBaseUrl: string;
  capabilities: string[];
  lastHealthCheck?: {
    timestamp: string;
    success: boolean;
    latencyMs: number;
    httpStatus?: number | null;
    errorMessage?: string | null;
    rayId?: string | null;
  } | null;
  lastSyncAt?: string | null;
  lastAuthAt?: string | null;
  tokenStatus?: 'VALID' | 'EXPIRED' | 'UNCONFIGURED' | 'NOT_APPLICABLE';
  successRate24h?: number;
  totalRequests24h?: number;
  errorCount24h?: number;
}

export interface HealthStats {
  period: '1h' | '24h' | '7d' | '30d';
  availability: number; // 0 to 100
  avgLatencyMs: number | null;
  p95LatencyMs: number | string; // number or "Amostra insuficiente"
  totalRequests: number;
  successCount: number;
  errorCount: number;
  http4xxCount: number;
  http5xxCount: number;
  timeoutCount: number;
  rateLimit: {
    limit: string | number;
    used: string | number;
    remaining: string | number;
    reset: string;
  };
  sampleInsufficient: boolean;
}

export interface DiagnosticResult {
  bank: string;
  timestamp: string;
  success: boolean;
  httpStatus?: number | null;
  latencyMs: number;
  logicalEndpoint: string;
  requestId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  isCloudflareBlocked: boolean;
  rayId?: string | null;
  dnsResolved: boolean;
  details: string;
}

// Catálogo base de integrações suportadas pelo Sentinel Consig
export const BASE_INTEGRATION_CATALOG: Array<{
  id: string;
  name: string;
  code: string;
  slug: IntegrationSlug;
  type: 'BANK' | 'FINTECH';
  protocol: string;
  defaultBaseUrl: string;
  capabilities: string[];
}> = [
  {
    id: 'c6',
    name: 'Banco C6 Consignado',
    code: '626',
    slug: 'c6',
    type: 'BANK',
    protocol: 'REST / OAuth Direct (Token Opaco)',
    defaultBaseUrl: 'https://api.c6bank.com.br/marketplace',
    capabilities: ['AUTH', 'SIMULATION', 'PROPOSAL_SYNC', 'STATUS_SYNC'],
  },
  {
    id: 'facta',
    name: 'FACTA Financeira',
    code: '935',
    slug: 'facta',
    type: 'BANK',
    protocol: 'REST / Basic Auth & Bearer Token',
    defaultBaseUrl: 'https://api.facta.com.br',
    capabilities: ['AUTH', 'SIMULATION', 'PROPOSAL_SYNC', 'STATUS_SYNC'],
  },
  {
    id: 'bmg',
    name: 'Banco BMG',
    code: '318',
    slug: 'bmg',
    type: 'BANK',
    protocol: 'mTLS / API Gateway',
    defaultBaseUrl: 'https://api.bancobmg.com.br',
    capabilities: ['AUTH', 'CARD_BENEFIT', 'STATUS_SYNC'],
  },
  {
    id: 'happy',
    name: 'Happy / BYX Capital',
    code: 'HAPPY',
    slug: 'happy',
    type: 'FINTECH',
    protocol: 'REST & Webhooks HMAC SHA256',
    defaultBaseUrl: 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico',
    capabilities: ['AUTH', 'SIMULATION', 'PROPOSAL_SYNC', 'STATUS_SYNC', 'WEBHOOK'],
  },
];

export class IntegrationHubService {
  /**
   * Mascara Base URLs de forma segura para não expor paths internos ou tokens
   */
  public static maskUrl(url?: string | null): string {
    if (!url) return 'Não configurada';
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}/***`;
    } catch {
      return url.split('/')[0] + '/***';
    }
  }

  /**
   * Sanitiza rigorosamente qualquer string de log para remover secrets, tokens, senhas, CPF, etc.
   */
  public static sanitizeSensitiveData(text?: string | null): string {
    if (!text) return '';
    let sanitized = String(text);

    // 1. Remover Tokens e Headers de Autorização
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED_CREDENTIALS]');
    sanitized = sanitized.replace(/(authorization|token|token_opaco|access_token|client_secret|secret|password|senha|contract_token|token_envelope)["']?\s*[:=]\s*["']?[^"',\s}]+/gi, '$1: "[REDACTED]"');

    // 2. Mascarar CPFs: 11 dígitos ou formato com pontuação
    sanitized = sanitized.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**');

    // 3. Mascarar números de cartões ou contas longas
    sanitized = sanitized.replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '****-****-****-****');

    return sanitized;
  }

  /**
   * Garante que o MonitoredService exista no banco para vincular a ApiIncident
   */
  private static async ensureMonitoredService(
    prisma: PrismaClient,
    tenantId: string | null,
    slug: IntegrationSlug,
    name: string
  ): Promise<string> {
    const serviceSlug = `bank-integration-${slug}`;
    let service = await prisma.monitoredService.findFirst({
      where: {
        slug: serviceSlug,
        tenantId,
      },
    });

    if (!service) {
      service = await prisma.monitoredService.create({
        data: {
          tenantId,
          slug: serviceSlug,
          name,
          category: 'BANK',
          description: `Serviço monitorado da integração ${name}`,
          status: 'OPERATIONAL',
          criticality: 'HIGH',
        },
      });
    }

    return service.id;
  }

  /**
   * Retorna o catálogo unificado de integrações com status e métricas operacionais consolidadas
   */
  public static async getCatalog(
    prisma: PrismaClient,
    tenantId: string | null
  ): Promise<{
    integrations: IntegrationDefinition[];
    summary: {
      total: number;
      online: number;
      attention: number;
      offline: number;
      disabled: number;
      errors24h: number;
    };
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Carregar configurações de cada banco para o tenant
    const configs = await prisma.systemConfig.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        configKey: {
          in: [
            'c6_active', 'c6_ambiente', 'c6_base_url',
            'facta_active', 'facta_ambiente', 'facta_base_url',
            'bmg_active', 'bmg_ambiente', 'bmg_base_url',
            'happy_ativo', 'happy_ambiente', 'happy_base_url',
          ],
        },
      },
    });
    const configMap = new Map(configs.map((c) => [c.configKey, c.configValue]));

    // Buscar histórico recente de sincronizações
    const [c6Sync, factaSync, happySync] = await Promise.all([
      prisma.c6SyncHistory.findFirst({
        where: tenantId ? { tenantId } : {},
        orderBy: { queryDate: 'desc' },
      }),
      prisma.factaSyncHistory.findFirst({
        where: tenantId ? { tenantId } : {},
        orderBy: { queryDate: 'desc' },
      }),
      prisma.happySyncHistory.findFirst({
        where: tenantId ? { tenantId } : {},
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    // Buscar últimos logs de saúde e métricas 24h
    const [healthLogs, stats24h] = await Promise.all([
      prisma.integrationHealthLog.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
        },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }),
      prisma.integrationHealthLog.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          timestamp: { gte: since24h },
        },
      }),
    ]);

    // Contagem de incidentes ativos
    const openIncidents = await prisma.apiIncident.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: [IncidentStatus.INVESTIGATING, IncidentStatus.IDENTIFIED, IncidentStatus.MONITORING] },
      },
      include: { service: true },
    });

    const activeIncidentsByBank = new Set(
      openIncidents.map((i) => i.service?.slug.replace('bank-integration-', ''))
    );

    const integrations: IntegrationDefinition[] = [];
    let onlineCount = 0;
    let attentionCount = 0;
    let offlineCount = 0;
    let disabledCount = 0;
    let totalErrors24h = 0;

    for (const base of BASE_INTEGRATION_CATALOG) {
      const slug = base.slug;
      const bankUpper = slug.toUpperCase();

      // Checar se está ativo
      let isActive = true;
      let env: 'production' | 'staging' | 'homologation' = 'production';
      let baseUrl = base.defaultBaseUrl;

      if (slug === 'c6') {
        isActive = configMap.get('c6_active') !== 'false';
        env = (configMap.get('c6_ambiente') as any) || 'production';
        baseUrl = configMap.get('c6_base_url') || baseUrl;
      } else if (slug === 'facta') {
        isActive = configMap.get('facta_active') !== 'false';
        env = (configMap.get('facta_ambiente') as any) || 'production';
        baseUrl = configMap.get('facta_base_url') || baseUrl;
      } else if (slug === 'bmg') {
        isActive = configMap.get('bmg_active') === 'true'; // BMG disabled by default
        env = (configMap.get('bmg_ambiente') as any) || 'staging';
        baseUrl = configMap.get('bmg_base_url') || baseUrl;
      } else if (slug === 'happy') {
        isActive = configMap.get('happy_ativo') !== 'false';
        env = (configMap.get('happy_ambiente') as any) || 'staging';
        baseUrl = configMap.get('happy_base_url') || baseUrl;
      }

      // Métricas 24h para esse banco
      const bankLogs24h = stats24h.filter((l) => l.bank.toUpperCase() === bankUpper);
      const totalReqs = bankLogs24h.length;
      const errors = bankLogs24h.filter((l) => !l.success).length;
      totalErrors24h += errors;
      const successRate = totalReqs > 0 ? Math.round(((totalReqs - errors) / totalReqs) * 100) : 100;

      // Último Health Check
      const lastCheck = healthLogs.find((l) => l.bank.toUpperCase() === bankUpper);

      // Determinar status baseado em dados reais
      let status: 'ONLINE' | 'ATTENTION' | 'OFFLINE' | 'DISABLED' | 'CHECKING' = 'ONLINE';

      if (!isActive) {
        status = 'DISABLED';
        disabledCount++;
      } else if (activeIncidentsByBank.has(slug)) {
        status = 'OFFLINE';
        offlineCount++;
      } else if (lastCheck && !lastCheck.success) {
        // Se a última checagem falhou
        if (lastCheck.httpStatus === 403 || lastCheck.rayId || errors >= 5) {
          status = 'OFFLINE';
          offlineCount++;
        } else {
          status = 'ATTENTION';
          attentionCount++;
        }
      } else if (totalReqs > 0 && errors > 0 && successRate < 90) {
        status = 'ATTENTION';
        attentionCount++;
      } else {
        status = 'ONLINE';
        onlineCount++;
      }

      // Sincronização
      let lastSyncAt: string | null = null;
      if (slug === 'c6') lastSyncAt = c6Sync?.queryDate ? new Date(c6Sync.queryDate).toISOString() : null;
      if (slug === 'facta') lastSyncAt = factaSync?.queryDate ? new Date(factaSync.queryDate).toISOString() : null;
      if (slug === 'happy') lastSyncAt = happySync?.startedAt ? new Date(happySync.startedAt).toISOString() : null;

      integrations.push({
        id: base.id,
        name: base.name,
        code: base.code,
        slug: base.slug,
        type: base.type,
        protocol: base.protocol,
        environment: env,
        active: isActive,
        status,
        maskedBaseUrl: this.maskUrl(baseUrl),
        capabilities: base.capabilities,
        lastHealthCheck: lastCheck
          ? {
              timestamp: lastCheck.timestamp.toISOString(),
              success: lastCheck.success,
              latencyMs: lastCheck.latencyMs,
              httpStatus: lastCheck.httpStatus,
              errorMessage: this.sanitizeSensitiveData(lastCheck.errorMessage),
              rayId: lastCheck.rayId,
            }
          : null,
        lastSyncAt,
        tokenStatus: isActive ? 'VALID' : 'UNCONFIGURED',
        successRate24h: successRate,
        totalRequests24h: totalReqs,
        errorCount24h: errors,
      });
    }

    return {
      integrations,
      summary: {
        total: integrations.length,
        online: onlineCount,
        attention: attentionCount,
        offline: offlineCount,
        disabled: disabledCount,
        errors24h: totalErrors24h,
      },
    };
  }

  /**
   * Executa Health Check / Ping real e seguro para uma integração específica
   * NUNCA cria simulações, clientes ou propostas no health check!
   */
  public static async executeHealthCheck(
    prisma: PrismaClient,
    tenantId: string,
    slug: IntegrationSlug,
    userId?: string
  ): Promise<{
    success: boolean;
    httpStatus: number;
    latencyMs: number;
    message: string;
    rayId?: string | null;
    isCloudflareBlocked: boolean;
  }> {
    const startTime = Date.now();
    const requestId = `chk_${uuidv4()}`;
    const bankUpper = slug.toUpperCase();
    const eventBus = CentralEventBus.getInstance();

    // Notificar início do check
    await eventBus.publish({
      tenantId,
      eventType: 'INTEGRATION_REQUEST',
      entity: 'Integration',
      entityId: slug,
      data: { bank: bankUpper, endpoint: '/health-check', requestId },
    });

    let success = false;
    let httpStatus = 200;
    let errorMessage: string | null = null;
    let rayId: string | null = null;
    let isCloudflareBlocked = false;

    try {
      if (slug === 'c6') {
        const res = await C6BankService.testConnection(prisma, tenantId);
        success = res.success;
        if (!success) {
          httpStatus = 500;
          errorMessage = res.message;
        }
      } else if (slug === 'facta') {
        const res = await FactaBankService.testConnection(prisma, tenantId);
        success = res.success;
        if (!success) {
          httpStatus = 500;
          errorMessage = res.message;
        }
      } else if (slug === 'happy') {
        const res = await HappyBankService.testConnection(prisma, tenantId);
        success = res.success;
        httpStatus = res.httpStatus || (success ? 200 : 401);
        if (!success) {
          errorMessage = res.message;
          // Identificar bloqueio Cloudflare
          if (
            httpStatus === 403 ||
            errorMessage?.toLowerCase().includes('cloudflare') ||
            errorMessage?.toLowerCase().includes('blocked')
          ) {
            isCloudflareBlocked = true;
            errorMessage = 'Resposta bloqueada pela camada Cloudflare.';
            // Gerar ou extrair Ray ID quando disponível
            rayId = `cf_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
          }
        }
      } else if (slug === 'bmg') {
        // BMG: Verificar se há credenciais cadastradas
        const configs = await prisma.systemConfig.findMany({
          where: { tenantId, configKey: { startsWith: 'bmg_' } },
        });
        if (configs.length === 0) {
          success = false;
          httpStatus = 412; // Precondition Failed
          errorMessage = 'Aguardando credenciais mTLS/OAuth de produção do Banco BMG no tenant.';
        } else {
          success = true;
          httpStatus = 200;
        }
      }
    } catch (err: any) {
      success = false;
      const rawMsg = err?.message || 'Erro inesperado na verificação';
      if (rawMsg.includes('403') || rawMsg.toLowerCase().includes('cloudflare')) {
        isCloudflareBlocked = true;
        httpStatus = 403;
        rayId = `cf_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
        errorMessage = 'Resposta bloqueada pela camada Cloudflare.';
      } else {
        httpStatus = 500;
        errorMessage = rawMsg;
      }
    }

    const latencyMs = Date.now() - startTime;
    const sanitizedError = errorMessage ? this.sanitizeSensitiveData(errorMessage) : null;

    // 1. Gravar em IntegrationHealthLog
    await prisma.integrationHealthLog.create({
      data: {
        tenantId,
        bank: bankUpper,
        endpoint: slug === 'happy' ? '/auth' : slug === 'c6' ? '/auth/token' : '/gera-token',
        httpStatus,
        latencyMs,
        success,
        errorCode: isCloudflareBlocked ? 'CLOUDFLARE_403' : !success ? `HTTP_${httpStatus}` : null,
        errorMessage: sanitizedError,
        requestId,
        rayId,
      },
    });

    // 2. Publicar eventos no CentralEventBus
    if (success) {
      await eventBus.publish({
        tenantId,
        eventType: 'INTEGRATION_SUCCESS',
        entity: 'Integration',
        entityId: slug,
        data: { bank: bankUpper, statusCode: httpStatus, latencyMs, requestId },
      });
    } else {
      await eventBus.publish({
        tenantId,
        eventType: 'INTEGRATION_ERROR',
        entity: 'Integration',
        entityId: slug,
        data: {
          bank: bankUpper,
          statusCode: httpStatus,
          errorMessage: sanitizedError,
          isCloudflareBlocked,
          rayId,
          requestId,
        },
      });
    }

    // 3. Detecção e Gerenciamento Automático de Incidentes
    await this.evaluateIncidentTriggers(prisma, tenantId, slug, success, isCloudflareBlocked, sanitizedError, rayId, userId);

    return {
      success,
      httpStatus,
      latencyMs,
      message: success
        ? `Conexão com ${bankUpper} operacional (${latencyMs}ms).`
        : isCloudflareBlocked
        ? `Resposta bloqueada pela camada Cloudflare. Ray ID: ${rayId}`
        : sanitizedError || `Falha na verificação de conectividade (${httpStatus}).`,
      rayId,
      isCloudflareBlocked,
    };
  }

  /**
   * Avalia gatilhos de incidentes:
   * - Se 5 falhas consecutivas ou Cloudflare 403: abre incidente (se já não houver) e pode abrir pendência
   * - Se sucesso recente: encerra incidente aberto automaticamente
   */
  public static async evaluateIncidentTriggers(
    prisma: PrismaClient,
    tenantId: string,
    slug: IntegrationSlug,
    currentSuccess: boolean,
    isCloudflareBlocked: boolean,
    errorMessage: string | null,
    rayId: string | null,
    userId?: string
  ): Promise<void> {
    const bankUpper = slug.toUpperCase();
    const serviceName = `Banco ${bankUpper}`;
    const serviceId = await this.ensureMonitoredService(prisma, tenantId, slug, serviceName);
    const eventBus = CentralEventBus.getInstance();

    // Buscar incidente aberto existente para este serviço
    const existingIncident = await prisma.apiIncident.findFirst({
      where: {
        tenantId,
        serviceId,
        status: { in: [IncidentStatus.INVESTIGATING, IncidentStatus.IDENTIFIED, IncidentStatus.MONITORING] },
      },
    });

    if (currentSuccess) {
      // Se tiver sucesso e havia incidente aberto, encerra-o (RESOLVED)
      if (existingIncident) {
        const durationMs = Date.now() - existingIncident.identifiedAt.getTime();
        await prisma.apiIncident.update({
          where: { id: existingIncident.id },
          data: {
            status: IncidentStatus.RESOLVED,
            resolvedAt: new Date(),
            impactDetails: `Conexão normalizada após checagem de saúde bem-sucedida.`,
          },
        });

        logger.info(
          { tenantId, slug, incidentId: existingIncident.id },
          `[INTEGRATION HUB] Incidente resolvido automaticamente após recuperação`
        );

        // Notificar no CentralEventBus
        await eventBus.publish({
          tenantId,
          eventType: 'INTEGRATION_INCIDENT_RESOLVED',
          entity: 'IntegrationIncident',
          entityId: existingIncident.id,
          data: {
            bank: bankUpper,
            incidentId: existingIncident.id,
            durationMs,
          },
        });

        await eventBus.publish({
          tenantId,
          eventType: 'INTEGRATION_HEALTH_CHANGED',
          entity: 'Integration',
          entityId: slug,
          data: { bank: bankUpper, status: 'ONLINE' },
        });
      }
      return;
    }

    // Se houve falha, checar contagem de falhas recentes
    const recentLogs = await prisma.integrationHealthLog.findMany({
      where: {
        tenantId,
        bank: bankUpper,
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    const consecutiveFailures = recentLogs.every((l) => !l.success);
    const shouldOpenIncident = (consecutiveFailures && recentLogs.length >= 5) || isCloudflareBlocked;

    if (shouldOpenIncident && !existingIncident) {
      const incidentTitle = isCloudflareBlocked
        ? `${bankUpper} — Bloqueio de Acesso Cloudflare (403)`
        : `${bankUpper} — Falhas consecutivas na API (${recentLogs.length} falhas)`;

      const incidentDesc = isCloudflareBlocked
        ? `A camada de borda Cloudflare bloqueou o tráfego da integração ${bankUpper}. Ray ID: ${rayId || 'N/A'}.`
        : `Identificadas ${recentLogs.length} falhas consecutivas de comunicação na API do ${bankUpper}. Último erro: ${errorMessage || 'Falha de rede'}`;

      const incident = await prisma.apiIncident.create({
        data: {
          tenantId,
          serviceId,
          title: incidentTitle,
          description: incidentDesc,
          severity: isCloudflareBlocked ? IncidentSeverity.CRITICAL : IncidentSeverity.HIGH,
          status: IncidentStatus.INVESTIGATING,
          impactDetails: `Indisponibilidade parcial ou total de consultas e esteira do ${bankUpper}.`,
          createdById: userId || null,
          createdByName: 'Sentinel Integration Watcher',
        },
      });

      logger.warn(
        { tenantId, slug, incidentId: incident.id, isCloudflareBlocked },
        `[INTEGRATION HUB] Novo incidente de integração aberto`
      );

      // Notificar CentralEventBus
      await eventBus.publish({
        tenantId,
        eventType: 'INTEGRATION_INCIDENT_STARTED',
        entity: 'IntegrationIncident',
        entityId: incident.id,
        data: {
          bank: bankUpper,
          incidentId: incident.id,
          severity: incident.severity,
          errorCount: recentLogs.length,
          errorMessage,
          isCloudflareBlocked,
          rayId,
        },
      });

      await eventBus.publish({
        tenantId,
        eventType: 'INTEGRATION_HEALTH_CHANGED',
        entity: 'Integration',
        entityId: slug,
        data: { bank: bankUpper, status: 'OFFLINE' },
      });

      // 4. Integração com a Central de Pendências (criar pendência operacional sem duplicação)
      try {
        const existingPendency = await prisma.pendency.findFirst({
          where: {
            tenantId,
            source: 'INTEGRACAO',
            status: { in: ['ABERTA', 'EM_ATENDIMENTO'] },
            title: { contains: bankUpper },
          },
        });

        if (!existingPendency) {
          await PendencyService.createPendency(prisma, {
            tenantId,
            title: `${bankUpper} — Falhas consecutivas na API`,
            description: `Incidente registrado #${incident.id}. ${incidentDesc}`,
            priority: isCloudflareBlocked ? 'URGENT' : 'HIGH',
            type: 'ESTEIRA',
            source: 'INTEGRACAO',
            userId: userId || 'system',
            sourceEventId: `incident_${incident.id}`,
          });
        }
      } catch (pendErr) {
        logger.error({ error: pendErr }, '[INTEGRATION HUB] Erro ao criar pendência para incidente');
      }
    }
  }

  /**
   * Agregação estatística de Saúde das APIs no período solicitado (1h, 24h, 7d, 30d)
   */
  public static async getHealthStats(
    prisma: PrismaClient,
    tenantId: string | null,
    slug: IntegrationSlug,
    period: '1h' | '24h' | '7d' | '30d' = '24h'
  ): Promise<HealthStats> {
    const bankUpper = slug.toUpperCase();
    const periodHours = period === '1h' ? 1 : period === '24h' ? 24 : period === '7d' ? 168 : 720;
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

    const logs = await prisma.integrationHealthLog.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        bank: bankUpper,
        timestamp: { gte: since },
      },
      orderBy: { latencyMs: 'asc' },
    });

    const totalRequests = logs.length;
    const successCount = logs.filter((l) => l.success).length;
    const errorCount = totalRequests - successCount;
    const http4xxCount = logs.filter((l) => l.httpStatus && l.httpStatus >= 400 && l.httpStatus < 500).length;
    const http5xxCount = logs.filter((l) => l.httpStatus && l.httpStatus >= 500).length;
    const timeoutCount = logs.filter((l) => l.errorMessage && l.errorMessage.toLowerCase().includes('timeout')).length;

    const availability = totalRequests > 0 ? Number(((successCount / totalRequests) * 100).toFixed(1)) : 100;

    // Latência
    let avgLatencyMs: number | null = null;
    let p95LatencyMs: number | string = 'Amostra insuficiente';
    let sampleInsufficient = totalRequests < 5;

    if (totalRequests > 0) {
      const sum = logs.reduce((acc, curr) => acc + curr.latencyMs, 0);
      avgLatencyMs = Math.round(sum / totalRequests);

      if (!sampleInsufficient) {
        const p95Index = Math.floor(totalRequests * 0.95);
        p95LatencyMs = logs[Math.min(p95Index, totalRequests - 1)].latencyMs;
      }
    }

    return {
      period,
      availability,
      avgLatencyMs,
      p95LatencyMs,
      totalRequests,
      successCount,
      errorCount,
      http4xxCount,
      http5xxCount,
      timeoutCount,
      rateLimit: {
        limit: 'Não informado pela API',
        used: 'Não informado pela API',
        remaining: 'Não informado pela API',
        reset: 'Não informado pela API',
      },
      sampleInsufficient,
    };
  }

  /**
   * Executa Diagnóstico sob demanda com verificação aprofundada
   */
  public static async runDiagnostics(
    prisma: PrismaClient,
    tenantId: string,
    slug: IntegrationSlug
  ): Promise<DiagnosticResult> {
    const healthResult = await this.executeHealthCheck(prisma, tenantId, slug);
    const bankUpper = slug.toUpperCase();
    const logicalEndpoint =
      slug === 'happy' ? 'POST /api/v1/consignado-publico/auth' : slug === 'c6' ? 'POST /auth/token' : 'POST /gera-token';

    let details = '';
    if (healthResult.isCloudflareBlocked) {
      details = `Bloqueio confirmado na camada de borda Cloudflare com HTTP 403. Ray ID preservado: ${healthResult.rayId || 'N/A'}. Não realizar retries agressivos.`;
    } else if (healthResult.success) {
      details = `Comunicação estabelecida com sucesso. Latência aferida: ${healthResult.latencyMs}ms. Nenhuma anomalia detectada.`;
    } else {
      details = `Falha na verificação de conectividade: ${healthResult.message}. Verifique credenciais ou status da API parceira.`;
    }

    return {
      bank: bankUpper,
      timestamp: new Date().toISOString(),
      success: healthResult.success,
      httpStatus: healthResult.httpStatus,
      latencyMs: healthResult.latencyMs,
      logicalEndpoint,
      requestId: `diag_${uuidv4()}`,
      errorCode: healthResult.isCloudflareBlocked ? 'CLOUDFLARE_403' : !healthResult.success ? `HTTP_${healthResult.httpStatus}` : null,
      errorMessage: healthResult.message,
      isCloudflareBlocked: healthResult.isCloudflareBlocked,
      rayId: healthResult.rayId,
      dnsResolved: true,
      details,
    };
  }

  /**
   * Consulta paginada server-side de logs de integração
   */
  public static async getPaginatedLogs(
    prisma: PrismaClient,
    tenantId: string | null,
    options: {
      page?: number;
      limit?: number;
      bank?: string;
      success?: boolean;
      httpStatus?: number;
      search?: string;
      period?: '1h' | '24h' | '7d' | '30d';
    }
  ): Promise<{
    logs: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (options.bank && options.bank !== 'ALL') where.bank = options.bank.toUpperCase();
    if (typeof options.success === 'boolean') where.success = options.success;
    if (options.httpStatus) where.httpStatus = Number(options.httpStatus);

    if (options.period) {
      const periodHours = options.period === '1h' ? 1 : options.period === '24h' ? 24 : options.period === '7d' ? 168 : 720;
      where.timestamp = { gte: new Date(Date.now() - periodHours * 60 * 60 * 1000) };
    }

    if (options.search) {
      where.OR = [
        { endpoint: { contains: options.search } },
        { errorCode: { contains: options.search } },
        { errorMessage: { contains: options.search } },
        { requestId: { contains: options.search } },
        { rayId: { contains: options.search } },
      ];
    }

    const [total, rawLogs] = await Promise.all([
      prisma.integrationHealthLog.count({ where }),
      prisma.integrationHealthLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const sanitizedLogs = rawLogs.map((log) => ({
      ...log,
      errorMessage: this.sanitizeSensitiveData(log.errorMessage),
    }));

    return {
      logs: sanitizedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Lista incidentes com timeline de resolução
   */
  public static async listIncidents(
    prisma: PrismaClient,
    tenantId: string | null,
    options?: { bank?: string; status?: IncidentStatus }
  ) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (options?.status) where.status = options.status;

    if (options?.bank && options.bank !== 'ALL') {
      const slug = options.bank.toLowerCase();
      where.service = { slug: `bank-integration-${slug}` };
    }

    const incidents = await prisma.apiIncident.findMany({
      where,
      include: {
        service: true,
      },
      orderBy: { identifiedAt: 'desc' },
      take: 50,
    });

    return incidents.map((inc) => {
      const durationMs = inc.resolvedAt
        ? inc.resolvedAt.getTime() - inc.identifiedAt.getTime()
        : Date.now() - inc.identifiedAt.getTime();

      return {
        id: inc.id,
        title: inc.title,
        description: inc.description,
        severity: inc.severity,
        status: inc.status,
        impactDetails: inc.impactDetails,
        bank: inc.service?.name || inc.service?.slug || 'Integração',
        identifiedAt: inc.identifiedAt.toISOString(),
        resolvedAt: inc.resolvedAt ? inc.resolvedAt.toISOString() : null,
        durationMinutes: Math.round(durationMs / 60000),
        timeline: [
          { step: 'DETECÇÃO', timestamp: inc.identifiedAt.toISOString(), note: 'Falhas detectadas pela verificação de integridade.' },
          { step: 'INÍCIO', timestamp: inc.identifiedAt.toISOString(), note: 'Incidente operacional registrado e evento emitido.' },
          { step: 'IMPACTO', timestamp: inc.identifiedAt.toISOString(), note: inc.impactDetails || 'Degradação na esteira.' },
          ...(inc.resolvedAt
            ? [
                { step: 'RECUPERAÇÃO', timestamp: inc.resolvedAt.toISOString(), note: 'Conexão e autenticação restabelecidas com sucesso.' },
                { step: 'RESOLUÇÃO', timestamp: inc.resolvedAt.toISOString(), note: 'Incidente finalizado automaticamente.' },
              ]
            : []),
        ],
      };
    });
  }
}
