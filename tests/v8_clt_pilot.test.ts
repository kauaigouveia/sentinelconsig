import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { V8CltPilot } from '../server/services/v8CltPilot';
import { V8CltSimulationService } from '../server/services/v8CltSimulationService';
import { V8BankService } from '../server/services/v8BankService';

const input = { cpf: '00000000000', name: 'Pessoa sintética', phone: '11900000000', value: 1, term: 24, mode: 'Payment' as const, eligibility: true, bmgActorId: 'user:pilot-a' };
const db = { user: { findUnique: vi.fn(async () => ({ active: true, role: 'MASTER' })) }, systemConfig: { findMany: vi.fn() } };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('V8_CLT_PILOT_USER_ID', 'pilot-a'); vi.stubEnv('V8_CLT_PILOT_TENANT_ID', 'tenant-a'); vi.stubEnv('V8_CLT_PILOT_CASE_SHA256', createHash('sha256').update(input.cpf).digest('hex'));
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Real bank forbidden'); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it.each(['V8_CLT_PILOT_USER_ID', 'V8_CLT_PILOT_TENANT_ID', 'V8_CLT_PILOT_CASE_SHA256'])('fails closed without %s', async key => {
  vi.stubEnv(key, ''); expect((await V8CltSimulationService.run(db, 'tenant-a', 'REFRESH', input))[0].outcome).toBe('UNSUPPORTED');
  expect(db.systemConfig.findMany).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('does not grant access by administrator role, tenant alone or partner identity', async () => {
  for (const [tenant, actor] of [['tenant-b', input.bmgActorId], ['tenant-a', 'user:other-admin'], ['tenant-a', 'partner:pilot-a']]) {
    expect((await V8CltPilot.authorize(db, tenant, { ...input, bmgActorId: actor })).allowed).toBe(false);
  }
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
it('accepts only the approved case and the active explicit principal', async () => {
  expect((await V8CltPilot.authorize(db, 'tenant-a', { ...input, cpf: '11111111111' })).allowed).toBe(false);
  expect((await V8CltPilot.authorize(db, 'tenant-a', input)).allowed).toBe(true);
  db.user.findUnique.mockResolvedValueOnce({ active: false, role: 'MASTER' }); expect((await V8CltPilot.authorize(db, 'tenant-a', input)).allowed).toBe(false);
  db.user.findUnique.mockResolvedValueOnce({ active: true, role: 'DIGITADOR' }); expect((await V8CltPilot.authorize(db, 'tenant-a', input)).allowed).toBe(false);
});
it('blocks ambiguous simulation before credentials, OAuth, precalculation or simulation POST', async () => {
  const token = vi.spyOn(V8BankService, 'token');
  const result = await V8CltSimulationService.run(db, 'tenant-a', 'SIMULATE', input);
  expect(result[0].message).toContain('pré-cálculo'); expect(token).not.toHaveBeenCalled();
  expect(db.systemConfig.findMany).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('requires an authorized server-side request context even for direct adapter requests', async () => {
  await expect(V8CltSimulationService.request(db, 'tenant-a', 'p', '/private-consignment/consult')).rejects.toThrow();
  await expect(V8CltSimulationService.request(db, 'tenant-a', 'p', '/private-consignment/simulation', {})).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
