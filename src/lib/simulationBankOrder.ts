export const SIMULATION_BANKS = ['C6', 'FACTA', 'FINANTO', 'NOSSA_FINTECH', 'HAPPY', 'BMG'] as const;
export const BANK_LABELS: Record<string, string> = { C6: 'C6 Bank', FACTA: 'FACTA', FINANTO: 'FINANTO', NOSSA_FINTECH: 'Nossa Fintech', HAPPY: 'HAPPY / BYX', BMG: 'Banco BMG' };
export const OPERATIONS = { NEW: 'Novo', PORT: 'Portabilidade', REFIN: 'Refinanciamento', PORT_REFIN: 'Portabilidade + Refinanciamento' };
export type SimulationBankOrders = Record<keyof typeof OPERATIONS, string[]>;
export function bankKey(provider: string) { return provider.toUpperCase().replace(/\s+/g, '_'); }
export function normalizeBankOrders(value: any): SimulationBankOrders {
  return Object.fromEntries(Object.keys(OPERATIONS).map(operation => {
    const requested = Array.isArray(value?.[operation]) ? value[operation].filter((bank: any) => SIMULATION_BANKS.includes(bank)) : [];
    return [operation, [...new Set([...requested, ...SIMULATION_BANKS])]];
  })) as SimulationBankOrders;
}
