/**
 * Realtime Event Dispatcher & Server-Sent Events (SSE) Client Hub
 * Sentinel Consig SaaS — Phase 2.3
 * 
 * Rules:
 * - Direct SSE connection via EventSource to GET /api/realtime
 * - Isolated per tenantId from session
 * - Reconnection with exponential backoff
 * - Event only triggers targeted reload; PostgreSQL remains the single source of truth
 */

import PusherClient, { Channel } from 'pusher-js';

export interface RealtimeEvent<T = any> {
  id?: string;
  type:
    | 'PROPOSAL_CREATED'
    | 'PROPOSAL_UPDATED'
    | 'PROPOSAL_DELETED'
    | 'STATUS_CHANGED'
    | 'COMMENT_ADDED'
    | 'TASK_CREATED'
    | 'TASK_UPDATED'
    | 'TASK_DELETED'
    | 'CLIENT_CREATED'
    | 'CLIENT_UPDATED'
    | 'CLIENT_DELETED'
    | 'NOTIFICATION_CREATED'
    | 'TENANT_UPDATED'
    | 'USER_CREATED'
    | 'USER_UPDATED'
    | 'USER_DELETED'
    | 'IMPORT_STARTED'
    | 'IMPORT_PROGRESS'
    | 'IMPORT_COMPLETED'
    | 'IMPORT_FAILED'
    | 'IMPORT_CANCELLED';
  entity?: string;
  entityId?: string;
  tenantId?: string;
  userId?: string;
  timestamp?: string | number;
  payload?: T;
  data?: T;
}

export type ConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';
export type EventListener<T = any> = (event: RealtimeEvent<T>) => void;
export type StatusListener = (status: ConnectionStatus, details?: { error?: string; reconnectAttempt?: number }) => void;

export class RealtimeService {
  private static instance: RealtimeService;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private statusListeners: Set<StatusListener> = new Set();
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private eventSource: EventSource | null = null;
  private currentTenantId: string | null = null;
  private currentUserId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private maxReconnectDelay = 30000;
  private initialReconnectDelay = 1000;
  private lastPingAt: number = Date.now();
  private isConnecting = false;

  // Pusher specific
  private pusherClient: PusherClient | null = null;
  private tenantChannel: Channel | null = null;
  private userChannel: Channel | null = null;
  private usePusher: boolean = (import.meta as any).env.VITE_REALTIME_PROVIDER === 'pusher';

