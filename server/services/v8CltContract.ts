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
    const simulationReady = verified && value.moneyUnit === 'BRL' && value.precalculation === 'not-required';
    const consentReady = verified && value.authorizeSchema === 'documented-device-v1' && typeof value.termsText === 'string' && value.termsText.length >= 100 && typeof value.termsVersion === 'string' && !!value.termsVersion && typeof value.identityReference === 'string' && !!value.identityReference;
    return { ...value, simulationReady, consentReady, termsHash: consentReady ? createHash('sha256').update(value.termsText).digest('hex') : undefined,
      reasons: [...(!verified ? ['Contrato técnico vigente ainda não validado.'] : []), ...(value.moneyUnit !== 'BRL' ? ['Unidade monetária CLT não confirmada como BRL.'] : []), ...(value.precalculation !== 'not-required' ? [value.precalculation === 'required' ? 'Pré-cálculo exigido: falta mapear o contrato autenticado antes de simular.' : 'Dependência do pré-cálculo não confirmada.'] : []), ...(!consentReady ? ['Termo vigente, evidências de aceite e verificador do trabalhador pendentes.'] : [])] };
  }
  static async save(db: any, tenant: string, promoter: string, reviewer: string, input: any) {
    await resolveBankPromoter(db, tenant, promoter);
    if (!['unconfirmed', 'BRL'].includes(input.moneyUnit) || !['unconfirmed', 'required', 'not-required'].includes(input.precalculation) || !['unconfirmed', 'fraction', 'percent'].includes(input.rateUnit) || typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 500 || !Number.isFinite(Date.parse(input.validUntil)) || Date.parse(input.validUntil) <= Date.now()) throw Error('Informe referência da confirmação bancária, validade e unidades verificadas.');
    const value: any = { moneyUnit: input.moneyUnit, precalculation: input.precalculation, rateUnit: input.rateUnit, reference: input.reference, validUntil: input.validUntil, reviewedBy: reviewer, reviewedAt: new Date().toISOString() };
    for (const field of ['termsText', 'termsVersion', 'identityReference', 'authorizeSchema']) if (input[field] !== undefined) {
      if (typeof input[field] !== 'string' || input[field].length > (field === 'termsText' ? 50000 : 500)) throw Error('Metadados do termo inválidos.');
      value[field] = input[field];
    }
    const data = { tenantId: tenant, configKey: this.key(promoter), configValue: JSON.stringify(value), isSecret: true };
    await db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId: tenant, configKey: data.configKey } }, create: data, update: { configValue: data.configValue, isSecret: true } });
    return this.read(db, tenant, promoter);
  }
}
