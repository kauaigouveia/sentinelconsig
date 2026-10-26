import type { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { hasPermission } from '../../src/lib/permissions.js';
import { isValidCpf } from '../../src/lib/utils.js';
import { CltJourneyService, journeyProviders, type JourneyProvider, type JourneySnapshot } from './cltJourneyService.js';

export function registerCltJourneyRoutes(app: Express, db: any, getSession: (req: Request) => Promise<any>, service = new CltJourneyService()) {
  const path = '/api/simulations/clt/journey';
  app.use(path, rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  async function context(req: Request) {
    const s = await getSession(req);
    if (!s?.user) return { status: 401 };
    const tenant = s.effectiveTenantId || s.user.tenantId;
    if (!tenant || s.partner || s.partnerId || s.user.partnerId || /PARTNER|PARCEIRO/i.test(s.activeRole || s.user.role || '') || !hasPermission(s.activeRole || s.user.role, s.activePermissions || s.user.customPermissions, 'simulations.create')) return { status: 403 };
    const access = await db.tenant?.findUnique({ where: { id: tenant }, select: { simulationAccessEnabled: true } });
    if (access?.simulationAccessEnabled === false) return { status: 403 };
    return { tenant, actor: `user:${s.user.id}` };
  }
  app.get(`${path}/:id`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: 'Acesso à simulação não autorizado.' });
      const entry = await service.get(db, c.tenant!, c.actor!, req.params.id);
      if (!entry) return res.status(404).json({ error: 'Execução indisponível. Não repita a consulta sem conferir o estado.' });
      return res.json(entry.snapshot);
    } catch { return res.status(503).json({ error: 'Não foi possível recuperar a execução.' }); }
  });
  app.post(path, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const c = await context(req); if (c.status) return res.status(c.status).json({ error: 'Acesso à simulação não autorizado.' });
      const b = req.body || {}, cpf = String(b.cpf || '').replace(/\D/g, ''), phone = String(b.phone || '').replace(/\D/g, ''), name = String(b.name || '').trim();
      const term = Number(b.term), value = Number(b.value), employerDocument = String(b.employerDocument || '').replace(/\D/g, '');
      const id = b.executionId, action = b.action || 'SIMULATE', provider = b.provider as JourneyProvider | undefined;
      if (typeof id !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id) || !isValidCpf(cpf) || !name || name.length > 200 || !/^\d{10,11}$/.test(phone) || !Number.isInteger(term) || term < 0 || term > 120 || !Number.isFinite(value) || value <= 0 || !['Payment', 'Liquid'].includes(b.mode) || employerDocument && ![8, 14].includes(employerDocument.length) || !['SIMULATE', 'REFRESH', 'AUTHORIZE'].includes(action) || provider && !journeyProviders.includes(provider) || action === 'AUTHORIZE' && (!provider || !['nossa', 'finanto', 'facta'].includes(provider))) return res.status(400).json({ error: 'Revise os dados, condições e ação específica da instituição.' });
      for (const key of ['factaRegistration', 'v8ConsultId', 'v8PromoterId']) if (b[key] !== undefined && (typeof b[key] !== 'string' || b[key].length > 100 || /[\u0000-\u001f\u007f]/.test(b[key]))) return res.status(400).json({ error: 'Seleção de vínculo inválida.' });
      const input = { cpf, phone, name, term, value, employerDocument, mode: b.mode, eligibility: true, factaRegistration: b.factaRegistration, v8ConsultId: b.v8ConsultId, v8PromoterId: b.v8PromoterId };
      const entry = await service.start(db, c.tenant!, c.actor!, id, input, provider, action);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      let closed = false;
      const listener = (snapshot: JourneySnapshot) => { if (!closed && !res.writableEnded) { res.write(JSON.stringify(snapshot) + '\n'); if (!snapshot.running) res.end(); } };

      res.on('close', () => { closed = true; entry.listeners.delete(listener); });
      entry.listeners.add(listener); listener(entry.snapshot);
      // Await every external operation inside this invocation, never detach work after returning.
      await service.execute(db, c.tenant!, c.actor!, entry, input, action);
      listener(entry.snapshot);
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (!res.headersSent) return res.status(error instanceof Error && error.message === 'EXECUTION_CONFLICT' ? 409 : 503).json({ error: 'Não foi possível iniciar esta execução. Confira seu estado antes de repetir.' });
      res.end();
    }
  });
}
