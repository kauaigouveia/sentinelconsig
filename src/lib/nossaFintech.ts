const DISBURSEMENT_KEYS = new Set([
  'final_disbursement_amount',
  'final_disbursed_amount',
  'disbursement_amount',
  'net_disbursed_amount',
  'disbursed_issue_amount',
  'disbursed_amount',
]);

/** Novo has a different response contract from Port/Refin: read actual offers,
 * never the echoed disbursed_amount at the top of a simulation response. */
export function getNossaFintechNovoOptions(payload: unknown): Record<string, any>[] {
  const pending: unknown[] = [payload];
  const visited = new Set<object>();
  const options: Record<string, any>[] = [];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) { pending.push(...current); continue; }
    const record = current as Record<string, any>;
    if (record.success === false || record.error || record.errors?.length) continue;
    if (Array.isArray(record.disbursement_options)) {
      options.push(...record.disbursement_options.filter((option: any) =>
        option && option.disbursed_issue_amount != null && Number.isFinite(Number(option.disbursed_issue_amount)) && Number(option.disbursed_issue_amount) > 0));
      continue;
    }
    for (const value of Object.values(record)) if (value && typeof value === 'object') pending.push(value);
  }
  return options;
}

export function getNossaFintechNovoAmount(payload: unknown): number | null {
  const option = getNossaFintechNovoOptions(payload)[0];
  return option ? Number(option.disbursed_issue_amount) : null;
}

/** Extract the client cash-out from the documented response and common API envelopes. */
export function getNossaFintechTroco(payload: unknown): number | null {
  const pending: unknown[] = [payload];
  const visited = new Set<object>();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (DISBURSEMENT_KEYS.has(key.toLowerCase()) && value !== null && value !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
      if (value && typeof value === 'object') pending.push(value);
    }
  }
  return null;
}

/** Novo returns several options for one product. Resolve commercial table names
 * from the actual returned amount when the option omits cod_tabela. */
export function matchNossaFintechNovoTable(tables: Record<string, any>[], option: Record<string, any>, requestedTerm: number): Record<string, any> | null {
  const term = Number(option.number_of_installments ?? requestedTerm);
  const eligible = tables.filter(table => !Array.isArray(table.number_of_installments) || !table.number_of_installments.length || table.number_of_installments.map(Number).includes(term));
  if (option.cod_tabela != null) return eligible.find(table => String(table.cod_tabela) === String(option.cod_tabela)) || null;
  const amount = Number(option.disbursed_issue_amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const matching = eligible.filter(table => {
    const minimum = table.start == null ? 0 : Number(table.start);
    const maximum = table.end == null ? Infinity : Number(table.end);
    return Number.isFinite(minimum) && !Number.isNaN(maximum) && amount >= minimum && amount <= maximum;
  });
  return matching.length === 1 ? matching[0] : null;
}
