import source from '../data/bankPlaybooks.json';
import { ageAt } from './inssEligibility';

export const BANK_PLAYBOOKS = source;
export type PlaybookId = typeof source[number]['id'];
export type PlaybookInput = { birthDate: string; species: string; operation: 'NEW' | 'PORT' | 'REFIN' | 'PORT_REFIN'; term?: number; amount?: number; installment?: number; state?: string; benefitStartDate?: string; legalRepresentative?: boolean };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function publicPlaybookText(value: string) {
  // Commercial correspondent details are company-only, never part of partner answers.
  return value.replace(/BANRISUL\s*-\s*BEM PROMOTORA/gi, 'BANRISUL')
    .replace(/Suporte ao Correspondente:[\s\S]*$/i, '')
    .replace(/Portabilidade na Autorregulação[\s\S]*?(?=Resumo das Informações)/i, '');
}
export function searchBankPlaybooks(query: string, partner = false) {
  const words = normalize(query.slice(0, 500)).match(/[a-z0-9]{2,}/g)?.filter(word => !['qual','quais','para','como','pode','banco','com','uma','tem','que','dos','das','por','nos','nas','roteiro'].includes(word)) || [];
  if (!words.length) return [];
  const matches = BANK_PLAYBOOKS.flatMap(book => {
    const text = partner ? publicPlaybookText(book.text) : book.text;
    const paragraphs = text.split(/\r?\n|\s{3,}/).filter(Boolean).flatMap(paragraph => {
      const chunks: string[] = []; for (let index = 0; index < paragraph.length; index += 1800) chunks.push(paragraph.slice(index, index + 1800)); return chunks;
    });
    return paragraphs.map((excerpt, index) => ({ bankId: book.id, bank: book.name, version: book.version, receivedAt: book.receivedAt, source: book.source, section: index + 1, excerpt,
      score: words.reduce((score, word) => score + (normalize(excerpt).includes(word) ? 1 : 0) + (normalize(book.name).includes(word) ? 3 : 0), 0) }));
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  return matches.slice(0, 8).map(({ score: _score, ...row }) => row);
}

const species: Record<string, number[]> = {
  facta: [1,2,3,4,5,6,7,8,11,12,19,20,21,24,28,30,32,33,34,37,38,40,41,42,43,44,45,46,49,51,52,57,58,72,78,81,82,92,93],
  bmg: [1,2,3,4,5,6,7,8,19,20,21,22,23,24,26,27,28,32,33,37,38,41,42,43,44,45,46,49,52,55,56,57,58,59,72,78,81,82,84,89,92,93,96],
  daycoval: [1,2,3,4,5,6,7,8,11,12,18,21,28,30,32,33,34,37,38,40,41,42,43,44,45,46,49,51,52,57,58,60,72,78,81,82,83,92,93],
  banrisul: [1,2,3,4,5,6,7,8,11,12,20,21,24,28,30,32,33,34,37,38,40,41,42,43,44,45,46,49,51,52,57,72,78,81,82,83,92,93],
  parana: [1,2,3,4,5,6,7,8,19,20,21,24,28,32,33,34,37,38,41,42,43,44,45,46,49,51,52,57,58,72,78,82,83,92,93],
  c6: [1,2,3,4,5,6,7,8,11,12,19,20,21,24,28,30,32,33,34,37,38,40,41,42,43,44,45,46,49,51,52,57,58,72,78,81,82,83,92,93],
  presenca: [1,2,3,4,5,6,7,8,20,21,22,23,26,27,28,29,33,34,37,38,41,42,43,44,45,49,51,52,55,57,58,59,72,82,83,92,93],
  safra: [19,20,21,22,23,24,26,27,28,29,34,37,38,41,42,43,44,45,46,49,51,52,54,55,57,58,59,81,82,83,84,89,93],
};
const ages: Record<string, [number, number]> = { facta:[21,75],finanto:[22,73],bmg:[21,75],daycoval:[21,80],banrisul:[18,75],parana:[18,77],c6:[21,79],presenca:[22,71],safra:[26,76] };
export function evaluateBankPlaybooks(input: PlaybookInput, today?: Date) {
  const age = ageAt(input.birthDate, today), benefit = Number(input.species), uf = (input.state || '').trim().toUpperCase();
  return BANK_PLAYBOOKS.map(book => {
    const blocked: string[] = [], review: string[] = [];
    const [minimum, maximum] = ages[book.id];
    if (age === null) review.push('Informe nascimento válido para conferir idade.');
    else if (age < minimum || age > maximum) blocked.push(`Idade fora da faixa de ${minimum} a ${maximum} anos informada no roteiro.`);
    if (!/^\d{1,3}$/.test(input.species)) review.push('Informe a espécie do benefício.');
    else if (species[book.id] && !species[book.id].includes(benefit)) review.push('Espécie não consta na relação atendida recebida: confirmar antes de operar.');
    if (!uf) review.push('Conferir UF do benefício e regras locais de formalização.');
    if (book.id === 'facta' && uf === 'PI') blocked.push('Roteiro FACTA não atende benefícios no PI.');
    if (book.id === 'facta' && [9,10,13,15,25,31,35,36,39,47,48,50,53,61,62,63,64,65,66,67,68,69,70,71,73,74,75,76,77,79,80,85,86,87,88,90,91,94,95,97,98,99].includes(benefit)) blocked.push('Espécie explicitamente não consignável no roteiro FACTA.');
    if (book.id === 'c6' && [18,87,88].includes(benefit)) blocked.push('LOAS/Auxílio Inclusão suspensos no roteiro C6.');
    if (age !== null && age >= 60 && ['PB','AP','TO','RR'].includes(uf)) {
      if (['finanto','presenca','parana'].includes(book.id)) blocked.push('Restrição de idade/UF no roteiro; encaminhar para conferência na fronteira de 60 anos.');
      else review.push('Conferir exigência de formalização física/híbrida para idosos nesta UF.');
    }
    if (book.id === 'safra' && ['PORT','PORT_REFIN'].includes(input.operation)) blocked.push('Portabilidade indicada como bloqueada no roteiro versão 193.');
    if (book.id === 'c6' && input.operation === 'PORT_REFIN' && age !== null && age >= 74) blocked.push('Refin da portabilidade não opera a partir de 74 anos no roteiro.');
    if (book.id === 'finanto' && age !== null && input.operation === 'PORT_REFIN' && age >= 69) blocked.push('Port + Refin: limite de 68 anos e 10 meses.');
    if (book.id === 'finanto' && benefit === 87) blocked.push('Espécie 87 não opera.');
    if (book.id === 'finanto' && benefit === 32 && input.operation !== 'NEW') blocked.push('Espécie 32 somente em contratos novos.');
    if (book.id === 'finanto' && benefit === 32 && age !== null && age <= 60) blocked.push('Espécie 32 exige idade acima de 60 anos.');
    if (input.legalRepresentative && ['daycoval','banrisul','c6','presenca','safra'].includes(book.id)) blocked.push('Representação legal não atendida conforme roteiro.');
    if (age !== null && age >= minimum && age <= maximum) {
      let maxTerm = 108, maxAmount = Infinity;
      if (book.id === 'facta') { maxTerm = age <= 71 ? 108 : 108 - (age - 71) * 12; maxAmount = age <= 73 ? 150000 : age === 74 ? 50000 : 30000; }
      if (book.id === 'finanto') maxTerm = age <= 68 ? 108 : 108 - (age - 68) * 12;
      if (book.id === 'bmg') { maxTerm = age <= 70 ? 108 : 108 - (age - 70) * 12; maxAmount = age === 74 ? 30000 : age === 75 ? 20000 : Infinity; }
      if (book.id === 'banrisul') maxAmount = age <= 65 ? 70000 : age <= 69 ? 50000 : age <= 73 ? 40000 : 15000;
      if (book.id === 'parana') {
        const disability = [32,92].includes(benefit), adjusted = disability ? age + 4 : age;
        if (adjusted <= 74) {
          maxTerm = adjusted <= 68 ? 108 : adjusted === 69 ? 96 : adjusted <= 71 ? 72 : adjusted === 72 ? 60 : 36;
          maxAmount = adjusted <= 71 ? 100000 : adjusted === 72 ? 25000 : 10000;
        } else review.push('Idade fora das faixas da tabela recebida: confirmar prazo/teto e idade no último vencimento antes de operar.');
      }
      if (book.id === 'c6') { maxTerm = input.operation === 'NEW' ? age <= 71 ? 108 : Math.max(12, 108 - (age - 71) * 12) : age <= 73 ? 108 : age <= 75 ? 96 - (age - 74) * 12 : Math.max(12, 48 - (age - 76) * 12); maxAmount = ({74:35000,75:20000,76:15000,77:10000,78:8000,79:5000} as Record<number,number>)[age] ?? Infinity; }
      if (book.id === 'presenca') { maxTerm = age <= 67 ? 108 : 108 - (age - 67) * 12; maxAmount = age <= 68 ? 60000 : 20000; }
      if (input.term && input.term > maxTerm) blocked.push(`Prazo informado excede ${maxTerm} meses para esta idade/modalidade no roteiro.`);
      if (input.amount && input.amount > maxAmount) blocked.push(`Valor informado excede o teto de ${maxAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no roteiro; conferir risco total por CPF.`);
      if (!input.term) review.push(`Conferir prazo: limite inicial de ${maxTerm} meses, sujeito ao vencimento e às exceções.`);
    }
    if (book.id === 'finanto' && benefit === 21 && age !== null && age <= 45) blocked.push('Espécie 21 exige idade acima de 45 anos.');
    if (book.id === 'finanto' && benefit === 92 && age !== null && age <= 68) blocked.push('Espécie 92 exige idade acima de 68 anos no material.');
    if (book.id === 'finanto' && benefit === 88) review.push('Espécie 88: máximo de 66 anos e 10 meses; representante legal suspenso.');
    if (book.id === 'daycoval' && benefit === 18) review.push('O material lista espécie 18 e também exclui assistenciais: confirmar divergência.');
    if (book.id === 'safra' && [72,78].includes(benefit)) review.push('Espécie aparece nas listas permitida e não permitida (intervalo 61–79): confirmar divergência.');
    if ([21,32,92].includes(benefit)) review.push('Conferir duração da pensão, data de concessão/perícia e condições especiais da espécie.');
    if (book.id === 'finanto' && input.operation === 'PORT_REFIN') review.push('O material informa critérios divergentes de troco (5% do endividamento e faixas de 2%/3%/5%): confirmar regra vigente.');
    if (book.id === 'presenca' && benefit === 32) review.push('Espécie 32 não aparece na lista recebida do Presença: confirmar com o banco.');
    review.push('Conferir prazo, valores, conta de pagamento, documentação e demais exceções no roteiro completo.');
    return { bankId: book.id, bank: book.name, version: book.version, status: blocked.length ? 'BLOCKED' as const : 'REVIEW' as const, blocked, review, source: book.source, receivedAt: book.receivedAt };
  });
}
