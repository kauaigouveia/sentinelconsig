import { readFileSync } from 'node:fs';
import ts from 'typescript';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createProposalEntityResolvers, InvalidProposalReference } from '../server/services/proposalEntityResolution';
import { hasPermission } from '../src/lib/permissions';
import { normalizeProposalType } from '../src/lib/proposalTypeNormalizer';

// Execute the actual route callback with injected dependencies. Never import server.ts:
// its bootstrap constructs a real Prisma client and may initialize application services.
const source = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
function handler(method: string, path: string, dependencies: Record<string, unknown>) {
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(tree) === 'app' && node.expression.name.text === method
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === path) callback = node.arguments[1];
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!callback) throw new Error(`Missing route ${method} ${path}`);
  const js = ts.transpileModule(`const route = ${callback.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), `${js}\nreturn route;`)(...Object.values(dependencies));
}
const entities = ['bank', 'partner', 'promoter', 'product', 'convenio'] as const;
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return value.every((item: any) => matches(row, item));
    if (key === 'OR') return value.some((item: any) => matches(row, item));
    if (value && typeof value === 'object' && 'contains' in value) return String(row[key]).toUpperCase().includes(String(value.contains).toUpperCase());
    if (value && typeof value === 'object' && 'equals' in value) return String(row[key]).toUpperCase() === String(value.equals).toUpperCase();
    return row[key] === value;
  });
}
function fixture() {
  const db: any = {};
  const writes: any[] = [];
  for (const entity of entities) {
    const rows = [
      { id: `${entity}-a`, tenantId: 'A', name: 'LOCAL A', code: 'LOCAL', scope: 'EXCLUSIVE', type: 'NOVO' },
      { id: `${entity}-b`, tenantId: 'B', name: 'PRIVATE B', code: 'PRIVATE', scope: 'EXCLUSIVE', type: 'NOVO' },
      { id: `${entity}-global`, tenantId: null, name: 'SHARED', code: 'SHARED', scope: 'GLOBAL', type: 'NOVO' },
    ];
    db[entity] = {
      findFirst: vi.fn(async ({ where }: any) => rows.find(row => matches(row, where)) || null),
      create: vi.fn(async ({ data }: any) => { writes.push(data); return { id: `${entity}-new`, ...data }; }),
    };
  }
  const existing = { id: 'proposal-a', tenantId: 'A', deletedAt: null, version: 1, clientId: 'client-a', statusId: null, type: 'NOVO' };
  db.client = { findFirst: vi.fn(async ({ where }: any) => where.id === 'client-a' ? { id: 'client-a', cpf: '' } : null), update: vi.fn(), upsert: vi.fn() };
  db.proposalStatus = { findFirst: vi.fn(async () => null) };
  db.proposal = {
    findFirst: vi.fn(async ({ where }: any) => where.id === 'proposal-a' && where.tenantId === 'A' ? existing : null),
    create: vi.fn(async ({ data }: any) => ({ id: 'created', ...data, client: { cpf: '' } })),
    update: vi.fn(async ({ data }: any) => ({ ...existing, ...data })),
  };
  db.statusHistory = { create: vi.fn() };
  db.$transaction = vi.fn(async (action: any) => action(db));
  const resolvers = createProposalEntityResolvers(db);
  const dependencies: any = {
    prisma: db, proposalEntityResolvers: resolvers, InvalidProposalReference, hasPermission, normalizeProposalType,
    getAuthSession: vi.fn(async () => ({ effectiveTenantId: 'A', user: { id: 'actor', name: 'Synthetic', role: 'MASTER', customPermissions: [] } })),
    isValidCpf: () => true,
    PartnerSimulationTracking: { reconcile: vi.fn(async () => {}) },
    sseRegistry: { broadcastToTenant: vi.fn() },
    AuditLogService: { record: vi.fn(async () => {}) },
    centralEventBus: { publish: vi.fn(async () => {}) },
    BusinessNotificationService: {}, computeDelta: () => ({ oldDelta: {}, newDelta: {} }),
    logger: { error: vi.fn(), warn: vi.fn() },
  };
  for (const entity of entities) dependencies[`resolve${entity[0].toUpperCase()}${entity.slice(1)}Helper`] = (tenant: string, id?: string, name?: string) => resolvers.resolve(entity, tenant, id, name);
  return { db, writes, resolvers, dependencies };
}
function api(method: 'get' | 'post' | 'patch', path: string, dependencies: any) {
  const app = express(); app.use(express.json()); app[method](path, handler(method, path, dependencies)); return app;
}
function expectNoWrites(f: ReturnType<typeof fixture>) {
  expect(f.writes).toEqual([]);
  for (const entity of entities) expect(f.db[entity].create).not.toHaveBeenCalled();
  for (const write of [f.db.client.update, f.db.client.upsert, f.db.proposal.create, f.db.proposal.update, f.db.$transaction,
    f.dependencies.AuditLogService.record, f.dependencies.sseRegistry.broadcastToTenant]) expect(write).not.toHaveBeenCalled();
}

describe('proposal references: synthetic in-memory delegates only', () => {
  it.each(entities)('scopes %s IDs, codes and aliases; never redirects invalid IDs to a supplied name', async entity => {
    const f = fixture();
    expect((await f.resolvers.resolve(entity, 'A', `${entity}-a`))?.id).toBe(`${entity}-a`);
    expect((await f.resolvers.resolve(entity, 'A', 'LOCAL'))?.id).toBe(`${entity}-a`);
    const prefix = { bank: 'bank-', partner: 'part-', promoter: 'prom-', product: 'prod-', convenio: 'conv-' }[entity];
    expect((await f.resolvers.resolve(entity, 'A', `${prefix}LOCAL`))?.id).toBe(`${entity}-a`);
    for (const invalid of [`${entity}-b`, 'PRIVATE', 'missing-id', `${prefix}LO`, prefix]) {
      await expect(f.resolvers.resolve(entity, 'A', invalid, 'LOCAL A')).rejects.toBeInstanceOf(InvalidProposalReference);
    }
    expectNoWrites(f);
  });
  it.each(['product', 'convenio'] as const)('preserves global and own exclusive %s', async entity => {
    const f = fixture();
    expect((await f.resolvers.resolve(entity, 'A', `${entity}-global`))?.id).toBe(`${entity}-global`);
    expect((await f.resolvers.resolve(entity, 'A', 'SHARED'))?.id).toBe(`${entity}-global`);
    expect((await f.resolvers.resolve(entity, 'A', undefined, 'LOCAL A'))?.id).toBe(`${entity}-a`);
  });
  it('resolves the existing named bank alias by official code within the tenant', async () => {
    const f = fixture();
    f.db.bank.findFirst.mockImplementation(async ({ where }: any) => {
      const row = { id: 'synthetic-bank', tenantId: 'A', name: 'SYNTHETIC FINANCEIRA', code: '149' };
      return matches(row, where) ? row : null;
    });
    expect((await f.resolvers.resolve('bank', 'A', 'bank-facta'))?.id).toBe('synthetic-bank');
    await expect(f.resolvers.resolve('bank', 'B', 'bank-facta')).rejects.toBeInstanceOf(InvalidProposalReference);
    expectNoWrites(f);
  });
  it('preflights every reference before any name-only creation and rejects malformed inputs', async () => {
    const f = fixture();
    await expect(f.resolvers.validateReferences('A', { bankName: 'NEW SYNTHETIC', convenioId: 'convenio-b' })).rejects.toBeInstanceOf(InvalidProposalReference);
    await expect(f.resolvers.validateReferences('A', { partnerId: { id: 'partner-a' } })).rejects.toBeInstanceOf(InvalidProposalReference);
    await expect(f.resolvers.validateReferences('', {})).rejects.toBeInstanceOf(InvalidProposalReference);
    expectNoWrites(f);
  });
  it.each(entities)('preserves name-only creation for %s, after successful preflight', async entity => {
    const f = fixture(); await f.resolvers.validateReferences('A', { [`${entity}Name`]: 'NEW SYNTHETIC' });
    expectNoWrites(f);
    expect((await f.resolvers.resolve(entity, 'A', undefined, 'NEW SYNTHETIC'))?.id).toBe(`${entity}-new`);
    expect(f.db[entity].create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: 'A' }) }));
  });
});

describe.each(['post', 'patch'] as const)('actual %s proposal handler, injected dependencies', method => {
  const path = method === 'post' ? '/api/proposals' : '/api/proposals/:id';
  const url = method === 'post' ? '/api/proposals' : '/api/proposals/proposal-a';
  it.each(entities)('rejects cross-tenant %s before any writes', async entity => {
    const f = fixture();
    const res = await request(api(method, path, f.dependencies))[method](url).send({ clientId: 'client-a', bankName: 'NEW SYNTHETIC', [`${entity}Id`]: `${entity}-b` });
    expect(res.status).toBe(400); expectNoWrites(f);
  });
  it('preserves valid local references and global catalogs', async () => {
    const f = fixture();
    const res = await request(api(method, path, f.dependencies))[method](url).send({ clientId: 'client-a', bankId: 'bank-a', partnerId: 'partner-a', promoterId: 'promoter-a', productId: 'product-global', convenioId: 'convenio-global' });
    expect(res.status).toBe(method === 'post' ? 201 : 200);
    expect(res.body).toMatchObject({ bankId: 'bank-a', partnerId: 'partner-a', promoterId: 'promoter-a', productId: 'product-global', convenioId: 'convenio-global' });
  });
  it('preserves legacy aliases in POST/PATCH without catalog creation', async () => {
    const f = fixture();
    const res = await request(api(method, path, f.dependencies))[method](url).send({ clientId: 'client-a', bankId: 'bank-LOCAL', partnerId: 'part-LOCAL', promoterId: 'prom-LOCAL', productId: 'prod-SHARED', convenioId: 'conv-SHARED' });
    expect(res.status).toBe(method === 'post' ? 201 : 200);
    expect(res.body).toMatchObject({ bankId: 'bank-a', partnerId: 'partner-a', promoterId: 'promoter-a', productId: 'product-global', convenioId: 'convenio-global' });
    expect(f.writes).toEqual([]);
  });
  it('rejects a missing ID even when a valid name is supplied, with no fallback writes', async () => {
    const f = fixture();
    const res = await request(api(method, path, f.dependencies))[method](url).send({ clientId: 'client-a', productId: 'nonexistent-id', productName: 'SHARED' });
    expect(res.status).toBe(400); expectNoWrites(f);
  });
  it('rejects an invalid status before client or catalog writes', async () => {
    const f = fixture();
    const res = await request(api(method, path, f.dependencies))[method](url).send({ clientId: 'client-a', statusId: 'invalid-status', bankName: 'NEW SYNTHETIC' });
    expect(res.status).toBe(400); expectNoWrites(f);
  });
  it.each([401, 403])('denies unauthorized requests (%s) without effects', async expected => {
    const f = fixture(); f.dependencies.getAuthSession.mockResolvedValue(expected === 401 ? null : { effectiveTenantId: 'A', user: { role: 'DIGITADOR', customPermissions: ['clients.view'] } });
    const res = await request(api(method, path, f.dependencies))[method](url).send({ bankId: 'bank-a' });
    expect(res.status).toBe(expected); expectNoWrites(f);
  });
});

it('POST rejects an invalid explicit client rather than falling back to another client', async () => {
  const f = fixture();
  const res = await request(api('post', '/api/proposals', f.dependencies)).post('/api/proposals').send({ clientId: 'foreign-client', clientCpf: '00000000000', bankName: 'NEW SYNTHETIC' });
  expect(res.status).toBe(400); expectNoWrites(f);
});

it('PATCH refuses a proposal outside the effective tenant before catalog queries or writes', async () => {
  const f = fixture();
  const res = await request(api('patch', '/api/proposals/:id', f.dependencies)).patch('/api/proposals/proposal-b').send({ bankId: 'bank-a' });
  expect(res.status).toBe(404); expectNoWrites(f);
  expect(f.db.bank.findFirst).not.toHaveBeenCalled();
});

function assertPublicJson(value: any): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(key).not.toMatch(/password|token|secret|credential|session|customPermissions|mustChangePassword|mfa|otp/i);
    assertPublicJson(child);
  }
}
describe('actual timeline handler: public authors at every JSON level', () => {
  function timeline() {
    const f = fixture();
    const author = { id: 'author', name: 'Synthetic Author', passwordHash: 'SYNTHETIC_HASH', passwordResetToken: 'SYNTHETIC_TOKEN', passwordResetExpires: '2099-01-01', customPermissions: ['synthetic'] };
    function project(include: any) { return include.user === true ? author : Object.fromEntries(Object.keys(include.user.select).map(key => [key, (author as any)[key]])); }
    f.db.statusHistory.findMany = vi.fn(async ({ include }: any) => [{ id: 'history', createdAt: '2026-01-01', userId: author.id, user: project(include), status: { name: 'Synthetic' } }]);
    f.db.comment = { findMany: vi.fn(async ({ include }: any) => [{ id: 'comment', createdAt: '2026-01-02', text: 'Synthetic comment', userId: author.id, user: project(include) }]) };
    f.db.task = { findMany: vi.fn(async () => []) }; f.db.notification = { findMany: vi.fn(async () => []) };
    return f;
  }
  it.each(['', '?format=object', '?version-header'])('preserves ordering and authors without authentication fields (%s)', async format => {
    const f = timeline(); const req = request(api('get', '/api/proposals/:id/timeline', f.dependencies)).get('/api/proposals/proposal-a/timeline' + (format === '?version-header' ? '' : format));
    if (format === '?version-header') req.set('x-api-version', '2');
    const res = await req; expect(res.status).toBe(200); assertPublicJson(res.body);
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.map((item: any) => item.type)).toEqual(['COMMENT', 'STATUS']);
    for (const item of items) expect(item.data.user).toEqual({ id: 'author', name: 'Synthetic Author' });
    if (!Array.isArray(res.body)) expect(res.body.meta).toEqual({ partial: false, failedSources: [], total: 2 });
  });
  it.each([401, 403, 404])('preserves access boundary (%s)', async expected => {
    const f = timeline();
    if (expected === 401) f.dependencies.getAuthSession.mockResolvedValue(null);
    if (expected === 403) f.dependencies.getAuthSession.mockResolvedValue({ effectiveTenantId: 'A', user: { role: 'DIGITADOR', customPermissions: ['clients.view'] } });
    if (expected === 404) f.dependencies.getAuthSession.mockResolvedValue({ effectiveTenantId: 'B', user: { role: 'MASTER', customPermissions: [] } });
    const res = await request(api('get', '/api/proposals/:id/timeline', f.dependencies)).get('/api/proposals/proposal-a/timeline');
    expect(res.status).toBe(expected); expect(f.db.statusHistory.findMany).not.toHaveBeenCalled();
  });
  it('preserves a safe partial timeline when a source fails', async () => {
    const f = timeline(); f.db.comment.findMany.mockRejectedValue(new Error('Synthetic source failure'));
    const res = await request(api('get', '/api/proposals/:id/timeline', f.dependencies)).get('/api/proposals/proposal-a/timeline?format=object');
    expect(res.status).toBe(200); assertPublicJson(res.body);
    expect(res.body.meta).toEqual({ partial: true, failedSources: ['comments'], total: 1 });
  });
});
