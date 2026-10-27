import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ProductSimulationInput } from './productSimulationService.js';

type Permit = { allowed: true; tenantId: string; userId: string };
type Denied = { allowed: false; reason: 'RESTRICTED' | 'CASE_REQUIRED' };
const scope = new AsyncLocalStorage<Permit>();
const id = (s?: string) => !!s && /^[A-Za-z0-9_-]{1,100}$/.test(s) && !['all', '*'].includes(s.toLowerCase());
export class V8CltPilot {
  static matches(tenantId: string, actor?: string) {
    const user = process.env.V8_CLT_PILOT_USER_ID, tenant = process.env.V8_CLT_PILOT_TENANT_ID;
    return id(user) && id(tenant) && tenant === tenantId && actor === `user:${user}`;
  }
  static caseReady() { return /^[a-f0-9]{64}$/i.test(process.env.V8_CLT_PILOT_CASE_SHA256 || ''); }
  static async authorize(db: any, tenantId: string, input: ProductSimulationInput): Promise<Permit | Denied> {
    if (!this.matches(tenantId, input.bmgActorId)) return { allowed: false, reason: 'RESTRICTED' };
    const expected = process.env.V8_CLT_PILOT_CASE_SHA256 || '';
    if (!this.caseReady() || !/^\d{11}$/.test(input.cpf)) return { allowed: false, reason: 'CASE_REQUIRED' };
    const digest = createHash('sha256').update(input.cpf).digest();
    if (!timingSafeEqual(digest, Buffer.from(expected, 'hex'))) return { allowed: false, reason: 'CASE_REQUIRED' };
    const userId = process.env.V8_CLT_PILOT_USER_ID!;
    const user = await db.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
    if (!user?.active || !['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN'].includes(user.role)) return { allowed: false, reason: 'RESTRICTED' };
    return { allowed: true, userId, tenantId };
  }
  static within<T>(permit: Permit, execute: () => Promise<T>) { return scope.run(permit, execute); }
  static permitsRequest(tenantId: string) { return scope.getStore()?.tenantId === tenantId; }
}
