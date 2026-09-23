import { Prisma, PrismaClient, PriorityLevel } from '@prisma/client';
import { logger } from '../logger.js';
import { sseRegistry } from '../realtime.js';

export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * BusinessNotificationService
 *
 * Responsável pela persistência durável e emissão pós-commit
 * de notificações para eventos de negócio (FASE 9.2-B.3):
 * - TASK_CREATED
 * - COMMENT_ADDED
 * - STATUS_CHANGED
 *
 * Arquitetura de Garantia:
 * TRANSAÇÃO DE NEGÓCIO (Commit isolado e prioritário)
 *         ↓
 *      COMMIT
 *         ↓
 * PERSISTÊNCIA DA NOTIFICATION (Idempotente via UNIQUE(tenant_id, event_key))
 *         ↓
 *  PUSHER (thin event pós-persistência)
 *
 * Se houver concorrência e colisão P2002:
 * - O evento é considerado já processado (idempotência satisfeita).
 * - A operação principal NUNCA sofre rollback.
 * - Savepoints opcionais evitam abort de transação caso seja invocado in-tx.
 */
export class BusinessNotificationService {
  /**
   * Helper seguro de persistência de notificação com proteção contra P2002.
   * Se chamado dentro de uma transação aberta (tx), utiliza SAVEPOINT e ROLLBACK TO SAVEPOINT
   * para impedir que o PostgreSQL marque a transação como 25P02 (aborted).
   * Se chamado pós-commit (prisma autocommit), captura P2002 de forma limpa.
   */
  private static async safeCreateNotification(
    client: DbClient,
    tenantId: string,
    eventKey: string,
    data: Parameters<PrismaClient['notification']['create']>[0]['data']
  ): Promise<{ id: string; userId: string | null } | null> {
    const isTx =
      typeof (client as any).$transaction === 'undefined' &&
      typeof (client as any).$executeRawUnsafe === 'function';
    const spName = isTx ? `sp_${Math.random().toString(36).slice(2, 8)}` : null;

    if (isTx && spName) {
      try {
        await (client as any).$executeRawUnsafe(`SAVEPOINT ${spName};`);
      } catch (_) {}
    }

    try {
      const created = await client.notification.create({
        data,
        select: { id: true, userId: true },
      });

      if (isTx && spName) {
        try {
          await (client as any).$executeRawUnsafe(`RELEASE SAVEPOINT ${spName};`);
        } catch (_) {}
      }

      return created;
    } catch (err: any) {
      if (isTx && spName) {
        try {
          await (client as any).$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${spName};`);
        } catch (_) {}
      }

      if (err?.code === 'P2002') {
        logger.info(
          { tenantId, eventKey },
          '[BUSINESS_NOTIFICATION] Idempotência concorrente satisfeita via eventKey (P2002 absorvido com segurança)'
        );
        return null;
      }

      throw err;
    }
  }

  /**
   * Emite sinal realtime leve (thin event) pós-commit.
   * Não trafega dados sensíveis (apenas entityId, entity e timestamp).
   * Se Pusher falhar, a notificação já está persistida com segurança no PostgreSQL.
   */
  public static emitNotificationCreated(
    tenantId: string,
    notificationId: string,
    userId?: string | null
  ): void {
    try {
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'NOTIFICATION_CREATED',
        entity: 'Notification',
        entityId: notificationId,
        userId: userId || undefined,
      });
    } catch (err: any) {
      logger.warn(
        { error: err?.message || String(err), tenantId, notificationId },
        '[BUSINESS_NOTIFICATION] Aviso ao emitir NOTIFICATION_CREATED pós-commit'
      );
    }
  }

  /**
   * TASK_CREATED:
   * Cria notificação persistida quando a tarefa possui assignedToId válido e diferente do criador.
   * Não cria notificação se assignedToId for null.
   * Deduplicação determinística baseada no ID da tarefa e destinatário.
   */
  public static async onTaskCreated(
    client: DbClient,
    params: {
      tenantId: string;
      creatorUserId: string;
      task: {
        id: string;
        title: string;
        priority?: string | null;
        assignedToId?: string | null;
        proposalId?: string | null;
      };
    }
  ): Promise<{ id: string; userId: string | null } | null> {
    const { tenantId, creatorUserId, task } = params;

    // Regra: Não criar Notification se assignedToId == null
    if (!task.assignedToId) {
      return null;
    }

    // Regra: Excluir o próprio criador caso ele seja o destinatário
    if (task.assignedToId === creatorUserId) {
      return null;
    }

    // Validação estrita de isolamento de tenant e existência do usuário
    const assignee = await client.user.findFirst({
      where: {
        id: task.assignedToId,
        tenantId,
        active: true,
      },
      select: { id: true },
    });

    if (!assignee) {
      return null;
    }

    const linkUrl = task.proposalId
      ? `/proposals/${task.proposalId}?taskId=${task.id}`
      : `/tasks?taskId=${task.id}`;

    const eventKey = `task_created:${task.id}:${assignee.id}`;

    // Verificação preliminar em leitura
    const existing = await client.notification.findFirst({
      where: {
        tenantId,
        eventKey,
      },
      select: { id: true, userId: true },
    });

    if (existing) {
      return null;
    }

    const priorityMap: Record<string, PriorityLevel> = {
      LOW: 'LOW',
      MEDIUM: 'MEDIUM',
      HIGH: 'HIGH',
      URGENT: 'URGENT',
    };
    const priority: PriorityLevel =
      (task.priority && priorityMap[task.priority]) || 'MEDIUM';

    return await this.safeCreateNotification(client, tenantId, eventKey, {
      tenantId,
      userId: assignee.id,
      title: 'Nova Tarefa Atribuída',
      message: `Você foi designado como responsável pela tarefa: "${task.title}".`,
      linkUrl,
      eventKey,
      priority,
      type: 'TASK',
      proposalId: task.proposalId || null,
      read: false,
    });
  }

  /**
   * COMMENT_ADDED:
   * Determina destinatários por prioridade a partir de relações existentes:
   * 1. proposal.assignedToId
   * 2. proposal.createdById
   * Exclui o autor do comentário e destinatários duplicados.
   * Deduplicação determinística baseada no ID do comentário e destinatário.
   */
  public static async onCommentAdded(
    client: DbClient,
    params: {
      tenantId: string;
      authorUserId: string;
      authorName: string;
      proposal: {
        id: string;
        proposalNumber?: string | null;
        assignedToId?: string | null;
        createdById?: string | null;
      };
      comment: {
        id: string;
        text: string;
      };
    }
  ): Promise<Array<{ id: string; userId: string | null }>> {
    const { tenantId, authorUserId, authorName, proposal, comment } = params;

    // Determinar destinatários a partir de relações existentes (prioridade: assignedTo, createdBy)
    const candidateIds = [proposal.assignedToId, proposal.createdById].filter(
      (uid): uid is string => Boolean(uid) && uid !== authorUserId
    );

    // Deduplicação de destinatários (ex: se assignedTo for o mesmo que createdBy)
    const uniqueCandidateIds = Array.from(new Set(candidateIds));
    if (uniqueCandidateIds.length === 0) {
      return [];
    }

    // Validar existência real e isolamento por tenant no banco
    const validRecipients = await client.user.findMany({
      where: {
        id: { in: uniqueCandidateIds },
        tenantId,
        active: true,
      },
      select: { id: true },
    });

    if (validRecipients.length === 0) {
      return [];
    }

    const linkUrl = `/proposals/${proposal.id}?commentId=${comment.id}`;
    const propLabel = proposal.proposalNumber
      ? `#${proposal.proposalNumber}`
      : `#${proposal.id.slice(0, 8)}`;
    const snippet =
      comment.text.slice(0, 80) + (comment.text.length > 80 ? '...' : '');

    const createdList: Array<{ id: string; userId: string | null }> = [];

    for (const recipient of validRecipients) {
      const eventKey = `comment_added:${comment.id}:${recipient.id}`;

      // Idempotência determinística baseada no eventKey
      const existing = await client.notification.findFirst({
        where: {
          tenantId,
          eventKey,
        },
        select: { id: true, userId: true },
      });

      if (!existing) {
        const created = await this.safeCreateNotification(client, tenantId, eventKey, {
          tenantId,
          userId: recipient.id,
          title: 'Novo Comentário na Proposta',
          message: `${authorName || 'Um operador'} comentou na proposta ${propLabel}: "${snippet}"`,
          linkUrl,
          eventKey,
          priority: 'MEDIUM',
          type: 'PROPOSAL',
          proposalId: proposal.id,
          read: false,
        });

        if (created) {
          createdList.push(created);
        }
      }
    }

    return createdList;
  }

  /**
   * STATUS_CHANGED:
   * Cria notificações apenas para mudanças operacionalmente relevantes:
   * - Mudança para PENDENTE (alerta imediato para resolução de exigências operacionais)
   * - Mudança para PAGO (sucesso/conclusão de esteira financeira)
   * - Mudança para CANCELADO ou RECUSADO (encerramento/perda)
   * - Transição de fase por terceiro (avanço na esteira)
   * Destinatários prioritários: assignedToId e createdById, excluindo o operador atuante.
   * Deduplicação determinística baseada no statusHistoryId e destinatário.
   */
  public static async onStatusChanged(
    client: DbClient,
    params: {
      tenantId: string;
      operatorUserId: string;
      operatorName: string;
      proposal: {
        id: string;
        proposalNumber?: string | null;
        assignedToId?: string | null;
        createdById?: string | null;
      };
      statusHistoryId: string;
      toStatusName: string;
      toCategory?: string | null;
    }
  ): Promise<Array<{ id: string; userId: string | null }>> {
    const {
      tenantId,
      operatorUserId,
      operatorName,
      proposal,
      statusHistoryId,
      toStatusName,
      toCategory,
    } = params;

    // Destinatários: assignedToId, createdById (excluindo quem realizou a alteração)
    const candidateIds = [proposal.assignedToId, proposal.createdById].filter(
      (uid): uid is string => Boolean(uid) && uid !== operatorUserId
    );

    const uniqueCandidateIds = Array.from(new Set(candidateIds));
    if (uniqueCandidateIds.length === 0) {
      return [];
    }

    // Validar existência real e isolamento por tenant no banco
    const validRecipients = await client.user.findMany({
      where: {
        id: { in: uniqueCandidateIds },
        tenantId,
        active: true,
      },
      select: { id: true },
    });

    if (validRecipients.length === 0) {
      return [];
    }

    // Classificação de relevância e prioridade
    let title = 'Fase da Proposta Atualizada';
    let priority: PriorityLevel = 'MEDIUM';

    const normalizedStatusName = (toStatusName || '').toUpperCase();
    if (normalizedStatusName === 'SALDO RETORNADO' || normalizedStatusName === 'SALDO_RETORNADO') {
      title = 'Saldo Devedor Retornado';
      priority = 'HIGH';
    } else if (toCategory === 'PENDENTE') {
      title = 'Pendência Apontada na Proposta';
      priority = 'HIGH';
    } else if (toCategory === 'CANCELADO' || toCategory === 'RECUSADO') {
      title = 'Proposta Cancelada ou Recusada';
      priority = 'HIGH';
    } else if (toCategory === 'PAGO') {
      title = 'Proposta Concluída / Paga';
      priority = 'MEDIUM';
    }

    const propLabel = proposal.proposalNumber
      ? `#${proposal.proposalNumber}`
      : `#${proposal.id.slice(0, 8)}`;
    const message = `A proposta ${propLabel} foi atualizada para a fase "${toStatusName}" por ${operatorName || 'um operador'}.`;
    const linkUrl = `/proposals/${proposal.id}?statusHistoryId=${statusHistoryId}`;

    const createdList: Array<{ id: string; userId: string | null }> = [];

    for (const recipient of validRecipients) {
      const eventKey = `status_changed:${statusHistoryId}:${recipient.id}`;

      // Idempotência determinística baseada no eventKey
      const existing = await client.notification.findFirst({
        where: {
          tenantId,
          eventKey,
        },
        select: { id: true, userId: true },
      });

      if (!existing) {
        const created = await this.safeCreateNotification(client, tenantId, eventKey, {
          tenantId,
          userId: recipient.id,
          title,
          message,
          linkUrl,
          eventKey,
          priority,
          type: 'PROPOSAL',
          proposalId: proposal.id,
          read: false,
        });

        if (created) {
          createdList.push(created);
        }
      }
    }

    return createdList;
  }
}
