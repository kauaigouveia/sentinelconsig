import { PrismaClient, ServiceStatus, ServiceCriticality, IncidentSeverity, IncidentStatus, PriorityLevel } from '@prisma/client';
import { logger } from '../logger.js';

export interface DefaultServiceSeed {
  name: string;
  slug: string;
  category: string;
  description: string;
  criticality: ServiceCriticality;
  endpointUrl?: string;
}

const DEFAULT_SERVICES: DefaultServiceSeed[] = [
  {
    name: 'Dataprev (Consulta de Margem & Benefício INSS)',
    slug: 'dataprev-inss',
    category: 'GOVERNMENT',
    description: 'Consulta de margens consignáveis, benefícios concedidos e elegibilidade previdenciária.',
    criticality: 'CRITICAL',
    endpointUrl: 'https://extrato.dataprev.gov.br/api/health',
  },
  {
    name: 'CIP - Câmara Interbancária (Portabilidade & STR)',
    slug: 'cip-portabilidade',
    category: 'BANK',
    description: 'Troca de mensagens financeiras, Dwell time, solicitações de saldo devedor e retenções.',
    criticality: 'CRITICAL',
    endpointUrl: 'https://cip-barramento.cip-bancos.org.br/health',
  },
  {
    name: 'Barramento Banco Pan (Esteira & Formalização)',
    slug: 'banco-pan-api',
    category: 'BANK',
    description: 'Integração direta com o barramento do Banco Pan para digitação e esteira de crédito.',
    criticality: 'HIGH',
    endpointUrl: 'https://api.bancopan.com.br/credito/v1/health',
  },
  {
    name: 'Barramento Banco Daycoval',
    slug: 'banco-daycoval-api',
    category: 'BANK',
    description: 'Esteira de consignado, simulação e averbação Banco Daycoval.',
    criticality: 'HIGH',
    endpointUrl: 'https://servicos.daycoval.com.br/api/consignado/health',
  },
  {
    name: 'Barramento Banco BMG',
    slug: 'banco-bmg-api',
    category: 'BANK',
    description: 'Conexão para cartão RMC/RCC e propostas consignadas BMG.',
    criticality: 'HIGH',
    endpointUrl: 'https://api.bancobmg.com.br/status',
  },
  {
    name: 'Barramento Banco Facta Financeira',
    slug: 'banco-facta-api',
    category: 'BANK',
    description: 'Digitação de contratos, esteira automatizada e averbações Facta.',
    criticality: 'MEDIUM',
    endpointUrl: 'https://api.facta.com.br/health',
  },
  {
    name: 'Consulta Receita Federal / CPF & Regularidade',
    slug: 'receita-federal-cpf',
    category: 'GOVERNMENT',
    description: 'Validação cadastral de situação cadastral e óbitos na base governamental.',
    criticality: 'HIGH',
    endpointUrl: 'https://servicos.receita.fazenda.gov.br/api/cpf/status',
  },
  {
    name: 'Azure Blob Storage (Repositório de Documentos)',
    slug: 'azure-blob-storage',
    category: 'STORAGE',
    description: 'Armazenamento seguro, upload e download de CNH, RG e comprovantes de clientes.',
    criticality: 'HIGH',
    endpointUrl: 'https://sentinelstorage.blob.core.windows.net',
  },
  {
    name: 'API Sentinel & PostgreSQL',
    slug: 'realtime-pusher-sse',
    category: 'INTERNAL',
    description: 'Endpoint interno para verificar disponibilidade da API e conexão PostgreSQL.',
    criticality: 'HIGH',
    endpointUrl: '/api/health',
  },
  {
    name: 'Sentinela AI Engine (Google Gemini 3.8 Flash)',
    slug: 'sentinela-ai-gemini',
    category: 'AI',
    description: 'Processamento analítico, diagnóstico gerencial e assistente operacional inteligente.',
    criticality: 'MEDIUM',
    endpointUrl: 'https://generativelanguage.googleapis.com',
  },
];

type MonitorStatus = ServiceStatus | 'UNKNOWN';
type ProbeResult = {
  status: MonitorStatus;
  latencyMs: number | null;
  httpStatus?: number;
  message: string;
};

