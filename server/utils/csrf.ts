import express from 'express';
import { PrismaClient, DomainStatus } from '@prisma/client';
import { logger } from '../logger.js';
import { TenantResolver } from './tenantResolver.js';

let cachedVerifiedTenantOrigins: Set<string> = new Set();
let lastDomainCacheUpdate = 0;
const DOMAIN_CACHE_TTL_MS = 30 * 1000; // 30s cache TTL

/**
 * Invalidate in-memory cache of verified tenant domain origins (for testing, domain removal, or real-time sync)
 */
export function invalidateDomainCache(): void {
  lastDomainCacheUpdate = 0;
  cachedVerifiedTenantOrigins.clear();
}

/**
 * Canonical official platform origins for Sentinel Consig
 */
export const CANONICAL_PLATFORM_ORIGINS = [
  'https://sentinelconsig.vercel.app',
  'https://sentinelconsig.com.br',
  'https://app.sentinelconsig.com.br',
  'https://www.sentinelconsig.com.br',
];

/**
 * Normalizes any URL/Origin string into a canonical Origin (protocol://hostname[:port]).
 * Strict requirements:
 * - Accepts ONLY http and https protocols.
 * - Hostname is converted to lowercase.
 * - Drops default standard ports (80 for http, 443 for https).
 * - Preserves non-standard ports (e.g. 8443).
 * - Rejects malformed URLs, empty strings, and embedded credentials (user:pass).
 * - Rejects non-HTTP/HTTPS schemes (ftp, javascript, data, etc.).
 */
export function normalizeToOrigin(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }

    // Reject URLs with embedded credentials (e.g., https://user:pass@host)
    if (parsed.username || parsed.password) {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) return null;

    // Normalization of standard ports:
    // Drop 80 for HTTP and 443 for HTTPS; keep explicit non-standard ports
    let port = parsed.port;
    if ((protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443')) {
      port = '';
    }

    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  } catch {
    return null;
  }
}

/**
 * Normalizes a TenantDomain database record into a canonical Origin.
 * Deterministic policy:
 * - If stored as raw FQDN hostname (e.g. 'portal.empresa.com.br'), defaults deterministically to 'https://'
 * - If stored with scheme, validates and normalizes via normalizeToOrigin
 * - In production mode, enforces HTTPS protocol and rejects non-standard ports (fail-closed)
 * - Rejects wildcards (*), spaces, and invalid formats
 */
export function normalizeTenantDomainRecordToOrigin(storedDomain: string): string | null {
  if (!storedDomain || typeof storedDomain !== 'string') return null;
  const trimmed = storedDomain.trim().toLowerCase();
  if (!trimmed || trimmed.includes('*') || trimmed.includes(' ') || trimmed.includes('@')) {
    return null;
  }

  let candidateUrl = trimmed;
  if (!candidateUrl.startsWith('http://') && !candidateUrl.startsWith('https://')) {
    candidateUrl = `https://${candidateUrl}`;
  }

  const normalized = normalizeToOrigin(candidateUrl);
  if (!normalized) return null;

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    if (!normalized.startsWith('https://')) {
      return null;
    }
    try {
      const parsed = new URL(normalized);
      if (parsed.port && parsed.port !== '443') {
        return null;
      }
    } catch {
      return null;
    }
  }

  return normalized;
}

/**
 * Returns a set of trusted origins based on canonical whitelist, explicit environment variables,
 * and verified tenant domains in database. Discards any malformed or invalid entries (fail-closed).
 */
