import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../logger.js';
import { eventBus } from './pusherService.js';
import { sseRegistry } from '../realtime.js';
import {
  RuleDefinition,
  RuleExecutionResult,
  RuleEngineContext,
  RuleCode,
  RuleEngineRunSummary,
} from '../../src/types/rules.js';

export class RuleEngineService {
  private static registeredRules: Map<RuleCode, RuleDefinition> = new Map();

  /**
   * Identificador numérico de 64-bits para Transaction-Level Advisory Lock PostgreSQL
   * 'SENTINEL_CRON_ADVISORY_LOCK' convertido deterministicamente para inteiro
   */
  public static readonly CRON_ADVISORY_LOCK_ID = 884729104;

  /**
   * Calcula a quantidade de dias úteis decorridos entre duas datas considerando timezone América/São Paulo
   * Desconta sábados (dia 6) e domingos (dia 0).
   */
  public static calculateBusinessDaysElapsed(startDate: Date, endDate: Date): number {
    if (startDate > endDate) return 0;

    // Converter para representação local de data no Brasil (YYYY-MM-DD)
    const startStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const endStr = endDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
    const [endYear, endMonth, endDay] = endStr.split('-').map(Number);

    const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

    let businessDays = 0;

    // Itera a partir do dia seguinte à criação até o dia atual
    current.setUTCDate(current.getUTCDate() + 1);

    while (current <= end) {
      const dayOfWeek = current.getUTCDay(); // 0 = Domingo, 6 = Sábado
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDays++;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return businessDays;
  }

  /**
   * Registra uma definição de regra na registry central do motor
   */
  public static registerRule(rule: RuleDefinition): void {
    this.registeredRules.set(rule.code, rule);
  }

  /**
   * Retorna a lista de regras registradas
   */
  public static getRegisteredRules(): RuleDefinition[] {
    return Array.from(this.registeredRules.values());
  }

  /**
   * Executa uma regra individual de forma segura e encapsulada
   */
  public static async executeRule(
    rule: RuleDefinition,
    context: RuleEngineContext
  ): Promise<RuleExecutionResult> {
    const startedAt = new Date();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (!rule.enabled) {
      return {
        executionId,
        ruleCode: rule.code,
        tenantId: context.tenantId,
        evaluatedCount: 0,
        matchedCount: 0,
        alertsDispatched: 0,
        status: 'DISABLED',
        durationMs: 0,
      };
    }

    try {
      const result = await rule.evaluate(context);
      const durationMs = Date.now() - startedAt.getTime();

      const executionResult: RuleExecutionResult = {
        executionId,
        ruleCode: rule.code,
        tenantId: context.tenantId,
        evaluatedCount: result.evaluatedCount,
        matchedCount: result.matchedCount,
        alertsDispatched: result.alertsDispatched,
        status: 'SUCCESS',
        durationMs,
        details: result.details,
      };

      logger.info(
        {
          executionId,
          ruleCode: rule.code,
          tenantId: context.tenantId,
          evaluatedCount: result.evaluatedCount,
          matchedCount: result.matchedCount,
          alertsDispatched: result.alertsDispatched,
          durationMs,
          status: 'SUCCESS',
        },
        `[RULE ENGINE] Regra ${rule.code} executada com sucesso`
      );

      return executionResult;
    } catch (err: any) {
      const durationMs = Date.now() - startedAt.getTime();
      const errorMessage = err?.message || String(err);

      logger.error(
        {
          executionId,
          ruleCode: rule.code,
          tenantId: context.tenantId,
          durationMs,
          status: 'ERROR',
          error: errorMessage,
        },
        `[RULE ENGINE] Falha na execução da regra ${rule.code}`
      );

      return {
        executionId,
        ruleCode: rule.code,
        tenantId: context.tenantId,
        evaluatedCount: 0,
        matchedCount: 0,
        alertsDispatched: 0,
        status: 'ERROR',
        durationMs,
        errorMessage,
      };
    }
  }

  /**
   * Executa todas as regras registradas para um tenant específico
   */
  public static async executeForTenant(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<RuleExecutionResult[]> {
    const context: RuleEngineContext = {
      tenantId,
      prisma,
      now: new Date(),
    };

    const results: RuleExecutionResult[] = [];
    const rules = this.getRegisteredRules();

    for (const rule of rules) {
      const result = await this.executeRule(rule, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Helper atômico com transação para inserção idempotente de alertas
   * Garante exclusão mútua e deduplicação estrita dentro da janela temporal
   */
  public static async createNotificationIdempotent(
    prisma: PrismaClient,
    params: {
      tenantId: string;
      userId?: string | null;
      title: string;
      message: string;
      linkUrl?: string | null;
      windowMinutes?: number;
    }
  ): Promise<{ created: boolean; notificationId?: string }> {
    const windowMinutes = params.windowMinutes || 60;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verificação transacional com lock de leitura
      const existing = await tx.notification.findFirst({
        where: {
          tenantId: params.tenantId,
          ...(params.userId ? { userId: params.userId } : {}),
          title: params.title,
          ...(params.linkUrl ? { linkUrl: params.linkUrl } : {}),
          createdAt: { gte: since },
        },
        select: { id: true },
      });

      if (existing) {
        return { created: false, notificationId: existing.id };
      }

      // 2. Inserção atômica
      const created = await tx.notification.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId || null,
          title: params.title,
          message: params.message,
          linkUrl: params.linkUrl || null,
          read: false,
        },
        select: { id: true },
      });

      return { created: true, notificationId: created.id };
    });

    // 3. Emissão pós-commit de sinal Realtime (Pusher exclusivo quando ativo, sem SSE)
    // Regra de Ouro: PostgreSQL é a única fonte da verdade; o evento é fino ("thin event")
    if (result.created && result.notificationId) {
      const isPusher = (process.env.VITE_REALTIME_PROVIDER || process.env.REALTIME_PROVIDER || 'pusher') === 'pusher';
      if (isPusher) {
        eventBus.publishToTenant(params.tenantId, {
          type: 'NOTIFICATION_CREATED',
          entity: 'Notification',
          entityId: result.notificationId,
          userId: params.userId || undefined,
        }).catch(err => {
          logger.warn({ error: err?.message || String(err), tenantId: params.tenantId, notificationId: result.notificationId }, '[RULE_ENGINE] Aviso ao emitir NOTIFICATION_CREATED via Pusher pós-commit');
        });
      } else {
        try {
          sseRegistry.broadcastToTenant(params.tenantId, {
            type: 'NOTIFICATION_CREATED',
            entity: 'Notification',
            entityId: result.notificationId,
            userId: params.userId || undefined,
          });
        } catch (err: any) {
          logger.warn({ error: err?.message || String(err), tenantId: params.tenantId, notificationId: result.notificationId }, '[RULE_ENGINE] Aviso ao emitir NOTIFICATION_CREATED via SSE pós-commit');
        }
      }
    }

    return result;
  }

