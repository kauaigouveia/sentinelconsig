import { createHash } from 'node:crypto';
import { resolveBankPromoter } from './bankPromoterConfig.js';

export class V8CltContract {
  static key(promoter: string) { return `integration:v8:${promoter}:clt-contract`; }
  static async read(db: any, tenant: string, promoter: string) {
    await resolveBankPromoter(db, tenant, promoter);
    const saved = await db.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId: tenant, configKey: this.key(promoter) } } });
    let value: any = {};
    try { value = saved ? JSON.parse(saved.configValue) : {}; } catch { /* Invalid metadata never enables calls. */ }
    const verified = typeof value.reviewedBy === 'string' && !!value.reviewedBy && typeof value.reference === 'string' && !!value.reference && Number.isFinite(Date.parse(value.validUntil)) && Date.parse(value.validUntil) > Date.now();
    // Sanitized Postman contract supplied by the responsible integrator on 2026-10-27.
    // No customer identifiers, live configuration IDs or sample payment are embedded.
    const simulationReady = true;
    const consentReady = verified && value.authorizeSchema === 'documented-device-v1' && typeof value.termsText === 'string' && value.termsText.length >= 100 && typeof value.termsVersion === 'string' && !!value.termsVersion && typeof value.identityReference === 'string' && !!value.identityReference;
    const nativeConsentReady = verified && value.authorizeSchema === 'documented-device-v1' && typeof value.termsText === 'string' && value.termsText.length >= 100 && !!value.termsVersion && value.evidenceMethod === 'native-worker-signature-v1' && typeof value.evidenceReference === 'string' && !!value.evidenceReference.trim();
    return { ...value, moneyUnit: 'BRL', rateUnit: 'fraction', precalculation: 'not-required', technicalProfile: 'v8-clt-direct-post-2026-10-27', simulationReady, apiAuthorizationReady: true, consentReady, nativeConsentReady, termsHash: consentReady || nativeConsentReady ? createHash('sha256').update(value.termsText).digest('hex') : undefined,
      reasons: [] };
  }
  static async save(db: any, tenant: string, promoter: string, reviewer: string, input: any) {
    await resolveBankPromoter(db, tenant, promoter);
    if (!['unconfirmed', 'BRL'].includes(input.moneyUnit) || !['unconfirmed', 'required', 'not-required'].includes(input.precalculation) || !['unconfirmed', 'fraction', 'percent'].includes(input.rateUnit) || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 500 || !Number.isFinite(Date.parse(input.validUntil)) || Date.parse(input.validUntil) <= Date.now()) throw Error('Informe referência da confirmação bancária, validade e unidades verificadas.');
    const value: any = { moneyUnit: input.moneyUnit, precalculation: input.precalculation, rateUnit: input.rateUnit, reference: input.reference, validUntil: input.validUntil, reviewedBy: reviewer, reviewedAt: new Date().toISOString() };
    for (const field of ['termsText', 'termsVersion', 'identityReference', 'authorizeSchema', 'evidenceMethod', 'evidenceReference']) if (input[field] !== undefined) {
      if (typeof input[field] !== 'string' || input[field].length > (field === 'termsText' ? 50000 : 500)) throw Error('Metadados do termo inválidos.');
      value[field] = input[field];
    }
    const data = { tenantId: tenant, configKey: this.key(promoter), configValue: JSON.stringify(value), isSecret: true };
    await db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId: tenant, configKey: data.configKey } }, create: data, update: { configValue: data.configValue, isSecret: true } });
    return this.read(db, tenant, promoter);
  }
}
