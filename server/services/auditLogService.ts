import { PrismaClient, Prisma } from '@prisma/client';
import express from 'express';
import crypto from 'crypto';
import { logger } from '../logger.js';

export interface AuditLogEntryParams {
  tenantId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: any;
  previousData?: any;
  newData?: any;
  req?: express.Request;
  ipAddress?: string | null;
  createdAt?: Date;
  tx?: Prisma.TransactionClient;
}

export interface AuditIntegrityVerificationResult {
  valid: boolean;
  status: 'VALID' | 'INVALID';
  checkedCount: number;
  tenantId: string | null;
  error?: string;
  brokenAtId?: string;
  expectedPreviousHash?: string | null;
  actualPreviousHash?: string | null;
  expectedRecordHash?: string;
  actualRecordHash?: string;
}

// Sensitive key patterns to redact
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'passwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'setcookie',
  'secret',
  'apikey',
  'connectionstring',
  'database_url',
  'direct_url',
  'clientsecret',
  'filebase64',
  'buffer',
  'blob',
  'binary',
]);

/**
 * Masks CPF: 123.456.789-00 -> 123.***.***-00
 */
export function maskCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
  }
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
  }
  return '***';
}

/**
 * Masks Phone: (11) 98765-4321 -> (11) 9****-**21
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}****-**${digits.slice(-2)}`;
  }
  return '***';
}

/**
 * Masks Email: user@domain.com -> u***@domain.com
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return email || null;
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `*@${domain}`;
  }
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

/**
 * Recursively sanitizes objects to remove credentials, secrets, binary payloads,
 * and selectively mask PII in audit log snapshots.
 */
export function sanitizeAuditData(data: any): any {
  if (data === null || data === undefined) return null;

  if (typeof data === 'string') {
    // If it looks like raw base64 data (> 500 chars without spaces), truncate/censor
    if (data.length > 500 && !data.includes(' ')) {
      return '[TRUNCATED_BINARY_OR_BASE64]';
    }
    return data;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 100).map(item => sanitizeAuditData(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase().replace(/[-_]/g, '');

      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      if (lowerKey === 'cpf' || lowerKey === 'clientcpf') {
        sanitized[key] = typeof value === 'string' ? maskCPF(value) : value;
        continue;
      }

      if (lowerKey === 'phone' || lowerKey === 'telephone' || lowerKey === 'celular') {
        sanitized[key] = typeof value === 'string' ? maskPhone(value) : value;
        continue;
      }

      if (lowerKey === 'email' && typeof value === 'string') {
        sanitized[key] = maskEmail(value);
        continue;
      }

      // Skip heavy properties
      if (lowerKey === 'filebase64' || (lowerKey === 'content' && typeof value === 'string' && value.length > 500)) {
        sanitized[key] = '[PAYLOAD_OMITTED]';
        continue;
      }

      sanitized[key] = sanitizeAuditData(value);
    }
    return sanitized;
  }

  return String(data);
}

/**
 * Extracts real client IP safely adhering to Express trust proxy.
 */
export function extractClientIp(req?: express.Request): string {
  if (!req) return '127.0.0.1';
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Extracts sanitized User-Agent header safely.
 */
export function extractUserAgent(req?: express.Request): string {
  if (!req) return 'Unknown';
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string') {
    return ua.slice(0, 255);
  }
  return 'Unknown';
}

/**
 * Computes minimal delta between two objects (oldData vs newData).
 * Only includes keys that changed or are identifying keys (e.g. id, proposalNumber).
 */
export function computeDelta(
  oldObj: Record<string, any> | null | undefined,
  newObj: Record<string, any> | null | undefined,
  identifyingKeys: string[] = ['id', 'proposalNumber', 'name']
): { oldDelta: Record<string, any>; newDelta: Record<string, any> } {
  const oldDelta: Record<string, any> = {};
  const newDelta: Record<string, any> = {};

  if (!oldObj && !newObj) {
    return { oldDelta, newDelta };
  }

  if (!oldObj && newObj) {
    return { oldDelta: {}, newDelta: sanitizeAuditData(newObj) };
  }

  if (oldObj && !newObj) {
    return { oldDelta: sanitizeAuditData(oldObj), newDelta: {} };
  }

  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

  for (const key of allKeys) {
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];

    // Check if identifying key
    if (identifyingKeys.includes(key)) {
      if (oldVal !== undefined) oldDelta[key] = oldVal;
      if (newVal !== undefined) newDelta[key] = newVal;
      continue;
    }

    // Skip internal metadata comparisons if identical
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      if (oldVal !== undefined) oldDelta[key] = oldVal;
      if (newVal !== undefined) newDelta[key] = newVal;
    }
  }

  return {
    oldDelta: sanitizeAuditData(oldDelta),
    newDelta: sanitizeAuditData(newDelta),
  };
}

/**
 * Computes deterministic canonical SHA-256 hash for an AuditLog entry.
 */
