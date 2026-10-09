import { ageAt } from '../../src/lib/inssEligibility';
export function inssSimulationDraft(body: any) {
  const client = body.customerData;
  const condition = body.selectedCondition;
  if (!client || typeof client.birthDate !== 'string' || ageAt(client.birthDate) === null || !/^\d{1,20}$/.test(client.benefitNumber || '') || !Number.isInteger(client.benefitType) || client.benefitType <= 0) throw new Error('Informe nascimento, benefício e espécie válidos.');
  if (!condition || !['FINANTO', 'Nossa Fintech', 'FACTA'].includes(condition.provider) || !String(condition.tableId || '').trim() || !String(condition.tableName || '').trim() || !Number.isInteger(condition.term) || condition.term <= 0 || condition.term > 120 || (condition.rate != null && (!Number.isFinite(condition.rate) || condition.rate <= 0)) || (condition.installment != null && (!Number.isFinite(condition.installment) || condition.installment <= 0)) || !Number.isFinite(condition.amount) || condition.amount <= 0) throw new Error('Selecione uma condição válida antes de salvar a simulação.');
  if (!['NEW', 'PORT', 'REFIN', 'PORT_REFIN'].includes(body.operationType)) throw new Error('Modalidade INSS inválida.');
  const text = (value: unknown, limit = 200) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const fields = (value: any, keys: string[]) => Object.fromEntries(keys.map(key => [key, text(value?.[key])]));
  return {
    customerData: { birthDate: client.birthDate, benefitNumber: client.benefitNumber, benefitType: client.benefitType, name: text(client.name), hasInsurance: client.hasInsurance === true, legalRepresentative: client.legalRepresentative === true,
      ...(client.refinancing ? { refinancing: fields(client.refinancing, ['term', 'rate', 'additionalInstallment']) } : {}),
      ...(client.originContract ? { originContract: fields(client.originContract, ['key', 'lenderCode', 'contractNumber', 'term', 'installmentsRemaining', 'installmentValue', 'dueBalanceValue']) } : {}),
      ...(client.address ? { phone: text(client.phone), email: text(client.email), income: text(client.income), benefitState: text(client.benefitState, 2), benefitStartDate: text(client.benefitStartDate), address: fields(client.address, ['street', 'number', 'complement', 'district', 'city', 'state', 'zipCode']), document: fields(client.document, ['type', 'number', 'issuingDate', 'issuingEntity', 'issuingState']), creditBankAccount: fields(client.creditBankAccount, ['bank', 'branch', 'number', 'digit']) } : {}),
    },
    selectedCondition: { provider: condition.provider, tableId: String(condition.tableId).slice(0, 100), tableName: String(condition.tableName).slice(0, 300), amount: condition.amount, installment: condition.installment ?? null, term: condition.term, rate: condition.rate ?? null, ...(condition.portabilityCode ? { portabilityCode: String(condition.portabilityCode).slice(0, 100) } : {}) },
  };
}
