import { Response } from 'express';
import crypto from 'crypto';
import { eventBus } from './services/pusherService.js';

export interface SSEEventPayload {
  id: string;
  type: string;
  entity: string;
  entityId: string;
  tenantId: string;
  timestamp: string;
  userId?: string;
  data?: any;
}

export interface SSEConnection {
  connectionId: string;
  userId: string;
  tenantId: string;
  userRole: string;
  res: Response;
  createdAt: Date;
  heartbeatTimer?: NodeJS.Timeout;
}

class SSERegistry {
  private static instance: SSERegistry;

  // Isolamento estrito por tenant: tenantId -> Set<SSEConnection>
  private tenantConnections: Map<string, Set<SSEConnection>> = new Map();

  // Índice rápido por connectionId -> SSEConnection
  private connectionIndex: Map<string, SSEConnection> = new Map();

  // Métricas de monitoramento
  private metrics = {
    totalConnectedEver: 0,
    totalEventsEmitted: 0,
    totalEventsDelivered: 0,
  };

  private constructor() {}

  public static getInstance(): SSERegistry {
    if (!SSERegistry.instance) {
      SSERegistry.instance = new SSERegistry();
    }
    return SSERegistry.instance;
  }

  public registerConnection(connection: SSEConnection): void {
    const { tenantId, connectionId } = connection;

    if (!this.tenantConnections.has(tenantId)) {
      this.tenantConnections.set(tenantId, new Set());
    }

    this.tenantConnections.get(tenantId)!.add(connection);
    this.connectionIndex.set(connectionId, connection);
    this.metrics.totalConnectedEver++;

    // Inicia Heartbeat periódico a cada 25 segundos
    connection.heartbeatTimer = setInterval(() => {
      try {
        connection.res.write(`event: ping\ndata: {}\n\n`);
      } catch (err) {
        this.unregisterConnection(connectionId);
      }
    }, 25000);

    console.log(`[SSE REGISTRY] Conexão registrada [${connectionId}] para Tenant [${tenantId}] (User: ${connection.userId}). Total no tenant: ${this.tenantConnections.get(tenantId)?.size}`);
  }

  public unregisterConnection(connectionId: string): void {
    const conn = this.connectionIndex.get(connectionId);
    if (!conn) return;

    if (conn.heartbeatTimer) {
      clearInterval(conn.heartbeatTimer);
      conn.heartbeatTimer = undefined;
    }

    const tenantSet = this.tenantConnections.get(conn.tenantId);
    if (tenantSet) {
      tenantSet.delete(conn);
      if (tenantSet.size === 0) {
        this.tenantConnections.delete(conn.tenantId);
      }
    }

    this.connectionIndex.delete(connectionId);

    try {
      if (!conn.res.writableEnded) {
        conn.res.end();
      }
    } catch {}

    console.log(`[SSE REGISTRY] Conexão removida [${connectionId}] do Tenant [${conn.tenantId}]. Restantes no tenant: ${this.tenantConnections.get(conn.tenantId)?.size || 0}`);
  }

  /**
   * Dispara evento EXCLUSIVAMENTE para conexões pertencentes àquele tenantId.
   * NUNCA envia para outros tenants.
   */
  public broadcastToTenant(
    tenantId: string,
    eventData: {
      type: string;
      entity: string;
      entityId: string;
      userId?: string;
      data?: any;
    }
  ): void {
    const isPusher = (process.env.VITE_REALTIME_PROVIDER || process.env.REALTIME_PROVIDER || 'pusher') === 'pusher';
    if (isPusher) {
      // Quando Pusher está ativo, entrega EXCLUSIVAMENTE via Pusher. SSE permanece desativado (sem fallback automático).
      eventBus.publishToTenant(tenantId, {
        type: eventData.type,
        entity: eventData.entity,
        entityId: eventData.entityId,
        userId: eventData.userId,
        tenantId: tenantId,
        data: eventData.data,
      }).catch(err => console.error('[EVENT_BUS] Fail eventBus broadcast', err));
      return;
    }

    // 1. Publish via SSE (Legacy - executado somente se Pusher NÃO for o provider ativo)
    const payload: SSEEventPayload = {
      id: crypto.randomUUID(),
      type: eventData.type,
      entity: eventData.entity,
      entityId: eventData.entityId,
      tenantId: tenantId,
      userId: eventData.userId,
      data: eventData.data,
      timestamp: new Date().toISOString(),
    };

    this.metrics.totalEventsEmitted++;

    const connections = this.tenantConnections.get(tenantId);
    if (!connections || connections.size === 0) {
      return;
    }

    const sseMessage = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;

    let deliveredCount = 0;
    const deadConnections: string[] = [];

    for (const conn of connections) {
      try {
        conn.res.write(sseMessage);
        deliveredCount++;
      } catch (err) {
        deadConnections.push(conn.connectionId);
      }
    }

    this.metrics.totalEventsDelivered += deliveredCount;

    // Limpeza de conexões mortas
    for (const deadId of deadConnections) {
      this.unregisterConnection(deadId);
    }
  }

