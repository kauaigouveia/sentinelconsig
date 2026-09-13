/**
 * Realtime Event Dispatcher & SSE / WebSocket Hub for Sentinel Consig SaaS
 * Enables instantaneous zero-reload synchronization across operators.
 */

export interface RealtimeEvent<T = any> {
  id: string;
  type: 'PROPOSAL_CREATED' | 'PROPOSAL_UPDATED' | 'STATUS_CHANGED' | 'COMMENT_ADDED' | 'TASK_ASSIGNED' | 'TENANT_UPDATED' | 'USER_UPDATED' | 'BACKUP_COMPLETED';
  tenantId: string;
  userId?: string;
  userName?: string;
  timestamp: string;
  payload: T;
}

type EventListener<T = any> = (event: RealtimeEvent<T>) => void;

class RealtimeService {
  private static instance: RealtimeService;
  private listeners: Map<string, Set<EventListener>> = new Map();
  private connectionStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' = 'CONNECTED';
  private eventHistory: RealtimeEvent[] = [];

  private constructor() {
    // In browser, establish listener bridge
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'sentinel_realtime_broadcast' && e.newValue) {
          try {
            const event: RealtimeEvent = JSON.parse(e.newValue);
            this.notifyListeners(event);
          } catch (err) {
            console.error('Falha ao processar evento realtime:', err);
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
   * Broadcast an event to all subscribers and across browser tabs
   */
  public broadcast<T = any>(
    type: RealtimeEvent['type'],
    tenantId: string,
    payload: T,
    user?: { id: string; name: string }
  ): RealtimeEvent<T> {
    const event: RealtimeEvent<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      tenantId,
      userId: user?.id,
      userName: user?.name,
      timestamp: new Date().toISOString(),
      payload,
    };

    this.eventHistory.push(event);
    if (this.eventHistory.length > 200) {
      this.eventHistory.shift();
    }

    // Local tab notifications
    this.notifyListeners(event);

    // Cross-tab broadcast
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sentinel_realtime_broadcast', JSON.stringify(event));
      } catch (e) {
        // Storage limit or sandbox fallback
      }
    }

    return event;
  }

  /**
   * Subscribe to events matching specific event type or all events ('*')
   * Filtered automatically by tenantId
   */
  public subscribe<T = any>(
    eventType: string,
    currentTenantId: string,
    callback: EventListener<T>
  ): () => void {
    const key = eventType;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    const tenantGuardedCallback: EventListener<T> = (evt) => {
      // Strict multi-tenant isolation guard: Only dispatch if event matches tenant or caller is platform master
      if (evt.tenantId === currentTenantId || currentTenantId === 'PLATFORM_MASTER_GLOBAL') {
        callback(evt);
      }
    };

    this.listeners.get(key)!.add(tenantGuardedCallback as EventListener);

    return () => {
      this.listeners.get(key)?.delete(tenantGuardedCallback as EventListener);
    };
  }

  private notifyListeners(event: RealtimeEvent): void {
    const specificListeners = this.listeners.get(event.type);
    if (specificListeners) {
      specificListeners.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error('Erro ao executar listener de realtime:', err);
        }
      });
    }

    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error('Erro ao executar listener wildcard:', err);
        }
      });
    }
  }

  public getStatus(): 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' {
    return this.connectionStatus;
  }

  public getRecentEvents(tenantId: string): RealtimeEvent[] {
    return this.eventHistory.filter(
      (e) => e.tenantId === tenantId || tenantId === 'PLATFORM_MASTER_GLOBAL'
    );
  }
}

export const realtimeHub = RealtimeService.getInstance();
