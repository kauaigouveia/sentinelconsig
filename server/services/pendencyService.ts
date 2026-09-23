import { PrismaClient, Prisma, PriorityLevel, StandardStatusCategory } from '@prisma/client';
import { centralEventBus, DomainEventType } from './eventBus.js';
import { logger } from '../logger.js';
import { RuleEngineService } from './ruleEngineService.js';
import { AutomationEngine } from './automationEngine.js';

export type PendencyStatus = 'ABERTA' | 'EM_ATENDIMENTO' | 'AGUARDANDO' | 'RESOLVIDA' | 'CANCELADA';

export type SlaStatus =
  | 'DENTRO_SLA'
  | 'PROXIMO_SLA'
  | 'SLA_ESTOURADO'
  | 'RESOLVIDA'
  | 'CANCELADA'
  | 'INATIVA_TERMINAL';

export interface SlaMetrics {
  slaStatus: SlaStatus;
  elapsedHours: number;
  remainingHours: number;
  exceededHours: number;
  percentageElapsed: number;
  isBreached: boolean;
  isWarning: boolean;
  isTerminalProposal: boolean;
}

export const DEFAULT_CATEGORY_SLA_HOURS: Record<string, number> = {
  INTEGRACAO: 2,
  MARGEM: 4,
  DOCUMENTACAO: 6,
  DOCUMENTO: 6,
  DIVERGENCIA_DADOS: 6,
  DADOS_CADASTRAIS: 6,
  AVERBACAO: 12,
  BANCO: 12,
  RETENCAO: 12,
  ESTEIRA: 12,
  FORMALIZACAO: 24,
  ASSINATURA: 24,
  PENDENCIA_OPERACIONAL: 24,
  PENDENCIA_COMERCIAL: 24,
  SLA: 2,
  OUTROS: 24,
};

export const DEFAULT_PRIORITY_SLA_HOURS: Record<PriorityLevel, number> = {
  URGENT: 2,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 48,
};

export class PendencyService {
  /**
   * Obtém a matriz de SLA do tenant (ou defaults globais)
   */
  public static async getTenantSlaMatrix(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<Record<string, number>> {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: {
          tenantId_configKey: {
            tenantId,
            configKey: 'PENDENCY_SLA_CONFIG',
          },
        },
      });

