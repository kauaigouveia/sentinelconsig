import { runPortabilityAutomation } from './portabilityAutomationService.js';
import {waitUntil} from '@vercel/functions';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Express, Request } from 'express';
import { hasPermission } from '../../src/lib/permissions.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { AuditLogService } from './auditLogService.js';
import { downloadTelegramPdf, readTelegramInssPdf, telegramPdfReviewText,parseTelegramSelectedContracts,validateTelegramPdfDocument,calculateTelegramInssQuotes,telegramPdfErrorCode,telegramPdfErrorMessage,TELEGRAM_PDF_TTL_MS,type TelegramPdfReview } from './telegramInssPdfService.js';
import { calculateTelegramInssOfficialQuotes } from './telegramInssOfficialQuotes.js';
import {formatTelegramInssPortfolio} from './telegramInssPortfolio.js';
import {calculateTelegramInssMarginQuotes} from './telegramInssMarginQuotes.js';
import { normalizeTelegramMenuInput } from './telegramProductMenu.js';
import {beginTelegramNativeSimulation,continueTelegramCltSimulation,cltConsultationOptions,telegramNativePrompt,acceptTelegramNativeAnswer,telegramNativeSummary,type TelegramNativeDraft} from './telegramNativeSimulation.js';
import {executeTelegramNativeSimulation,executeTelegramCltMargin} from './telegramNativeSimulationExecutor.js';
import {telegramMainMenu,telegramSectionMenu,telegramMenuAction,telegramSimulationTarget,telegramPortalLink,type TelegramProductSection} from './telegramProductMenu.js';
const BOT = 'SentinelConectaBot';
const GLOBAL_ID = 'sentinel-telegram-global-v1';
const COMPANY = 'TELEGRAM_COMPANY_V1';
const BINDING = 'TELEGRAM_BINDING_V1_';
const LINK = 'TELEGRAM_LINK_V1_';
const EVENT = 'TELEGRAM_EVENT_V1_';
const CUSTOM = 'TELEGRAM_CUSTOM_BOT_V1';
const REJECTED_CODES = ['REPROVADO', 'REPROVADA', 'RECUSADO', 'RECUSADA'];
type Store = PrismaClient | Prisma.TransactionClient;
type BotConfig = {
    token: string;
    secret: string;
    registered: boolean;
    username?: string;
    ownerTenant?: string;
};
type CompanyConfig = {
    enabled: boolean;
    since: string;
    supportEnabled?: boolean;
    botMode?: 'SHARED' | 'CUSTOM';
};
type Binding = {
    chatId: string;
    linkedAt: string;
    botId?: string;
};
type Ticket = {
    partnerId: string;
    botId?: string;
    expires: number;
    chatId?: string;
    label?: string;
};
type Delivery = {
    proposalId: string;
    statusId?: string | null;
    partnerId: string;
    fingerprint: string;
    linkedAt: string;
    state: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | 'STALE';
    nextAt: number;
    attempt: number;
    code?: number;
};
class TelegramConfigError extends Error {}
class TelegramPortalError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
class TelegramError extends Error {
    constructor(public code: number, public retryAfter = 0) { super(`Telegram não concluiu a operação (HTTP ${code}).`); }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function key() { const value = process.env.JWT_SECRET || process.env.AUTH_SECRET; if (!value)
    throw new Error('Segredo de autenticação não configurado.'); return createHash('sha256').update(`sentinel:telegram:${value}`).digest(); }
function encrypt(value: unknown) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv); const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.'); }
function decrypt<T>(value: string): T { const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64')); const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag); return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')); }
function equal(a: string, b: string) { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
async function get(db: Store, tenantId: string, configKey: string) { return db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey } } }); }
async function put(db: Store, tenantId: string, configKey: string, value: unknown, secret = false) { const configValue = secret ? encrypt(value) : JSON.stringify(value); return db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue, isSecret: secret }, update: { configValue, isSecret: secret } }); }
async function botConfig(db: Store) { const row = await db.systemConfig.findUnique({ where: { id: GLOBAL_ID } }); return row ? decrypt<BotConfig>(row.configValue) : null; }
async function company(db: Store, tenantId: string): Promise<CompanyConfig> { const row = await get(db, tenantId, COMPANY); return row ? { ...JSON.parse(row.configValue), supportEnabled: false } : { enabled: false, supportEnabled: false, since: new Date().toISOString() }; }
function botId(config: BotConfig) { return config.token.split(':')[0]; }
async function customBot(db: Store, tenantId: string) { const row = await get(db, tenantId, CUSTOM); return row ? { ...decrypt<BotConfig>(row.configValue), ownerTenant: tenantId } : null; }
async function activeBot(db: Store, tenantId: string) { const options = await company(db,tenantId); return options.botMode === 'CUSTOM' ? customBot(db,tenantId) : botConfig(db); }
async function binding(db: Store, tenantId: string, partnerId: string, active?: BotConfig | null) { const config=active || await activeBot(db,tenantId); if(!config?.registered)return null; const row=await get(db,tenantId,BINDING+partnerId);if(!row)return null;const value=decrypt<Binding>(row.configValue);return value.botId ? value.botId===botId(config)?value:null : !config.ownerTenant?value:null; }
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
    if (REJECTED_CODES.includes(status.code) || status.standardCategory === 'RECUSADO' || proposal.standardCategory === 'RECUSADO')
        return 'REPROVADO';
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
const include = { status: true, statusHistories: { take: 1, orderBy: { createdAt: 'desc' as const } }, partner: true, bank: true, client: { select: { fullName: true, cpf: true } }, tenant: { include: { whiteLabel: true } } } satisfies Prisma.ProposalInclude;
function message(proposal: any, portabilityRefinValue?: unknown, query = false, portabilityBalance: unknown = proposal.debtBalance) {
    const kind = eventType(proposal), companyName = proposal.tenant.whiteLabel?.companyName || proposal.tenant.tradeName || proposal.tenant.name;
    const labels: Record<string, string> = { SALDO: 'Saldo da portabilidade retornado', PARCEIRO: 'Sua ação é necessária', CLIENTE: 'Ação do cliente necessária', PAGO: 'Proposta paga', CANCELADO: 'Proposta cancelada', REPROVADO: 'Proposta reprovada' };
    const money = (value: unknown) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const html = (value: unknown) => String(value ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, 160).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cpfDigits = String(proposal.client.cpf || '').replace(/\D/g, '');
    const cpf = cpfDigits.length === 11 ? `***.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-**` : 'Não informado';
    const isPortability = ['PORTABILIDADE', 'REFIN_PORTABILIDADE'].includes(proposal.type);
    const types: Record<string, string> = { NOVO: 'Novo', REFIN: 'Refinanciamento', PORTABILIDADE: 'Portabilidade', REFIN_PORTABILIDADE: 'Refinanciamento da portabilidade', CARTAO_RMC: 'Cartão RMC', CARTAO_RCC: 'Cartão RCC', SAQUE_COMPLEMENTAR: 'Saque complementar' };
    const released = kind === 'SALDO' || (query && isPortability) ? portabilityRefinValue : proposal.releasedValue;
    return `<b>${html(companyName)}</b>\n\n${query ? 'Consulta da proposta' : labels[kind!]}.\nBanco: <b>${html(proposal.bank?.name || 'Não informado')}</b>\nProposta: <b>${html(proposal.proposalNumber)}</b>\nTipo da proposta: <b>${html(types[proposal.type] || proposal.type)}</b>\nValor liberado: <b>${html(released == null ? 'Não informado' : money(released))}</b>\nCliente: <b>${html(proposal.client.fullName)}</b>\nCPF: <b>${cpf}</b>\nEtapa: <b>${html(proposal.status?.name || 'Etapa não informada')}</b>${kind === 'SALDO' || (query && isPortability) ? `\nSaldo devedor: <b>${html(portabilityBalance == null ? 'Não informado' : money(portabilityBalance))}</b>` : ''}\n\nConsulte os detalhes no portal do parceiro.`;
}
export class TelegramNotificationService {
    static async dispatch(db: PrismaClient, deadline = Date.now() + 43000) {
        const scanDeadline = Math.min(Date.now() + 15000, deadline);
        let queued = 0, sent = 0;
        const companies = await db.systemConfig.findMany({ where: { configKey: COMPANY, tenant: { status: 'ACTIVE', deletedAt: null } }, orderBy: { updatedAt: 'asc' }, take: 200 });
        for (const row of companies) {
            if (Date.now() > scanDeadline)
                break;
            const options: CompanyConfig = JSON.parse(row.configValue);
            if (!options.enabled || !row.tenantId)
                continue;
            const tenantId = row.tenantId;
            const config = await activeBot(db,tenantId); if(!config?.registered)continue;
            const cursorRow = await get(db, tenantId, 'TELEGRAM_CURSOR_V1');
            const cursor = cursorRow ? JSON.parse(cursorRow.configValue) : { time: options.since, id: '' };
            const enqueue = async (proposal: any) => {
                if (eventType(proposal) && proposal.partner && proposal.partner.tenantId === tenantId && !proposal.partner.deletedAt && proposal.partner.status === 'ATIVO') {
                    const recipient = await binding(db, tenantId, proposal.partnerId!);
                    if (recipient && proposal.updatedAt >= new Date(recipient.linkedAt)) {
                        const fp = fingerprint(proposal), configKey = EVENT + hash(`${proposal.id}:${proposal.partnerId}:${recipient.linkedAt}:${fp}`);
                        const delivery: Delivery = { proposalId: proposal.id, statusId: proposal.statusId, partnerId: proposal.partnerId!, fingerprint: fp, linkedAt: recipient.linkedAt, state: 'PENDING', nextAt: 0, attempt: 0 };
                        await db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue: JSON.stringify(delivery), isSecret: true }, update: {} });
                        queued++;
                    }
                }
            };
            const proposals = await db.proposal.findMany({ where: { tenantId, deletedAt: null, partnerId: { not: null }, updatedAt: { gte: new Date(options.since) }, OR: [{ updatedAt: { gt: new Date(cursor.time) } }, { updatedAt: new Date(cursor.time), id: { gt: cursor.id } }] }, include, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 100 });
            for (const proposal of proposals) {
                if (Date.now() > scanDeadline)
                    break;
                await enqueue(proposal);
                await put(db, tenantId, 'TELEGRAM_CURSOR_V1', { time: proposal.updatedAt.toISOString(), id: proposal.id });
            }
            // One bounded catch-up for rejections skipped by the old final-status filter.
            // Keep the live cursor intact, and reuse event/status deduplication at delivery.
            const recoveryKey = 'TELEGRAM_REJECTION_CATCHUP_V1';
            const recoveryRow = await get(db, tenantId, recoveryKey);
            const recovery = recoveryRow ? JSON.parse(recoveryRow.configValue) : { time: options.since, id: '', until: new Date().toISOString(), done: false };
            if (!recoveryRow) await put(db, tenantId, recoveryKey, recovery);
            if (!recovery.done && Date.now() < scanDeadline) {
                const missed = await db.proposal.findMany({
                    where: { tenantId, deletedAt: null, partnerId: { not: null },
                        updatedAt: { gte: new Date(options.since), lte: new Date(recovery.until) },
                        AND: [
                            { OR: [{ status: { code: { in: REJECTED_CODES } } }, { status: { standardCategory: 'RECUSADO' } }, { standardCategory: 'RECUSADO' }] },
                            { OR: [{ updatedAt: { gt: new Date(recovery.time) } }, { updatedAt: new Date(recovery.time), id: { gt: recovery.id } }] },
                        ],
                    }, include, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: 100,
                });
                let processed = 0;
                for (const proposal of missed) {
                    if (Date.now() > scanDeadline) break;
                    await enqueue(proposal);
                    recovery.time = proposal.updatedAt.toISOString(); recovery.id = proposal.id;
                    await put(db, tenantId, recoveryKey, recovery);
                    processed++;
                }
                if (processed === missed.length && missed.length < 100) await put(db, tenantId, recoveryKey, { ...recovery, done: true });
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
            const config = await activeBot(db,tenantId);
            const recipient = await binding(db, tenantId, delivery.partnerId,config), options = await company(db, tenantId);
            const proposal = await db.proposal.findFirst({ where: { id: delivery.proposalId, tenantId, partnerId: delivery.partnerId, deletedAt: null, partner: { tenantId, deletedAt: null, status: 'ATIVO' }, tenant: { status: 'ACTIVE', deletedAt: null } }, include });
            if (!config?.registered || !options.enabled || !recipient || !proposal || proposal.updatedAt < new Date(options.since) || recipient.linkedAt !== delivery.linkedAt || !eventType(proposal) || fingerprint(proposal) !== delivery.fingerprint) {
                await db.systemConfig.updateMany({ where: { id: job.id, configValue: job.configValue }, data: { configValue: JSON.stringify({ ...delivery, state: 'STALE' }) } });
                continue;
            }
            const sentKey = 'TELEGRAM_LAST_SENT_STATUS_V1_' + hash(`${proposal.id}:${delivery.partnerId}`);
            const lastSent = await get(db, tenantId, sentKey);
            let alreadySent = lastSent ? JSON.parse(lastSent.configValue).statusId === proposal.statusId : false;
            if (!lastSent) {
                // Recognize deliveries made before the last-status marker was introduced.
                const previous = await db.systemConfig.findFirst({
                    where: { tenantId, configKey: { startsWith: EVENT }, AND: [
                        { configValue: { contains: JSON.stringify({ proposalId: proposal.id }).slice(1, -1) } },
                        { configValue: { contains: '"state":"SENT"' } },
                    ] }, orderBy: { updatedAt: 'desc' },
                });
                const sent: Delivery | null = previous ? JSON.parse(previous.configValue) : null;
                alreadySent = !!sent && sent.partnerId === delivery.partnerId && (sent.statusId !== undefined ? sent.statusId === proposal.statusId : sent.fingerprint === fingerprint(proposal));
                if (alreadySent) await put(db, tenantId, sentKey, { statusId: proposal.statusId });
            }
            if (alreadySent) {
                await db.systemConfig.updateMany({ where: { id: job.id, configValue: job.configValue }, data: { configValue: JSON.stringify({ ...delivery, state: 'STALE' }) } });
                continue;
            }
            // Only an explicit link may supply the refinancing amount; never infer by CPF.
            let portabilityRefinValue: unknown;
            if (eventType(proposal) === 'SALDO') {
                if (proposal.type === 'REFIN_PORTABILIDADE') {
                    portabilityRefinValue = proposal.releasedValue;
                } else {
                    const refin = await db.proposal.findFirst({
                        where: { tenantId, partnerId: delivery.partnerId, clientId: proposal.clientId, relatedPortabilityId: proposal.id, type: 'REFIN_PORTABILIDADE', deletedAt: null },
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                        select: { releasedValue: true },
                    });
                    portabilityRefinValue = refin?.releasedValue;
                }
            }
            const claimed = { ...delivery, state: 'SENDING', attempt: delivery.attempt + 1 };
            const lease = await db.systemConfig.updateMany({ where: { id: job.id, configValue: job.configValue }, data: { configValue: JSON.stringify(claimed) } });
            if (!lease.count)
                continue;
            try {
                await telegram(config, 'sendMessage', { chat_id: recipient.chatId, text: message(proposal, portabilityRefinValue), parse_mode: 'HTML', protect_content: true });
                await db.systemConfig.update({ where: { id: job.id }, data: { configValue: JSON.stringify({ ...claimed, state: 'SENT' }) } });
                await put(db, tenantId, sentKey, { statusId: proposal.statusId });
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

    static async deliverSupport(messageId:string,tenantId:string,db:PrismaClient){
      const row=await db.supportMessage.findFirst({where:{id:messageId,tenantId,channel:'TELEGRAM',senderType:'SUPPORT'},include:{conversation:{include:{tenant:{include:{whiteLabel:true}}}}}});if(!row)return;
      const config=await activeBot(db,tenantId),options=await company(db,tenantId),recipient=await binding(db,tenantId,row.conversation.partnerId,config),route=await get(db,tenantId,'TELEGRAM_CONVERSATION_'+row.conversationId);
      const target=route?decrypt<{chatId:string;botId:string;linkedAt:string}>(route.configValue):null;
      const validPartner=await db.partner.findFirst({where:{id:row.conversation.partnerId,tenantId,status:'ATIVO',deletedAt:null,tenant:{status:'ACTIVE',deletedAt:null}}});
      if(!config?.registered||!options.supportEnabled||!recipient||!target||target.chatId!==recipient.chatId||target.botId!==botId(config)||target.linkedAt!==recipient.linkedAt||!validPartner||row.conversation.status==='CLOSED'){await db.supportMessage.updateMany({where:{id:row.id,tenantId,deliveryStatus:'PENDING'},data:{deliveryStatus:'FAILED'}});return;}
      const lease=await db.supportMessage.updateMany({where:{id:row.id,tenantId,deliveryStatus:'PENDING',OR:[{deliveryAttemptAt:null},{deliveryAttemptAt:{lte:new Date()}}]},data:{deliveryStatus:'SENDING',deliveryAttemptAt:new Date()}});if(!lease.count)return;
      try{const tenant=row.conversation.tenant;const title=String(tenant.whiteLabel?.companyName||tenant.tradeName||tenant.name).replace(/[\r\n]/g,' ').slice(0,160);const response=await telegram(config,'sendMessage',{chat_id:recipient.chatId,text:`${title} · Atendimento\n${String(row.senderName||'Suporte').slice(0,100)}\n\n${row.message}`.slice(0,4096),protect_content:true});await db.supportMessage.update({where:{id:row.id},data:{deliveryStatus:'SENT',externalMessageId:`tg:${botId(config)}:${hash(recipient.chatId)}:${response.message_id}`}});}
      catch(error){const code=error instanceof TelegramError?error.code:0;await db.supportMessage.update({where:{id:row.id},data:{deliveryStatus:code===429?'PENDING':code===400||code===403?'FAILED':'UNKNOWN',deliveryAttemptAt:new Date(Date.now()+(error instanceof TelegramError?Math.max(60,error.retryAfter):60)*1000)}});}
    }
}

export function registerTelegramRoutes(app:Express,db:PrismaClient,getSession:(req:Request)=>Promise<any>){
 const internal=async(req:Request,permission='integrations.manage')=>{const session=await getSession(req);const tenantId=session?.effectiveTenantId||session?.user?.tenantId;if(!session?.user||!tenantId||session.partner||/PARTNER|PARCEIRO/.test(session.activeRole||session.user.role)||!hasPermission(session.activeRole||session.user.role,session.activePermissions||session.user.customPermissions,permission))throw new Error();return {session,tenantId};};
 const platformActor=async(req:Request)=>{const session=await getSession(req);if(!session?.user||session.user.role!=='PLATFORM_MASTER'||session.partner)throw new Error();return {session,tenantId:session.effectiveTenantId||session.user.tenantId||''};};
 const wrap=(fn:(req:Request)=>Promise<unknown>)=>async(req:any,res:any)=>{res.setHeader('Cache-Control','no-store');try{res.json(await fn(req));}catch(error){res.status(error instanceof TelegramPortalError?error.status:400).json({code:error instanceof TelegramPortalError?error.code:undefined,error:error instanceof TelegramPortalError||error instanceof TelegramError||error instanceof TelegramConfigError?error.message:'Não foi possível concluir a operação Telegram. Confira permissões, token e configuração do bot.'});}};
 app.get('/api/integrations/telegram/config',wrap(async req=>{const actor=await getSession(req);if(actor?.user?.role==='PLATFORM_MASTER'&&!actor.effectiveTenantId&&!actor.user.tenantId){const global=await botConfig(db);return {hasCompany:false,bot:BOT,configured:!!global,registered:!!global?.registered,globalConfigured:!!global,globalRegistered:!!global?.registered,platformMaster:true,canManage:false,botMode:'SHARED',enabled:false,supportEnabled:false};}const {session,tenantId}=await internal(req,'integrations.view');const config=await activeBot(db,tenantId),global=await botConfig(db);return {hasCompany:true,bot:config?.username||((await company(db,tenantId)).botMode==='CUSTOM'?'Bot próprio':BOT),configured:!!config,registered:!!config?.registered,globalConfigured:!!global,globalRegistered:!!global?.registered,platformMaster:session.user.role==='PLATFORM_MASTER',canManage:hasPermission(session.activeRole||session.user.role,session.activePermissions||session.user.customPermissions,'integrations.manage'),botMode:'SHARED',supportEnabled:false,...await company(db,tenantId)};}));
 app.put('/api/integrations/telegram/config',wrap(async req=>{const {session,tenantId}=await internal(req);const previous=await company(db,tenantId);if(req.body.enabled!==undefined&&typeof req.body.enabled!=='boolean'||req.body.supportEnabled!==undefined&&typeof req.body.supportEnabled!=='boolean'||req.body.botMode!==undefined&&!['SHARED','CUSTOM'].includes(req.body.botMode))throw new Error();const value={...previous,...(typeof req.body.enabled==='boolean'?{enabled:req.body.enabled}:{}),supportEnabled:false,...(req.body.botMode?{botMode:req.body.botMode}:{})};if(value.enabled&&!previous.enabled)value.since=new Date().toISOString();await put(db,tenantId,COMPANY,value);await AuditLogService.record(db,{tenantId,userId:session.user.id,action:'TELEGRAM_COMPANY_UPDATED',entity:'SystemConfig',newData:{enabled:value.enabled,supportEnabled:value.supportEnabled,botMode:value.botMode||'SHARED'},req});return {saved:true};}));
 const saveBot=async(req:Request,own:boolean)=>{const {session,tenantId}=await (own?internal(req):platformActor(req));if(!own&&session.user.role!=='PLATFORM_MASTER')throw new Error();const token=String(req.body?.token||'').trim();if(!/^\d{5,15}:[a-zA-Z0-9_-]{20,200}$/.test(token))throw new Error();const config:BotConfig={token,secret:randomBytes(32).toString('hex'),registered:false};const me=await telegram(config,'getMe');if(!me.username||(!own&&me.username.toLowerCase()!==BOT.toLowerCase())||(own&&me.username.toLowerCase()===BOT.toLowerCase()))throw new Error();config.username=me.username;
 await db.$transaction(async tx=>{const ownerId='tg-owner-'+botId(config),owner=await tx.systemConfig.findUnique({where:{id:ownerId}});const expected=own?tenantId:'PLATFORM';if(owner&&owner.configValue!==expected)throw new TelegramConfigError('Este bot já está vinculado a outra empresa. Cadastre um bot exclusivo desta empresa.');if(!owner)await tx.systemConfig.create({data:{id:ownerId,configKey:'TELEGRAM_BOT_OWNER',configValue:expected,isSecret:true}});if(own)await put(tx,tenantId,CUSTOM,config,true);else await tx.systemConfig.upsert({where:{id:GLOBAL_ID},create:{id:GLOBAL_ID,configKey:'TELEGRAM_GLOBAL_BOT_V1',configValue:encrypt(config),isSecret:true},update:{configValue:encrypt(config)}});});await AuditLogService.record(db,{tenantId:tenantId||null,userId:session.user.id,action:'TELEGRAM_BOT_CONFIGURED',entity:'SystemConfig',newData:{own,username:config.username},req});return {saved:true};};
 app.put('/api/integrations/telegram/bot',wrap(req=>saveBot(req,false)));
 app.put('/api/integrations/telegram/custom-bot',wrap(req=>saveBot(req,true)));
 const register=async(req:Request,own:boolean)=>{const {session,tenantId}=await (own?internal(req):platformActor(req));if(!own&&session.user.role!=='PLATFORM_MASTER')throw new Error();const config=own?await customBot(db,tenantId):await botConfig(db);if(!config)throw new Error();const origin=new URL(process.env.APP_URL||'https://sentinelconsig.com.br');if(origin.protocol!=='https:'||origin.username||origin.password)throw new Error();await telegram(config,'setWebhook',{url:`${origin.origin}/api/webhooks/telegram/${own?'company/'+encodeURIComponent(tenantId):'sentinel'}`,secret_token:config.secret,allowed_updates:['message'],drop_pending_updates:true});if(own)await put(db,tenantId,CUSTOM,{...config,registered:true},true);else await db.systemConfig.update({where:{id:GLOBAL_ID},data:{configValue:encrypt({...config,registered:true})}});await AuditLogService.record(db,{tenantId:tenantId||null,userId:session.user.id,action:'TELEGRAM_WEBHOOK_CONFIGURED',entity:'SystemConfig',newData:{own,registered:true},req});return {registered:true};};
 app.post('/api/integrations/telegram/webhook',wrap(req=>register(req,false)));
 app.post('/api/integrations/telegram/custom-webhook',wrap(req=>register(req,true)));
 const portal=async(req:Request,write=true)=>{const session=await PartnerPortalService.getPartnerSession(req,db);if(!session)throw new TelegramPortalError(401,'SESSION_EXPIRED','Sua sessão expirou. Entre novamente no portal do parceiro.');if(write&&session.access.mustChangePassword)throw new TelegramPortalError(403,'PASSWORD_CHANGE_REQUIRED','Altere sua senha inicial em Meu cadastro antes de vincular o Telegram.');return session;};
 app.get('/api/partner-portal/telegram',wrap(async req=>{const session=await portal(req,false);if(session.access.mustChangePassword)return {requiresPasswordChange:true,available:false,linked:false,pendingConfirmation:false,bot:null,reason:'Altere sua senha inicial no formulário abaixo para liberar o vínculo Telegram.'};const config=await activeBot(db,session.tenant.id),options=await company(db,session.tenant.id),current=await binding(db,session.tenant.id,session.partner.id,config);const ticket=await db.systemConfig.findFirst({where:{tenantId:session.tenant.id,configKey:LINK+session.partner.id},orderBy:{createdAt:'desc'}});const candidate=ticket?decrypt<Ticket>(ticket.configValue):null;return {requiresPasswordChange:false,reason:!config?.registered?'O Telegram da empresa ainda não foi ativado. Fale com a equipe da empresa.':!(options.enabled)?'Sua empresa ainda não habilitou os avisos pelo Telegram.':null,bot:config?.username||(options.botMode==='CUSTOM'?'Bot próprio':BOT),available:!!config?.registered&&(options.enabled),linked:!!current,pendingConfirmation:!!candidate?.chatId&&candidate.expires>Date.now()&&candidate.botId=== (config?botId(config):null),candidateLabel:candidate?.label,ticketId:ticket?.id};}));
 app.post('/api/partner-portal/telegram/link',wrap(async req=>{const session=await portal(req);const config=await activeBot(db,session.tenant.id),options=await company(db,session.tenant.id);if(!config?.registered||!(options.enabled))throw new Error();const payload=randomBytes(24).toString('base64url');await db.$transaction(async tx=>{await tx.systemConfig.deleteMany({where:{tenantId:session.tenant.id,configKey:LINK+session.partner.id}});await tx.systemConfig.create({data:{id:'tg-link-'+hash(payload),tenantId:session.tenant.id,configKey:LINK+session.partner.id,configValue:encrypt({partnerId:session.partner.id,botId:botId(config),expires:Date.now()+10*60_000}),isSecret:true}});});return {url:`https://t.me/${config.username||BOT}?start=${payload}`,expiresIn:600};}));
 app.post('/api/partner-portal/telegram/confirm',wrap(async req=>{const session=await portal(req);await db.$transaction(async tx=>{const config=await activeBot(tx,session.tenant.id);if(!config?.registered)throw new Error();const ticket=await tx.systemConfig.findFirst({where:{id:String(req.body?.ticketId||''),tenantId:session.tenant.id,configKey:LINK+session.partner.id}});if(!ticket)throw new Error();const candidate=decrypt<Ticket>(ticket.configValue);if(!candidate.chatId||candidate.expires<Date.now()||candidate.partnerId!==session.partner.id||candidate.botId!==botId(config))throw new Error();const consumed=await tx.systemConfig.deleteMany({where:{id:ticket.id,configValue:ticket.configValue}});if(consumed.count!==1)throw new Error();await put(tx,session.tenant.id,BINDING+session.partner.id,{chatId:candidate.chatId,botId:botId(config),linkedAt:new Date().toISOString()},true);});return {linked:true};}));
 app.delete('/api/partner-portal/telegram',wrap(async req=>{const session=await portal(req);await db.systemConfig.deleteMany({where:{tenantId:session.tenant.id,configKey:{in:[BINDING+session.partner.id,LINK+session.partner.id]}}});return {linked:false};}));
 const webhook=(own:boolean)=>async(req:any,res:any)=>{res.setHeader('Cache-Control','no-store');try{const config=own?await customBot(db,String(req.params.tenantId)):await botConfig(db);const secret=String(req.headers['x-telegram-bot-api-secret-token']||'');if(!config?.registered||!equal(secret,config.secret))return res.status(403).end();if(own&&(await company(db,config.ownerTenant!)).botMode!=='CUSTOM')return res.json({ok:true});const msg=req.body?.message;if(msg?.chat?.type!=='private'||!Number.isSafeInteger(msg.chat.id)||msg.from?.is_bot||msg.from?.id!==msg.chat.id)return res.json({ok:true});const match=/^\/start(?:@\w+)? ([A-Za-z0-9_-]{32})$/.exec(String(msg.text||''));if(match){const row=await db.systemConfig.findUnique({where:{id:'tg-link-'+hash(match[1])}});if(!row?.tenantId||config.ownerTenant&&row.tenantId!==config.ownerTenant)return res.json({ok:true});const active=await activeBot(db,row.tenantId);if(!active||botId(active)!==botId(config))return res.json({ok:true});const ticket=decrypt<Ticket>(row.configValue);if(ticket.expires<Date.now()||ticket.chatId||ticket.botId!==botId(config))return res.json({ok:true});const valid=await db.partner.findFirst({where:{id:ticket.partnerId,tenantId:row.tenantId,deletedAt:null,status:'ATIVO',tenant:{status:'ACTIVE',deletedAt:null}}});if(!valid)return res.json({ok:true});const claimed=await db.systemConfig.updateMany({where:{id:row.id,configValue:row.configValue},data:{configValue:encrypt({...ticket,chatId:String(msg.chat.id),label:String(msg.from.username?'@'+msg.from.username:msg.from.first_name||'Telegram pessoal').slice(0,100)})}});if(claimed.count){try{await telegram(config,'sendMessage',{chat_id:String(msg.chat.id),text:'Telegram identificado! Volte ao portal da empresa, atualize o vínculo e confirme sua conta.'});}catch{}}}else await handleProposalQuery(db,config,msg);return res.json({ok:true});}catch{return res.status(503).json({ok:false});}};
 app.post('/api/webhooks/telegram/sentinel',webhook(false));
 app.post('/api/webhooks/telegram/company/:tenantId',webhook(true));
 app.post('/api/internal/cron/portability',wrap(async req=>{const {tenantId}=await internal(req,'proposals.update');return runPortabilityAutomation(db,{tenantId,deadline:Date.now()+45000});}));
 app.get('/api/cron/telegram-notifications',async(req,res)=>{res.setHeader('Cache-Control','no-store');const secret=process.env.CRON_SECRET;if(!secret||!equal(String(req.headers.authorization||''),`Bearer ${secret}`))return res.status(403).end();try{// Retenção mínima: elimina estados de consulta (inclusive PDFs pendentes) após 15 min sem atividade. O cron externo deve estar configurado para garantir a limpeza de chats abandonados.
        await db.systemConfig.deleteMany({where:{configKey:'TELEGRAM_PROPOSAL_QUERY_V1',updatedAt:{lt:new Date(Date.now()-15*60_000)}}}).catch(()=>{});const deadline=Date.now()+55000;const portability=await runPortabilityAutomation(db,{deadline:Date.now()+15000}).catch(()=>({success:false,failedCount:1,details:['Falha ao processar a automação CIP. Os avisos existentes continuam sendo processados.']}));return res.json({...await TelegramNotificationService.dispatch(db,deadline),portability});}catch{return res.status(503).json({error:'Não foi possível processar os avisos Telegram.'});}});
}
type TelegramAccount={tenantId:string;partnerId:string;label:string;linkedAt:string};
type ProposalQueryState = {
    phase: 'MENU' | 'PRODUCT' | 'COMPANY' | 'METHOD' | 'NUMBER' | 'CPF' | 'RESULTS' | 'PDF_WAIT' | 'PDF_PROCESSING' | 'PDF_SELECT' | 'PDF_CONFIRM' | 'SIM_INPUT' | 'SIM_CONFIRM' | 'CLT_LOADING' | 'CLT_OPTIONS';
    section?: TelegramProductSection;
    postSelection?: 'MENU'|'QUERY';
    selected?: TelegramAccount;
    choices?: TelegramAccount[];
    page?: number;
    results?: string[];
    pendingPdf?:{review:TelegramPdfReview;expires:number;selectedIndices?:number[]};
    native?:TelegramNativeDraft;
    cltMarginReady?:boolean;
    expires: number;
};

type TelegramPdfWork=
    |{kind:'READ';account:TelegramAccount;document:{file_id:string;file_name?:string;mime_type?:string;file_size?:number}}
    |{kind:'CALCULATE';account:TelegramAccount;review:TelegramPdfReview;indices:number[];illiterate:'YES'|'NO';attemptKey:string}
    |{kind:'NATIVE';account:TelegramAccount;draft:TelegramNativeDraft;attemptKey:string}
    |{kind:'CLT_MARGIN';account:TelegramAccount;draft:TelegramNativeDraft;attemptKey:string};
async function telegramAccountStillValid(db:PrismaClient,config:BotConfig,chatId:string,account:TelegramAccount):Promise<boolean>{
    if(config.ownerTenant && account.tenantId!==config.ownerTenant)return false;
    const current=await activeBot(db,account.tenantId);
    if(!current?.registered||botId(current)!==botId(config)||!(await company(db,account.tenantId)).enabled)return false;
    const linked=await binding(db,account.tenantId,account.partnerId,current);
    if(!linked||linked.chatId!==chatId||linked.linkedAt!==account.linkedAt)return false;
    const partner=await db.partner.findFirst({where:{id:account.partnerId,tenantId:account.tenantId,status:'ATIVO',deletedAt:null,tenant:{status:'ACTIVE',deletedAt:null}}});
    if(!partner)return false;
    // A chat binding is not a substitute for current portal access. Revoking
    // every portal access for a partner must disable bank consultations here.
    const access=await db.partnerPortalAccess.findFirst({
        where:{tenantId:account.tenantId,partnerId:account.partnerId,active:true},
        select:{id:true},
    });
    return !!access;
}
async function handleProposalQuery(db: PrismaClient, config: BotConfig, msg: any) {
    if (!Number.isSafeInteger(msg.message_id)) return;
    const chatId = String(msg.chat.id);
    const stateId = 'tg-query-' + hash(`${botId(config)}:${chatId}`);
    const receiptId = 'tg-query-receipt-' + hash(`${botId(config)}:${chatId}:${msg.message_id}`);
    const result = await db.$transaction(async tx => {
        if (await tx.systemConfig.findUnique({ where: { id: receiptId } })) return null;
        const row = await tx.systemConfig.findUnique({ where: { id: stateId } });
        let state: ProposalQueryState = row ? decrypt<ProposalQueryState>(row.configValue) : { phase: 'MENU', expires: 0 };
        if (state.expires < Date.now()) state = { phase: 'MENU', expires: 0 };
        if (state.pendingPdf?.expires && state.pendingPdf.expires<Date.now()) { state.pendingPdf=undefined;state.phase='PDF_WAIT'; }
        const text = String(msg.text || '').trim();
        const command = text.toLocaleLowerCase('pt-BR').replace(/^\/(start|menu|consultar)(?:@\w+)?$/, '/$1');
        let response = 'Conecte seu Telegram ao Portal do Parceiro para iniciar.';
        let keyboard: string[][] = [['👤 Trocar parceiro']];
        let htmlMode = false;
        let pdfWork:TelegramPdfWork|undefined;
        const takeQuerySlot=async():Promise<boolean>=>{
            if(!state.selected)return false;
            const rateKey='TELEGRAM_NATIVE_RATE_V1_'+hash(chatId+':'+state.selected.partnerId).slice(0,32);
            const oldRate=await tx.systemConfig.findUnique({
                where:{tenantId_configKey:{tenantId:state.selected.tenantId,configKey:rateKey}},
            });
            const limit=oldRate?JSON.parse(oldRate.configValue):null;
            const active=limit&&typeof limit.since==='number'&&limit.since>Date.now()-15*60_000;
            const previousCount=active?Number(limit.count)||0:0;
            if(previousCount>=10)return false;
            await tx.systemConfig.upsert({
                where:{tenantId_configKey:{tenantId:state.selected.tenantId,configKey:rateKey}},
                create:{tenantId:state.selected.tenantId,configKey:rateKey,
                    configValue:JSON.stringify({since:active?limit.since:Date.now(),count:previousCount+1})},
                update:{configValue:JSON.stringify({since:active?limit.since:Date.now(),count:previousCount+1})},
            });
            return true;
        };
        const valid = async (account: TelegramAccount) => {
            if (config.ownerTenant && account.tenantId !== config.ownerTenant) return false;
            const current = await activeBot(tx, account.tenantId);
            if (!current?.registered || botId(current) !== botId(config) || !(await company(tx, account.tenantId)).enabled) return false;
            const recipient = await binding(tx, account.tenantId, account.partnerId, current);
            if (!recipient || recipient.chatId !== chatId || recipient.linkedAt !== account.linkedAt) return false;
            return !!await tx.partner.findFirst({ where: { id: account.partnerId, tenantId: account.tenantId, status: 'ATIVO', deletedAt: null, tenant: { status: 'ACTIVE', deletedAt: null } } });
        };
        const method = () => {
            state.phase = 'METHOD';
            response = `${state.selected!.label}\n\nComo deseja pesquisar?`;
            keyboard = [['Número da proposta', 'CPF do cliente'], ['Trocar empresa', 'Menu']];
        };
        const showCompanies = () => {
            const page = state.page || 0;
            const choices = state.choices!.slice(page * 8, page * 8 + 8);
            response = 'Escolha a empresa e o cadastro de parceiro:\n\n' + choices.map((a, i) => `${i + 1}. ${a.label}`).join('\n');
            keyboard = choices.map((_, i) => [String(i + 1)]);
            if (page > 0) keyboard.push(['Empresas anteriores']);
            if ((page + 1) * 8 < state.choices!.length) keyboard.push(['Mais empresas']);
            keyboard.push(['Menu']);
        };
        const showMain = () => {
            const menu=telegramMainMenu(state.selected?.label||'');
            state.phase='MENU';state.section='ROOT';state.postSelection=undefined;state.pendingPdf=undefined;state.native=undefined;state.cltMarginReady=undefined;
            response=menu.response;keyboard=menu.keyboard;
        };
        const showProduct = (section:Exclude<TelegramProductSection,'ROOT'>) => {
            const menu=telegramSectionMenu(section);
            state.phase='PRODUCT';state.section=section;state.pendingPdf=undefined;state.native=undefined;state.cltMarginReady=undefined;
            response=menu.response;keyboard=menu.keyboard;
        };
        const openPortal = (target: ReturnType<typeof telegramSimulationTarget>|'PROFILE') => {
            const link=telegramPortalLink(target!,process.env.APP_URL||'https://sentinelconsig.com.br');
            response='✅ Seu cadastro está vinculado. Para consultar condições e salvar cotações no Sentinel, entre no Portal do Parceiro com sua própria senha:\n\n'+link+
                '\n\nOs bancos aparecem conforme as regras e integrações habilitadas na empresa. As simulações não são aprovações bancárias.';
            const section=state.section||'CLT';
            const menu=telegramSectionMenu(section==='ROOT'?'CLT':section);
            keyboard=menu.keyboard;state.phase='PRODUCT';
        };
        const chooseAccounts=async (after:'MENU'|'QUERY')=>{
            const bindings=await tx.systemConfig.findMany({ where: { configKey: { startsWith: BINDING }, ...(config.ownerTenant ? { tenantId: config.ownerTenant } : {}), tenant: { status: 'ACTIVE', deletedAt: null } } });
            const accounts:TelegramAccount[]=[];
            for(const candidate of bindings){
                if(!candidate.tenantId)continue;
                const recipient=decrypt<Binding>(candidate.configValue);
                if(recipient.chatId!==chatId)continue;
                const account:TelegramAccount={tenantId:candidate.tenantId,partnerId:candidate.configKey.slice(BINDING.length),label:'',linkedAt:recipient.linkedAt};
                if(!await valid(account))continue;
                const partner=await tx.partner.findFirst({where:{id:account.partnerId,tenantId:account.tenantId},include:{tenant:{include:{whiteLabel:true}}}});
                if(!partner)continue;
                account.label=`${partner.tenant.whiteLabel?.companyName||partner.tenant.tradeName||partner.tenant.name} · ${partner.name} (${partner.code})`.replace(/[\\r\\n]/g,' ').slice(0,160);
                accounts.push(account);
            }
            accounts.sort((a,b)=>a.label.localeCompare(b.label));
            state={phase:'COMPANY',choices:accounts,page:0,expires:0,postSelection:after};
            if(!accounts.length){
                response='Para usar o Sentinel Conecta, vincule seu Telegram em Meu cadastro no Portal do Parceiro. A empresa também precisa habilitar a integração.';
                keyboard=[['👤 Trocar parceiro']];
            }else if(accounts.length===1){
                state.selected=accounts[0];
                if(after==='QUERY')method();else showMain();
            }else showCompanies();
        };
        const scope = (account: TelegramAccount): Prisma.ProposalWhereInput => ({ tenantId: account.tenantId, partnerId: account.partnerId, deletedAt: null });
        const detail = async (id: string) => {
            const proposal = await tx.proposal.findFirst({ where: { ...scope(state.selected!), id }, include });
            if (!proposal) { method(); response = 'Esta proposta não está disponível para seu cadastro. Faça uma nova consulta.'; return; }
            let refinValue: unknown;
            let balance: unknown = proposal.debtBalance;
            if (['PORTABILIDADE', 'REFIN_PORTABILIDADE'].includes(proposal.type)) {
                refinValue = proposal.type === 'REFIN_PORTABILIDADE' ? proposal.releasedValue : (await tx.proposal.findFirst({ where: { ...scope(state.selected!), clientId: proposal.clientId, relatedPortabilityId: proposal.id, type: 'REFIN_PORTABILIDADE' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { releasedValue: true } }))?.releasedValue;
            }
            if (proposal.type === 'REFIN_PORTABILIDADE' && proposal.relatedPortabilityId) {
                const portability = await tx.proposal.findFirst({ where: { ...scope(state.selected!), id: proposal.relatedPortabilityId, clientId: proposal.clientId, type: 'PORTABILIDADE' }, select: { debtBalance: true } });
                balance = portability?.debtBalance ?? proposal.debtBalance;
            }
            response = message(proposal, refinValue, true, balance);
            htmlMode = true;
            state.phase = 'METHOD';
            state.results = undefined;
            keyboard = [['Número da proposta', 'CPF do cliente'], ['Trocar empresa', 'Menu']];
        };
        const menuChoice=telegramMenuAction(text,state.phase==='PRODUCT'?(state.section||'ROOT'):'ROOT',state.phase==='PRODUCT'||state.phase==='MENU');
        if (['menu','/menu','/start'].includes(command) || menuChoice==='HOME') {
            if(state.selected && await valid(state.selected))showMain();
            else await chooseAccounts('MENU');
        } else if (['/consultar'].includes(command) || menuChoice==='QUERY') {
            if(state.selected && await valid(state.selected))method();
            else await chooseAccounts('QUERY');
        } else if(menuChoice==='SWITCH'){
            await chooseAccounts('MENU');
        } else if (state.phase === 'COMPANY' && state.choices?.length) {
            if (command === 'mais empresas') state.page = Math.min(Math.floor((state.choices.length - 1) / 8), (state.page || 0) + 1);
            else if (command === 'empresas anteriores') state.page = Math.max(0, (state.page || 0) - 1);
            else if (/^[1-8]$/.test(text)) {
                const chosen = state.choices[(state.page || 0) * 8 + Number(text) - 1];
                if (chosen && await valid(chosen)) { state.selected = chosen; if(state.postSelection==='QUERY')method();else showMain(); }
            }
            if (state.phase === 'COMPANY') showCompanies();
        } else if (state.selected && await valid(state.selected)) {
            keyboard = [['Número da proposta', 'CPF do cliente'], ['Trocar empresa', 'Menu']];
            if(msg.document){
                if(state.phase!=='PDF_WAIT'||state.section!=='PORT'){
                    response='Para enviar um extrato INSS, abra Portabilidade INSS → Simular pelo extrato e siga as orientações. O documento não foi baixado.';
                    keyboard=telegramSectionMenu('PORT').keyboard;
                }else {
                    try{
                        validateTelegramPdfDocument(msg.document);
                        state.phase='PDF_PROCESSING';
                        response='📄 PDF recebido. Vou conferir o documento antes de calcular. Não envie outro arquivo enquanto este estiver sendo analisado.';
                        keyboard=[['🏠 Menu principal']];
                        pdfWork={kind:'READ',account:state.selected!,document:msg.document};
                    }catch{
                        response='Envie um arquivo PDF textual INSS de até 5 MB, usando a opção Documento. Não envie imagens, prints ou PDFs protegidos por senha.';
                        keyboard=[['🏠 Menu principal']];
                    }
                }
            } else if (state.phase==='PDF_SELECT' && state.pendingPdf) {
                const review=state.pendingPdf;
                const indices=parseTelegramSelectedContracts(text,review.review.contracts.length);
                if(indices){
                    state.phase='PDF_CONFIRM';
                    review.selectedIndices=indices;
                    response='Contratos selecionados: '+indices.map(i=>i+1).join(', ')+
                      '\n\nConfirme que o titular autorizou esta consulta e informe se ele é analfabeto. Isso influencia a elegibilidade nos bancos. Nenhuma contratação será realizada.';
                    keyboard=[['✅ Autorizado · NÃO analfabeto'],['✅ Autorizado · Analfabeto'],['🏠 Menu principal']];
                }else {
                    response='Digite TODOS para incluir todos os contratos ou informe números distintos de 1 a '+review.review.contracts.length+' separados por vírgula.\n\n'+telegramPdfReviewText(review.review);
                    keyboard=[['✅ Simular todos os contratos'],['🏠 Menu principal']];
                }
            } else if(state.phase==='PDF_CONFIRM' && state.pendingPdf?.selectedIndices?.length){
                const answer=normalizeTelegramMenuInput(text);
                const illiterate=answer==='autorizado nao analfabeto'?'NO':answer==='autorizado analfabeto'?'YES':null;
                if(!illiterate){
                    response='Antes da simulação, confirme a autorização do titular e selecione se ele é analfabeto.';
                    keyboard=[['✅ Autorizado · NÃO analfabeto'],['✅ Autorizado · Analfabeto'],['🏠 Menu principal']];
                }else if(!(await takeQuerySlot())){
                    response='Limite de consultas atingido neste intervalo. Aguarde alguns minutos antes de confirmar os contratos; nenhuma instituição foi consultada.';
                    keyboard=[['✅ Autorizado · NÃO analfabeto'],['✅ Autorizado · Analfabeto'],['🏠 Menu principal']];
                }else{
                    pdfWork={kind:'CALCULATE',account:state.selected!,review:state.pendingPdf.review,
                        indices:state.pendingPdf.selectedIndices,illiterate,attemptKey:randomBytes(16).toString('hex')};
                    // The consultation identifiers are deleted from the encrypted
                    // chat state before any calls to bank APIs leave this process.
                    state.pendingPdf=undefined;
                    state.phase='PRODUCT';state.section='PORT';
                    response='🔎 Conferência registrada. Vou calcular TODOS os contratos selecionados nas planilhas e consultar as integrações bancárias habilitadas. Cada contrato receberá seu próprio resultado. Nenhuma contratação será realizada.';
                    keyboard=telegramSectionMenu('PORT').keyboard;
                }
            } else if(menuChoice==='CLT'||menuChoice==='FGTS'||menuChoice==='INSS'||menuChoice==='PORT'){
                showProduct(menuChoice);
            }else if(menuChoice==='EXTRACT'){
                state.phase='PDF_WAIT';state.section='PORT';state.pendingPdf=undefined;
                keyboard=[['🏠 Menu principal']];
                response='📄 Envie agora o extrato de empréstimos INSS em PDF textual (até 5 MB, máximo 20 páginas).'+
                  '\n\nO titular deve ter autorizado a consulta. O bot apenas lê o documento em memória, extrai os contratos para conferência e calcula estimativas das planilhas ativas. O PDF original não é guardado no Sentinel.'+
                  '\n\nDepois de conferir os contratos, responda TODOS para simular todos de uma vez ou selecione números específicos. Informe também se o titular é analfabeto. Para cancelar, toque em Menu principal.';
            }else if(state.phase==='PDF_WAIT'){
                response='Envie um extrato INSS em formato PDF textual de até 5 MB como documento. Se a seleção anterior expirou, envie o arquivo novamente.';
                keyboard=[['🏠 Menu principal']];
            }else if(state.phase==='PDF_PROCESSING'){
                response='Seu extrato está sendo analisado. Aguarde a lista de contratos ou volte ao Menu principal para cancelar.';
                keyboard=[['🏠 Menu principal']];
            }else if(state.phase==='CLT_LOADING'){
                response='A consulta CLT está em andamento. Aguarde o retorno dos bancos antes de solicitar outra simulação.';
                keyboard=[['🏠 Menu principal']];
            }else if(state.phase==='CLT_OPTIONS'&&state.native){
                const selection=normalizeTelegramMenuInput(text);
                const consulted=state.native;
                const options=state.cltMarginReady?cltConsultationOptions():[['🔄 Atualizar margem CLT'],['🏠 Menu principal']];
                if(consulted.expires<Date.now()){
                    state.native=undefined;state.cltMarginReady=false;state.phase='PRODUCT';
                    response='A consulta de margem expirou. Inicie uma nova consulta CLT para usar valores atuais.';
                    keyboard=telegramSectionMenu('CLT').keyboard;
                }else if(selection==='simular margem cheia'&&state.cltMarginReady){
                    if(!(await takeQuerySlot())){
                        response='Limite de dez consultas a cada quinze minutos atingido. Aguarde antes de consultar os bancos novamente.';
                        keyboard=options;
                    }else{
                    pdfWork={kind:'NATIVE',account:state.selected!,
                        draft:continueTelegramCltSimulation(consulted,'FULL'),attemptKey:randomBytes(16).toString('hex')};
                    state.native={...consulted,expires:Date.now()+10*60_000};
                    response='💰 Calculando as condições com a margem oficial de cada banco compatível. A Happy exige um valor explícito e será apresentada como pendente, não receberá valor fictício.';
                    keyboard=options;
                    }
                }else if(selection==='escolher parcela ou valor'&&state.cltMarginReady){
                    state.native=continueTelegramCltSimulation(consulted,'CUSTOM');state.phase='SIM_INPUT';
                    response=telegramNativePrompt(state.native);keyboard=[['🏠 Menu principal']];
                }else if(selection==='atualizar margem clt'){
                    if(!(await takeQuerySlot())){
                        response='Limite de dez consultas a cada quinze minutos atingido. Aguarde antes de atualizar as margens.';
                        keyboard=options;
                    }else{
                    const fresh={...consulted,cltStage:'CONSULT' as const,index:3,expires:Date.now()+10*60_000};
                    state.native=fresh;state.phase='CLT_LOADING';state.cltMarginReady=false;
                    pdfWork={kind:'CLT_MARGIN',account:state.selected!,draft:fresh,attemptKey:randomBytes(16).toString('hex')};
                    response='🔍 Atualizando vínculos, margem e autorizações nos canais bancários habilitados. Nenhum SMS foi solicitado automaticamente.';
                    keyboard=[['🏠 Menu principal']];
                    }
                }else{
                    response=state.cltMarginReady?
                        'Escolha 💰 Simular margem cheia, ✏️ Escolher parcela ou valor, ou 🔄 Atualizar margem CLT.':
                        'Ainda não há margem positiva confirmada. Confira a autorização informada por cada banco e selecione 🔄 Atualizar margem CLT.';
                    keyboard=options;
                }
            }else if(state.phase==='SIM_INPUT'&&state.native){
                const next=acceptTelegramNativeAnswer(state.native,text);
                if('error' in next){
                    response=next.error;keyboard=[['🏠 Menu principal']];
                }else{
                    state.native=next.draft;
                    if(next.finished){
                        state.phase='SIM_CONFIRM';
                        response=telegramNativeSummary(next.draft);
                        keyboard=[[next.draft.product==='CLT'&&next.draft.cltStage==='CONSULT'?'✅ Consultar margem CLT':'✅ Confirmar simulação'],['🏠 Menu principal']];
                    }else{
                        response=telegramNativePrompt(next.draft);
                        keyboard=[['🏠 Menu principal']];
                    }
                }
            }else if(state.phase==='SIM_CONFIRM'&&state.native){
                const consultCLT=state.native.product==='CLT'&&state.native.cltStage==='CONSULT';
                const expected=consultCLT?'consultar margem clt':'confirmar simulacao';
                if(normalizeTelegramMenuInput(text)===expected){
                    // Includes margin consultations, full-margin quotes and custom queries.
                    if(!(await takeQuerySlot())){
                        response='Limite de consultas desta empresa/parceiro atingido neste intervalo. Aguarde alguns minutos antes de solicitar outra simulação. Nenhum banco foi consultado.';
                        keyboard=[['🏠 Menu principal']];
                    }else{
                        const draft=state.native;
                        const attemptKey=randomBytes(16).toString('hex');
                        pdfWork=consultCLT?
                            {kind:'CLT_MARGIN',account:state.selected!,draft,attemptKey}:
                            {kind:'NATIVE',account:state.selected!,draft,attemptKey};
                        if(consultCLT){
                            state.phase='CLT_LOADING';state.cltMarginReady=false;
                            response='🔍 Consultando vínculos, margem e autorizações nas integrações bancárias habilitadas. Nenhuma autorização ou SMS será disparado automaticamente.';
                            keyboard=[['🏠 Menu principal']];
                        }else if(draft.product==='CLT'){
                            state.native={...draft,cltStage:'CONSULT',index:3,
                                values:{cpf:draft.values.cpf,name:draft.values.name,phone:draft.values.phone},
                                expires:Date.now()+10*60_000};
                            state.phase='CLT_OPTIONS';
                            response='🔎 Calculando com o valor e prazo escolhidos. Vou mostrar o resultado e a pendência de cada instituição.';
                            keyboard=cltConsultationOptions();
                        }else{
                            const section=state.section||'INSS';
                            state.native=undefined;state.phase='PRODUCT';
                            response='🔎 Consulta confirmada. Verificando as instituições habilitadas da sua empresa. '+
                                'O resultado chegará nesta conversa; algumas instituições podem exigir autorização adicional.';
                            keyboard=telegramSectionMenu(section==='ROOT'?'INSS':section).keyboard;
                        }
                    }
                }else{
                    response='A consulta ainda não foi enviada aos bancos. Confirme a autorização do titular para prosseguir ou use Menu principal para cancelar.';
                    keyboard=[[consultCLT?'✅ Consultar margem CLT':'✅ Confirmar simulação'],['🏠 Menu principal']];
                }
            }else if(menuChoice==='CLIENT'){
                const access=await tx.partnerPortalAccess.findFirst({
                    where:{tenantId:state.selected!.tenantId,partnerId:state.selected!.partnerId,active:true},
                    select:{id:true},
                });
                if(!access){
                    response='O acesso ao Portal do Parceiro está inativo. Solicite ao gestor a reativação antes de consultar vínculos e margem CLT.';
                    keyboard=telegramSectionMenu('CLT').keyboard;
                }else{
                    state.native=beginTelegramNativeSimulation({product:'CLT'});
                    state.section='CLT';state.phase='SIM_INPUT';state.pendingPdf=undefined;state.cltMarginReady=false;
                    response=telegramNativePrompt(state.native);
                    keyboard=[['🏠 Menu principal']];
                }
            }else if(telegramSimulationTarget(state.section||'ROOT',menuChoice)){
                const access=await tx.partnerPortalAccess.findFirst({
                    where:{tenantId:state.selected!.tenantId,partnerId:state.selected!.partnerId,active:true},
                    select:{id:true},
                });
                if(!access){
                    response='O acesso de simulação deste parceiro está inativo. Solicite ao gestor a reativação do acesso ao Portal do Parceiro antes de consultar bancos pelo Telegram.';
                    keyboard=telegramSectionMenu(state.section==='ROOT'?'INSS':state.section||'INSS').keyboard;
                }else{
                    const target=telegramSimulationTarget(state.section||'ROOT',menuChoice)!;
                    state.native=beginTelegramNativeSimulation(target);
                    state.section=target.product==='CLT'?'CLT':target.product==='FGTS'?'FGTS':target.operation==='PORT'||target.operation==='PORT_REFIN'?'PORT':'INSS';
                    state.phase='SIM_INPUT';state.pendingPdf=undefined;
                    response=telegramNativePrompt(state.native);
                    keyboard=[['🏠 Menu principal']];
                }
            }else if (command === 'número da proposta') { state.phase = 'NUMBER'; response = 'Digite o número completo da proposta.'; }
            else if (command === 'cpf do cliente') { state.phase = 'CPF'; response = 'Digite o CPF completo do cliente, com ou sem pontuação.'; }
            else if (state.phase === 'RESULTS' && state.results && /^\d{1,2}$/.test(text)) {
                const id = state.results[Number(text) - 1];
                if (id) await detail(id);
                else response = 'Escolha um número da lista ou faça uma nova pesquisa.';
            } else if (state.phase === 'NUMBER' || state.phase === 'CPF') {
                const cpf = text.replace(/\D/g, '');
                if (state.phase === 'CPF' && (cpf.length !== 11 || !/^[\d.\-\s]+$/.test(text))) response = 'Informe um CPF com 11 dígitos.';
                else if (state.phase === 'NUMBER' && (!text || text.length > 100)) response = 'Informe o número completo da proposta, com até 100 caracteres.';
                else {
                    const proposals = await tx.proposal.findMany({ where: { ...scope(state.selected), ...(state.phase === 'CPF' ? { client: { tenantId: state.selected.tenantId, cpf } } : { proposalNumber: text.replace(/^#/, '') }) }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 21, select: { id: true, proposalNumber: true, bank: { select: { name: true } }, status: { select: { name: true } } } });
                    if (!proposals.length) response = 'Nenhuma proposta encontrada para seu cadastro nesta empresa. Confira os dados ou escolha outra pesquisa.';
                    else if (proposals.length === 1) await detail(proposals[0].id);
                    else {
                        state.phase = 'RESULTS'; state.results = proposals.slice(0, 20).map(p => p.id);
                        response = 'Selecione uma proposta:\n\n' + proposals.slice(0, 20).map((p, i) => `${i + 1}. #${p.proposalNumber} · ${p.bank?.name || 'Banco não informado'} · ${p.status?.name || 'Etapa não informada'}`.replace(/[\r\n]/g, ' ').slice(0, 160)).join('\n');
                        if (proposals.length > 20) response += '\n\nExibindo as 20 mais recentes. Para outras propostas, pesquise pelo número.';
                        keyboard = state.results.map((_, i) => [String(i + 1)]).concat([['Número da proposta', 'CPF do cliente'], ['Trocar empresa', 'Menu']]);
                    }
                }
            } else method();
        } else {
            state = { phase: 'MENU', expires: 0 };
            response = 'Para acessar os produtos, conecte seu Telegram em Meu cadastro no Portal do Parceiro. Depois, envie /start.';
            keyboard=[['👤 Trocar parceiro']];
        }
        state.expires = Date.now() + 10 * 60_000;
        await tx.systemConfig.upsert({ where: { id: stateId }, create: { id: stateId, configKey: 'TELEGRAM_PROPOSAL_QUERY_V1', configValue: encrypt(state), isSecret: true }, update: { configValue: encrypt(state) } });
        await tx.systemConfig.create({ data: { id: receiptId, configKey: 'TELEGRAM_QUERY_RECEIPT_V1', configValue: 'done', isSecret: true } });
        return { response, keyboard, htmlMode, pdfWork };
    }, { isolationLevel: 'Serializable', maxWait: 3000, timeout: 15000 });
    if(!result)return;
    await telegram(config,'sendMessage',{chat_id:chatId,text:result.response,
        ...(result.htmlMode?{parse_mode:'HTML'}:{}),
        reply_markup:{keyboard:result.keyboard.map(row=>row.map(text=>({text}))),resize_keyboard:true},
        protect_content:true});
    const job=result.pdfWork;
    if(!job)return;
    // No PDF download, external Telegram request or workbook calculation runs under Prisma transaction.
    if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
    if(job.kind==='CLT_MARGIN'){
        try{
            const partner=await db.partner.findFirst({
                where:{id:job.account.partnerId,tenantId:job.account.tenantId,status:'ATIVO',deletedAt:null},
                select:{id:true,name:true,code:true},
            });
            if(!partner)return;
            const output=await executeTelegramCltMargin(db,job.account.tenantId,partner,job.draft);
            if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
            const previous=await db.systemConfig.findUnique({where:{id:stateId}});
            if(!previous)return;
            const pending=decrypt<ProposalQueryState>(previous.configValue);
            if(pending.phase!=='CLT_LOADING'||pending.selected?.partnerId!==job.account.partnerId||
                pending.selected?.tenantId!==job.account.tenantId||pending.selected?.linkedAt!==job.account.linkedAt)return;
            const updated={...pending,phase:'CLT_OPTIONS' as const,cltMarginReady:output.hasMargin,
                native:{...job.draft,expires:Date.now()+10*60_000},expires:Date.now()+10*60_000};
            const changed=await db.systemConfig.updateMany({
                where:{id:stateId,configValue:previous.configValue},
                data:{configValue:encrypt(updated)},
            });
            if(changed.count!==1)return;
            // Only the calculated bank responses are shareable; the client input and
            // authorization flow remain protected.
            for(const line of output.messages)
                await telegram(config,'sendMessage',{chat_id:chatId,text:line,protect_content:false});
            await telegram(config,'sendMessage',{chat_id:chatId,
                text:output.hasMargin?'Escolha uma opção para continuar com a margem já consultada.':'Para simular, primeiro é necessário confirmar margem positiva em pelo menos uma instituição.',
                reply_markup:{keyboard:(output.hasMargin?cltConsultationOptions():[['🔄 Atualizar margem CLT'],['🏠 Menu principal']]).map(row=>row.map(text=>({text}))),resize_keyboard:true},
                protect_content:true});
        }catch{
            if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
            const previous=await db.systemConfig.findUnique({where:{id:stateId}});
            if(previous){
                const pending=decrypt<ProposalQueryState>(previous.configValue);
                if(pending.phase==='CLT_LOADING'&&pending.selected?.partnerId===job.account.partnerId)
                    await db.systemConfig.updateMany({where:{id:stateId,configValue:previous.configValue},
                        data:{configValue:encrypt({...pending,phase:'CLT_OPTIONS',cltMarginReady:false})}});
            }
            await telegram(config,'sendMessage',{chat_id:chatId,
                text:'Não consegui concluir a consulta das margens no momento. Nenhuma margem foi presumida. Atualize a consulta ou procure a mesa para conferir as autorizações.',
                reply_markup:{keyboard:[[{text:'🔄 Atualizar margem CLT'}],[{text:'🏠 Menu principal'}]],resize_keyboard:true},
                protect_content:true});
        }
        return;
    }
    if(job.kind==='NATIVE'){
        try{
            const partner=await db.partner.findFirst({
                where:{id:job.account.partnerId,tenantId:job.account.tenantId,status:'ATIVO',deletedAt:null},
                select:{id:true,name:true,code:true},
            });
            if(!partner)return;
            const output=await executeTelegramNativeSimulation(
                db,job.account.tenantId,partner,job.draft,job.attemptKey,
            );
            if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
            for(const text of output.messages)
                await telegram(config,'sendMessage',{chat_id:chatId,text,protect_content:false});
        }catch{
            if(await telegramAccountStillValid(db,config,chatId,job.account))
                await telegram(config,'sendMessage',{
                    chat_id:chatId,
                    text:'Não foi possível concluir esta simulação no momento. Nenhuma contratação foi realizada. '+
                        'Revise as condições ou tente novamente. Se o banco exigir autorização, procure a mesa da empresa.',
                    protect_content:true,
                });
        }
        return;
    }
    if(job.kind==='READ'){
        let review:TelegramPdfReview|undefined;
        try{
            const bytes=await downloadTelegramPdf(config.token,job.document);
            review=await readTelegramInssPdf(bytes);
        }catch(error){
            // Do not log/document personally identifiable values, raw API errors
            // (which may contain tokens), or the customer PDF. Only report stage.
            console.warn('[telegram-pdf] failed stage:',telegramPdfErrorCode(error));
            const row=await db.systemConfig.findUnique({where:{id:stateId}});
            if(row){
                const state=decrypt<ProposalQueryState>(row.configValue);
                if(state.phase==='PDF_PROCESSING' && state.selected?.tenantId===job.account.tenantId &&
                    state.selected.partnerId===job.account.partnerId){
                    const update={...state,phase:'PDF_WAIT' as const,pendingPdf:undefined,expires:Date.now()+10*60_000};
                    await db.systemConfig.updateMany({where:{id:stateId,configValue:row.configValue},data:{configValue:encrypt(update)}});
                }
            }
            await telegram(config,'sendMessage',{chat_id:chatId,
                text:telegramPdfErrorMessage(error),
                protect_content:true});
            return;
        }
        const row=await db.systemConfig.findUnique({where:{id:stateId}});
        if(!row)return;
        const state=decrypt<ProposalQueryState>(row.configValue);
        if(state.phase!=='PDF_PROCESSING'||state.selected?.tenantId!==job.account.tenantId||
            state.selected.partnerId!==job.account.partnerId||state.selected.linkedAt!==job.account.linkedAt)return;
        const updated={...state,phase:'PDF_SELECT' as const,pendingPdf:{review,expires:Date.now()+TELEGRAM_PDF_TTL_MS},
            expires:Date.now()+TELEGRAM_PDF_TTL_MS};
        const claim=await db.systemConfig.updateMany({
            where:{id:stateId,configValue:row.configValue},
            data:{configValue:encrypt(updated)},
        });
        if(claim.count===1 && await telegramAccountStillValid(db,config,chatId,job.account))
            await telegram(config,'sendMessage',{chat_id:chatId,
                text:telegramPdfReviewText(review),
                reply_markup:{keyboard:[[{text:'✅ Simular todos os contratos'}],[{text:'🏠 Menu principal'}]],resize_keyboard:true},protect_content:true});
        return;
    }
    const calculate=async()=>{
    let sheets:Awaited<ReturnType<typeof calculateTelegramInssQuotes>>|null=null;
    let integration:Awaited<ReturnType<typeof calculateTelegramInssOfficialQuotes>>|null=null;
    const partner=await db.partner.findFirst({
        where:{id:job.account.partnerId,tenantId:job.account.tenantId,status:'ATIVO',deletedAt:null},
        select:{id:true,name:true,code:true},
    });
    if(!partner)return;
    // Independent margin consultation runs concurrently with the portability batch.
    const marginTask=calculateTelegramInssMarginQuotes(
        db,job.account.tenantId,partner,job.review,job.illiterate,job.attemptKey)
        .catch(()=>undefined);
    // First consult other banks; their *completed* status determines whether
    // installments >= R$ 50 may be routed to Daycoval as a fallback.
    try{
        integration=await calculateTelegramInssOfficialQuotes(
            db,job.account.tenantId,partner,job.review,job.indices,job.illiterate,job.attemptKey,{
                onProgress:async(done,total)=>{
                    if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
                    await telegram(config,'sendMessage',{
                        chat_id:chatId,
                        text:'⏳ INSS: '+done+' de '+total+' contratos analisados. Ainda consultando os demais bancos.',
                        protect_content:true});
                },
            });
    }catch{
        // No invented rejections or approvals when a provider fails.
    }
    if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
    try{
        sheets=await calculateTelegramInssQuotes(
            db,job.account.tenantId,job.review,job.indices,job.illiterate,
            undefined,integration?.contracts||[]);
    }catch{
        // An unavailable documentary workbook must not hide official quotes.
    }
    if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
    const margin=await marginTask;
    if(!await telegramAccountStillValid(db,config,chatId,job.account))return;
    const report=formatTelegramInssPortfolio(
        job.review,job.indices,sheets?.quotes||[],integration?.contracts||[],margin);
    if(!sheets||!integration)report.push('⚠️ '+(!sheets?'Cálculo documental ':'')+
        (!sheets&&!integration?'e ':'')+(!integration?'integrações bancárias ':'')+
        'não concluído(s) nesta consulta. Verifique no Portal; isso não significa recusa.');
    if(sheets?.unavailableBanks.length)
        report.push('ℹ️ Planilhas sem cotação: '+sheets.unavailableBanks.join('; ').slice(0,1100));
    // The portfolio formatter masks identifying numbers. Keep the results
    // copyable so the partner can share the estimates with the customer.
    for(const text of report)
        await telegram(config,'sendMessage',{chat_id:chatId,text,protect_content:false});
    if(await telegramAccountStillValid(db,config,chatId,job.account))
        await telegram(config,'sendMessage',{chat_id:chatId,
            text:'✅ Consulta concluída para os contratos selecionados, sem contratação nem aprovação bancária. O histórico apresenta as cotações positivas das APIs. Para conferir detalhes adicionais:\n'+
              telegramPortalLink({product:'INSS',operation:'PORT_REFIN'},process.env.APP_URL||'https://sentinelconsig.com.br'),
            protect_content:false});
    };
    const safeCalculate=async()=>{
      try{await calculate();}
      catch{
        console.warn('[telegram-inss] calculation stage failed');
        try{
          if(await telegramAccountStillValid(db,config,chatId,job.account))
            await telegram(config,'sendMessage',{chat_id:chatId,
              text:'⚠️ A simulação INSS não foi concluída integralmente. Nenhuma contratação foi realizada. Tente novamente ou consulte a mesa.',protect_content:true});
        }catch{ /* Never expose confidential bank details in errors. */ }
      }
    };
    // Acknowledge Telegram immediately; keep work alive for Vercel's Fluid Compute.
    if(process.env.VERCEL){waitUntil(safeCalculate());return;}
    await safeCalculate();
}
