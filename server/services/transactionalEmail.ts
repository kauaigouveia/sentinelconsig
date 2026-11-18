import crypto from 'node:crypto';

/**
 * Envio transacional do Sentinel Consig via Resend.
 *
 * Desabilitado por padrão e sem efeito sobre o Email Routing da Cloudflare.
 * Não aceita remetente do usuário, HTML arbitrário ou endereços múltiplos.
 * Os eventos enviados não incluem senhas, tokens, CPF, NB nem valores de propostas.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Sentinel Consig <notificacoes@sentinelconsig.com.br>';
const REPLY_TO = 'suporte@sentinelconsig.com.br';
const PORTAL_URL = 'https://sentinelconsig.com.br';

export type TransactionalEmailResult =
  | { status: 'skipped'; reason: 'disabled' | 'missing_key' }
  | { status: 'sent'; id: string }
  | { status: 'failed'; reason: 'invalid_recipient' | 'provider_error' | 'network_error' };

type Identity = { id: string; email: string; name?: string | null };

type Dependencies = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export const isTransactionalEmailEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.TRANSACTIONAL_EMAIL_ENABLED === 'true' && Boolean(env.RESEND_API_KEY?.trim());

function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

function validEmail(raw: string): boolean {
  // Rejeita CR/LF e espaços para não aceitar endereços com cabeçalhos injetados.
  return raw.length <= 254
    && /^[^\\s@\\r\\n]+@[^\\s@\\r\\n]+\\.[^\\s@\\r\\n]+$/.test(raw);
}

async function sendTemplate(
  identity: Identity,
  template: 'account_created' | 'password_reset',
  eventKey: string,
  dependencies: Dependencies = {},
): Promise<TransactionalEmailResult> {
  const env = dependencies.env ?? process.env;
  if (env.TRANSACTIONAL_EMAIL_ENABLED !== 'true') return { status: 'skipped', reason: 'disabled' };

  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { status: 'skipped', reason: 'missing_key' };

  const to = identity.email?.trim().toLowerCase() || '';
  if (!validEmail(to)) return { status: 'failed', reason: 'invalid_recipient' };

  const name = (identity.name || '').trim().slice(0, 100);
  const greeting = name ? `Olá, ${name}.` : 'Olá.';
  const subject = template === 'account_created'
    ? 'Seu acesso ao Sentinel Consig foi criado'
    : 'Aviso de segurança: senha redefinida no Sentinel Consig';
  const explanation = template === 'account_created'
    ? 'Seu usuário foi cadastrado no Sentinel Consig. Para acessar, utilize as credenciais fornecidas pelo administrador por um canal seguro.'
    : 'A senha da sua conta no Sentinel Consig foi redefinida por um administrador. Se você não reconhece esta ação, contate imediatamente o suporte.';
  const footer = 'Este é um aviso automático de segurança. Nenhuma senha ou token é enviado por este e-mail.';
  const text = `${greeting}\\n\\n${explanation}\\n\\nAcesse: ${PORTAL_URL}\\n\\n${footer}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#11212D">
  <h2>Sentinel Consig</h2>
  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(explanation)}</p>
  <p><a href="${PORTAL_URL}" style="color:#253745">Acessar o Sentinel Consig</a></p>
  <p style="color:#4A5C6A;font-size:12px">${escapeHtml(footer)}</p>
  </div>`;

  const idempotencyKey = crypto.createHash('sha256')
    .update(`sentinel-email:v1:${template}:${eventKey}:${identity.id}`)
    .digest('hex');

  try {
    const response = await (dependencies.fetchImpl ?? fetch)(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(7000),
    });

    // Nunca exponha a resposta de erro do provedor nos logs; pode conter PII.
    if (!response.ok) return { status: 'failed', reason: 'provider_error' };
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== 'string' || !payload.id) {
      return { status: 'failed', reason: 'provider_error' };
    }
    return { status: 'sent', id: payload.id };
  } catch {
    return { status: 'failed', reason: 'network_error' };
  }
}

export async function sendAccountCreatedNotice(
  user: Identity,
  dependencies?: Dependencies,
): Promise<TransactionalEmailResult> {
  return sendTemplate(user, 'account_created', user.id, dependencies);
}

export async function sendAdminPasswordResetNotice(
  user: Identity,
  resetId: string,
  dependencies?: Dependencies,
): Promise<TransactionalEmailResult> {
  return sendTemplate(user, 'password_reset', resetId, dependencies);
}