  /**
   * Envia evento para um usuário específico (mesmo que tenha múltiplas abas abertas).
   */
  public emitToUser(
    tenantId: string,
    userId: string,
    eventData: {
      type: string;
      entity: string;
      entityId: string;
    }
  ): void {
    const isPusher = (process.env.VITE_REALTIME_PROVIDER || process.env.REALTIME_PROVIDER || 'pusher') === 'pusher';
    if (isPusher) {
      eventBus.publishToUser(userId, {
        type: eventData.type,
        entity: eventData.entity,
        entityId: eventData.entityId,
        userId: userId,
        tenantId: tenantId,
      }).catch(err => console.error('[EVENT_BUS] Fail eventBus emitToUser', err));
      return;
    }

    const connections = this.tenantConnections.get(tenantId);
    if (!connections) return;

    const payload: SSEEventPayload = {
      id: crypto.randomUUID(),
      type: eventData.type,
      entity: eventData.entity,
      entityId: eventData.entityId,
      tenantId: tenantId,
      userId: userId,
      timestamp: new Date().toISOString(),
    };

    const sseMessage = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const conn of connections) {
      if (conn.userId === userId) {
        try {
          conn.res.write(sseMessage);
        } catch {
          this.unregisterConnection(conn.connectionId);
        }
      }
    }
  }

  /**
   * Encerra imediatamente todas as conexões SSE ativas de um tenant (ex: quando o tenant é suspenso).
   */
  public disconnectTenant(tenantId: string, reason = 'TENANT_SUSPENDED'): void {
    const connections = this.tenantConnections.get(tenantId);
    if (!connections || connections.size === 0) return;

    const payload = {
      type: 'SESSION_TERMINATED',
      reason,
      timestamp: new Date().toISOString(),
    };
    const sseMessage = `event: session_terminated\ndata: ${JSON.stringify(payload)}\n\n`;

    for (const conn of Array.from(connections)) {
      try {
        conn.res.write(sseMessage);
        conn.res.end();
      } catch {}
      this.unregisterConnection(conn.connectionId);
    }

    this.tenantConnections.delete(tenantId);
    console.log(`[SSE REGISTRY] Todas as conexões do Tenant [${tenantId}] foram encerradas devido a '${reason}'.`);
  }

  public closeAllConnections(): void {
    const tenantIds = Array.from(this.tenantConnections.keys());
    for (const tenantId of tenantIds) {
      this.disconnectTenant(tenantId, 'SERVER_SHUTDOWN');
    }
  }

  public getStats() {
    let activeConnectionsCount = 0;
    const tenantCounts: Record<string, number> = {};

    for (const [tenantId, set] of this.tenantConnections.entries()) {
      activeConnectionsCount += set.size;
      tenantCounts[tenantId] = set.size;
    }

    return {
      activeConnections: activeConnectionsCount,
      tenantsWithActiveConnections: this.tenantConnections.size,
      tenantBreakdown: tenantCounts,
      metrics: this.metrics,
    };
  }
}

export const sseRegistry = SSERegistry.getInstance();