const CHECK_FRESHNESS_FLOOR_MS = 5 * 60 * 1000;

function isProbeFresh(service: { lastCheckedAt: Date | null; checkIntervalSec: number }, now = Date.now()) {
  if (!service.lastCheckedAt) return false;
  const freshnessWindow = Math.max(CHECK_FRESHNESS_FLOOR_MS, service.checkIntervalSec * 3 * 1000);
  return now - service.lastCheckedAt.getTime() <= freshnessWindow;
}

function getEffectiveStatus(service: {
  status: ServiceStatus;
  lastCheckedAt: Date | null;
  lastStatusChange: Date | null;
  checkIntervalSec: number;
}, now = Date.now()): MonitorStatus {
  const manualStatusIsActive =
    service.status !== 'OPERATIONAL' &&
    service.lastStatusChange &&
    (!service.lastCheckedAt || service.lastStatusChange > service.lastCheckedAt);
  if (manualStatusIsActive) return service.status;
  return isProbeFresh(service, now) ? service.status : 'UNKNOWN';
}

function isProbeSupported(service: { slug: string; endpointUrl: string | null }) {
  if (service.endpointUrl === '/api/health') return true;
  const seed = DEFAULT_SERVICES.find((item) => item.slug === service.slug);
  if (!seed?.endpointUrl?.startsWith('https://') || !service.endpointUrl) return false;
  try {
    const configured = new URL(service.endpointUrl);
    const approved = new URL(seed.endpointUrl);
    return configured.protocol === 'https:' && configured.hostname === approved.hostname && !configured.username && !configured.password;
  } catch {
    return false;
  }
}

function presentService<T extends {
  slug: string;
  endpointUrl: string | null;
  status: ServiceStatus;
  lastCheckedAt: Date | null;
  lastStatusChange: Date | null;
  checkIntervalSec: number;
  latencyMs: number;
}>(service: T, now = Date.now()) {
  const fresh = isProbeFresh(service, now);
  const status = getEffectiveStatus(service, now);
  const { status: _storedStatus, ...serviceData } = service;
  return {
    ...serviceData,
    status,
    statusSource: fresh ? 'CHECK' as const : status === 'UNKNOWN' ? 'UNKNOWN' as const : 'MANUAL' as const,
    latencyMs: fresh ? service.latencyMs : null,
    uptimePercent: null,
    probeSupported: isProbeSupported(service),
  };
}

export class ApiMonitoringService {
  /**
   * Garante a existência dos serviços monitorados iniciais para o tenant
   */
  public static async ensureSeedServices(prisma: PrismaClient, tenantId: string | null) {
    try {
      const existingCount = await prisma.monitoredService.count({
        where: { tenantId },
      });

      if (existingCount === 0) {
        logger.info({ tenantId }, '[API MONITORING] Inicializando serviços de monitoramento padrão');
        for (const seed of DEFAULT_SERVICES) {
          await prisma.monitoredService.create({
            data: {
              tenantId,
              name: seed.name,
              slug: seed.slug,
              category: seed.category,
              description: seed.description,
              endpointUrl: seed.endpointUrl,
              status: 'OPERATIONAL',
              criticality: seed.criticality,
              latencyMs: 0,
              uptimePercent: 0,
              lastCheckedAt: null,
              lastStatusChange: null,
              checkIntervalSec: 60,
              isActive: true,
            },
          });
        }
      }
    } catch (err) {
      logger.error({ err, tenantId }, '[API MONITORING] Erro ao garantir serviços iniciais');
    }
  }

