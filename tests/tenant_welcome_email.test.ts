import { describe, expect, it, vi } from 'vitest';
import { sendTenantOwnerWelcome, type TenantWelcomeDetails } from '../server/services/tenantWelcomeEmail';

const env = { TRANSACTIONAL_EMAIL_ENABLED: 'true', RESEND_API_KEY: 're_test_synthetic_only' };
const owner: TenantWelcomeDetails = {
  tenantId: 'tenant-123',
  tenantName: 'Empresa <Teste> & Gestão',
  tenantSlug: 'empresa-teste',
  plan: 'PRO',
  ownerId: 'owner-1',
  ownerName: 'Camila <Responsável>',
  ownerEmail: 'CAMILA@EXAMPLE.COM',
  temporaryPassword: 'Snt@abcdefghijklmnopqrstuvwxyz',
};

describe('initial tenant MASTER welcome e-mail', () => {
  it('does not send without the transactional-email feature flag', async () => {
    const fetchImpl = vi.fn();
    const result = await sendTenantOwnerWelcome(owner, {
      env: { RESEND_API_KEY: 're_test_only' }, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends a branded welcome with company, plan, URL, login and a temporary password', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'test-msg-1' }) });
    const result = await sendTenantOwnerWelcome(owner, { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ status: 'sent', id: 'test-msg-1' });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer re_test_synthetic_only');
    expect(opts.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{64}$/);
    const payload = JSON.parse(opts.body);
    expect(payload.from).toContain('notificacoes@sentinelconsig.com.br');
    expect(payload.reply_to).toBe('suporte@sentinelconsig.com.br');
    expect(payload.to).toEqual(['camila@example.com']);
    expect(payload.subject).toContain('Bem-vindo');
    expect(payload.text).toContain('Empresa <Teste> & Gestão');
    expect(payload.text).toContain('Plano: PRO');
    expect(payload.text).toContain('https://empresa-teste.sentinelconsig.com.br/');
    expect(payload.text).toContain('Login: camila@example.com');
    expect(payload.text).toContain(owner.temporaryPassword);
    expect(payload.text).toContain('senha pessoal');
    expect(payload.html).toContain('SENTINEL CONSIG');
    expect(payload.html).toContain('ACESSAR MINHA EMPRESA');
    expect(payload.html).toContain('Empresa &lt;Teste&gt; &amp; Gestão');
    expect(payload.html).toContain('Camila &lt;Responsável&gt;');
    expect(payload.html).not.toContain('<Teste>');
    expect(JSON.stringify(result)).not.toContain(owner.temporaryPassword);
  });

  it('uses deterministic idempotency for duplicate retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'test-msg-1' }) });
    await sendTenantOwnerWelcome(owner, { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    await sendTenantOwnerWelcome(owner, { env, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key'])
      .toBe(fetchImpl.mock.calls[1][1].headers['Idempotency-Key']);
  });

  it('rejects untrusted domains and header-injection attempts', async () => {
    const fetchImpl = vi.fn();
    const malicious = { ...owner, tenantSlug: 'example.com/evasion' };
    const headerAttack = { ...owner, ownerEmail: 'camila@example.com\\r\\nBcc: bad@example.com' };
    expect((await sendTenantOwnerWelcome(malicious, { env, fetchImpl: fetchImpl as unknown as typeof fetch })).status).toBe('failed');
    expect((await sendTenantOwnerWelcome(headerAttack, { env, fetchImpl: fetchImpl as unknown as typeof fetch })).status).toBe('failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns sanitized failures without leaking credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ secret: 'should-not-leak' }) });
    expect(await sendTenantOwnerWelcome(owner, { env, fetchImpl: fetchImpl as unknown as typeof fetch }))
      .toEqual({ status: 'failed', reason: 'provider_error' });
    expect(await sendTenantOwnerWelcome(owner, { env, fetchImpl: vi.fn().mockRejectedValue(new Error('private token')) as unknown as typeof fetch }))
      .toEqual({ status: 'failed', reason: 'network_error' });
  });
});
