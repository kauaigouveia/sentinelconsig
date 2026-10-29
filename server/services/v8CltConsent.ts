import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { V8CltContract } from './v8CltContract.js';
import { V8CltSimulationService } from './v8CltSimulationService.js';
import { V8CltPilot } from './v8CltPilot.js';
import { CltJourneyStore, journeyFingerprint, type JourneyRecord } from './cltJourneyStore.js';
import { v8CltOperation } from './v8CltOperation.js';
import { V8CltConsentAudit } from './v8CltConsentAudit.js';
import type { CltJourneyService } from './cltJourneyService.js';
import type { ProductSimulationInput } from './productSimulationService.js';

type WorkerScope = { tenant: string; promoter: string; cpf: string; consult: string };
// Only a server-side verified identity adapter can supply this proof; JSON/cookies
// from the operator are never treated as a worker identity assertion.
export type WorkerIdentityVerifier = (req: Request, scope: WorkerScope) => Promise<{ cpf: string; subject: string; method: string; verifiedAt: number } | null>;
export class V8CltConsent {
  static async issue(db: any, tenant: string, promoter: string, consult: string, input: ProductSimulationInput) {
    const policy = await V8CltContract.read(db, tenant, promoter);
    if (!(policy.consentReady || policy.nativeConsentReady) || !await V8CltSimulationService.ownsConsult(db, tenant, promoter, input.cpf, consult)) throw Error('Termo vigente ou vínculo da consulta não confirmado.');
    const nonce = randomBytes(32).toString('base64url'), expires = Date.now() + 30 * 60000;
    const payload = Buffer.from(JSON.stringify({ tenant, promoter, nonce, expires })).toString('base64url');
    const token = payload + '.' + journeyFingerprint(['v8-worker', payload]);
    const record: JourneyRecord = { fingerprint: journeyFingerprint(['v8-consent-link', promoter, consult, policy.termsHash, input.bmgActorId || null]), phase: 'READY', deadline: expires, snapshot: { executionId: nonce, running: false, customer: input, banks: [], results: { v8: { status: 'RETURNED', rows: [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING', data: { v8: { consultId: consult, promoterId: promoter }, termsHash: policy.termsHash } }] } } } };
    await new CltJourneyStore(db, tenant, 'worker:v8').create(nonce, record);
    return { path: `/consentimento-v8#${token}`, expiresAt: new Date(expires).toISOString() };
  }
  static async read(db: any, token: unknown) {
    if (typeof token !== 'string' || token.length > 2000) throw Error('CONSENT_UNAVAILABLE');
    const [payload, signature, extra] = token.split('.'), expected = journeyFingerprint(['v8-worker', payload]);
    if (extra || !/^[a-f\d]{64}$/.test(signature || '') || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) throw Error('CONSENT_UNAVAILABLE');
    const scope = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof scope.tenant !== 'string' || typeof scope.promoter !== 'string' || typeof scope.nonce !== 'string' || scope.expires <= Date.now()) throw Error('CONSENT_UNAVAILABLE');
    const saved = await new CltJourneyStore(db, scope.tenant, 'worker:v8').read(scope.nonce);
    if (!saved || saved.record.deadline <= Date.now() || !saved.record.snapshot.customer) throw Error('CONSENT_UNAVAILABLE');
    const row: any = saved.record.snapshot.results.v8.rows[0], policy = await V8CltContract.read(db, scope.tenant, scope.promoter);
    if (!(policy.consentReady || policy.nativeConsentReady) || policy.termsHash !== row.data.termsHash || row.data.v8.promoterId !== scope.promoter) throw Error('CONSENT_UNAVAILABLE');
    return { tenant: scope.tenant, promoter: scope.promoter, cpf: saved.record.snapshot.customer.cpf, workerName: saved.record.snapshot.customer.name, nativeActor: saved.record.snapshot.customer.bmgActorId, presentedAt: new Date(saved.record.deadline - 30 * 60000).toISOString(), consult: row.data.v8.consultId, policy };
  }
}

async function authorizeWithEvidence(db: any, c: WorkerScope & { policy: any }, device: any, evidence: any) {
  if (await V8CltConsentAudit.recorded(db, c.tenant, c.promoter, c.cpf, c.consult)) return [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING' as const, outcome: 'PENDING' as const, message: 'Autorização já registrada. Atualize o acompanhamento; nenhum POST foi repetido.' }];
  return v8CltOperation(db, c.tenant, c.promoter, ['AUTHORIZE', c.consult], async () => {
    await V8CltPilot.withinConsent(c.tenant, c.consult, async () => {
      if (!await V8CltSimulationService.ownsConsult(db, c.tenant, c.promoter, c.cpf, c.consult)) throw Error('CONSENT_UNAVAILABLE');
      const end = new Date(), query = new URLSearchParams({ startDate: new Date(end.getTime() - 30 * 86400000).toISOString(), endDate: end.toISOString(), limit: '50', page: '1', search: c.cpf, provider: 'QI' });
      let current: any;
      for (let page = 1; page <= 10; page++) {
        query.set('page', String(page));
        const state = await V8CltSimulationService.request(db, c.tenant, c.promoter, `/private-consignment/consult?${query}`);
        if (!Array.isArray(state.data)) throw Error('CONSULT_UNAVAILABLE');
        current = state.data.find((item: any) => item.id === c.consult && String(item.documentNumber || '').replace(/\D/g, '') === c.cpf);
        if (current || !state.pages?.hasNext) break;
      }
      if (!current || !['WAITING_CONSENT', 'CONSENT_APPROVED', 'WAITING_CONSULT', 'WAITING_CREDIT_ANALYSIS', 'SUCCESS'].includes(current.status)) throw Error('CONSENT_UNAVAILABLE');
      if (current.status === 'WAITING_CONSENT') await V8CltSimulationService.request(db, c.tenant, c.promoter, `/private-consignment/consult/${c.consult}/authorize`, device);
      // Preserve whether this was a bank API operation or a separately collected human act.
      await V8CltConsentAudit.record(db, c.tenant, c.promoter, c.cpf, c.consult, { ...evidence, processedAt: new Date().toISOString(), authorizationAction: current.status === 'WAITING_CONSENT' ? 'POST_AUTHORIZE' : 'OBSERVED_BANK_AUTHORIZED', observedBankStatus: current.status });
    });
    return [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING', outcome: 'PENDING', message: 'Autorização processada pela API V8. Atualize o acompanhamento para obter o estado do banco.' }];
  }, evidence);
}

// Bank-mediated authorization confirmed by the integration owner. This records
// the API operation, never a fabricated signature or an independently verified person.
export function registerV8ApiAuthorization(app: Express, db: any, context: (req: Request) => Promise<any>, service: CltJourneyService) {
  const path = '/api/simulations/clt/v8/authorize';
  app.use(path, rateLimit({ windowMs: 60000, limit: 12, standardHeaders: true, legacyHeaders: false }));
  app.post(path, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const actor = await context(req); if (actor.status) return res.status(actor.status).json({ error: actor.error || 'Acesso não autorizado.' });
      const b = req.body || {};
      const entry = typeof b.executionId === 'string' ? await service.get(db, actor.tenant, actor.actor, b.executionId) : undefined;
      const v8 = {consultId:b.consultId,promoterId:b.promoterId};
      if (!entry?.snapshot.customer || !['DONE','UNKNOWN'].includes(entry.record.phase) || !entry.snapshot.banks.some(bank=>bank.id==='v8') || typeof b.consultId!=='string' || typeof b.promoterId!=='string' || !await V8CltSimulationService.ownsConsult(db,actor.tenant,b.promoterId,entry.snapshot.customer.cpf,b.consultId)) return res.status(404).json({ error: 'Consulta própria disponível para autorização não encontrada.' });
      if (!['mobile', 'desktop', 'tablet'].includes(b.deviceType) || ['operationalSystem', 'deviceModel', 'deviceName'].some(k => typeof b[k] !== 'string' || !b[k].trim() || b[k].length > 200) || !req.get('user-agent')) return res.status(400).json({ error: 'Informe os dados reais do dispositivo utilizado para autorizar a consulta.' });
      const permit = await V8CltPilot.authorize(db, actor.tenant, { ...entry.snapshot.customer, bmgActorId: actor.actor });
      if ('reason' in permit) return res.status(403).json({ error: 'Sem permissão operacional V8 nesta empresa.' });
      const device = { consult_id: v8.consultId, operationalSystem: b.operationalSystem, deviceModel: b.deviceModel, deviceName: b.deviceName, deviceType: b.deviceType };
      const rows = await authorizeWithEvidence(db, { tenant: actor.tenant, promoter: v8.promoterId, cpf: entry.snapshot.customer.cpf, consult: v8.consultId, policy: { authorizationMode: 'bank-api' } }, device, { method: 'BANK_API_AUTHORIZATION', authorizationSource: 'V8_AUTHORIZE', humanAcceptanceCollected: false, independentlyVerifiedIdentity: false, operatorActor: actor.actor, requestedAt: new Date().toISOString(), deviceDescriptionMode:b.automatic===true?'environment-description':'operator-provided',deviceIsHardwareIdentity:false, device, userAgentHash: createHash('sha256').update(req.get('user-agent')!).digest('hex') });
      return res.json({ authorizationRecorded: true, message: rows[0].message });
    } catch { return res.status(409).json({ error: 'Autorização indisponível ou resultado incerto. Confira o acompanhamento; /authorize não será repetido automaticamente.' }); }
  });
}
export function registerV8WorkerConsent(app: Express, db: any, getOperatorSession: (req: Request) => Promise<any>, verifyIdentity: WorkerIdentityVerifier = async () => null) {
  const path = '/api/public/v8/clt/consent';
  app.use(path, rateLimit({ windowMs: 60000, limit: 12, standardHeaders: true, legacyHeaders: false }));
  for (const action of ['view', 'accept'] as const) app.post(`${path}/${action}`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const c = await V8CltConsent.read(db, req.body?.token), proof = await verifyIdentity(req, c);
      const verified = proof && proof.cpf === c.cpf && !!proof.subject && !!proof.method && Number.isFinite(proof.verifiedAt) && Date.now() - proof.verifiedAt >= 0 && Date.now() - proof.verifiedAt < 10 * 60000;
      if (action === 'view') return res.json({ consultId: c.consult, terms: c.policy.termsText, version: c.policy.termsVersion, termsHash: c.policy.termsHash, workerVerified: !!verified });
      if ((await getOperatorSession(req))?.user || !verified) return res.status(403).json({ error: 'Identificação independente do trabalhador necessária. A sessão do operador não pode registrar aceite.' });
      const b = req.body;
      if (b.accepted !== true || b.termsHash !== c.policy.termsHash || !['mobile', 'desktop', 'tablet'].includes(b.deviceType) || ['operationalSystem', 'deviceModel', 'deviceName'].some(k => typeof b[k] !== 'string' || !b[k].trim() || b[k].length > 200) || !req.get('user-agent')) return res.status(400).json({ error: 'Confirme o termo vigente e os dados reais do seu dispositivo.' });
      const device = { consult_id: c.consult, operationalSystem: b.operationalSystem, deviceModel: b.deviceModel, deviceName: b.deviceName, deviceType: b.deviceType };
      const rows = await authorizeWithEvidence(db, c, device, { termsVersion: c.policy.termsVersion, termsHash: c.policy.termsHash, acceptedAt: new Date().toISOString(), subject: journeyFingerprint(['worker', proof!.subject]), identityMethod: proof!.method, identityVerifiedAt: proof!.verifiedAt, device, userAgentHash: createHash('sha256').update(req.get('user-agent')!).digest('hex') });
      return res.json({ status: 'CONSENT_APPROVED', message: rows[0].message });
    } catch { return res.status(409).json({ error: 'Consentimento indisponível ou resultado incerto. Confira o estado; nenhuma repetição automática será feita.' }); }
  });
}
