import { paidFromTerms } from '../../src/lib/portabilityEligibility.js';
import { simulationPortabilityCheck } from '../../src/lib/portabilitySimulationPolicy.js';
import { type DaycovalWorkbook, parseDate } from './daycovalWorkbook.js';
import { calculatePortRefin, SPREADSHEET_MODELS } from './portRefinWorkbooks.js';

type AutomaticDaycovalWorkbook = DaycovalWorkbook & { validFrom?: string; validUntil?: string };

/** Server-only preflight. Upload date and filename are not proof of commercial validity. */
export function prepareDaycovalWorkbook(book: AutomaticDaycovalWorkbook | null, input: any, today: string) {
  const pending = (code: string, reason: string) => ({ ready: false as const, code, reason, result: null });
  if (!book || book.enabled === false) return pending('WORKBOOK_UNAVAILABLE', 'Planilha Daycoval ausente ou desativada para a empresa.');
  if (input.product !== 'INSS' || input.operation !== 'PORT_REFIN') return pending('WORKBOOK_OPERATION_UNSUPPORTED', 'O calculador disponível atende INSS Portabilidade + Refinanciamento.');
  if (book.formulaHash !== SPREADSHEET_MODELS.DAYCOVAL.hash) return pending('WORKBOOK_INCOMPATIBLE', 'A estrutura de fórmulas não corresponde ao modelo Daycoval homologado no código.');
  const validity = book;
  try {
    parseDate(today);
    if (!validity.validFrom || !validity.validUntil) return pending('WORKBOOK_VALIDITY_UNCONFIRMED', 'Falta comprovar a vigência comercial da planilha Daycoval; data de importação não comprova vigência.');
    parseDate(validity.validFrom); parseDate(validity.validUntil);
    if (validity.validFrom > validity.validUntil || today < validity.validFrom || today > validity.validUntil) return pending('WORKBOOK_OUTSIDE_VALIDITY', 'Planilha Daycoval fora da vigência informada.');
  } catch { return pending('WORKBOOK_VALIDITY_UNCONFIRMED', 'Datas de vigência da planilha Daycoval inválidas.'); }
  const numeric = [input.debt, input.originalInstallment, input.remainingTerm, input.originalTerm, input.term];
  if (numeric.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0) ||
      !Number.isInteger(input.remainingTerm) || !Number.isInteger(input.originalTerm) || !Number.isInteger(input.term) ||
      input.originalTerm < input.remainingTerm || !input.originalBank || !input.birthDate || !input.benefitType ||
      input.value != null && (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < input.originalInstallment)) {
    return pending('WORKBOOK_DATA_PENDING', 'Revise nascimento, espécie, banco de origem, saldo, parcela original, prazo original, prazo restante e prazo de refinanciamento. Redução de parcela requer cálculo específico.');
  }
  try { parseDate(input.birthDate); } catch { return pending('WORKBOOK_DATA_PENDING', 'Informe nascimento válido.'); }
  const check = simulationPortabilityCheck('daycoval', { ...input, simulationDate: today });
  if (check.blocked) return pending('DOCUMENTARY_BLOCK', check.reason);
  // Preserve all review metadata, instead of dropping it when adapting the shared form.
  const calculationInput = { ...input, simulationDate: today, refinanceRate: input.rate,
    contracts: [{ originBank: input.originalBank, paidInstallments: paidFromTerms(input.originalTerm, input.remainingTerm),
      balance: input.debt, installment: input.originalInstallment, remaining: input.remainingTerm }],
    additionalMargin: input.value == null ? 0 : input.value - input.originalInstallment };
  try {
    const result = calculatePortRefin('DAYCOVAL', book, calculationInput);
    if (!result.offers.some(offer => offer.eligible && Number.isFinite(offer.amount) && offer.amount > 0)) {
      return pending(result.offers.some(offer => offer.policyStatus === 'PENDENTE DE DADOS') ? 'DOCUMENTARY_PENDING' : 'WORKBOOK_NO_OFFERS',
        result.offers.map(offer => offer.status).filter(Boolean).join(' · ') || 'A planilha não retornou condições elegíveis.');
    }
    return { ready: true as const, code: 'WORKBOOK_READY', reason: '', result };
  } catch {
    // Formula/cell contents are not exposed as public error messages.
    return pending('WORKBOOK_CALCULATION_UNAVAILABLE', 'A planilha não conseguiu calcular os dados e o prazo informados. Verifique compatibilidade das fórmulas, idade, prazo e tabelas.');
  }
}
