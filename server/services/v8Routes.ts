import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { hasPermission } from '../../src/lib/permissions.js';
import { resolveBankPromoter } from './bankPromoterConfig.js';
import { AuditLogService } from './auditLogService.js';
import { V8BankService } from './v8BankService.js';

export function registerV8Routes(app: Express, db: any, getSession: (req: Request) => Promise<any>) {
  app.use('/api/integrations/v8', rateLimit({ windowMs: 60000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Aguarde um minuto antes de tentar novamente.' } }));
  const wrap = (permission: string, action: (req: Request, context: { tenantId: string; promoterId: string; userId: string }) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getSession(req), tenantId = session?.effectiveTenantId;
      if (!session?.user || !tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const role = session.user.role === 'PLATFORM_MASTER' ? 'PLATFORM_MASTER' : session.activeRole || session.user.role;
      if (session.partner || session.partnerId || session.user.partnerId || /PARTNER|PARCEIRO/i.test(role)) return res.status(403).json({ error: 'Acesso interno da empresa.' });
      if (!hasPermission(role, session.activePermissions || session.user.customPermissions, permission)) return res.status(403).json({ error: 'Sem permissão para gerenciar esta conexão.' });
      if (typeof req.query.promoterId !== 'string' || !req.query.promoterId) return res.status(400).json({ error: 'Selecione a promotora da conexão.' });
      const promoter = await resolveBankPromoter(db, tenantId, req.query.promoterId);
      return res.json(await action(req, { tenantId, promoterId: promoter.id, userId: session.user.id }));
    } catch (error) {
      const safe = error instanceof Error && error.name === 'Error' && !('code' in error);
      return res.status(400).json({ error: safe ? error.message : 'Não foi possível concluir a operação V8.' });
    }
  };
  app.get('/api/integrations/v8/config', wrap('integrations.view', async (req, c) => ({ ...V8BankService.metadata(await V8BankService.config(db, c.tenantId, c.promoterId, req.query.environment)), activeEnvironment: (await V8BankService.config(db, c.tenantId, c.promoterId)).environment })));
  app.put('/api/integrations/v8/config', wrap('integrations.manage', async (req, c) => {
    const result = await V8BankService.save(db, c.tenantId, c.promoterId, req.body || {});
    await AuditLogService.record(db, { tenantId: c.tenantId, userId: c.userId, action: 'V8_CONFIG_UPDATED', entity: 'SystemConfig', entityId: c.promoterId, newData: { environment: result.environment, enabled: result.enabled, fgtsEnabled: result.fgtsEnabled, cltEnabled: result.cltEnabled }, req });
    return result;
  }));
  app.post('/api/integrations/v8/test', wrap('integrations.manage', async (req, c) => V8BankService.diagnostic(db, c.tenantId, c.promoterId, req.body?.environment)));
}
