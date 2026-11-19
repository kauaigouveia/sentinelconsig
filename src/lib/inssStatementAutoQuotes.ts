import type { InssStatement } from './inssStatement';
import { getNossaFintechNovoAmount } from './nossaFintech';
import { paidFromTerms, portabilityEligibility } from './portabilityEligibility';
import { parseCurrency } from './utils';

/**
 * Cotações informativas disparadas pelo anexo do extrato.
 * O NOVO consulta apenas as tabelas sem CPF; a PORT consulta as planilhas locais
 * já configuradas pela empresa. Não cria proposta, autoriza cliente ou contrata.
 */
export type StatementPortQuote = {
  contractIndex: number;
  originBank: string;
  destination: 'DAYCOVAL' | 'C6' | 'PARANA';
  table: string;
  amount: number;
  term: number;
  installment: number | null;
  rate: number | null;
};
export type StatementMarginQuote = { table: string; amount: number };
export type StatementAutoQuotes = {
  marginQuotes: StatementMarginQuote[];
  portabilityQuotes: StatementPortQuote[];
  notes: string[];
};
type Destination = StatementPortQuote['destination'];
const targets: { bank: Destination; policy: string; route: string }[] = [
  { bank: 'DAYCOVAL', policy: 'daycoval', route: '/api/daycoval/calculate' },
  { bank: 'C6', policy: 'c6', route: '/api/c6-spreadsheet/calculate' },
  { bank: 'PARANA', policy: 'parana', route: '/api/parana-spreadsheet/calculate' },
];

export async function simulateInssStatementOnUpload(
  statement: InssStatement,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<StatementAutoQuotes> {
  const result: StatementAutoQuotes = { marginQuotes: [], portabilityQuotes: [], notes: [] };
  if (signal.aborted) return result;
  const notes = new Set<string>();
  const post = (url: string, body: unknown) => request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const margin = parseCurrency(statement.loanMargin);
  const marginTask = (async () => {
    if (statement.loanBlocked || margin == null || !Number.isFinite(margin) || margin <= 0 || signal.aborted) return;
    try {
      const response = await post('/api/integrations/nossa-fintech/inss/novo/simulate-all', {
        numberOfInstallments: 108,
        mode: 'INSTALLMENT',
        value: margin,
        legalRepresentative: statement.legalRepresentative,
        birthDate: statement.customer.birthDate,
        benefitType: Number(statement.customer.benefitType),
      });
      const body = await response.json();
      if (!response.ok || body.success === false) throw Error(body.error || body.data?.message || 'Consulta de margem indisponível.');
      if (signal.aborted) return;
      result.marginQuotes = (Array.isArray(body.data?.results) ? body.data.results : [])
        .filter((row: any) => row?.success === true)
        .map((row: any) => ({
          table: String(row.table?.name || row.table?.nome || row.table?.cod_tabela || 'Tabela INSS'),
          amount: getNossaFintechNovoAmount(row.data),
        }))
        .filter((quote: any): quote is StatementMarginQuote => Number.isFinite(quote.amount) && quote.amount > 0);
    } catch (error) {
      if (!signal.aborted) notes.add('Margem NOVO: ' + (error instanceof Error ? error.message : 'Falha de simulação.'));
    }
  })();

  type Task = { contractIndex: number; originBank: string; destination: Destination; route: string; body: unknown };
  const tasks: Task[] = [];
  statement.contracts.forEach((contract, contractIndex) => {
    const paid = paidFromTerms(contract.originalTerm, contract.openedInstallmentNumber);
    for (const target of targets) {
      const policy = portabilityEligibility(target.policy, contract.originLenderCode, paid, {
        product: 'INSS', operation: 'PORT_REFIN',
      });
      // Nunca consultar banco de destino igual à instituição credora da origem.
      if (policy.blocked) continue;
      tasks.push({
        contractIndex,
        originBank: contract.originLenderCode,
        destination: target.bank,
        route: target.route,
        body: {
          birthDate: statement.customer.birthDate,
          benefitType: Number(statement.customer.benefitType),
          term: 108,
          benefitContractCount: statement.issues.length ? undefined : statement.contracts.length,
          negativeMarginAmount: margin ?? undefined,
          contracts: [{
            originBank: contract.originLenderCode,
            originalTerm: Number(contract.originalTerm),
            remaining: Number(contract.openedInstallmentNumber),
            balance: parseCurrency(contract.lastDueBalance),
            installment: parseCurrency(contract.installmentFaceValue),
          }],
        },
      });
    }
  });
  let next = 0;
  const worker = async () => {
    while (next < tasks.length && !signal.aborted) {
      const task = tasks[next++];
      try {
        const response = await post(task.route, task.body);
        const body = await response.json();
        if (!response.ok) throw Error(body.error || 'Planilha não disponível.');
        if (signal.aborted) break;
        for (const offer of Array.isArray(body.offers) ? body.offers : []) {
          const amount = Number(offer.amount);
          if (offer.eligible === false || offer.success === false || !Number.isFinite(amount) || amount <= 0) continue;
          const installment = Number(offer.installment);
          const rate = Number(offer.rate);
          result.portabilityQuotes.push({
            contractIndex: task.contractIndex,
            originBank: task.originBank,
            destination: task.destination,
            table: String(offer.name || offer.code || 'Tabela INSS'),
            amount,
            term: Number(offer.term) || 108,
            installment: Number.isFinite(installment) && installment > 0 ? installment : null,
            rate: Number.isFinite(rate) && rate > 0 ? rate : null,
          });
        }
      } catch (error) {
        if (!signal.aborted) notes.add(task.destination + ': ' + (error instanceof Error ? error.message : 'Falha de simulação.'));
      }
    }
  };
  await Promise.all([marginTask, ...Array.from({ length: Math.min(tasks.length, 3) }, () => worker())]);
  if (!signal.aborted) result.notes = [...notes];
  return result;
}