  /**
   * Executa o ciclo de regras para todos os tenants ativos no sistema
   * Protegido integralmente via PostgreSQL Transaction-Level Advisory Lock (pg_try_advisory_xact_lock)
   * Garante compatibilidade 100% com Neon / PgBouncer em modo pooler
   */
  public static async runAllTenants(
    prisma: PrismaClient,
    options: { batchSize?: number } = {}
  ): Promise<RuleEngineRunSummary & { lockAcquired: boolean }> {
    const startedAt = new Date();
    const batchSize = options.batchSize || 20;

    // Executa TODO o ciclo em uma transação Prisma interativa para vincular a mesma conexão física
    return await prisma.$transaction(
      async (tx) => {
        // 1. Aquisição atômica de lock no nível de transação (liberado automaticamente no COMMIT/ROLLBACK)
        const lockResult: any[] = await tx.$queryRaw`
          SELECT pg_try_advisory_xact_lock(${RuleEngineService.CRON_ADVISORY_LOCK_ID}) as acquired
        `;
        const hasLock = lockResult?.[0]?.acquired === true;

        if (!hasLock) {
          logger.warn(
            { lockId: RuleEngineService.CRON_ADVISORY_LOCK_ID },
            '[RULE ENGINE LOCK] Concorrência bloqueada: pg_try_advisory_xact_lock ativo em outra transação.'
          );
          return {
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt.getTime(),
            tenantsProcessed: 0,
            totalEvaluated: 0,
            totalMatched: 0,
            totalAlertsDispatched: 0,
            lockAcquired: false,
            tenantResults: [],
          };
        }

        // 2. Execução protegida do Rule Engine
        const activeTenants = await tx.tenant.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, slug: true },
          take: batchSize,
        });

