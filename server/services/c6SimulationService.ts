import type { PrismaClient } from '@prisma/client';
import { C6BankService } from './c6BankService.js';
import { c6ConditionEligible } from '../../src/lib/c6Eligibility.js';

export class C6SimulationService {
  static async inss(prisma: PrismaClient, tenantId: string, input: any) {
    const config = await C6BankService.getTenantConfig(prisma, tenantId);
    if (!config.isConfigured) return [];
    const settings = await prisma.systemConfig.findMany({ where: { tenantId, configKey: { in: ['c6_bank_promoter_code', 'c6_bank_simulation_enabled'] } } });
    const values = new Map(settings.map(row => [row.configKey, row.configValue]));
    if (values.get('c6_bank_simulation_enabled') !== 'true') return [];
    if (!['NEW', 'REFIN'].includes(input.operation)) throw new Error('O manual C6 disponível não documenta portabilidade.');
    const promoterCode = values.get('c6_bank_promoter_code');
    if (!promoterCode) throw new Error('Cadastre o código de promotora na configuração C6.');
    if (!(Number(input.income) > 0)) throw new Error('Informe a renda mensal para simular no C6.');
    if (input.operation === 'REFIN' && !input.c6Contract) throw new Error('Informe o contrato C6 para refinanciamento.');
    const token = await C6BankService.getAccessToken(prisma, tenantId);
    const payload = {
      operation_type: input.operation === 'NEW' ? 'NOVA' : 'REFINANCIAMENTO',
      product_type_code: input.operation === 'NEW' ? '0001' : '0002',
      simulation_type: ['Payment', 'INSTALLMENT'].includes(input.mode) ? 'POR_VALOR_PARCELA' : 'POR_VALOR_SOLICITADO',
      formalization_subtype: 'DIGITAL_WEB', promoter_code: promoterCode,
      covenant_group: 'INSS', public_agency: '000001', installment_quantity: Number(input.term),
      ...(['Payment', 'INSTALLMENT'].includes(input.mode) ? { installment_amount: Number(input.value) } : { requested_amount: Number(input.value) }),
      client: { tax_identifier: String(input.cpf || '').replace(/\D/g, ''), enrollment: String(input.benefitNumber || ''), birth_date: input.birthDate, income_amount: Number(input.income) },
      ...(input.operation === 'REFIN' ? { refinancing_contracts: [String(input.c6Contract)] } : {}),
    };
    const response = await fetch(`${config.baseUrl}/marketplace/proposal/simulation`, { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/vnd.c6bank_error_data_v2+json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000), redirect: 'error' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.error || data.errors) throw new Error(`C6 não concluiu a simulação (HTTP ${response.status}).`);
    const conditions = Array.isArray(data.credit_conditions) ? data.credit_conditions : Array.isArray(data) ? data : data.covenant ? [data] : [];
    return conditions.filter(condition => c6ConditionEligible(condition, input.benefitType)).map(condition => ({
      provider: 'C6', institution: 'C6 BANK', state: 'OFFER',
      id: `c6-${condition.covenant?.code}-${condition.product?.code}-${condition.installment_quantity}`,
      tableCode: String(condition.covenant?.code || ''), tableName: condition.covenant?.description,
      name: condition.covenant?.description,
      amount: Number(condition.client_amount), contractAmount: Number(condition.principal_amount),
      installment: Number(condition.installment_amount), term: Number(condition.installment_quantity), rate: Number(condition.monthly_customer_rate),
      raw: condition,
    }));
  }
}
