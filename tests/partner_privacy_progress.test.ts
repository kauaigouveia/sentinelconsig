import { describe, expect, it, vi } from 'vitest';
import { partnerPublicResponse } from '../server/services/partnerPublicResponse';
import { readFileSync } from 'node:fs';
vi.mock('../server/realtime.js', () => ({ sseRegistry: { broadcastToTenant: vi.fn() } }));
vi.mock('../server/services/passwordService.js', () => ({ hashPassword: vi.fn(async () => 'fictional-hash') }));
vi.mock('../server/services/partnerImportCredentials.js', () => ({ sealImportCredentials: vi.fn(() => 'fictional-encrypted') }));
import { ImportWorkerService } from '../server/services/importWorker';

describe('partner privacy and import progress (no database)', () => {
  it('removes private promoter bindings recursively without modifying internal data', () => {
    const input = { partner: { name: 'Fictício', promoter: { name: 'DG' }, promoterId: 'dg' }, proposals: [{ bank: 'FACTA', promotoraNome: 'DG', corresponde: 'ok', correspondenteBanqueiro: 'dg', value: 123 }] };
    expect(partnerPublicResponse(input)).toEqual({ partner: { name: 'Fictício' }, proposals: [{ bank: 'FACTA', corresponde: 'ok', value: 123 }] });
    expect(input.partner.promoterId).toBe('dg');
  });
  it('preserves dates and decimal serialization', () => {
    expect(partnerPublicResponse({ date: new Date('2026-01-01'), amount: { toJSON: () => '123.45' } })).toEqual({ date: '2026-01-01T00:00:00.000Z', amount: '123.45' });
  });
  it('does not seed promoters on startup or during listing', () => {
    const source = readFileSync('server.ts', 'utf8');
    expect(source).not.toMatch(/await ensureDefaultPromotersFor(AllTenants|Tenant)\(/);
    expect(source).toContain("app.use('/api/partner-portal'");
    expect(source).toContain('send(partnerPublicResponse(body))');
  });
  it('persists each committed row before processing the next partner', async () => {
    const job: any = { status: 'QUEUED', metadata: {}, fileName: 'fictional.csv' };
    const observed: number[] = [];
    const prisma: any = {
      importJob: { findUnique: vi.fn(async () => job), findUniqueOrThrow: vi.fn(async () => job), update: vi.fn(async ({ data }) => { Object.assign(job, data); return job; }) },
      promoter: { findMany: vi.fn(async () => [{ id: 'dg', name: 'DG' }]) },
      partner: { findUnique: vi.fn(async () => { observed.push(job.processedRecords || 0); return null; }), create: vi.fn(async () => ({ id: 'fictional-partner' })) },
      partnerPortalAccess: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    };
    prisma.$transaction = async (callback: any) => callback(prisma);
    await ImportWorkerService.processPartnersJob(prisma, 'job', 'tenant', 'user', [
      { name: 'Teste A', code: 'A', email: 'a@example.test', promoterName: 'DG' },
      { name: 'Teste B', code: 'B', email: 'b@example.test', promoterName: 'DG' },
    ]);
    expect(observed).toEqual([0, 1]);
    expect(job).toMatchObject({ status: 'COMPLETED', processedRecords: 2, createdRecords: 2, failedRecords: 0 });
    expect(prisma.partnerPortalAccess.create).toHaveBeenCalledTimes(2);
  });
  it('restores an explicitly reimported deleted partner and resets its revoked access', async () => {
    const job: any = { status: 'QUEUED', metadata: {}, fileName: 'fictional.csv' };
    const prisma: any = {
      importJob: { findUnique: vi.fn(async () => job), findUniqueOrThrow: vi.fn(async () => job), update: vi.fn(async ({ data }) => { Object.assign(job, data); return job; }) },
      promoter: { findMany: vi.fn(async () => []) },
      partner: { findUnique: vi.fn(async () => ({ id: 'partner', deletedAt: new Date(), promoterId: 'dg' })), update: vi.fn(async () => ({ id: 'partner' })) },
      partnerPortalAccess: { findFirst: vi.fn(async () => ({ id: 'access', partnerId: 'partner' })), update: vi.fn(async () => ({})) },
      partnerPortalSession: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    };
    prisma.$transaction = async (callback: any) => callback(prisma);
    await ImportWorkerService.processPartnersJob(prisma, 'job-restore', 'tenant', 'user', [{ name: 'Fictício', code: 'A', email: 'a@example.test' }]);
    expect(job).toMatchObject({ status: 'COMPLETED', updatedRecords: 1 });
    expect(prisma.partner.update.mock.calls[0][0].data.deletedAt).toBeNull();
    expect(prisma.partnerPortalAccess.update.mock.calls[0][0].data).toMatchObject({ active: true, mustChangePassword: true, passwordHash: 'fictional-hash' });
    expect(prisma.partnerPortalSession.deleteMany).toHaveBeenCalledWith({ where: { partnerPortalAccessId: 'access' } });
  });
});
