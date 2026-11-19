import type { ReviewedInssStatement } from './inssStatement';
import { estimateProjectedInssLoan, inssProjectedMargin } from './inssProjectedMargin';
import { parseCurrency } from './utils';

export type StatementQuoteSource = 'API' | 'PLANILHA';
export type StatementMarginQuote = {
  provider: string; institution: string; table: string;
  amount: number; installment: number | null; rate: number | null;
  term: number | null; source: StatementQuoteSource; review: boolean;
};
export type StatementPortQuote = StatementMarginQuote & {
  contractIndex: number; originBank: string; contractSuffix: string; destination: string;
};
export type StatementProjectedQuote = {
  provider: string; institution: string; monthlyRate: number; term: number; gross: number;
};
export type StatementAutoQuotes = {
  marginQuotes: StatementMarginQuote[];
  portabilityQuotes: StatementPortQuote[];
  projectedQuotes: StatementProjectedQuote[];
  notes: string[];
};
export type StatementProgress = {
  completed: number; total: number;
  quotes: StatementAutoQuotes;
};
export const emptyStatementQuotes = (): StatementAutoQuotes =>
  ({ marginQuotes: [], portabilityQuotes: [], projectedQuotes: [], notes: [] });

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const formatNote = (value: unknown) => String(value || 'Consulta indisponível.').slice(0,250);
const maxSupportedContracts = 40;

export async function simulateInssStatementComplete(
  statement: ReviewedInssStatement,
  signal: AbortSignal,
  request: typeof fetch = fetch,
  onProgress?: (progress: StatementProgress) => void,
): Promise<StatementAutoQuotes> {
  const result = emptyStatementQuotes();
  if (signal.aborted) return result;
  if (statement.contracts.length > maxSupportedContracts)
    throw new Error(`Este extrato contém mais de ${maxSupportedContracts} contratos. Não foi feita uma simulação parcial.`);

  const margin = parseCurrency(statement.loanMargin);
  const income = parseCurrency(statement.income);
  const base = {
    confirmedClientAuthorization: true,
    cpf: statement.customer.cpf,
    name: statement.customer.name,
    benefitNumber: statement.customer.benefitNumber,
    benefitType: Number(statement.customer.benefitType),
    birthDate: statement.customer.birthDate,
    benefitStartDate: statement.benefitStart,
    illiterate: statement.illiterate,
    legalRepresentative: statement.legalRepresentative === true,
    loanBlocked: statement.loanBlocked === true,
    loanMargin: margin,
    income: positive(income) ? income : null,
    term: 108,
  };

  type Task = { operation: 'NEW' | 'PORT_REFIN'; contractIndex?: number; body: Record<string,unknown> };
  const tasks: Task[] = [];
  if (positive(margin) && !statement.loanBlocked) tasks.push({ operation: 'NEW', body: { ...base, operation: 'NEW' } });
  for (const [contractIndex, contract] of statement.contracts.entries()) {
    const originalTerm = Number(contract.originalTerm);
    const remainingTerm = Number(contract.openedInstallmentNumber);
    const debt = parseCurrency(contract.lastDueBalance);
    const installment = parseCurrency(contract.installmentFaceValue);
    if (!Number.isInteger(originalTerm) || !Number.isInteger(remainingTerm) ||
        remainingTerm <= 0 || remainingTerm > originalTerm ||
        !positive(debt) || !positive(installment) || !/^\d{1,3}$/.test(contract.originLenderCode)) {
      result.notes.push(`Contrato ${contractIndex + 1}: dados incompletos; confira o extrato.`);
      continue;
    }
    tasks.push({
      operation: 'PORT_REFIN',
      contractIndex,
      body: { ...base, operation: 'PORT_REFIN', contract: {
        originBank: contract.originLenderCode,
        contractNumber: contract.originContractNumber,
        originalTerm, remainingTerm, debt, installment,
      } },
    });
  }

  let next = 0;
  let completed = 0;
  const snapshot = () => ({
    ...result,
    marginQuotes: [...result.marginQuotes],
    portabilityQuotes: [...result.portabilityQuotes],
    projectedQuotes: [...result.projectedQuotes],
    notes: [...result.notes],
  });
  const worker = async () => {
    while (next < tasks.length && !signal.aborted) {
      const task = tasks[next++];
      try {
        const response = await request('/api/inss/statement/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          signal,
          body: JSON.stringify(task.body),
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || `Consulta indisponível (HTTP ${response.status}).`);
        if (signal.aborted) break;
        const offers: StatementMarginQuote[] = (Array.isArray(data.offers) ? data.offers : [])
          .filter((offer: any) => positive(offer?.amount) && ['API','PLANILHA'].includes(offer?.source))
          .map((offer: any) => ({
            provider: String(offer.provider || ''),
            institution: String(offer.institution || offer.provider || ''),
            table: String(offer.table || 'Condição INSS'),
            amount: offer.amount,
            installment: positive(offer.installment) ? offer.installment : null,
            rate: positive(offer.rate) ? offer.rate : null,
            term: Number.isInteger(offer.term) && offer.term > 0 ? offer.term : null,
            source: offer.source as StatementQuoteSource,
            review: offer.review === true,
          }));

        if (task.operation === 'NEW') {
          result.marginQuotes.push(...offers);
          const forecast = inssProjectedMargin(statement.income, statement.loanMargin, statement.loanBlocked);
          if (forecast && !forecast.loanBlocked) for (const quote of offers) {
            if (!positive(quote.rate) || !quote.term) continue;
            const gross = estimateProjectedInssLoan(quote.rate, quote.term);
            if (gross !== null) result.projectedQuotes.push({
              provider: quote.provider, institution: quote.institution,
              monthlyRate: quote.rate, term: quote.term, gross,
            });
          }
        } else {
          const contractIndex = task.contractIndex!;
          const contract = statement.contracts[contractIndex];
          result.portabilityQuotes.push(...offers.map(quote => ({
            ...quote, contractIndex, originBank: contract.originLenderCode,
            contractSuffix: contract.originContractNumber.slice(-4),
            destination: quote.institution,
          })));
        }
        for (const note of Array.isArray(data.notices) ? data.notices : [])
          result.notes.push(`${task.operation === 'NEW' ? 'NOVO' : 'Contrato ' + (task.contractIndex! + 1)}: ${formatNote(note)}`);
        if (!offers.length && !(data.notices?.length))
          result.notes.push(task.operation === 'NEW' ? 'NOVO: nenhum banco retornou oferta.' : `Contrato ${task.contractIndex! + 1}: nenhuma oferta retornada.`);
      } catch (error) {
        if (!signal.aborted)
          result.notes.push(`${task.operation === 'NEW' ? 'NOVO' : 'Contrato ' + (task.contractIndex! + 1)}: ${formatNote(error instanceof Error ? error.message : error)}`);
      } finally {
        completed++;
        if (!signal.aborted) onProgress?.({ completed, total: tasks.length, quotes: snapshot() });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(tasks.length, 2) }, () => worker()));
  if (signal.aborted) return emptyStatementQuotes();
  return snapshot();
}
