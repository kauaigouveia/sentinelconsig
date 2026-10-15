import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { WorkbankService } from './workbankService.js';
import { resolveBankPromoter } from './bankPromoterConfig.js';
import { hasPermission } from '../../src/lib/permissions.js';
import { AuditLogService } from './auditLogService.js';
import { sseRegistry } from '../realtime.js';

export function registerWorkbankRoutes(app: Express, prisma: any, getAuthSession: (req: Request) => Promise<any>) {
  app.use('/api/integrations/workbank', rateLimit({ windowMs: 60000, max: 180, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas solicitações WorkBank. Aguarde um minuto.' } }));
  const route = (permission: string, action: (req: Request, context: any) => Promise<any>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getAuthSession(req), tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session?.user || !tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const allowed = (name: string) => hasPermission(session.activeRole, session.activePermissions, name);
      if (!allowed(permission) && !(permission.startsWith('integrations.') && allowed('integrations.manage'))) return res.status(403).json({ error: `Sem permissão ${permission}.` });
      if (!allowed('integrations.view') && !allowed('integrations.manage')) return res.status(403).json({ error: 'Sem acesso às integrações.' });
      if (typeof req.query.promoterId !== 'string' || !req.query.promoterId) return res.status(400).json({ error: 'Selecione a promotora desta conexão.' });
      const promoter = await resolveBankPromoter(prisma, tenantId, req.query.promoterId);
      return res.json(await action(req, { tenantId, promoterId: promoter.id, userId: session.user.id, session, allowed }));
    } catch (error: any) {
      // Never return provider response bodies, tokens, headers, or Prisma diagnostics.
      const message = error?.code || /^Prisma/.test(error?.name || '') || error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.name === 'TypeError' ? 'Não foi possível concluir. Confira a conexão e recarregue a fila; o progresso salvo foi preservado.' : String(error?.message || 'Falha na integração WorkBank.');
      return res.status(400).json({ error: message });
    }
  };
  const audit = (context: any, req: Request, action: string, entityId: string) => AuditLogService.record(prisma, { tenantId: context.tenantId, userId: context.userId, action, entity: 'SystemConfig', entityId, newData: { provider: 'workbank', promoterId: context.promoterId }, req });
  app.get('/api/integrations/workbank/config', route('integrations.view', async (_req, c) => WorkbankService.metadata(await WorkbankService.config(prisma, c.tenantId, c.promoterId))));
  app.put('/api/integrations/workbank/config', route('integrations.manage', async (req, c) => { const result = await WorkbankService.save(prisma, c.tenantId, c.promoterId, req.body); await audit(c, req, 'WORKBANK_CONFIG_UPDATED', c.promoterId); return result; }));
  app.post('/api/integrations/workbank/test', route('integrations.manage', async (req, c) => { await WorkbankService.token(prisma, c.tenantId, c.promoterId, true); await audit(c, req, 'WORKBANK_AUTH_TEST', c.promoterId); return { success: true, message: 'Autenticação WorkBank concluída.' }; }));
  app.post('/api/integrations/workbank/extract', route('integrations.sync', async (req, c) => {
    if (!c.allowed('proposals.update')) throw new Error('Sem permissão proposals.update para sincronizar propostas já vinculadas.');
    const result = await WorkbankService.extract(prisma, c.tenantId, c.promoterId, c.userId, req.body); await audit(c, req, 'WORKBANK_EXTRACT', result.batchId); return result;
  }));
  app.post('/api/integrations/workbank/batches/:id/step', route('integrations.sync', async (req, c) => {
    if (!c.allowed('proposals.update')) throw new Error('Sem permissão proposals.update.');
    const result = await WorkbankService.step(prisma, c.tenantId, c.promoterId, c.userId, String(req.params.id));
    if (result.done) sseRegistry.broadcastToTenant(c.tenantId, { type: 'PROPOSAL_UPDATED', entity: 'Proposal', entityId: String(req.params.id), data: { provider: 'workbank' } });
    return result;
  }));
  app.get('/api/integrations/workbank/records', route('integrations.view', async (req, c) => {
    if (!c.allowed('proposals.view')) throw new Error('Sem permissão proposals.view.');
    return WorkbankService.records(prisma, c.tenantId, c.promoterId, typeof req.query.cursor === 'string' ? req.query.cursor : undefined);
  }));
  app.post('/api/integrations/workbank/agents', route('integrations.manage', async (req, c) => { await WorkbankService.bindAgent(prisma, c.tenantId, c.promoterId, String(req.body.name || ''), String(req.body.partnerId || '')); await audit(c, req, 'WORKBANK_AGENT_BOUND', c.promoterId); return { success: true }; }));
  app.get('/api/integrations/workbank/options', route('integrations.view', async (_req, c) => {
    const [partners, banks, products, convenios] = await Promise.all([
      prisma.partner.findMany({ where: { tenantId: c.tenantId, promoterId: c.promoterId, status: 'ATIVO', deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
      prisma.bank.findMany({ where: { tenantId: c.tenantId, status: 'ATIVO', bankPromoters: { some: { tenantId: c.tenantId, promoterId: c.promoterId, status: 'ATIVO' } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ where: { active: true, OR: [{ tenantId: c.tenantId }, { tenantId: null, scope: 'GLOBAL' }] }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.convenio.findMany({ where: { active: true, OR: [{ tenantId: c.tenantId }, { tenantId: null, scope: 'GLOBAL' }] }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { partners, banks, products, convenios };
  }));
  app.post('/api/integrations/workbank/records/:id/publish', route('proposals.create', async (req, c) => {
    if (!c.allowed('integrations.manage')) throw new Error('Sem permissão integrations.manage para revisar a importação.');
    const result = await WorkbankService.publish(prisma, c.tenantId, c.promoterId, c.userId, String(req.params.id), req.body, c.allowed('clients.create'));
    await audit(c, req, 'WORKBANK_PROPOSAL_PUBLISHED', result.proposalId);
    sseRegistry.broadcastToTenant(c.tenantId, { type: 'PROPOSAL_UPDATED', entity: 'Proposal', entityId: result.proposalId, data: { id: result.proposalId } });
    return { success: true, ...result };
  }));
  // Imported WorkBank proposals must never fall through to another provider just because the bank matches.
  app.use(['/api/proposals/:id/:action', '/api/integrations/bmg/proposals/:id/sync'], async (req, res, next) => {
    if (req.method !== 'POST' || (req.params.action && !/^(?:facta|c6|happy|finanto|nossa-fintech)-sync$/.test(req.params.action))) return next();
    try {
      const session = await getAuthSession(req), tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return next();
      const origin = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: `workbank:source:${req.params.id}` } } });
      if (origin) return res.status(409).json({ error: 'Proposta vinculada à WorkBank. Atualize o período na aba WorkBank da promotora correspondente.' });
      next();
    } catch { res.status(500).json({ error: 'Não foi possível confirmar a origem da proposta.' }); }
  });
}

export async function decorateWorkbankProposals(prisma: any, tenantId: string, proposals: any[]) {
  if (!proposals.length) return proposals;
  const sources = await prisma.systemConfig.findMany({ where: { tenantId, configKey: { in: proposals.map(row => `workbank:source:${row.id}`) } }, select: { configKey: true } });
  const ids = new Set(sources.map((row: any) => row.configKey.slice('workbank:source:'.length)));
  return proposals.map(row => ids.has(row.id) ? { ...row, workbankSource: true } : row);
}
