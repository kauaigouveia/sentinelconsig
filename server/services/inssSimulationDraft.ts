import { ageAt } from '../../src/lib/inssEligibility';
export function inssSimulationDraft(body: any) {
  const client = body.customerData;
  const condition = body.selectedCondition;
  if (!client || typeof client.birthDate !== 'string' || ageAt(client.birthDate) === null || !/^\d{1,20}$/.test(client.benefitNumber || '') || !Number.isInteger(client.benefitType) || client.benefitType <= 0) throw new Error('Informe nascimento, benefício e espécie válidos.');
  const spreadsheetProviders = ['DAYCOVAL', 'C6_PLANILHA', 'PARANA_PLANILHA'];
  const spreadsheet = spreadsheetProviders.includes(condition?.provider);
  if (!condition || !['FINANTO', 'Nossa Fintech', 'FACTA', 'Paraná Banco', 'C6', ...spreadsheetProviders].includes(condition.provider) || !String(condition.tableId || '').trim() || !String(condition.tableName || '').trim() || !Number.isInteger(condition.term) || condition.term <= 0 || condition.term > 120 || (condition.rate != null && (!Number.isFinite(condition.rate) || condition.rate <= 0)) || (condition.installment != null && (!Number.isFinite(condition.installment) || condition.installment <= 0)) || !Number.isFinite(condition.amount) || condition.amount <= 0) throw new Error('Selecione uma condição válida antes de salvar a simulação.');
  if (!['NEW', 'PORT', 'REFIN', 'PORT_REFIN'].includes(body.operationType)) throw new Error('Modalidade INSS inválida.');
  // Spreadsheet calculations are estimates for documented review; never reclassify as approved API offers.
  if (spreadsheet && (body.operationType !== 'PORT_REFIN' || condition.quoteKind !== 'SPREADSHEET_ESTIMATE')) throw new Error('Cotação por planilha disponível somente para Portabilidade + Refinanciamento e deve permanecer como estimativa para conferência.');
  if (condition.provider === 'C6' && !['NEW', 'REFIN'].includes(body.operationType)) throw new Error('C6 via API aceita somente Novo e Refinanciamento. Use a planilha para portabilidade.');
  if (condition.provider === 'Paraná Banco' && (body.operationType !== 'NEW' || !condition.promoterId || !['homologation', 'production'].includes(condition.environment) || !Number.isFinite(Date.parse(condition.expiresAt)) || Date.parse(condition.expiresAt) <= Date.now())) throw new Error('Oferta Paraná vencida ou sem conexão de origem. Consulte novamente.');
  const text = (value: unknown, limit = 200) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const fields = (value: any, keys: string[]) => Object.fromEntries(keys.map(key => [key, text(value?.[key])]));
  return {
    customerData: { birthDate: client.birthDate, benefitNumber: client.benefitNumber, benefitType: client.benefitType, name: text(client.name), hasInsurance: condition.provider === 'Paraná Banco' ? condition.hasInsurance === true : client.hasInsurance === true, legalRepresentative: client.legalRepresentative === true,
      ...(client.refinancing ? { refinancing: fields(client.refinancing, ['term', 'rate', 'additionalInstallment']) } : {}),
      ...(client.originContract ? { originContract: fields(client.originContract, ['key', 'lenderCode', 'contractNumber', 'term', 'installmentsRemaining', 'installmentValue', 'dueBalanceValue']) } : {}),
      ...(Array.isArray(client.originContracts) && spreadsheet ? { originContracts: client.originContracts.slice(0,3).map((contract:any) =>
        fields(contract, ['lenderCode', 'contractNumber', 'term', 'installmentsRemaining', 'installmentValue', 'dueBalanceValue'])) } : {}),
      ...(spreadsheet || condition.reviewRequired === true ? { quoteReview: { required: true, status: 'PENDING', message: 'Cotação estimada por planilha, aguardando conferência comercial e documental. Não constitui aprovação bancária.' } } : {}),
      ...(client.address ? { phone: text(client.phone), email: text(client.email), income: text(client.income), benefitState: text(client.benefitState, 2), benefitStartDate: text(client.benefitStartDate), address: fields(client.address, ['street', 'number', 'complement', 'district', 'city', 'state', 'zipCode']), document: fields(client.document, ['type', 'number', 'issuingDate', 'issuingEntity', 'issuingState']), creditBankAccount: fields(client.creditBankAccount, ['bank', 'branch', 'number', 'digit']) } : {}),
    },
    selectedCondition: { provider: condition.provider, tableId: String(condition.tableId).slice(0, 100), tableName: String(condition.tableName).slice(0, 300), amount: condition.amount, installment: condition.installment ?? null, term: condition.term, rate: condition.rate ?? null, ...(spreadsheet ? { quoteKind: 'SPREADSHEET_ESTIMATE' as const, reviewRequired: true, reviewState: 'PENDING' as const, ...(typeof condition.sourceVersionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(condition.sourceVersionDate) ? { sourceVersionDate: condition.sourceVersionDate } : {}) } : condition.reviewRequired === true ? {reviewRequired: true, reviewState: 'PENDING' as const} : {}), ...(condition.provider === 'Paraná Banco' ? { promoterId: String(condition.promoterId).slice(0, 100), environment: condition.environment, expiresAt: condition.expiresAt, hasInsurance: condition.hasInsurance === true } : {}), ...(condition.portabilityCode ? { portabilityCode: String(condition.portabilityCode).slice(0, 100) } : {}) },
  };
}