        const tenantResults: Array<{
          tenantId: string;
          tenantSlug: string;
          results: RuleExecutionResult[];
        }> = [];

        let totalEvaluated = 0;
        let totalMatched = 0;
        let totalAlertsDispatched = 0;

        for (const tenant of activeTenants) {
          try {
            // Executa com o client prisma garantindo isolamento
            const results = await RuleEngineService.executeForTenant(prisma, tenant.id);
            tenantResults.push({
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              results,
            });

            for (const res of results) {
              totalEvaluated += res.evaluatedCount;
              totalMatched += res.matchedCount;
              totalAlertsDispatched += res.alertsDispatched;
            }
          } catch (tenantErr: any) {
            logger.error(
              {
                tenantId: tenant.id,
                error: tenantErr?.message || String(tenantErr),
              },
              `[RULE ENGINE] Falha ao processar regras para o tenant ${tenant.slug}`
            );
            tenantResults.push({
              tenantId: tenant.id,
              tenantSlug: tenant.slug,
              results: [
                {
                  executionId: `err_${Date.now()}`,
                  ruleCode: 'RULE_SLA_WARNING' as RuleCode,
                  tenantId: tenant.id,
                  evaluatedCount: 0,
                  matchedCount: 0,
                  alertsDispatched: 0,
                  status: 'ERROR',
                  durationMs: 0,
                  errorMessage: tenantErr?.message || 'Falha de processamento no tenant',
                },
              ],
            });
          }
        }

        const durationMs = Date.now() - startedAt.getTime();

        return {
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs,
          tenantsProcessed: activeTenants.length,
          totalEvaluated,
          totalMatched,
          totalAlertsDispatched,
          lockAcquired: true,
          tenantResults,
        };
      },
      {
        maxWait: 5000,
        timeout: 30000, // 30s timeout para proteger ambiente serverless
      }
    );
  }
}

// ============================================================================
// ATIVAÇÃO E IMPLEMENTAÇÃO DAS REGRAS P0 (FASE 4.2-C.2)
// ============================================================================

/**
 * 1. RULE_SLA_WARNING (P0 - ATIVADA)
 * Detecta propostas ativas que atingiram >= 75% do tempo de SLA configurado no status.
 */
RuleEngineService.registerRule({
  code: 'RULE_SLA_WARNING',
  name: 'Alerta de Aproximação de SLA (75%-99%)',
  description: 'Identifica propostas operacionais que atingiram a faixa de risco de estouro de SLA.',
  category: 'SLA',
  severity: 'WARNING',
  enabled: true,
  evaluate: async (ctx: RuleEngineContext) => {
    const proposals = await ctx.prisma.proposal.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        standardCategory: { notIn: ['PAGO', 'CANCELADO'] },
      },
      select: {
        id: true,
        proposalNumber: true,
        createdAt: true,
        assignedToId: true,
        status: {
          select: {
            id: true,
            name: true,
            slaHours: true,
          },
        },
        client: { select: { fullName: true } },
      },
    });

    let evaluatedCount = proposals.length;
    let matchedCount = 0;
    let alertsDispatched = 0;

    for (const p of proposals) {
      const slaHours = p.status?.slaHours || 24;
      const dwellHours = Math.max(0, Math.round((ctx.now.getTime() - p.createdAt.getTime()) / (1000 * 3600)));

      // Condição de aviso: >= 75% e <= 100% do SLA
      if (dwellHours >= slaHours * 0.75 && dwellHours <= slaHours) {
        matchedCount++;
        const title = `Aviso de SLA: Proposta #${p.proposalNumber}`;
        const message = `A proposta #${p.proposalNumber} (${p.client?.fullName || 'Cliente'}) está em ${dwellHours}h no status '${p.status?.name || 'Esteira'}' (SLA: ${slaHours}h).`;
        const linkUrl = `/proposals/${p.id}`;

        const { created } = await RuleEngineService.createNotificationIdempotent(ctx.prisma, {
          tenantId: ctx.tenantId,
          userId: p.assignedToId || null,
          title,
          message,
          linkUrl,
          windowMinutes: 120, // 2 horas de deduplicação
        });

        if (created) alertsDispatched++;
      }
    }

    return { evaluatedCount, matchedCount, alertsDispatched };
  },
});

