import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import { normalizeBankOrders, SIMULATION_BANKS, OPERATIONS } from '../../src/lib/simulationBankOrder.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { AuditLogService } from './auditLogService.js';
import { hasPermission } from '../../src/lib/permissions.js';
export function registerSimulationBankOrderRoutes(app: Express, prisma: PrismaClient, getAuthSession: (req: Request) => Promise<any>) {
  app.get('/api/simulations/bank-order', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getAuthSession(req);
      const partner = session ? null : await PartnerPortalService.getPartnerSession(req, prisma);
      const tenantId = session?.effectiveTenantId || partner?.tenant.id;
      if (!tenantId) return res.status(401).json({ error: 'Não autorizado.' });
      const row = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: 'SIMULATION_BANK_ORDER' } } });
      return res.json(normalizeBankOrders(row ? JSON.parse(row.configValue) : null));
    } catch { return res.status(500).json({ error: 'Não foi possível carregar a ordem dos bancos.' }); }
  });
  app.put('/api/simulations/bank-order', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session?.effectiveTenantId) return res.status(401).json({ error: 'Não autorizado.' });
      if (!hasPermission(session.activeRole, session.activePermissions, 'integrations.manage')) return res.status(403).json({ error: 'Sem permissão para configurar a ordem dos bancos.' });
      if (Object.keys(OPERATIONS).some(operation => !Array.isArray(req.body?.[operation]) || req.body[operation].length !== SIMULATION_BANKS.length || new Set(req.body[operation]).size !== SIMULATION_BANKS.length || req.body[operation].some((bank: any) => !SIMULATION_BANKS.includes(bank)))) return res.status(400).json({ error: 'Informe todos os bancos, sem repetição, em cada modalidade.' });
      const orders = normalizeBankOrders(req.body), tenantId = session.effectiveTenantId;
      await prisma.$transaction(async tx => {
        const previous = await tx.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: 'SIMULATION_BANK_ORDER' } } });
        await tx.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey: 'SIMULATION_BANK_ORDER' } }, create: { tenantId, configKey: 'SIMULATION_BANK_ORDER', configValue: JSON.stringify(orders) }, update: { configValue: JSON.stringify(orders) } });
        await AuditLogService.recordBatch(tx, [{ tenantId, userId: session.user.id, userName: session.user.name, action: 'simulation.bank_order_updated', entity: 'SystemConfig', entityId: 'SIMULATION_BANK_ORDER', oldData: previous ? JSON.parse(previous.configValue) : null, newData: orders, req }]);
      }, { timeout: 15000, maxWait: 10000 });
      return res.json(orders);
    } catch { return res.status(500).json({ error: 'Não foi possível salvar a ordem dos bancos.' }); }
  });
}
