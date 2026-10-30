import replacement from '../../src/data/portabilityRulesReplacement20261030.json';
import { addMonths, parseDate, type DaycovalWorkbook } from './daycovalWorkbook.js';

export const NOSSA_WORKBOOK_KEY = 'NOSSA_FINTECH_PORT_REFIN_WORKBOOK_V7';

/** V.07: rates come from TABELAS; 218004 corrected to 1.72% by the operator. */
export function nossaWorkbookTables(book: DaycovalWorkbook) {
  const cells = book.sheets.TABELAS?.cells;
  if (!cells) throw new Error('A aba TABELAS não foi encontrada.');
  const rates = new Map<string, number>();
  for (let row = 5; row <= 51; row++) rates.set(String(cells[`E${row}`]), Number(cells[`H${row}`]));
  const tables: { id: string; code: string; name: string; rate: number; term: number; invalidity: boolean }[] = [];
  for (let row = 2; row <= 48; row++) {
    const name = String(cells[`B${row}`] || '');
    const code = name.match(/^\d{6}/)?.[0];
    if (!code) throw new Error('A estrutura das tabelas Nossa Fintech mudou.');
    const rate = code === '218004' ? 0.0172 : rates.get(code);
    if (!Number.isFinite(rate) || rate! <= 0 || rate! > 0.0185) throw new Error(`Taxa inválida na tabela ${code}.`);
    for (const term of name.includes('108x') ? [108] : [84, 96]) {
      tables.push({ id: `${code}:${term}`, code, name, rate: rate!, term, invalidity: name.includes('INVALIDEZ') });
    }
  }
  return tables;
}

function originRate(balance: number, installment: number, remaining: number) {
  const present = (rate: number) => {
    let value = 0;
    for (let month = 1; month <= remaining; month++) value += installment / (1 + rate) ** month;
    return value;
  };
  let low = -0.99, high = 1;
  while (present(high) > balance && high < 1024) high *= 2;
  for (let i = 0; i < 150; i++) {
    const middle = (low + high) / 2;
    if (present(middle) > balance) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

export function simulateNossaWorkbook(book: DaycovalWorkbook, input: any) {
  const date = parseDate(input.simulationDate);
  const birth = parseDate(input.birthDate);
  if (birth > date) throw new Error('Nascimento inválido.');
  if (!Array.isArray(input.contracts) || input.contracts.length !== 1) throw new Error('Nossa Fintech: simule um contrato por vez.');
  const contract = input.contracts[0];
  const balance = Number(contract.balance), originalInstallment = Number(contract.installment);
  const remaining = Number(contract.remaining), term = Number(input.term);
  const negativeMargin = Number(input.negativeMarginAmount ?? 0);
  if (![balance, originalInstallment, negativeMargin].every(Number.isFinite) || balance <= 0 || originalInstallment <= 0 || negativeMargin < 0 || negativeMargin >= originalInstallment || !Number.isInteger(remaining) || remaining < 1 || remaining > 108 || ![84, 96, 108].includes(term)) {
    throw new Error('Revise saldo, parcela, margem negativa e prazos.');
  }
  const table = nossaWorkbookTables(book).find(row => row.id === input.tableId && row.term === term);
  if (!table) throw new Error('Selecione uma tabela Nossa Fintech compatível com o prazo.');
  const species = Number(input.benefitType);
  if (!Number.isInteger(species) || species <= 0) throw new Error('Informe a espécie do benefício.');
  if (table.invalidity !== [5, 32, 92].includes(species)) throw new Error('A tabela selecionada não corresponde à espécie do benefício.');
  const installment = originalInstallment - negativeMargin;
  // WORKDAY(EOMONTH(date,-1),2): weekends only, exactly as in V.07.
  const cutoff = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  let weekdays = 0;
  while (true) {
    if (![0, 6].includes(cutoff.getUTCDay())) weekdays++;
    if (weekdays === 2) break;
    cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  }
  const firstDue = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (date <= cutoff ? 1 : 2), 10));
  const days = Array.from({ length: term }, (_, index) => (addMonths(firstDue, index).getTime() - date.getTime()) / 86400000);
  const coefficient = 1 / days.reduce((sum, day) => sum + (1 + table.rate) ** (-day / 30), 0);
  const contractAmount = installment / coefficient;
  const grossCashout = contractAmount - balance;
  const cashoutInstallment = grossCashout * coefficient;
  let outstanding = grossCashout, dailyIof = 0, previousDay = 0;
  for (const day of days) {
    const interest = outstanding * ((1 + table.rate) ** ((day - previousDay) / 30) - 1);
    const amortization = cashoutInstallment - interest;
    dailyIof += amortization * 0.000082 * Math.min(day, 365);
    outstanding -= amortization;
    previousDay = day;
  }
  const iof = grossCashout * 0.0038 + dailyIof;
  const amount = grossCashout - iof;
  const expansion = contractAmount / balance - 1;
  const returnRate = originRate(balance, installment, remaining);
  const criteria=replacement.banks.find(bank=>bank.id==='nossa-fintech')!.criteria;
  const minimumBalance=Number(criteria.minBalance);
  // Financial formulas above remain intact. Superseded commercial checks are not active policy.
  const checks = [
    {label:`Saldo mínimo: R$ ${minimumBalance.toLocaleString('pt-BR')}`,passed:balance>=minimumBalance},
    {label:`Troco líquido mínimo: R$ ${Number(criteria.minCash).toLocaleString('pt-BR')}`,passed:amount>=Number(criteria.minCash)},
  ];
  if (![amount, contractAmount, iof, returnRate, coefficient].every(Number.isFinite)) throw new Error('Não foi possível calcular uma condição financeira válida.');
  const eligible = checks.every(check => check.passed);
  const offer = { provider: 'NOSSA_FINTECH', tableId: table.id, tableName: table.name, amount, contractAmount, balance, installment, term, rate: table.rate * 100, coefficient, iof, grossCashout, expansion, minimumCashout:Number(criteria.minCash), checks, eligible, status: eligible ? 'Pode digitar · condições da planilha atendidas' : `Não pode digitar: ${checks.filter(check => !check.passed).map(check => check.label).join('; ')}` };
  return { offers: [offer], contracts: [{ returnRate: returnRate * 100, newInstallment: installment }], firstDue: firstDue.toISOString().slice(0, 10), weightedRate: table.rate * 100, version: { fileName: book.fileName, hash: book.hash, uploadedAt: book.uploadedAt, versionDate: (book as any).versionDate }, message: 'Estimativa da planilha V.07; condições comerciais conferidas pela fonte substitutiva INSS. Digitação sujeita à confirmação do banco.' };
}
