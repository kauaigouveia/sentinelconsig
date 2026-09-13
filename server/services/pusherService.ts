import Pusher from 'pusher';
import { logger } from '../logger.js';

let pusherClient: Pusher | null = null;

if (process.env.VITE_REALTIME_PROVIDER === 'pusher') {
  if (!process.env.PUSHER_APP_ID || !process.env.VITE_PUSHER_KEY || !process.env.PUSHER_SECRET || !process.env.VITE_PUSHER_CLUSTER) {
    logger.error('[PUSHER] Pusher environment variables are missing. Pusher realtime will be disabled.');
  } else {
    try {
      pusherClient = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.VITE_PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.VITE_PUSHER_CLUSTER,
        useTLS: true,
      });
      logger.info('[PUSHER] Client initialized successfully.');
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[PUSHER] Failed to initialize Pusher client.');
    }
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
    if (pusherClient && process.env.VITE_REALTIME_PROVIDER === 'pusher') {
      try {
        const thinEvent = {
          type: payload.type,
          entity: payload.entity,
          entityId: payload.entityId,
          timestamp: new Date().toISOString(),
          // Data is intentionally omitted for sensitive events, or kept minimal
        };
        // If it's an IMPORT event, we might need data
        if (payload.type.startsWith('IMPORT_') && payload.data) {
          (thinEvent as any).data = payload.data;
        }

        await pusherClient.trigger(`private-tenant-${tenantId}`, payload.type, thinEvent);
        logger.debug(`[EVENT_BUS] Published ${payload.type} to private-tenant-${tenantId}`);
      } catch (err: any) {
        logger.error({ error: err?.message || String(err) }, `[EVENT_BUS] Failed to publish ${payload.type} to Pusher`);
      }
    }
  }

  /**
   * Publishes an event to a user-specific channel.
   * Format: private-user-{userId}
   */
  public async publishToUser(userId: string, payload: PublishPayload): Promise<void> {
    if (pusherClient && process.env.VITE_REALTIME_PROVIDER === 'pusher') {
      try {
        const thinEvent = {
          type: payload.type,
          entity: payload.entity,
          entityId: payload.entityId,
          timestamp: new Date().toISOString(),
        };

        await pusherClient.trigger(`private-user-${userId}`, payload.type, thinEvent);
        logger.debug(`[EVENT_BUS] Published ${payload.type} to private-user-${userId}`);
      } catch (err: any) {
        logger.error({ error: err?.message || String(err) }, `[EVENT_BUS] Failed to publish ${payload.type} to Pusher`);
      }
    }
  }

  /**
   * Authenticates a user/tenant connection for Pusher's private channels.
   */
  public authorizeChannel(socketId: string, channel: string, authData: any = {}) {
    if (!pusherClient) {
      throw new Error('Pusher client is not initialized.');
    }
    return pusherClient.authorizeChannel(socketId, channel, authData);
  }
}

export const eventBus = new EventBus();
