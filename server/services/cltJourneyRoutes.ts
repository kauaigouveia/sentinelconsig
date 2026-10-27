import { V8CltPilot } from './v8CltPilot.js';
import { V8CltSimulationService } from './v8CltSimulationService.js';
import { V8CltContract } from './v8CltContract.js';
import { registerV8ApiAuthorization, V8CltConsent } from './v8CltConsent.js';
import type { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { hasPermission } from '../../src/lib/permissions.js';
import { isValidCpf } from '../../src/lib/utils.js';
import { isCltBirthDate, isCltEmail, isCltGender } from '../../src/lib/cltCustomerData.js';
import { CltJourneyService, journeyProviders, type JourneyAction, type JourneyProvider, type JourneySnapshot } from './cltJourneyService.js';

export function registerCltJourneyRoutes(app: Express, db: any, getSession: (req: Request) => Promise<any>, service = new CltJourneyService()) {
  const path = '/api/simulations/clt/journey';
  app.use(path, rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  async function context(req: Request) {
    const s = await getSession(req);
    if (!s?.user) return { status: 401, error: 'Sessão expirada. Entre novamente para consultar bancos.' };
    const tenant = s.effectiveTenantId || s.user.tenantId;
    if (!tenant || s.partner || s.partnerId || s.user.partnerId || /PARTNER|PARCEIRO/i.test(s.activeRole || s.user.role || '') || !hasPermission(s.activeRole || s.user.role, s.activePermissions || s.user.customPermissions, 'simulations.create')) return { status: 403 };
    // The legacy simulationAccessEnabled flag is managed together with Happy access
    // in /api/settings/simulation-access. It must not disable unrelated banks.
    // Happy still checks both flags in available() and in its own backend routes.
    const access = await db.tenant.findUnique({ where: { id: tenant }, select: { status: true, deletedAt: true } });
    if (!access || access.deletedAt || access.status && access.status !== 'ACTIVE') return { status: 403, error: 'A empresa selecionada está indisponível para operações. Confira o contexto da sessão.' };
    return { tenant, actor: `user:${s.user.id}` };
  }
  registerV8ApiAuthorization(app, db, context, service);
  app.get('/api/simulations/clt/v8/consultations/:executionId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: c.error || 'Acesso não autorizado.' });
      if (typeof req.query.consultId !== 'string' || typeof req.query.promoterId !== 'string' || req.query.consultId.length > 100 || req.query.promoterId.length > 100) return res.status(400).json({ error: 'Referência V8 inválida.' });
      const snapshot = await service.refreshV8(db, c.tenant!, c.actor!, req.params.executionId, req.query.consultId, req.query.promoterId);
      return snapshot ? res.json(snapshot) : res.status(404).json({ error: 'Acompanhamento V8 não encontrado nesta sessão e empresa.' });
    } catch { return res.status(503).json({ error: 'Acompanhamento temporariamente indisponível. Nenhuma operação foi reenviada.' }); }
  });
  app.get(['/api/simulations/clt/v8/pilot', '/api/simulations/clt/v8/capabilities'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: c.error || 'Seu perfil não possui permissão de simulação nesta empresa.' });
      const stored = await db.systemConfig.findMany({ where: { tenantId: c.tenant, configKey: { startsWith: 'integration:v8:' } }, select: { configKey: true } });
      const connections = [];
      for (const item of stored) { const promoterId = /^integration:v8:(.+):config$/.exec(item.configKey)?.[1]; if (promoterId) { const p = await V8CltContract.read(db, c.tenant!, promoterId); connections.push({ promoterId, simulationReady: await V8CltSimulationService.canSimulate(db, c.tenant!, promoterId), authorizationReady: p.apiAuthorizationReady, reasons: p.reasons }); } }
      return res.json({ allowed: true, connections });
    } catch { return res.status(503).json({ error: 'Não foi possível conferir a habilitação do teste.' }); }
  });
  app.post('/api/simulations/clt/v8/consent-link', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: c.error || 'Acesso não autorizado.' });
      const entry = typeof req.body?.executionId === 'string' ? await service.get(db, c.tenant!, c.actor!, req.body.executionId) : undefined;
      const reference = entry?.snapshot.results.v8?.rows.map(r => (r.data as any)?.v8).find(v => v?.consultId === req.body.consultId && v?.promoterId === req.body.promoterId);
      if (!entry || entry.record.phase !== 'DONE' || !entry.snapshot.customer || !reference || reference.status !== 'WAITING_CONSENT') return res.status(404).json({ error: 'Consulta aguardando consentimento não encontrada neste acompanhamento.' });
      return res.json(await V8CltConsent.issue(db, c.tenant!, reference.promoterId, reference.consultId, entry.snapshot.customer));
    } catch { return res.status(409).json({ error: 'Termo vigente, verificação do trabalhador ou vínculo da consulta ainda não estão confirmados.' }); }
  });
  app.get(`${path}/history`,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');try{const c=await context(req);if(c.status)return res.status(c.status).json({error:c.error||'Acesso não autorizado.'});return res.json({executions:await service.history(db,c.tenant!,c.actor!)});}catch{return res.status(503).json({error:'Histórico temporariamente indisponível.'});}
  });
  app.get(`${path}/:id/observe`,async(req,res)=>{
    res.setHeader('Cache-Control','no-store');try{const c=await context(req);if(c.status)return res.status(c.status).json({error:c.error||'Acesso não autorizado.'});const provider=req.query.provider;if(provider!==undefined&&(typeof provider!=='string'||!journeyProviders.includes(provider as JourneyProvider)))return res.status(400).json({error:'Instituição inválida.'});const snapshot=await service.observe(db,c.tenant!,c.actor!,req.params.id,provider as JourneyProvider|undefined,req.query.manual==='1');return snapshot?res.json(snapshot):res.status(404).json({error:'Execução não encontrada nesta empresa e usuário.'});}catch{return res.status(503).json({error:'Acompanhamento temporariamente indisponível. Nenhuma solicitação foi reenviada.'});}
  });
  app.get(`${path}/:id`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: c.error || 'Seu perfil não possui permissão de simulação nesta empresa.' });
      const entry = await service.get(db, c.tenant!, c.actor!, req.params.id);
      if (!entry) return res.status(404).json({ error: 'Execução indisponível. Não repita a consulta sem conferir o estado.' });
      return res.json(entry.snapshot);
    } catch { return res.status(503).json({ error: 'Não foi possível recuperar a execução.' }); }
  });
  app.post(path, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: c.error || 'Seu perfil não possui permissão de simulação nesta empresa.' });
      const b = req.body || {}, cpf = String(b.cpf || '').replace(/\D/g, ''), phone = String(b.phone || '').replace(/\D/g, ''), name = String(b.name || '').trim();
      const term = Number(b.term ?? 0), value = Number(b.value ?? 0), mode = b.mode ?? 'Payment', employerDocument = String(b.employerDocument || '').replace(/\D/g, '');
      const id = b.executionId, action: JourneyAction = b.action || 'REFRESH', provider = b.provider as JourneyProvider | undefined;
      if (typeof id !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id) || !isValidCpf(cpf) || !name || name.length > 200 || !/^\d{10,11}$/.test(phone) || !Number.isInteger(term) || term < 0 || term > 120 || !Number.isFinite(value) || value < 0 || !['Payment', 'Liquid'].includes(mode) || employerDocument && ![8, 14].includes(employerDocument.length) || !['SIMULATE', 'REFRESH', 'AUTHORIZE', 'CREATE_CONSULT'].includes(action) || provider && !journeyProviders.includes(provider) || action === 'SIMULATE' && !provider || action === 'CREATE_CONSULT' && provider !== 'v8' || action === 'AUTHORIZE' && (!provider || !['nossa', 'finanto', 'facta'].includes(provider))) return res.status(400).json({ error: 'Revise os dados do cliente e a ação específica da instituição. Inicie pela consulta dos bancos.' });
      for (const key of ['factaRegistration', 'v8ConsultId', 'v8PromoterId']) if (b[key] !== undefined && (typeof b[key] !== 'string' || b[key].length > 100 || /[\u0000-\u001f\u007f]/.test(b[key]))) return res.status(400).json({ error: 'Seleção de vínculo inválida.' });
      if (b.parentExecutionId !== undefined && (typeof b.parentExecutionId !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(b.parentExecutionId))) return res.status(400).json({ error: 'Acompanhamento anterior inválido.' });
      const email = typeof b.v8Email === 'string' ? b.v8Email.trim() : b.v8Email;
      if (!isCltBirthDate(b.v8BirthDate) || !isCltEmail(email) || !isCltGender(b.v8Gender)) return res.status(400).json({ error: 'Preencha nascimento válido, e-mail e sexo informado pelo trabalhador na primeira etapa. Parcela e prazo não são exigidos para consultar.' });
      const input = { cpf, phone, name, term, value, employerDocument, mode: value ? mode : 'Payment', autoConditions: !value, eligibility: true, factaRegistration: b.factaRegistration, v8ConsultId: b.v8ConsultId, v8PromoterId: b.v8PromoterId, v8BirthDate: b.v8BirthDate, v8Gender: b.v8Gender, v8Email: email };
      const entry = await service.start(db, c.tenant!, c.actor!, id, input, provider, action, b.parentExecutionId);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      let closed = false;
      const listener = (snapshot: JourneySnapshot) => { if (!closed && !res.writableEnded) { res.write(JSON.stringify(snapshot) + '\n'); if (!snapshot.running) res.end(); } };

      res.on('close', () => { closed = true; entry.listeners.delete(listener); });
      entry.listeners.add(listener); listener(entry.snapshot);
      // Await every external operation inside this invocation, never detach work after returning.
      await service.execute(db, c.tenant!, c.actor!, entry, input, action, provider);
      listener(entry.snapshot);
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (!res.headersSent) return res.status(error instanceof Error && error.message === 'EXECUTION_CONFLICT' ? 409 : 503).json({ error: 'Não foi possível iniciar esta execução. Confira seu estado antes de repetir.' });
      res.end();
    }
  });
}
