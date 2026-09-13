const fs = require('fs');
let content = fs.readFileSync('src/services/realtimeService.ts', 'utf8');

const startIdx = content.indexOf('public connect(tenantId?: string): void {');
const endIdx = content.indexOf('private cleanupAndReconnect(): void {');

if (startIdx === -1 || endIdx === -1) {
  console.log('Not found');
  process.exit(1);
}

const replacement = `
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
        this.pusherClient = new PusherClient(import.meta.env.VITE_PUSHER_KEY, {
          cluster: import.meta.env.VITE_PUSHER_CLUSTER,
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

    if (this.tenantChannel && this.tenantChannel.name !== \`private-tenant-\${this.currentTenantId}\`) {
      this.pusherClient.unsubscribe(this.tenantChannel.name);
      this.tenantChannel = null;
    }

    if (!this.tenantChannel) {
      this.tenantChannel = this.pusherClient.subscribe(\`private-tenant-\${this.currentTenantId}\`);
      this.bindPusherEvents(this.tenantChannel);
      
      this.tenantChannel.bind('pusher:subscription_error', (status: any) => {
        this.setStatus('ERROR', { error: \`Subscription error: \${status}\` });
      });
    }

    if (this.currentUserId) {
      if (this.userChannel && this.userChannel.name !== \`private-user-\${this.currentUserId}\`) {
        this.pusherClient.unsubscribe(this.userChannel.name);
        this.userChannel = null;
      }

      if (!this.userChannel) {
        this.userChannel = this.pusherClient.subscribe(\`private-user-\${this.currentUserId}\`);
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
            console.error(\`[REALTIME SSE] Falha ao processar evento \${type}:\`, e);
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

  `;

content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
fs.writeFileSync('src/services/realtimeService.ts', content);
console.log('done');
