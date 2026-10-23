import { readFileSync } from 'node:fs';
import ts from 'typescript';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the current route callback, without importing the production bootstrap.
const source = ts.createSourceFile('server.ts', readFileSync(new URL('../server.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function callback(route: string, dependencies: Record<string, any>) {
  let text = '';
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'post'
      && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === route) text = node.arguments[node.arguments.length - 1].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); if (!text) throw Error(`Route missing: ${route}`);
  const js = ts.transpileModule(`(${text})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `return ${js}`)(...Object.values(dependencies));
}
const payload = { product: 'CLT', cpf: '52998224725', name: 'Pessoa sintética', phone: '11999999999', employerDocument: '12345678000100', factaRegistration: '00017000310042', mode: 'Payment', value: 1423.98, term: 24, eligibility: true, attemptKey: 'synthetic-attempt-00001' };
let session: any, permitted: boolean, run: ReturnType<typeof vi.fn>, record: ReturnType<typeof vi.fn>;
beforeEach(() => {
  session = { user: { id: 'user-a', role: 'SUPORTE', tenantId: 'tenant-a' }, effectiveTenantId: 'tenant-a' }; permitted = true;
  run = vi.fn(async (..._args: any[]) => ({ rows: [] })); record = vi.fn(async (..._args: any[]) => null);
});
function app() {
  const app = express(); app.use(express.json());
  const dependencies = {
    getAuthSession: async () => session, hasPermission: () => permitted, isValidCpf: (value: string) => value === payload.cpf,
    prisma: { simulationRequest: { findUnique: vi.fn(async () => null) } }, ProductSimulationService: { run },
    PartnerPortalService: { getPartnerSession: async () => session ? { tenant: { id: 'tenant-a' }, partner: { id: 'partner-a', code: 'SYN' }, access: { id: 'access-a', name: 'Sintético' } } : null },
    PartnerSimulationService: { run }, PartnerSimulationTracking: { record }, portabilityReviewMetadata: () => ({}), sseRegistry: { broadcastToTenant: vi.fn() },
  };
  for (const route of ['/api/simulations/products/:product/:action', '/api/partner-portal/simulations/:action']) app.post(route, callback(route, dependencies));
  return app;
}
describe('CLT route forwarding over HTTP, all business dependencies mocked', () => {
  it.each(['/api/simulations/products/clt/simulate', '/api/partner-portal/simulations/simulate'])('forwards registration and requested installment at %s', async path => {
    expect((await request(app()).post(path).send(payload)).status).toBe(200);
    const selected = path.includes('partner-portal') ? run.mock.calls[0][2] : run.mock.calls[0][4];
    expect(selected).toMatchObject({ employerDocument: payload.employerDocument, factaRegistration: payload.factaRegistration, value: 1423.98, mode: 'Payment' });
    expect(run.mock.calls[0][1]).toBe('tenant-a');
  });
  it.each([1, {}, 'A'.repeat(101), 'bad\nidentifier'])('rejects malformed registration %s before providers/persistence', async factaRegistration => {
    for (const path of ['/api/simulations/products/clt/simulate', '/api/partner-portal/simulations/simulate']) expect((await request(app()).post(path).send({ ...payload, factaRegistration })).status).toBe(400);
    expect(run).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  });
  it('preserves 401 and 403 before provider calls', async () => {
    session = null; expect((await request(app()).post('/api/simulations/products/clt/simulate').send(payload)).status).toBe(401);
    expect((await request(app()).post('/api/partner-portal/simulations/simulate').send(payload)).status).toBe(401);
    session = { user: { id: 'user-a' } }; permitted = false;
    expect((await request(app()).post('/api/simulations/products/clt/simulate').send(payload)).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });
});
