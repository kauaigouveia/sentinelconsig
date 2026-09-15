import { PrismaClient, Prisma } from '@prisma/client';
import express from 'express';
import { logger } from '../logger.js';

export interface AuditLogEntryParams {
  tenantId?: string | null;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: any;
  newData?: any;
  req?: express.Request;
  ipAddress?: string | null;
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
    // If it looks like raw base64 data (> 1000 chars without spaces), truncate/censor
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
      if (lowerKey === 'filebase64' || lowerKey === 'content' && typeof value === 'string' && value.length > 500) {
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
 * Robust, resilient audit logger that records events to PostgreSQL `AuditLog`.
 * Ensures that an audit log failure never breaks core business transactions.
 */
export class AuditLogService {
  public static async record(
    prisma: PrismaClient | Prisma.TransactionClient,
    params: AuditLogEntryParams
  ): Promise<void> {
    try {
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
      } = params;

      const finalIp = ipAddress || extractClientIp(req);
      const sanitizedOld = oldData !== undefined && oldData !== null ? JSON.stringify(sanitizeAuditData(oldData)) : null;
      const sanitizedNew = newData !== undefined && newData !== null ? JSON.stringify(sanitizeAuditData(newData)) : null;

      await (prisma as PrismaClient).auditLog.create({
        data: {
          tenantId: tenantId || null,
          userId: userId || null,
          userName: userName || (userId ? 'Usuário' : 'Sistema'),
          action,
          entity,
          entityId: entityId ? String(entityId) : null,
          oldData: sanitizedOld,
          newData: sanitizedNew,
          ipAddress: finalIp,
        },
      });
    } catch (err: any) {
      // Non-blocking log warning
      logger.warn(
        {
          error: err?.message || String(err),
          action: params.action,
          entity: params.entity,
          tenantId: params.tenantId,
          userId: params.userId,
        },
        '[AUDIT_LOG_RECORD_FAILURE] Falha ao registrar log de auditoria'
      );
    }
  }
}
