import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Express, Request } from 'express';
import { hasPermission } from '../../src/lib/permissions.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { AuditLogService } from './auditLogService.js';
const BOT = 'SentinelConectaBot';
const GLOBAL_ID = 'sentinel-telegram-global-v1';
const COMPANY = 'TELEGRAM_COMPANY_V1';
const BINDING = 'TELEGRAM_BINDING_V1_';
const LINK = 'TELEGRAM_LINK_V1_';
const EVENT = 'TELEGRAM_EVENT_V1_';
type BotConfig = {
    token: string;
    secret: string;
    registered: boolean;
};
type CompanyConfig = {
    enabled: boolean;
    since: string;
};
type Binding = {
    chatId: string;
    linkedAt: string;
};
type Ticket = {
    partnerId: string;
    expires: number;
    chatId?: string;
    label?: string;
};
type Delivery = {
    proposalId: string;
    partnerId: string;
    fingerprint: string;
    linkedAt: string;
    state: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | 'STALE';
    nextAt: number;
    attempt: number;
    code?: number;
};
class TelegramError extends Error {
    constructor(public code: number, public retryAfter = 0) { super(`Telegram não concluiu a operação (HTTP ${code}).`); }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function key() { const value = process.env.JWT_SECRET || process.env.AUTH_SECRET; if (!value)
    throw new Error('Segredo de autenticação não configurado.'); return createHash('sha256').update(`sentinel:telegram:${value}`).digest(); }
function encrypt(value: unknown) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv); const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.'); }
function decrypt<T>(value: string): T { const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64')); const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag); return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')); }
function equal(a: string, b: string) { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
async function get(db: PrismaClient, tenantId: string, configKey: string) { return db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey } } }); }
async function put(db: PrismaClient, tenantId: string, configKey: string, value: unknown, secret = false) { const configValue = secret ? encrypt(value) : JSON.stringify(value); return db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue, isSecret: secret }, update: { configValue, isSecret: secret } }); }
async function botConfig(db: PrismaClient) { const row = await db.systemConfig.findUnique({ where: { id: GLOBAL_ID } }); return row ? decrypt<BotConfig>(row.configValue) : null; }
async function company(db: PrismaClient, tenantId: string): Promise<CompanyConfig> { const row = await get(db, tenantId, COMPANY); return row ? JSON.parse(row.configValue) : { enabled: false, since: new Date().toISOString() }; }
async function binding(db: PrismaClient, tenantId: string, partnerId: string) { const row = await get(db, tenantId, BINDING + partnerId); return row ? decrypt<Binding>(row.configValue) : null; }
async function telegram(config: BotConfig, method: 'getMe' | 'setWebhook' | 'sendMessage', payload: unknown = {}) {
    let response: Response;
    try {
        response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    }
    catch {
        throw new TelegramError(0);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok)
        throw new TelegramError(Number(result?.error_code) || response.status, Math.max(0, Math.min(86400, Number(result?.parameters?.retry_after) || 0)));
    return result.result;
}
function eventType(proposal: any) {
    const status = proposal.status;
    if (!status)
        return null;
    if (status.code === 'PAGO' || status.standardCategory === 'PAGO' || proposal.standardCategory === 'PAGO')
        return 'PAGO';
    if (status.code === 'CANCELADO' || status.standardCategory === 'CANCELADO' || proposal.standardCategory === 'CANCELADO')
        return 'CANCELADO';
    if (status.code === 'SALDO_RETORNADO' && ['PORTABILIDADE', 'REFIN_PORTABILIDADE'].includes(proposal.type) && Number(proposal.debtBalance) > 0)
        return 'SALDO';
    if (status.finalStatus)
        return null;
    const group = String(status.responsibleGroup).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    return ['PARCEIRO', 'CLIENTE'].includes(group) ? group : null;
}
function fingerprint(proposal: any) { return hash(`${proposal.statusId}:${proposal.statusHistories[0]?.id || proposal.statusId}:${eventType(proposal) === 'SALDO' ? String(proposal.debtBalance) : ''}`); }
const include = { status: true, statusHistories: { take: 1, orderBy: { createdAt: 'desc' as const } }, partner: true, bank: true, client: { select: { fullName: true } }, tenant: { include: { whiteLabel: true } } } satisfies Prisma.ProposalInclude;
function message(proposal: any) {
    const kind = eventType(proposal), companyName = proposal.tenant.whiteLabel?.companyName || proposal.tenant.tradeName || proposal.tenant.name;
    const labels: Record<string, string> = { SALDO: 'Saldo da portabilidade retornado', PARCEIRO: 'Sua ação é necessária', CLIENTE: 'Ação do cliente necessária', PAGO: 'Proposta paga', CANCELADO: 'Proposta cancelada' };
    const money = (value: unknown) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const client = String(proposal.client.fullName).trim().split(/\s+/).map((word: string, index: number) => index === 0 ? word : word[0] + '.').join(' ');
    return `${String(companyName).replace(/[\r\n]/g, ' ').slice(0, 160)}\n\n${labels[kind!]}.\nProposta: #${proposal.proposalNumber}\nCliente: ${client}\nBanco: ${proposal.bank?.name || 'Não informado'}\nStatus: ${proposal.status.name}${kind === 'SALDO' ? `\nSaldo devedor: ${money(proposal.debtBalance)}` : ''}\n${kind === 'PAGO' ? `Valor liberado: ${money(proposal.releasedValue)}\n` : ''}\nConsulte os detalhes no portal do parceiro.`.slice(0, 3800);
}
export class TelegramNotificationService {
    static async dispatch(db: PrismaClient) {
        const config = await botConfig(db);
        if (!config?.registered)
            return { queued: 0, sent: 0 };
        const scanDeadline = Date.now() + 15000, deadline = Date.now() + 43000;
        let queued = 0, sent = 0;
        const companies = await db.systemConfig.findMany({ where: { configKey: COMPANY, tenant: { status: 'ACTIVE', deletedAt: null } }, orderBy: { updatedAt: 'asc' }, take: 200 });
        for (const row of companies) {
            if (Date.now() > scanDeadline)
                break;
            const options: CompanyConfig = JSON.parse(row.configValue);
            if (!options.enabled || !row.tenantId)
                continue;
            const tenantId = row.tenantId;
            const cursorRow = await get(db, tenantId, 'TELEGRAM_CURSOR_V1');
            const cursor = cursorRow ? JSON.parse(cursorRow.configValue) : { time: options.since, id: '' };
            const proposals = await db.proposal.findMany({ where: { tenantId, deletedAt: null, partnerId: { not: null }, updatedAt: { gte: new Date(options.since) }, OR: [{ updatedAt: { gt: new Date(cursor.time) } }, { updatedAt: new Date(cursor.time), id: { gt: cursor.id } }] }, include, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 100 });
            for (const proposal of proposals) {
                if (Date.now() > scanDeadline)
                    break;
                if (eventType(proposal) && proposal.partner && proposal.partner.tenantId === tenantId && !proposal.partner.deletedAt && proposal.partner.status === 'ATIVO') {
                    const recipient = await binding(db, tenantId, proposal.partnerId!);
                    if (recipient && proposal.updatedAt >= new Date(recipient.linkedAt)) {
                        const fp = fingerprint(proposal), configKey = EVENT + hash(`${proposal.id}:${proposal.partnerId}:${recipient.linkedAt}:${fp}`);
                        const delivery: Delivery = { proposalId: proposal.id, partnerId: proposal.partnerId!, fingerprint: fp, linkedAt: recipient.linkedAt, state: 'PENDING', nextAt: 0, attempt: 0 };
                        await db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue: JSON.stringify(delivery), isSecret: true }, update: {} });
                        queued++;
                    }
                }
                await put(db, tenantId, 'TELEGRAM_CURSOR_V1', { time: proposal.updatedAt.toISOString(), id: proposal.id });
            }
            await db.systemConfig.updateMany({ where: { id: row.id, configValue: row.configValue }, data: { updatedAt: new Date() } });
        }
        const jobs = await db.systemConfig.findMany({ where: { configKey: { startsWith: EVENT }, OR: [{ configValue: { contains: '"state":"PENDING"' } }] }, orderBy: { updatedAt: 'asc' }, take: 100 });
        for (const job of jobs) {
            if (Date.now() > deadline)
                break;
            const tenantId = job.tenantId;
            if (!tenantId)
                continue;
            const delivery: Delivery = JSON.parse(job.configValue);
            if (delivery.nextAt > Date.now()) {
                await db.systemConfig.updateMany({ where: { id: job.id, configValue: job.configValue }, data: { updatedAt: new Date() } });
                continue;
            }
            const recipient = await binding(db, tenantId, delivery.partnerId), options = await company(db, tenantId);
            const proposal = await db.proposal.findFirst({ where: { id: delivery.proposalId, tenantId, partnerId: delivery.partnerId, deletedAt: null, partner: { tenantId, deletedAt: null, status: 'ATIVO' }, tenant: { status: 'ACTIVE', deletedAt: null } }, include });
            if (!options.enabled || !recipient || !proposal || proposal.updatedAt < new Date(options.since) || recipient.linkedAt !== delivery.linkedAt || !eventType(proposal) || fingerprint(proposal) !== delivery.fingerprint) {
                await db.systemConfig.updateMany({ where: { id: job.id, configValue: job.configValue }, data: { configValue: JSON.stringify({ ...delivery, state: 'STALE' }) } });
                continue;
            }
            const claimed = { ...delivery, state: 'SENDING', attempt: delivery.attempt + 1 };
            const lease = await db.systemConfig.updateMany({ where: { id: job.id, configValue: job.configValue }, data: { configValue: JSON.stringify(claimed) } });
            if (!lease.count)
                continue;
            try {
                await telegram(config, 'sendMessage', { chat_id: recipient.chatId, text: message(proposal), protect_content: true });
                await db.systemConfig.update({ where: { id: job.id }, data: { configValue: JSON.stringify({ ...claimed, state: 'SENT' }) } });
                sent++;
            }
            catch (error) {
                const code = error instanceof TelegramError ? error.code : 0;
                const retry = code === 429 && claimed.attempt < 5;
                await db.systemConfig.update({ where: { id: job.id }, data: { configValue: JSON.stringify({ ...claimed, state: retry ? 'PENDING' : code === 400 || code === 403 ? 'FAILED' : 'UNKNOWN', code, nextAt: Date.now() + (error instanceof TelegramError ? Math.max(60, error.retryAfter) : 60) * 1000 }) } });
            }
        }
        return { queued, sent };
    }
}
export function registerTelegramRoutes(app: Express, db: PrismaClient, getSession: (req: Request) => Promise<any>) {
    const internal = async (req: Request) => { const session = await getSession(req); const tenantId = session?.effectiveTenantId || session?.user?.tenantId; if (!session?.user || !tenantId || session.partner || /PARTNER|PARCEIRO/.test(session.activeRole || session.user.role))
        throw new Error('Acesso interno necessário.'); return { session, tenantId }; };
    const wrap = (fn: (req: Request) => Promise<unknown>) => async (req: any, res: any) => { res.setHeader('Cache-Control', 'no-store'); try {
        res.json(await fn(req));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof TelegramError ? error.message : 'Não foi possível concluir a operação Telegram. Confira permissões e configuração.' });
    } };
    app.get('/api/integrations/telegram/config', wrap(async (req) => { const { session, tenantId } = await internal(req); if (!hasPermission(session.activeRole || session.user.role, session.activePermissions || session.user.customPermissions, 'integrations.view'))
        throw new Error(); const config = await botConfig(db); return { bot: BOT, configured: !!config, registered: !!config?.registered, platformMaster: session.user.role === 'PLATFORM_MASTER', canManage: hasPermission(session.activeRole || session.user.role, session.activePermissions || session.user.customPermissions, 'integrations.manage'), ...await company(db, tenantId) }; }));
    app.put('/api/integrations/telegram/config', wrap(async (req) => { const { session, tenantId } = await internal(req); if (!hasPermission(session.activeRole || session.user.role, session.activePermissions || session.user.customPermissions, 'integrations.manage'))
        throw new Error(); if (typeof req.body?.enabled !== 'boolean')
        throw new Error(); const previous = await company(db, tenantId); await put(db, tenantId, COMPANY, { enabled: req.body.enabled, since: req.body.enabled && !previous.enabled ? new Date().toISOString() : previous.since }); return { saved: true }; }));
    app.put('/api/integrations/telegram/bot', wrap(async (req) => { const { session, tenantId } = await internal(req); if (session.user.role !== 'PLATFORM_MASTER')
        throw new Error(); const token = String(req.body?.token || '').trim(); if (!/^\d{5,15}:[a-zA-Z0-9_-]{20,200}$/.test(token))
        throw new Error(); const config: BotConfig = { token, secret: randomBytes(32).toString('hex'), registered: false }; const me = await telegram(config, 'getMe'); if (me.username?.toLowerCase() !== BOT.toLowerCase())
        throw new Error(); await db.systemConfig.upsert({ where: { id: GLOBAL_ID }, create: { id: GLOBAL_ID, configKey: 'TELEGRAM_GLOBAL_BOT_V1', configValue: encrypt(config), isSecret: true }, update: { configValue: encrypt(config) } }); await AuditLogService.record(db, { tenantId, userId: session.user.id, action: 'TELEGRAM_BOT_CONFIGURED', entity: 'SystemConfig', entityId: GLOBAL_ID, newData: { bot: BOT }, req }); return { saved: true }; }));
    app.post('/api/integrations/telegram/webhook', wrap(async (req) => { const { session, tenantId } = await internal(req); if (session.user.role !== 'PLATFORM_MASTER')
        throw new Error(); const config = await botConfig(db); if (!config)
        throw new Error(); const origin = new URL(process.env.APP_URL || 'https://sentinelconsig.com.br'); if (origin.protocol !== 'https:' || origin.username || origin.password)
        throw new Error(); await telegram(config, 'setWebhook', { url: `${origin.origin}/api/webhooks/telegram/sentinel`, secret_token: config.secret, allowed_updates: ['message'], drop_pending_updates: true }); await db.systemConfig.update({ where: { id: GLOBAL_ID }, data: { configValue: encrypt({ ...config, registered: true }) } }); await AuditLogService.record(db, { tenantId, userId: session.user.id, action: 'TELEGRAM_WEBHOOK_CONFIGURED', entity: 'SystemConfig', entityId: GLOBAL_ID, newData: { bot: BOT, registered: true }, req }); return { registered: true }; }));
    const portal = async (req: Request) => { const session = await PartnerPortalService.getPartnerSession(req, db); if (!session || session.access.mustChangePassword)
        throw new Error(); return session; };
    app.get('/api/partner-portal/telegram', wrap(async (req) => { const session = await portal(req), config = await botConfig(db), options = await company(db, session.tenant.id), current = await binding(db, session.tenant.id, session.partner.id); const ticket = await db.systemConfig.findFirst({ where: { tenantId: session.tenant.id, configKey: LINK + session.partner.id }, orderBy: { createdAt: 'desc' } }); const candidate = ticket ? decrypt<Ticket>(ticket.configValue) : null; return { bot: BOT, available: !!config?.registered && options.enabled, linked: !!current, pendingConfirmation: !!candidate?.chatId && candidate.expires > Date.now(), candidateLabel: candidate?.label, ticketId: ticket?.id }; }));
    app.post('/api/partner-portal/telegram/link', wrap(async (req) => { const session = await portal(req); const config = await botConfig(db), options = await company(db, session.tenant.id); if (!config?.registered || !options.enabled)
        throw new Error(); const payload = randomBytes(24).toString('base64url'); await db.$transaction(async (tx) => { await tx.systemConfig.deleteMany({ where: { tenantId: session.tenant.id, configKey: LINK + session.partner.id } }); await tx.systemConfig.create({ data: { id: 'tg-link-' + hash(payload), tenantId: session.tenant.id, configKey: LINK + session.partner.id, configValue: encrypt({ partnerId: session.partner.id, expires: Date.now() + 10 * 60000 }), isSecret: true } }); }); return { url: `https://t.me/${BOT}?start=${payload}`, expiresIn: 600 }; }));
    app.post('/api/partner-portal/telegram/confirm', wrap(async (req) => { const session = await portal(req); await db.$transaction(async (tx) => { const ticket = await tx.systemConfig.findFirst({ where: { id: String(req.body?.ticketId || ''), tenantId: session.tenant.id, configKey: LINK + session.partner.id } }); if (!ticket)
        throw new Error(); const candidate = decrypt<Ticket>(ticket.configValue); if (!candidate.chatId || candidate.expires < Date.now() || candidate.partnerId !== session.partner.id)
        throw new Error(); const consumed = await tx.systemConfig.deleteMany({ where: { id: ticket.id, configValue: ticket.configValue } }); if (consumed.count !== 1)
        throw new Error(); const configValue = encrypt({ chatId: candidate.chatId, linkedAt: new Date().toISOString() }); await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId: session.tenant.id, configKey: BINDING + session.partner.id } }, create: { tenantId: session.tenant.id, configKey: BINDING + session.partner.id, configValue, isSecret: true }, update: { configValue } }); }); return { linked: true }; }));
    app.delete('/api/partner-portal/telegram', wrap(async (req) => { const session = await portal(req); await db.systemConfig.deleteMany({ where: { tenantId: session.tenant.id, configKey: { in: [BINDING + session.partner.id, LINK + session.partner.id] } } }); return { linked: false }; }));
    app.post('/api/webhooks/telegram/sentinel', async (req, res) => { res.setHeader('Cache-Control', 'no-store'); try {
        const config = await botConfig(db);
        const secret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
        if (!config?.registered || !equal(secret, config.secret))
            return res.status(403).end();
        const message = req.body?.message;
        if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || message.from?.is_bot || message.from?.id !== message.chat.id)
            return res.json({ ok: true });
        const match = /^\/start(?:@SentinelConectaBot)? ([A-Za-z0-9_-]{32})$/.exec(String(message.text || ''));
        if (!match)
            return res.json({ ok: true });
        const row = await db.systemConfig.findUnique({ where: { id: 'tg-link-' + hash(match[1]) } });
        if (!row || !row.tenantId)
            return res.json({ ok: true });
        const ticket = decrypt<Ticket>(row.configValue);
        if (ticket.expires < Date.now() || ticket.chatId)
            return res.json({ ok: true });
        const valid = await db.partner.findFirst({ where: { id: ticket.partnerId, tenantId: row.tenantId, deletedAt: null, status: 'ATIVO', tenant: { status: 'ACTIVE', deletedAt: null } } });
        if (!valid)
            return res.json({ ok: true });
        const claimed = await db.systemConfig.updateMany({ where: { id: row.id, configValue: row.configValue }, data: { configValue: encrypt({ ...ticket, chatId: String(message.chat.id), label: String(message.from.username ? '@' + message.from.username : message.from.first_name || 'Telegram pessoal').slice(0, 100) }) } });
        if (claimed.count) {
            try {
                await telegram(config, 'sendMessage', { chat_id: String(message.chat.id), text: 'Telegram identificado! Volte ao portal da empresa, clique em Atualizar vínculo e confirme sua conta para receber os avisos.' });
            }
            catch { /* The portal remains the authoritative confirmation channel. */ }
        }
        return res.json({ ok: true });
    }
    catch {
        return res.status(503).json({ ok: false });
    } });
    app.get('/api/cron/telegram-notifications', async (req, res) => { const secret = process.env.CRON_SECRET; if (!secret || !equal(String(req.headers.authorization || ''), `Bearer ${secret}`))
        return res.status(403).end(); try {
        return res.json(await TelegramNotificationService.dispatch(db));
    }
    catch {
        return res.status(503).json({ error: 'Não foi possível processar os avisos Telegram.' });
    } });
}
