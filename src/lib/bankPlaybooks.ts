import {replacementBankIds} from './portabilityRuleSources';
import source from '../data/bankPlaybooks.json';
import { PORTABILITY_BOOKS } from './portabilityPlaybooks';


export const BANK_PLAYBOOKS = source;
export const PORTABILITY_PLAYBOOKS = PORTABILITY_BOOKS;
export type PlaybookId = typeof source[number]['id'];
export type PlaybookInput = { illiterate?: boolean; originBank?: string; paidInstallments?: number; birthDate: string; species: string; operation: 'NEW' | 'PORT' | 'REFIN' | 'PORT_REFIN'; term?: number; amount?: number; installment?: number; state?: string; benefitStartDate?: string; legalRepresentative?: boolean; debt?:number; originalInstallment?:number; remainingInstallments?:number;contractEndDate?:string;cipMember?:boolean };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function publicPlaybookText(value: string) {
  // Commercial correspondent details are company-only, never part of partner answers.
  return value.replace(/BANRISUL\s*-\s*BEM PROMOTORA/gi, 'BANRISUL')
    .replace(/Suporte ao Correspondente:[\s\S]*$/i, '')
    .replace(/Portabilidade na Autorregulação[\s\S]*?(?=Resumo das Informações)/i, '');
}
export function searchBankPlaybooks(query: string, partner = false, additions: (typeof BANK_PLAYBOOKS[number]&{bankId?:string})[] = []) {
  const words = normalize(query.slice(0, 500)).match(/[a-z0-9]{2,}/g)?.filter(word => !['qual','quais','para','como','pode','banco','com','uma','tem','que','dos','das','por','nos','nas','roteiro'].includes(word)) || [];
  if (!words.length) return [];
  const otherProduct=/\b(?:siape|clt|fgts)\b/.test(normalize(query))&&!/\binss\b/.test(normalize(query));
  const portabilityQuery=!otherProduct&&/portabil|port\s*refin|refin.*port/.test(normalize(query));
  const matches = [...BANK_PLAYBOOKS.filter(book=>!portabilityQuery||!replacementBankIds.has(book.id)), ...(otherProduct?[]:PORTABILITY_PLAYBOOKS), ...additions.filter(book=>!portabilityQuery||!replacementBankIds.has(book.bankId||book.id))].flatMap(book => {
    const text = partner ? publicPlaybookText(book.text) : book.text;
    const paragraphs = (/\-p\d+$/.test(book.id) ? [text] : text.split(/\r?\n|\s{3,}/)).filter(Boolean).flatMap(paragraph => {
      const reference = /^\[PDF pp?\. [^\]]+\]/.exec(paragraph)?.[0];
      const chunks: string[] = []; for (let index = 0; index < paragraph.length; index += 1800) chunks.push(`${index > 0 && reference ? `${reference} ` : ''}${paragraph.slice(index, index + 1800)}`); return chunks;
    });
    return paragraphs.map((excerpt, index) => ({ bankId: book.id, bank: book.name, version: book.version, receivedAt: book.receivedAt, source: book.source, sourceFile: book.sourceFile, page: /^\[PDF pp?\. ([^\]]+)\]/.exec(excerpt)?.[1] || null, section: index + 1, excerpt,
      score: (PORTABILITY_PLAYBOOKS.some(port=>port.sourceFile===book.sourceFile) && /portabil|origem|pagas|troco/.test(normalize(query)) && words.some(word=>normalize(excerpt).includes(word)||normalize(book.name).includes(word)) ? 30 : 0) + words.reduce((score, word) => score + (normalize(excerpt).includes(word) ? 1 : 0) + (normalize(book.name).includes(word) ? 3 : 0), 0) }));
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  return matches.slice(0, 8).map(({ score: _score, ...row }) => row);
}

export function evaluateBankPlaybooks(_input: PlaybookInput, _today?: Date) {
 return BANK_PLAYBOOKS.map(book=>({bankId:book.id,bank:book.name,version:book.version,status:'REVIEW' as const,blocked:[] as string[],review:['Consulte os critérios, tabelas e exceções deste banco na aba Roteiros.'],source:book.source,receivedAt:book.receivedAt}));
}
