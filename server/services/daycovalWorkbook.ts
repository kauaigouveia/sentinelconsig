import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const MAIN = 'SIMULADOR COM SALDO';
const SHEETS = [MAIN, 'Base tabelas', 'CALENDARIO', 'Batalha Naval (2)'];
type Cell = string | number | boolean | { formula: string };
type Sheet = { cells: Record<string, Cell>; rows: number; cols: number };
type Table = { sheet: string; startRow: number; startCol: number; endRow: number; columns: string[] };
export type DaycovalWorkbook = { sheets: Record<string, Sheet>; tables: Record<string, Table>; fileName: string; hash: string; uploadedAt: string; terms: number[]; formulaHash: string };
type Node = { kind: string; value?: any; args?: Node[] };
type Range = { sheet: string; r1: number; r2: number; c1: number; c2: number };
class CalculationError extends Error {}
class UnsupportedFormula extends Error {}
const colNumber = (s: string) => [...s.replace(/\$/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const colName = (n: number): string => n ? colName(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + (n - 1) % 26) : '';
const serial = (date: Date) => (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000;
const dateFrom = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86400000);
const parseDate = (s: unknown): Date => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new CalculationError('Informe uma data válida.');
  const d = new Date(`${s}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new CalculationError('Informe uma data válida.');
  return d;
};
const addMonths = (d: Date, months: number) => {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Math.trunc(months), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return target;
};
const num = (v: any) => { if (v === '' || v == null) return 0; const n = Number(typeof v === 'string' && v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v); if (!Number.isFinite(n)) throw new CalculationError('Valor não numérico na planilha.'); return n; };

// Parse a deliberately limited Excel grammar. No eval, scripts or cached formula results.
function parse(formula: string): Node {
  const tokens: string[] = [];
  const pattern = /\s*("(?:[^"]|"")*"|'(?:[^']|'')*'|(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?|\$?[A-Za-z_][A-Za-z_0-9.$]*|<>|<=|>=|[()!,:%+*/^&=<>-])/gy;
  let offset = 0;
  while (offset < formula.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(formula);
    if (!match) throw new UnsupportedFormula(`Fórmula não suportada: ${formula.slice(offset, offset + 40)}`);
    tokens.push(match[1]); offset = pattern.lastIndex;
  }
  let pos = 0;
  const precedence: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  const expression = (minimum = 0): Node => {
    const token = tokens[pos++]; let node: Node;
    if (!token) throw new UnsupportedFormula('Fórmula incompleta.');
    if (token === '-' || token === '+') node = { kind: 'unary', value: token, args: [expression(5)] };
    else if (token === '(') { node = expression(); if (tokens[pos++] !== ')') throw new UnsupportedFormula('Parênteses inválidos.'); }
    else if (token.startsWith('"')) node = { kind: 'literal', value: token.slice(1, -1).replace(/""/g, '"') };
    else if (/^(?:\d|\.)/.test(token)) node = { kind: 'literal', value: Number(token) };
    else if (tokens[pos] === '(') {
      pos++; const args: Node[] = [];
      if (tokens[pos] !== ')') { do { args.push(expression()); } while (tokens[pos] === ',' && ++pos); }
      if (tokens[pos++] !== ')') throw new UnsupportedFormula('Argumentos inválidos.');
      node = { kind: 'call', value: token.toUpperCase().replace('_XLFN.', ''), args };
    } else if (/^(TRUE|FALSE)$/i.test(token)) node = { kind: 'literal', value: token.toUpperCase() === 'TRUE' };
    else {
      let ref = token;
      if (tokens[pos] === '!') { pos++; ref += '!' + tokens[pos++]; }
      if (tokens[pos] === ':') { pos++; ref += ':' + tokens[pos++]; }
      node = { kind: 'ref', value: ref };
    }
    while (tokens[pos] === '%') { pos++; node = { kind: 'binary', value: '/', args: [node, { kind: 'literal', value: 100 }] }; }
    while (precedence[tokens[pos]] != null && precedence[tokens[pos]] >= minimum) {
      const op = tokens[pos++]; node = { kind: 'binary', value: op, args: [node, expression(precedence[op] + (op === '^' ? 0 : 1))] };
    }
    return node;
  };
  const result = expression(); if (pos !== tokens.length) throw new UnsupportedFormula('Operação Excel não suportada.'); return result;
}

export class DaycovalCalculator {
  private cache = new Map<string, any>();
  private stack = new Set<string>();
  private parsed = new Map<string, Node>();
  private budget = 300000;
  constructor(private book: DaycovalWorkbook, private overrides: Record<string, Cell>) {}
  private range(reference: string, sheet: string): Range {
    const index = reference.lastIndexOf('!');
    if (index >= 0) { sheet = reference.slice(0, index).replace(/^'|'$/g, '').replace(/''/g, "'"); reference = reference.slice(index + 1); }
    const [start, end = start] = reference.replace(/\$/g, '').toUpperCase().split(':');
    const first = /^([A-Z]+)(\d*)$/.exec(start), last = /^([A-Z]+)(\d*)$/.exec(end);
    if (!first || !last || !this.book.sheets[sheet]) throw new UnsupportedFormula(`Referência não suportada: ${sheet}!${reference}`);
    return { sheet, c1: colNumber(first[1]), c2: colNumber(last[1]), r1: Number(first[2]) || 1, r2: Number(last[2]) || this.book.sheets[sheet].rows };
  }
  private list(v: any): any[] {
    if (v && typeof v === 'object' && 'r1' in v) {
      const result: any[] = [];
      for (let r = v.r1; r <= v.r2; r++) for (let c = v.c1; c <= v.c2; c++) result.push(this.cell(`${colName(c)}${r}`, v.sheet));
      return result;
    }
    return Array.isArray(v) ? v.flat() : [v];
  }
  private scalar(v: any) { return v && typeof v === 'object' && 'r1' in v ? this.cell(`${colName(v.c1)}${v.r1}`, v.sheet) : v; }
  cell(address: string, sheet = MAIN): any {
    if (--this.budget < 0) throw new UnsupportedFormula('Planilha excedeu o limite de cálculo.');
    const key = `${sheet}!${address}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.stack.has(key)) throw new UnsupportedFormula(`Referência circular: ${key}`);
    const value = sheet === MAIN && address in this.overrides ? this.overrides[address] : this.book.sheets[sheet]?.cells[address] ?? '';
    if (typeof value !== 'object') return value;
    this.stack.add(key);
    try {
      let formula = value.formula;
      // Excel tables refer to a column in the current row.
      formula = formula.replace(/(\w+)\[\[#This Row\],\[([^\]]+)\]\]/g, (_, name, field) => {
        const t = this.book.tables[name]; const col = t?.columns.indexOf(field);
        if (!t || col == null || col < 0) throw new UnsupportedFormula('Coluna estruturada desconhecida.');
        return `'${t.sheet}'!${colName(t.startCol + col)}${address.replace(/\D/g, '')}`;
      });
      let ast = this.parsed.get(formula); if (!ast) { ast = parse(formula); this.parsed.set(formula, ast); }
      const result = this.scalar(this.run(ast, sheet)); this.cache.set(key, result); return result;
    } finally { this.stack.delete(key); }
  }
  private run(node: Node, sheet: string): any {
    const args = node.args || [];
    const val = (i: number) => this.scalar(this.run(args[i], sheet));
    const raw = (i: number) => this.run(args[i], sheet);
    if (node.kind === 'literal') return node.value;
    if (node.kind === 'ref') return this.range(node.value, sheet);
    if (node.kind === 'unary') return (node.value === '-' ? -1 : 1) * num(val(0));
    if (node.kind === 'binary') {
      const a = val(0), b = val(1);
      switch (node.value) {
        case '+': return num(a) + num(b); case '-': return num(a) - num(b); case '*': return num(a) * num(b);
        case '/': if (!num(b)) throw new CalculationError('Divisão por zero.'); return num(a) / num(b);
        case '^': { const n = num(a) ** num(b); if (!Number.isFinite(n)) throw new CalculationError('Potência inválida.'); return n; }
        case '&': return String(a) + String(b);
        case '=': return typeof a === 'string' && typeof b === 'string' ? a.toUpperCase() === b.toUpperCase() : (a === b || (a === '' && b === 0) || (a === 0 && b === ''));
        case '<>': return !this.run({ ...node, value: '=' }, sheet);
        case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
      }
    }
    if (node.kind !== 'call') throw new UnsupportedFormula('Operação não suportada.');
    switch (node.value) {
      case 'IF': return val(0) ? val(1) : args[2] ? val(2) : false;
      case 'IFERROR': try { return val(0); } catch (e) { if (e instanceof UnsupportedFormula) throw e; return val(1); }
      case 'AND': return args.every((_, i) => Boolean(val(i)));
      case 'OR': return args.some((_, i) => Boolean(val(i)));
      case 'SUM': return args.flatMap((_, i) => this.list(raw(i))).reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0);
      case 'MAX': return Math.max(0, ...args.flatMap((_, i) => this.list(raw(i))).filter(x => typeof x === 'number'));
      case 'CONCATENATE': return args.map((_, i) => String(val(i))).join('');
      case 'NUMBERVALUE': { const v = val(0); return typeof v === 'string' ? num(v.replace(/\./g, '').replace(',', '.')) : num(v); }
      case 'ROUND': case 'ROUNDUP': { const m = 10 ** num(val(1)), v = num(val(0)); return Math.sign(v) * (node.value === 'ROUND' ? Math.round(Math.abs(v) * m + 1e-10) : Math.ceil(Math.abs(v) * m)) / m; }
      case 'DAY': return dateFrom(num(val(0))).getUTCDate();
      case 'MONTH': return dateFrom(num(val(0))).getUTCMonth() + 1;
      case 'YEAR': return dateFrom(num(val(0))).getUTCFullYear();
      case 'DATE': return serial(new Date(Date.UTC(num(val(0)), num(val(1)) - 1, num(val(2)))));
      case 'EDATE': return serial(addMonths(dateFrom(num(val(0))), num(val(1))));
      case 'INDIRECT': return this.range(String(val(0)), sheet);
      case 'VLOOKUP': {
        const key = val(0), range = raw(1) as Range, column = num(val(2)); const approximate = args[3] ? Boolean(val(3)) : true;
        if (!range || column < 1 || column > range.c2 - range.c1 + 1) throw new CalculationError('PROCV inválido.');
        let match = -1;
        for (let r = range.r1; r <= range.r2; r++) {
          const item = this.cell(`${colName(range.c1)}${r}`, range.sheet);
          if (item === key || typeof item === 'string' && typeof key === 'string' && item.toUpperCase() === key.toUpperCase()) { match = r; break; }
          if (approximate && typeof item === typeof key && item <= key) match = r;
        }
        if (match < 0) throw new CalculationError('Condição não encontrada na planilha.');
        return this.cell(`${colName(range.c1 + column - 1)}${match}`, range.sheet);
      }
      case 'MATCH': { const list = this.list(raw(1)), key = val(0); const index = list.findIndex(x => x === key); if (index < 0) throw new CalculationError('CORRESP não encontrado.'); return index + 1; }
      case 'SUMIF': {
        const keys = this.list(raw(0)), criterion = val(1), values = this.list(args[2] ? raw(2) : raw(0));
        return values.reduce((s, x, i) => s + (keys[i] === criterion && typeof x === 'number' ? x : 0), 0);
      }
      case 'SUMPRODUCT': { const lists = args.map((_, i) => this.list(raw(i))); return lists[0].reduce((s, _, i) => s + lists.reduce((p, xs) => p * num(xs[i]), 1), 0); }
      case 'COUNTIFS': { const pairs = args.map((_, i) => i % 2 ? val(i) : this.list(raw(i))); return (pairs[0] as any[]).filter((_, i) => pairs.every((p, j) => j % 2 || p[i] === pairs[j + 1])).length; }
      case 'GETPIVOTDATA': {
        // This workbook's pivot counts employer/term rows from Consulta1.
        if (val(0) !== 'EMPREGADOR' || val(2) !== 'EMPREGADOR' || val(4) !== 'PRAZO') throw new UnsupportedFormula('Tabela dinâmica não suportada.');
        const employer = val(3), term = val(5), base = this.book.sheets['Base tabelas']; let count = 0;
        for (let r = 2; r <= base.rows; r++) if (this.cell(`A${r}`, 'Base tabelas') === employer && this.cell(`G${r}`, 'Base tabelas') === term) count++;
        if (!count) throw new CalculationError('Prazo indisponível.'); return count;
      }
      case 'XIRR': {
        const values = this.list(raw(0)).map(num), dates = this.list(raw(1)).map(num);
        if (values.length !== dates.length || !values.some(v => v < 0) || !values.some(v => v > 0)) throw new CalculationError('Fluxo sem taxa de retorno.');
        // Solve in log(1+annualRate), avoiding overflow near -100%.
        const npv = (x: number) => values.reduce((s, v, i) => s + v * Math.exp(-x * (dates[i] - dates[0]) / 365), 0);
        let lo = -10, hi = 20, a = npv(lo), b = npv(hi);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a * b > 0) throw new CalculationError('Taxa de retorno sem convergência.');
        for (let i = 0; i < 150; i++) { const mid = (lo + hi) / 2, m = npv(mid); if (Math.abs(m) < 1e-8) return Math.expm1(mid); if ((m > 0) === (a > 0)) { lo = mid; a = m; } else hi = mid; }
        return Math.expm1((lo + hi) / 2);
      }
      default: throw new UnsupportedFormula(`Função Excel não suportada: ${node.value}.`);
    }
  }
}

