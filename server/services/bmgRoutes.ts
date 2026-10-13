import type { Express, Request } from 'express';
import type { PrismaClient } from '@prisma/client';
import { BmgBankService } from './bmgBankService.js';
import { PartnerPortalService } from './partnerPortalService.js';
import { PartnerSimulationTracking } from './partnerSimulationTracking.js';
import { hasPermission } from '../../src/lib/permissions.js';
import { isValidCpf } from '../../src/lib/utils.js';
import { AuditLogService } from './auditLogService.js';
import { randomUUID } from 'node:crypto';
import { BmgProposalService } from './bmgProposalService.js';
import rateLimit from 'express-rate-limit';
import { sseRegistry } from '../realtime.js';

export function registerBmgRoutes(app: Express, prisma: PrismaClient, getAuthSession: (req: Request) => Promise<any>) {
  app.use('/api/integrations/bmg/customer', rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas consultas BMG. Aguarde alguns minutos.' } }));
  app.use('/api/integrations/bmg/customer/send-otp', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Limite de solicitações SMS. Aguarde antes de solicitar outro código.' } }));
  async function actor(req: Request) {
    const session = await getAuthSession(req);
    if (session?.effectiveTenantId && hasPermission(session.activeRole, session.activePermissions, 'simulations.create')) return { tenantId: session.effectiveTenantId, actorId: `user:${session.user.id}`, session, partner: null };
    const partner = await PartnerPortalService.getPartnerSession(req, prisma);
    return partner ? { tenantId: partner.tenant.id, actorId: `partner:${partner.access.id}`, session: null, partner } : null;
  }
  app.get('/api/integrations/bmg/config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getAuthSession(req);
      const context = await actor(req);
      const tenantId = session?.effectiveTenantId || context?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autorizado.' });
      const config = await BmgBankService.config(prisma, tenantId);
      const canCreateClt = !!session && hasPermission(session.activeRole, session.activePermissions, 'proposals.create') && hasPermission(session.activeRole, session.activePermissions, 'simulations.create');
      return res.json({ ...(session && hasPermission(session.activeRole, session.activePermissions, 'integrations.manage') ? BmgBankService.metadata(config) : { enabled: config.enabled, isConfigured: !!(config.username && config.password) }), canCreateClt });
    } catch { return res.status(500).json({ error: 'Não foi possível carregar a configuração BMG.' }); }
  });
  app.put('/api/integrations/bmg/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session?.effectiveTenantId || !hasPermission(session.activeRole, session.activePermissions, 'integrations.manage')) return res.status(403).json({ error: 'Sem permissão para configurar BMG.' });
      const data = await BmgBankService.save(prisma, session.effectiveTenantId, req.body);
      await AuditLogService.record(prisma, { tenantId: session.effectiveTenantId, userId: session.user.id, action: 'bmg.config_updated', entity: 'SystemConfig', entityId: 'BMG_CONFIG', newData: { environment: data.environment, enabled: data.enabled }, req });
      return res.json(data);
    } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível salvar BMG.' }); }
  });
  app.post('/api/integrations/bmg/test-connection', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session?.effectiveTenantId || !hasPermission(session.activeRole, session.activePermissions, 'integrations.manage')) return res.status(403).json({ error: 'Sem permissão para testar BMG.' });
      await BmgBankService.token(prisma, session.effectiveTenantId);
      return res.json({ message: 'Autenticação BMG realizada com sucesso.' });
    } catch (error: any) { return res.status(400).json({ error: error.message || 'Falha na autenticação BMG.' }); }
  });
  app.post('/api/integrations/bmg/customer/:action', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const context = await actor(req);
      if (!context) return res.status(401).json({ error: 'Não autorizado.' });
      const raw = req.body || {}, cpf = String(raw.cpf || '').replace(/\D/g, ''), phone = String(raw.phone || '').replace(/\D/g, '');
      if (!isValidCpf(cpf)) return res.status(400).json({ error: 'Informe um CPF válido.' });
      if (req.params.action === 'create-clt') {
        if (!context.session || !hasPermission(context.session.activeRole, context.session.activePermissions, 'proposals.create')) return res.status(403).json({ error: 'A inclusão BMG deve ser realizada pela mesa com permissão para cadastrar propostas.' });
        const result = await BmgProposalService.createClt(prisma, { tenantId: context.tenantId, actorId: context.actorId, userId: context.session.user.id, partnerId: String(raw.partnerId || '') }, { ...raw, cpf });
        await AuditLogService.record(prisma, { tenantId: context.tenantId, userId: context.session.user.id, action: 'bmg.proposal_created', entity: 'Proposal', entityId: result.proposalId, newData: { proposalNumber: result.proposalNumber }, req });
        sseRegistry.broadcastToTenant(context.tenantId, { type: 'PROPOSAL_CREATED', entity: 'Proposal', entityId: result.proposalId, userId: context.session.user.id });
        return res.json(result);
      }
      if (req.params.action === 'send-otp') {
        if (!/^\d{10,11}$/.test(phone)) return res.status(400).json({ error: 'Informe telefone com DDD.' });
        return res.json(await BmgBankService.sendOtp(prisma, context.tenantId, context.actorId, cpf, phone));
      }
      if (req.params.action === 'verify-otp') {
        const code = String(raw.code || '').trim(); if (!/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'Informe o código recebido por SMS.' });
        return res.json(await BmgBankService.verifyOtp(prisma, context.tenantId, context.actorId, cpf, code));
      }
      if (req.params.action !== 'simulate') return res.status(404).json({ error: 'Ação BMG não disponível.' });
      if (!['INSS', 'CLT'].includes(raw.product) || (raw.product === 'INSS' && !['NEW', 'REFIN', 'PORT', 'PORT_REFIN'].includes(raw.operation))) return res.status(400).json({ error: 'Produto ou modalidade BMG inválida.' });
      const input = { cpf, product: raw.product, operation: raw.operation, birthDate: String(raw.birthDate || ''), benefitNumber: String(raw.benefitNumber || '').trim(), mode: raw.mode, value: Number(raw.value), income: Number(raw.income), term: Number(raw.term), bmgContract: String(raw.bmgContract || ''), bmgRequestedAmount: Number(raw.bmgRequestedAmount) };
      if (input.product === 'INSS' && (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) || !input.benefitNumber)) return res.status(400).json({ error: 'Informe nascimento e número do benefício.' });
      const rows = await BmgBankService.offers(prisma, context.tenantId, context.actorId, input);
      const tracking = context.partner ? await PartnerSimulationTracking.record(prisma, { tenantId: context.tenantId, partnerId: context.partner.partner.id, partnerCode: context.partner.partner.code, accessName: context.partner.access.name }, randomUUID(), input, rows.filter(row => row.state === 'OFFER')) : null;
      return res.json({ rows, simulationId: tracking?.id });
    } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível concluir a consulta BMG.' }); }
  });
  app.get('/api/integrations/bmg/proposals/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const session = await getAuthSession(req);
      if (!session?.effectiveTenantId || !hasPermission(session.activeRole, session.activePermissions, 'proposals.view')) return res.status(403).json({ error: 'Sem permissão para consultar propostas.' });
      const proposal = await prisma.proposal.findFirst({ where: { id: String(req.params.id), tenantId: session.effectiveTenantId, deletedAt: null }, include: { bank: true, client: true } });
      if (!proposal || proposal.bank?.code !== '318') return res.status(404).json({ error: 'Proposta BMG não encontrada nesta empresa.' });
      if (!/^\d{1,30}$/.test(proposal.proposalNumber)) return res.status(400).json({ error: 'O número cadastrado não está no formato BMG.' });
      const data = await BmgBankService.request(prisma, proposal.tenantId, 'GET', `/v1/propostas/${encodeURIComponent(proposal.proposalNumber)}`);
      if (String(data.numeroProposta) !== proposal.proposalNumber || String(data.cpf || '').replace(/\D/g, '') !== proposal.client.cpf.replace(/\D/g, '')) throw new Error('O BMG retornou uma proposta ou CPF diferente do cadastro.');
      let link: string | null = null;
      try {
        const formalization = await BmgBankService.request(prisma, proposal.tenantId, 'GET', `/v1/link-formalizacao?numeroProposta=${encodeURIComponent(proposal.proposalNumber)}`);
        const url = new URL(String(formalization.linkFormalizacao));
        if (String(formalization.numeroProposta) === proposal.proposalNumber && url.protocol === 'https:' && !url.username && !url.password) link = url.href;
      } catch { /* Proposal status remains available when formalization is not ready. */ }
      return res.json({ proposalNumber: proposal.proposalNumber, status: String(data.status || ''), date: String(data.dataCriacao || ''), formalizationLink: link });
    } catch (error: any) { return res.status(400).json({ error: error.message || 'Não foi possível consultar a proposta BMG.' }); }
  });
}
