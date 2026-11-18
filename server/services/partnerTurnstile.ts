/**
 * Cloudflare Turnstile for partner portal authentication.
 * The server performs Siteverify; the browser only receives the public site key.
 * Enforcement is opt-in until TURNSTILE_PARTNER_ENABLED=true is deliberately configured.
 */
export const TURNSTILE_PARTNER_ACTION = 'partner_login';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function getPartnerTurnstileConfig(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env.TURNSTILE_PARTNER_ENABLED === 'true';
  return {
    enabled,
    siteKey: enabled ? (env.TURNSTILE_SITE_KEY?.trim() || null) : null,
  };
}

export type PartnerTurnstileResult =
  | { ok: true }
  | { ok: false; status: 400 | 503; error: string };

export async function verifyPartnerTurnstile(
  input: { token: unknown; expectedHostname: string },
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<PartnerTurnstileResult> {
  const env = deps.env ?? process.env;
  if (env.TURNSTILE_PARTNER_ENABLED !== 'true') return { ok: true };

  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  if (!secret || !siteKey) {
    return { ok: false, status: 503, error: 'Validação anti-robô temporariamente indisponível.' };
  }
  const token = input.token;
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    return { ok: false, status: 400, error: 'Conclua a verificação anti-robô para entrar.' };
  }

  let expectedHostname = '';
  try {
    expectedHostname = new URL('https://' + input.expectedHostname).hostname.toLowerCase();
  } catch {
    return { ok: false, status: 400, error: 'Domínio de acesso inválido.' };
  }
  if (!expectedHostname) return { ok: false, status: 400, error: 'Domínio de acesso inválido.' };

  try {
    const body = new URLSearchParams({ secret, response: token });
    const response = await (deps.fetchImpl ?? fetch)(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5500),
    });
    if (!response.ok) {
      return { ok: false, status: 503, error: 'Validação anti-robô indisponível. Tente novamente.' };
    }
    const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
    if (
      result.success !== true ||
      result.action !== TURNSTILE_PARTNER_ACTION ||
      (result.hostname || '').toLowerCase() !== expectedHostname
    ) {
      return { ok: false, status: 400, error: 'Verificação anti-robô inválida ou expirada. Tente novamente.' };
    }
    return { ok: true };
  } catch {
    // Network/timeout errors are never interpreted as a passed challenge.
    return { ok: false, status: 503, error: 'Não foi possível validar a verificação anti-robô. Tente novamente.' };
  }
}
