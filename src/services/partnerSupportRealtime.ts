import { isSupportEvent, SUPPORT_EVENTS } from '../lib/supportRealtime';
import type { RealtimeEvent } from './realtimeService';
import type Pusher from 'pusher-js';

/** Owned by the portal chat, completely separate from the internal tenant hub. */
export function connectPartnerSupportRealtime(onEvent: (event: RealtimeEvent) => void, onReconnect: () => void) {
  const abort = new AbortController();
  let disposed = false;
  let pusher: Pusher | undefined;
  let stream: EventSource | undefined;
  void (async () => {
    try {
      const response = await fetch('/api/partner-portal/realtime/context', {cache: 'no-store', signal: abort.signal});
      if (!response.ok || disposed) return;
      const context = await response.json();
      if (disposed || typeof context.tenantId !== 'string' || !/^private-support-partner-[a-f0-9]{64}$/.test(context.channel)) return;
      const receive = (event: RealtimeEvent) => {
        if (!disposed && event.tenantId === context.tenantId && isSupportEvent(event)) onEvent(event);
      };
      if (context.provider === 'pusher') {
        const key = import.meta.env.VITE_PUSHER_KEY;
        if (!key) return; // Polling remains active if the transport is unavailable.
        const {default: Constructor} = await import('pusher-js');
        if (disposed) return;
        pusher = new Constructor(key, {cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'mt1', authEndpoint: '/api/partner-portal/realtime/auth'});
        pusher.connection.bind('connected', () => { if (!disposed) onReconnect(); });
        const channel = pusher.subscribe(context.channel);
        SUPPORT_EVENTS.forEach(type => channel.bind(type, (event: RealtimeEvent) => receive({...event, type})));
      } else if (context.provider === 'sse') {
        stream = new EventSource('/api/partner-portal/realtime', {withCredentials: true});
        stream.onopen = () => { if (!disposed) onReconnect(); };
        stream.onmessage = event => { try { receive(JSON.parse(event.data)); } catch { /* Malformed invalidation; polling catches up. */ } };
      }
    } catch { /* Session/network failure is handled by the existing scoped polling UI. */ }
  })();
  return () => { disposed = true; abort.abort(); stream?.close(); pusher?.disconnect(); };
}
