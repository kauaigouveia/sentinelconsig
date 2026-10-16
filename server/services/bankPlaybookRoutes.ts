import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { SentinelaAIService } from './sentinelaAIService.js';
import type { PartnerPortalSessionContext } from './partnerPortalService.js';

export function registerBankPlaybookRoutes(app: Express, db: PrismaClient, getSession: (req: Request) => Promise<PartnerPortalSessionContext | null>) {
  app.post('/api/partner-portal/bank-playbooks/query', rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: 'Entre no portal para consultar os roteiros.' });
      if (session.access.mustChangePassword) return res.status(403).json({ error: 'Atualize sua senha antes de consultar.' });
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!message || message.length > 1000) return res.status(400).json({ error: 'Informe uma pergunta de até 1.000 caracteres.' });
      const actor = { user: { id: `partner-${session.access.id}`, role: 'PARTNER' }, effectiveTenantId: session.tenant.id };
      const limit = SentinelaAIService.checkRateLimit(actor.user.id, actor.effectiveTenantId);
      if (!limit.allowed) return res.status(429).json({ error: limit.reason });
      return res.json(await SentinelaAIService.query(db, actor, { message }));
    } catch { return res.status(500).json({ error: 'Não foi possível consultar os roteiros. Tente novamente.' }); }
  });
}
