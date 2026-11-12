import { isValidCpf } from './utils';
import { contractKey, type PortabilityContractDraft } from './multiContractSimulation';

export interface InssStatement {
  customer: { cpf: string; name: string; birthDate: string; benefitNumber: string; benefitType: string };
  income: string;
  loanMargin: string;
  cardMargin: string;
  benefitCardMargin: string;
  benefitStart: string;
  uf: string;
  reference: string;
  legalRepresentative?: boolean;
  contracts: PortabilityContractDraft[];
  issues: string[];
}

export interface ReviewedInssStatement extends InssStatement {
  illiterate: 'YES' | 'NO';
  benefitContractCount: string;
}

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const loanRow = new RegExp(String.raw`^([\w./-]+)\s+(\d{1,3})\s*-\s*.+?\s+\d{4}-\d{2}\s+(${money})\s+(${money})\s+(\d+)\s+(\d+)\s+(${money})\s+[\d.,]+%?$`);
const loanHeader = /contrato banco inicio desconto\.? vl\.? emprestado vl\.? parcela prazo pagas saldo taxa/;
function isoDate(value: string) {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!parts) return '';
  const iso = [parts[3], parts[2], parts[1]].join('-');
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso) ? iso : '';
}

export function parseInssStatement(lines: string[]): InssStatement {
  const fields = new Map<string, string>();
  const loans = new Map<string, PortabilityContractDraft>();
  const conflicts = new Set<string>();
  const issues: string[] = [];
  let section: 'customer' | 'loans' | 'cards' = 'customer';
  let tableVerified = false;
  let recognized = false;

  for (const raw of lines) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    const label = fold(line);
    if (label === 'emprestimos bancarios') {
      section = 'loans';
      tableVerified = false;
      recognized = true;
      continue;
    }
    if (/^(reserva de margem para cartao|cartao beneficio$)/.test(label)) {
      section = 'cards';
      continue;
    }
    const field = /^([^:]+):\s*(.*)$/.exec(line);
    if (field) {
      const key = fold(field[1]);
      if (fields.has(key) && fields.get(key) !== field[2])
        throw Error('O PDF contém dados divergentes. Importe um extrato de um único benefício.');
      if (section === 'customer' || fields.has(key)) fields.set(key, field[2]);
      continue;
    }
    if (section !== 'loans') continue;
    if (loanHeader.test(label)) { tableVerified = true; continue; }
    const match = tableVerified && loanRow.exec(line);
    if (!match) {
      issues.push('Linha de empréstimo sem correspondência com as colunas do extrato.');
      continue;
    }
    const [, number, bank, , installment, term, paid, balance] = match;
    const remaining = Number(term) - Number(paid);
    if (remaining < 1 || +balance.replace(/\./g, '').replace(',', '.') <= 0 ||
        +installment.replace(/\./g, '').replace(',', '.') <= 0) {
      issues.push('Contrato sem parcelas restantes, saldo ou parcela positiva.');
      continue;
    }
    const draft = { originContractNumber: number, originLenderCode: bank.padStart(3, '0'),
      originalTerm: term, openedInstallmentNumber: String(remaining),
      lastDueBalance: balance, installmentFaceValue: installment };
    const key = contractKey(draft);
    if (conflicts.has(key)) continue;
    const previous = loans.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(draft)) {
      loans.delete(key);
      conflicts.add(key);
      issues.push('Contrato repetido com valores divergentes. Confira o extrato.');
    } else loans.set(key, draft);
  }
  const get = (key: string) => fields.get(key) || '';
  const amount = (key: string) => {
    const value = get(key).replace(/^R\$\s*/, '');
    return new RegExp('^-?' + money + '$').test(value) ? value.replace(/\./g, '').replace(',', '.') : '';
  };
  if (!recognized) throw Error('Formato de extrato não reconhecido. Use o PDF textual da consulta INSS.');
  const cpf = get('cpf').replace(/[.\s-]/g, '');
  const benefitNumber = get('beneficio').replace(/[.\s-]/g, '');
  const customer = { cpf, name: get('nome'), benefitNumber, birthDate: isoDate(get('data nascimento')),
    benefitType: /^(\d{1,3})\b/.exec(get('especie'))?.[1] || '' };
  if (!/^\d{11}$/.test(cpf) || !isValidCpf(cpf) || !/^\d{10}$/.test(benefitNumber) || !customer.birthDate || !customer.benefitType)
    throw Error('Confira CPF, nascimento, número e espécie do benefício no extrato.');
  const representative = fold(get('representante legal') || get('possui representante legal') || get('rep. legal'));
  return { customer, contracts: [...loans.values()], issues, loanMargin: amount('margem emprestimo'),
    legalRepresentative: representative === 'sim' ? true : representative === 'nao' ? false : undefined,
    cardMargin: amount('margem cartao'), benefitCardMargin: amount('cartao beneficio'), income: amount('salario'),
    benefitStart: isoDate(get('dib')), uf: /^[A-Z]{2}$/.test(get('uf')) ? get('uf') : '',
    reference: /^\d{2}\/\d{4}$/.test(get('competencia')) ? get('competencia') : '' };
}
