import type { SimulationRequest } from '../types';

/** Spreadsheet previews are not bank approvals; their source stays explicit for review. */
export const SPREADSHEET_PORT_REFIN_PROVIDERS = {
  DAYCOVAL: 'DAYCOVAL',
  C6: 'C6_PLANILHA',
  PARANA: 'PARANA_PLANILHA',
} as const;

type QuoteRow = {
  provider: string;
  table?: { id?: string; cod_tabela?: string; name?: string; amount?: number | string };
  troco?: number | null;
  term?: number;
  requiresReview?: boolean;
  data?: {
    installment?: number;
    rate?: number | null;
    refinancing?: { installmentValue?: number };
  };
  sourceVersionDate?: string | null;
};

export function portabilityQuoteCondition(row: QuoteRow, fallbackInstallment?: number | null):
  NonNullable<SimulationRequest['selectedCondition']> {
  const spreadsheet = row.provider in SPREADSHEET_PORT_REFIN_PROVIDERS;
  const provider = spreadsheet
    ? SPREADSHEET_PORT_REFIN_PROVIDERS[row.provider as keyof typeof SPREADSHEET_PORT_REFIN_PROVIDERS]
    : row.provider;
  const installment = row.data?.installment ?? row.data?.refinancing?.installmentValue ?? fallbackInstallment;
  const rate = row.provider === 'FINANTO' ? row.table?.amount : row.data?.rate ?? row.table?.amount;
  const parsedRate = typeof rate === 'number' ? rate : Number(String(rate ?? '').replace(',', '.'));
  return {
    provider, tableId: String(row.table?.id || row.table?.cod_tabela || ''),
    tableName: row.table?.name || 'Portabilidade + refinanciamento',
    amount: Number(row.troco),
    installment: Number.isFinite(Number(installment)) && Number(installment) > 0 ? Number(installment) : null,
    term: Number(row.term),
    rate: Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null,
    ...(spreadsheet ? {
      quoteKind: 'SPREADSHEET_ESTIMATE' as const, reviewRequired: true, reviewState: 'PENDING' as const,
      ...(row.sourceVersionDate ? {sourceVersionDate:row.sourceVersionDate} : {}),
    } : row.requiresReview ? {reviewRequired:true, reviewState:'PENDING' as const} : {}),
  };
}

export function formatMonthlyRate(value: number | string | null | undefined): string {
  if (value == null || String(value).trim() === '') return 'Não informada';
  const number = Number(String(value).replace('%','').replace(',', '.'));
  return Number.isFinite(number) && number > 0
    ? number.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:3}) + '% a.m.'
    : 'Não informada';
}