export async function getTrustedOrigins(prisma?: PrismaClient): Promise<Set<string>> {
  const trusted = new Set<string>();

  // 1. Canonical platform origins (Production / Staging / Frontend)
  for (const origin of CANONICAL_PLATFORM_ORIGINS) {
    const normalized = normalizeToOrigin(origin);
    if (normalized) {
      trusted.add(normalized);
    }
  }

  // 2. FRONTEND_URL, CLIENT_URL, NEXT_PUBLIC_APP_URL from environment
  const frontendEnvVars = [process.env.FRONTEND_URL, process.env.CLIENT_URL, process.env.NEXT_PUBLIC_APP_URL];
  for (const envVal of frontendEnvVars) {
    if (envVal) {
      const normalized = normalizeToOrigin(envVal);
      if (normalized) {
        trusted.add(normalized);
      }
    }
  }

  // 3. APP_URL from environment
  if (process.env.APP_URL) {
    const normalized = normalizeToOrigin(process.env.APP_URL);
    if (normalized) {
      trusted.add(normalized);
    }
  }

  // 4. ALLOWED_ORIGINS from environment (comma-separated list of complete origins)
  if (process.env.ALLOWED_ORIGINS) {
    const split = process.env.ALLOWED_ORIGINS.split(',');
    for (const item of split) {
      const normalized = normalizeToOrigin(item);
      if (normalized) {
        trusted.add(normalized);
      }
    }
  }

  // 5. NG_ALLOWED_HOSTS from environment (comma-separated list of hosts)
  if (process.env.NG_ALLOWED_HOSTS) {
    const split = process.env.NG_ALLOWED_HOSTS.split(',');
    for (const item of split) {
      const trimmed = item.trim().toLowerCase();
      if (trimmed) {
        const httpsOrigin = normalizeToOrigin(`https://${trimmed}`);
        if (httpsOrigin) trusted.add(httpsOrigin);
        if (process.env.NODE_ENV !== 'production') {
          const httpOrigin = normalizeToOrigin(`http://${trimmed}`);
          if (httpOrigin) trusted.add(httpOrigin);
        }
      }
    }
  }

  // 6. Local / Staging development origins (strictly for development and test environments)
  if (process.env.NODE_ENV !== 'production' || !process.env.APP_URL) {
    trusted.add('http://localhost:3000');
    trusted.add('http://127.0.0.1:3000');
    trusted.add('http://localhost:5173');
    trusted.add('http://127.0.0.1:5173');
    trusted.add('http://localhost:8080');
    trusted.add('http://127.0.0.1:8080');
  }

  // 7. Query verified tenant domains (status === 'VERIFIED') if prisma client is provided
  const now = Date.now();
  if (prisma && (now - lastDomainCacheUpdate > DOMAIN_CACHE_TTL_MS || cachedVerifiedTenantOrigins.size === 0)) {
    try {
      const domains = await prisma.tenantDomain.findMany({
        where: { status: DomainStatus.VERIFIED },
        select: { domain: true, status: true },
      });
      const newOriginSet = new Set<string>();
      for (const d of domains) {
        if (d.status !== DomainStatus.VERIFIED) continue;
        const normalizedOrigin = normalizeTenantDomainRecordToOrigin(d.domain);
        if (normalizedOrigin) {
          newOriginSet.add(normalizedOrigin);
        }
      }
      cachedVerifiedTenantOrigins = newOriginSet;
      lastDomainCacheUpdate = now;
    } catch (err) {
      cachedVerifiedTenantOrigins.clear();
      lastDomainCacheUpdate = 0;
      logger.warn({ err }, '[CSRF] Database error reading verified TenantDomains - Cache cleared and Fail-Closed');
    }
  }

  for (const origin of cachedVerifiedTenantOrigins) {
    trusted.add(origin);
  }

  return trusted;
}

/**
 * Checks if a normalized origin is authorized:
 * - Enforces complete comparison (protocol, hostname, and port).
 * - Enforces HTTPS in production mode for all external / tenant domains.
 * - Rejects non-standard ports on tenant domains.
 * - Enforces strict exact match against whitelist and verified TenantDomain records.
 * - Fail-closed on any database or parsing error.
 */
