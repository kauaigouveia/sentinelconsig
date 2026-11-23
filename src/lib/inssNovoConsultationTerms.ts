import {ageAt} from './inssEligibility';

/**
 * The default INSS quote is requested at 108 months, but older borrowers can
 * have no eligible product at this term. We must not conclude that NEW is
 * impossible without trying actual shorter terms offered by the institutions.
 * This is a query plan, not an eligibility approval or financial projection.
 *
 * Keep this bounded because each request fans out to the configured providers.
 */
export function inssNovoConsultationTerms(birthDate: string, today?: Date): number[] {
  const age = ageAt(birthDate, today);
  if (age === null) return [108];
  // As restrições de prazo FINANTO para NOVO são progressivas após 68 anos:
  // 69: 96; 70: 84; 71: 72; 72: 60; 73: 48 meses.
  // Manter 108 para os demais bancos e acrescentar somente os prazos
  // alternativos necessários, sem presumir elegibilidade bancária.
  if (age >= 74) return [108, 60, 48];
  if (age >= 73) return [108, 84, 72, 60, 48];
  if (age >= 70) return [108, 84, 72, 60];
  if (age >= 69) return [108, 96];
  return [108];
}

/** Offers are real returned values, never estimates based only on the input margin. */
export type InssNewOffer = {
  provider: string;
  institution: string;
  table: string;
  amount: number;
  installment: number | null;
  term: number | null;
  rate: number | null;
  source: 'API' | 'PLANILHA';
};

export function normalizeInssNovoOffers(data: unknown, term: number, projected = false): InssNewOffer[] {
  const rows = (data as any)?.offers;
  if (!Array.isArray(rows)) return [];
  const normalized: InssNewOffer[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    if (projected && (item.scenario !== 'PROJECTED_2027' || item.nonBinding !== true)) continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const itemTerm = Number(item.term);
    normalized.push({
      provider: String(item.provider || item.institution || 'Instituição'),
      institution: String(item.institution || item.provider || 'Instituição'),
      table: String(item.table || 'Tabela INSS'),
      amount,
      installment: projected ? 42 : Number(item.installment) > 0 ? Number(item.installment) : null,
      term: Number.isInteger(itemTerm) && itemTerm > 0 ? itemTerm : term,
      rate: Number(item.rate) > 0 ? Number(item.rate) : null,
      source: item.source === 'PLANILHA' ? 'PLANILHA' : 'API',
    });
  }
  return normalized;
}

/** Retain distinct bank/table/term conditions and avoid duplicate API rows. */
export function dedupeInssNovoOffers(offers: InssNewOffer[]): InssNewOffer[] {
  const seen = new Set<string>();
  return offers.filter(offer => {
    const id = [
      offer.provider.trim().toLowerCase(), offer.institution.trim().toLowerCase(),
      offer.table.trim().toLowerCase(), offer.term, offer.rate,
      Math.round(offer.amount * 100),
    ].join('|');
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).sort((a, b) => b.amount - a.amount);
}
