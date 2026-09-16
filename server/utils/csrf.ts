import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';

let cachedTenantDomains: Set<string> = new Set();
let lastDomainCacheUpdate = 0;
const DOMAIN_CACHE_TTL_MS = 60 * 1000; // 60s cache

/**
 * Returns a set of trusted origins based on environment and verified domains in database.
 */
export async function getTrustedOrigins(prisma?: PrismaClient): Promise<Set<string>> {
  const trusted = new Set<string>();

  // 1. APP_URL from environment
  if (process.env.APP_URL) {
    try {
      const parsed = new URL(process.env.APP_URL);
      trusted.add(parsed.origin.toLowerCase());
    } catch {
      trusted.add(process.env.APP_URL.trim().toLowerCase());
    }
  }

  // 2. ALLOWED_ORIGINS from environment
  if (process.env.ALLOWED_ORIGINS) {
    const split = process.env.ALLOWED_ORIGINS.split(',');
    for (const item of split) {
      const trimmed = item.trim().toLowerCase();
      if (trimmed) {
        try {
          const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
          trusted.add(parsed.origin.toLowerCase());
        } catch {
          trusted.add(trimmed);
        }
      }
    }
  }

  // 3. NG_ALLOWED_HOSTS from environment
  if (process.env.NG_ALLOWED_HOSTS) {
    const split = process.env.NG_ALLOWED_HOSTS.split(',');
    for (const item of split) {
      const trimmed = item.trim().toLowerCase();
      if (trimmed) {
        trusted.add(`https://${trimmed}`);
        trusted.add(`http://${trimmed}`);
      }
    }
  }

  // 4. Local / Staging development origins
  if (process.env.NODE_ENV !== 'production' || !process.env.APP_URL) {
    trusted.add('http://localhost:3000');
    trusted.add('http://127.0.0.1:3000');
    trusted.add('http://localhost:5173');
    trusted.add('http://127.0.0.1:5173');
    trusted.add('http://localhost:8080');
    trusted.add('http://127.0.0.1:8080');
  }

  // 5. Query verified custom tenant domains if prisma client is provided
  const now = Date.now();
  if (prisma && (now - lastDomainCacheUpdate > DOMAIN_CACHE_TTL_MS || cachedTenantDomains.size === 0)) {
    try {
      const domains = await prisma.tenantDomain.findMany({
        where: { status: 'VERIFIED' },
        select: { domain: true },
      });
      cachedTenantDomains = new Set(domains.map((d) => d.domain.toLowerCase().trim()));
      lastDomainCacheUpdate = now;
    } catch {
      // Keep previous cache on transient db read error
    }
  }

  for (const domain of cachedTenantDomains) {
    trusted.add(`https://${domain}`);
    trusted.add(`http://${domain}`);
  }

  return trusted;
}

/**
 * Normalizes an origin or referer string into standard origin (protocol + host + port).
 */
export function normalizeToOrigin(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const parsed = new URL(urlStr.trim());
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
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
 * CSRF Protection Middleware
 */
export function createCsrfMiddleware(prisma: PrismaClient): express.RequestHandler {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

    if (!trustedOrigins.has(requestOrigin)) {
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
