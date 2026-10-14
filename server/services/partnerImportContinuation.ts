import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { ImportWorkerService, ImportPartnerRow } from './importWorker.js';
import { openImportCredentials } from './partnerImportCredentials.js';

const LEASE_MS = 90_000; // Longer than the deployment's 60-second hard timeout.
const metadataOf = (job: any): Record<string, any> => job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata) ? job.metadata : {};
const unchanged = (job: any) => ({ processedRecords: job.processedRecords, metadata: { equals: job.metadata === null ? Prisma.DbNull : job.metadata } });
export function partnerRowsDigest(rows: ImportPartnerRow[]) { return createHash('sha256').update(JSON.stringify(rows)).digest('hex'); }

/** Recover only the same operator's exact batch; never infer ownership from file name alone. */
export async function createOrResumePartnerImport(prisma: PrismaClient, tenantId: string, userId: string, rows: ImportPartnerRow[], fileName: string, fileSize: number) {
  const digest = partnerRowsDigest(rows);
  const candidates = await prisma.importJob.findMany({ where: { tenantId, userId, type: 'PARTNERS', status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, orderBy: { createdAt: 'desc' }, take: 10 });
  for (const job of candidates) {
    const metadata = metadataOf(job);
    if (metadata.partnerRowsDigest === digest) {
      if (job.status === 'FAILED') {
        const restartMetadata = { ...metadata };
        delete restartMetadata.partnerLeaseToken; delete restartMetadata.partnerLeaseUntil; delete restartMetadata.cancellationRequested;
        const restarted = await prisma.importJob.updateMany({ where: { id: job.id, tenantId, userId, ...unchanged(job), status: 'FAILED' }, data: { status: 'QUEUED', errorMessage: null, completedAt: null, metadata: restartMetadata } });
        if (!restarted.count) throw new Error('O lote mudou. Aguarde e tente retomar novamente.');
      }
      return job;
    }
    // Upgrade jobs left by the old unbounded worker, only with a verified committed prefix.
    if (job.status !== 'PROCESSING' || job.totalRecords !== rows.length || job.processedRecords <= 0 || job.invalidRecords || job.failedRecords || !metadata.credentials || Date.now() - (job.startedAt || job.createdAt).getTime() < LEASE_MS) continue;
    let committed;
    try { committed = openImportCredentials(metadata.credentials); } catch { continue; }
    if (committed.length !== job.processedRecords || !committed.every((row, i) => row.code === rows[i]?.code && row.email === rows[i]?.email && row.name === rows[i]?.name)) continue;
    const updated = await prisma.importJob.updateMany({ where: { id: job.id, tenantId, userId, ...unchanged(job), status: 'PROCESSING' }, data: { metadata: { ...metadata, partnerRows: rows as any, partnerRowsDigest: digest } } });
    if (!updated.count) throw new Error('O lote está sendo atualizado. Aguarde e tente retomar novamente.');
    return job;
  }
  return prisma.importJob.create({ data: { tenantId, userId, type: 'PARTNERS', fileName, fileSize, status: 'QUEUED', totalRecords: rows.length, metadata: { partnerRows: rows as any, partnerRowsDigest: digest } } });
}

/** One bounded request at a time, with an expiring database lease for interrupted requests. */
export async function continuePartnerImport(prisma: PrismaClient, jobId: string, tenantId: string, userId: string) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId, userId, type: 'PARTNERS' } });
  if (!job) throw Object.assign(new Error('Importação não encontrada.'), { statusCode: 404 });
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return { busy: false };
  const metadata = metadataOf(job);
  if (!Array.isArray(metadata.partnerRows)) throw Object.assign(new Error('Reabra a importação e carregue a mesma planilha para retomar o lote antigo.'), { statusCode: 409 });
  if (Number(metadata.partnerLeaseUntil) > Date.now()) return { busy: true };
  const token = randomUUID();
  const claimed = await prisma.importJob.updateMany({ where: { id: jobId, tenantId, userId, ...unchanged(job), status: { in: ['QUEUED', 'PROCESSING'] } }, data: { metadata: { ...metadata, partnerLeaseToken: token, partnerLeaseUntil: Date.now() + LEASE_MS } } });
  if (!claimed.count) return { busy: true };
  try {
    await ImportWorkerService.processPartnersJob(prisma, jobId, tenantId, userId, metadata.partnerRows, { resume: true, maxRecords: 10, maxDurationMs: 20_000 });
  } finally {
    const current = await prisma.importJob.findFirst({ where: { id: jobId, tenantId, userId, type: 'PARTNERS' } });
    if (current && metadataOf(current).partnerLeaseToken === token) {
      const updatedMetadata = { ...metadataOf(current) };
      delete updatedMetadata.partnerLeaseToken; delete updatedMetadata.partnerLeaseUntil;
      await prisma.importJob.updateMany({ where: { id: jobId, tenantId, userId, ...unchanged(current) }, data: { metadata: updatedMetadata } });
    }
  }
  return { busy: false };
}

/** Cancellation must not overwrite credentials committed since the cancel screen loaded. */
export async function cancelPartnerImport(prisma: PrismaClient, jobId: string, tenantId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId, type: 'PARTNERS' } });
    if (!job || ['COMPLETED', 'FAILED'].includes(job.status)) return false;
    if (job.status === 'CANCELLED') return true;
    const cancelled = await prisma.importJob.updateMany({ where: { id: jobId, tenantId, ...unchanged(job), status: job.status }, data: {
      metadata: { ...metadataOf(job), cancellationRequested: true },
      status: 'CANCELLED', cancelledAt: new Date(),
    } });
    if (cancelled.count) return true;
  }
  return false;
}
