import { parseIlliteracy,portabilityReviewMetadata } from '../../src/lib/portabilitySimulationPolicy.js';
import { nossaWorkbookTables } from './nossaFintechWorkbook.js';
import { portabilityEligibility } from '../../src/lib/portabilityEligibility.js';
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
import { decodeDaycoval, encodeDaycoval } from './daycovalWorkbook.js';

import { SPREADSHEET_MODELS, importPortRefin, calculatePortRefin, portRefinRatePolicies, type SpreadsheetBank } from './portRefinWorkbooks.js';
export function registerDaycovalRoutes(app: Express, prisma: PrismaClient, getSession: (req: Request) => Promise<any>) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3500000, files: 1, fields: 2 } }).single('workbook');
  const limiter = rateLimit({ windowMs: 60000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Aguarde um momento antes de simular novamente.' } });
  const read = async (tenantId: string, bank: SpreadsheetBank) => {
    const row = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: SPREADSHEET_MODELS[bank].key } } });
    return row ? decodeDaycoval(row.configValue) : null;
  };
  const context = async (req: Request, portal: boolean, permission: 'simulations.view' | 'simulations.create') => {
    if (portal) {
      const session = await PartnerPortalService.getPartnerSession(req, prisma);
      return session ? { tenantId: session.tenant.id, partnerId: session.partner.id, accessName: session.access.name, userId: null, userName: session.access.name, canImport: false } : null;
    }
    const session = await getSession(req);
    if (!session?.user || !session.effectiveTenantId) return null;
    const role = session.user.role === 'PLATFORM_MASTER' ? 'PLATFORM_MASTER' : session.activeRole || session.user.role;
    const permissions = session.activePermissions || session.user.customPermissions;
    const canImport = ['MASTER', 'PLATFORM_MASTER'].includes(role) || hasPermission(role, permissions, 'integrations.manage');
    if (!hasPermission(role, permissions, permission) && !(permission === 'simulations.view' && canImport)) return null;
    return { tenantId: session.effectiveTenantId, partnerId: null, accessName: null, userId: session.user.id, userName: session.user.name,
      canImport };
  };
  for (const bank of Object.keys(SPREADSHEET_MODELS) as SpreadsheetBank[]) {
  const model=SPREADSHEET_MODELS[bank], KEY=model.key, routeName=bank==='DAYCOVAL'?'daycoval':`${bank.toLowerCase()}-spreadsheet`;
  for (const portal of [false, true]) {
    const path = portal ? `/api/partner-portal/${routeName}` : `/api/${routeName}`;
    app.get(path, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ctx = await context(req, portal, 'simulations.view'); if (!ctx) return res.status(403).json({ error: 'Sessão e acesso às simulações são necessários.' });
        const book = await read(ctx.tenantId, bank);
        return res.json({ configured: !!book, enabled: !!book && book.enabled !== false, canImport: ctx.canImport, ...(book ? { fileName: book.fileName, hash: book.hash, uploadedAt: book.uploadedAt, terms: book.terms, ratePolicies: portRefinRatePolicies(bank, book), ...(bank === 'NOSSA_FINTECH' ? { workbookTables: nossaWorkbookTables(book) } : {}), versionDate: (book as any).versionDate } : {}) });
      } catch { return res.status(500).json({ error: 'Não foi possível carregar a planilha Daycoval.' }); }
    });
    app.post(`${path}/simulate`, limiter, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ctx = await context(req, portal, 'simulations.create'); if (!ctx) return res.status(403).json({ error: 'Sessão e permissão para simular são necessárias.' });
        const book = await read(ctx.tenantId, bank); if (!book) return res.status(409).json({ error: 'O MASTER precisa importar a planilha deste banco primeiro.' });
        if (book.enabled === false) return res.status(409).json({ error: 'A planilha está desativada pelo MASTER da empresa.' });
        const raw = req.body || {}, cpf = String(raw.cpf || '').replace(/\D/g, '');
        if (!isValidCpf(cpf)) return res.status(400).json({ error: 'Informe um CPF válido.' });
        if (raw.convenio && raw.convenio !== 'INSS') return res.status(400).json({ error: 'Daycoval disponível somente para INSS.' });
        if (!/^[a-zA-Z0-9-]{16,80}$/.test(raw.attemptKey || '')) return res.status(400).json({ error: 'Identificador da simulação inválido.' });
        const partnerId = ctx.partnerId || String(raw.partnerId || '');
        const partner = await prisma.partner.findFirst({ where: { id: partnerId, tenantId: ctx.tenantId, deletedAt: null, status: 'ATIVO' } });
        if (!partner) return res.status(400).json({ error: 'Selecione um parceiro ativo da empresa.' });
        if (!Array.isArray(raw.contracts) || raw.contracts.length < 1 || raw.contracts.length > 3) return res.status(400).json({ error: 'Informe de 1 a 3 contratos.' });
        for (const [index, contract] of raw.contracts.entries()) { const agreement = portabilityEligibility(bank, contract?.originBank, contract?.paidInstallments); if (agreement.blocked) return res.status(400).json({ error: `Contrato ${index + 1}: ${agreement.reason}` }); }
        const input = { ...portabilityReviewMetadata(raw),illiterate:parseIlliteracy(raw.illiterate),state:raw.state,benefitStartDate:raw.benefitStartDate,sex:raw.sex,originCategory:raw.originCategory,negativeMarginAmount:raw.negativeMarginAmount?Number(raw.negativeMarginAmount):undefined,medicalExamDate:raw.medicalExamDate,cpf, name: String(raw.name || '').trim().slice(0, 200), birthDate: raw.birthDate, simulationDate: raw.simulationDate, term: Number(raw.term), refinanceRate: Number(raw.refinanceRate), tableId: String(raw.tableId || ''), benefitType: Number(raw.benefitType), benefitContractCount: Number(raw.benefitContractCount), negativeMargin: raw.negativeMargin === true, portInstallment: Number(raw.portInstallment), additionalMargin: Number(raw.additionalMargin || 0), requestedRefinAmount: Number(raw.requestedRefinAmount || 0), contracts: raw.contracts.map((c: any) => ({ originBank: String(c?.originBank || ''), paidInstallments: Number(c?.paidInstallments), balance: Number(c?.balance), installment: Number(c?.installment), remaining: Number(c?.remaining), cipInstallment: c?.cipInstallment ? Number(c.cipInstallment) : 0 })), product: 'INSS', operation: 'PORT_REFIN' };
        if (bank === 'NOSSA_FINTECH') {
          const table = nossaWorkbookTables(book).find(row => row.id === input.tableId);
          if (!table) return res.status(400).json({ error: 'Selecione uma tabela Nossa Fintech válida.' });
          input.refinanceRate = table.rate * 100;
          input.negativeMargin = Number(input.negativeMarginAmount || 0) > 0;
          input.portInstallment = Number(input.contracts[0].installment) - Number(input.negativeMarginAmount || 0);
        }
        const result = calculatePortRefin(bank, book, input);
        const available = result.offers.filter(o => o.eligible && o.amount > 0);
        const inputHash = createHash('sha256').update(JSON.stringify({ ...input, partnerId, version: book.hash })).digest('hex');
        let simulationId: string | null = null;
        if (available.length) {
          const best = [...available].sort((a,b) => b.amount-a.amount)[0];
          const attempt = `${ctx.tenantId}:${partnerId}:${bank}:${raw.attemptKey}`;
          const existing = await prisma.simulationRequest.findUnique({ where: { portalAttemptKey: attempt } });
          if (existing && (existing.customerData as any)?.inputHash !== inputHash) return res.status(409).json({ error: 'Os dados mudaram. Inicie outra simulação.' });
          const saved = await prisma.simulationRequest.upsert({ where: { portalAttemptKey: attempt }, update: {}, create: {
            tenantId: ctx.tenantId, partnerId, createdById: ctx.userId, cpf, partnerCodeSnapshot: partner.code,
            portalAccessName: ctx.accessName, portalAttemptKey: attempt, status: 'SIMULAÇÃO ENVIADA', simulationType: portal ? 'PARTNER_AUTO' : 'SPREADSHEET_INSS', operationType: 'INSS:PORT_REFIN', offerExpiresAt: simulationDeadline(new Date()),
            selectedCondition: { provider: bank, tableId: best.tableId, tableName: best.tableName, amount: best.amount, term: best.term, installment: best.installment, rate: best.rate },
            customerData: JSON.parse(JSON.stringify({ ...input, inputHash, spreadsheet: { bank, ...result }, offers: available.map(o => ({ ...o, name: o.tableName, code: o.tableId, institution: bank })) })),
          } });
          simulationId = saved.id;
          if (!existing) {
            eventBus.publishToTenant(ctx.tenantId, { type: 'SIMULATION_CREATED', entity: 'SimulationRequest', entityId: saved.id });
            await AuditLogService.record(prisma, { tenantId: ctx.tenantId, userId: ctx.userId, userName: ctx.userName, action: `${bank}_SIMULACAO_PLANILHA`, entity: 'SimulationRequest', entityId: saved.id, newData: { version: book.hash, partnerId, offerCount: available.length }, req });
          }
        }
        return res.json({ ...result, simulationId });
      } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível calcular a simulação Daycoval.' }); }
    });
  }
  app.post(`/api/${routeName}/import`, limiter, async (req, res) => {
    try {
    const ctx = await context(req, false, 'simulations.view');
    if (!ctx?.canImport) return res.status(403).json({ error: 'Para importar a planilha, solicite a permissão de gerenciar integrações na empresa.' });
    upload(req, res, async error => {
      if (error) return res.status(400).json({ error: 'Envie um único arquivo Excel de até 3,5 MB.' });
      try {
        if (!req.file || !model.extensions.some(ext=>req.file!.originalname.toLowerCase().endsWith(ext))) return res.status(400).json({ error: 'Selecione a planilha do banco escolhido.' });
        const versionDate = String(req.body.versionDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(versionDate) || !Number.isFinite(Date.parse(versionDate)) || new Date(versionDate).toISOString().slice(0,10) !== versionDate) return res.status(400).json({ error: 'Informe a data da versão da planilha.' });
        const book = await importPortRefin(bank, req.file.buffer, req.file.originalname);
        book.enabled = true;
        (book as any).versionDate = versionDate;
        // Reject missing mandatory data columns rather than accept an incompatible weekly upload.
        const columns = book.tables.Consulta1?.columns || [];
        if (bank === 'DAYCOVAL' && (columns[0] !== 'EMPREGADOR' || columns[5] !== 'TAXA' || columns[6] !== 'PRAZO' || columns[19] !== 'minport_%')) throw new Error('A estrutura das tabelas Daycoval mudou. Esta versão precisa ser adaptada.');
        await prisma.systemConfig.upsert({ where: { tenantId_configKey: { tenantId: ctx.tenantId, configKey: KEY } }, create: { tenantId: ctx.tenantId, configKey: KEY, configValue: encodeDaycoval(book) }, update: { configValue: encodeDaycoval(book) } });
        await AuditLogService.record(prisma, { tenantId: ctx.tenantId, userId: ctx.userId, userName: ctx.userName, action: `${bank}_PLANILHA_IMPORTADA`, entity: 'SystemConfig', entityId: KEY, newData: { fileName: book.fileName, hash: book.hash, versionDate }, req });
        return res.json({ configured: true, enabled: true, canImport: true, fileName: book.fileName, uploadedAt: book.uploadedAt, hash: book.hash, terms: book.terms, ratePolicies: portRefinRatePolicies(bank, book), ...(bank === 'NOSSA_FINTECH' ? { workbookTables: nossaWorkbookTables(book) } : {}), versionDate });
      } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível importar a planilha.' }); }
    });
    } catch { return res.status(500).json({ error: 'Não foi possível acessar a configuração Daycoval da empresa.' }); }
  });
  app.patch(`/api/${routeName}/activation`, async (req, res) => {
    try {
      const ctx = await context(req, false, 'simulations.view');
      if (!ctx?.canImport) return res.status(403).json({ error: 'Para ativar ou desativar a planilha, solicite a permissão de gerenciar integrações na empresa.' });
      if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Informe a ativação da planilha.' });
      const book = await read(ctx.tenantId, bank); if (!book) return res.status(409).json({ error: 'Importe a planilha antes de ativar.' });
      book.enabled = req.body.enabled;
      await prisma.systemConfig.update({ where: { tenantId_configKey: { tenantId: ctx.tenantId, configKey: KEY } }, data: { configValue: encodeDaycoval(book) } });
      await AuditLogService.record(prisma, { tenantId: ctx.tenantId, userId: ctx.userId, userName: ctx.userName, action: `${bank}_ATIVACAO_ALTERADA`, entity: 'SystemConfig', entityId: KEY, newData: { enabled: book.enabled, hash: book.hash }, req });
      return res.json({ enabled: book.enabled });
    } catch { return res.status(500).json({ error: 'Não foi possível alterar a ativação da planilha.' }); }
  });
  }
}
