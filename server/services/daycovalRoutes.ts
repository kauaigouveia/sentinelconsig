import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { hasPermission } from '../../src/lib/permissions.js';
import { isValidCpf } from '../../src/lib/utils.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { simulationDeadline } from './partnerSimulationTracking.js';
import { AuditLogService } from './auditLogService.js';
import { eventBus } from './pusherService.js';
import { decodeDaycoval, encodeDaycoval, importDaycoval, simulateDaycoval } from './daycovalWorkbook.js';

const KEY = 'DAYCOVAL_INSS_WORKBOOK_V1';
// Fingerprint of the formulas in the supplied 09/10/2026 simulator (not cached outputs).
const MODEL = '6e0eacd03bb614e7a257cae03b8c7844f4f1436abd14cad78124369427dfb1af';
export function registerDaycovalRoutes(app: Express, prisma: PrismaClient, getSession: (req: Request) => Promise<any>) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3500000, files: 1, fields: 2 } }).single('workbook');
  const limiter = rateLimit({ windowMs: 60000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Aguarde um momento antes de simular novamente.' } });
  const read = async (tenantId: string) => {
    const row = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: KEY } } });
    return row ? decodeDaycoval(row.configValue) : null;
  };
  const context = async (req: Request, portal: boolean, permission: 'simulations.view' | 'simulations.create') => {
    if (portal) {
      const session = await PartnerPortalService.getPartnerSession(req, prisma);
      return session ? { tenantId: session.tenant.id, partnerId: session.partner.id, accessName: session.access.name, userId: null, userName: session.access.name, canImport: false } : null;
    }
    const session = await getSession(req);
    if (!session?.user || !session.effectiveTenantId || !hasPermission(session.activeRole || session.user.role, session.activePermissions || session.user.customPermissions, permission)) return null;
    return { tenantId: session.effectiveTenantId, partnerId: null, accessName: null, userId: session.user.id, userName: session.user.name,
      canImport: hasPermission(session.activeRole || session.user.role, session.activePermissions || session.user.customPermissions, 'settings.manage') || hasPermission(session.activeRole || session.user.role, session.activePermissions || session.user.customPermissions, 'admin.manage') };
  };
  for (const portal of [false, true]) {
    const path = portal ? '/api/partner-portal/daycoval' : '/api/daycoval';
    app.get(path, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ctx = await context(req, portal, 'simulations.view'); if (!ctx) return res.status(403).json({ error: 'Sessão e acesso às simulações são necessários.' });
        const book = await read(ctx.tenantId);
        return res.json({ configured: !!book, canImport: ctx.canImport, ...(book ? { fileName: book.fileName, hash: book.hash, uploadedAt: book.uploadedAt, terms: book.terms, versionDate: (book as any).versionDate } : {}) });
      } catch { return res.status(500).json({ error: 'Não foi possível carregar a planilha Daycoval.' }); }
    });
    app.post(`${path}/simulate`, limiter, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ctx = await context(req, portal, 'simulations.create'); if (!ctx) return res.status(403).json({ error: 'Sessão e permissão para simular são necessárias.' });
        const book = await read(ctx.tenantId); if (!book) return res.status(409).json({ error: 'A empresa precisa importar a planilha Daycoval primeiro.' });
        const raw = req.body || {}, cpf = String(raw.cpf || '').replace(/\D/g, '');
        if (!isValidCpf(cpf)) return res.status(400).json({ error: 'Informe um CPF válido.' });
        if (raw.convenio && raw.convenio !== 'INSS') return res.status(400).json({ error: 'Daycoval disponível somente para INSS.' });
        if (!/^[a-zA-Z0-9-]{16,80}$/.test(raw.attemptKey || '')) return res.status(400).json({ error: 'Identificador da simulação inválido.' });
        const partnerId = ctx.partnerId || String(raw.partnerId || '');
        const partner = await prisma.partner.findFirst({ where: { id: partnerId, tenantId: ctx.tenantId, deletedAt: null, status: 'ATIVO' } });
        if (!partner) return res.status(400).json({ error: 'Selecione um parceiro ativo da empresa.' });
        if (!Array.isArray(raw.contracts) || raw.contracts.length < 1 || raw.contracts.length > 17) return res.status(400).json({ error: 'Informe de 1 a 17 contratos.' });
        const input = { cpf, name: String(raw.name || '').trim().slice(0, 200), birthDate: raw.birthDate, simulationDate: raw.simulationDate, term: Number(raw.term), additionalMargin: Number(raw.additionalMargin || 0), requestedRefinAmount: Number(raw.requestedRefinAmount || 0), contracts: raw.contracts.map((c: any) => ({ balance: Number(c?.balance), installment: Number(c?.installment), remaining: Number(c?.remaining), cipInstallment: c?.cipInstallment ? Number(c.cipInstallment) : 0 })), product: 'INSS', operation: 'PORT_REFIN' };
        const result = simulateDaycoval(book, input);
        const available = result.offers.filter(o => o.eligible && o.amount > 0);
        const inputHash = createHash('sha256').update(JSON.stringify({ ...input, partnerId, version: book.hash })).digest('hex');
        let simulationId: string | null = null;
        if (available.length) {
          const best = [...available].sort((a,b) => b.amount-a.amount)[0];
          const attempt = `${ctx.tenantId}:${partnerId}:daycoval:${raw.attemptKey}`;
          const existing = await prisma.simulationRequest.findUnique({ where: { portalAttemptKey: attempt } });
          if (existing && (existing.customerData as any)?.inputHash !== inputHash) return res.status(409).json({ error: 'Os dados mudaram. Inicie outra simulação.' });
          const saved = await prisma.simulationRequest.upsert({ where: { portalAttemptKey: attempt }, update: {}, create: {
            tenantId: ctx.tenantId, partnerId, createdById: ctx.userId, cpf, partnerCodeSnapshot: partner.code,
            portalAccessName: ctx.accessName, portalAttemptKey: attempt, status: 'SIMULAÇÃO ENVIADA', simulationType: portal ? 'PARTNER_AUTO' : 'DAYCOVAL_INSS', operationType: 'INSS:PORT_REFIN', offerExpiresAt: simulationDeadline(new Date()),
            selectedCondition: { provider: 'DAYCOVAL', tableId: best.tableId, tableName: best.tableName, amount: best.amount, term: best.term, installment: best.installment, rate: best.rate },
            customerData: JSON.parse(JSON.stringify({ ...input, inputHash, daycoval: result, offers: available.map(o => ({ ...o, name: o.tableName, code: o.tableId, institution: 'DAYCOVAL' })) })),
          } });
          simulationId = saved.id;
          if (!existing) {
            eventBus.publishToTenant(ctx.tenantId, { type: 'SIMULATION_CREATED', entity: 'SimulationRequest', entityId: saved.id });
            await AuditLogService.record(prisma, { tenantId: ctx.tenantId, userId: ctx.userId, userName: ctx.userName, action: 'DAYCOVAL_SIMULACAO', entity: 'SimulationRequest', entityId: saved.id, newData: { version: book.hash, partnerId, offerCount: available.length }, req });
          }
        }
        return res.json({ ...result, simulationId });
      } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível calcular a simulação Daycoval.' }); }
    });
  }
  app.post('/api/daycoval/import', limiter, async (req, res) => {
    try {
    const ctx = await context(req, false, 'simulations.view');
    if (!ctx?.canImport) return res.status(403).json({ error: 'A importação requer permissão de configuração da empresa.' });
    upload(req, res, async error => {
      if (error) return res.status(400).json({ error: 'Envie um único arquivo XLSX de até 3,5 MB.' });
      try {
        if (!req.file || !req.file.originalname.toLowerCase().endsWith('.xlsx')) return res.status(400).json({ error: 'Selecione a planilha XLSX Daycoval.' });
        const versionDate = String(req.body.versionDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(versionDate) || !Number.isFinite(Date.parse(versionDate)) || new Date(versionDate).toISOString().slice(0,10) !== versionDate) return res.status(400).json({ error: 'Informe a data da versão da planilha.' });
        const book = await importDaycoval(req.file.buffer, req.file.originalname, MODEL);
        (book as any).versionDate = versionDate;
        // Reject missing mandatory data columns rather than accept an incompatible weekly upload.
        const columns = book.tables.Consulta1?.columns || [];
        if (columns[0] !== 'EMPREGADOR' || columns[5] !== 'TAXA' || columns[6] !== 'PRAZO' || columns[19] !== 'minport_%') throw new Error('A estrutura das tabelas Daycoval mudou. Esta versão precisa ser adaptada.');
        await prisma.systemConfig.upsert({ where: { tenantId_configKey: { tenantId: ctx.tenantId, configKey: KEY } }, create: { tenantId: ctx.tenantId, configKey: KEY, configValue: encodeDaycoval(book) }, update: { configValue: encodeDaycoval(book) } });
        await AuditLogService.record(prisma, { tenantId: ctx.tenantId, userId: ctx.userId, userName: ctx.userName, action: 'DAYCOVAL_PLANILHA_IMPORTADA', entity: 'SystemConfig', entityId: KEY, newData: { fileName: book.fileName, hash: book.hash, versionDate }, req });
        return res.json({ configured: true, canImport: true, fileName: book.fileName, uploadedAt: book.uploadedAt, hash: book.hash, terms: book.terms, versionDate });
      } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível importar a planilha.' }); }
    });
    } catch { return res.status(500).json({ error: 'Não foi possível acessar a configuração Daycoval da empresa.' }); }
  });
}