export function computeCanonicalRecordHash(params: {
  id: string;
  tenantId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: string | null;
  newData?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  previousHash?: string | null;
}): string {
  const createdAtIso = typeof params.createdAt === 'string'
    ? new Date(params.createdAt).toISOString()
    : params.createdAt.toISOString();

  const canonicalPayload = {
    id: params.id,
    tenantId: params.tenantId || null,
    userId: params.userId || null,
    userName: params.userName || null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId || null,
    oldData: params.oldData || null,
    newData: params.newData || null,
    ipAddress: params.ipAddress || null,
    createdAt: createdAtIso,
    previousHash: params.previousHash || null,
  };

  // Sort keys alphabetically for strictly deterministic JSON serialization
  const sortedKeys = Object.keys(canonicalPayload).sort() as (keyof typeof canonicalPayload)[];
  const sortedPayload: Record<string, any> = {};
  for (const k of sortedKeys) {
    sortedPayload[k] = canonicalPayload[k];
  }

  const serialized = JSON.stringify(sortedPayload);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/**
 * Sequential concurrency queue per tenant to avoid hash-chain branching in high-concurrency environments.
 */
class TenantChainQueue {
  private static queues: Map<string, Promise<any>> = new Map();

  public static async execute<T>(tenantKey: string, fn: () => Promise<T>): Promise<T> {
    const currentQueue = this.queues.get(tenantKey) || Promise.resolve();
    let resolveNext: (value?: any) => void;
    const nextQueue = new Promise((resolve) => {
      resolveNext = resolve;
    });

    this.queues.set(tenantKey, nextQueue);

    try {
      await currentQueue;
      return await fn();
    } finally {
      resolveNext!();
      if (this.queues.get(tenantKey) === nextQueue) {
        this.queues.delete(tenantKey);
      }
    }
  }
}

/**
 * In-memory Dead Letter Queue (DLQ) for failed audit log records to avoid silent loss.
 */
export interface FailedAuditRecord {
  timestamp: string;
  error: string;
  params: AuditLogEntryParams;
}

/**
 * Robust, resilient audit logger that records events to PostgreSQL `AuditLog`
 * with cryptographic SHA-256 hash chains, DB-level immutability enforcement,
 * and concurrency protection per tenant.
 */
export class AuditLogService {
  private static failedQueue: FailedAuditRecord[] = [];
  private static readonly MAX_FAILED_QUEUE_SIZE = 500;

  /**
   * Retrieves all failed audit records in the in-memory DLQ.
   */
  public static getFailedQueue(): FailedAuditRecord[] {
    return [...this.failedQueue];
  }

  /**
   * Clears or flushes the DLQ after review/remediation.
   */
  public static clearFailedQueue(): void {
    this.failedQueue = [];
  }

  /**
   * Centralized method to record an audit log with cryptographic hash chain
   * using PostgreSQL transactional advisory locks per tenant for distributed concurrency
   * combined with local in-memory serialization to optimize connection pool usage.
   */
  public static async record(
    prisma: PrismaClient | Prisma.TransactionClient,
    params: AuditLogEntryParams
  ): Promise<any> {
    const tenantKey = params.tenantId || 'GLOBAL';

    return TenantChainQueue.execute(tenantKey, async () => {
      const executeRecordLogic = async (tx: Prisma.TransactionClient) => {
        // Acquire PostgreSQL transactional advisory lock per tenant
        // hashtext('audit_chain_' || tenantKey) returns a tenant-specific 32-bit int lock key
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'audit_chain_' + tenantKey}));`;

        const {
          tenantId,
          userId,
          userName,
          action,
          entity,
          entityId,
          oldData,
          newData,
          req,
          ipAddress,
          createdAt = new Date(),
        } = params;

        const finalIp = ipAddress || extractClientIp(req);
        const resolvedOld = oldData !== undefined ? oldData : params.previousData;
        const sanitizedOld = resolvedOld !== undefined && resolvedOld !== null
          ? (typeof resolvedOld === 'string' ? resolvedOld : JSON.stringify(sanitizeAuditData(resolvedOld)))
          : null;
        const sanitizedNew = newData !== undefined && newData !== null
          ? (typeof newData === 'string' ? newData : JSON.stringify(sanitizeAuditData(newData)))
          : null;

        // Fetch last log of this tenant inside the locked transaction
        const lastLog = await tx.auditLog.findFirst({
          where: { tenantId: tenantId || null },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, recordHash: true },
        });

        const previousHash = lastLog?.recordHash || null;
        const recordId = `audit_${crypto.randomBytes(12).toString('hex')}`;

        // Compute canonical SHA-256 hash before insertion
        const recordHash = computeCanonicalRecordHash({
          id: recordId,
          tenantId: tenantId || null,
          userId: userId || null,
          userName: userName || (userId ? 'Usuário' : 'Sistema'),
          action,
          entity,
          entityId: entityId ? String(entityId) : null,
          oldData: sanitizedOld,
          newData: sanitizedNew,
          ipAddress: finalIp,
          createdAt,
          previousHash,
        });

        const createdLog = await tx.auditLog.create({
          data: {
            id: recordId,
            tenantId: tenantId || null,
            userId: userId || null,
            userName: userName || (userId ? 'Usuário' : 'Sistema'),
            action,
            entity,
            entityId: entityId ? String(entityId) : null,
            oldData: sanitizedOld,
            newData: sanitizedNew,
            ipAddress: finalIp,
            previousHash,
            recordHash,
            createdAt,
          },
        });

        return createdLog;
      };

      try {
        if (params.tx) {
          return await executeRecordLogic(params.tx);
        }

        // Execute within interactive transaction to guarantee advisory lock scope
        return await (prisma as PrismaClient).$transaction(
          async (tx) => {
            return await executeRecordLogic(tx);
          },
          { timeout: 20000, maxWait: 10000 }
        );
      } catch (err: any) {
        // Enqueue to in-memory DLQ
        const failedRecord: FailedAuditRecord = {
          timestamp: new Date().toISOString(),
          error: err?.message || String(err),
          params: { ...params, oldData: '[SUPPRESSED]', newData: '[SUPPRESSED]' },
        };

        if (this.failedQueue.length >= this.MAX_FAILED_QUEUE_SIZE) {
          this.failedQueue.shift();
        }
        this.failedQueue.push(failedRecord);

        logger.error(
          {
            error: err?.message || String(err),
            action: params.action,
            entity: params.entity,
            tenantId: params.tenantId,
            userId: params.userId,
            queueLength: this.failedQueue.length,
          },
          '[AUDIT_LOG_RECORD_FAILURE] Falha ao registrar log de auditoria com hash chain'
        );

        if (params.tx) {
          throw err;
        }

        return null;
      }
    });
  }

  /**
   * Verifies cryptographic hash chain integrity for a given tenant or the global chain.
   */
  public static async verifyAuditLogIntegrity(
    prisma: PrismaClient | Prisma.TransactionClient,
    tenantId?: string | null
  ): Promise<AuditIntegrityVerificationResult> {
    const targetTenantId = tenantId || null;

    const logs = await (prisma as PrismaClient).auditLog.findMany({
      where: { tenantId: targetTenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (logs.length === 0) {
      return {
        valid: true,
        status: 'VALID',
        checkedCount: 0,
        tenantId: targetTenantId,
      };
    }

    let currentExpectedPreviousHash: string | null = null;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];

      // 1. Verify previousHash matches previous record's recordHash
      if (log.previousHash !== currentExpectedPreviousHash) {
        return {
          valid: false,
          status: 'INVALID',
          checkedCount: i + 1,
          tenantId: targetTenantId,
          error: `Cadeia de integridade rompida: previousHash incorreto no registro ${log.id}`,
          brokenAtId: log.id,
          expectedPreviousHash: currentExpectedPreviousHash,
          actualPreviousHash: log.previousHash,
          actualRecordHash: log.recordHash || undefined,
        };
      }

      // 2. Recompute canonical hash of this record
      const expectedRecordHash = computeCanonicalRecordHash({
        id: log.id,
        tenantId: log.tenantId,
        userId: log.userId,
        userName: log.userName,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        oldData: log.oldData,
        newData: log.newData,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
        previousHash: log.previousHash,
      });

      if (log.recordHash !== expectedRecordHash) {
        return {
          valid: false,
          status: 'INVALID',
          checkedCount: i + 1,
          tenantId: targetTenantId,
          error: `Adulteração detectada: hash do registro ${log.id} diverge da assinatura canônica calculada`,
          brokenAtId: log.id,
          expectedRecordHash,
          actualRecordHash: log.recordHash || undefined,
        };
      }

      // Advance chain
      currentExpectedPreviousHash = log.recordHash;
    }

    return {
      valid: true,
      status: 'VALID',
      checkedCount: logs.length,
      tenantId: targetTenantId,
    };
  }

  /**
   * Ensures PostgreSQL triggers for UPDATE and DELETE block are registered.
   */
  public static async ensureDatabaseImmutabilityTriggers(prisma: PrismaClient): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION enforce_audit_log_immutability()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Audit logs cannot be updated or deleted.';
        END;
        $$ LANGUAGE plpgsql;
      `);

      await prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_log_immutable_update'
          ) THEN
            CREATE TRIGGER trg_audit_log_immutable_update
            BEFORE UPDATE ON "audit_logs"
            FOR EACH ROW
            EXECUTE FUNCTION enforce_audit_log_immutability();
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_log_immutable_delete'
          ) THEN
            CREATE TRIGGER trg_audit_log_immutable_delete
            BEFORE DELETE ON "audit_logs"
            FOR EACH ROW
            EXECUTE FUNCTION enforce_audit_log_immutability();
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_log_immutable_truncate'
          ) THEN
            CREATE TRIGGER trg_audit_log_immutable_truncate
            BEFORE TRUNCATE ON "audit_logs"
            FOR EACH STATEMENT
            EXECUTE FUNCTION enforce_audit_log_immutability();
          END IF;
        END $$;
      `);
      logger.info('[AUDIT_IMMUTABILITY] Triggers de imutabilidade do PostgreSQL validados e ativos.');
    } catch (err: any) {
      logger.warn({ error: err?.message }, '[AUDIT_IMMUTABILITY] Aviso ao registrar triggers no PostgreSQL');
    }
  }
}
