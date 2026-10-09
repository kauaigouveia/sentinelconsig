import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { isValidCpf } from '../../src/lib/utils.js';
import { eventBus } from './eventBus.js';

const CONFIG_KEY = 'EVOLUTION_SIMULATION';
const MENU = 'Escolha abaixo o convenio desejado para simulação:\n\n1 - INSS\n2 - CONVENIOS PUBLICOS\n3 - FGTS\n4 - CLT';
const OPTIONS = ['INSS', 'CONVENIOS PUBLICOS', 'FGTS', 'CLT'];
function identificationGreeting(companyName?: string) {
  const name = String(companyName || 'sua empresa').replace(/[*\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'sua empresa';
  return `Olá, seja bem vindo ao canal de simulação\n\nPara começar, envie seu código de parceiro cadastrado no *${name}*`;
}
type Config = { baseUrl: string; instance: string; apiKey: string; webhookSecret: string; enabled: boolean; activatedAt?: number; companyName?: string };
type Intake = { partnerCode?: string; convenio?: string; cpf?: string; phone?: string; admissionDate?: string; payslipMessageId?: string };

function encryptionKey() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('Segredo de autenticação não configurado.');
  return createHash('sha256').update(`sentinel:evolution:${secret}`).digest();
}
function encrypt(config: Config) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.');
}
function decrypt(value: string): Config {
  const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
function phone(value: string) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}
function date(value: string) {
  const match = value.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  if (!match) return undefined;
  const [, d, m, y] = match;
  const parsed = new Date(`${y}-${m}-${d}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.getUTCDate() === +d && parsed.getUTCMonth() + 1 === +m && parsed <= new Date() ? `${d}/${m}/${y}` : undefined;
}

export class EvolutionService {
  static async config(tenantId: string, prisma: PrismaClient) {
    const row = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: CONFIG_KEY } } });
    return row ? decrypt(row.configValue) : null;
  }
  static async metadata(tenantId: string, prisma: PrismaClient) {
    const c = await this.config(tenantId, prisma);
    return c ? { baseUrl: c.baseUrl, instance: c.instance, enabled: c.enabled, hasApiKey: !!c.apiKey } : { baseUrl: '', instance: 'sentinel-simulacao', enabled: false, hasApiKey: false };
  }
  static async save(tenantId: string, input: any, prisma: PrismaClient) {
    const existing = await this.config(tenantId, prisma);
    const url = new URL(String(input.baseUrl || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Informe somente a origem HTTPS da Evolution API.');
    const instance = String(input.instance || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(instance)) throw new Error('Nome de instância inválido.');
    const config: Config = { baseUrl: url.origin, instance, apiKey: String(input.apiKey || existing?.apiKey || '').trim(), webhookSecret: existing?.webhookSecret || randomBytes(32).toString('hex'), enabled: input.enabled === true };
    if (!config.apiKey) throw new Error('Informe a chave da Evolution API.');
    config.activatedAt = existing?.enabled && existing.instance === instance ? existing.activatedAt : Math.floor(Date.now() / 1000);
    await prisma.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey: CONFIG_KEY } }, create: { tenantId, configKey: CONFIG_KEY, configValue: encrypt(config), isSecret: true }, update: { configValue: encrypt(config), isSecret: true } });
    return this.metadata(tenantId, prisma);
  }
  static async api(config: Config, path: string, body?: any) {
    const response = await fetch(`${config.baseUrl}${path}/${encodeURIComponent(config.instance)}`, { method: body === undefined ? 'GET' : 'POST', headers: { apikey: config.apiKey, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(`Evolution API não concluiu a operação (HTTP ${response.status}).`);
    return data;
  }
  static async connect(tenantId: string, prisma: PrismaClient) {
    const c = await this.config(tenantId, prisma);
    if (!c?.enabled) throw new Error('Salve e habilite a conexão primeiro.');
    const origin = new URL(process.env.PUBLIC_APP_URL || 'https://sentinelconsig.com.br');
    if (origin.protocol !== 'https:') throw new Error('PUBLIC_APP_URL deve usar HTTPS.');
    // Only create when the provider explicitly says this instance is absent.
    const state = await fetch(`${c.baseUrl}/instance/connectionState/${encodeURIComponent(c.instance)}`, { headers: { apikey: c.apiKey }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (state.status === 404) {
      const created = await fetch(`${c.baseUrl}/instance/create`, { method: 'POST', headers: { apikey: c.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceName: c.instance, integration: 'WHATSAPP-BAILEYS', qrcode: true }), signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!created.ok) throw new Error(`Não foi possível criar a instância (HTTP ${created.status}).`);
    } else if (!state.ok) throw new Error(`Não foi possível consultar a instância (HTTP ${state.status}).`);
    await this.api(c, '/webhook/set', { webhook: { enabled: true, url: `${origin.origin}/api/webhooks/evolution/${encodeURIComponent(tenantId)}`, headers: { 'x-sentinel-webhook-secret': c.webhookSecret }, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } });
    return this.api(c, '/instance/connect');
  }
  static async state(tenantId: string, prisma: PrismaClient) {
    const c = await this.config(tenantId, prisma);
    if (!c?.enabled) return { instance: { state: 'disabled' } };
    return this.api(c, '/instance/connectionState');
  }
  static async authenticate(tenantId: string, supplied: string, prisma: PrismaClient) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, tradeName: true } });
    if (!tenant) return null;
    const c = await this.config(tenantId, prisma);
    const a = Buffer.from(supplied || '');
    const b = Buffer.from(c?.webhookSecret || '');
    return c?.enabled && a.length === b.length && b.length > 0 && timingSafeEqual(a, b) ? { ...c, companyName: tenant.tradeName?.trim() || tenant.name } : null;
  }
  static async deliver(messageId: string, tenantId: string, prisma: PrismaClient) {
    const claimed = await prisma.supportMessage.updateMany({ where: { id: messageId, tenantId, OR: [{ deliveryStatus: { in: ['PENDING', 'FAILED'] } }, { deliveryStatus: 'SENDING', deliveryAttemptAt: { lt: new Date(Date.now() - 60000) } }] }, data: { deliveryStatus: 'SENDING', deliveryAttemptAt: new Date() } });
    if (!claimed.count) return;
    const message = await prisma.supportMessage.findFirst({ where: { id: messageId, tenantId }, include: { conversation: true } });
    if (!message) return;
    try {
      const c = await this.config(tenantId, prisma);
      if (!c?.enabled || c.instance !== message.conversation.whatsappInstance || !message.conversation.whatsappPhone) throw new Error('Conexão WhatsApp indisponível.');
      const result = await this.api(c, '/message/sendText', { number: message.conversation.whatsappPhone, text: message.message });
      await prisma.supportMessage.update({ where: { id: messageId }, data: { deliveryStatus: 'SENT', externalMessageId: result.key?.id || null } });
    } catch (error) {
      await prisma.supportMessage.update({ where: { id: messageId }, data: { deliveryStatus: 'FAILED' } });
      throw error;
    }
  }
  static async receive(tenantId: string, c: Config, payload: any, prisma: PrismaClient) {
    if (payload.instance !== c.instance || String(payload.event || '').toUpperCase().replace(/\./g, '_') !== 'MESSAGES_UPSERT') return { status: 'ignored' };
    const data = payload.data;
    if (!data?.key?.id || data.key.fromMe) return { status: 'ignored' };
    // Check the actual chat before considering alternate sender identifiers.
    // Group participantAlt may contain a personal number but must never trigger the bot.
    if (typeof data.key.remoteJid !== 'string' || /@(g\.us|broadcast|newsletter)$/.test(data.key.remoteJid)) return { status: 'group_or_broadcast_ignored' };
    const timestamp = Number(data.messageTimestamp?.low ?? data.messageTimestamp);
    if (Number.isFinite(timestamp) && timestamp > 0 && c.activatedAt && timestamp < c.activatedAt) return { status: 'historical_message_ignored' };
    const jid = [data.key.remoteJidAlt, data.key.remoteJid].find(value => typeof value === 'string' && /^\d+@s\.whatsapp\.net$/.test(value));
    if (!jid) return { status: 'ignored' };
    const sender = phone(jid.split('@')[0]);
    const content = data.message?.ephemeralMessage?.message || data.message?.viewOnceMessage?.message || data.message || {};
    const media = content.documentMessage || content.imageMessage;
    const text = String(content.conversation || content.extendedTextMessage?.text || media?.caption || '').slice(0, 12000);
    if (!text && !media) return { status: 'ignored' };
    const identification = await this.identify(tenantId, c, sender, String(data.key.id), text, prisma);
    if (!identification.conversation) {
      await this.deliverIdentification(identification.id, tenantId, c, prisma);
      return { status: 'awaiting_partner_code' };
    }
    const partner = identification.conversation.partner;
    let attachment: { bytes: Buffer; mime: string; name: string } | undefined;
    if (media && ['application/pdf', 'image/jpeg', 'image/png'].includes(media.mimetype)) {
      let base64 = content.base64 || data.base64;
      if (!base64) {
        const result = await this.api(c, '/chat/getBase64FromMediaMessage', { message: data, convertToMp4: false });
        base64 = result.base64;
      }
      if (typeof base64 === 'string' && base64.length <= 8400000) {
        const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
        const valid = media.mimetype === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : media.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216;
        if (valid && bytes.length <= 6 * 1024 * 1024) attachment = { bytes, mime: media.mimetype, name: String(media.fileName || (media.mimetype === 'application/pdf' ? 'contracheque.pdf' : 'contracheque.jpg')).slice(0, 160) };
      }
    }
    if (!text && !media) return { status: 'ignored' };
    const key = `${tenantId}:${c.instance}:${data.key.id}:IN`;
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${c.instance}:${sender}`}))`;
      const existing = await tx.supportMessage.findUnique({ where: { idempotencyKey: key } });
      if (existing) return { conversationId: existing.conversationId, duplicate: true };
      const conv = await tx.supportConversation.findFirst({ where: { id: identification.conversation!.id, tenantId, partnerId: partner.id, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
      if (!conv) throw new Error('Atendimento concluído durante o recebimento. Tente novamente.');
      const incoming = await tx.supportMessage.create({ data: { tenantId, conversationId: conv.id, senderType: 'PARTNER', senderName: partner.name, message: text || (attachment ? 'Contracheque anexado' : 'Anexo não aceito. Envie PDF, JPG ou PNG de até 6 MB.'), channel: 'WHATSAPP', externalMessageId: data.key.id, idempotencyKey: key, attachmentData: attachment ? new Uint8Array(attachment.bytes) : undefined, attachmentName: attachment?.name, attachmentMime: attachment?.mime } });
      let stage = conv.simulationStage || 'MENU';
      const intake: Intake = (conv.simulationData as Intake) || {};
      let reply: string | undefined;
      if (identification.verifiedMessageId === String(data.key.id)) reply = `Código de parceiro validado: *${partner.code}*.\n\n${MENU}`;
      else if (stage === 'MENU') {
        const answer = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const chosen = /^[1-4]$/.test(answer) ? OPTIONS[Number(answer) - 1] : OPTIONS.find(option => option === answer);
        if (!chosen) reply = MENU;
        else {
          intake.convenio = chosen; stage = 'DATA';
          reply = `Vi que escolheu o convenio *${chosen}*, agora precisamos dos seguintes dados\n\nCPF:${chosen === 'CONVENIOS PUBLICOS' ? '\nContracheque: (anexar)' : ''}${['CLT', 'FGTS'].includes(chosen) ? '\nTelefone:' : ''}${chosen === 'CLT' ? '\nData de Admissão: (DD/MM/AAAA)' : ''}`;
        }
      } else if (stage === 'DATA' && !conv.assignedUserId) {
        const numbers = text.match(/\d[\d.() -]{8,}\d/g) || [];
        for (const number of numbers) {
          const digits = number.replace(/\D/g, '');
          if (digits.length === 11 && isValidCpf(digits) && !intake.cpf) intake.cpf = digits;
          else if ([10,11,12,13].includes(digits.length) && ['CLT','FGTS'].includes(intake.convenio || '')) intake.phone = phone(digits);
        }
        if (intake.convenio === 'CLT') intake.admissionDate = date(text) || intake.admissionDate;
        if (attachment && intake.convenio === 'CONVENIOS PUBLICOS') intake.payslipMessageId = incoming.id;
        const missing = [!intake.cpf && 'CPF válido', intake.convenio === 'CONVENIOS PUBLICOS' && !intake.payslipMessageId && 'Contracheque (PDF, JPG ou PNG até 6 MB)', ['CLT','FGTS'].includes(intake.convenio || '') && !intake.phone && 'Telefone com DDD', intake.convenio === 'CLT' && !intake.admissionDate && 'Data de Admissão (DD/MM/AAAA)'].filter(Boolean);
        if (missing.length) reply = `Ainda precisamos dos seguintes dados:\n${missing.join('\n')}`;
        else { stage = 'WAITING'; reply = 'Aguarde um momento que um de nossos atendentes ira realizar sua simulação'; }
      }
      await tx.supportConversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date(), simulationStage: stage, simulationData: intake, subject: intake.convenio ? `Simulação WhatsApp • ${intake.convenio}` : conv.subject } });
      if (reply) await tx.supportMessage.create({ data: { tenantId, conversationId: conv.id, senderType: 'SYSTEM', senderName: 'Canal de simulação', message: reply, channel: 'WHATSAPP', deliveryStatus: 'PENDING', idempotencyKey: `${key}:BOT` } });
      return { conversationId: conv.id, duplicate: false };
    });
    await eventBus.publish({ eventType: 'SUPPORT_MESSAGE_RECEIVED', tenantId, entity: 'SUPPORT', entityId: result.conversationId, data: { conversationId: result.conversationId, partnerId: partner.id } });
    const pending = await prisma.supportMessage.findMany({ where: { tenantId, conversationId: result.conversationId, senderType: 'SYSTEM', deliveryStatus: { in: ['PENDING', 'FAILED', 'SENDING'] } }, orderBy: { createdAt: 'asc' }, select: { id: true }, take: 2 });
    for (const message of pending) await this.deliver(message.id, tenantId, prisma);
    return { status: result.duplicate ? 'duplicate' : 'processed' };
  }

  private static async identify(tenantId: string, c: Config, sender: string, messageId: string, text: string, prisma: PrismaClient) {
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${c.instance}:${sender}`}))`;
      const scope = { tenantId_instance_sender: { tenantId, instance: c.instance, sender } };
      let session = await tx.whatsAppIdentification.findUnique({ where: scope, include: { conversation: { include: { partner: { select: { id: true, name: true, code: true, status: true, deletedAt: true } } } } } });
      const ongoing = session?.conversation;
      if (ongoing && ongoing.tenantId === tenantId && ['OPEN', 'IN_PROGRESS'].includes(ongoing.status) && ongoing.partner.status === 'ATIVO' && !ongoing.partner.deletedAt) return session!;
      if (session?.seenMessageIds.includes(messageId)) return { ...session, conversation: null };
      const fresh = !session || !!session.conversationId || session.expiresAt < new Date();
      const code = text.trim().normalize('NFKC').replace(/^(?:c[oó]digo(?: do parceiro)?|parceiro)\s*[:#-]?\s*/i, '').trim();
      const matches = !fresh && code.length > 0 && code.length <= 80 ? await tx.partner.findMany({ where: { tenantId, deletedAt: null, status: 'ATIVO', code: { equals: code, mode: 'insensitive' } }, select: { id: true, name: true, code: true }, take: 2 }) : [];
      const partner = matches.length === 1 ? matches[0] : null;
      const conversation = partner ? await tx.supportConversation.create({ data: { tenantId, partnerId: partner.id, channel: 'WHATSAPP', department: 'SIMULATION', whatsappPhone: sender, whatsappInstance: c.instance, simulationStage: 'MENU', simulationData: { partnerCode: partner.code }, subject: 'Simulação pelo WhatsApp' } }) : null;
      const values = {
        conversationId: conversation?.id || null,
        verifiedMessageId: partner ? messageId : null,
        seenMessageIds: [...(session?.seenMessageIds || []), messageId].slice(-256),
        replyText: partner ? null : fresh ? identificationGreeting(c.companyName) : 'Não encontrei esse código entre os parceiros ativos. Confira e envie novamente seu código de parceiro.',
        replyMessageId: messageId,
        replyStatus: 'PENDING',
        deliveryAttemptAt: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      session = await tx.whatsAppIdentification.upsert({ where: scope, create: { tenantId, instance: c.instance, sender, ...values }, update: values, include: { conversation: { include: { partner: { select: { id: true, name: true, code: true, status: true, deletedAt: true } } } } } });
      return session;
    });
  }

  private static async deliverIdentification(id: string, tenantId: string, c: Config, prisma: PrismaClient) {
    const session = await prisma.whatsAppIdentification.findFirst({ where: { id, tenantId, instance: c.instance, conversationId: null } });
    if (!session?.replyText) return;
    const scope = { id, tenantId, conversationId: null, replyMessageId: session.replyMessageId };
    const claimed = await prisma.whatsAppIdentification.updateMany({ where: { ...scope, OR: [{ replyStatus: { in: ['PENDING', 'FAILED'] } }, { replyStatus: 'SENDING', deliveryAttemptAt: { lt: new Date(Date.now() - 60000) } }] }, data: { replyStatus: 'SENDING', deliveryAttemptAt: new Date() } });
    if (!claimed.count) return;
    try {
      await this.api(c, '/message/sendText', { number: session.sender, text: session.replyText });
      await prisma.whatsAppIdentification.updateMany({ where: scope, data: { replyStatus: 'SENT' } });
    } catch (error) {
      await prisma.whatsAppIdentification.updateMany({ where: scope, data: { replyStatus: 'FAILED' } });
      throw error;
    }
  }
}
