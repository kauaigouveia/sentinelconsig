import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage<AbortSignal>();
export function isJourneyExecution() { return !!context.getStore(); }
export function withinJourneyDeadline<T>(signal: AbortSignal, run: () => Promise<T>) { return context.run(signal, run); }
// The signal is scoped to this execution, never shared between tenants or requests.
// All subsequent calls fail before fetch once the request budget is exhausted.
export async function journeyFetch(input: string | URL | Request, init?: RequestInit) {
  const deadline = context.getStore();
  deadline?.throwIfAborted();
  if (!deadline) return fetch(input, init);
  const response = await fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline });
  return response;
}