  /**
   * Lista todos os serviços monitorados com filtros de tenant
   */
  public static async listServices(prisma: PrismaClient, tenantId: string | null) {
    await this.ensureSeedServices(prisma, tenantId);

    const services = await prisma.monitoredService.findMany({
      where: {
        OR: [
          { tenantId: null },
          { tenantId },
        ],
        isActive: true,
      },
      include: {
        incidents: {
          where: {
            status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] },
          },
          orderBy: { identifiedAt: 'desc' },
          take: 3,
        },
      },
      orderBy: [
        { status: 'desc' }, // OUTAGE e DEGRADED no topo
        { criticality: 'desc' },
        { name: 'asc' },
      ],
    });

    return services.map((service) => presentService(service));
  }

  /**
   * Visão geral de saúde do ecossistema de APIs
   */
  public static async getSystemHealthOverview(prisma: PrismaClient, tenantId: string | null) {
    await this.ensureSeedServices(prisma, tenantId);

    const services = await prisma.monitoredService.findMany({
      where: {
        OR: [
          { tenantId: null },
          { tenantId },
        ],
        isActive: true,
      },
    });

    const activeIncidents = await prisma.apiIncident.findMany({
      where: {
        OR: [
          { tenantId: null },
          { tenantId },
        ],
        status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] },
      },
      include: {
        service: {
          select: { name: true, slug: true, category: true },
        },
      },
      orderBy: { identifiedAt: 'desc' },
    });

    const total = services.length;
    const presented = services.map((service) => presentService(service));
    const operational = presented.filter((s) => s.status === 'OPERATIONAL').length;
    const degraded = presented.filter((s) => s.status === 'DEGRADED').length;
    const outage = presented.filter((s) => s.status === 'OUTAGE').length;
    const maintenance = presented.filter((s) => s.status === 'MAINTENANCE').length;
    const unknown = presented.filter((s) => s.status === 'UNKNOWN').length;
    const checkedServices = presented.filter((s) => s.statusSource === 'CHECK' && s.latencyMs !== null);
    const avgLatency = checkedServices.length > 0
      ? Math.round(checkedServices.reduce((acc, s) => acc + (s.latencyMs || 0), 0) / checkedServices.length)
      : null;

    let overallStatus: MonitorStatus = unknown === total ? 'UNKNOWN' : 'OPERATIONAL';
    if (outage > 0) {
      overallStatus = 'OUTAGE';
    } else if (degraded > 0) {
      overallStatus = 'DEGRADED';
    } else if (maintenance > 0 && operational === 0) {
      overallStatus = 'MAINTENANCE';
    } else if (unknown > 0) {
      overallStatus = 'UNKNOWN';
    }

    return {
      overallStatus,
      totalServices: total,
      operational,
      degraded,
      outage,
      maintenance,
      unknown,
      averageLatencyMs: avgLatency,
      averageUptimePercent: null,
      activeIncidentsCount: activeIncidents.length,
      activeIncidents,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Executa um health check real. Alvos externos são limitados ao host aprovado
   * para o serviço; para o endpoint interno, o ping consulta o próprio PostgreSQL.
   */
  private static async probeService(prisma: PrismaClient, service: {
    id: string;
    slug: string;
    name: string;
    endpointUrl: string | null;
  }): Promise<ProbeResult> {
    const startedAt = Date.now();
    if (service.endpointUrl === '/api/health') {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: 'OPERATIONAL',
          latencyMs: Date.now() - startedAt,
          httpStatus: 200,
          message: 'API e conexão PostgreSQL responderam ao health check.',
        };
      } catch {
        return { status: 'OUTAGE', latencyMs: Date.now() - startedAt, message: 'A consulta de saúde do PostgreSQL falhou.' };
      }
    }

    const approvedSeed = DEFAULT_SERVICES.find((item) => item.slug === service.slug);
    if (!service.endpointUrl || !approvedSeed?.endpointUrl?.startsWith('https://') || !isProbeSupported(service)) {
      return {
        status: 'UNKNOWN',
        latencyMs: null,
        message: 'Endpoint não testado: configure um host HTTPS aprovado para este serviço.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(service.endpointUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      const latencyMs = Date.now() - startedAt;
      await response.body?.cancel().catch(() => undefined);
      const status: MonitorStatus = response.status < 300
        ? 'OPERATIONAL'
        : response.status < 500
          ? 'DEGRADED'
          : 'OUTAGE';
      return {
        status,
        latencyMs,
        httpStatus: response.status,
        message: `O endpoint respondeu com HTTP ${response.status} em ${latencyMs}ms.`,
      };
    } catch (error: any) {
      const timedOut = error?.name === 'AbortError';
      return {
        status: 'OUTAGE',
        latencyMs: Date.now() - startedAt,
        message: timedOut ? 'O endpoint não respondeu dentro de 8 segundos.' : 'Não foi possível conectar ao endpoint HTTPS aprovado.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private static async persistProbeResult(prisma: PrismaClient, service: {
    id: string;
    status: ServiceStatus;
    lastCheckedAt: Date | null;
    lastStatusChange: Date | null;
  }, result: ProbeResult) {
    if (result.status === 'UNKNOWN' || result.latencyMs === null) return null;
    const now = new Date();
    return prisma.monitoredService.update({
      where: { id: service.id },
      data: {
        status: result.status,
        latencyMs: result.latencyMs,
        lastCheckedAt: now,
        ...(service.status !== result.status || (service.lastStatusChange && (!service.lastCheckedAt || service.lastStatusChange > service.lastCheckedAt))
          ? { lastStatusChange: now }
          : {}),
      },
    });
  }

  public static async pingService(prisma: PrismaClient, serviceId: string, tenantId: string | null) {
    const service = await prisma.monitoredService.findFirst({
      where: {
        id: serviceId,
        OR: [{ tenantId: null }, { tenantId }],
      },
    });

    if (!service) {
      throw new Error('Serviço de API não encontrado.');
    }

    const result = await this.probeService(prisma, service);
    const updated = await this.persistProbeResult(prisma, service, result);

    return {
      serviceId: service.id,
      name: service.name,
      status: result.status,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
      checkedAt: updated?.lastCheckedAt || null,
      message: result.message,
    };
  }

  /**
   * Executa verificação em lote de todos os serviços
   */
  public static async pingAllServices(prisma: PrismaClient, tenantId: string | null) {
    const services = await prisma.monitoredService.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        isActive: true,
      },
    });

    const results = await Promise.all(services.map(async (service) => {
      const result = await this.probeService(prisma, service);
      const updated = await this.persistProbeResult(prisma, service, result);
      return {
        id: service.id,
        name: service.name,
        status: result.status,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        checkedAt: updated?.lastCheckedAt || null,
        message: result.message,
      };
    }));

    return {
      checkedCount: results.filter((result) => result.checkedAt !== null).length,
      unsupportedCount: results.filter((result) => result.status === 'UNKNOWN').length,
      timestamp: new Date().toISOString(),
      services: results,
    };
  }

  /**
   * Altera status manualmente ou configura serviço (Admin/Gestores)
   */
  public static async updateService(
    prisma: PrismaClient,
    serviceId: string,
    data: {
      status?: ServiceStatus;
      criticality?: ServiceCriticality;
      description?: string;
      endpointUrl?: string;
      isActive?: boolean;
    },
    tenantId: string | null
  ) {
    const service = await prisma.monitoredService.findFirst({
      where: {
        id: serviceId,
        OR: [{ tenantId: null }, { tenantId }],
      },
    });

    if (!service) {
      throw new Error('Serviço não encontrado para alteração.');
    }

    const previousStatus = service.status;
    const isStatusChanged = data.status && data.status !== previousStatus;

    const updated = await prisma.monitoredService.update({
      where: { id: serviceId },
      data: {
        ...data,
        lastStatusChange: isStatusChanged ? new Date() : undefined,
      },
    });

    // Se houve alteração para DEGRADED ou OUTAGE, cria automaticamente um incidente ou notificação
    if (isStatusChanged && (data.status === 'OUTAGE' || data.status === 'DEGRADED') && tenantId) {
      try {
        await prisma.notification.create({
          data: {
            tenantId,
            title: `Alerta de API: ${updated.name} está ${data.status === 'OUTAGE' ? 'FORA DO AR' : 'INSTÁVEL'}`,
            message: `O serviço ${updated.name} teve seu status alterado para ${data.status}. Verifique o painel de operações para detalhes.`,
            priority: (data.status === 'OUTAGE' ? 'URGENT' : 'HIGH') as PriorityLevel,
            type: 'SYSTEM',
            eventKey: `api_status_${updated.id}_${Date.now()}`,
          },
        });
      } catch (notifErr) {
        logger.warn({ notifErr }, '[API MONITORING] Aviso ao criar notificação de status de serviço');
      }
    }

    return updated;
  }

  /**
   * Registra um incidente operacional
   */
  public static async createIncident(
    prisma: PrismaClient,
    data: {
      serviceId: string;
      title: string;
      description: string;
      severity: IncidentSeverity;
      status?: IncidentStatus;
      impactDetails?: string;
    },
    tenantId: string | null,
    user: { id: string; name: string }
  ) {
    const service = await prisma.monitoredService.findFirst({
      where: {
        id: data.serviceId,
        OR: [{ tenantId: null }, { tenantId }],
      },
    });

    if (!service) {
      throw new Error('Serviço associado ao incidente não encontrado.');
    }

    const incident = await prisma.apiIncident.create({
      data: {
        tenantId,
        serviceId: data.serviceId,
        title: data.title,
        description: data.description,
        severity: data.severity,
        status: data.status || 'INVESTIGATING',
        impactDetails: data.impactDetails,
        createdById: user.id,
        createdByName: user.name,
      },
      include: {
        service: true,
      },
    });

    // Atualiza status do serviço correspondente se for HIGH ou CRITICAL
    if (data.severity === 'CRITICAL') {
      await prisma.monitoredService.update({
        where: { id: service.id },
        data: { status: 'OUTAGE', lastStatusChange: new Date() },
      });
    } else if (data.severity === 'HIGH' && service.status === 'OPERATIONAL') {
      await prisma.monitoredService.update({
        where: { id: service.id },
        data: { status: 'DEGRADED', lastStatusChange: new Date() },
      });
    }

    // Notificação para o tenant se houver tenantId
    if (tenantId) {
      try {
        await prisma.notification.create({
          data: {
            tenantId,
            title: `Incidente Registrado: ${data.title}`,
            message: `Serviço ${service.name} afetado. Gravidade: ${data.severity}. ${data.description.substring(0, 120)}...`,
            priority: (data.severity === 'CRITICAL' ? 'URGENT' : 'HIGH') as PriorityLevel,
            type: 'SYSTEM',
            eventKey: `incident_${incident.id}_created`,
          },
        });
      } catch (e) {
        logger.warn({ err: e }, 'Erro ao notificar sobre incidente');
      }
    }

    return incident;
  }

  /**
   * Atualiza ou resolve um incidente
   */
  public static async updateIncident(
    prisma: PrismaClient,
    incidentId: string,
    data: {
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      impactDetails?: string;
      description?: string;
    },
    tenantId: string | null
  ) {
    const existing = await prisma.apiIncident.findFirst({
      where: {
        id: incidentId,
        OR: [{ tenantId: null }, { tenantId }],
      },
      include: { service: true },
    });

    if (!existing) {
      throw new Error('Incidente não encontrado.');
    }

    const isResolving = data.status === 'RESOLVED' && existing.status !== 'RESOLVED';

    const updated = await prisma.apiIncident.update({
      where: { id: incidentId },
      data: {
        ...data,
        resolvedAt: isResolving ? new Date() : undefined,
      },
      include: { service: true },
    });

    // Se resolveu o incidente, verificar se ainda há outros incidentes abertos para o serviço
    if (isResolving) {
      const remainingIncidents = await prisma.apiIncident.count({
        where: {
          serviceId: existing.serviceId,
          status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] },
        },
      });

      if (remainingIncidents === 0) {
        await prisma.monitoredService.update({
          where: { id: existing.serviceId },
          data: { status: 'OPERATIONAL', lastStatusChange: new Date() },
        });
      }
    }

    return updated;
  }

  /**
   * Lista histórico de incidentes
   */
  public static async listIncidents(
    prisma: PrismaClient,
    tenantId: string | null,
    options?: { status?: IncidentStatus; limit?: number }
  ) {
    const where: any = {
      OR: [{ tenantId: null }, { tenantId }],
    };

    if (options?.status) {
      where.status = options.status;
    }

    return await prisma.apiIncident.findMany({
      where,
      include: {
        service: {
          select: { id: true, name: true, slug: true, category: true, status: true },
        },
      },
      orderBy: { identifiedAt: 'desc' },
      take: options?.limit || 50,
    });
  }
}
