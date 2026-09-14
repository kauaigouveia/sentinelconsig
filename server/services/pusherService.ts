import Pusher from 'pusher';
import { logger } from '../logger.js';

let pusherClient: Pusher | null = null;

/**
 * Gets or initializes the Pusher client using lazy loading.
 * This ensures the client is available in serverless environments.
 */
function getPusherClient(): Pusher {
  if (pusherClient) return pusherClient;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY || process.env.VITE_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || process.env.VITE_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    throw new Error('Pusher configuration is incomplete.');
  }

  try {
    pusherClient = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
    logger.info('[PUSHER] Client initialized successfully (Lazy).');
    return pusherClient;
  } catch (err: any) {
    logger.error({ error: err?.message || String(err) }, '[PUSHER] Lazy initialization failed.');
    throw new Error('Pusher initialization failed.');
  }
}

export interface PublishPayload {
  tenantId?: string;
  userId?: string;
  type: string;
  entity: string;
  entityId: string;
  data?: any; // For thin events, avoid this if possible, but keep for fallback
}

class EventBus {
  /**
   * Publishes an event to a tenant-specific channel.
   * Format: private-tenant-{tenantId}
   */
  public async publishToTenant(tenantId: string, payload: PublishPayload): Promise<void> {
    if (process.env.VITE_REALTIME_PROVIDER !== 'pusher') return;

    try {
      const client = getPusherClient();
      const thinEvent = {
        type: payload.type,
        entity: payload.entity,
        entityId: payload.entityId,
        timestamp: new Date().toISOString(),
      };
      
      if (payload.type.startsWith('IMPORT_') && payload.data) {
        (thinEvent as any).data = payload.data;
      }

      await client.trigger(`private-tenant-${tenantId}`, payload.type, thinEvent);
      logger.debug(`[EVENT_BUS] Published ${payload.type} to private-tenant-${tenantId}`);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, `[EVENT_BUS] Failed to publish ${payload.type} to Pusher`);
    }
  }

  /**
   * Publishes an event to a user-specific channel.
   * Format: private-user-{userId}
   */
  public async publishToUser(userId: string, payload: PublishPayload): Promise<void> {
    if (process.env.VITE_REALTIME_PROVIDER !== 'pusher') return;

    try {
      const client = getPusherClient();
      const thinEvent = {
        type: payload.type,
        entity: payload.entity,
        entityId: payload.entityId,
        timestamp: new Date().toISOString(),
      };

      await client.trigger(`private-user-${userId}`, payload.type, thinEvent);
      logger.debug(`[EVENT_BUS] Published ${payload.type} to private-user-${userId}`);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, `[EVENT_BUS] Failed to publish ${payload.type} to Pusher`);
    }
  }

  /**
   * Authenticates a user/tenant connection for Pusher's private channels.
   */
  public authorizeChannel(socketId: string, channel: string, authData: any = {}) {
    const client = getPusherClient();
    return client.authorizeChannel(socketId, channel, authData);
  }
}

export const eventBus = new EventBus();
