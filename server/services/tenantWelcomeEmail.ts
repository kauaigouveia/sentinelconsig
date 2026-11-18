import crypto from 'node:crypto';
import { isTransactionalEmailEnabled } from './transactionalEmail.js';

const ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Sentinel Consig <notificacoes@sentinelconsig.com.br>';
const REPLY_TO = 'suporte@sentinelconsig.com.br';

export interface TenantWelcomeDetails {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  plan: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  temporaryPassword: string;
}

export type TenantWelcomeResult =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: 'disabled' }
  | { status: 'failed'; reason: 'invalid_input' | 'provider_error' | 'network_error' };

function htmlEscape(input: string): string {
  return input.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

/** Welcome only for the initial MASTER owner created with the tenant. */
export async function sendTenantOwnerWelcome(
  details: TenantWelcomeDetails,
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<TenantWelcomeResult> {
  const env = deps.env ?? process.env;
  if (!isTransactionalEmailEnabled(env)) return { status: 'skipped', reason: 'disabled' };

  const email = String(details.ownerEmail || '').trim().toLowerCase();
  const slug = String(details.tenantSlug || '').trim().toLowerCase();
  const password = String(details.temporaryPassword || '');
  if (
    !/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email) ||
    email.length > 254 ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ||
    password.length < 20 ||
    /[\r\n]/.test(password) ||
    !details.tenantId || !details.ownerId
  ) return { status: 'failed', reason: 'invalid_input' };

  const company = String(details.tenantName || 'Sua empresa').trim().slice(0, 120);
  const owner = String(details.ownerName || 'Administrador').trim().slice(0, 100);
  const plan = String(details.plan || 'PRO').trim().slice(0, 40);
  const url = `https://${slug}.sentinelconsig.com.br/login`;
  const subject = 'Bem-vindo ao Sentinel Consig — sua empresa está pronta!';
  const text = [
    `Olá, ${owner}!`,
    '',
    `A empresa ${company} foi cadastrada com sucesso no Sentinel Consig.`,
    '',
    'DADOS DO SEU ACESSO',
    `Empresa: ${company}`,
    `Plano: ${plan}`,
    `Link: ${url}`,
    `Login: ${email}`,
    `Senha temporária: ${password}`,
    '',
    'No primeiro acesso, você deverá cadastrar uma nova senha pessoal.',
    'Por segurança, não compartilhe estas credenciais.',
    '',
    'Comece organizando sua equipe, suas propostas e os acompanhamentos da operação.',
    '',
    'Precisa de ajuda? Responda a este e-mail ou escreva para suporte@sentinelconsig.com.br.',
    'Equipe Sentinel Consig',
  ].join('\n');

  const safeCompany = htmlEscape(company);
  const safeOwner = htmlEscape(owner);
  const safePlan = htmlEscape(plan);
  const safeEmail = htmlEscape(email);
  const safeUrl = htmlEscape(url);
  const safePassword = htmlEscape(password);
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eff2f3;font-family:Arial,Helvetica,sans-serif;color:#11212D">
<div style="display:none;font-size:1px;color:#eff2f3;max-height:0;overflow:hidden">Seu ambiente está pronto. Veja seu acesso inicial ao Sentinel Consig.</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eff2f3"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#06141B;padding:30px 34px;border-bottom:3px solid #9BA8AB">
  <div style="font-size:12px;letter-spacing:3px;font-weight:800;color:#CCD0CF">SENTINEL CONSIG</div>
  <h1 style="font-size:29px;line-height:1.2;margin:26px 0 9px;color:#ffffff">Seu próximo capítulo começa aqui.</h1>
  <p style="font-size:15px;color:#CCD0CF;line-height:1.6;margin:0">Tudo pronto para transformar a gestão da sua operação.</p>
</td></tr>
<tr><td style="padding:32px 34px">
  <p style="margin:0 0 16px;font-size:16px">Olá, <strong>${safeOwner}</strong>!</p>
  <p style="font-size:15px;line-height:1.7;margin:0 0 22px">É um prazer dar as boas-vindas à <strong>${safeCompany}</strong>. Seu ambiente exclusivo foi criado e você já pode começar a configurar sua equipe e acompanhar sua operação.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7f7;border:1px solid #dfe5e6;border-radius:12px">
    <tr><td style="padding:23px">
      <div style="font-size:11px;letter-spacing:1.8px;font-weight:700;color:#4A5C6A;margin-bottom:15px">SEUS DADOS DE ACESSO</div>
      <p style="margin:0 0 10px;font-size:14px"><span style="color:#4A5C6A">Empresa:</span> <strong>${safeCompany}</strong></p>
      <p style="margin:0 0 10px;font-size:14px"><span style="color:#4A5C6A">Plano:</span> <strong>${safePlan}</strong></p>
      <p style="margin:0 0 10px;font-size:14px"><span style="color:#4A5C6A">Login:</span> <strong>${safeEmail}</strong></p>
      <p style="margin:0;font-size:14px"><span style="color:#4A5C6A">Senha temporária:</span><br><strong style="display:inline-block;margin-top:8px;padding:10px 12px;border-radius:6px;background:#ffffff;color:#06141B;font-family:Consolas,monospace;letter-spacing:1px">${safePassword}</strong></p>
    </td></tr>
  </table>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:25px 0 8px">
    <a href="${safeUrl}" style="display:inline-block;background:#11212D;border-radius:9px;padding:16px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">ACESSAR MINHA EMPRESA</a>
  </td></tr></table>
  <p style="margin:10px 0 24px;text-align:center;font-size:12px;overflow-wrap:anywhere"><a style="color:#253745" href="${safeUrl}">${safeUrl}</a></p>
  <div style="background:#f2f6f6;border-left:4px solid #4A5C6A;border-radius:4px;padding:15px 17px;font-size:13px;line-height:1.6">
    <strong>Seu primeiro acesso é protegido.</strong><br>
    Ao entrar, o sistema solicitará que você substitua a senha temporária por uma senha pessoal. Não compartilhe este e-mail.
  </div>
  <h2 style="font-size:17px;margin:27px 0 10px">Por onde começar?</h2>
  <p style="font-size:14px;color:#4A5C6A;line-height:1.75;margin:0">Personalize sua empresa, convide sua equipe e centralize as propostas, simulações e acompanhamentos em um único lugar.</p>
  <p style="font-size:14px;line-height:1.6;margin:24px 0 0">Conte conosco nessa jornada!<br><strong>Equipe Sentinel Consig</strong></p>
</td></tr>
<tr><td style="background:#06141B;padding:20px 34px;text-align:center">
  <div style="font-size:12px;color:#CCD0CF">Precisa de ajuda? <a href="mailto:suporte@sentinelconsig.com.br" style="color:#ffffff">suporte@sentinelconsig.com.br</a></div>
  <p style="font-size:11px;line-height:1.5;color:#9BA8AB;margin:10px 0 0">Mensagem automática referente ao cadastro da sua empresa em sentinelconsig.com.br.</p>
</td></tr></table></td></tr></table></body></html>`;

  // Deterministic per tenant-owner; Resend handles duplicate retries.
  const idempotencyKey = crypto.createHash('sha256')
    .update(`sentinel-email:v1:tenant-welcome:${details.tenantId}:${details.ownerId}`)
    .digest('hex');

  try {
    const response = await (deps.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(7000),
    });
    // Never log the provider response: it can include customer or credential details.
    if (!response.ok) return { status: 'failed', reason: 'provider_error' };
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== 'string' || !payload.id) return { status: 'failed', reason: 'provider_error' };
    return { status: 'sent', id: payload.id };
  } catch {
    return { status: 'failed', reason: 'network_error' };
  }
}