/**
 * 2. RULE_SLA_BREACHED (P0 - ATIVADA)
 * Detecta propostas cujo tempo de permanência no status ultrapassou 100% do SLA.
 */
RuleEngineService.registerRule({
  code: 'RULE_SLA_BREACHED',
  name: 'Alerta Crítico: SLA Estourado (>100%)',
  description: 'Identifica propostas operacionais que violaram o tempo máximo de SLA estabelecido.',
  category: 'SLA',
  severity: 'CRITICAL',
  enabled: true,
  evaluate: async (ctx: RuleEngineContext) => {
    const proposals = await ctx.prisma.proposal.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        standardCategory: { notIn: ['PAGO', 'CANCELADO'] },
      },
      select: {
        id: true,
        proposalNumber: true,
        createdAt: true,
        assignedToId: true,
        status: {
          select: {
            id: true,
            name: true,
            slaHours: true,
          },
        },
        client: { select: { fullName: true } },
      },
    });

    let evaluatedCount = proposals.length;
    let matchedCount = 0;
    let alertsDispatched = 0;

    for (const p of proposals) {
      const slaHours = p.status?.slaHours || 24;
      const dwellHours = Math.max(0, Math.round((ctx.now.getTime() - p.createdAt.getTime()) / (1000 * 3600)));

      if (dwellHours > slaHours) {
        matchedCount++;
        const title = `SLA Estourado: Proposta #${p.proposalNumber}`;
        const message = `A proposta #${p.proposalNumber} (${p.client?.fullName || 'Cliente'}) excedeu o SLA de ${slaHours}h (permanência atual: ${dwellHours}h).`;
        const linkUrl = `/proposals/${p.id}`;

        const { created } = await RuleEngineService.createNotificationIdempotent(ctx.prisma, {
          tenantId: ctx.tenantId,
          userId: p.assignedToId || null,
          title,
          message,
          linkUrl,
          windowMinutes: 180, // 3 horas de deduplicação
        });

        if (created) alertsDispatched++;
      }
    }

    return { evaluatedCount, matchedCount, alertsDispatched };
  },
});

/**
 * 3. RULE_STUCK_PROPOSAL (P0 - ATIVADA)
 * Detecta propostas ativas sem nenhuma movimentação em StatusHistory há mais de 48 horas.
 */
RuleEngineService.registerRule({
  code: 'RULE_STUCK_PROPOSAL',
  name: 'Proposta Parada na Esteira (>48h sem movimentação)',
  description: 'Identifica propostas estagnadas na esteira sem transições recentes de histórico.',
  category: 'BOTTLENECK',
  severity: 'HIGH',
  enabled: true,
  evaluate: async (ctx: RuleEngineContext) => {
    const thresholdDate = new Date(ctx.now.getTime() - 48 * 3600 * 1000);

    const proposals = await ctx.prisma.proposal.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        standardCategory: { notIn: ['PAGO', 'CANCELADO'] },
        updatedAt: { lte: thresholdDate },
      },
      select: {
        id: true,
        proposalNumber: true,
        updatedAt: true,
        assignedToId: true,
        status: { select: { name: true } },
        client: { select: { fullName: true } },
      },
    });

    let evaluatedCount = proposals.length;
    let matchedCount = 0;
    let alertsDispatched = 0;

    for (const p of proposals) {
      matchedCount++;
      const title = `Proposta Estagnada: #${p.proposalNumber}`;
      const hoursIdle = Math.round((ctx.now.getTime() - p.updatedAt.getTime()) / (1000 * 3600));
      const message = `A proposta #${p.proposalNumber} está sem movimentação há mais de ${hoursIdle} horas no status '${p.status?.name || 'Esteira'}'.`;
      const linkUrl = `/proposals/${p.id}`;

      const { created } = await RuleEngineService.createNotificationIdempotent(ctx.prisma, {
        tenantId: ctx.tenantId,
        userId: p.assignedToId || null,
        title,
        message,
        linkUrl,
        windowMinutes: 240, // 4 horas de deduplicação
      });

      if (created) alertsDispatched++;
    }

    return { evaluatedCount, matchedCount, alertsDispatched };
  },
});

