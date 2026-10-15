import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { hasPermission } from '../../src/lib/permissions.js';
import { resolveBankPromoter } from './bankPromoterConfig.js';
import { AuditLogService } from './auditLogService.js';
import { PresencaBankService } from './presencaBankService.js';
import { PresencaFgtsService } from './presencaFgtsService.js';

export function registerPresencaRoutes(app: Express, db: any, getAuthSession: (req: Request) => Promise<any>) {
  app.use('/api/integrations/presenca', rateLimit({ windowMs: 60000, max: 30, skip: req => req.path === '/fgts/simulate', standardHeaders: true, legacyHeaders: false, message: { error: 'Limite Presença atingido. Aguarde um minuto.' } }));
  app.use('/api/integrations/presenca/fgts/simulate', rateLimit({ windowMs: 60000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Limite de simulações FGTS atingido. Aguarde um minuto.' } }));
  const wrap = (permission: string, needsPromoter: boolean, action: (req: Request, context: any) => Promise<any>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getAuthSession(req), tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session?.user || !tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      // Partner sessions must not access internal connections or borrow an internal role.
      if (session.partner || session.partnerId || session.user.partnerId || /PARCEIRO|PARTNER/i.test(String(session.activeRole || session.user.role))) return res.status(403).json({ error: 'Acesso interno da empresa.' });
      if (!hasPermission(session.activeRole, session.activePermissions, permission)) return res.status(403).json({ error: 'Sem permissão para esta operação.' });
      const promoterId = needsPromoter ? (await resolveBankPromoter(db, tenantId, typeof req.query.promoterId === 'string' ? req.query.promoterId : 'invalid')).id : undefined;
      return res.json(await action(req, { tenantId, promoterId, userId: session.user.id }));
    } catch (error: any) {
      if (error?.name === 'PresencaRateLimitError') return res.status(429).setHeader('Retry-After', '60').json({ error: error.message });
      const safe = error instanceof Error && !('code' in error) && !/Prisma|AbortError|TimeoutError|TypeError|SyntaxError/.test(error.name);
      return res.status(400).json({ error: safe ? error.message : 'Não foi possível concluir a operação Presença.' });
    }
  };
  app.get('/api/integrations/presenca/config', wrap('integrations.view', true, async (req, c) => ({ ...PresencaBankService.metadata(await PresencaBankService.config(db, c.tenantId, c.promoterId, req.query.environment as string | undefined)), activeEnvironment: (await PresencaBankService.config(db, c.tenantId, c.promoterId)).environment })));
  app.put('/api/integrations/presenca/config', wrap('integrations.manage', true, async (req, c) => {
    const result = await PresencaBankService.save(db, c.tenantId, c.promoterId, req.body || {});
    await AuditLogService.record(db, { tenantId: c.tenantId, userId: c.userId, action: 'PRESENCA_CONFIG_UPDATED', entity: 'SystemConfig', entityId: c.promoterId, newData: { provider: 'presenca', promoterId: c.promoterId, environment: req.body.environment }, req });
    return result;
  }));
  app.post('/api/integrations/presenca/test', wrap('integrations.manage', true, async (req, c) => { await PresencaBankService.token(db, c.tenantId, c.promoterId, true, req.body?.environment); return { message: 'Autenticação Presença concluída. Produtos ainda dependem de liberação no banco.' }; }));
  app.get('/api/integrations/presenca/availability', wrap('simulations.create', false, async (_req, c) => ({ clt: (await PresencaBankService.available(db, c.tenantId)).length > 0, fgts: (await PresencaBankService.available(db, c.tenantId, 'fgts')).length > 0 })));
  for (const action of ['consent', 'employments', 'margin', 'offers']) app.post(`/api/integrations/presenca/clt/${action}`, wrap('simulations.create', false, async (req, c) => PresencaBankService.journey(db, c.tenantId, c.userId, action, req.body || {})));
  app.post('/api/integrations/presenca/fgts/tables', wrap('simulations.create', false, async (req, c) => PresencaFgtsService.tables(db, c.tenantId, c.userId, req.body || {})));
  app.post('/api/integrations/presenca/fgts/simulate', wrap('simulations.create', false, async (req, c) => PresencaFgtsService.simulate(db, c.tenantId, c.userId, req.body || {})));
}