export async function isOriginTrusted(
  origin: string | null,
  trustedOrigins: Set<string>,
  prisma?: PrismaClient
): Promise<boolean> {
  if (!origin || typeof origin !== 'string') return false;

  const normalized = normalizeToOrigin(origin);
  if (!normalized) return false;

  // 1. Direct match against canonical & pre-cached trusted origins
  if (trustedOrigins.has(normalized)) {
    return true;
  }

  // 2. Parse origin to inspect protocol, hostname, and port
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port;
  const isProduction = process.env.NODE_ENV === 'production';

  // 3. In production, tenant domains must strictly use HTTPS
  if (isProduction && protocol !== 'https:') {
    return false;
  }

  // 4. Reject non-standard ports on tenant domains (standard: 443 for HTTPS, 80 for HTTP in non-prod)
  if (
    port &&
    port !== '' &&
    port !== '443' &&
    !(protocol === 'http:' && port === '80')
  ) {
    return false;
  }

  // 5. Query verified TenantDomain if prisma is provided
  if (prisma) {
    try {
      // Strict hostname validation: no empty, no wildcard, no invalid characters
      if (!hostname || hostname.includes('*') || hostname.includes('/') || hostname.includes('\\')) {
        return false;
      }

      // Check using TenantResolver to validate existence, status, and correct domain matching
      const resolution = await TenantResolver.resolveByHost(prisma, hostname);
      if (
        resolution.tenant &&
        resolution.tenant.status === 'ACTIVE' &&
        (resolution.type === 'PLATFORM_SUBDOMAIN' || resolution.type === 'CUSTOM_DOMAIN')
      ) {
        trustedOrigins.add(normalized);
        cachedVerifiedTenantOrigins.add(normalized);
        return true;
      }

      // Fallback/direct check in TenantDomain table if needed
      const candidates = await prisma.tenantDomain.findMany({
        where: {
          status: DomainStatus.VERIFIED,
          OR: [
            { domain: { equals: hostname, mode: 'insensitive' } },
            { domain: { equals: `https://${hostname}`, mode: 'insensitive' } },
            { domain: { equals: `http://${hostname}`, mode: 'insensitive' } },
          ],
        },
        select: { domain: true, status: true },
      });

      for (const record of candidates) {
        if (record.status !== DomainStatus.VERIFIED) continue;
        const normalizedDbOrigin = normalizeTenantDomainRecordToOrigin(record.domain);
        // Strict equality check between normalized incoming origin and normalized DB record origin
        if (normalizedDbOrigin && normalizedDbOrigin === normalized) {
          trustedOrigins.add(normalized);
          cachedVerifiedTenantOrigins.add(normalized);
          return true;
        }
      }
    } catch (err) {
      logger.warn({ err, origin: normalized }, '[CSRF] Database error checking TenantDomain status - Fail-Closed');
      // Database failure: Fail-closed
      return false;
    }
  }

  return false;
}

/**
 * Helper to check if request is HTTPS
 */
export function isRequestHttps(req: express.Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    const firstProto = proto.split(',')[0].trim().toLowerCase();
    if (firstProto === 'https') return true;
  }
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.APP_URL && process.env.APP_URL.startsWith('https:')) return true;
  return false;
}

/**
 * CORS Middleware enforcing explicit trusted origin reflection and preflight handling.
 */
export function createCorsMiddleware(prisma: PrismaClient): express.RequestHandler {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const originHeader = req.headers.origin as string | undefined;
    if (!originHeader) {
      return next();
    }

    const normalizedOrigin = normalizeToOrigin(originHeader);
    if (!normalizedOrigin) {
      return next();
    }

    const trustedOrigins = await getTrustedOrigins(prisma);
    const isAllowed = await isOriginTrusted(normalizedOrigin, trustedOrigins, prisma);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cookie, Set-Cookie'
      );
      res.setHeader('Vary', 'Origin');

      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
    } else if (req.method === 'OPTIONS') {
      // Reject unauthorized CORS preflight
      return res.status(403).json({
        error: 'CORS_BLOCKED',
        message: 'Origem não autorizada por política de CORS.',
      });
    }

    return next();
  };
}

/**
 * CSRF Protection Middleware
 */
