/** Missing values never overwrite a registered amount. Accept provider JSON numbers or BRL strings. */
export function providerAmount(value: unknown): number | undefined {
    if (value == null || value === '' || typeof value === 'boolean') return undefined;
    const text = String(value).trim().replace(/^R\$\s*/, '');
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined;
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

