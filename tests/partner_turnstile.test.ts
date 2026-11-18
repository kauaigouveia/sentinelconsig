import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPartnerTurnstileConfig, verifyPartnerTurnstile } from '../server/services/partnerTurnstile';

const enabled = { TURNSTILE_PARTNER_ENABLED: 'true', TURNSTILE_SITE_KEY: 'public-site-key', TURNSTILE_SECRET_KEY: 'private-server-secret' };
const target = { token: 'test-challenge-token', expectedHostname: 'sentinelconsig.com.br' };

describe('partner Turnstile server-side protection', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('is disabled until explicitly enabled', async () => {
    expect(getPartnerTurnstileConfig({})).toEqual({ enabled: false, siteKey: null });
    expect(await verifyPartnerTurnstile({ token: null, expectedHostname: '' }, { env: {} })).toEqual({ ok: true });
  });

  it('does not expose secret in public configuration', () => {
    expect(getPartnerTurnstileConfig(enabled)).toEqual({ enabled: true, siteKey: 'public-site-key' });
  });

  it('fails closed if enabled without keys', async () => {
    expect((await verifyPartnerTurnstile(target, { env: { TURNSTILE_PARTNER_ENABLED: 'true' } })).ok).toBe(false);
  });

  it('rejects missing and oversized tokens before network request', async () => {
    const fakeFetch = vi.fn();
    expect((await verifyPartnerTurnstile({ ...target, token: '' }, { env: enabled, fetchImpl: fakeFetch as unknown as typeof fetch })).ok).toBe(false);
    expect((await verifyPartnerTurnstile({ ...target, token: 'x'.repeat(2049) }, { env: enabled, fetchImpl: fakeFetch as unknown as typeof fetch })).ok).toBe(false);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('accepts verified hostname and partner_login action', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: 'sentinelconsig.com.br', action: 'partner_login' }) });
    expect(await verifyPartnerTurnstile(target, { env: enabled, fetchImpl: fakeFetch as unknown as typeof fetch })).toEqual({ ok: true });
    const call = fakeFetch.mock.calls[0];
    expect(call[0]).toContain('/siteverify');
    expect(call[1].body.get('secret')).toBe(enabled.TURNSTILE_SECRET_KEY);
  });

  it('rejects tokens redeemed on other hosts or for other actions', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: 'attacker.example', action: 'partner_login' }) });
    expect((await verifyPartnerTurnstile(target, { env: enabled, fetchImpl: fakeFetch as unknown as typeof fetch })).ok).toBe(false);
    fakeFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, hostname: 'sentinelconsig.com.br', action: 'other_action' }) });
    expect((await verifyPartnerTurnstile(target, { env: enabled, fetchImpl: fakeFetch as unknown as typeof fetch })).ok).toBe(false);
  });

  it('rejects failed and unreachable siteverify', async () => {
    const failing = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    expect((await verifyPartnerTurnstile(target, { env: enabled, fetchImpl: failing as unknown as typeof fetch })).ok).toBe(false);
    const unavailable = vi.fn().mockRejectedValue(new Error('network unavailable'));
    expect((await verifyPartnerTurnstile(target, { env: enabled, fetchImpl: unavailable as unknown as typeof fetch })).ok).toBe(false);
  });
});
