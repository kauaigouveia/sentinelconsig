import { AsyncLocalStorage } from 'node:async_hooks';
import { hasPermission } from '../../src/lib/permissions.js';
import type { ProductSimulationInput } from './productSimulationService.js';

type Permit = { allowed: true; tenantId: string; userId: string; consentId?: string };
type Denied = { allowed: false; reason: 'RESTRICTED' };
const scope = new AsyncLocalStorage<Permit>();
export class V8CltPilot {
  static async authorize(db: any, tenantId: string, input: ProductSimulationInput): Promise<Permit | Denied> {
    const userId = /^user:([A-Za-z0-9_-]{1,100})$/.exec(input.bmgActorId || '')?.[1];
    if (!userId || !/^\d{11}$/.test(input.cpf)) return { allowed: false, reason: 'RESTRICTED' };
    const user = await db.user.findUnique({ where: { id: userId }, select: { active: true, deletedAt: true, role: true, tenantId: true, customPermissions: true, memberships: { where: { tenantId, active: true }, select: { role: true, customPermissions: true } } } });
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true, deletedAt: true } });
    const membership = user?.memberships?.[0], master = user?.role === 'PLATFORM_MASTER';
    const role = master ? user.role : membership?.role || user?.role, permissions = membership ? membership.customPermissions || [] : user?.customPermissions;
    if (!user?.active || user.deletedAt || !tenant || tenant.deletedAt || tenant.status !== 'ACTIVE' || /PARTNER|PARCEIRO/i.test(role || '') || !master && user.tenantId !== tenantId && !membership || !hasPermission(role, permissions, 'simulations.create')) return { allowed: false, reason: 'RESTRICTED' };
    return { allowed: true, userId, tenantId };
  }
  static within<T>(permit: Permit, execute: () => Promise<T>) { return scope.run(permit, execute); }
  static permitsRequest(tenantId: string) { return scope.getStore()?.tenantId === tenantId; }
  static withinConsent<T>(tenantId: string, consultId: string, execute: () => Promise<T>) { return scope.run({ allowed: true, tenantId, userId: 'verified-worker', consentId: consultId }, execute); }
  static permitsConsent(tenantId: string, consultId: string) { return scope.getStore()?.tenantId === tenantId && scope.getStore()?.consentId === consultId; }
}
