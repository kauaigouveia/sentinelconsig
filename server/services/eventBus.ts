import { EventEmitter } from 'events';
import { sseRegistry } from '../realtime.js';
import { logger } from '../logger.js';
import { AuditLogService } from './auditLogService.js';
import { PrismaClient } from '@prisma/client';

export type DomainEventType =
  | 'PROPOSAL_CREATED'
  | 'PROPOSAL_STATUS_CHANGED'
  | 'PROPOSAL_APPROVED'
  | 'PROPOSAL_DENIED'
  | 'PROPOSAL_CANCELLED'
  | 'PROPOSAL_PAID'
  | 'PROPOSAL_PENDING'
  | 'PROPOSAL_UPDATED'
  | 'SIMULATION_CREATED'
  | 'SIMULATION_COMPLETED'
  | 'PARTNER_CREATED'
  | 'PARTNER_UPDATED'
  | 'PARTNER_DELETED'
  | 'PARTNER_STATUS_CHANGED'
  | 'PARTNER_INTERACTION_CREATED'
  | 'PARTNER_NOTE_CREATED'
  | 'PARTNER_TASK_CREATED'
  | 'PARTNER_TASK_UPDATED'
  | 'PARTNER_TASK_COMPLETED'
  | 'PARTNER_TASK_DELETED'
  | 'PARTNER_TASK_OVERDUE'
  | 'INTEGRATION_REQUEST'
  | 'INTEGRATION_SUCCESS'
  | 'INTEGRATION_ERROR'
  | 'INTEGRATION_HEALTH_CHANGED'
  | 'INTEGRATION_INCIDENT_STARTED'
  | 'INTEGRATION_INCIDENT_RESOLVED'
  | 'INTEGRATION_RATE_LIMITED'
  | 'PENDENCY_CREATED'
  | 'PENDENCY_ASSIGNED'
  | 'PENDENCY_STATUS_CHANGED'
  | 'PENDENCY_COMMENT_ADDED'
  | 'PENDENCY_SLA_WARNING'
  | 'PENDENCY_SLA_BREACHED'
  | 'PENDENCY_RESOLVED'
  | 'PENDENCY_REOPENED'
  | 'PENDENCY_CANCELLED'
  | 'AUTOMATION_EXECUTED'
  | 'INTELLIGENCE_INSIGHT_CREATED'
  | 'INTELLIGENCE_INSIGHT_UPDATED'
  | 'INTELLIGENCE_INSIGHT_RESOLVED'
  | 'INTELLIGENCE_ANOMALY_DETECTED'
  | 'INTELLIGENCE_CORRELATION_DETECTED'
  | 'INTELLIGENCE_CRITICAL'
  | 'COMMAND_INCIDENT_CREATED'
  | 'COMMAND_INCIDENT_UPDATED'
  | 'COMMAND_INCIDENT_CRITICAL'
  | 'COMMAND_INCIDENT_STATUS_CHANGED'
  | 'COMMAND_INCIDENT_RESOLVED'
  | 'COMMAND_IMPACT_UPDATED'
  | 'COMMAND_ALERT_CREATED'
  | 'INCIDENT_CREATED'
  | 'INCIDENT_CRITICAL'
  | 'INCIDENT_STATUS_CHANGED'
  | 'INCIDENT_ESCALATED'
  | 'INCIDENT_RESOLVED'
  | 'SUPPORT_CONVERSATION_CREATED'
  | 'SUPPORT_MESSAGE_RECEIVED'
  | 'SUPPORT_CONVERSATION_STATUS_CHANGED'
  | 'SUPPORT_CONVERSATION_ASSIGNED';

export interface DomainEventPayload<T = any> {
  tenantId: string;
  eventType: DomainEventType;
  entityId?: string;
  entity?: string;
  userId?: string | null;
  userName?: string | null;
  data: T;
  timestamp?: string;
  audit?: boolean; // Se true, gera log na trilha de auditoria automaticamente
}

export class CentralEventBus extends EventEmitter {
  private static instance: CentralEventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  public static getInstance(): CentralEventBus {
    if (!CentralEventBus.instance) {
      CentralEventBus.instance = new CentralEventBus();
    }
    return CentralEventBus.instance;
  }

  /**
   * Publica um evento de domínio:
   * 1. Emite para listeners internos (ex: Engine de Automações, Notificações)
   * 2. Faz broadcast para os clientes conectados no canal seguro do tenant (Pusher / SSE)
   * 3. Registra na trilha de auditoria se especificado
   */
  public async publish<T = any>(
    event: DomainEventPayload<T>,
    prisma?: PrismaClient
  ): Promise<void> {
    const timestamp = event.timestamp || new Date().toISOString();
    const enrichedEvent: DomainEventPayload<T> = {
      ...event,
      timestamp,
    };

    logger.info(
      {
        tenantId: event.tenantId,
        eventType: event.eventType,
        entityId: event.entityId,
      },
      '[EVENT_BUS] Evento publicado'
    );

    // 1. Emitir internamente para processadores assíncronos
    this.emit(event.eventType, enrichedEvent);
    this.emit('*', enrichedEvent);

    // 2. Broadcast em tempo real para os clientes do tenant via Pusher/SSE
    try {
      await sseRegistry.broadcastToTenant(event.tenantId, {
        type: event.eventType,
        entity: event.entity || 'EVENT',
        entityId: event.entityId || '',
        userId: event.userId || undefined,
        // Support content must be fetched through the role/partner scoped endpoints.
        data: event.entity === 'SUPPORT' ? undefined : event.data,
      });
    } catch (err: any) {
      logger.error(
        { error: err?.message, tenantId: event.tenantId, eventType: event.eventType },
        '[EVENT_BUS] Erro ao fazer broadcast do evento'
      );
    }

    // 3. Auditoria automática se solicitada
    if (event.audit && prisma && event.tenantId) {
      try {
        await AuditLogService.record(prisma, {
          tenantId: event.tenantId,
          userId: event.userId || null,
          userName: event.userName || 'SISTEMA',
          action: event.eventType,
          entity: event.entity || 'EVENT',
          entityId: event.entityId || null,
          newData: event.data,
        });
      } catch (auditErr: any) {
        logger.warn(
          { error: auditErr?.message, tenantId: event.tenantId },
          '[EVENT_BUS] Falha ao registrar log de auditoria do evento'
        );
      }
    }
  }

  /**
   * Registra um listener fortemente tipado para um evento de domínio
   */
  public subscribe<T = any>(
    eventType: DomainEventType | '*',
    handler: (event: DomainEventPayload<T>) => void | Promise<void>
  ): () => void {
    const safeHandler = async (event: DomainEventPayload<T>) => {
      try {
        await handler(event);
      } catch (err: any) {
        logger.error(
          { error: err?.message, eventType },
          '[EVENT_BUS] Erro ao processar listener de evento'
        );
      }
    };

    this.on(eventType, safeHandler);
    return () => {
      this.off(eventType, safeHandler);
    };
  }
}

export const eventBus = CentralEventBus.getInstance();
export const centralEventBus = eventBus;
export const domainEventBus = eventBus;