export function createCsrfMiddleware(prisma: PrismaClient): express.RequestHandler {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Bypass CSRF protection in testing environments
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return next();
    }

    // 1. Safe HTTP methods (GET, HEAD, OPTIONS) do not mutate state
    const method = req.method.toUpperCase();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return next();
    }

    const path = req.path || req.originalUrl?.split('?')[0] || '';

    // 2. Server-to-server endpoints authenticated via Bearer token (e.g. Cron)
    if (path === '/api/cron/operational-rules') {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // Cron endpoint verifies token strictly in its own handler
        return next();
      }
    }

    // 3. Defense-in-Depth: Sec-Fetch-Site validation
    const secFetchSite = req.headers['sec-fetch-site'];
    if (typeof secFetchSite === 'string' && secFetchSite.toLowerCase() === 'cross-site') {
      logger.warn(
        {
          ip: req.ip,
          path,
          method,
          secFetchSite,
          origin: req.headers.origin,
          referer: req.headers.referer,
        },
        '[CSRF DEFENSE] Request blocked due to Sec-Fetch-Site: cross-site'
      );
      return res.status(403).json({
        error: 'CSRF_BLOCKED',
        message: 'Acesso bloqueado por política de segurança de origem cruzada (Sec-Fetch-Site).',
      });
    }

    // 4. Extract origin from Origin or Referer header
    const originHeader = req.headers.origin as string | undefined;
    const refererHeader = req.headers.referer as string | undefined;

    let requestOrigin: string | null = null;
    let malformedOrigin = false;

    if (originHeader) {
      requestOrigin = normalizeToOrigin(originHeader);
      if (!requestOrigin) {
        malformedOrigin = true;
      }
    } else if (refererHeader) {
      requestOrigin = normalizeToOrigin(refererHeader);
      if (!requestOrigin) {
        malformedOrigin = true;
      }
    }

    if (malformedOrigin) {
      logger.warn(
        {
          ip: req.ip,
          path,
          method,
          originHeader,
          refererHeader,
        },
        '[CSRF DEFENSE] Request blocked due to malformed Origin/Referer header'
      );
      return res.status(403).json({
        error: 'CSRF_BLOCKED',
        message: 'Cabeçalho de origem malformado ou inválido.',
      });
    }

    // 5. Check if request carries session authentication cookie
    const hasSessionCookie = Boolean(
      (req.cookies && req.cookies.cg_session_id) ||
      (req.headers.cookie && req.headers.cookie.includes('cg_session_id='))
    );

    // 6. Policy for missing Origin and Referer:
    if (!requestOrigin) {
      // If request is authenticated via session cookie, Origin or Referer is mandatory for state-changing operations
      if (hasSessionCookie) {
        logger.warn(
          {
            ip: req.ip,
            path,
            method,
            hasSessionCookie,
          },
          '[CSRF DEFENSE] Authenticated state-changing request blocked: missing Origin and Referer'
        );
        return res.status(403).json({
          error: 'CSRF_BLOCKED',
          message: 'Requisições autenticadas de mutação exigem validação de cabeçalho Origin ou Referer.',
        });
      }

      // If it's a public unauthenticated mutation like /api/auth/login, allow only if no cross-site fetch
      if (path === '/api/auth/login') {
        return next();
      }

      // For any other state-changing endpoint without origin/referer, block
      return res.status(403).json({
        error: 'CSRF_BLOCKED',
        message: 'Origem da requisição não identificada.',
      });
    }

    // 7. Validate requestOrigin against trusted origins
    const trustedOrigins = await getTrustedOrigins(prisma);
    const isAllowed = await isOriginTrusted(requestOrigin, trustedOrigins, prisma);

    if (!isAllowed) {
      logger.warn(
        {
          ip: req.ip,
          path,
          method,
          requestOrigin,
          trustedOrigins: Array.from(trustedOrigins),
        },
        '[CSRF DEFENSE] Request blocked: Origin not in trusted whitelist'
      );
      return res.status(403).json({
        error: 'CSRF_BLOCKED',
        message: 'Origem não autorizada para esta operação.',
      });
    }

    // Origin is trusted, proceed
    return next();
  };
}
