import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { hasPermission } from '../../src/lib/permissions.js';
import { resolveBankPromoter } from './bankPromoterConfig.js';
import { ParanaBankService } from './paranaBankService.js';
import { AuditLogService } from './auditLogService.js';
import { sseRegistry } from '../realtime.js';
export function registerParanaRoutes(app: Express, prisma: any, getAuthSession: (req: Request) => Promise<any>) {
  app.use('/api/integrations/parana', rateLimit({ windowMs: 60000, max: 90, standardHeaders: true, legacyHeaders: false, message: { error: 'Limite de consultas Paraná atingido. Aguarde um minuto.' } }));
  const wrap = (permission: string, requirePromoter: boolean, action: (req: Request, context: any) => Promise<any>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getAuthSession(req), tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session?.user || !tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const can = (name: string) => hasPermission(session.activeRole, session.activePermissions, name);
      if (!can(permission) && !can('integrations.manage')) return res.status(403).json({ error: `Sem permissão ${permission}.` });
      let promoterId: string | undefined;
      if (requirePromoter) {
        if (typeof req.query.promoterId !== 'string' || !req.query.promoterId) return res.status(400).json({ error: 'Selecione a promotora desta conexão.' });
        promoterId = (await resolveBankPromoter(prisma, tenantId, req.query.promoterId)).id;
      }
      return res.json(await action(req, { tenantId, promoterId, userId: session.user.id, can }));
    } catch (error: any) {
      const unsafe = error?.code || /^Prisma|AbortError|TimeoutError|TypeError/.test(error?.name || '');
      return res.status(400).json({ error: unsafe ? 'Não foi possível concluir a consulta Paraná. Nenhum retorno técnico ou credencial foi exposto.' : error.message || 'Falha na consulta Paraná.' });
    }
  };
  const audit = (c: any, req: Request, action: string, id: string) => AuditLogService.record(prisma, { tenantId: c.tenantId, userId: c.userId, action, entity: 'SystemConfig', entityId: id, newData: { provider: 'parana', promoterId: c.promoterId }, req });
  app.get('/api/integrations/parana/config', wrap('integrations.view', true, async (req, c) => ({ ...ParanaBankService.metadata(await ParanaBankService.config(prisma, c.tenantId, c.promoterId, req.query.environment as string | undefined)), activeEnvironment: (await ParanaBankService.config(prisma, c.tenantId, c.promoterId)).environment })));
  app.put('/api/integrations/parana/config', wrap('integrations.manage', true, async (req, c) => { const result = await ParanaBankService.save(prisma, c.tenantId, c.promoterId, req.body); await audit(c, req, 'PARANA_CONFIG_UPDATED', c.promoterId); return result; }));
  app.post('/api/integrations/parana/test', wrap('integrations.manage', true, async (req, c) => { await ParanaBankService.token(prisma, c.tenantId, c.promoterId, true, req.body?.environment); await audit(c, req, 'PARANA_AUTH_TEST', c.promoterId); return { success: true, message: 'Autenticação Paraná concluída.' }; }));
  app.get('/api/integrations/parana/connections', wrap('simulations.create', false, async (_req, c) => {
    const promoters = await prisma.promoter.findMany({ where: { tenantId: c.tenantId, status: 'ATIVO' }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const connections = await Promise.all(promoters.map(async (promoter: any) => (await ParanaBankService.config(prisma, c.tenantId, promoter.id)).enabled ? promoter : null));
    return connections.filter(Boolean);
  }));
  app.post('/api/integrations/parana/opportunities', wrap('simulations.create', true, async (req, c) => ParanaBankService.opportunities(prisma, c.tenantId, c.promoterId, req.body)));
  app.get('/api/integrations/parana/proposals', wrap('integrations.view', true, async (req, c) => { if (!c.can('proposals.view')) throw new Error('Sem permissão proposals.view.'); return ParanaBankService.list(prisma, c.tenantId, c.promoterId, req.query); }));
  app.post('/api/proposals/:id/parana-sync', wrap('integrations.sync', false, async (req, c) => {
    if (!c.can('proposals.view') || !c.can('proposals.update')) throw new Error('Sem permissão de consulta e atualização de propostas.');
    const result = await ParanaBankService.sync(prisma, c.tenantId, String(req.params.id), c.userId);
    await audit(c, req, 'PARANA_PROPOSAL_SYNC', result.proposalId);
    sseRegistry.broadcastToTenant(c.tenantId, { type: 'PROPOSAL_UPDATED', entity: 'Proposal', entityId: result.proposalId, data: { id: result.proposalId } });
    return result;
  }));
}
