/** Proposal references are resolved against the session tenant, never the caller's tenant. */
type Entity = 'bank' | 'partner' | 'promoter' | 'product' | 'convenio';
type CatalogRow = { id: string; code?: string | null; name?: string; type?: any; requiresPortabilityRelation?: boolean };
type Delegate = {
  findFirst(args: any): Promise<CatalogRow | null>;
  create(args: any): Promise<CatalogRow>;
};
type CatalogDb = Record<Entity, Delegate>;
const prefixes: Record<Entity, string> = { bank: 'bank-', partner: 'part-', promoter: 'prom-', product: 'prod-', convenio: 'conv-' };
// Existing frontend catalog aliases whose suffix differs from the official code/name.
const legacyBankCodes: Record<string, string> = { 'bank-c6': '336', 'bank-brb': '070', 'bank-daycoval': '707', 'bank-facta': '149', 'bank-crefisa': '069', 'bank-icred': '811' };

export class InvalidProposalReference extends Error {
  readonly statusCode = 400;
  constructor() { super('Referência de proposta inválida ou indisponível nesta empresa.'); }
}

export function createProposalEntityResolvers(db: CatalogDb) {
  async function resolve(entity: Entity, tenantId: string, reference?: unknown, name?: unknown, allowCreate = true): Promise<CatalogRow | null> {
    if (!tenantId) throw new InvalidProposalReference();
    if ((reference != null && typeof reference !== 'string') || (name != null && typeof name !== 'string')) throw new InvalidProposalReference();
    const rawId = String(reference || '').trim(), rawName = String(name || '').trim();
    if (!rawId && !rawName) return null;
    const scope = entity === 'product' || entity === 'convenio'
      ? { OR: [{ scope: 'GLOBAL' }, { scope: 'EXCLUSIVE', tenantId }] }
      : { tenantId };
    const find = (match: object) => db[entity].findFirst({ where: { AND: [scope, match] } });
    const cleanId = rawId.replace(new RegExp(`^${prefixes[entity]}`), '').toUpperCase();
    if (rawId) {
      if (!cleanId) throw new InvalidProposalReference();
      const byId = await find({ id: rawId });
      if (byId) return byId;
      // Only exact codes or a recognized legacy alias may follow a failed ID lookup.
      // An accompanying name must never redirect an explicit invalid reference.
      const matches: object[] = [{ code: rawId }, { code: cleanId }];
      if (rawId.startsWith(prefixes[entity])) {
        matches.push({ code: cleanId.replace(/-/g, '_') }, { name: { equals: cleanId, mode: 'insensitive' } });
        if (entity === 'bank' && legacyBankCodes[rawId]) matches.push({ code: legacyBankCodes[rawId] });
        if (entity === 'promoter' && rawId === 'prom-master') matches.push({ name: { equals: 'CREDITPRO', mode: 'insensitive' } });
      }
      const alias = await find({ OR: matches });
      if (!alias) throw new InvalidProposalReference();
      return alias;
    }
    const byName = await find({ name: { contains: rawName, mode: 'insensitive' } });
    if (byName || !allowCreate) return byName;

    // Preserve the existing name-only creation flow. Explicit references never create.
    const base = { tenantId, name: rawName.toUpperCase() };
    const data = entity === 'bank' ? { ...base, code: rawName.includes('DAYCOVAL') ? '149' : rawName.includes('C6') ? '336' : '000', status: 'ATIVO' }
      : entity === 'partner' ? { ...base, code: 'PARCEIRO', status: 'ATIVO' }
      : entity === 'promoter' ? { ...base, code: 'PROM', status: 'ATIVO' }
      : entity === 'product' ? { ...base, code: 'NOVO', type: rawName.includes('PORTABILIDADE') ? (rawName.includes('REFIN') ? 'REFIN_PORTABILIDADE' : 'PORTABILIDADE') : 'NOVO', active: true, scope: 'GLOBAL' }
      : { ...base, code: 'INSS', active: true, scope: 'GLOBAL' };
    try { return await db[entity].create({ data }); }
    catch (error) { console.warn(`[resolve ${entity}] create failed:`, error); return null; }
  }

  async function validateReferences(tenantId: string, body: Record<string, unknown>) {
    // Complete the read-only pass across ALL supplied references before any write.
    for (const entity of Object.keys(prefixes) as Entity[]) {
      await resolve(entity, tenantId, body[`${entity}Id`], body[`${entity}Name`], false);
    }
  }
  return { resolve, validateReferences };
}
