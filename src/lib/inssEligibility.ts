import {evaluateReplacementPolicy} from './portabilityReplacementPolicy';
// Regras operacionais informadas pelo responsável pela integração em 08/10/2026.
// Faixas atualizadas pelo roteiro operacional enviado após a orientação inicial.
export const INSS_TERMS = [108, 96, 84, 72, 60, 48];

function contractDate(): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bahia', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
  return new Date(part('year'), part('month') - 1, part('day'));
}

export function ageAt(birthDate: string, today = contractDate()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > today) return null;
  return today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
}

const isPortability=(operation:string)=>['PORT','PORT_REFIN'].includes(operation);
function replacementAgeError(bank:string,birthDate:string,term:number,today:Date){
 if(!Number.isInteger(term)||term<=0)return 'Informe um prazo válido.';
 const day=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const check=evaluateReplacementPolicy(bank,'',undefined,{operation:'PORT_REFIN',birthDate,term,simulationDate:day});
 return check?.reasons.find(text=>/idade|nascimento/.test(text))||(!ageAt(birthDate,today)&&ageAt(birthDate,today)!==0?'Informe nascimento válido.':null);
}
export function finantoAgeError(birthDate: string, term: number, today = contractDate(),operation="NEW"): string | null {
  if(isPortability(operation))return replacementAgeError('finanto',birthDate,term,today);
  const age = ageAt(birthDate, today);
  if (age === null) return 'Informe uma data de nascimento válida.';
  if (age < 22 || age > 73) return 'FINANTO: idade permitida de 22 a 73 anos no início do contrato.';
  if (!Number.isInteger(term) || term <= 0) return 'FINANTO: informe um prazo válido.';
  const maxTerm = age <= 68 ? 108 : 108 - (age - 68) * 12;
  return term > maxTerm ? `FINANTO: aos ${age} anos, o prazo máximo é ${maxTerm} meses.` : null;
}

export function nossaFintechAgeError(birthDate: string, term: number, today = contractDate(),operation="NEW"): string | null {
  if(isPortability(operation))return replacementAgeError('nossa-fintech',birthDate,term,today);
  const age = ageAt(birthDate, today);
  if (age === null) return 'Informe uma data de nascimento válida.';
  if (age < 18) return 'Nossa Fintech: idade mínima de 18 anos.';
  const maxAge: Record<number, number> = { 60: 75, 72: 74, 84: 73, 96: 72, 108: 71 };
  if (maxAge[term] === undefined) return 'Nossa Fintech: prazos permitidos de 60, 72, 84, 96 e 108 meses.';
  const [year, month, day] = birthDate.split('-').map(Number);
  const lastMonth = new Date(year + maxAge[term], month - 1 + 11, 1);
  const lastDay = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
  const deadline = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), Math.min(day, lastDay) + 29);
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return startDate > deadline ? `Nossa Fintech: para ${term} meses, a idade máxima é ${maxAge[term]} anos, 11 meses e 29 dias.` : null;
}

export function finantoInstallmentError(name: string, installment: number,operation="NEW"): string | null {
  if (!Number.isFinite(installment) || installment <= 0) return 'Informe uma parcela atual maior que zero.';
  if(isPortability(operation))return installment<50?'FINANTO: parcela mínima de R$ 50,00.':null;
  if (/ESSENCIAL/i.test(name)) return installment >= 50 && installment <= 100 ? null : 'ESSENCIAL: parcela atual de R$ 50,00 a R$ 100,00.';
  if (/SELECT/i.test(name)) return installment >= 101 && installment <= 299 ? null : 'SELECT: parcela atual de R$ 101,00 a R$ 299,00.';
  if (/PRIME/i.test(name)) return installment > 300 ? null : 'PRIME: parcela atual acima de R$ 300,00.';
  return null;
}