export async function importDaycoval(buffer: Buffer, fileName: string, expectedFormulaHash?: string): Promise<DaycovalWorkbook> {
  if (buffer.length > 3500000) throw new CalculationError('Envie uma planilha de até 3,5 MB.');
  // Bound ZIP expansion before ExcelJS allocates the worksheet XML.
  let end = buffer.length - 22;
  for (; end >= Math.max(0, buffer.length - 65557); end--) if (buffer.readUInt32LE(end) === 0x06054b50) break;
  if (end < 0 || end + 22 > buffer.length || buffer.readUInt32LE(end) !== 0x06054b50) throw new CalculationError('Arquivo XLSX inválido.');
  let cursor = buffer.readUInt32LE(end + 16), expanded = 0;
  const entries = buffer.readUInt16LE(end + 10);
  if (entries > 2000) throw new CalculationError('Arquivo XLSX excedeu o limite.');
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new CalculationError('Arquivo XLSX inválido.');
    expanded += buffer.readUInt32LE(cursor + 24);
    cursor += 46 + buffer.readUInt16LE(cursor + 28) + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  if (expanded > 45000000) throw new CalculationError('Arquivo XLSX excedeu o limite de conteúdo descompactado.');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as any);
  const sheets: Record<string, Sheet> = {}, tables: Record<string, Table> = {}, formulas: string[] = [];
  let cells = 0;
  for (const name of SHEETS) {
    const ws = workbook.getWorksheet(name); if (!ws) throw new CalculationError(`A planilha não contém a aba ${name}.`);
    const sheet: Sheet = { cells: {}, rows: ws.rowCount, cols: ws.columnCount }; sheets[name] = sheet;
    ws.eachRow(row => row.eachCell(cell => {
      if (++cells > 250000) throw new CalculationError('Planilha excedeu o limite de células.');
      if (cell.formula) { sheet.cells[cell.address] = { formula: cell.formula }; if (name === MAIN || name === 'Batalha Naval (2)') formulas.push(`${name}!${cell.address}=${cell.formula}`); }
      else if (cell.value instanceof Date) sheet.cells[cell.address] = serial(cell.value);
      else if (['string', 'number', 'boolean'].includes(typeof cell.value)) sheet.cells[cell.address] = cell.value as Cell;
      else if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) sheet.cells[cell.address] = cell.value.richText.map(t => t.text).join('');
      else if (cell.value && typeof cell.value === 'object' && 'error' in cell.value) sheet.cells[cell.address] = { formula: 'UNSUPPORTED()' };
    }));
    for (const table of Object.values(ws.getTables())) {
      const model = (table as any).table;
      const start = /^([A-Z]+)(\d+)$/.exec(model.ref || model.tableRef?.split(':')[0]);
      if (start) {
        const startRow = Number(start[2]), startCol = colNumber(start[1]);
        // ExcelJS can omit trailing tableColumns; the workbook headers remain authoritative.
        const columns: string[] = [];
        for (let c = startCol; c <= ws.columnCount; c++) { const header = ws.getCell(startRow, c).value; if (typeof header !== 'string') break; columns.push(header); }
        tables[model.name] = { sheet: name, startRow, startCol, endRow: ws.rowCount, columns };
      }
    }
  }
  const formulaHash = createHash('sha256').update(formulas.sort().join('\n')).digest('hex');
  if (expectedFormulaHash && formulaHash !== expectedFormulaHash) throw new CalculationError('As fórmulas ou a estrutura mudaram. Esta versão precisa ser adaptada antes de ativar.');
  const base = sheets['Base tabelas'], terms = new Set<number>();
  for (let row = 2; row <= base.rows; row++) if (base.cells[`A${row}`] === 'INSS' && typeof base.cells[`G${row}`] === 'number') terms.add(base.cells[`G${row}`] as number);
  if (!terms.size) throw new CalculationError('Nenhuma tabela INSS encontrada.');
  return { sheets, tables, fileName: fileName.slice(0, 200), uploadedAt: new Date().toISOString(), hash: createHash('sha256').update(buffer).digest('hex'), formulaHash, terms: [...terms].sort((a,b) => b-a) };
}
export const encodeDaycoval = (book: DaycovalWorkbook) => gzipSync(JSON.stringify(book)).toString('base64');
export const decodeDaycoval = (value: string): DaycovalWorkbook => JSON.parse(gunzipSync(Buffer.from(value, 'base64'), { maxOutputLength: 30000000 }).toString());

