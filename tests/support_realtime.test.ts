// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealtimeService } from '../src/services/realtimeService';
import { SUPPORT_EVENTS, supportConversationId } from '../src/lib/supportRealtime';

const hub = RealtimeService.getInstance();
const internal = hub as any;
afterEach(() => { hub.disconnect(); internal.listeners.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Support transport contract, synthetic and offline', () => {
  it.each(SUPPORT_EVENTS)('binds %s on Pusher and invalidates by envelope ID', type => {
    internal.currentTenantId = 'tenant-a';
    const bindings = new Map<string, Function>();
    internal.bindPusherEvents({ bind: (name: string, callback: Function) => bindings.set(name, callback) });
    const received = vi.fn(); hub.subscribe('*', received);
    bindings.get(type)!({ entity: 'SUPPORT', entityId: 'conversation-a', tenantId: 'tenant-a' });
    expect(received).toHaveBeenCalledTimes(1);
    expect(supportConversationId(received.mock.calls[0][0])).toBe('conversation-a');
    expect(received.mock.calls[0][0].data).toBeUndefined();
    bindings.get(type)!({ entityId: 'conversation-b', tenantId: 'tenant-b' });
    expect(received).toHaveBeenCalledTimes(1);
  });
  it('keeps legacy IDs but does not override the authoritative envelope', () => {
    expect(supportConversationId({type: SUPPORT_EVENTS[0], data: {conversationId: 'legacy'}})).toBe('legacy');
    expect(supportConversationId({type: SUPPORT_EVENTS[0], entityId: 'envelope', data: {conversationId: 'legacy'}})).toBe('envelope');
    expect(supportConversationId({type: SUPPORT_EVENTS[0], entity: 'PROPOSAL', entityId: 'wrong'})).toBeUndefined();
  });
  it('supports named and generic SSE, including retry after failure before open', () => {
    vi.useFakeTimers();
    const sources: any[] = [];
    class FakeSource {
      static OPEN = 1; readyState = 0; listeners = new Map<string, Function>();
      onmessage: any; onerror: any; close = vi.fn();
      constructor(public url: string) { sources.push(this); }
      addEventListener(name: string, callback: Function) { this.listeners.set(name, callback); }
    }
    vi.stubGlobal('EventSource', FakeSource);
    internal.usePusher = false; internal.currentTenantId = 'tenant-a';
    const received = vi.fn(); hub.subscribe('*', received);
    hub.connect('tenant-a'); sources[0].onerror();
    vi.advanceTimersByTime(6000);
    expect(sources).toHaveLength(2);
    sources[1].listeners.get('open')();
    const event = {type: SUPPORT_EVENTS[0], entity: 'SUPPORT', entityId: 'conversation-a', tenantId: 'tenant-a'};
    sources[1].onmessage({data: JSON.stringify(event)});
    sources[1].listeners.get(SUPPORT_EVENTS[1])({data: JSON.stringify({...event, type: SUPPORT_EVENTS[1]})});
    expect(received).toHaveBeenCalledTimes(2);
    hub.connect('tenant-b');
    expect(sources).toHaveLength(3);
    expect(sources[1].close).toHaveBeenCalled();
    sources[2].onmessage({data: JSON.stringify(event)});
    expect(received).toHaveBeenCalledTimes(2);
    hub.disconnect(); vi.advanceTimersByTime(60000);
    expect(sources).toHaveLength(3);
  });
  it('rejects cross-tenant cross-tab messages', () => {
    internal.currentTenantId = 'tenant-a';
    const received = vi.fn(); hub.subscribe('*', received);
    window.dispatchEvent(new StorageEvent('storage', {key: 'sentinel_realtime_broadcast', newValue: JSON.stringify({type: SUPPORT_EVENTS[0], tenantId: 'tenant-b'})}));
    expect(received).not.toHaveBeenCalled();
  });
});
