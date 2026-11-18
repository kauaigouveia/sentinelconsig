import { describe, expect, it, vi } from 'vitest';
import {
  isTransactionalEmailEnabled,
  sendAccountCreatedNotice,
  sendAdminPasswordResetNotice,
} from '../server/services/transactionalEmail';

const env = { TRANSACTIONAL_EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_synthetic_api_key' };
const user = { id: 'user-1', name: '<Kauai & Teste>', email: 'KAUAI@EXAMPLE.COM' };

describe('Resend transactional email (opt-in)', () => {
  it('never sends unless explicitly enabled with a secret', async () => {
    const fakeFetch = vi.fn();
    expect(isTransactionalEmailEnabled({})).toBe(false);
    expect(isTransactionalEmailEnabled({ TRANSACTIONAL_EMAIL_ENABLED: 'true' })).toBe(false);
    expect(await sendAccountCreatedNotice(user, { env: {}, fetchImpl: fakeFetch as unknown as typeof fetch }))
      .toEqual({ status: 'skipped', reason: 'disabled' });
    expect(await sendAccountCreatedNotice(user, {
      env: { TRANSACTIONAL_EMAIL_ENABLED: 'true' },
      fetchImpl: fakeFetch as unknown as typeof fetch,
    })).toEqual({ status: 'skipped', reason: 'missing_key' });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('rejects invalid addresses without reaching provider', async () => {
    const fakeFetch = vi.fn();
    const invalidEmail = { ...user, email: 'victim@example.com\r\nBcc: attacker@example.com' };
    expect(await sendAccountCreatedNotice(invalidEmail, {
      env, fetchImpl: fakeFetch as unknown as typeof fetch,
    })).toEqual({ status: 'failed', reason: 'invalid_recipient' });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('sends minimal safe content only to intended user, with fixed sender and reply-to', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: 'resend-message-id' }),
    });
    expect(await sendAccountCreatedNotice(user, { env, fetchImpl: fakeFetch as unknown as typeof fetch }))
      .toEqual({ status: 'sent', id: 'resend-message-id' });
    const [url, opts] = fakeFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer re_synthetic_api_key');
    expect(opts.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{64}$/);
    const data = JSON.parse(opts.body);
    expect(data.from).toContain('notificacoes@sentinelconsig.com.br');
    expect(data.reply_to).toBe('suporte@sentinelconsig.com.br');
    expect(data.to).toEqual(['kauai@example.com']);
    expect(data.html).toContain('&lt;Kauai &amp; Teste&gt;');
    expect(data.text).toContain('\n');
    expect(JSON.stringify(data)).not.toMatch(/password|senha temporária|cpf|token/i);
    expect(opts.signal).toBeDefined();
  });

  it('uses a distinct key for each password-reset event, never emails a password', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: 'message-id' }),
    });
    const a = await sendAdminPasswordResetNotice(user, 'reset-1', { env, fetchImpl: fakeFetch as unknown as typeof fetch });
    const b = await sendAdminPasswordResetNotice(user, 'reset-2', { env, fetchImpl: fakeFetch as unknown as typeof fetch });
    expect(a.status).toBe('sent');
    expect(b.status).toBe('sent');
    expect(fakeFetch.mock.calls[0][1].headers['Idempotency-Key'])
      .not.toBe(fakeFetch.mock.calls[1][1].headers['Idempotency-Key']);
    const payload = JSON.parse(fakeFetch.mock.calls[0][1].body);
    expect(payload.subject).toContain('senha redefinida');
    expect(payload.text).not.toContain('Mudar@');
  });

  it('fails safely without leaking provider response on rate limits and outages', async () => {
    const blocked = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    expect(await sendAccountCreatedNotice(user, { env, fetchImpl: blocked as unknown as typeof fetch }))
      .toEqual({ status: 'failed', reason: 'provider_error' });
    const down = vi.fn().mockRejectedValue(new Error('secret transport details'));
    expect(await sendAccountCreatedNotice(user, { env, fetchImpl: down as unknown as typeof fetch }))
      .toEqual({ status: 'failed', reason: 'network_error' });
  });
});