/** Only explicit species restrictions are inferred from a table name. */
export function finantoBenefitError(name: string, benefitType: string | number): string | null {
  const restriction = /\b(?:BNF|ESP(?:[ÉE]CIE)?)\s*[.:#-]?\s*(\d{1,2})\b/i.exec(name);
  if (!restriction) return null;
  const required = Number(restriction[1]);
  return Number(benefitType) === required ? null : `Esta tabela FINANTO atende somente à espécie ${required} do benefício.`;
}

export function nossaFintechBenefitError(name: string, benefitType: string | number): string | null {
  const disability = [4, 5, 6, 11, 32, 33, 34, 51, 83, 92].includes(Number(benefitType));
  const disabilityTable = /\bINVALIDEZ\b/i.test(name);
  return disability === disabilityTable ? null : disability
    ? 'Esta espécie requer uma tabela de invalidez.'
    : 'Esta tabela atende benefícios por invalidez.';
}

export function finantoTableLabel(rule: { name?: string; code?: string | number; id?: string },operation="NEW"): string {
  const name = rule.name || `Tabela ${rule.code || rule.id || ''}`;
  if(isPortability(operation))return name;
  const grace = /90\s*D/i.test(name) ? ' · carência de 90 dias' : '';
  if (/ESSENCIAL/i.test(name)) return `ESSENCIAL · parcela R$ 50,00 a R$ 100,00 · taxa 1,75% a 1,85%${grace}`;
  if (/SELECT/i.test(name)) return `SELECT · parcela R$ 101,00 a R$ 299,00 · taxa 1,68% a 1,85%${grace}`;
  if (/PRIME/i.test(name)) return `PRIME · parcela acima de R$ 300,00 · taxa 1,60% a 1,85%${grace}`;
  return name;
}

export function finantoTableRateError(name: string, rate: number,operation="NEW"): string | null {
  if(isPortability(operation))return Number.isFinite(rate)&&rate>0?null:'Informe taxa válida retornada pela tabela oficial.';
  const min = /ESSENCIAL/i.test(name) ? 1.75 : /SELECT/i.test(name) ? 1.68 : /PRIME/i.test(name) ? 1.6 : null;
  if (min === null) return null;
  return Number.isFinite(rate) && rate >= min && rate <= 1.85 ? null : `Taxa permitida nesta tabela: ${min.toLocaleString('pt-BR')}% a 1,85%.`;
}

export function finantoCashOut(data: any): number | null {
  const value = [data?.refinancing?.netValue, data?.refinancing?.additionalValue, data?.additionalValue, data?.netValue, data?.finalDisbursedAmount]
    .find(item => item !== null && item !== undefined && item !== '' && Number.isFinite(Number(item)));
  return value === undefined ? null : Number(value);
}

export function finantoCashOutError(name: string, data: any,operation="NEW"): string | null {
  if(isPortability(operation))return null; // New document leaves the percentage/age formula unspecified.
  if (!/ESSENCIAL|SELECT|PRIME/i.test(name)) return null;
  const amount = finantoCashOut(data);
  if (amount === null) return 'A API não informou o troco para conferir o mínimo de R$ 100,00.';
  return amount < 100 ? 'Troco abaixo do mínimo de R$ 100,00 previsto no roteiro.' : null;
}

export function finantoRuleItem(rule: any, term: number, rate?: number,operation="NEW"): any | null {
  return (Array.isArray(rule.items) ? rule.items : []).find((item: any) => {
    const min = Number(item.minTerm) || 1;
    const max = Number(item.maxTerm) || Number(item.term);
    const termMatches = Number(item.maxTerm) > 0 ? term >= min && term <= max : Number(item.term) === term;
    const rateMatches = rate === undefined || (Number(item.maxRate) > 0
      ? rate >= (Number(item.minRate) || 0) && rate <= Number(item.maxRate)
      : isPortability(operation) ? Math.abs(Number(item.rate)-rate)<0.00001 : /ESSENCIAL|SELECT|PRIME/i.test(rule.name || '')
        ? !finantoTableRateError(rule.name || '', rate,operation)
        : Math.abs(Number(item.rate) - rate) < 0.00001);
    return termMatches && rateMatches && !finantoTableRateError(rule.name || '', rate ?? Number(item.rate),operation);
  }) || null;
}

export const INSS_REFINANCING_RATES = Array.from({ length: 26 }, (_, index) => (185 - index) / 100);

export function finantoRefinancingChoices(rule: any, term: number, selectedRate?: number,operation="NEW") {
  const rates = selectedRate === undefined ? isPortability(operation)?[...new Set<number>((rule.items||[]).map((item:any)=>Number(item.rate||item.maxRate)).filter((rate:number)=>Number.isFinite(rate)&&rate>0))]:INSS_REFINANCING_RATES : [selectedRate];
  return rates.flatMap(rate => {
    const item = finantoRuleItem(rule, term, rate,operation);
    return item ? [{ item, rate }] : [];
  });
}

export function nossaFintechTableRate(table: any): number | null {
  const name = String(table.name || table.nome_tabela || table.description || '');
  const match = /([12][.,]\d+)\s*%/.exec(name);
  const value = match ? Number(match[1].replace(',', '.')) : Number(table.monthly_rate ?? table.rate ?? table.taxa);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function nossaFintechBalanceError(table: any, balance: number): string | null {
  const name = String(table.name || table.nome_tabela || table.description || '');
  const rateMatch = /([12][.,]\d+)\s*%/.exec(name);
  const rate = rateMatch ? Number(rateMatch[1].replace(',', '.')) : Number(table.monthly_rate || table.rate || table.taxa);
  let minimum = 2900;
  if (Math.abs(rate - 1.85) < 0.00001 && /EXCLUSIV/i.test(name)) minimum = 2900;
  // Uma restrição adicional explicitamente devolvida no nome da tabela também vale.
  const declared = /saldo\s*m[ií]n(?:imo)?\s*(?:R\$)?\s*([\d.,]+)/i.exec(name);
  if (declared) minimum = Math.max(minimum, Number(declared[1].replace(/\./g, '').replace(',', '.')) || 0);
  return balance < minimum ? `Saldo devedor mínimo desta tabela: ${minimum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` : null;
}