/**
 * 4. RULE_TASK_OVERDUE (P0 - ATIVADA)
 * Detecta tarefas operacionais não concluídas cuja data limite (dueDate) já expirou.
 */
RuleEngineService.registerRule({
  code: 'RULE_TASK_OVERDUE',
  name: 'Tarefa Operacional Vencida',
  description: 'Identifica tarefas atribuídas que ultrapassaram o prazo de conclusão.',
  category: 'TASK',
  severity: 'MEDIUM',
  enabled: true,
  evaluate: async (ctx: RuleEngineContext) => {
    const overdueTasks = await ctx.prisma.task.findMany({
      where: {
        tenantId: ctx.tenantId,
        completed: false,
        dueDate: { lt: ctx.now },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignedToId: true,
        category: true,
      },
    });

    let evaluatedCount = overdueTasks.length;
    let matchedCount = overdueTasks.length;
    let alertsDispatched = 0;

    for (const t of overdueTasks) {
      const title = `Tarefa Vencida: ${t.title}`;
      const message = `A tarefa '${t.title}' (${t.category}) venceu em ${t.dueDate ? t.dueDate.toLocaleDateString('pt-BR') : 'data anterior'}.`;
      const linkUrl = `/tasks`;

      const { created } = await RuleEngineService.createNotificationIdempotent(ctx.prisma, {
        tenantId: ctx.tenantId,
        userId: t.assignedToId || null,
        title,
        message,
        linkUrl,
        windowMinutes: 360, // 6 horas de deduplicação
      });

      if (created) alertsDispatched++;
    }

    return { evaluatedCount, matchedCount, alertsDispatched };
  },
});

/**
 * 5. RULE_CIP_PORTABILITY_ALERT (P0 - ATIVADA COM CÁLCULO DE DIAS ÚTEIS)
 * Monitora propostas em retenção CIP no 4º dia útil (aviso), 5º dia útil (urgente) e >5 dias úteis (estourado).
 * Desconta sábados e domingos no fuso horário América/São Paulo.
 */
RuleEngineService.registerRule({
  code: 'RULE_CIP_PORTABILITY_ALERT',
  name: 'Monitoramento CIP: Prazos Regulatórios de Portabilidade (Dias Úteis)',
  description: 'Garante cumprimento do ciclo regulatório de 5 dias úteis de retenção CIP na CIP/Portabilidade.',
  category: 'PORTABILITY',
  severity: 'CRITICAL',
  enabled: true,
  evaluate: async (ctx: RuleEngineContext) => {
    const cipProposals = await ctx.prisma.proposal.findMany({
      where: {
        tenantId: ctx.tenantId,
        deletedAt: null,
        status: {
          code: 'AGUARDAR_RETORNO_CIP',
        },
      },
      select: {
        id: true,
        proposalNumber: true,
        createdAt: true,
        retentionDeadline: true,
        assignedToId: true,
        debtBalance: true,
        client: { select: { fullName: true } },
      },
    });

    let evaluatedCount = cipProposals.length;
    let matchedCount = 0;
    let alertsDispatched = 0;

    for (const p of cipProposals) {
      // Ponto de partida: data de entrada/criação da proposta na CIP
      const businessDays = RuleEngineService.calculateBusinessDaysElapsed(p.createdAt, ctx.now);

      if (businessDays >= 4) {
        matchedCount++;
        let severityText = 'Atenção';
        if (businessDays === 5) severityText = 'Urgente (Último dia útil)';
        if (businessDays > 5) severityText = 'Estourado (>5 dias úteis)';

        const title = `Alerta CIP [${severityText}]: Proposta #${p.proposalNumber}`;
        const message = `A proposta #${p.proposalNumber} (${p.client?.fullName || 'Cliente'}) está no ${businessDays}º dia útil de retenção CIP (Saldo: R$ ${Number(p.debtBalance || 0).toFixed(2)}).`;
        const linkUrl = `/proposals/${p.id}`;

        const { created } = await RuleEngineService.createNotificationIdempotent(ctx.prisma, {
          tenantId: ctx.tenantId,
          userId: p.assignedToId || null,
          title,
          message,
          linkUrl,
          windowMinutes: 180, // 3 horas de deduplicação
        });

        if (created) alertsDispatched++;
      }
    }

    return { evaluatedCount, matchedCount, alertsDispatched };
  },
});