export function simulateDaycoval(book: DaycovalWorkbook, input: any) {
  const date = parseDate(input.simulationDate), birth = parseDate(input.birthDate);
  const age = date.getUTCFullYear() - birth.getUTCFullYear() - (date.getUTCMonth() < birth.getUTCMonth() || date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate() ? 1 : 0);
  if (birth > date || age >= 74) throw new CalculationError('Portabilidade Daycoval atende até 73 anos. A partir de 74 anos, não atende.');
  const maxTerm = age <= 71 ? 108 : age === 72 ? 96 : 84;
  const term = Number(input.term);
  if (!Number.isInteger(term) || term > maxTerm || !book.terms.includes(term)) throw new CalculationError(`Prazo indisponível. Para esta idade, o máximo é ${maxTerm} meses, conforme tabelas importadas.`);
  if (!Array.isArray(input.contracts) || !input.contracts.length || input.contracts.length > 17) throw new CalculationError('Informe de 1 a 17 contratos.');
  const overrides: Record<string, Cell> = { F8: 'INSS', H8: serial(date), I27: 1, I26: term, E26: num(input.additionalMargin ?? 0), E23: num(input.requestedRefinAmount ?? 0) };
  if (num(overrides.E26) < 0 || num(overrides.E23) < 0) throw new CalculationError('Margem adicional e valor solicitado não podem ser negativos.');
  for (let i = 0; i < 17; i++) {
    const col = colName(i + 5), contract = input.contracts[i];
    const balance = contract ? Number(contract.balance) : 0, installment = contract ? Number(contract.installment) : 0, remaining = contract ? Number(contract.remaining) : 0;
    if (contract && (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(installment) || installment <= 0 || !Number.isInteger(remaining) || remaining < 1 || remaining > 144)) throw new CalculationError(`Revise saldo, parcela e prazo restante do contrato ${i + 1}.`);
    overrides[`${col}17`] = balance; overrides[`${col}18`] = remaining; overrides[`${col}19`] = installment; overrides[`${col}24`] = contract?.cipInstallment == null ? 0 : num(contract.cipInstallment); overrides[`${col}22`] = 1;
    if (num(overrides[`${col}24`]) < 0) throw new CalculationError('Parcela CIP inválida.');
    // Empty slots are blank in Excel, not contracts with zero balances.
    if (!contract) overrides[`${col}17`] = '';
  }
  const calculator = new DaycovalCalculator(book, overrides);
  const firstDueSerial = num(calculator.cell('M8')), firstDue = dateFrom(firstDueSerial);
  const lastDue = addMonths(firstDue, term - 1);
  const ageLimit = addMonths(birth, 80 * 12 + 11); ageLimit.setUTCDate(ageLimit.getUTCDate() + 29);
  if (lastDue > ageLimit) throw new CalculationError('Idade no término excede 80 anos, 11 meses e 29 dias.');
  const offers: any[] = [];
  for (let row = 29; row <= 47; row++) {
    const name = calculator.cell(`F${row}`); if (!name) continue;
    const amount = num(calculator.cell(`M${row}`)), contractAmount = num(calculator.cell(`K${row}`));
    const status = String(calculator.cell(`N${row}`));
    if (!status || !Number.isFinite(amount) || !Number.isFinite(contractAmount)) throw new CalculationError('A planilha não conseguiu calcular a disponibilidade das tabelas. Confira os dados ou importe uma versão válida.');
    offers.push({ provider: 'DAYCOVAL', tableId: String(name).split(' - ')[0], tableName: String(name), rate: num(calculator.cell(`I${row}`)) * 100, coefficient: num(calculator.cell(`J${row}`)), contractAmount, balance: num(calculator.cell(`L${row}`)), amount, installment: num(calculator.cell('E25')), term, status, eligible: status === 'TAB disponivel', reSignature: String(calculator.cell(`O${row}`)) });
  }
  if (!offers.length) throw new CalculationError('A versão importada não retornou tabelas para este prazo.');
  const contracts = input.contracts.map((_: any, i: number) => ({ returnRate: num(calculator.cell(`${colName(i + 5)}20`)) * 100, newInstallment: num(calculator.cell(`${colName(i + 5)}21`)) }));
  return { offers, contracts, firstDue: firstDue.toISOString().slice(0, 10), weightedRate: num(calculator.cell('E27')) * 100, version: { fileName: book.fileName, hash: book.hash, uploadedAt: book.uploadedAt }, age, maxTerm };
}
