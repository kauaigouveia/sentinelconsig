import type { RealtimeEvent } from '../services/realtimeService';

/** Invalidation only: never broadcast conversation content or trust it as API data. */
export const SUPPORT_EVENTS = [
  'SUPPORT_MESSAGE_RECEIVED',
  'SUPPORT_CONVERSATION_CREATED',
  'SUPPORT_CONVERSATION_STATUS_CHANGED',
  'SUPPORT_CONVERSATION_ASSIGNED',
] as const;

export function isSupportEvent(event: RealtimeEvent): boolean {
  return SUPPORT_EVENTS.some(type => type === event?.type);
}

export function supportConversationId(event: RealtimeEvent): string | undefined {
  if (!isSupportEvent(event)) return undefined;
  if (event.entity && event.entity !== 'SUPPORT') return undefined;
  // The production envelope has no data. Keep compatibility with older senders.
  const id = event.entityId ?? event.data?.conversationId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}
