import { Response } from 'express';
import crypto from 'crypto';

export interface SSEEventPayload {
  id: string;
  type: string;
  entity: string;
  entityId: string;
  tenantId: string;
  timestamp: string;
  userId?: string;
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
    }
  ): void {
    const payload: SSEEventPayload = {
      id: crypto.randomUUID(),
      type: eventData.type,
      entity: eventData.entity,
      entityId: eventData.entityId,
      tenantId: tenantId,
      userId: eventData.userId,
      timestamp: new Date().toISOString(),
    };

    this.metrics.totalEventsEmitted++;

    const connections = this.tenantConnections.get(tenantId);
    if (!connections || connections.size === 0) {
      console.log(`[SSE BROADCAST] Evento [${payload.type}] para tenant [${tenantId}] gerado, porém sem clientes conectados no momento.`);
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
        console.warn(`[SSE BROADCAST ERROR] Falha ao enviar para conexão [${conn.connectionId}], agendando remoção:`, err);
        deadConnections.push(conn.connectionId);
      }
    }

    this.metrics.totalEventsDelivered += deliveredCount;

    // Limpeza de conexões mortas
    for (const deadId of deadConnections) {
      this.unregisterConnection(deadId);
    }

    console.log(`[SSE BROADCAST] Evento [${payload.type}] entregue a ${deliveredCount} conexões do Tenant [${tenantId}].`);
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
