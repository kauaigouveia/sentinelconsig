import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/realtime.js', () => ({ sseRegistry: { broadcastToTenant: vi.fn() } }));
vi.mock('../server/services/passwordService.js', () => ({ hashPassword: vi.fn(async () => 'fictional-hash') }));
import { ImportWorkerService } from '../server/services/importWorker';
import { createOrResumePartnerImport, continuePartnerImport, partnerRowsDigest, cancelPartnerImport } from '../server/services/partnerImportContinuation';
import { openImportCredentials, sealImportCredentials } from '../server/services/partnerImportCredentials';
beforeEach(() => vi.stubEnv('JWT_SECRET', 'fictional-unit-test-only-secret'));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const rows = Array.from({ length: 82 }, (_, i) => ({ name: `Fictício ${i}`, code: `TEST${i}`, email: `test${i}@example.test` }));
function fixture(offset = 0, legacy = false) {
  const credentials = rows.slice(0, offset).map(row => ({ ...row, password: '', status: 'Acesso existente; senha preservada' }));
  const job: any = { id: 'job', tenantId: 'tenant', userId: 'user', type: 'PARTNERS', fileName: 'fictional.xlsx', status: offset ? 'PROCESSING' : 'QUEUED', processedRecords: offset, createdRecords: 0, updatedRecords: offset, failedRecords: 0, invalidRecords: 0, totalRecords: 82, createdAt: new Date(), updatedAt: new Date(Date.now() - 100000), metadata: legacy ? {} : { partnerRows: rows, partnerRowsDigest: partnerRowsDigest(rows) } };
  if (offset) job.metadata.credentials = sealImportCredentials(credentials);
  if (legacy) job.startedAt = new Date(Date.now() - 100000);
  const partners = new Map(rows.slice(0, offset).map(row => [row.code, { ...row, id: row.code, deletedAt: null }]));
  const accesses = new Map(rows.slice(0, offset).map(row => [row.email, { id: `access-${row.code}`, partnerId: row.code }]));
  let version = Date.now();
  const update = (data: any) => { Object.assign(job, data, { updatedAt: new Date(++version) }); return structuredClone(job); };
  const prisma: any = {
    importJob: {
      findUnique: vi.fn(async () => structuredClone(job)), findUniqueOrThrow: vi.fn(async () => structuredClone(job)),
      findFirst: vi.fn(async ({ where }) => where.tenantId === job.tenantId && (!where.userId || where.userId === job.userId) ? structuredClone(job) : null),
      findMany: vi.fn(async ({ where }) => where.tenantId === job.tenantId && where.userId === job.userId ? [structuredClone(job)] : []),
      update: vi.fn(async ({ data }) => update(data)),
      updateMany: vi.fn(async ({ where, data }) => { if (where.processedRecords !== job.processedRecords || JSON.stringify(where.metadata.equals) !== JSON.stringify(job.metadata)) return { count: 0 }; update(data); return { count: 1 }; }),
      create: vi.fn(async () => { throw new Error('Unexpected duplicate job'); }),
    },
    promoter: { findMany: vi.fn(async () => []) },
    partner: {
      findUnique: vi.fn(async ({ where }) => partners.get(where.tenantId_code.code) || null),
      create: vi.fn(async ({ data }) => { const partner = { ...data, id: data.code }; partners.set(data.code, partner); return partner; }),
      update: vi.fn(async ({ where, data }) => { const partner = { ...partners.get(where.id), ...data }; partners.set(where.id, partner); return partner; }),
    },
    partnerPortalAccess: { findFirst: vi.fn(async ({ where }) => accesses.get(where.email.equals) || null), create: vi.fn(async ({ data }) => { accesses.set(data.email, { ...data, id: data.email }); return data; }) },
  };
  prisma.$transaction = async (callback: any) => callback(prisma);
  return { prisma, job, partners };
}
describe('bounded partner imports, exclusively in memory', () => {
  it('completes all 82 records across steps without repeating accounts or losing credentials', async () => {
    const { prisma, job, partners } = fixture();
    for (let step = 0; step < 9; step++) {
      await continuePartnerImport(prisma, 'job', 'tenant', 'user');
      expect(job.processedRecords).toBe(Math.min((step + 1) * 10, 82));
      expect(job.status).toBe(step === 8 ? 'COMPLETED' : 'PROCESSING');
    }
    expect(partners.size).toBe(82); expect(prisma.partnerPortalAccess.create).toHaveBeenCalledTimes(82);
    expect(openImportCredentials(job.metadata.credentials)).toHaveLength(82);
    expect(job.failedRecords).toBe(0);
    await continuePartnerImport(prisma, 'job', 'tenant', 'user');
    expect(prisma.partnerPortalAccess.create).toHaveBeenCalledTimes(82);
  });
  it('recovers the legacy 38/82 prefix and processes only the remaining 44', async () => {
    const { prisma, job } = fixture(38, true);
    const original = openImportCredentials(job.metadata.credentials);
    const recovered = await createOrResumePartnerImport(prisma, 'tenant', 'user', rows, 'fictional.xlsx', 0);
    expect(recovered.id).toBe('job'); expect(prisma.importJob.create).not.toHaveBeenCalled();
    for (let step = 0; step < 5; step++) await continuePartnerImport(prisma, 'job', 'tenant', 'user');
    expect(job).toMatchObject({ status: 'COMPLETED', processedRecords: 82, updatedRecords: 38, createdRecords: 44 });
    expect(prisma.partner.update).not.toHaveBeenCalled();
    expect(openImportCredentials(job.metadata.credentials).slice(0, 38)).toEqual(original);
  });
  it('blocks concurrent requests while a step owns the lease', async () => {
    const { prisma, job } = fixture();
    let release!: () => void;
    const worker = vi.spyOn(ImportWorkerService, 'processPartnersJob').mockImplementation(async () => new Promise<void>(resolve => { release = resolve; }));
    const first = continuePartnerImport(prisma, 'job', 'tenant', 'user');
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(1));
    expect(await continuePartnerImport(prisma, 'job', 'tenant', 'user')).toEqual({ busy: true });
    release(); await first;
    expect(job.metadata.partnerLeaseToken).toBeUndefined();
  });
  it('rejects a foreign tenant or operator before processing anything', async () => {
    const { prisma } = fixture();
    await expect(continuePartnerImport(prisma, 'job', 'other-tenant', 'user')).rejects.toMatchObject({ statusCode: 404 });
    await expect(continuePartnerImport(prisma, 'job', 'tenant', 'other-user')).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.partner.create).not.toHaveBeenCalled();
  });
  it('reclaims a lease after an interrupted request has expired', async () => {
    const { prisma, job } = fixture();
    job.metadata.partnerLeaseToken = 'expired'; job.metadata.partnerLeaseUntil = Date.now() - 1;
    await continuePartnerImport(prisma, 'job', 'tenant', 'user');
    expect(job.processedRecords).toBe(10); expect(job.metadata.partnerLeaseToken).toBeUndefined();
  });
  it('cancels a paused step without discarding its committed credentials', async () => {
    const { prisma, job } = fixture(38);
    const credentials = job.metadata.credentials;
    expect(await cancelPartnerImport(prisma, 'job', 'tenant')).toBe(true);
    expect(job.status).toBe('CANCELLED'); expect(job.metadata.credentials).toBe(credentials);
    await continuePartnerImport(prisma, 'job', 'tenant', 'user');
    expect(job.processedRecords).toBe(38); expect(prisma.partner.create).not.toHaveBeenCalled();
  });
  it('resumes an explicitly retried failed job from the saved cursor', async () => {
    const { prisma, job } = fixture(38);
    job.status = 'FAILED';
    await createOrResumePartnerImport(prisma, 'tenant', 'user', rows, 'fictional.xlsx', 0);
    await continuePartnerImport(prisma, 'job', 'tenant', 'user');
    expect(job.processedRecords).toBe(48); expect(prisma.partner.create).toHaveBeenCalledTimes(10);
  });
});
