import { afterEach, expect, it, vi } from 'vitest';
import { journeyFetch, withinJourneyDeadline } from '../server/services/cltJourneyDeadline';
afterEach(() => vi.unstubAllGlobals());
it('aborts in-flight requests and prevents subsequent bank calls after the execution deadline', async () => {
  const fetcher = vi.fn((_url, options) => new Promise<Response>((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason))));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  await withinJourneyDeadline(controller.signal, async () => {
    const pending = journeyFetch('https://bank.invalid/synthetic', { signal: AbortSignal.timeout(60000) });
    controller.abort(); await expect(pending).rejects.toThrow();
    await expect(journeyFetch('https://bank.invalid/synthetic')).rejects.toThrow();
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps cancellation scoped to the execution and leaves other tenants and legacy requests independent', async () => {
  const fetcher = vi.fn(async () => new Response('{}')); vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController(); controller.abort();
  await expect(withinJourneyDeadline(controller.signal, () => journeyFetch('https://bank.invalid/a'))).rejects.toThrow();
  await withinJourneyDeadline(new AbortController().signal, () => journeyFetch('https://bank.invalid/b'));
  await journeyFetch('https://bank.invalid/legacy'); expect(fetcher).toHaveBeenCalledTimes(2);
});
