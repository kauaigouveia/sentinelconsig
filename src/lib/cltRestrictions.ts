// Read business messages only; never render the full provider response or IDs.
export function cltRestrictionReasons(value: any): string[] {
  const read = (entry: any): string[] => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : [];
    if (Array.isArray(entry)) return entry.flatMap(read);
    if (!entry || typeof entry !== 'object') return [];
    return ['text', 'message', 'description', 'reason'].flatMap(key => read(entry[key]));
  };
  return [...new Set(read(value))];
}

export function cltResponseReasons(value: any): string[] {
  return [...new Set([
    ...cltRestrictionReasons(value?.restrictions),
    ...cltRestrictionReasons(value?.messages),
    ...cltRestrictionReasons(value?.data?.restrictions),
    ...cltRestrictionReasons(value?.data?.messages),
  ])];
}
