import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Express, Request } from 'express';
import { hasPermission } from '../../src/lib/permissions.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { eventBus } from './eventBus.js';
import { AuditLogService } from './auditLogService.js';
const BOT = 'SentinelConectaBot';
const GLOBAL_ID = 'sentinel-telegram-global-v1';
const COMPANY = 'TELEGRAM_COMPANY_V1';
const BINDING = 'TELEGRAM_BINDING_V1_';
const LINK = 'TELEGRAM_LINK_V1_';
const EVENT = 'TELEGRAM_EVENT_V1_';
const CUSTOM = 'TELEGRAM_CUSTOM_BOT_V1';
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
    partnerId: string;
    fingerprint: string;
    linkedAt: string;
    state: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN' | 'STALE';
    nextAt: number;
    attempt: number;
    code?: number;
};
class TelegramConfigError extends Error {}
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
async function company(db: Store, tenantId: string): Promise<CompanyConfig> { const row = await get(db, tenantId, COMPANY); return row ? JSON.parse(row.configValue) : { enabled: false, since: new Date().toISOString() }; }
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
            const config = await activeBot(db,tenantId); if(!config?.registered)continue;
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
            const config = await activeBot(db,tenantId);
            const recipient = await binding(db, tenantId, delivery.partnerId,config), options = await company(db, tenantId);
            const proposal = await db.proposal.findFirst({ where: { id: delivery.proposalId, tenantId, partnerId: delivery.partnerId, deletedAt: null, partner: { tenantId, deletedAt: null, status: 'ATIVO' }, tenant: { status: 'ACTIVE', deletedAt: null } }, include });
            if (!config?.registered || !options.enabled || !recipient || !proposal || proposal.updatedAt < new Date(options.since) || recipient.linkedAt !== delivery.linkedAt || !eventType(proposal) || fingerprint(proposal) !== delivery.fingerprint) {
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
        const replies=await db.supportMessage.findMany({where:{channel:'TELEGRAM',senderType:'SUPPORT',deliveryStatus:'PENDING',OR:[{deliveryAttemptAt:null},{deliveryAttemptAt:{lte:new Date()}}]},orderBy:{createdAt:'asc'},take:20,select:{id:true,tenantId:true}});
        for(const reply of replies){if(Date.now()>deadline)break;await this.deliverSupport(reply.id,reply.tenantId,db);}
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
 const wrap=(fn:(req:Request)=>Promise<unknown>)=>async(req:any,res:any)=>{res.setHeader('Cache-Control','no-store');try{res.json(await fn(req));}catch(error){res.status(400).json({error:error instanceof TelegramError||error instanceof TelegramConfigError?error.message:'Não foi possível concluir a operação Telegram. Confira permissões, token e configuração do bot.'});}};
 app.get('/api/integrations/telegram/config',wrap(async req=>{const actor=await getSession(req);if(actor?.user?.role==='PLATFORM_MASTER'&&!actor.effectiveTenantId&&!actor.user.tenantId){const global=await botConfig(db);return {hasCompany:false,bot:BOT,configured:!!global,registered:!!global?.registered,globalConfigured:!!global,globalRegistered:!!global?.registered,platformMaster:true,canManage:false,botMode:'SHARED',enabled:false,supportEnabled:false};}const {session,tenantId}=await internal(req,'integrations.view');const config=await activeBot(db,tenantId),global=await botConfig(db);return {hasCompany:true,bot:config?.username||((await company(db,tenantId)).botMode==='CUSTOM'?'Bot próprio':BOT),configured:!!config,registered:!!config?.registered,globalConfigured:!!global,globalRegistered:!!global?.registered,platformMaster:session.user.role==='PLATFORM_MASTER',canManage:hasPermission(session.activeRole||session.user.role,session.activePermissions||session.user.customPermissions,'integrations.manage'),botMode:'SHARED',supportEnabled:false,...await company(db,tenantId)};}));
 app.put('/api/integrations/telegram/config',wrap(async req=>{const {session,tenantId}=await internal(req);const previous=await company(db,tenantId);if(req.body.enabled!==undefined&&typeof req.body.enabled!=='boolean'||req.body.supportEnabled!==undefined&&typeof req.body.supportEnabled!=='boolean'||req.body.botMode!==undefined&&!['SHARED','CUSTOM'].includes(req.body.botMode))throw new Error();const value={...previous,...(typeof req.body.enabled==='boolean'?{enabled:req.body.enabled}:{}),...(typeof req.body.supportEnabled==='boolean'?{supportEnabled:req.body.supportEnabled}:{}),...(req.body.botMode?{botMode:req.body.botMode}:{})};if(value.enabled&&!previous.enabled)value.since=new Date().toISOString();await put(db,tenantId,COMPANY,value);await AuditLogService.record(db,{tenantId,userId:session.user.id,action:'TELEGRAM_COMPANY_UPDATED',entity:'SystemConfig',newData:{enabled:value.enabled,supportEnabled:value.supportEnabled,botMode:value.botMode||'SHARED'},req});return {saved:true};}));
 const saveBot=async(req:Request,own:boolean)=>{const {session,tenantId}=await (own?internal(req):platformActor(req));if(!own&&session.user.role!=='PLATFORM_MASTER')throw new Error();const token=String(req.body?.token||'').trim();if(!/^\d{5,15}:[a-zA-Z0-9_-]{20,200}$/.test(token))throw new Error();const config:BotConfig={token,secret:randomBytes(32).toString('hex'),registered:false};const me=await telegram(config,'getMe');if(!me.username||(!own&&me.username.toLowerCase()!==BOT.toLowerCase())||(own&&me.username.toLowerCase()===BOT.toLowerCase()))throw new Error();config.username=me.username;
 await db.$transaction(async tx=>{const ownerId='tg-owner-'+botId(config),owner=await tx.systemConfig.findUnique({where:{id:ownerId}});const expected=own?tenantId:'PLATFORM';if(owner&&owner.configValue!==expected)throw new TelegramConfigError('Este bot já está vinculado a outra empresa. Cadastre um bot exclusivo desta empresa.');if(!owner)await tx.systemConfig.create({data:{id:ownerId,configKey:'TELEGRAM_BOT_OWNER',configValue:expected,isSecret:true}});if(own)await put(tx,tenantId,CUSTOM,config,true);else await tx.systemConfig.upsert({where:{id:GLOBAL_ID},create:{id:GLOBAL_ID,configKey:'TELEGRAM_GLOBAL_BOT_V1',configValue:encrypt(config),isSecret:true},update:{configValue:encrypt(config)}});});await AuditLogService.record(db,{tenantId:tenantId||null,userId:session.user.id,action:'TELEGRAM_BOT_CONFIGURED',entity:'SystemConfig',newData:{own,username:config.username},req});return {saved:true};};
 app.put('/api/integrations/telegram/bot',wrap(req=>saveBot(req,false)));
 app.put('/api/integrations/telegram/custom-bot',wrap(req=>saveBot(req,true)));
 const register=async(req:Request,own:boolean)=>{const {session,tenantId}=await (own?internal(req):platformActor(req));if(!own&&session.user.role!=='PLATFORM_MASTER')throw new Error();const config=own?await customBot(db,tenantId):await botConfig(db);if(!config)throw new Error();const origin=new URL(process.env.APP_URL||'https://sentinelconsig.com.br');if(origin.protocol!=='https:'||origin.username||origin.password)throw new Error();await telegram(config,'setWebhook',{url:`${origin.origin}/api/webhooks/telegram/${own?'company/'+encodeURIComponent(tenantId):'sentinel'}`,secret_token:config.secret,allowed_updates:['message'],drop_pending_updates:true});if(own)await put(db,tenantId,CUSTOM,{...config,registered:true},true);else await db.systemConfig.update({where:{id:GLOBAL_ID},data:{configValue:encrypt({...config,registered:true})}});await AuditLogService.record(db,{tenantId:tenantId||null,userId:session.user.id,action:'TELEGRAM_WEBHOOK_CONFIGURED',entity:'SystemConfig',newData:{own,registered:true},req});return {registered:true};};
 app.post('/api/integrations/telegram/webhook',wrap(req=>register(req,false)));
 app.post('/api/integrations/telegram/custom-webhook',wrap(req=>register(req,true)));
 const portal=async(req:Request)=>{const session=await PartnerPortalService.getPartnerSession(req,db);if(!session||session.access.mustChangePassword)throw new Error();return session;};
 app.get('/api/partner-portal/telegram',wrap(async req=>{const session=await portal(req),config=await activeBot(db,session.tenant.id),options=await company(db,session.tenant.id),current=await binding(db,session.tenant.id,session.partner.id,config);const ticket=await db.systemConfig.findFirst({where:{tenantId:session.tenant.id,configKey:LINK+session.partner.id},orderBy:{createdAt:'desc'}});const candidate=ticket?decrypt<Ticket>(ticket.configValue):null;return {bot:config?.username||(options.botMode==='CUSTOM'?'Bot próprio':BOT),available:!!config?.registered&&(options.enabled||!!options.supportEnabled),linked:!!current,pendingConfirmation:!!candidate?.chatId&&candidate.expires>Date.now()&&candidate.botId=== (config?botId(config):null),candidateLabel:candidate?.label,ticketId:ticket?.id};}));
 app.post('/api/partner-portal/telegram/link',wrap(async req=>{const session=await portal(req);const config=await activeBot(db,session.tenant.id),options=await company(db,session.tenant.id);if(!config?.registered||!(options.enabled||options.supportEnabled))throw new Error();const payload=randomBytes(24).toString('base64url');await db.$transaction(async tx=>{await tx.systemConfig.deleteMany({where:{tenantId:session.tenant.id,configKey:LINK+session.partner.id}});await tx.systemConfig.create({data:{id:'tg-link-'+hash(payload),tenantId:session.tenant.id,configKey:LINK+session.partner.id,configValue:encrypt({partnerId:session.partner.id,botId:botId(config),expires:Date.now()+10*60_000}),isSecret:true}});});return {url:`https://t.me/${config.username||BOT}?start=${payload}`,expiresIn:600};}));
 app.post('/api/partner-portal/telegram/confirm',wrap(async req=>{const session=await portal(req);await db.$transaction(async tx=>{const config=await activeBot(tx,session.tenant.id);if(!config?.registered)throw new Error();const ticket=await tx.systemConfig.findFirst({where:{id:String(req.body?.ticketId||''),tenantId:session.tenant.id,configKey:LINK+session.partner.id}});if(!ticket)throw new Error();const candidate=decrypt<Ticket>(ticket.configValue);if(!candidate.chatId||candidate.expires<Date.now()||candidate.partnerId!==session.partner.id||candidate.botId!==botId(config))throw new Error();const consumed=await tx.systemConfig.deleteMany({where:{id:ticket.id,configValue:ticket.configValue}});if(consumed.count!==1)throw new Error();await put(tx,session.tenant.id,BINDING+session.partner.id,{chatId:candidate.chatId,botId:botId(config),linkedAt:new Date().toISOString()},true);});return {linked:true};}));
 app.delete('/api/partner-portal/telegram',wrap(async req=>{const session=await portal(req);await db.systemConfig.deleteMany({where:{tenantId:session.tenant.id,configKey:{in:[BINDING+session.partner.id,LINK+session.partner.id]}}});return {linked:false};}));
 const webhook=(own:boolean)=>async(req:any,res:any)=>{res.setHeader('Cache-Control','no-store');try{const config=own?await customBot(db,String(req.params.tenantId)):await botConfig(db);const secret=String(req.headers['x-telegram-bot-api-secret-token']||'');if(!config?.registered||!equal(secret,config.secret))return res.status(403).end();if(own&&(await company(db,config.ownerTenant!)).botMode!=='CUSTOM')return res.json({ok:true});const msg=req.body?.message;if(msg?.chat?.type!=='private'||!Number.isSafeInteger(msg.chat.id)||msg.from?.is_bot||msg.from?.id!==msg.chat.id)return res.json({ok:true});const match=/^\/start(?:@\w+)? ([A-Za-z0-9_-]{32})$/.exec(String(msg.text||''));if(match){const row=await db.systemConfig.findUnique({where:{id:'tg-link-'+hash(match[1])}});if(!row?.tenantId||config.ownerTenant&&row.tenantId!==config.ownerTenant)return res.json({ok:true});const active=await activeBot(db,row.tenantId);if(!active||botId(active)!==botId(config))return res.json({ok:true});const ticket=decrypt<Ticket>(row.configValue);if(ticket.expires<Date.now()||ticket.chatId||ticket.botId!==botId(config))return res.json({ok:true});const valid=await db.partner.findFirst({where:{id:ticket.partnerId,tenantId:row.tenantId,deletedAt:null,status:'ATIVO',tenant:{status:'ACTIVE',deletedAt:null}}});if(!valid)return res.json({ok:true});const claimed=await db.systemConfig.updateMany({where:{id:row.id,configValue:row.configValue},data:{configValue:encrypt({...ticket,chatId:String(msg.chat.id),label:String(msg.from.username?'@'+msg.from.username:msg.from.first_name||'Telegram pessoal').slice(0,100)})}});if(claimed.count){try{await telegram(config,'sendMessage',{chat_id:String(msg.chat.id),text:'Telegram identificado! Volte ao portal da empresa, atualize o vínculo e confirme sua conta.'});}catch{}}}else await handleTelegramSupport(db,config,msg);return res.json({ok:true});}catch{return res.status(503).json({ok:false});}};
 app.post('/api/webhooks/telegram/sentinel',webhook(false));
 app.post('/api/webhooks/telegram/company/:tenantId',webhook(true));
 app.get('/api/cron/telegram-notifications',async(req,res)=>{const secret=process.env.CRON_SECRET;if(!secret||!equal(String(req.headers.authorization||''),`Bearer ${secret}`))return res.status(403).end();try{return res.json(await TelegramNotificationService.dispatch(db));}catch{return res.status(503).json({error:'Não foi possível processar os avisos Telegram.'});}});
}
type TelegramAccount={tenantId:string;partnerId:string;label:string;linkedAt:string};
type TelegramChatState={phase:'MENU'|'COMPANY'|'CHAT';accounts?:TelegramAccount[];page?:number;selected?:TelegramAccount;conversationId?:string;expires:number};
async function telegramAccounts(db:Store,config:BotConfig,chatId:string){
 const rows=await db.systemConfig.findMany({where:{configKey:{startsWith:BINDING},...(config.ownerTenant?{tenantId:config.ownerTenant}:{}),tenant:{status:'ACTIVE',deletedAt:null}}});const accounts:TelegramAccount[]=[];
 for(const row of rows){if(!row.tenantId)continue;const recipient=decrypt<Binding>(row.configValue);if(recipient.chatId!==chatId)continue;const options=await company(db,row.tenantId),active=await activeBot(db,row.tenantId);if(!options.supportEnabled||!active?.registered||botId(active)!==botId(config))continue;const partnerId=row.configKey.slice(BINDING.length);if(!await binding(db,row.tenantId,partnerId,config))continue;const partner=await db.partner.findFirst({where:{id:partnerId,tenantId:row.tenantId,deletedAt:null,status:'ATIVO'},include:{tenant:{include:{whiteLabel:true}}}});if(!partner)continue;accounts.push({tenantId:row.tenantId,partnerId,label:`${partner.tenant.whiteLabel?.companyName||partner.tenant.tradeName||partner.tenant.name} · ${partner.name}`.replace(/[\r\n]/g,' ').slice(0,120),linkedAt:recipient.linkedAt});}
 return accounts.sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
}
async function handleTelegramSupport(db:PrismaClient,config:BotConfig,msg:any){
 const chatId=String(msg.chat.id);if(!Number.isSafeInteger(msg.message_id))return;const receiptId='tg-update-'+hash(`${botId(config)}:${chatId}:${msg.message_id}`),stateId='tg-chat-'+hash(`${botId(config)}:${chatId}`);const text=String(msg.text||'').trim(),command=text.toLocaleLowerCase('pt-BR');
 const result=await db.$transaction(async tx=>{
  if(await tx.systemConfig.findUnique({where:{id:receiptId}}))return null;
  await tx.systemConfig.create({data:{id:receiptId,configKey:'TELEGRAM_INBOUND_RECEIPT',configValue:'done',isSecret:true}});
  const stored=await tx.systemConfig.findUnique({where:{id:stateId}});let state:TelegramChatState=stored?decrypt<TelegramChatState>(stored.configValue):{phase:'MENU',expires:0};if(state.expires<Date.now())state={phase:'MENU',expires:0};
  const events:{type:'SUPPORT_MESSAGE_RECEIVED'|'SUPPORT_CONVERSATION_CREATED'|'SUPPORT_CONVERSATION_STATUS_CHANGED';tenantId:string;conversationId:string;messageId?:string;partnerId?:string}[]=[];
  let response='';let keyboard:string[][]=[['Atendimento']];
  const save=async()=>{state.expires=Date.now()+(state.phase==='CHAT'?24*60*60_000:10*60_000);const configValue=encrypt(state);await tx.systemConfig.upsert({where:{id:stateId},create:{id:stateId,configKey:'TELEGRAM_CHAT_STATE',configValue,isSecret:true},update:{configValue}});};
  const choose=async()=>{const accounts=await telegramAccounts(tx,config,chatId);state={phase:'COMPANY',accounts,page:0,expires:0};if(!accounts.length){state.phase='MENU';response='Para receber atendimento, vincule este Telegram em Meu cadastro no portal da empresa. A empresa também precisa habilitar o atendimento Telegram.';return;}if(accounts.length===1){await open(accounts[0]);return;}list();};
  const list=()=>{const start=(state.page||0)*10;const slice=state.accounts!.slice(start,start+10);response='Escolha a empresa para atendimento:\n\n'+slice.map((a,index)=>`${index+1} - ${a.label}`).join('\n');keyboard=slice.map((a,index)=>[`${index+1} - ${a.label.slice(0,70)}`]);if(start>0)keyboard.push(['Empresas anteriores']);if(start+10<state.accounts!.length)keyboard.push(['Próximas empresas']);keyboard.push(['Menu']);};
  const valid=async(account:TelegramAccount)=>{const active=await activeBot(tx,account.tenantId),options=await company(tx,account.tenantId),recipient=await binding(tx,account.tenantId,account.partnerId,config);return active?.registered&&botId(active)===botId(config)&&options.supportEnabled&&recipient?.chatId===chatId&&recipient.linkedAt===account.linkedAt&&!!await tx.partner.findFirst({where:{id:account.partnerId,tenantId:account.tenantId,status:'ATIVO',deletedAt:null,tenant:{status:'ACTIVE',deletedAt:null}}});};
  const open=async(account:TelegramAccount)=>{if(!await valid(account)){state={phase:'MENU',expires:0};response='O vínculo mudou. Atualize o Telegram pelo portal da empresa e selecione Atendimento novamente.';return;}let conversation=await tx.supportConversation.findFirst({where:{tenantId:account.tenantId,partnerId:account.partnerId,channel:'TELEGRAM',department:'SUPPORT',status:{in:['OPEN','IN_PROGRESS']}},orderBy:{lastMessageAt:'desc'}});
   if(!conversation){conversation=await tx.supportConversation.create({data:{tenantId:account.tenantId,partnerId:account.partnerId,channel:'TELEGRAM',department:'SUPPORT',subject:'Atendimento via Telegram',status:'OPEN'}});events.push({type:'SUPPORT_CONVERSATION_CREATED',tenantId:account.tenantId,conversationId:conversation.id,partnerId:account.partnerId});}
   await put(tx,account.tenantId,'TELEGRAM_CONVERSATION_'+conversation.id,{chatId,botId:botId(config),linkedAt:account.linkedAt},true);state={phase:'CHAT',selected:account,conversationId:conversation.id,expires:0};response=`${account.label}\n\nVocê está na fila da mesa de suporte. Envie sua dúvida em texto por aqui. Para mudar de empresa, toque em Trocar empresa.`;keyboard=[['Trocar empresa'],['Encerrar atendimento'],['Menu']];
  };
  if(['/start','/menu','menu'].includes(command)){state={phase:'MENU',expires:0};response='Olá! Selecione Atendimento para falar com a mesa de suporte da sua empresa.';}
  else if(command==='atendimento'||command==='trocar empresa'){await choose();}
  else if(command==='encerrar atendimento'&&state.phase==='CHAT'&&state.selected&&await valid(state.selected)){await tx.supportConversation.updateMany({where:{id:state.conversationId,tenantId:state.selected.tenantId,partnerId:state.selected.partnerId,channel:'TELEGRAM',status:{in:['OPEN','IN_PROGRESS']}},data:{status:'RESOLVED'}});events.push({type:'SUPPORT_CONVERSATION_STATUS_CHANGED',tenantId:state.selected.tenantId,conversationId:state.conversationId!});state={phase:'MENU',expires:0};response='Atendimento encerrado. Quando precisar, selecione Atendimento para falar com a equipe novamente.';}
  else if(state.phase==='COMPANY'&&state.accounts){if(command==='próximas empresas')state.page=Math.min(Math.floor((state.accounts.length-1)/10),(state.page||0)+1);else if(command==='empresas anteriores')state.page=Math.max(0,(state.page||0)-1);else {const number=/^(\d{1,2})(?:\s*-.*)?$/.exec(text);const account=number&&Number(number[1])>=1&&Number(number[1])<=10?state.accounts[(state.page||0)*10+Number(number[1])-1]:null;if(account)await open(account);}if(state.phase==='COMPANY')list();}
  else if(state.phase==='CHAT'&&state.selected){const account=state.selected;if(!await valid(account)){state={phase:'MENU',expires:0};response='O vínculo não está mais disponível. Atualize sua conta pelo portal da empresa.';}
   else{const conversation=await tx.supportConversation.findFirst({where:{id:state.conversationId,tenantId:account.tenantId,partnerId:account.partnerId,channel:'TELEGRAM',department:'SUPPORT',status:{in:['OPEN','IN_PROGRESS']}}});if(!conversation){state={phase:'MENU',expires:0};response='Este atendimento já foi encerrado. Selecione Atendimento para iniciar outro.';}
    else if(!text||text.length>3500){response='Envie sua mensagem em texto, com até 3.500 caracteres. Para documentos e imagens, utilize o atendimento pelo portal.';keyboard=[['Trocar empresa'],['Encerrar atendimento']];}
    else if(msg.reply_to_message&&!await tx.supportMessage.findFirst({where:{conversationId:conversation.id,tenantId:account.tenantId,externalMessageId:`tg:${botId(config)}:${hash(chatId)}:${msg.reply_to_message.message_id}`}})){response='Essa resposta pode se referir a outra conversa. Use Trocar empresa para escolher o atendimento correto, ou envie uma nova mensagem sem responder a uma mensagem anterior.';keyboard=[['Trocar empresa'],['Encerrar atendimento']];}
    else{const partner=await tx.partner.findFirst({where:{id:account.partnerId,tenantId:account.tenantId},select:{name:true}});const message=await tx.supportMessage.create({data:{tenantId:account.tenantId,conversationId:conversation.id,senderType:'PARTNER',senderName:partner!.name,message:text,channel:'TELEGRAM',deliveryStatus:'RECEIVED',externalMessageId:`tg:${botId(config)}:${hash(chatId)}:${msg.message_id}`,idempotencyKey:receiptId}});await tx.supportConversation.update({where:{id:conversation.id},data:{lastMessageAt:new Date()}});events.push({type:'SUPPORT_MESSAGE_RECEIVED',tenantId:account.tenantId,conversationId:conversation.id,messageId:message.id,partnerId:account.partnerId});}
   }
  }else{response='Selecione Atendimento para iniciar uma conversa com o suporte.';}
  await save();return {response,keyboard,events};
 },{isolationLevel:'Serializable',maxWait:3000,timeout:15000});
 if(!result)return;
 for(const event of result.events)eventBus.publish({eventType:event.type,tenantId:event.tenantId,entity:'SUPPORT',entityId:event.conversationId,data:{conversationId:event.conversationId,messageId:event.messageId,partnerId:event.partnerId,senderType:'PARTNER'}});
 if(result.response)await telegram(config,'sendMessage',{chat_id:chatId,text:result.response.slice(0,4096),reply_markup:{keyboard:result.keyboard.map(row=>row.map(text=>({text}))),resize_keyboard:true},protect_content:true});
}
