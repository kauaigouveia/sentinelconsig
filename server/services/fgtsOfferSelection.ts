import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { hasPermission } from '../../src/lib/permissions.js';
import { simulationDeadline } from './partnerSimulationTracking.js';
import { resolveBankPromoter } from './bankPromoterConfig.js';
import { AuditLogService } from './auditLogService.js';
import { eventBus } from './pusherService.js';

function key() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('Segredo de autenticação não configurado.');
  return createHash('sha256').update(`sentinel:fgts-selection:${secret}`).digest();
}
export function fgtsOfferReceipt(tenantId: string, userId: string, cpf: string, promoterId: string, offer: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ tenantId, userId, cpf, promoterId, offer, expires: Date.now() + 30 * 60000 })), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(value => value.toString('base64url')).join('.');
}
function open(receipt: unknown) {
  try {
    if (typeof receipt !== 'string' || receipt.length > 1000000) throw new Error();
    const parts = receipt.split('.'); if (parts.length !== 3) throw new Error();
    const [iv, tag, data] = parts.map(value => Buffer.from(value, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString());
  } catch { throw new Error('Oferta inválida. Consulte as ofertas novamente.'); }
}
export function registerFgtsOfferSelection(app: Express, db: any, getSession: (req: Request) => Promise<any>) {
  app.post('/api/simulations/fgts/submit', rateLimit({ windowMs: 60000, limit: 15, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getSession(req), tenantId = session?.effectiveTenantId;
      if (!session?.user || !tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const role = session.activeRole || session.user.role;
      if (session.partner || session.partnerId || session.user.partnerId || /PARTNER|PARCEIRO/i.test(role) || !hasPermission(role, session.activePermissions || session.user.customPermissions, 'simulations.create')) return res.status(403).json({ error: 'Sem permissão para enviar esta solicitação.' });
      const context = open(req.body?.receipt);
      if (context.tenantId !== tenantId || context.userId !== session.user.id || !Number.isFinite(context.expires) || context.expires <= Date.now()) return res.status(409).json({ error: 'A oferta expirou ou pertence a outra sessão. Consulte novamente.' });
      const offer = context.offer;
      if (offer?.state !== 'OFFER' || typeof offer.amount !== 'number' || !Number.isFinite(offer.amount) || offer.amount <= 0) return res.status(400).json({ error: 'Selecione uma oferta válida com valor liberado.' });
      const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 200) : '';
      const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/\D/g, '') : '';
      if (name.length < 2 || (phone && !/^\d{10,11}$/.test(phone))) return res.status(400).json({ error: 'Informe o nome do cliente e confira o telefone com DDD.' });
      const partner = await db.partner.findFirst({ where: { id: String(req.body?.partnerId || ''), tenantId, status: 'ATIVO', deletedAt: null } });
      if (!partner) return res.status(400).json({ error: 'Selecione um parceiro ativo da empresa.' });
      await resolveBankPromoter(db, tenantId, context.promoterId);
      const attempt = `fgts:${tenantId}:${createHash('sha256').update(req.body.receipt).digest('hex')}`;
      const saved = await db.simulationRequest.upsert({ where: { portalAttemptKey: attempt }, update: {}, create: {
        tenantId, partnerId: partner.id, createdById: session.user.id, cpf: context.cpf,
        partnerCodeSnapshot: partner.code, portalAttemptKey: attempt, status: 'SIMULAÇÃO ENVIADA', simulationType: 'FGTS_MULTI', operationType: 'FGTS:NEW', offerExpiresAt: simulationDeadline(new Date()),
        selectedCondition: { provider: offer.provider, institution: offer.institution, promoterId: context.promoterId, tableId: String(offer.data?.cod_tabela || offer.table || ''), simulationId: offer.simulationId || null, tableName: offer.table || offer.institution, amount: offer.amount, installment: offer.installment ?? null, term: offer.term ?? 0, rate: offer.rate ?? null },
        customerData: { name, phone, cpf: context.cpf, product: 'FGTS', operation: 'NEW', promoterId: context.promoterId, offers: [offer], selectedOffer: offer },
      } });
      if (saved.partnerId !== partner.id) return res.status(409).json({ error: 'Esta oferta já foi enviada para outro parceiro. Consulte novamente para uma nova solicitação.' });
      await AuditLogService.record(db, { tenantId, userId: session.user.id, action: 'FGTS_OFERTA_ENVIADA_MESA', entity: 'SimulationRequest', entityId: saved.id, newData: { provider: offer.provider, institution: offer.institution }, req });
      eventBus.publishToTenant(tenantId, { type: 'SIMULATION_CREATED', entity: 'SimulationRequest', entityId: saved.id });
      return res.json(saved);
    } catch (error) {
      const safe = error instanceof Error && error.name === 'Error' && !('code' in error);
      return res.status(400).json({ error: safe ? error.message : 'Não foi possível enviar a oferta FGTS para a mesa.' });
    }
  });
}