  private constructor() {
    // Cross-tab broadcast listener as complementary local bridge
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'sentinel_realtime_broadcast' && e.newValue) {
          try {
            const event: RealtimeEvent = JSON.parse(e.newValue);
            this.notifyListeners(event);
          } catch (err) {
            console.error('[REALTIME] Falha ao processar evento storage cross-tab:', err);
          }
        }
      });
    }
  }

  public static getInstance(): RealtimeService {
    if (!RealtimeService.instance) {
      RealtimeService.instance = new RealtimeService();
    }
    return RealtimeService.instance;
  }

  /**
   * Connects to SSE stream for authenticated tenant
   */
  
  public setUserContext(userId: string) {
    this.currentUserId = userId;
  }

  public connect(tenantId?: string): void {
    if (typeof window === 'undefined') return;
    if (tenantId) {
      this.currentTenantId = tenantId;
    }

    if (this.usePusher) {
      this.connectPusher();
    } else {
      this.connectSSE();
    }
  }

  private connectPusher(): void {
    if (this.pusherClient) {
      if (this.pusherClient.connection.state === 'connected' || this.pusherClient.connection.state === 'connecting') {
        this.subscribePusherChannels();
        return;
      }
    }

    if (this.isConnecting) return;
    this.isConnecting = true;
    this.setStatus('CONNECTING');

    try {
      if (!this.pusherClient) {
        this.pusherClient = new PusherClient((import.meta as any).env.VITE_PUSHER_KEY, {
          cluster: (import.meta as any).env.VITE_PUSHER_CLUSTER,
          authEndpoint: '/api/pusher/auth',
        });

        this.pusherClient.connection.bind('connected', () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.setStatus('CONNECTED');
          this.subscribePusherChannels();
        });

        this.pusherClient.connection.bind('connecting', () => {
          this.setStatus('CONNECTING');
        });

        this.pusherClient.connection.bind('disconnected', () => {
          this.setStatus('DISCONNECTED');
          this.isConnecting = false;
        });

        this.pusherClient.connection.bind('error', (err: any) => {
          this.setStatus('ERROR', { error: err?.error?.data?.code === 4004 ? 'Limites excedidos' : 'Erro de conexão Pusher' });
        });
      } else {
        this.pusherClient.connect();
      }

    } catch (err: any) {
      this.isConnecting = false;
      this.setStatus('ERROR', { error: err?.message || 'Falha ao instanciar Pusher' });
    }
  }

  private subscribePusherChannels(): void {
    if (!this.pusherClient || !this.currentTenantId) return;

    if (this.tenantChannel && this.tenantChannel.name !== `private-tenant-${this.currentTenantId}`) {
      this.pusherClient.unsubscribe(this.tenantChannel.name);
      this.tenantChannel = null;
    }

    if (!this.tenantChannel) {
      this.tenantChannel = this.pusherClient.subscribe(`private-tenant-${this.currentTenantId}`);
      this.bindPusherEvents(this.tenantChannel);
      
      this.tenantChannel.bind('pusher:subscription_error', (status: any) => {
        this.setStatus('ERROR', { error: `Subscription error: ${status}` });
      });
    }

    if (this.currentUserId) {
      if (this.userChannel && this.userChannel.name !== `private-user-${this.currentUserId}`) {
        this.pusherClient.unsubscribe(this.userChannel.name);
        this.userChannel = null;
      }

      if (!this.userChannel) {
        this.userChannel = this.pusherClient.subscribe(`private-user-${this.currentUserId}`);
        this.bindPusherEvents(this.userChannel);
      }
    }
  }

  private bindPusherEvents(channel: Channel): void {
    const eventTypes: RealtimeEvent['type'][] = [
      'PROPOSAL_CREATED', 'PROPOSAL_UPDATED', 'PROPOSAL_DELETED',
      'STATUS_CHANGED', 'COMMENT_ADDED', 'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED',
      'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_DELETED',
      'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
      'TENANT_UPDATED', 'NOTIFICATION_CREATED',
      'IMPORT_STARTED', 'IMPORT_PROGRESS', 'IMPORT_COMPLETED', 'IMPORT_FAILED', 'IMPORT_CANCELLED'
    ];
    
    eventTypes.forEach(type => {
      channel.bind(type, (data: any) => {
        const event: RealtimeEvent = {
          ...data,
          type
        };
        this.handleIncomingEvent(event);
      });
    });
  }

  private connectSSE(): void {
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.setStatus('CONNECTING');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      if (this.eventSource) {
        this.eventSource.close();
      }

      const es = new EventSource('/api/realtime', { withCredentials: true });
      this.eventSource = es;

      es.addEventListener('open', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastPingAt = Date.now();
        this.setStatus('CONNECTED');
      });

      es.addEventListener('connected', (event: MessageEvent) => {
        this.setStatus('CONNECTED');
      });

      es.addEventListener('ping', () => {
        this.lastPingAt = Date.now();
      });

      const eventTypes: RealtimeEvent['type'][] = [
        'PROPOSAL_CREATED',
        'PROPOSAL_UPDATED',
        'PROPOSAL_DELETED',
        'STATUS_CHANGED',
        'COMMENT_ADDED',
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_DELETED',
        'CLIENT_CREATED',
        'CLIENT_UPDATED',
        'CLIENT_DELETED',
        'NOTIFICATION_CREATED',
        'TENANT_UPDATED',
        'USER_UPDATED',
        'USER_DELETED',
        'IMPORT_STARTED',
        'IMPORT_PROGRESS',
        'IMPORT_COMPLETED',
        'IMPORT_FAILED',
        'IMPORT_CANCELLED'
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (event: MessageEvent) => {
          try {
            const parsed: RealtimeEvent = JSON.parse(event.data);
            this.handleIncomingEvent(parsed);
          } catch (e) {
            console.error(`[REALTIME SSE] Falha ao processar evento ${type}:`, e);
          }
        });
      }

      es.onmessage = (event: MessageEvent) => {
        try {
          const parsed: RealtimeEvent = JSON.parse(event.data);
          this.handleIncomingEvent(parsed);
        } catch (e) {
        }
      };

      es.onerror = (err) => {
        this.isConnecting = false;
        this.setStatus('ERROR', { error: 'Desconectado do servidor SSE', reconnectAttempt: this.reconnectAttempts + 1 });
        this.cleanupAndReconnect();
      };
    } catch (err: any) {
      this.isConnecting = false;
      this.setStatus('ERROR', { error: err?.message || 'Falha ao instanciar EventSource' });
      this.cleanupAndReconnect();
    }
  }

  private cleanupAndReconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    // Exponential backoff: min(30s, initial * 2^(attempts-1)) + jitter
    const delay = Math.min(
      this.maxReconnectDelay,
      this.initialReconnectDelay * Math.pow(1.5, Math.min(this.reconnectAttempts, 8))
    ) + Math.random() * 500;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    if (this.usePusher) {
      if (this.pusherClient) {
        if (this.tenantChannel) {
          this.pusherClient.unsubscribe(this.tenantChannel.name);
          this.tenantChannel = null;
        }
        if (this.userChannel) {
          this.pusherClient.unsubscribe(this.userChannel.name);
          this.userChannel = null;
        }
        this.pusherClient.disconnect();
      }
    } else {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    }
    this.isConnecting = false;
    this.setStatus('DISCONNECTED');
  }

  private handleIncomingEvent(event: RealtimeEvent): void {
    // Client-side isolation verification (server already isolates by tenantId)
    if (this.currentTenantId && event.tenantId && event.tenantId !== this.currentTenantId) {
      console.warn('[REALTIME] Evento descartado por incompatibilidade de tenant:', event.tenantId);
      return;
    }

    this.notifyListeners(event);

    // Cross-tab broadcast for other browser tabs in the same browser
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sentinel_realtime_broadcast', JSON.stringify(event));
      } catch (e) {
        // Safe quota fallback
      }
    }
  }

  private setStatus(status: ConnectionStatus, details?: { error?: string; reconnectAttempt?: number }): void {
    this.connectionStatus = status;
    this.statusListeners.forEach((fn) => {
      try {
        fn(status, details);
      } catch (err) {
        console.error('[REALTIME] Erro no status listener:', err);
      }
    });
  }

  /**
   * Subscribe to events matching specific event type or wildcard ('*')
   * Supports optional tenantId filter for multi-tenant isolation or test environments
   */
  public subscribe<T = any>(
    eventType: string,
    callbackOrTenantId: EventListener<T> | string,
    optionalCallback?: EventListener<T>
  ): () => void {
    let callback: EventListener<T>;
    let targetTenantId: string | undefined;

    if (typeof callbackOrTenantId === 'function') {
      callback = callbackOrTenantId;
    } else {
      targetTenantId = callbackOrTenantId;
      callback = optionalCallback!;
    }

    const wrappedCallback: EventListener<T> = (event: RealtimeEvent) => {
      if (targetTenantId && event.tenantId && event.tenantId !== targetTenantId) {
        return;
      }
      callback(event);
    };

    const key = eventType;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    this.listeners.get(key)!.add(wrappedCallback as EventListener);

    return () => {
      this.listeners.get(key)?.delete(wrappedCallback as EventListener);
    };
  }

  /**
   * Broadcast an event (used for cross-tab local triggers or test runner validation)
   */
  public broadcast(eventType: string, tenantIdOrPayload: string | any, payload?: any): void {
    let tenantId = this.currentTenantId || 'default-tenant';
    let data = payload;

    if (typeof tenantIdOrPayload === 'string') {
      tenantId = tenantIdOrPayload;
    } else {
      data = tenantIdOrPayload;
    }

    const event: RealtimeEvent = {
      type: eventType as any,
      entity: 'Proposal',
      entityId: data?.id || 'synthetic-id',
      tenantId,
      timestamp: Date.now(),
      payload: data,
    };

    this.notifyListeners(event);
  }

  /**
   * Subscribe to SSE Connection Status changes (CONNECTED, CONNECTING, DISCONNECTED, ERROR)
   */
  public onStatusChange(callback: StatusListener): () => void {
    this.statusListeners.add(callback);
    // Notify immediately with current status
    callback(this.connectionStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private notifyListeners(event: RealtimeEvent): void {
    const specific = this.listeners.get(event.type);
    if (specific) {
      specific.forEach((fn) => {
        try {
          fn(event);
        } catch (e) {
          console.error('[REALTIME] Listener error:', e);
        }
      });
    }

    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach((fn) => {
        try {
          fn(event);
        } catch (e) {
          console.error('[REALTIME] Wildcard listener error:', e);
        }
      });
    }
  }

  public getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

export const realtimeHub = RealtimeService.getInstance();
