import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { eventBus, partnerSupportChannel } from './pusherService.js';
import { SUPPORT_EVENTS } from '../../src/lib/supportRealtime.js';

type Session = {tenant: {id: string}; partner: {id: string}} | null;
type GetSession = (req: Request) => Promise<Session>;
type Invalidation = {type: string; entityId: string};
const connections = new Map<string, {tenantId: string; partnerId: string; res: Response; timer: ReturnType<typeof setInterval>}>();
const provider = () => (process.env.VITE_REALTIME_PROVIDER || process.env.REALTIME_PROVIDER || 'pusher') === 'pusher' ? 'pusher' : 'sse';

/** Separate registry: external partners never join the internal tenant stream. */
export async function publishPartnerSupport(tenantId: string, partnerId: string, event: Invalidation) {
  if (!SUPPORT_EVENTS.some(type => type === event.type)) return;
  const payload = {type: event.type, entity: 'SUPPORT', entityId: event.entityId, tenantId};
  if (provider() === 'pusher') {
    await eventBus.publishPartnerSupport(tenantId, partnerId, payload);
    return;
  }
  const message = `event: message\ndata: ${JSON.stringify({...payload, timestamp: new Date().toISOString()})}\n\n`;
  for (const [id, connection] of connections) {
    if (connection.tenantId !== tenantId || connection.partnerId !== partnerId) continue;
    try { connection.res.write(message); }
    catch { close(id); }
  }
}

function close(id: string) {
  const connection = connections.get(id);
  if (!connection) return;
  connections.delete(id);
  clearInterval(connection.timer);
  connection.res.end();
}

export function registerPartnerSupportRealtime(app: Express, getSession: GetSession) {
  const authenticate = async (req: Request) => { try { return await getSession(req); } catch { return null; } };
  app.get('/api/partner-portal/realtime/context', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = await authenticate(req);
    if (!session) return res.status(401).json({error: 'Sessão do parceiro expirada.'});
    return res.json({provider: provider(), tenantId: session.tenant.id, channel: partnerSupportChannel(session.tenant.id, session.partner.id)});
  });
  app.post('/api/partner-portal/realtime/auth', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = await authenticate(req);
    if (!session) return res.status(401).json({error: 'Sessão do parceiro expirada.'});
    const expected = partnerSupportChannel(session.tenant.id, session.partner.id);
    if (req.body?.channel_name !== expected) return res.status(403).json({error: 'Canal não autorizado.'});
    if (typeof req.body?.socket_id !== 'string' || !/^\d+\.\d+$/.test(req.body.socket_id)) return res.status(400).json({error: 'Socket inválido.'});
    try { return res.json(eventBus.authorizeChannel(req.body.socket_id, expected)); }
    catch { return res.status(503).json({error: 'Transporte indisponível. O atendimento continuará sendo atualizado.'}); }
  });
  app.get('/api/partner-portal/realtime', async (req, res) => {
    const session = await authenticate(req);
    if (!session) return res.status(401).json({error: 'Sessão do parceiro expirada.'});
    if (provider() !== 'sse') return res.status(204).end();
    const count = [...connections.values()].filter(c => c.tenantId === session.tenant.id && c.partnerId === session.partner.id).length;
    if (count >= 10) return res.status(429).end();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const id = randomUUID();
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const current = await getSession(req);
        if (!connections.has(id)) return;
        if (!current || current.tenant.id !== session.tenant.id || current.partner.id !== session.partner.id) { close(id); return; }
        res.write('event: ping\ndata: {}\n\n');
      } catch { close(id); }
      finally { checking = false; }
    }, 25000);
    timer.unref?.();
    connections.set(id, {tenantId: session.tenant.id, partnerId: session.partner.id, res, timer});
    res.write('event: connected\ndata: {}\n\n');
    req.on('close', () => close(id));
    req.on('aborted', () => close(id));
    res.on('close', () => close(id));
    res.on('error', () => close(id));
  });
}
