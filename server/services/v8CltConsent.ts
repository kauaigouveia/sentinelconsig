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
  return v8CltOperation(db, c.tenant, c.promoter, ['AUTHORIZE', c.consult, c.policy.termsHash], async () => {
    await V8CltPilot.withinConsent(c.tenant, c.consult, async () => {
      if (!await V8CltSimulationService.ownsConsult(db, c.tenant, c.promoter, c.cpf, c.consult)) throw Error('CONSENT_UNAVAILABLE');
      const end = new Date(), query = new URLSearchParams({ startDate: new Date(end.getTime() - 30 * 86400000).toISOString(), endDate: end.toISOString(), limit: '50', page: '1', search: c.cpf, provider: 'QI' });
      const state = await V8CltSimulationService.request(db, c.tenant, c.promoter, `/private-consignment/consult?${query}`);
      const current = Array.isArray(state.data) ? state.data.find((item: any) => item.id === c.consult && String(item.documentNumber || '').replace(/\D/g, '') === c.cpf) : undefined;
      if (!current || !['WAITING_CONSENT', 'CONSENT_APPROVED', 'WAITING_CONSULT', 'WAITING_CREDIT_ANALYSIS', 'SUCCESS'].includes(current.status)) throw Error('CONSENT_UNAVAILABLE');
      if (current.status === 'WAITING_CONSENT') await V8CltSimulationService.request(db, c.tenant, c.promoter, `/private-consignment/consult/${c.consult}/authorize`, device);
      // Proof of the worker's act is distinct from the provider's HTTP response.
      await V8CltConsentAudit.record(db, c.tenant, c.promoter, c.cpf, c.consult, { ...evidence, observedBankStatus: current.status });
    });
    return [{ provider: 'V8 DIGITAL', institution: 'V8', state: 'PENDING', outcome: 'PENDING', message: 'Consentimento registrado. Atualize o acompanhamento para obter o estado do banco.' }];
  }, evidence);
}

export function registerV8NativeConsent(app: Express, db: any, context: (req: Request) => Promise<any>, service: CltJourneyService) {
  const path = '/api/simulations/clt/v8/consent/native';
  app.use(path, rateLimit({ windowMs: 60000, limit: 12, standardHeaders: true, legacyHeaders: false }));
  for (const action of ['prepare', 'accept'] as const) app.post(`${path}/${action}`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const actor = await context(req); if (actor.status) return res.status(actor.status).json({ error: actor.error || 'Acesso não autorizado.' });
      if (action === 'prepare') {
        const entry = typeof req.body.executionId === 'string' ? await service.get(db, actor.tenant, actor.actor, req.body.executionId) : undefined;
        const v8 = entry?.snapshot.results.v8?.rows.map(r => (r.data as any)?.v8).find(v => v?.consultId === req.body.consultId && v?.promoterId === req.body.promoterId);
        if (!entry?.snapshot.customer || entry.record.phase !== 'DONE' || !v8 || !['WAITING_CONSENT', 'CONSENT_APPROVED', 'WAITING_CONSULT', 'WAITING_CREDIT_ANALYSIS', 'SUCCESS'].includes(v8.status)) return res.status(404).json({ error: 'Consulta própria disponível para consentimento não encontrada.' });
        const policy = await V8CltContract.read(db, actor.tenant, v8.promoterId);
        if (!policy.nativeConsentReady) return res.status(409).json({ error: 'Somente /authorize está bloqueado: falta termo oficial vigente e requisitos documentais do aceite nativo. Não é exigido SMS, OTP ou link externo.' });
        const issued = await V8CltConsent.issue(db, actor.tenant, v8.promoterId, v8.consultId, { ...entry.snapshot.customer, bmgActorId: actor.actor });
        return res.json({ challengeToken: issued.path.split('#')[1], terms: policy.termsText, termsHash: policy.termsHash, version: policy.termsVersion, workerName: entry.snapshot.customer.name, consultId: v8.consultId });
      }
      const c = await V8CltConsent.read(db, req.body.challengeToken), b = req.body;
      if (!c.policy.nativeConsentReady || c.tenant !== actor.tenant || c.nativeActor !== actor.actor) return res.status(403).json({ error: 'Atendimento de consentimento não pertence à sessão e empresa atuais.' });
      const normalize = (s: unknown) => typeof s === 'string' ? s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') : '';
      const signature = b.signature;
      if (b.accepted !== true || b.workerTookControl !== true || b.termsHash !== c.policy.termsHash || normalize(b.workerName) !== normalize(c.workerName) || !Array.isArray(signature) || signature.length < 4 || signature.length > 512 || signature.some((p: any) => !Array.isArray(p) || p.length !== 2 || p.some((n: any) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) || new Set(signature.map((p: number[]) => p.join(':'))).size < 4 || !['mobile', 'desktop', 'tablet'].includes(b.deviceType) || ['operationalSystem', 'deviceModel', 'deviceName'].some(k => typeof b[k] !== 'string' || !b[k].trim() || b[k].length > 200) || !req.get('user-agent')) return res.status(400).json({ error: 'O trabalhador deve ler o termo, assumir os controles, preencher seu nome, assinar e informar os dados reais do dispositivo. Um checkbox do operador não registra consentimento.' });
      const device = { consult_id: c.consult, operationalSystem: b.operationalSystem, deviceModel: b.deviceModel, deviceName: b.deviceName, deviceType: b.deviceType };
      const rows = await authorizeWithEvidence(db, c, device, { method: 'NATIVE_ASSISTED_WORKER_SIGNATURE', independentlyVerifiedIdentity: false, operatorActor: actor.actor, presentedAt: c.presentedAt, acceptedAt: new Date().toISOString(), termsVersion: c.policy.termsVersion, termsHash: c.policy.termsHash, workerName: c.workerName, signature, device, userAgentHash: createHash('sha256').update(req.get('user-agent')!).digest('hex') });
      return res.json({ status: 'CONSENT_APPROVED', message: rows[0].message });
    } catch { return res.status(409).json({ error: 'Consentimento indisponível ou resultado incerto. Confira o acompanhamento; /authorize não será repetido automaticamente.' }); }
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
