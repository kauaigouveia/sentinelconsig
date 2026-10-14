/** Operational promoter bindings stay server-side and never enter the partner portal DTO. */
export function partnerPublicResponse(value: any): any {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(partnerPublicResponse);
  if (typeof value.toJSON === 'function') return partnerPublicResponse(value.toJSON());
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/promoter|promotora|promotor|promot_id|promotId|correspondenteBanqueiro/i.test(key))
    .map(([key, item]) => [key, partnerPublicResponse(item)]));
}
