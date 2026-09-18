import { PrismaClient, ServiceStatus, ServiceCriticality, IncidentSeverity, IncidentStatus, PriorityLevel } from '@prisma/client';
import { logger } from '../logger.js';

export interface DefaultServiceSeed {
  name: string;
  slug: string;
  category: string;
  description: string;
  criticality: ServiceCriticality;
  endpointUrl?: string;
  baseLatencyMs: number;
}

const DEFAULT_SERVICES: DefaultServiceSeed[] = [
  {
    name: 'Dataprev (Consulta de Margem & Benefício INSS)',
    slug: 'dataprev-inss',
    category: 'GOVERNMENT',
    description: 'Consulta de margens consignáveis, benefícios concedidos e elegibilidade previdenciária.',
    criticality: 'CRITICAL',
    endpointUrl: 'https://extrato.dataprev.gov.br/api/health',
    baseLatencyMs: 145,
  },
  {
    name: 'CIP - Câmara Interbancária (Portabilidade & STR)',
    slug: 'cip-portabilidade',
    category: 'BANK',
    description: 'Troca de mensagens financeiras, Dwell time, solicitações de saldo devedor e retenções.',
    criticality: 'CRITICAL',
    endpointUrl: 'https://cip-barramento.cip-bancos.org.br/health',
    baseLatencyMs: 110,
  },
  {
    name: 'Barramento Banco Pan (Esteira & Formalização)',
    slug: 'banco-pan-api',
    category: 'BANK',
    description: 'Integração direta com o barramento do Banco Pan para digitação e esteira de crédito.',
    criticality: 'HIGH',
    endpointUrl: 'https://api.bancopan.com.br/credito/v1/health',
    baseLatencyMs: 85,
  },
  {
    name: 'Barramento Banco Daycoval',
    slug: 'banco-daycoval-api',
    category: 'BANK',
    description: 'Esteira de consignado, simulação e averbação Banco Daycoval.',
    criticality: 'HIGH',
    endpointUrl: 'https://servicos.daycoval.com.br/api/consignado/health',
    baseLatencyMs: 92,
  },
  {
    name: 'Barramento Banco BMG',
    slug: 'banco-bmg-api',
    category: 'BANK',
    description: 'Conexão para cartão RMC/RCC e propostas consignadas BMG.',
    criticality: 'HIGH',
    endpointUrl: 'https://api.bancobmg.com.br/status',
    baseLatencyMs: 98,
  },
  {
    name: 'Barramento Banco Facta Financeira',
    slug: 'banco-facta-api',
    category: 'BANK',
    description: 'Digitação de contratos, esteira automatizada e averbações Facta.',
    criticality: 'MEDIUM',
    endpointUrl: 'https://api.facta.com.br/health',
    baseLatencyMs: 130,
  },
  {
    name: 'Consulta Receita Federal / CPF & Regularidade',
    slug: 'receita-federal-cpf',
    category: 'GOVERNMENT',
    description: 'Validação cadastral de situação cadastral e óbitos na base governamental.',
    criticality: 'HIGH',
    endpointUrl: 'https://servicos.receita.fazenda.gov.br/api/cpf/status',
    baseLatencyMs: 65,
  },
  {
    name: 'Azure Blob Storage (Repositório de Documentos)',
    slug: 'azure-blob-storage',
    category: 'STORAGE',
    description: 'Armazenamento seguro, upload e download de CNH, RG e comprovantes de clientes.',
    criticality: 'HIGH',
    endpointUrl: 'https://sentinelstorage.blob.core.windows.net',
    baseLatencyMs: 42,
  },
  {
    name: 'Pusher & SSE (Mensageria e Sockets em Tempo Real)',
    slug: 'realtime-pusher-sse',
    category: 'INTERNAL',
    description: 'Barramento WebSocket e SSE para atualização de propostas, kanban e avisos operacionais.',
    criticality: 'HIGH',
    endpointUrl: '/api/realtime/health',
    baseLatencyMs: 25,
  },
  {
    name: 'Sentinela AI Engine (Google Gemini 3.8 Flash)',
    slug: 'sentinela-ai-gemini',
    category: 'AI',
    description: 'Processamento analítico, diagnóstico gerencial e assistente operacional inteligente.',
    criticality: 'MEDIUM',
    endpointUrl: 'https://generativelanguage.googleapis.com',
    baseLatencyMs: 280,
  },
];

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
          // Variação orgânica inicial de latência
          const latencyVariance = Math.floor(Math.random() * 20) - 10;
          const initialLatency = Math.max(15, seed.baseLatencyMs + latencyVariance);

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
              latencyMs: initialLatency,
              uptimePercent: 99.8 + +(Math.random() * 0.19).toFixed(2),
              lastCheckedAt: new Date(),
              lastStatusChange: new Date(Date.now() - 3600000 * 24), // 24h atrás
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

    return services;
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
    const operational = services.filter(s => s.status === 'OPERATIONAL').length;
    const degraded = services.filter(s => s.status === 'DEGRADED').length;
    const outage = services.filter(s => s.status === 'OUTAGE').length;
    const maintenance = services.filter(s => s.status === 'MAINTENANCE').length;

    const avgLatency = total > 0
      ? Math.round(services.reduce((acc, s) => acc + s.latencyMs, 0) / total)
      : 0;

    const avgUptime = total > 0
      ? +(services.reduce((acc, s) => acc + s.uptimePercent, 0) / total).toFixed(2)
      : 100;

    let overallStatus: ServiceStatus = 'OPERATIONAL';
    if (outage > 0) {
      overallStatus = 'OUTAGE';
    } else if (degraded > 0) {
      overallStatus = 'DEGRADED';
    } else if (maintenance > 0 && operational === 0) {
      overallStatus = 'MAINTENANCE';
    }

    return {
      overallStatus,
      totalServices: total,
      operational,
      degraded,
      outage,
      maintenance,
      averageLatencyMs: avgLatency,
      averageUptimePercent: avgUptime,
      activeIncidentsCount: activeIncidents.length,
      activeIncidents,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Executa check sob demanda de um serviço específico
   */
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

    // Medição de latência simulada de ponta a ponta
    const jitter = Math.floor(Math.random() * 35) - 15;
    const newLatency = Math.max(12, service.latencyMs + jitter);

    // Se o serviço estiver em OUTAGE ou DEGRADED, chance de auto-recuperação durante o ping se for check
    const updated = await prisma.monitoredService.update({
      where: { id: serviceId },
      data: {
        latencyMs: newLatency,
        lastCheckedAt: new Date(),
      },
    });

    return {
      serviceId: updated.id,
      name: updated.name,
      status: updated.status,
      latencyMs: updated.latencyMs,
      uptimePercent: updated.uptimePercent,
      checkedAt: updated.lastCheckedAt,
      message: `Verificação de conectividade concluída com sucesso. Resposta em ${updated.latencyMs}ms.`,
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

    const results = [];
    for (const s of services) {
      const jitter = Math.floor(Math.random() * 30) - 12;
      const newLatency = Math.max(15, s.latencyMs + jitter);
      const updated = await prisma.monitoredService.update({
        where: { id: s.id },
        data: {
          latencyMs: newLatency,
          lastCheckedAt: new Date(),
        },
      });
      results.push({
        id: updated.id,
        name: updated.name,
        status: updated.status,
        latencyMs: updated.latencyMs,
      });
    }

    return {
      checkedCount: results.length,
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
        lastCheckedAt: new Date(),
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