      if (config?.configValue) {
        const parsed = JSON.parse(config.configValue);
        return { ...DEFAULT_CATEGORY_SLA_HOURS, ...parsed };
      }
    } catch (err: any) {
      logger.warn({ error: err?.message, tenantId }, '[PENDENCY] Falha ao ler configuração SLA do tenant; usando defaults.');
    }

    return { ...DEFAULT_CATEGORY_SLA_HOURS };
  }

  /**
   * Salva configurações de SLA customizadas para o tenant
   */
  public static async updateTenantSlaMatrix(
    prisma: PrismaClient,
    tenantId: string,
    slaMatrix: Record<string, number>
  ): Promise<Record<string, number>> {
    const validMatrix: Record<string, number> = {};
    for (const [k, v] of Object.entries(slaMatrix)) {
      const hours = parseInt(String(v), 10);
      if (!isNaN(hours) && hours > 0) {
        validMatrix[k.toUpperCase()] = hours;
      }
    }

    await prisma.systemConfig.upsert({
      where: {
        tenantId_configKey: {
          tenantId,
          configKey: 'PENDENCY_SLA_CONFIG',
        },
      },
      create: {
        tenantId,
        configKey: 'PENDENCY_SLA_CONFIG',
        configValue: JSON.stringify(validMatrix),
      },
      update: {
        configValue: JSON.stringify(validMatrix),
      },
    });

    return { ...DEFAULT_CATEGORY_SLA_HOURS, ...validMatrix };
  }

  /**
   * Calcula o prazo final de SLA considerando prioridade, categoria e configurações
   */
  public static async calculateDeadline(
    prisma: PrismaClient,
    tenantId: string,
    category: string,
    priority: PriorityLevel,
    customHours?: number | null
  ): Promise<Date> {
    if (customHours && customHours > 0) {
      return new Date(Date.now() + customHours * 3600 * 1000);
    }

    const slaMatrix = await this.getTenantSlaMatrix(prisma, tenantId);
    const catUpper = (category || 'OUTROS').toUpperCase();
    const categoryHours = slaMatrix[catUpper] || DEFAULT_CATEGORY_SLA_HOURS[catUpper] || 24;
    const priorityHours = DEFAULT_PRIORITY_SLA_HOURS[priority] || 24;

    // A menor duração entre prioridade e categoria prevalece para segurança operacional
    const effectiveHours = Math.min(categoryHours, priorityHours);

    return new Date(Date.now() + effectiveHours * 3600 * 1000);
  }

  /**
   * Verifica se a proposta vinculada está em estado terminal
   */
  public static isTerminalProposal(proposal?: {
    standardCategory?: StandardStatusCategory | null;
    status?: { finalStatus?: boolean | null; standardCategory?: StandardStatusCategory | null } | null;
  } | null): boolean {
    if (!proposal) return false;
    if (proposal.standardCategory && ['PAGO', 'CANCELADO', 'RECUSADO'].includes(proposal.standardCategory)) {
      return true;
    }
    if (proposal.status?.finalStatus) return true;
    if (proposal.status?.standardCategory && ['PAGO', 'CANCELADO', 'RECUSADO'].includes(proposal.status.standardCategory)) {
      return true;
    }
    return false;
  }

  /**
   * Calcula métricas de SLA detalhadas para uma pendência
   */
  public static calculateSlaMetrics(pendency: {
    status: string;
    createdAt: Date | string;
    slaDeadline?: Date | string | null;
    resolvedAt?: Date | string | null;
    now?: Date | number;
    proposal?: {
      standardCategory?: StandardStatusCategory | null;
      status?: { finalStatus?: boolean | null; standardCategory?: StandardStatusCategory | null } | null;
    } | null;
  }): SlaMetrics {
    const isTerminal = this.isTerminalProposal(pendency.proposal);

    if (pendency.status === 'RESOLVIDA') {
      return {
        slaStatus: 'RESOLVIDA',
        elapsedHours: 0,
        remainingHours: 0,
        exceededHours: 0,
        percentageElapsed: 100,
        isBreached: false,
        isWarning: false,
        isTerminalProposal: isTerminal,
      };
    }

    if (pendency.status === 'CANCELADA') {
      return {
        slaStatus: 'CANCELADA',
        elapsedHours: 0,
        remainingHours: 0,
        exceededHours: 0,
        percentageElapsed: 0,
        isBreached: false,
        isWarning: false,
        isTerminalProposal: isTerminal,
      };
    }

    if (isTerminal) {
      return {
        slaStatus: 'INATIVA_TERMINAL',
        elapsedHours: 0,
        remainingHours: 0,
        exceededHours: 0,
        percentageElapsed: 0,
        isBreached: false,
        isWarning: false,
        isTerminalProposal: true,
      };
    }

    const createdTime = new Date(pendency.createdAt).getTime();
    const deadlineTime = pendency.slaDeadline ? new Date(pendency.slaDeadline).getTime() : createdTime + 24 * 3600 * 1000;
    const now = pendency.now ? new Date(pendency.now).getTime() : Date.now();

    const totalDuration = Math.max(1000, deadlineTime - createdTime);
    const elapsed = Math.max(0, now - createdTime);
    const remaining = Math.max(0, deadlineTime - now);
    const isBreached = now > deadlineTime;
    const percentageElapsed = Math.min(100, Math.round((elapsed / totalDuration) * 100));

    // Aviso se faltam menos de 4 horas ou mais de 75% do tempo já decorreu
    const isWarning = !isBreached && (remaining <= 4 * 3600 * 1000 || percentageElapsed >= 75);

    let slaStatus: SlaStatus = 'DENTRO_SLA';
    if (isBreached) {
      slaStatus = 'SLA_ESTOURADO';
    } else if (isWarning) {
      slaStatus = 'PROXIMO_SLA';
    }

    return {
      slaStatus,
      elapsedHours: Math.round((elapsed / (3600 * 1000)) * 10) / 10,
      remainingHours: Math.round((remaining / (3600 * 1000)) * 10) / 10,
      exceededHours: isBreached ? Math.round(((now - deadlineTime) / (3600 * 1000)) * 10) / 10 : 0,
      percentageElapsed,
      isBreached,
      isWarning,
      isTerminalProposal: false,
    };
  }

  /**
   * Cria uma pendência com suporte completo a idempotência e cálculo de SLA
   */
  public static async createPendency(
    prisma: PrismaClient,
    params: {
      tenantId: string;
      title: string;
      description?: string | null;
      type?: string;
      priority?: PriorityLevel;
      proposalId?: string | null;
      simulationId?: string | null;
      partnerId?: string | null;
      bankId?: string | null;
      productId?: string | null;
      convenioId?: string | null;
      assignedToId?: string | null;
      slaHours?: number | null;
      source?: string;
      sourceEventId?: string | null;
      metadata?: any;
      userId?: string | null;
      userName?: string | null;
    }
  ): Promise<{ pendency: any; isDuplicate: boolean }> {
    const {
      tenantId,
      title,
      description,
      type = 'DOCUMENTACAO',
      priority = 'MEDIUM',
      proposalId,
      simulationId,
      partnerId,
      bankId,
      productId,
      convenioId,
      assignedToId,
      slaHours,
      source = 'MANUAL',
      sourceEventId,
      metadata,
      userId,
      userName,
    } = params;

    // 1. Verificação de Idempotência
    if (sourceEventId) {
      const existing = await prisma.pendency.findFirst({
        where: {
          tenantId,
          sourceEventId,
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
        },
        include: {
          proposal: true,
          assignedTo: true,
          histories: { take: 5, orderBy: { createdAt: 'desc' } },
        },
      });

      if (existing) {
        logger.info(
          { tenantId, sourceEventId, pendencyId: existing.id },
          '[PENDENCY] Idempotência detectada: pendência já existente retornada sem duplicação.'
        );
        return { pendency: existing, isDuplicate: true };
      }
    }

    // Se houver proposalId e pendência idêntica em aberto, previne duplicata automática
    if (proposalId && source !== 'MANUAL') {
      const duplicateOpen = await prisma.pendency.findFirst({
        where: {
          tenantId,
          proposalId,
          title: title.trim(),
          status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
        },
      });

      if (duplicateOpen) {
        logger.info(
          { tenantId, proposalId, title, pendencyId: duplicateOpen.id },
          '[PENDENCY] Pendência idêntica já aberta para a proposta ignorada.'
        );
        return { pendency: duplicateOpen, isDuplicate: true };
      }
    }

    // 2. Cálculo do Prazo SLA
    const slaDeadline = await this.calculateDeadline(
      prisma,
      tenantId,
      type,
      priority,
      slaHours
    );

    // 3. Criação no banco
    const created = await prisma.pendency.create({
      data: {
        tenantId,
        title: title.trim(),
        description: description ? description.trim() : null,
        type: type.trim().toUpperCase(),
        priority,
        status: 'ABERTA',
        source,
        sourceEventId: sourceEventId || null,
        metadata: metadata || null,
        proposalId: proposalId || null,
        simulationId: simulationId || null,
        partnerId: partnerId || null,
        bankId: bankId || null,
        productId: productId || null,
        convenioId: convenioId || null,
        assignedToId: assignedToId || null,
        assignedAt: assignedToId ? new Date() : null,
        slaDeadline,
        histories: {
          create: {
            tenantId,
            action: 'CRIADA',
            userId: userId || null,
            userName: userName || (source === 'MANUAL' ? 'Operador' : 'SISTEMA'),
            newStatus: 'ABERTA',
            notes: `Pendência criada via ${source}. Prazo SLA fixado para ${slaDeadline.toLocaleString('pt-BR')}.`,
          },
        },
      },
      include: {
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            contractValue: true,
            client: { select: { id: true, fullName: true, cpf: true } },
            status: { select: { id: true, name: true, color: true, finalStatus: true } },
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
        bank: { select: { id: true, name: true, code: true } },
        product: { select: { id: true, name: true } },
        convenio: { select: { id: true, name: true } },
        histories: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    // 4. Publicar evento no CentralEventBus
    await centralEventBus.publish({
      tenantId,
      eventType: 'PENDENCY_CREATED',
      entityId: created.id,
      entity: 'Pendency',
      userId: userId || null,
      userName: userName || 'SISTEMA',
      data: {
        id: created.id,
        title: created.title,
        priority: created.priority,
        status: created.status,
        proposalId: created.proposalId,
        type: created.type,
      },
      audit: true,
    }, prisma);

    // 5. Acionar motor de automações assincronamente
    this.triggerAutomationsForEvent(prisma, tenantId, 'PENDENCY_CREATED', created).catch(err => {
      logger.error({ error: err?.message, pendencyId: created.id }, '[PENDENCY] Erro nas automações de PENDENCY_CREATED');
    });

    return { pendency: created, isDuplicate: false };
  }

  /**
   * Atribui ou assume uma pendência
   */
  public static async assignPendency(
    prisma: PrismaClient,
    params: {
      id: string;
      tenantId: string;
      assignedToId: string;
      userId: string;
      userName?: string;
      notes?: string;
    }
  ): Promise<any> {
    const { id, tenantId, assignedToId, userId, userName, notes } = params;

    const existing = await prisma.pendency.findFirst({
      where: { id, tenantId },
      include: { assignedTo: true },
    });

    if (!existing) {
      throw new Error('Pendência não encontrada no tenant.');
    }

    const assignedUser = await prisma.user.findFirst({
      where: { id: assignedToId, tenantId },
      select: { id: true, name: true, email: true },
    });

    if (!assignedUser) {
      throw new Error('Usuário de destino não encontrado no tenant.');
    }

    const previousStatus = existing.status;
    const newStatus = existing.status === 'ABERTA' ? 'EM_ATENDIMENTO' : existing.status;

    const updated = await prisma.pendency.update({
      where: { id },
      data: {
        assignedToId,
        assignedAt: new Date(),
        status: newStatus,
        histories: {
          create: {
            tenantId,
            action: 'ATRIBUIDA',
            userId,
            userName: userName || 'Operador',
            previousStatus,
            newStatus,
            notes: notes ? String(notes).trim() : `Atribuída ao operador ${assignedUser.name}.`,
          },
        },
      },
      include: {
        proposal: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        histories: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    await centralEventBus.publish({
      tenantId,
      eventType: 'PENDENCY_ASSIGNED',
      entityId: updated.id,
      entity: 'Pendency',
      userId,
      userName: userName || 'Operador',
      data: {
        id: updated.id,
        assignedToId,
        assignedToName: assignedUser.name,
        status: updated.status,
      },
      audit: true,
    }, prisma);

    return updated;
  }

  /**
   * Atualiza status da pendência (com validação formal de resolução)
   */
  public static async updateStatus(
    prisma: PrismaClient,
    params: {
      id: string;
      tenantId: string;
      newStatus: PendencyStatus;
      userId: string;
      userName?: string;
      notes?: string;
      assignedToId?: string;
    }
  ): Promise<any> {
    const { id, tenantId, newStatus, userId, userName, notes, assignedToId } = params;

    const existing = await prisma.pendency.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new Error('Pendência não encontrada no tenant.');
    }

    if (newStatus === 'RESOLVIDA' && (!notes || notes.trim().length < 3)) {
      throw new Error('Parecer de resolução é obrigatório para baixar a pendência.');
    }

    const isResolved = newStatus === 'RESOLVIDA';
    const isCancelled = newStatus === 'CANCELADA';
    const isReopened = (existing.status === 'RESOLVIDA' || existing.status === 'CANCELADA') &&
      (newStatus === 'ABERTA' || newStatus === 'EM_ATENDIMENTO');

    let action = 'STATUS_ALTERADO';
    let domainEvent: DomainEventType = 'PENDENCY_STATUS_CHANGED';

    if (isResolved) {
      action = 'RESOLVIDA';
      domainEvent = 'PENDENCY_RESOLVED';
    } else if (isCancelled) {
      action = 'CANCELADA';
      domainEvent = 'PENDENCY_CANCELLED';
    } else if (isReopened) {
      action = 'REABERTA';
      domainEvent = 'PENDENCY_REOPENED';
    }

    const updateData: Prisma.PendencyUpdateInput = {
      status: newStatus,
      ...(assignedToId ? { assignedTo: { connect: { id: assignedToId } } } : {}),
      ...(isResolved ? {
        resolvedAt: new Date(),
        resolvedBy: { connect: { id: userId } },
        resolution: notes ? notes.trim() : null,
      } : {}),
      ...(isReopened ? {
        resolvedAt: null,
        resolvedBy: { disconnect: true },
        resolution: null,
      } : {}),
      histories: {
        create: {
          tenantId,
          action,
          userId,
          userName: userName || 'Operador',
          previousStatus: existing.status,
          newStatus,
          notes: notes ? String(notes).trim() : `Status alterado para ${newStatus}.`,
        },
      },
    };

    const updated = await prisma.pendency.update({
      where: { id },
      data: updateData,
      include: {
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            contractValue: true,
            client: { select: { fullName: true, cpf: true } },
            status: { select: { id: true, name: true, color: true, finalStatus: true } },
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
        histories: { take: 15, orderBy: { createdAt: 'desc' } },
      },
    });

    await centralEventBus.publish({
      tenantId,
      eventType: domainEvent,
      entityId: updated.id,
      entity: 'Pendency',
      userId,
      userName: userName || 'Operador',
      data: {
        id: updated.id,
        previousStatus: existing.status,
        newStatus,
        notes,
      },
      audit: true,
    }, prisma);

    // Acionar automações pós status
    this.triggerAutomationsForEvent(prisma, tenantId, domainEvent, updated).catch(err => {
      logger.error({ error: err?.message, pendencyId: updated.id }, `[PENDENCY] Erro nas automações de ${domainEvent}`);
    });

    return updated;
  }

  /**
   * Adiciona um comentário ou registro de acompanhamento ao histórico
   */
  public static async addComment(
    prisma: PrismaClient,
    params: {
      id: string;
      tenantId: string;
      userId: string;
      userName?: string;
      notes: string;
    }
  ): Promise<any> {
    const { id, tenantId, userId, userName, notes } = params;

    if (!notes || notes.trim().length === 0) {
      throw new Error('Comentário não pode estar em branco.');
    }

    const existing = await prisma.pendency.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new Error('Pendência não encontrada no tenant.');
    }

    const history = await prisma.pendencyHistory.create({
      data: {
        tenantId,
        pendencyId: id,
        action: 'COMENTARIO',
        userId,
        userName: userName || 'Operador',
        previousStatus: existing.status,
        newStatus: existing.status,
        notes: notes.trim(),
      },
    });

    await centralEventBus.publish({
      tenantId,
      eventType: 'PENDENCY_COMMENT_ADDED',
      entityId: id,
      entity: 'Pendency',
      userId,
      userName: userName || 'Operador',
      data: {
        pendencyId: id,
        historyId: history.id,
        notes: history.notes,
      },
      audit: true,
    }, prisma);

    return history;
  }

  /**
   * Retorna resumo de métricas operacionais e de SLA para o dashboard da Central
   */
  public static async getSummary(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<{
    total: number;
    abertas: number;
    emAtendimento: number;
    aguardando: number;
    resolvidas: number;
    canceladas: number;
    dentroSla: number;
    proximoSla: number;
    slaEstourado: number;
    avgResolutionTimeHours: number;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const pendencies = await prisma.pendency.findMany({
      where: { tenantId },
      include: {
        proposal: {
          select: {
            standardCategory: true,
            status: { select: { finalStatus: true, standardCategory: true } },
          },
        },
      },
    });

    let total = pendencies.length;
    let abertas = 0;
    let emAtendimento = 0;
    let aguardando = 0;
    let resolvidas = 0;
    let canceladas = 0;
    let dentroSla = 0;
    let proximoSla = 0;
    let slaEstourado = 0;

    const byPriority: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      URGENT: 0,
    };

    const byType: Record<string, number> = {};
    let totalResolutionDurationMs = 0;
    let resolvedCountWithDuration = 0;

    for (const p of pendencies) {
      if (p.priority && byPriority[p.priority] !== undefined) {
        byPriority[p.priority]++;
      }
      const typeKey = p.type || 'OUTROS';
      byType[typeKey] = (byType[typeKey] || 0) + 1;

      if (p.status === 'ABERTA') abertas++;
      else if (p.status === 'EM_ATENDIMENTO') emAtendimento++;
      else if (p.status === 'AGUARDANDO') aguardando++;
      else if (p.status === 'RESOLVIDA') {
        resolvidas++;
        if (p.resolvedAt) {
          const duration = new Date(p.resolvedAt).getTime() - new Date(p.createdAt).getTime();
          if (duration > 0) {
            totalResolutionDurationMs += duration;
            resolvedCountWithDuration++;
          }
        }
      } else if (p.status === 'CANCELADA') {
        canceladas++;
      }

      // SLA evaluation for active pendencies
      if (['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'].includes(p.status)) {
        const metrics = this.calculateSlaMetrics(p);
        if (metrics.slaStatus === 'DENTRO_SLA') dentroSla++;
        else if (metrics.slaStatus === 'PROXIMO_SLA') proximoSla++;
        else if (metrics.slaStatus === 'SLA_ESTOURADO') slaEstourado++;
      }
    }

    const avgResolutionTimeHours =
      resolvedCountWithDuration > 0
        ? Math.round((totalResolutionDurationMs / (resolvedCountWithDuration * 3600 * 1000)) * 10) / 10
        : 0;

    return {
      total,
      abertas,
      emAtendimento,
      aguardando,
      resolvidas,
      canceladas,
      dentroSla,
      proximoSla,
      slaEstourado,
      avgResolutionTimeHours,
      byPriority,
      byType,
    };
  }

  /**
   * Monitoramento periódico de estouros e alertas de SLA
   */
  public static async monitorSlaBreaches(prisma: PrismaClient): Promise<{
    breachesDetected: number;
    warningsDetected: number;
  }> {
    const activePendencies = await prisma.pendency.findMany({
      where: {
        status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
      },
      include: {
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            standardCategory: true,
            status: { select: { finalStatus: true, standardCategory: true } },
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      take: 200,
    });

    let breachesDetected = 0;
    let warningsDetected = 0;

    for (const p of activePendencies) {
      const metrics = this.calculateSlaMetrics(p);

      if (metrics.slaStatus === 'SLA_ESTOURADO') {
        breachesDetected++;
        await centralEventBus.publish({
          tenantId: p.tenantId,
          eventType: 'PENDENCY_SLA_BREACHED',
          entityId: p.id,
          entity: 'Pendency',
          data: {
            id: p.id,
            title: p.title,
            priority: p.priority,
            exceededHours: metrics.exceededHours,
            proposalNumber: p.proposal?.proposalNumber,
          },
          audit: true,
        }, prisma);

        // Notificação idempotente
        await RuleEngineService.createNotificationIdempotent(prisma, {
          tenantId: p.tenantId,
          userId: p.assignedToId || null,
          title: `SLA Estourado: ${p.title}`,
          message: `A pendência '${p.title}' excedeu o prazo de SLA em ${metrics.exceededHours}h.`,
          linkUrl: `/pendencies`,
          windowMinutes: 180,
        });
      } else if (metrics.slaStatus === 'PROXIMO_SLA') {
        warningsDetected++;
        await centralEventBus.publish({
          tenantId: p.tenantId,
          eventType: 'PENDENCY_SLA_WARNING',
          entityId: p.id,
          entity: 'Pendency',
          data: {
            id: p.id,
            title: p.title,
            remainingHours: metrics.remainingHours,
          },
          audit: false,
        }, prisma);
      }
    }

    return { breachesDetected, warningsDetected };
  }

  /**
   * Inicializa ouvintes automáticos no CentralEventBus
   */
  public static initEventBusSubscriptions(prisma: PrismaClient): void {
    // 1. Listener de PROPOSAL_STATUS_CHANGED para pendências automáticas
    centralEventBus.subscribe('PROPOSAL_STATUS_CHANGED', async (event) => {
      try {
        const statusName = String(event.data?.statusName || event.data?.status || '').toUpperCase();
        const statusCode = String(event.data?.statusCode || '').toUpperCase();
        const standardCategory = String(event.data?.standardCategory || '').toUpperCase();

        const isPendencyStatus =
          statusName.includes('PEND') ||
          statusCode.includes('PEND') ||
          standardCategory === 'PENDENTE';

        if (isPendencyStatus && event.entityId && event.tenantId) {
          const sourceEventId = `prop_status_${event.entityId}_${event.data?.newStatusId || statusCode || 'PEND'}`;
          await PendencyService.createPendency(prisma, {
            tenantId: event.tenantId,
            title: `Pendência na Proposta: ${event.data?.proposalNumber || event.entityId} (${statusName || 'Aguardando Operador'})`,
            description: event.data?.notes || `A proposta avançou para o status ${statusName}, exigindo tratamento operacional.`,
            type: 'ESTEIRA',
            priority: 'HIGH',
            proposalId: event.entityId,
            source: 'EVENTO',
            sourceEventId,
            metadata: event.data,
            userId: event.userId,
            userName: event.userName || 'Sistema de Esteira',
          });
        }
      } catch (err: any) {
        logger.warn({ error: err?.message, eventId: event.entityId }, '[PENDENCY] Falha no listener de PROPOSAL_STATUS_CHANGED');
      }
    });

    // 2. Listener de INTEGRATION_ERROR para pendências de comunicação bancária
    centralEventBus.subscribe('INTEGRATION_ERROR', async (event) => {
      try {
        if (event.tenantId && event.data?.proposalId) {
          const sourceEventId = `int_err_${event.data.proposalId}_${event.data?.integrationName || 'INT'}`;
          await PendencyService.createPendency(prisma, {
            tenantId: event.tenantId,
            title: `Falha de Integração [${event.data?.bank || event.data?.integrationName || 'Bancária'}]: Proposta ${event.data?.proposalNumber || ''}`,
            description: event.data?.errorMessage || 'Erro retornado pela API bancária parceira.',
            type: 'INTEGRACAO',
            priority: 'HIGH',
            proposalId: event.data.proposalId,
            bankId: event.data?.bankId || null,
            source: 'INTEGRACAO',
            sourceEventId,
            metadata: event.data,
            userName: 'Hub de Integrações',
          });
        }
      } catch (err: any) {
        logger.warn({ error: err?.message }, '[PENDENCY] Falha no listener de INTEGRATION_ERROR');
      }
    });

    logger.info('[PENDENCY] Ouvintes do CentralEventBus inicializados com sucesso.');
  }

  /**
   * Integração com Central de Automação: executa regras configuradas no banco através do AutomationEngine
   */
  public static async triggerAutomationsForEvent(
    prisma: PrismaClient,
    tenantId: string,
    event: DomainEventType,
    eventData: any
  ): Promise<void> {
    try {
      if (!prisma || !prisma.automation) return;
      await AutomationEngine.processEvent(prisma, {
        tenantId,
        event,
        eventId: eventData?.id,
        origin: 'PENDENCY',
        data: eventData,
      });
    } catch (err: any) {
      logger.error({ error: err?.message, tenantId, event }, '[PENDENCY] Erro ao disparar automações de evento');
    }
  }
}
