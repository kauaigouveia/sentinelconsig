import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PrismaClient, Prisma, ProposalType, StandardStatusCategory, PriorityLevel, NotificationType } from '@prisma/client';
import crypto from 'crypto';
import { logger } from './server/logger.js';
import {
  uploadBlob,
  downloadBlob,
  deleteBlob,
  buildBlobPath,
  sanitizeFileName,
} from './server/services/azureBlobStorage.js';
import { hasPermission, Permission } from './src/lib/permissions.js';
import { Role } from './src/types/index.js';
import { sseRegistry } from './server/realtime.js';
import { eventBus } from './server/services/pusherService.js';
import { ImportWorkerService } from './server/services/importWorker.js';
import { TenantNormalization } from './server/utils/tenantNormalization.js';
import { TenantResolver } from './server/utils/tenantResolver.js';
import { DnsVerificationService } from './server/services/dnsVerificationService.js';
import { AdminContextManager } from './server/utils/adminContext.js';
import { AnalyticsService } from './server/services/analyticsService.js';
import { BIService } from './server/services/biService.js';
import { BIComparisonService } from './server/services/biComparisonService.js';
import { RuleEngineService } from './server/services/ruleEngineService.js';
import { ManagerialIntelligenceService } from './server/services/managerialIntelligenceService.js';
import { SentinelaAIService } from './server/services/sentinelaAIService.js';
import { SaasUsageService } from './server/services/saasUsageService.js';
import { SaasLimitsService } from './server/services/saasLimitsService.js';
import { TenantHealthService } from './server/services/tenantHealthService.js';
import { BusinessNotificationService } from './server/services/businessNotificationService.js';
import { AuditLogService, computeDelta, maskCPF } from './server/services/auditLogService.js';
import { SimulationService } from './server/services/simulationService.js';
import { hashPassword, verifyPassword, dummyVerify, isArgon2Hash } from './server/services/passwordService.js';
import { createCsrfMiddleware, createCorsMiddleware, isRequestHttps } from './server/utils/csrf.js';

let isShuttingDown = false;
let serverInstance: any = null;

const prisma = new PrismaClient();
const app = express();
export { app };

// Trust first proxy for Cloud Run/Vercel/Nginx reverse proxy IP extraction
app.set('trust proxy', 1);

async function auditAndEnsureMasterUser() {
  try {
    const masterEmail = (process.env.INITIAL_MASTER_EMAIL || 'kauaigouveia@gmail.com').trim().toLowerCase();
    const masterPassword = process.env.INITIAL_MASTER_PASSWORD?.trim();

    // 1. Tenant inicial idempotente
    let tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: 'sentinel-consig' },
          { slug: 'evolve' },
          { name: { contains: 'SENTINEL', mode: 'insensitive' } },
          { name: { contains: 'EVOLVE', mode: 'insensitive' } },
        ],
      },
    });

    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          name: 'SENTINEL CONSIG',
          tradeName: 'Sentinel Consig',
          slug: 'sentinel-consig',
          status: 'ACTIVE',
          plan: 'PRO',
          maxUsers: 50,
          storageLimitMb: 10000,
          maxProposals: 50000,
        },
      });
      console.log(`[RBAC BOOTSTRAP] Tenant inicial criado com sucesso no PostgreSQL: ${tenant.id} (${tenant.name})`);

      try {
        await prisma.whiteLabelConfig.create({
          data: {
            tenantId: tenant.id,
            companyName: 'Sentinel Consig',
            legalName: 'Sentinel Intermediação de Negócios Ltda',
            primaryColor: '#2563eb',
            secondaryColor: '#1e40af',
            accentColor: '#3b82f6',
          },
        });
      } catch (wlErr) {
        console.warn('[RBAC BOOTSTRAP] Aviso ao configurar WhiteLabelConfig inicial:', wlErr);
      }
    } else {
      console.log(`[RBAC BOOTSTRAP] Tenant inicial reutilizado: ${tenant.id} (${tenant.name})`);
    }

    // 2. Usuário Master inicial idempotente
    const user = await prisma.user.findFirst({
      where: { email: { equals: masterEmail, mode: 'insensitive' } },
    });

    if (user) {
      console.log(`[RBAC BOOTSTRAP] Usuario Master localizado no PostgreSQL:`, {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        active: user.active,
        isMasterProtected: user.isMasterProtected,
      });

      const updates: any = {};
      if (user.role !== 'PLATFORM_MASTER') updates.role = 'PLATFORM_MASTER';
      if (!user.active) updates.active = true;
      if (!user.isMasterProtected) updates.isMasterProtected = true;
      if (!user.tenantId && tenant) updates.tenantId = tenant.id;

      if (Object.keys(updates).length > 0) {
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
        logger.info({ role: updated.role }, '[RBAC BOOTSTRAP] Master profile synchronized for PLATFORM_MASTER');
      }

      // Migração segura e condicional de credencial legada para o PLATFORM_MASTER
      if (!isArgon2Hash(user.passwordHash)) {
        if (!masterPassword) {
          logger.warn('[RBAC BOOTSTRAP] PLATFORM_MASTER possui credencial legada, mas INITIAL_MASTER_PASSWORD não está configurada no ambiente. Migração adiada para o login interativo.');
        } else {
          // Validação estrita: nunca assumir que INITIAL_MASTER_PASSWORD corresponde à senha atual
          const match = await verifyPassword(masterPassword, user.passwordHash);
          if (match.valid) {
            try {
              // Gerar hash Argon2id a partir da senha validada (nunca do hash bruto)
              const newHash = await hashPassword(masterPassword);

              // Atualização atômica unificada: senha e evento SYSTEM_CREDENTIAL_MIGRATION na mesma transação PostgreSQL
              const migrationSuccess = await prisma.$transaction(async (tx) => {
                // 1. Atualização com controle estrito de concorrência dentro da transação
                const updateResult = await tx.user.updateMany({
                  where: {
                    id: user.id,
                    passwordHash: user.passwordHash, // Garante que nenhum outro processo alterou a senha
                  },
                  data: {
                    passwordHash: newHash,
                  },
                });

                if (updateResult.count === 0) {
                  // Concorrência detectada: credencial já foi modificada por outro processo
                  return { migrated: false, reason: 'CONCURRENCY_CONFLICT' };
                }

                // 2. Registro de auditoria usando o MESMO cliente transacional tx
                await AuditLogService.record(tx, {
                  tx,
                  tenantId: user.tenantId || tenant.id,
                  userId: user.id,
                  userName: user.name,
                  action: 'SYSTEM_CREDENTIAL_MIGRATION',
                  entity: 'User',
                  entityId: user.id,
                  newData: {
                    migrationType: 'LEGACY_TO_ARGON2ID',
                    algorithm: 'argon2id',
                    status: 'SUCCESS',
                    source: 'RBAC_BOOTSTRAP_VALIDATED',
                  },
                  ipAddress: '127.0.0.1',
                });

                return { migrated: true };
              }, { timeout: 15000, maxWait: 10000 });

              if (migrationSuccess.migrated) {
                logger.info({ id: user.id }, '[RBAC BOOTSTRAP] Credencial do PLATFORM_MASTER migrada com sucesso para Argon2id e auditada atomicamente na cadeia.');
              } else {
                logger.warn({ id: user.id, reason: migrationSuccess.reason }, '[RBAC BOOTSTRAP] Concorrência detectada: credencial do PLATFORM_MASTER foi alterada concorrentemente; atualização cancelada de forma atômica.');
              }
            } catch (migErr: any) {
              logger.error({ error: migErr?.message || String(migErr) }, '[RBAC BOOTSTRAP] Falha atômica durante migração da credencial do PLATFORM_MASTER (rollback garantido)');
            }
          } else {
            logger.warn({ id: user.id }, '[RBAC BOOTSTRAP] INITIAL_MASTER_PASSWORD não corresponde à credencial preexistente do PLATFORM_MASTER. Senha preservada intacta; migração adiada para o login interativo.');
          }
        }
      }
    } else {
      if (!masterPassword) {
        logger.error('[RBAC BOOTSTRAP CRITICAL] INITIAL_MASTER_PASSWORD não configurada no ambiente. Usuário master não criado.');
        return;
      }

      const created = await prisma.user.create({
        data: {
          name: 'Kauai Gouveia',
          email: masterEmail,
          passwordHash: await hashPassword(masterPassword),
          role: 'PLATFORM_MASTER',
          active: true,
          isMasterProtected: true,
          tenantId: tenant.id,
          customPermissions: [],
        },
      });
      logger.info({ id: created.id, role: created.role }, '[RBAC BOOTSTRAP] Usuario PLATFORM_MASTER criado com sucesso no PostgreSQL');
    }
  } catch (err) {
    logger.warn({ error: err?.message || String(err) }, '[RBAC BOOTSTRAP WARNING]');
  }
}

// -------------------------------------------------------------
// P1.2 CORRELATION ID / REQUEST ID MIDDLEWARE (Top of Express Chain)
  // -------------------------------------------------------------
  app.use((req, res, next) => {
    const rawHeader = req.headers['x-request-id'];
    let reqId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // Validate size and alphanumeric/hyphen format (8-100 chars)
    if (!reqId || typeof reqId !== 'string' || reqId.length < 8 || reqId.length > 100 || !/^[a-zA-Z0-9\-_]+$/.test(reqId)) {
      reqId = crypto.randomUUID();
    }

    req.requestId = reqId;
    req.startTime = Date.now();

    // Attach X-Request-ID to response header for ALL responses (2xx, 4xx, 5xx)
    res.setHeader('X-Request-ID', reqId);
    next();
  });

  // -------------------------------------------------------------
  // P1.3 STRUCTURED HTTP REQUEST LOGGING MIDDLEWARE
  // -------------------------------------------------------------
  app.use((req, res, next) => {
    res.on('finish', () => {
      const durationMs = Date.now() - (req.startTime || Date.now());
      logger.info({
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs,
        message: 'request completed',
      });
    });
    next();
  });

  // P0.1 HTTP Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https://*.blob.core.windows.net", "https://*.googleusercontent.com"],
          connectSrc: ["'self'", "ws:", "wss:", "https://*.blob.core.windows.net", "https://*.firebaseio.com", "https://*.googleapis.com"],
          mediaSrc: ["'self'", "data:", "blob:"],
          frameAncestors: ["'self'", "https://*.google.com", "https://*.ai.studio", "https://*.aistudio.google.com", "https://*.googleusercontent.com"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(createCorsMiddleware(prisma));
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(createCsrfMiddleware(prisma));

  // Rate Limiter for Authentication Endpoints (Brute Force Guard)
  // 60 login attempts per IP every 15 minutes
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: 'Muitas tentativas de login a partir deste IP. Tente novamente mais tarde.',
    },
    handler: (req, res, _next, options) => {
      logger.warn({ ip: req.ip }, '[SECURITY ALERT] Rate limit de autenticação excedido');
      res.status(429).json(options.message);
    },
  });

  // P0.4 Rate Limiter for Public Branding Endpoints
  // 120 requests per IP per minute
  const publicBrandingRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: 'Muitas requisições de branding a partir deste IP. Tente novamente em breve.',
    },
    handler: (req, res, _next, options) => {
      logger.warn({ ip: req.ip }, '[SECURITY ALERT] Rate limit de branding excedido');
      res.status(429).json(options.message);
    },
  });

  // P0.4 Rate Limiter for Document Endpoints (Azure Blob)
  // 120 requests per IP every 15 minutes
  const documentRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: 'Limite de requisições de documentos excedido. Tente novamente em alguns minutos.',
    },
    handler: (req, res, _next, options) => {
      logger.warn({ ip: req.ip }, '[SECURITY ALERT] Rate limit de documentos excedido');
      res.status(429).json(options.message);
    },
  });

  // -------------------------------------------------------------
  // P1.1 REAL POSTGRESQL HEALTH CHECK API
  // -------------------------------------------------------------
  app.get('/api/health', async (_req, res) => {
    const timestamp = new Date().toISOString();

    try {
      // 5-second timeout for database health query with proper timer cleanup
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Database health check timeout')), 5000);
      });

      const dbPromise = prisma.$queryRaw`SELECT 1`.finally(() => {
        if (timer) clearTimeout(timer);
      });

      await Promise.race([dbPromise, timeoutPromise]);

      return res.status(200).json({
        status: 'ok',
        database: 'healthy',
        timestamp,
      });
    } catch (err: any) {
      logger.error({
        message: 'Health check failed',
        error: err?.message || String(err),
      });

      return res.status(503).json({
        status: 'degraded',
        database: 'unreachable',
        timestamp,
      });
    }
  });

  // -------------------------------------------------------------
  // PUBLIC BRANDING API (Domain & Subdomain Resolution)
  // -------------------------------------------------------------
  app.get('/api/public/tenant-branding', publicBrandingRateLimiter, async (req, res) => {
    try {
      const host = TenantResolver.extractHost(req);
      const resolution = await TenantResolver.resolveByHost(prisma, host);

      // Safe public payload - NO internal IDs, passwords or sensitive metrics
      return res.json(resolution.branding);
    } catch (err) {
      console.error('[PUBLIC BRANDING ERROR]', err);
      return res.status(500).json({
        status: 'DOMAIN_NOT_CONFIGURED',
        domainType: 'DOMAIN_NOT_CONFIGURED',
        companyName: 'Sentinel Consig',
        message: 'Erro ao resolver identidade visual do domínio.',
      });
    }
  });

  // -------------------------------------------------------------
  // AUTHENTICATION API ROUTES (Server-Side Authority)
  // -------------------------------------------------------------

  // 1. POST /api/auth/login - Rate limited & Domain-aware
  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPassword = String(password).trim();

      // Resolve domain context to enforce domain-level tenant boundaries
      const host = TenantResolver.extractHost(req);
      const domainResolution = await TenantResolver.resolveByHost(prisma, host);

      if (domainResolution.type === 'DOMAIN_NOT_CONFIGURED') {
        await AuditLogService.record(prisma, {
          tenantId: null,
          action: 'LOGIN_FAILED',
          entity: 'AUTH',
          oldData: { email: cleanEmail, reason: 'Tentativa de login em domínio não configurado ou inativo', host },
          req,
        });
        return res.status(403).json({
          status: 'DOMAIN_NOT_CONFIGURED',
          message: 'Este domínio não está associado a nenhuma organização ativa do Sentinel Consig.',
        });
      }

      // Query PostgreSQL via Prisma
      let dbUser = null;
      try {
        dbUser = await prisma.user.findFirst({
          where: { email: { equals: cleanEmail, mode: 'insensitive' } },
          include: { tenant: true },
        });
      } catch (err) {
        console.warn('[AUTH] Falha ao consultar usuário no banco de dados:', err);
      }

      if (!dbUser) {
        // Equalize response time to prevent account enumeration
        await dummyVerify(cleanPassword);

        // Audit log failed login
        await AuditLogService.record(prisma, {
          tenantId: domainResolution.tenant?.id || null,
          action: 'LOGIN_FAILED',
          entity: 'AUTH',
          oldData: { email: cleanEmail, reason: 'Credenciais inválidas' },
          req,
        });
        return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
      }

      // User status check
      if (!dbUser.active) {
        await AuditLogService.record(prisma, {
          tenantId: dbUser.tenantId || domainResolution.tenant?.id || null,
          userId: dbUser.id,
          userName: dbUser.name,
          action: 'LOGIN_FAILED',
          entity: 'AUTH',
          entityId: dbUser.id,
          oldData: { email: cleanEmail, reason: 'Usuário desativado' },
          req,
        });
        return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
      }

      // Domain-level tenant check:
      // If domain resolved to a specific tenant (subdomain or custom domain) and user is NOT PLATFORM_MASTER
      if (
        domainResolution.tenant &&
        (domainResolution.type === 'CUSTOM_DOMAIN' || domainResolution.type === 'PLATFORM_SUBDOMAIN')
      ) {
        if (dbUser.role !== 'PLATFORM_MASTER' && dbUser.tenantId !== domainResolution.tenant.id) {
          console.warn(
            `[AUTH REJECTED] Usuário '${cleanEmail}' (Tenant: ${dbUser.tenantId}) tentou autenticar no domínio do Tenant '${domainResolution.tenant.name}' (${domainResolution.tenant.id})`
          );
          await AuditLogService.record(prisma, {
            tenantId: domainResolution.tenant.id,
            userId: dbUser.id,
            userName: dbUser.name,
            action: 'LOGIN_FAILED',
            entity: 'AUTH',
            entityId: dbUser.id,
            oldData: { email: cleanEmail, reason: 'Acesso negado: domínio de outra organização' },
            req,
          });
          return res.status(403).json({
            message: 'Este usuário não pertence a esta organização.',
          });
        }
      }

      // Tenant status check (Instant suspension blocker)
      if (dbUser.role !== 'PLATFORM_MASTER' && dbUser.tenant && dbUser.tenant.status !== 'ACTIVE') {
        const reason = dbUser.tenant.status === 'SUSPENDED' 
          ? 'Organização/Tenant suspenso' 
          : 'Organização/Tenant inativo ou cancelado';
        await AuditLogService.record(prisma, {
          tenantId: dbUser.tenantId,
          userId: dbUser.id,
          userName: dbUser.name,
          action: 'LOGIN_FAILED',
          entity: 'AUTH',
          entityId: dbUser.id,
          oldData: { email: cleanEmail, reason },
          req,
        });
        return res.status(403).json({ message: dbUser.tenant.status === 'SUSPENDED' ? 'Tenant suspenso.' : 'Tenant inativo ou cancelado.' });
      }

      // P0-A: Cryptographic password validation using Argon2id (No includes, no partial matches)
      const { valid: isPasswordValid, needsRehash } = await verifyPassword(cleanPassword, dbUser.passwordHash);
      if (!isPasswordValid) {
        await AuditLogService.record(prisma, {
          tenantId: dbUser.tenantId,
          userId: dbUser.id,
          userName: dbUser.name,
          action: 'LOGIN_FAILED',
          entity: 'AUTH',
          entityId: dbUser.id,
          oldData: { email: cleanEmail, reason: 'Senha incorreta' },
          req,
        });
        return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
      }

      // Seamless migration: upgrade legacy plaintext credentials to Argon2id immediately on successful login
      if (needsRehash) {
        try {
          const modernHash = await hashPassword(cleanPassword);
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { passwordHash: modernHash },
          });
          logger.info({ userId: dbUser.id }, '[AUTH] Hash de credencial atualizado para Argon2id com sucesso');
        } catch (rehashErr) {
          logger.warn({ err: rehashErr }, '[AUTH] Falha não impeditiva na migração de hash');
        }
      }

      // Safe user output object (NO PASSWORDS, NO HASHES)
      const safeUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        active: dbUser.active,
        tenantId: dbUser.tenantId || undefined,
        customPermissions: dbUser.customPermissions || [],
        isMasterProtected: dbUser.isMasterProtected || false,
        mustChangePassword: dbUser.mustChangePassword,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };

      // Create Server Session in PostgreSQL
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      try {
        await prisma.session.create({
          data: {
            userId: dbUser.id,
            token: sessionToken,
            ipAddress: req.ip || '127.0.0.1',
            userAgent: (req.headers['user-agent'] as string) || 'Unknown',
            expiresAt,
          },
        });
      } catch (sessErr) {
        console.warn('[AUTH] Não foi possível persistir sessão no banco:', sessErr);
        return res.status(500).json({ message: 'Erro ao criar sessão no servidor.' });
      }

      // Set HttpOnly Cookie (Strict transport & storage)
      res.cookie('cg_session_id', sessionToken, {
        httpOnly: true,
        secure: isRequestHttps(req),
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      });

      // Audit log LOGIN_SUCCESS (Safe, no passwords or tokens)
      await AuditLogService.record(prisma, {
        tenantId: dbUser.tenantId || null,
        userId: dbUser.id,
        userName: dbUser.name,
        action: 'LOGIN_SUCCESS',
        entity: 'AUTH',
        entityId: dbUser.id,
        newData: {
          role: dbUser.role,
          tenantId: dbUser.tenantId,
        },
        req,
      });

      // P0-B: NEVER return the session token in the JSON body.
      // The session token is transmitted solely via the HttpOnly cookie.
      return res.json({
        success: true,
        user: safeUser,
      });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      return res.status(500).json({ message: 'Erro interno durante a autenticação.' });
    }
  });

  // P0-B: Extract session token EXCLUSIVELY from the HttpOnly cookie
  const extractSessionToken = (req: express.Request): string | null => {
    if (req.cookies && req.cookies.cg_session_id) {
      return req.cookies.cg_session_id;
    }
    if (req.headers && req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)cg_session_id=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  };

  // 2. POST /api/auth/logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = extractSessionToken(req);
      if (token) {
        try {
          const session = await prisma.session.findUnique({
            where: { token },
            include: { user: true },
          });
          if (session) {
            AdminContextManager.clearContext(session.id);
            await AuditLogService.record(prisma, {
              tenantId: session.user?.tenantId || null,
              userId: session.userId,
              userName: session.user?.name || null,
              action: 'LOGOUT',
              entity: 'AUTH',
              entityId: session.userId,
              req,
            });
            await prisma.session.deleteMany({ where: { token } });
          }
        } catch (e) {
          // session already removed or failed
        }
      }
      res.clearCookie('cg_session_id', {
        httpOnly: true,
        secure: isRequestHttps(req),
        sameSite: 'lax',
        path: '/',
      });
      return res.json({ success: true, message: 'Sessão encerrada.' });
    } catch (err) {
      res.clearCookie('cg_session_id', {
        httpOnly: true,
        secure: isRequestHttps(req),
        sameSite: 'lax',
        path: '/',
      });
      return res.json({ success: true, message: 'Sessão encerrada.' });
    }
  });

  // 3. GET /api/auth/session
  app.get('/api/auth/session', async (req, res) => {
    try {
      const host = TenantResolver.extractHost(req);
      const domainResolution = await TenantResolver.resolveByHost(prisma, host);

      if (domainResolution.type === 'DOMAIN_NOT_CONFIGURED') {
        return res.status(403).json({
          authenticated: false,
          status: 'DOMAIN_NOT_CONFIGURED',
          message: 'Acesso negado: este domínio não está configurado.',
        });
      }

      const token = extractSessionToken(req);
      if (!token) {
        return res.status(401).json({ authenticated: false, message: 'Nenhuma sessão ativa.' });
      }

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { include: { tenant: true } } },
      });

      if (!session || session.expiresAt < new Date()) {
        res.clearCookie('cg_session_id', {
          httpOnly: true,
          secure: isRequestHttps(req),
          sameSite: 'lax',
          path: '/',
        });
        return res.status(401).json({ authenticated: false, message: 'Sessão expirada ou inválida.' });
      }

      if (
        !session.user.active ||
        (session.user.tenant && (session.user.tenant.status === 'SUSPENDED' || session.user.tenant.status === 'CANCELLED'))
      ) {
        await AdminContextManager.clearContext(session.id, prisma);
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        res.clearCookie('cg_session_id', {
          httpOnly: true,
          secure: isRequestHttps(req),
          sameSite: 'lax',
          path: '/',
        });
        return res.status(403).json({ authenticated: false, message: 'Tenant suspenso ou usuário desativado.' });
      }

      // Check active AdminContext for PLATFORM_MASTER (PostgreSQL as authoritative persistent store)
      let adminContext: any = null;
      let effectiveTenantId = session.user.tenantId;

      if (session.user.role === 'PLATFORM_MASTER') {
        // 1. Primary: PostgreSQL persistent session columns
        if (session.adminTargetTenantId && session.adminContextExpiresAt) {
          if (new Date(session.adminContextExpiresAt) > new Date()) {
            const targetTenant = await prisma.tenant.findUnique({
              where: { id: session.adminTargetTenantId },
            });
            if (targetTenant && !targetTenant.deletedAt && targetTenant.status !== 'CANCELLED') {
              adminContext = {
                targetTenantId: targetTenant.id,
                targetTenantName: session.adminTargetTenantName || targetTenant.name,
                switchedAt: session.adminSwitchedAt || session.createdAt,
                expiresAt: session.adminContextExpiresAt,
              };
              effectiveTenantId = targetTenant.id;
              AdminContextManager.warmCache(session.id, adminContext);
            } else {
              // Tenant deleted or cancelled: clear invalid persistent context
              await AdminContextManager.clearContext(session.id, prisma);
            }
          } else {
            // Expired context: clear persistent state
            await AdminContextManager.clearContext(session.id, prisma);
          }
        } else {
          // 2. Fallback: in-memory cache
          adminContext = AdminContextManager.getContext(session.id);
          if (adminContext) {
            effectiveTenantId = adminContext.targetTenantId;
            await prisma.session.update({
              where: { id: session.id },
              data: {
                adminTargetTenantId: adminContext.targetTenantId,
                adminTargetTenantName: adminContext.targetTenantName,
                adminSwitchedAt: adminContext.switchedAt,
                adminContextExpiresAt: adminContext.expiresAt,
              },
            }).catch(() => {});
          }
        }
      }

      const safeUser = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        active: session.user.active,
        tenantId: session.user.tenantId || undefined,
        customPermissions: session.user.customPermissions || [],
        isMasterProtected: session.user.isMasterProtected || false,
        mustChangePassword: session.user.mustChangePassword,
        createdAt: session.user.createdAt.toISOString(),
        updatedAt: session.user.updatedAt.toISOString(),
      };

      return res.json({
        authenticated: true,
        user: safeUser,
        effectiveTenantId,
        adminContext: adminContext
          ? {
              targetTenantId: adminContext.targetTenantId,
              targetTenantName: adminContext.targetTenantName,
              switchedAt: adminContext.switchedAt,
              expiresAt: adminContext.expiresAt,
            }
          : null,
      });
    } catch (err) {
      return res.status(401).json({ authenticated: false, message: 'Erro ao validar sessão.' });
    }
  });

  // 4. POST /api/auth/change-password
  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const token = extractSessionToken(req);
      if (!token) {
        return res.status(401).json({ message: 'Acesso não autorizado.' });
      }

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        return res.status(401).json({ message: 'Sessão expirada.' });
      }

      const { newPassword } = req.body || {};
      if (!newPassword || String(newPassword).trim().length < 6) {
        return res.status(400).json({ message: 'Nova senha deve ter pelo menos 6 caracteres.' });
      }

      const hashedNewPassword = await hashPassword(String(newPassword).trim());

      await prisma.user.update({
        where: { id: session.userId },
        data: {
          passwordHash: hashedNewPassword,
          mustChangePassword: false,
        },
      });

      await AuditLogService.record(prisma, {
        tenantId: session.user?.tenantId || null,
        userId: session.userId,
        userName: session.user?.name || null,
        action: 'PASSWORD_CHANGED',
        entity: 'AUTH',
        entityId: session.userId,
        req,
      });

      return res.json({ success: true, message: 'Senha alterada com sucesso.' });
    } catch (err) {
      return res.status(500).json({ message: 'Erro ao alterar a senha.' });
    }
  });

  // Helper middleware/function for tenant context & session auth with instant suspension protection
  const getAuthSession = async (req: express.Request) => {
    const token = extractSessionToken(req);
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { tenant: true } } },
    });

    if (!session || session.expiresAt < new Date()) return null;

    // Instant suspension/inactivation protection: if user is not active or non-master tenant is not ACTIVE, kill session
    if (
      !session.user.active ||
      (session.user.role !== 'PLATFORM_MASTER' && session.user.tenant && session.user.tenant.status !== 'ACTIVE')
    ) {
      await AdminContextManager.clearContext(session.id, prisma);
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    // Hostname / Domain tenant boundary validation:
    // If request arrives via an unconfigured domain, deny access immediately
    const reqHost = TenantResolver.extractHost(req);
    const domainResolution = await TenantResolver.resolveByHost(prisma, reqHost);
    if (domainResolution.type === 'DOMAIN_NOT_CONFIGURED') {
      return null;
    }
    if (
      domainResolution.tenant &&
      (domainResolution.type === 'CUSTOM_DOMAIN' || domainResolution.type === 'PLATFORM_SUBDOMAIN')
    ) {
      if (session.user.role !== 'PLATFORM_MASTER' && session.user.tenantId !== domainResolution.tenant.id) {
        // Cross-tenant access forbidden: user from Tenant A accessing domain of Tenant B
        return null;
      }
    }

    // Context switch support for PLATFORM_MASTER (PostgreSQL as authoritative persistent store)
    let effectiveTenantId = session.user.tenantId;
    let adminContext: any = null;

    if (session.user.role === 'PLATFORM_MASTER') {
      // 1. Primary: PostgreSQL persistent session columns
      if (session.adminTargetTenantId && session.adminContextExpiresAt) {
        if (new Date(session.adminContextExpiresAt) > new Date()) {
          const targetTenant = await prisma.tenant.findUnique({
            where: { id: session.adminTargetTenantId },
          });

          if (targetTenant && !targetTenant.deletedAt && targetTenant.status !== 'CANCELLED') {
            adminContext = {
              targetTenantId: targetTenant.id,
              targetTenantName: session.adminTargetTenantName || targetTenant.name,
              switchedAt: session.adminSwitchedAt || session.createdAt,
              expiresAt: session.adminContextExpiresAt,
            };
            effectiveTenantId = targetTenant.id;
            AdminContextManager.warmCache(session.id, adminContext);
          } else {
            // Target tenant deleted or cancelled: clear invalid persistent context
            await AdminContextManager.clearContext(session.id, prisma);
          }
        } else {
          // Expired context: clear persistent state
          await AdminContextManager.clearContext(session.id, prisma);
        }
      } else {
        // 2. Fallback: in-memory cache
        adminContext = AdminContextManager.getContext(session.id);
        if (adminContext) {
          effectiveTenantId = adminContext.targetTenantId;
          await prisma.session.update({
            where: { id: session.id },
            data: {
              adminTargetTenantId: adminContext.targetTenantId,
              adminTargetTenantName: adminContext.targetTenantName,
              adminSwitchedAt: adminContext.switchedAt,
              adminContextExpiresAt: adminContext.expiresAt,
            },
          }).catch(() => {});
        }
      }
    }

    return {
      ...session,
      effectiveTenantId,
      adminContext,
    };
  };

  // -------------------------------------------------------------
  // PUSHER REALTIME AUTHENTICATION ENDPOINT
  // -------------------------------------------------------------
  app.post('/api/pusher/auth', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Autenticação obrigatória para acesso Realtime.' });
      }

      const socketId = req.body.socket_id;
      const channel = req.body.channel_name;

      if (!socketId || !channel) {
        return res.status(400).json({ error: 'Parâmetros socket_id e channel_name são obrigatórios.' });
      }

      const userRole = session.user.role;
      const userId = session.user.id;

      // Validate tenant channel access
      if (channel.startsWith('private-tenant-')) {
        const requestedTenantId = channel.replace('private-tenant-', '');
        
        // PLATFORM_MASTER validation uses effectiveTenantId context switch rules
        if (userRole === 'PLATFORM_MASTER') {
          const effectiveTenantId = req.headers['x-tenant-id'] as string || session.effectiveTenantId;
          if (requestedTenantId !== effectiveTenantId) {
            return res.status(403).json({ error: 'PLATFORM_MASTER tentando acessar tenant indevido para o contexto atual.' });
          }
        } 
        // Standard user validation
        else if (requestedTenantId !== session.user.tenantId) {
          return res.status(403).json({ error: 'Acesso negado ao canal do tenant.' });
        }
      } 
      // Validate user channel access
      else if (channel.startsWith('private-user-')) {
        const requestedUserId = channel.replace('private-user-', '');
        if (requestedUserId !== userId) {
          return res.status(403).json({ error: 'Acesso negado ao canal do usuário.' });
        }
      }
      // Validate platform global channel access
      else if (channel === 'private-platform-global') {
        // Allow subscription for all authenticated users (valid session verified above)
      } else {
        return res.status(403).json({ error: 'Canal não suportado ou negado.' });
      }

      const authResponse = eventBus.authorizeChannel(socketId, channel, {
        user_id: userId,
        user_info: { role: userRole }
      });
      
      return res.json(authResponse);

    } catch (err: any) {
      console.error('[PUSHER AUTH ERROR]', err);
      return res.status(500).json({ error: 'Erro ao autenticar canal do Pusher.' });
    }
  });

  // -------------------------------------------------------------
  // REALTIME SERVER-SENT EVENTS (SSE) ENDPOINT
  // -------------------------------------------------------------
  app.get('/api/realtime', async (req, res) => {
    try {
      const isPusher = (process.env.VITE_REALTIME_PROVIDER || process.env.REALTIME_PROVIDER || 'pusher') === 'pusher';
      if (isPusher) {
        // Quando Pusher é o provedor ativo, SSE é estritamente desativado (sem fallback automático)
        return res.status(204).end();
      }

      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Autenticação obrigatória para SSE.' });
      }

      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Tenant ativo é obrigatório para conexão Realtime.' });
      }

      // Headers estritos para SSE streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const connectionId = crypto.randomUUID();
      const sseConn = {
        connectionId,
        userId: session.user.id,
        tenantId,
        userRole: session.user.role,
        res,
        createdAt: new Date(),
      };

      sseRegistry.registerConnection(sseConn);

      // Evento inicial "connected"
      const connectedPayload = {
        connectionId,
        tenantId,
        userId: session.user.id,
        timestamp: new Date().toISOString(),
      };
      res.write(`event: connected\ndata: ${JSON.stringify(connectedPayload)}\n\n`);

      // Cleanup seguro ao desconectar
      const cleanup = () => {
        sseRegistry.unregisterConnection(connectionId);
      };

      req.on('close', cleanup);
      req.on('aborted', cleanup);
      res.on('finish', cleanup);
    } catch (err) {
      console.error('[REALTIME SSE ROUTE ERROR]', err);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Erro ao iniciar conexão SSE.' });
      }
    }
  });

  // Estatísticas do SSE para administradores
  app.get('/api/realtime/stats', async (req, res) => {
    const session = await getAuthSession(req);
    if (!session || session.user.role !== 'PLATFORM_MASTER') {
      return res.status(403).json({ error: 'Acesso restrito.' });
    }
    return res.json(sseRegistry.getStats());
  });

  // -------------------------------------------------------------
  // CLIENTS API (PostgreSQL / Prisma)
  // -------------------------------------------------------------
  app.get('/api/clients', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      }

      const whereCondition = { tenantId, deletedAt: null };
      const clients = await prisma.client.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
      });
      return res.json(clients);
    } catch (err) {
      console.error('[API CLIENTS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar clientes no PostgreSQL.' });
    }
  });

  app.post('/api/clients', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Sessão e Tenant ativos são necessários para cadastrar cliente.' });
      }

      const userRole = session.user.role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'clients.create')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'clients.create'." });
      }

      const { cpf, fullName, phone, email, birthDate, benefitNumber, salary, marginFree, marginCard, addressStreet, addressCity, addressState, addressZip } = req.body;
      if (!cpf || !fullName) {
        return res.status(400).json({ error: 'CPF e Nome Completo são obrigatórios.' });
      }

      const cleanCpf = String(cpf).replace(/\D/g, '');

      // Verificar existência para diferenciar com precisão CLIENT_CREATED de CLIENT_UPDATED
      const existingClient = await prisma.client.findUnique({
        where: { tenantId_cpf: { tenantId, cpf: cleanCpf } },
        select: { id: true },
      });

      const client = await prisma.client.upsert({
        where: { tenantId_cpf: { tenantId, cpf: cleanCpf } },
        update: {
          fullName,
          phone: phone || null,
          email: email || null,
          benefitNumber: benefitNumber || null,
          addressStreet: addressStreet || null,
          addressCity: addressCity || null,
          addressState: addressState || null,
          addressZip: addressZip || null,
          deletedAt: null, // Restaura se estava em soft-delete
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          cpf: cleanCpf,
          fullName,
          phone: phone || null,
          email: email || null,
          benefitNumber: benefitNumber || null,
          addressStreet: addressStreet || null,
          addressCity: addressCity || null,
          addressState: addressState || null,
          addressZip: addressZip || null,
        },
      });

      // Emissão pós-commit estrita por tenant
      const clientAction = existingClient ? 'CLIENT_UPDATED' : 'CLIENT_CREATED';
      sseRegistry.broadcastToTenant(tenantId, {
        type: clientAction,
        entity: 'Client',
        entityId: client.id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: clientAction,
        entity: 'Client',
        entityId: client.id,
        newData: {
          id: client.id,
          fullName: client.fullName,
          cpf: maskCPF(client.cpf),
          phone: client.phone,
        },
        req,
      });

      return res.json(client);
    } catch (err) {
      console.error('[API CLIENTS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao salvar cliente no PostgreSQL.' });
    }
  });

  app.delete('/api/clients/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(401).json({ error: 'Acesso não autorizado.' });
      }

      const client = await prisma.client.findFirst({
        where: { id, tenantId },
      });

      if (!client) {
        return res.status(404).json({ error: 'Cliente não encontrado.' });
      }

      await prisma.client.updateMany({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });

      // Emissão pós-commit
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'CLIENT_DELETED',
        entity: 'Client',
        entityId: id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'CLIENT_DELETED',
        entity: 'Client',
        entityId: id,
        oldData: {
          id: client.id,
          fullName: client.fullName,
          cpf: maskCPF(client.cpf),
        },
        req,
      });

      return res.json({ success: true, message: 'Cliente removido.' });
    } catch (err) {
      console.error('[API CLIENTS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover cliente.' });
    }
  });

  // -------------------------------------------------------------
  // SIMULATIONS API (PostgreSQL / Prisma)
  // -------------------------------------------------------------
  app.get('/api/simulations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const simulations = await prisma.simulationRequest.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          partner: true,
          createdBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      return res.json(simulations);
    } catch (err) {
      console.error('[API SIMULATIONS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar solicitações de simulação.' });
    }
  });

  app.get('/api/simulations/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão inválida.' });
      }

      const simulation = await prisma.simulationRequest.findFirst({
        where: { id: req.params.id, tenantId, deletedAt: null },
        include: {
          partner: true,
          createdBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      if (!simulation) {
        return res.status(404).json({ error: 'Solicitação de simulação não encontrada.' });
      }

      return res.json(simulation);
    } catch (err) {
      console.error('[API SIMULATIONS GET BY ID ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar solicitação de simulação.' });
    }
  });

  app.post('/api/simulations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const { cpf, partnerId } = req.body;
      if (!cpf || !partnerId) {
        return res.status(400).json({ error: 'CPF e Parceiro são obrigatórios.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ error: 'CPF inválido. Informe os 11 dígitos do CPF.' });
      }

      // Verify partner belongs to tenant and is active
      const partner = await prisma.partner.findFirst({
        where: { id: partnerId, tenantId, deletedAt: null, status: 'ATIVO' },
      });
      if (!partner) {
        return res.status(400).json({ error: 'Parceiro não encontrado, inativo ou não pertence a este tenant.' });
      }

      // Check duplicate pending simulation
      const existing = await SimulationService.checkExistingPendingSimulation(
        prisma,
        tenantId,
        cleanCpf,
        partnerId
      );
      if (existing) {
        return res.status(409).json({
          error: 'Já existe uma solicitação de simulação pendente para este CPF e Parceiro.',
          existing,
        });
      }

      const newSimulation = await prisma.simulationRequest.create({
        data: {
          tenantId,
          cpf: cleanCpf,
          partnerId,
          createdById: session.user.id,
          status: 'SIMULAÇÃO ENVIADA',
        },
        include: {
          partner: true,
          createdBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'SIMULATION_CREATED',
        entity: 'SimulationRequest',
        entityId: newSimulation.id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'CRIAR_SOLICITACAO_SIMULACAO',
        entity: 'SimulationRequest',
        entityId: newSimulation.id,
        newData: {
          id: newSimulation.id,
          cpfMasked: maskCPF(newSimulation.cpf),
          partnerId: newSimulation.partnerId,
          createdById: newSimulation.createdById,
          status: newSimulation.status,
        },
        req,
      });

      return res.status(201).json(newSimulation);
    } catch (err) {
      console.error('[API SIMULATIONS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar solicitação de simulação.' });
    }
  });

  app.patch('/api/simulations/:id/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const { id } = req.params;
      const {
        status,
        rejectionReason,
        matchedProposalId,
        matchedProposalNumber,
        matchedDigitizerId,
        matchedDigitizerName,
        matchedAt,
      } = req.body;

      const existing = await prisma.simulationRequest.findFirst({
        where: { id, tenantId, deletedAt: null },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Solicitação de simulação não encontrada ou pertence a outro tenant.' });
      }

      const updated = await prisma.simulationRequest.update({
        where: { id },
        data: {
          status: status || existing.status,
          rejectionReason: rejectionReason !== undefined ? rejectionReason : existing.rejectionReason,
          matchedProposalId: matchedProposalId !== undefined ? matchedProposalId : existing.matchedProposalId,
          matchedProposalNumber: matchedProposalNumber !== undefined ? matchedProposalNumber : existing.matchedProposalNumber,
          matchedDigitizerId: matchedDigitizerId !== undefined ? matchedDigitizerId : existing.matchedDigitizerId,
          matchedDigitizerName: matchedDigitizerName !== undefined ? matchedDigitizerName : existing.matchedDigitizerName,
          matchedAt: matchedAt ? new Date(matchedAt) : existing.matchedAt,
        },
        include: {
          partner: true,
          createdBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'SIMULATION_STATUS_UPDATED',
        entity: 'SimulationRequest',
        entityId: updated.id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'ATUALIZAR_STATUS_SIMULACAO',
        entity: 'SimulationRequest',
        entityId: updated.id,
        oldData: {
          id: existing.id,
          cpfMasked: maskCPF(existing.cpf),
          status: existing.status,
        },
        newData: {
          id: updated.id,
          cpfMasked: maskCPF(updated.cpf),
          status: updated.status,
          rejectionReason: updated.rejectionReason,
        },
        req,
      });

      return res.json(updated);
    } catch (err) {
      console.error('[API SIMULATIONS PATCH STATUS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar status da solicitação de simulação.' });
    }
  });

  app.delete('/api/simulations/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const { id } = req.params;
      const reason = (req.body?.reason || req.query?.reason || 'Exclusão solicitada') as string;

      const simulation = await prisma.simulationRequest.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!simulation) {
        return res.status(404).json({ error: 'Solicitação de simulação não encontrada ou pertence a outro tenant.' });
      }

      // RBAC validation
      const canDelete = SimulationService.canDeleteSimulationRequest(
        session.user,
        tenantId,
        simulation
      );

      if (!canDelete) {
        return res.status(403).json({
          error: 'Você não tem permissão para excluir esta solicitação de simulação.',
        });
      }

      // Soft delete
      await prisma.simulationRequest.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: session.user.id,
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'SIMULATION_DELETED',
        entity: 'SimulationRequest',
        entityId: id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'EXCLUIR_SOLICITACAO_SIMULACAO',
        entity: 'SimulationRequest',
        entityId: id,
        oldData: {
          id: simulation.id,
          cpfMasked: maskCPF(simulation.cpf),
          partnerId: simulation.partnerId,
          status: simulation.status,
          reason,
        },
        req,
      });

      return res.json({ success: true, message: 'Solicitação de simulação excluída com sucesso.' });
    } catch (err) {
      console.error('[API SIMULATIONS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao excluir solicitação de simulação.' });
    }
  });

  app.post('/api/simulations/bulk-delete', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const { ids, reason } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'A lista de IDs para exclusão é obrigatória.' });
      }

      // Fetch simulations inside tenant only
      const simulations = await prisma.simulationRequest.findMany({
        where: {
          id: { in: ids },
          tenantId,
          deletedAt: null,
        },
      });

      const results: Array<{ id: string; success: boolean; error?: string }> = [];
      const deletedIds: string[] = [];

      for (const id of ids) {
        const sim = simulations.find(s => s.id === id);
        if (!sim) {
          results.push({ id, success: false, error: 'Simulação não encontrada no tenant ativo.' });
          continue;
        }

        const canDelete = SimulationService.canDeleteSimulationRequest(
          session.user,
          tenantId,
          sim
        );

        if (!canDelete) {
          results.push({ id, success: false, error: 'Permissão negada para excluir este registro.' });
          continue;
        }

        await prisma.simulationRequest.update({
          where: { id: sim.id },
          data: {
            deletedAt: new Date(),
            deletedBy: session.user.id,
          },
        });

        deletedIds.push(sim.id);
        results.push({ id: sim.id, success: true });
      }

      if (deletedIds.length > 0) {
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'SIMULATION_BULK_DELETED',
          entity: 'SimulationRequest',
          entityId: 'bulk',
          userId: session.user.id,
        });

        await AuditLogService.record(prisma, {
          tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'EXCLUSAO_EM_MASSA_SIMULACAO',
          entity: 'SimulationRequest',
          entityId: 'bulk',
          newData: {
            requestedCount: ids.length,
            deletedCount: deletedIds.length,
            failedCount: ids.length - deletedIds.length,
            deletedIds,
            reason: reason || 'Exclusão em massa solicitada',
          },
          req,
        });
      }

      return res.json({
        success: true,
        requestedCount: ids.length,
        deletedCount: deletedIds.length,
        failedCount: ids.length - deletedIds.length,
        results,
      });
    } catch (err) {
      console.error('[API SIMULATIONS BULK DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao processar exclusão em massa.' });
    }
  });

  // -------------------------------------------------------------
  // PROPOSALS API (PostgreSQL / Prisma)
  // -------------------------------------------------------------
  app.get('/api/proposals', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const whereCondition = { tenantId };
      const proposals = await prisma.proposal.findMany({
        where: whereCondition,
        include: { client: true, bank: true, promoter: true, partner: true, product: true },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(proposals);
    } catch (err) {
      console.error('[API PROPOSALS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar propostas no PostgreSQL.' });
    }
  });

  app.post('/api/proposals', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Sessão e Tenant ativos são necessários para cadastrar proposta.' });
      }

      const { proposalNumber, clientId, clientCpf, clientName, bankId, promoterId, partnerId, productId, type, releasedValue, contractValue, installmentValue, installmentsCount } = req.body;

      let targetClientId = clientId;

      // Upsert client if CPF provided
      if (!targetClientId && clientCpf) {
        const cleanCpf = String(clientCpf).replace(/\D/g, '');
        const client = await prisma.client.upsert({
          where: { tenantId_cpf: { tenantId, cpf: cleanCpf } },
          update: { fullName: clientName || 'Cliente' },
          create: { tenantId, cpf: cleanCpf, fullName: clientName || 'Cliente' },
        });
        targetClientId = client.id;
      }

      if (!targetClientId) {
        return res.status(400).json({ error: 'Cliente é obrigatório para cadastrar proposta.' });
      }

      const proposal = await prisma.proposal.create({
        data: {
          tenantId,
          proposalNumber: proposalNumber || `PROP-${Date.now()}`,
          clientId: targetClientId,
          bankId: bankId || null,
          promoterId: promoterId || null,
          partnerId: partnerId || null,
          productId: productId || null,
          type: type || 'NOVO',
          releasedValue: releasedValue ? Number(releasedValue) : 0,
          contractValue: contractValue ? Number(contractValue) : 0,
          installmentValue: installmentValue ? Number(installmentValue) : 0,
          installmentsCount: installmentsCount ? Number(installmentsCount) : 84,
          createdById: session?.user?.id || null,
        },
        include: { client: true, bank: true, promoter: true, partner: true, product: true },
      });

      // Emissão pós-commit de PROPOSAL_CREATED estritamente para o tenant da sessão
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'PROPOSAL_CREATED',
        entity: 'Proposal',
        entityId: proposal.id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'PROPOSAL_CREATED',
        entity: 'Proposal',
        entityId: proposal.id,
        newData: {
          id: proposal.id,
          proposalNumber: proposal.proposalNumber,
          type: proposal.type,
          contractValue: proposal.contractValue,
          installmentValue: proposal.installmentValue,
        },
        req,
      });

      return res.json(proposal);
    } catch (err) {
      console.error('[API PROPOSALS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar proposta no PostgreSQL.' });
    }
  });

  // PATCH /api/proposals/:id - Optimistic concurrency, status change history & real-time events
  app.patch('/api/proposals/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Sessão e Tenant ativos são necessários para atualizar proposta.' });
      }

      const { id } = req.params;
      const {
        version,
        statusId,
        statusName,
        releasedValue,
        contractValue,
        installmentValue,
        installmentsCount,
        debtBalance,
        commissionRate,
        bankId,
        promoterId,
        partnerId,
        productId,
        type,
        standardCategory,
        notes,
      } = req.body;

      // 1. Buscar proposta existente com validação de tenant
      const existing = await prisma.proposal.findFirst({
        where: { id, tenantId, deletedAt: null },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      // 2. Concorrência Otimista (Optimistic Concurrency) via Proposal.version
      if (version !== undefined && Number(version) !== existing.version) {
        return res.status(409).json({
          error: 'Conflito de versão concorrente: Esta proposta foi modificada por outro operador.',
          currentVersion: existing.version,
          expectedVersion: Number(version),
        });
      }

      // Validação estrita de statusId no PostgreSQL para evitar Foreign Key Violation (P2003)
      let validatedStatus: { id: string; name: string; standardCategory: string | null } | null = null;
      if (statusId !== undefined && statusId !== null && statusId !== '') {
        // Rejeitar IDs legados "st-*" do LocalStorage com erro explícito 400
        if (typeof statusId === 'string' && statusId.startsWith('st-')) {
          return res.status(400).json({
            error: 'ID de status legado inválido. O sistema requer identificador oficial do banco de dados (PostgreSQL).',
            details: { statusId, expectedFormat: 'CUID de proposal_statuses' },
          });
        }

        validatedStatus = await prisma.proposalStatus.findFirst({
          where: { id: statusId, tenantId, active: true },
          select: { id: true, name: true, standardCategory: true },
        });

        if (!validatedStatus) {
          return res.status(400).json({
            error: 'Status de proposta inexistente, inativo ou não pertencente a este tenant.',
            details: { statusId, tenantId },
          });
        }
      }

      const isStatusChanging = statusId !== undefined && statusId !== existing.statusId;

      // 3. Executar transação atômica no PostgreSQL
      const result = await prisma.$transaction(async (tx) => {
        // Atualizar proposta incrementando a versão
        const updated = await tx.proposal.update({
          where: { id },
          data: {
            statusId: statusId !== undefined ? statusId : undefined,
            standardCategory: standardCategory || undefined,
            releasedValue: releasedValue !== undefined ? Number(releasedValue) : undefined,
            contractValue: contractValue !== undefined ? Number(contractValue) : undefined,
            installmentValue: installmentValue !== undefined ? Number(installmentValue) : undefined,
            installmentsCount: installmentsCount !== undefined ? Number(installmentsCount) : undefined,
            debtBalance: debtBalance !== undefined ? (debtBalance ? Number(debtBalance) : null) : undefined,
            commissionRate: commissionRate !== undefined ? (commissionRate ? Number(commissionRate) : null) : undefined,
            bankId: bankId !== undefined ? bankId : undefined,
            promoterId: promoterId !== undefined ? promoterId : undefined,
            partnerId: partnerId !== undefined ? partnerId : undefined,
            productId: productId !== undefined ? productId : undefined,
            type: type || undefined,
            version: { increment: 1 },
          },
          include: { client: true, bank: true, promoter: true, partner: true, product: true },
        });

        // Gravar StatusHistory se o status mudou
        let statusHistoryRecord: any = null;
        let targetStatusName = statusName || 'Alteração de Fase';
        let targetCategory: string | null = null;

        if (isStatusChanging) {
          const finalStatusName = validatedStatus?.name || statusName || 'Alteração de Fase';
          const finalCategory = validatedStatus?.standardCategory || null;

          statusHistoryRecord = await tx.statusHistory.create({
            data: {
              tenantId,
              proposalId: id,
              statusId: statusId || null,
              statusName: finalStatusName,
              userId: session.user.id,
              notes: notes || null,
            },
          });

          targetStatusName = finalStatusName;
          targetCategory = finalCategory;
        }

        return {
          updated,
          isStatusChanging,
          statusHistoryRecord,
          targetStatusName,
          targetCategory,
        };
      });

      // 4. Emissão PÓS-COMMIT garantida: somente após sucesso total da transação de negócio
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'PROPOSAL_UPDATED',
        entity: 'Proposal',
        entityId: result.updated.id,
        userId: session.user.id,
      });

      // Audit log recording (Differentiating status change vs general proposal update)
      if (result.isStatusChanging) {
        await AuditLogService.record(prisma, {
          tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'PROPOSAL_STATUS_CHANGED',
          entity: 'Proposal',
          entityId: result.updated.id,
          oldData: {
            statusId: existing.statusId,
            standardCategory: existing.standardCategory,
          },
          newData: {
            statusId: result.updated.statusId,
            statusName: result.targetStatusName,
            standardCategory: result.targetCategory,
          },
          req,
        });
      } else {
        const delta = computeDelta(existing, result.updated);
        await AuditLogService.record(prisma, {
          tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'PROPOSAL_UPDATED',
          entity: 'Proposal',
          entityId: result.updated.id,
          oldData: delta.oldDelta,
          newData: delta.newDelta,
          req,
        });
      }

      if (result.isStatusChanging) {
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'STATUS_CHANGED',
          entity: 'Proposal',
          entityId: result.updated.id,
          userId: session.user.id,
        });

        // 5. Persistência de Notificação PÓS-COMMIT (Desacoplada com garantia contra P2002)
        if (result.statusHistoryRecord) {
          try {
            const statusNotifications = await BusinessNotificationService.onStatusChanged(prisma, {
              tenantId,
              operatorUserId: session.user.id,
              operatorName: session.user.name,
              proposal: {
                id: existing.id,
                proposalNumber: existing.proposalNumber,
                assignedToId: existing.assignedToId,
                createdById: existing.createdById,
              },
              statusHistoryId: result.statusHistoryRecord.id,
              toStatusName: result.targetStatusName,
              toCategory: result.targetCategory,
            });

            // Emissão pós-persistência de NOTIFICATION_CREATED (thin event) para destinatários
            for (const notif of statusNotifications) {
              BusinessNotificationService.emitNotificationCreated(tenantId, notif.id, notif.userId);
            }
          } catch (notifErr) {
            logger.warn(
              { error: notifErr, tenantId, proposalId: result.updated.id },
              '[API PROPOSALS] Aviso ao processar notificações de status pós-commit'
            );
          }
        }
      }

      return res.json(result.updated);
    } catch (err) {
      console.error('[API PROPOSALS PATCH ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar proposta no PostgreSQL.' });
    }
  });

  // POST /api/proposals/:id/comments - Comentários com validação de tenant e SSE COMMENT_ADDED
  app.post('/api/proposals/:id/comments', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const { id } = req.params;
      const { text } = req.body;

      if (!text || String(text).trim().length === 0) {
        return res.status(400).json({ error: 'Texto do comentário é obrigatório.' });
      }

      // Validar se proposta pertence ao tenant
      const proposal = await prisma.proposal.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          id: true,
          proposalNumber: true,
          assignedToId: true,
          createdById: true,
        },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada neste tenant.' });
      }

      // 1. Transação de Negócio (Isolada e Prioritária)
      const comment = await prisma.$transaction(async (tx) => {
        return await tx.comment.create({
          data: {
            tenantId,
            proposalId: id,
            userId: session.user.id,
            authorName: session.user.name,
            text: String(text).trim(),
          },
        });
      });

      // 2. Emissão PÓS-COMMIT de sinalização realtime
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'COMMENT_ADDED',
        entity: 'Comment',
        entityId: comment.id,
        userId: session.user.id,
      });

      // 3. Persistência de Notificação PÓS-COMMIT (Desacoplada com garantia contra P2002)
      try {
        const notifs = await BusinessNotificationService.onCommentAdded(prisma, {
          tenantId,
          authorUserId: session.user.id,
          authorName: session.user.name,
          proposal: {
            id: proposal.id,
            proposalNumber: proposal.proposalNumber,
            assignedToId: proposal.assignedToId,
            createdById: proposal.createdById,
          },
          comment: {
            id: comment.id,
            text: comment.text,
          },
        });

        // Emissão pós-persistência de NOTIFICATION_CREATED (thin event) para destinatários
        for (const notif of notifs) {
          BusinessNotificationService.emitNotificationCreated(tenantId, notif.id, notif.userId);
        }
      } catch (notifErr) {
        logger.warn(
          { error: notifErr, tenantId, commentId: comment.id },
          '[API PROPOSALS COMMENTS] Aviso ao processar notificações de comentário pós-commit'
        );
      }

      return res.json(comment);
    } catch (err) {
      console.error('[API PROPOSALS COMMENTS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao adicionar comentário.' });
    }
  });

  // GET /api/proposals/:id/comments
  app.get('/api/proposals/:id/comments', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Acesso não autorizado.' });
      }

      const { id } = req.params;
      const comments = await prisma.comment.findMany({
        where: { proposalId: id, tenantId },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(comments);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar comentários.' });
    }
  });

  // GET /api/proposals/:id/timeline
  app.get('/api/proposals/:id/timeline', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Acesso não autorizado: sessão ou tenant inválido.' });
      
      const { id } = req.params;

      // 1. Validar existência da proposta no tenant respeitando soft delete
      const proposal = await prisma.proposal.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true, proposalNumber: true },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada neste tenant.' });
      }
      
      // 2. Consultas resilientes com Promise.allSettled para evitar que uma falha isole toda a timeline
      const [historyResult, commentsResult, tasksResult, notifsResult] = await Promise.allSettled([
        prisma.statusHistory.findMany({
          where: { proposalId: id, tenantId },
          include: { status: true, user: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.comment.findMany({
          where: { proposalId: id, tenantId },
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.task.findMany({
          where: { proposalId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.findMany({
          where: { proposalId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const failedSources: string[] = [];
      const history = historyResult.status === 'fulfilled'
        ? historyResult.value
        : (console.error('[API TIMELINE] Falha na consulta de statusHistory:', historyResult.reason?.message || historyResult.reason), failedSources.push('statusHistory'), []);

      const comments = commentsResult.status === 'fulfilled'
        ? commentsResult.value
        : (console.error('[API TIMELINE] Falha na consulta de comments:', commentsResult.reason?.message || commentsResult.reason), failedSources.push('comments'), []);

      const tasks = tasksResult.status === 'fulfilled'
        ? tasksResult.value
        : (console.error('[API TIMELINE] Falha na consulta de tasks:', tasksResult.reason?.message || tasksResult.reason), failedSources.push('tasks'), []);

      const notifications = notifsResult.status === 'fulfilled'
        ? notifsResult.value
        : (console.error('[API TIMELINE] Falha na consulta de notifications:', notifsResult.reason?.message || notifsResult.reason), failedSources.push('notifications'), []);

      const timeline = [
        ...history.map(h => ({ type: 'STATUS', date: h.createdAt, data: h })),
        ...comments.map(c => ({ type: 'COMMENT', date: c.createdAt, data: c })),
        ...tasks.map(t => ({ type: 'TASK', date: t.createdAt, data: t })),
        ...notifications.map(n => ({ type: 'NOTIFICATION', date: n.createdAt, data: n })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (failedSources.length > 0) {
        console.warn(`[API TIMELINE] Proposta ${id}: Retorno parcial. Fontes com falha: ${failedSources.join(', ')}`);
      }

      if (req.query.format === 'object' || req.headers['x-api-version'] === '2') {
        return res.json({
          items: timeline,
          meta: {
            partial: failedSources.length > 0,
            failedSources,
            total: timeline.length,
          },
        });
      }

      return res.json(timeline);
    } catch (err: any) {
      console.error('[API TIMELINE ERROR]', err?.message || err);
      return res.status(500).json({ error: 'Erro ao buscar timeline.' });
    }
  });

  app.delete('/api/proposals/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(401).json({ error: 'Acesso não autorizado.' });
      }

      const proposal = await prisma.proposal.findFirst({
        where: { id, tenantId },
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada.' });
      }

      await prisma.proposal.deleteMany({
        where: { id, tenantId },
      });

      // Emissão pós-commit estritamente para o tenant
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'PROPOSAL_DELETED',
        entity: 'Proposal',
        entityId: id,
        userId: session.user.id,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'PROPOSAL_DELETED',
        entity: 'Proposal',
        entityId: id,
        oldData: {
          id: proposal.id,
          proposalNumber: proposal.proposalNumber,
          contractValue: proposal.contractValue,
        },
        req,
      });

      return res.json({ success: true, message: 'Proposta removida.' });
    } catch (err) {
      console.error('[API PROPOSALS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover proposta.' });
    }
  });

  // -------------------------------------------------------------
  // AUXILIARY ENTITIES (Statuses, Banks, Promoters, Partners, Products)
  // -------------------------------------------------------------
  app.get('/api/statuses', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const statuses = await prisma.proposalStatus.findMany({
        where: { tenantId, active: true },
        orderBy: { order: 'asc' },
      });
      return res.json(statuses);
    } catch (err) {
      console.error('[API /api/statuses] Erro ao buscar status no PostgreSQL:', err);
      return res.status(500).json({ error: 'Erro ao buscar status.' });
    }
  });

  app.get('/api/banks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const banks = await prisma.bank.findMany({
        where: { tenantId },
      });
      return res.json(banks);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar bancos.' });
    }
  });

  app.get('/api/promoters', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const promoters = await prisma.promoter.findMany({
        where: { tenantId },
      });
      return res.json(promoters);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar promotoras.' });
    }
  });

  app.get('/api/partners', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const partners = await prisma.partner.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { name: 'asc' },
      });

      const normalized = partners.map(p => {
        const fullName = p.name || 'Parceiro sem Nome';
        const code = p.code || '';
        const login = code ? (code.includes('@') ? code : `${fullName}@${code}`) : fullName;

        return {
          id: p.id,
          fullName,
          login,
          promoterId: p.promoterId || '',
          active: p.status === 'ATIVO',
          createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
          updatedAt: p.updatedAt ? p.updatedAt.toISOString() : new Date().toISOString(),
        };
      });

      return res.json(normalized);
    } catch (err) {
      console.error('[API PARTNERS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar parceiros.' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const products = await prisma.product.findMany({
        where: { tenantId },
      });
      return res.json(products);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar produtos.' });
    }
  });

  // -------------------------------------------------------------
  // FINANCIAL ENTRIES & NOTIFICATIONS
  // -------------------------------------------------------------
  app.get('/api/financial', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const entries = await prisma.financialEntry.findMany({
        where: { tenantId },
        orderBy: { dueDate: 'desc' },
      });
      return res.json(entries);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar lançamentos financeiros.' });
    }
  });

  app.get('/api/notifications/unread-count', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const count = await prisma.notification.count({
        where: { tenantId, userId: session.user.id, read: false },
      });
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar contador de notificações.' });
    }
  });

  app.get('/api/notifications', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const userId = session.user.id;
      
      const limit = Number(req.query.limit) || 20;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

      const notifications = await prisma.notification.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor } } : {}),
      });

      let nextCursor = undefined;
      if (notifications.length > limit) {
        const nextItem = notifications.pop();
        nextCursor = nextItem?.id;
      }

      return res.json({
        items: notifications,
        nextCursor,
        hasMore: !!nextCursor,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar notificações.' });
    }
  });

  // POST /api/notifications - Helper de criação com autorização estrita, validação de destinatário e emissão pós-commit
  app.post('/api/notifications', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const effectiveTenantId = session.effectiveTenantId || session?.user?.tenantId;
      if (!session?.user || !effectiveTenantId) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      // Validação de Tenant Spoofing no body: rejeitar qualquer tentativa de cross-tenant
      if (req.body.tenantId && req.body.tenantId !== effectiveTenantId) {
        return res.status(403).json({ error: 'Operação não permitida: tenant divergente da sessão.' });
      }

      // Verificação de Autorização RBAC:
      // Exige permissão explícita 'notifications.manage' ou papel PLATFORM_MASTER
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions;
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';
      const canManage = isPlatformMaster || hasPermission(userRole, userCustomPerms, 'notifications.manage');

      if (!canManage) {
        return res.status(403).json({ error: 'Acesso negado: permissão notifications.manage necessária.' });
      }

      const { targetUserId, userId, title, message, linkUrl, priority, type, proposalId } = req.body;
      if (!title || !message || typeof title !== 'string' || typeof message !== 'string' || !title.trim() || !message.trim()) {
        return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
      }

      // Validação do Destinatário (targetUserId ou userId)
      const finalTargetId = targetUserId || userId || session.user.id;
      const targetUser = await prisma.user.findFirst({
        where: { id: finalTargetId },
        select: { id: true, tenantId: true, role: true, active: true },
      });

      if (!targetUser) {
        return res.status(404).json({ error: 'Destinatário não encontrado.' });
      }

      // Bloquear cross-tenant target: o destinatário DEVE pertencer ao mesmo tenant da sessão
      if (targetUser.tenantId !== effectiveTenantId) {
        return res.status(403).json({ error: 'Acesso negado: destinatário pertence a outro tenant.' });
      }

      // Bloquear envio para PLATFORM_MASTER caso o emissor não seja PLATFORM_MASTER
      if (targetUser.role === 'PLATFORM_MASTER' && !isPlatformMaster) {
        return res.status(403).json({ error: 'Acesso negado: não é permitido enviar notificações a administradores de plataforma.' });
      }

      const validPriorities: PriorityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      const finalPriority = validPriorities.includes(priority) ? priority : 'MEDIUM';

      const validTypes: NotificationType[] = ['SYSTEM', 'PROPOSAL', 'TASK', 'SLA', 'CIP', 'ADMIN'];
      const finalType = validTypes.includes(type) ? type : 'SYSTEM';

      const notification = await prisma.notification.create({
        data: {
          tenantId: effectiveTenantId,
          userId: targetUser.id,
          title: title.trim().slice(0, 200),
          message: message.trim().slice(0, 1000),
          linkUrl: linkUrl ? String(linkUrl).trim().slice(0, 500) : null,
          priority: finalPriority,
          type: finalType,
          proposalId: proposalId || null,
        },
      });

      // Emissão pós-commit de NOTIFICATION_CREATED (thin event via Pusher e SSE)
      BusinessNotificationService.emitNotificationCreated(
        effectiveTenantId,
        notification.id,
        notification.userId
      );

      return res.status(201).json(notification);
    } catch (err) {
      logger.error({ err }, '[API] Erro ao criar notificação manual');
      return res.status(500).json({ error: 'Erro ao criar notificação.' });
    }
  });

  app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;

      const updated = await prisma.notification.updateMany({
        where: { id, tenantId },
        data: { read: true },
      });

      return res.json({ success: true, count: updated.count });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao marcar notificação como lida.' });
    }
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const userId = session.user.id;

      const updated = await prisma.notification.updateMany({
        where: { tenantId, userId, read: false },
        data: { read: true },
      });

      return res.json({ success: true, count: updated.count });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao marcar todas notificações como lidas.' });
    }
  });

  // -------------------------------------------------------------
  // TASKS API
  // -------------------------------------------------------------
  app.get('/api/tasks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const tasks = await prisma.task.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(tasks);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar tarefas.' });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id, title, description, category, priority, dueDate, completed, assignedToId, proposalId, clientId } = req.body;
      if (!title) return res.status(400).json({ error: 'Título é obrigatório.' });

      // 1. Transação de Negócio (Isolada e Prioritária)
      const task = await prisma.$transaction(async (tx) => {
        return await tx.task.create({
          data: {
            id: id || undefined,
            tenantId,
            title,
            description: description || null,
            category: category || 'OPERACIONAL',
            priority: priority || 'MEDIUM',
            dueDate: dueDate ? new Date(dueDate) : null,
            completed: Boolean(completed),
            assignedToId: assignedToId || null,
            proposalId: proposalId || null,
            clientId: clientId || null,
          },
        });
      });

      // 2. Emissão PÓS-COMMIT de TASK_CREATED
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'TASK_CREATED',
        entity: 'Task',
        entityId: task.id,
        userId: session.user.id,
      });

      // 3. Persistência de Notificação PÓS-COMMIT (Desacoplada com garantia contra P2002)
      try {
        const notif = await BusinessNotificationService.onTaskCreated(prisma, {
          tenantId,
          creatorUserId: session.user.id,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            assignedToId: task.assignedToId,
            proposalId: task.proposalId,
          },
        });

        // Emissão pós-persistência de NOTIFICATION_CREATED (thin event) se gerada
        if (notif) {
          BusinessNotificationService.emitNotificationCreated(tenantId, notif.id, notif.userId);
        }
      } catch (notifErr) {
        logger.warn(
          { error: notifErr, tenantId, taskId: task.id },
          '[API TASKS] Aviso ao processar notificações de tarefa pós-commit'
        );
      }

      return res.json(task);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar tarefa.' });
    }
  });

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      const { title, description, category, priority, dueDate, completed, assignedToId, proposalId, clientId } = req.body;

      const existing = await prisma.task.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Tarefa não encontrada.' });
      }

      const task = await prisma.task.update({
        where: { id },
        data: {
          title: title !== undefined ? title : undefined,
          description: description !== undefined ? description : undefined,
          category: category !== undefined ? category : undefined,
          priority: priority !== undefined ? priority : undefined,
          dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
          completed: completed !== undefined ? Boolean(completed) : undefined,
          assignedToId: assignedToId !== undefined ? assignedToId : undefined,
          proposalId: proposalId !== undefined ? proposalId : undefined,
          clientId: clientId !== undefined ? clientId : undefined,
        },
      });

      // Emissão pós-commit de TASK_UPDATED
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'TASK_UPDATED',
        entity: 'Task',
        entityId: task.id,
        userId: session.user.id,
      });

      return res.json({ success: true, task });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;

      const existing = await prisma.task.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Tarefa não encontrada.' });
      }

      await prisma.task.deleteMany({
        where: { id, tenantId },
      });

      // Emissão pós-commit de TASK_DELETED
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'TASK_DELETED',
        entity: 'Task',
        entityId: id,
        userId: session.user.id,
      });

      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao deletar tarefa.' });
    }
  });

  // -------------------------------------------------------------
  // CLIENT DOCUMENTS API (Azure Blob Storage + PostgreSQL Metadata)
  // -------------------------------------------------------------

  // 1. GET /api/documents
  app.get('/api/documents', documentRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      const clientId = req.query.clientId as string | undefined;

      const docs = await prisma.clientDocument.findMany({
        where: {
          tenantId,
          ...(clientId ? { clientId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(docs);
    } catch (err) {
      console.error('[API /api/documents GET] Error:', err);
      return res.status(500).json({ error: 'Erro ao listar documentos.' });
    }
  });

  // 2. POST /api/documents (Azure Blob Upload + Metadata)
  app.post('/api/documents', documentRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      const { clientId, proposalId, name, type, fileBase64, mimeType } = req.body || {};

      if (!clientId || typeof clientId !== 'string') {
        return res.status(400).json({ error: 'clientId é obrigatório.' });
      }

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name é obrigatório.' });
      }

      if (!fileBase64 || typeof fileBase64 !== 'string') {
        return res.status(400).json({ error: 'fileBase64 é obrigatório.' });
      }

      // Validate Client belongs to Tenant (Strict Security Check)
      const client = await prisma.client.findFirst({
        where: { id: clientId, tenantId },
      });
      if (!client) {
        return res.status(400).json({ error: 'Cliente inválido ou pertence a outro tenant.' });
      }

      // Convert base64 to Buffer
      const cleanBase64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      // Server-Side File Size Limit (15 MB Max)
      const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
      if (fileBuffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: 'Tamanho do arquivo excede o limite máximo permitido de 15MB.' });
      }

      // Path Traversal Protection & Physical Blob Path Construction
      const documentId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const { blobPath, safeFileName } = buildBlobPath(tenantId, clientId, documentId, name);

      // Upload Blob to Azure Storage
      const detectedMime = mimeType || 'application/octet-stream';
      await uploadBlob(blobPath, fileBuffer, detectedMime);

      // PostgreSQL Metadata Record Creation + Orphan Blob Compensation Guard
      let docRecord;
      try {
        docRecord = await prisma.clientDocument.create({
          data: {
            id: documentId,
            tenantId,
            clientId,
            proposalId: proposalId || null,
            name: safeFileName,
            type: type || 'OUTROS',
            fileUrl: `/api/documents/${documentId}`,
            fileSizeBytes: fileBuffer.length,
            storagePath: blobPath,
            mimeType: detectedMime,
            storageProvider: 'AZURE_BLOB',
            uploadedById: session.user.id,
          },
        });
      } catch (dbErr) {
        // ORPHAN BLOB COMPENSATION: If PostgreSQL insert fails, delete Azure Blob
        console.error('[AZURE COMPENSATING DELETE] Erro ao gravar metadata no PostgreSQL, removendo blob:', dbErr);
        await deleteBlob(blobPath).catch(err => {
          console.error('[AZURE COMPENSATING DELETE FAILURE] Falha ao deletar blob órfão:', err);
        });
        throw dbErr;
      }

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'DOCUMENT_UPLOADED',
        entity: 'Document',
        entityId: docRecord.id,
        newData: {
          id: docRecord.id,
          name: docRecord.name,
          type: docRecord.type,
          fileSizeBytes: docRecord.fileSizeBytes,
          clientId: docRecord.clientId,
          proposalId: docRecord.proposalId,
        },
        req,
      });

      return res.status(201).json({
        id: docRecord.id,
        tenantId: docRecord.tenantId,
        clientId: docRecord.clientId,
        proposalId: docRecord.proposalId,
        name: docRecord.name,
        type: docRecord.type,
        fileUrl: docRecord.fileUrl,
        fileSizeBytes: docRecord.fileSizeBytes,
        storagePath: docRecord.storagePath,
        mimeType: docRecord.mimeType,
        storageProvider: docRecord.storageProvider,
        createdAt: docRecord.createdAt,
        updatedAt: docRecord.updatedAt,
      });
    } catch (err: any) {
      console.error('[API /api/documents POST] Error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'Erro ao realizar upload do documento.' });
    }
  });

  // 3. GET /api/documents/:id (Download Document Stream)
  app.get('/api/documents/:id', documentRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      const { id } = req.params;

      // Strict tenant isolation query
      const docRecord = await prisma.clientDocument.findFirst({
        where: { id, tenantId },
      });

      if (!docRecord) {
        return res.status(404).json({ error: 'Documento não encontrado ou sem permissão.' });
      }

      if (!docRecord.storagePath) {
        return res.status(404).json({ error: 'Caminho do arquivo não encontrado no registro.' });
      }

      // Fetch file stream/buffer from Azure Blob Storage
      const { buffer, contentType } = await downloadBlob(docRecord.storagePath);

      const mime = docRecord.mimeType || contentType || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(docRecord.name)}"`);
      res.setHeader('Content-Length', buffer.length);

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'DOCUMENT_DOWNLOADED',
        entity: 'Document',
        entityId: docRecord.id,
        newData: {
          id: docRecord.id,
          name: docRecord.name,
        },
        req,
      });

      return res.send(buffer);
    } catch (err: any) {
      console.error('[API /api/documents/:id GET] Error:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao baixar o documento.' });
    }
  });

  // 4. DELETE /api/documents/:id
  app.delete('/api/documents/:id', documentRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      const { id } = req.params;

      // Strict tenant isolation query
      const docRecord = await prisma.clientDocument.findFirst({
        where: { id, tenantId },
      });

      if (!docRecord) {
        return res.status(404).json({ error: 'Documento não encontrado ou sem permissão para exclusão.' });
      }

      // Delete Blob from Azure Storage (Idempotent)
      if (docRecord.storagePath) {
        await deleteBlob(docRecord.storagePath);
      }

      // Delete Metadata from PostgreSQL
      await prisma.clientDocument.delete({
        where: { id: docRecord.id },
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'DOCUMENT_DELETED',
        entity: 'Document',
        entityId: docRecord.id,
        oldData: {
          id: docRecord.id,
          name: docRecord.name,
          type: docRecord.type,
          clientId: docRecord.clientId,
        },
        req,
      });

      return res.json({ success: true, id: docRecord.id });
    } catch (err: any) {
      console.error('[API /api/documents/:id DELETE] Error:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao excluir o documento.' });
    }
  });

  // -------------------------------------------------------------
  // PARTNERS (POST, PUT, PATCH, DELETE, SYNC-LOCAL)
  // -------------------------------------------------------------
  app.post('/api/partners', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });

      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id, fullName, name, login, code, promoterId, active, status, email, phone, document } = req.body;

      const partnerName = (fullName || name || '').trim().toUpperCase();
      const partnerLogin = (login || code || '').trim().toUpperCase();

      if (!partnerName) {
        return res.status(400).json({ error: 'Nome do parceiro é obrigatório.' });
      }
      if (!partnerLogin) {
        return res.status(400).json({ error: 'Login/Código do parceiro é obrigatório.' });
      }

      // Validate promoterId belongs to same tenant
      if (promoterId) {
        const validPromoter = await prisma.promoter.findFirst({
          where: { id: promoterId, tenantId, status: 'ATIVO' },
        });
        if (!validPromoter) {
          return res.status(400).json({ error: 'A promotora vinculada é inválida ou pertence a outro tenant.' });
        }
      }

      // Check if already exists in tenant (including soft-deleted)
      const existing = await prisma.partner.findFirst({
        where: {
          tenantId,
          OR: [
            { code: partnerLogin },
            { name: partnerName }
          ]
        }
      });

      const isPartnerActive = active !== undefined ? Boolean(active) : (status === 'ATIVO');

      let created;
      if (existing) {
        if (existing.deletedAt === null) {
          return res.status(400).json({ error: 'Este login ou nome de parceiro já está cadastrado.' });
        }
        // Reactivate soft-deleted partner
        created = await prisma.partner.update({
          where: { id: existing.id },
          data: {
            name: partnerName,
            code: partnerLogin,
            promoterId: promoterId || null,
            status: isPartnerActive ? 'ATIVO' : 'INATIVO',
            email: email || null,
            phone: phone || null,
            document: document || null,
            deletedAt: null,
          },
        });
      } else {
        created = await prisma.partner.create({
          data: {
            id: id || undefined,
            tenantId,
            name: partnerName,
            code: partnerLogin,
            promoterId: promoterId || null,
            status: isPartnerActive ? 'ATIVO' : 'INATIVO',
            email: email || null,
            phone: phone || null,
            document: document || null,
          },
        });
      }

      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id || 'system',
            userName: session.user.name || 'System',
            action: 'CREATE_PARTNER',
            entity: 'Partner',
            entityId: created.id,
            newData: JSON.stringify({ details: `Criado parceiro ${created.name} (${created.code})` }),
          }
        });
      } catch (auditErr) {}

      const codeStr = created.code || '';
      const loginStr = codeStr ? (codeStr.includes('@') ? codeStr : `${created.name}@${codeStr}`) : created.name;

      return res.json({
        id: created.id,
        fullName: created.name,
        login: loginStr,
        promoterId: created.promoterId || '',
        active: created.status === 'ATIVO',
        createdAt: created.createdAt ? created.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: created.updatedAt ? created.updatedAt.toISOString() : new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[API PARTNERS POST ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao criar parceiro.' });
    }
  });

  const handleUpdatePartner = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });

      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const { fullName, name, login, code, promoterId, active, status, email, phone, document } = req.body;

      const partnerName = name || fullName;
      const partnerLogin = code || login;
      const partnerStatus = active !== undefined ? (active ? 'ATIVO' : 'INATIVO') : status;

      if (promoterId) {
        const validPromoter = await prisma.promoter.findFirst({
          where: { id: promoterId, tenantId, status: 'ATIVO' },
        });
        if (!validPromoter) {
          return res.status(400).json({ error: 'A promotora vinculada é inválida ou pertence a outro tenant.' });
        }
      }

      await prisma.partner.updateMany({
        where: { id, tenantId },
        data: {
          ...(partnerName ? { name: partnerName.trim().toUpperCase() } : {}),
          ...(partnerLogin ? { code: partnerLogin.trim().toUpperCase() } : {}),
          ...(promoterId !== undefined ? { promoterId: promoterId || null } : {}),
          ...(partnerStatus ? { status: partnerStatus } : {}),
          ...(email !== undefined ? { email: email || null } : {}),
          ...(phone !== undefined ? { phone: phone || null } : {}),
          ...(document !== undefined ? { document: document || null } : {}),
        },
      });

      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id || 'system',
            userName: session.user.name || 'System',
            action: 'UPDATE_PARTNER',
            entity: 'Partner',
            entityId: id,
            newData: JSON.stringify({ details: `Atualizado parceiro ID ${id}` }),
          }
        });
      } catch (auditErr) {}

      return res.json({ success: true });
    } catch (err) {
      console.error('[API PARTNERS UPDATE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar parceiro.' });
    }
  };

  app.put('/api/partners/:id', handleUpdatePartner);
  app.patch('/api/partners/:id', handleUpdatePartner);

  app.delete('/api/partners/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });

      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;

      await prisma.partner.updateMany({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });

      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id || 'system',
            userName: session.user.name || 'System',
            action: 'DELETE_PARTNER',
            entity: 'Partner',
            entityId: id,
            newData: JSON.stringify({ details: `Removido parceiro ID ${id}` }),
          }
        });
      } catch (auditErr) {}

      return res.json({ success: true });
    } catch (err) {
      console.error('[API PARTNERS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover parceiro.' });
    }
  });

  app.post('/api/partners/sync-local', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });

      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'items deve ser um array de parceiros.' });
      }

      let createdCount = 0;
      let ignoredCount = 0;
      const errors: string[] = [];

      for (const item of items) {
        try {
          const fullName = (item.fullName || item.name || '').trim().toUpperCase();
          const login = (item.login || item.code || '').trim().toUpperCase();

          if (!fullName || !login) {
            ignoredCount++;
            continue;
          }

          const existing = await prisma.partner.findFirst({
            where: {
              tenantId,
              deletedAt: null,
              OR: [{ code: login }, { name: fullName }],
            },
          });

          if (existing) {
            ignoredCount++;
          } else {
            let promoterId: string | null = null;
            if (item.promoterId) {
              const p = await prisma.promoter.findFirst({
                where: { id: item.promoterId, tenantId, status: 'ATIVO' },
              });
              if (p) promoterId = p.id;
            }

            await prisma.partner.create({
              data: {
                tenantId,
                name: fullName,
                code: login,
                promoterId,
                status: item.active === false ? 'INATIVO' : 'ATIVO',
              },
            });
            createdCount++;
          }
        } catch (itemErr: any) {
          errors.push(`Erro ao migrar ${item.fullName || item.name}: ${itemErr.message}`);
        }
      }

      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: session.user.id || 'system',
            userName: session.user.name || 'System',
            action: 'MIGRATE_PARTNERS',
            entity: 'Partner',
            entityId: 'batch',
            newData: JSON.stringify({ details: `Migrados ${createdCount} parceiros, ${ignoredCount} ignorados, ${errors.length} erros.` }),
          },
        });
      } catch (auditErr) {}

      return res.json({ createdCount, ignoredCount, errors });
    } catch (err: any) {
      console.error('[API PARTNERS SYNC ERROR]', err);
      return res.status(500).json({ error: 'Erro ao migrar parceiros.' });
    }
  });

  // -------------------------------------------------------------
  // PROMOTERS (POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.post('/api/promoters', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id, name, code, status } = req.body;
      if (!name || !code) return res.status(400).json({ error: 'Nome e Código são obrigatórios.' });
      const promoter = await prisma.promoter.create({
        data: {
          id: id || undefined,
          tenantId,
          name,
          code,
          status: status || 'ATIVO',
        },
      });
      return res.json(promoter);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar promotora.' });
    }
  });

  app.put('/api/promoters/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      const { name, code, status } = req.body;
      const promoter = await prisma.promoter.updateMany({
        where: { id, tenantId },
        data: {
          name,
          code,
          status: status !== undefined ? status : undefined,
        },
      });
      return res.json({ success: true, promoter });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar promotora.' });
    }
  });

  app.delete('/api/promoters/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      await prisma.promoter.deleteMany({
        where: { id, tenantId },
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao deletar promotora.' });
    }
  });

  // -------------------------------------------------------------
  // BANKS (POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.post('/api/banks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id, name, code, color, status } = req.body;
      if (!name || !code) return res.status(400).json({ error: 'Nome e Código são obrigatórios.' });
      const bank = await prisma.bank.create({
        data: {
          id: id || undefined,
          tenantId,
          name,
          code,
          color: color || '#1e3a8a',
          status: status || 'ATIVO',
        },
      });
      return res.json(bank);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar banco.' });
    }
  });

  app.put('/api/banks/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      const { name, code, color, status } = req.body;
      const bank = await prisma.bank.updateMany({
        where: { id, tenantId },
        data: {
          name,
          code,
          color: color !== undefined ? color : undefined,
          status: status !== undefined ? status : undefined,
        },
      });
      return res.json({ success: true, bank });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar banco.' });
    }
  });

  app.delete('/api/banks/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      await prisma.bank.deleteMany({
        where: { id, tenantId },
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao deletar banco.' });
    }
  });

  // -------------------------------------------------------------
  // BANK PROMOTERS LINKS API
  // -------------------------------------------------------------
  app.get('/api/bank-promoters', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const links = await prisma.bankPromoter.findMany({
        where: { tenantId },
        include: { bank: true, promoter: true },
      });
      return res.json(links);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar conexões de bancos e promotoras.' });
    }
  });

  app.post('/api/bank-promoters', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { bankId, promoterId, login, status } = req.body;
      if (!bankId || !promoterId) {
        return res.status(400).json({ error: 'BankId e PromoterId são obrigatórios.' });
      }
      const actualLogin = login || 'DEFAULT';

      // Check tenant isolation of sub-records
      const bank = await prisma.bank.findFirst({ where: { id: bankId, tenantId } });
      const promoter = await prisma.promoter.findFirst({ where: { id: promoterId, tenantId } });
      if (!bank || !promoter) {
        return res.status(400).json({ error: 'Banco ou Promotora inválida ou pertence a outro tenant.' });
      }

      // Check if already exists
      const existing = await prisma.bankPromoter.findFirst({
        where: { tenantId, bankId, promoterId, login: actualLogin }
      });

      if (existing) {
        const updated = await prisma.bankPromoter.update({
          where: { id: existing.id },
          data: { status: status || 'ATIVO' }
        });
        return res.json(updated);
      }

      const link = await prisma.bankPromoter.create({
        data: {
          tenantId,
          bankId,
          promoterId,
          login: actualLogin,
          status: status || 'ATIVO',
        },
      });
      return res.json(link);
    } catch (err) {
      console.error('[POST /api/bank-promoters]', err);
      return res.status(500).json({ error: 'Erro ao vincular banco e promotora.' });
    }
  });

  app.delete('/api/bank-promoters/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      await prisma.bankPromoter.deleteMany({
        where: { id, tenantId },
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao deletar vínculo.' });
    }
  });

  // -------------------------------------------------------------
  // PRODUCTS (POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.post('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id, name, code, type, active } = req.body;
      if (!name || !code) return res.status(400).json({ error: 'Nome e Código são obrigatórios.' });
      const product = await prisma.product.create({
        data: {
          id: id || undefined,
          tenantId,
          name,
          code,
          type: type || 'NOVO',
          active: active !== undefined ? Boolean(active) : true,
        },
      });
      return res.json(product);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar produto.' });
    }
  });

  app.put('/api/products/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      const { name, code, type, active } = req.body;
      const product = await prisma.product.updateMany({
        where: { id, tenantId },
        data: {
          name,
          code,
          type: type !== undefined ? type : undefined,
          active: active !== undefined ? Boolean(active) : undefined,
        },
      });
      return res.json({ success: true, product });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar produto.' });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      await prisma.product.deleteMany({
        where: { id, tenantId },
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao deletar produto.' });
    }
  });

  // -------------------------------------------------------------
  // WHITE LABEL API
  // -------------------------------------------------------------
  app.get('/api/whitelabel', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const config = await prisma.whiteLabelConfig.findUnique({
        where: { tenantId },
      });
      return res.json(config);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar White Label.' });
    }
  });

  app.put('/api/whitelabel', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      
      // RBAC Check: Only TENANT_ADMIN or higher
      if (session.user.role !== 'TENANT_ADMIN' && session.user.role !== 'MASTER' && session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Permissão negada para alterar White Label.' });
      }

      const { companyName, legalName, logoUrl, faviconUrl, primaryColor, secondaryColor, accentColor, supportEmail, supportPhone, footerText, themeMode } = req.body;
      if (!companyName) return res.status(400).json({ error: 'Nome da Empresa é obrigatório.' });

      const config = await prisma.whiteLabelConfig.upsert({
        where: { tenantId },
        update: {
          companyName,
          legalName: legalName !== undefined ? legalName : undefined,
          logoUrl: logoUrl !== undefined ? logoUrl : undefined,
          faviconUrl: faviconUrl !== undefined ? faviconUrl : undefined,
          primaryColor: primaryColor || '#2563eb',
          secondaryColor: secondaryColor || '#1e40af',
          accentColor: accentColor || '#3b82f6',
          supportEmail: supportEmail !== undefined ? supportEmail : undefined,
          supportPhone: supportPhone !== undefined ? supportPhone : undefined,
          footerText: footerText !== undefined ? footerText : undefined,
          themeMode: themeMode || 'LIGHT',
        },
        create: {
          tenantId,
          companyName,
          legalName: legalName || null,
          logoUrl: logoUrl || null,
          faviconUrl: faviconUrl || null,
          primaryColor: primaryColor || '#2563eb',
          secondaryColor: secondaryColor || '#1e40af',
          accentColor: accentColor || '#3b82f6',
          supportEmail: supportEmail || null,
          supportPhone: supportPhone || null,
          footerText: footerText || `© ${new Date().getFullYear()} ${companyName}`,
          themeMode: themeMode || 'LIGHT',
        },
      });

      // Invalidate domain resolution cache for this tenant
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant) {
        if (tenant.customDomain) TenantResolver.invalidateCache(tenant.customDomain);
        TenantResolver.invalidateCache(tenant.slug + '.sentinelconsig.com.br');
      }

      return res.json(config);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao salvar White Label.' });
    }
  });

  // -------------------------------------------------------------
  // AUDIT LOGS API (Read-only, Tenant-scoped, Server-side Paginated)
  // -------------------------------------------------------------
  app.get('/api/audit-logs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];

      // RBAC check: GESTOR, MASTER, TENANT_ADMIN or users with audit permissions
      const allowedRoles = ['GESTOR', 'MASTER', 'TENANT_ADMIN', 'PLATFORM_MASTER'];
      const hasDirectRole = allowedRoles.includes(userRole);
      const hasExplicitPerm = hasPermission(userRole, userCustomPerms, 'users.view') || hasPermission(userRole, userCustomPerms, 'audit_logs.view');

      if (!hasDirectRole && !hasExplicitPerm) {
        return res.status(403).json({ error: 'Acesso negado aos logs de auditoria.' });
      }

      // Tenant isolation:
      // PLATFORM_MASTER can view global or filter by requested tenantId.
      // All other roles are strictly locked to session.effectiveTenantId (or session.user.tenantId).
      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const requestedTenantId = req.query.tenantId as string | undefined;

      let targetTenantId: string | undefined | null = effectiveTenantId;
      if (isPlatformMaster) {
        targetTenantId = requestedTenantId !== undefined ? requestedTenantId : undefined;
      } else {
        if (!effectiveTenantId) {
          return res.status(403).json({ error: 'Tenant ativo não identificado.' });
        }
        targetTenantId = effectiveTenantId;
      }

      // Query params for filtering & pagination
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
      const skip = (page - 1) * limit;

      const {
        action,
        entity,
        entityId,
        userId,
        search,
        startDate,
        endDate,
      } = req.query as Record<string, string | undefined>;

      const where: Prisma.AuditLogWhereInput = {};

      if (targetTenantId) {
        where.tenantId = targetTenantId;
      }

      if (action && action.trim() !== '' && action !== 'ALL') {
        where.action = action.trim();
      }

      if (entity && entity.trim() !== '' && entity !== 'ALL') {
        where.entity = entity.trim();
      }

      if (entityId && entityId.trim() !== '') {
        where.entityId = { contains: entityId.trim(), mode: 'insensitive' };
      }

      if (userId && userId.trim() !== '') {
        where.userId = userId.trim();
      }

      // Date range filtering
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          const parsedStart = new Date(startDate);
          if (!isNaN(parsedStart.getTime())) {
            where.createdAt.gte = parsedStart;
          }
        }
        if (endDate) {
          const parsedEnd = new Date(endDate);
          if (!isNaN(parsedEnd.getTime())) {
            // Include until end of day if single date provided
            if (endDate.length === 10) {
              parsedEnd.setHours(23, 59, 59, 999);
            }
            where.createdAt.lte = parsedEnd;
          }
        }
      }

      // Search term
      if (search && search.trim() !== '') {
        const term = search.trim();
        where.OR = [
          { action: { contains: term, mode: 'insensitive' } },
          { entity: { contains: term, mode: 'insensitive' } },
          { entityId: { contains: term, mode: 'insensitive' } },
          { userName: { contains: term, mode: 'insensitive' } },
        ];
      }

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      return res.json({
        data: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      });
    } catch (err) {
      logger.error({ error: err }, '[GET /api/audit-logs ERROR]');
      return res.status(500).json({ error: 'Erro ao buscar logs de auditoria no PostgreSQL.' });
    }
  });

  // -------------------------------------------------------------
  // AUDIT LOG INTEGRITY VERIFICATION & DLQ API (FASE 10.2-B)
  // -------------------------------------------------------------
  app.get('/api/audit-logs/verify-integrity', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'audit_logs.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'audit_logs.view'." });
      }

      let targetTenantId: string | null = session.user.tenantId || null;
      if (isPlatformMaster && typeof req.query.tenantId === 'string') {
        targetTenantId = req.query.tenantId === 'GLOBAL' || req.query.tenantId === '' ? null : req.query.tenantId;
      }

      const result = await AuditLogService.verifyAuditLogIntegrity(prisma, targetTenantId);
      return res.json(result);
    } catch (err) {
      logger.error({ error: err }, '[GET /api/audit-logs/verify-integrity ERROR]');
      return res.status(500).json({ error: 'Erro ao verificar integridade da trilha de auditoria.' });
    }
  });

  app.get('/api/audit-logs/failed-queue', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito ao PLATFORM_MASTER.' });
      }

      const failedQueue = AuditLogService.getFailedQueue();
      return res.json({
        count: failedQueue.length,
        items: failedQueue,
      });
    } catch (err) {
      logger.error({ error: err }, '[GET /api/audit-logs/failed-queue ERROR]');
      return res.status(500).json({ error: 'Erro ao consultar fila de falhas de auditoria.' });
    }
  });

  // -------------------------------------------------------------
  // USERS MANAGEMENT API
  // -------------------------------------------------------------
  app.get('/api/users', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'users.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'users.view'." });
      }

      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const whereCondition = isPlatformMaster && !session.adminContext
        ? { deletedAt: null }
        : { tenantId: tenantId || undefined, deletedAt: null };

      const users = await prisma.user.findMany({
        where: whereCondition,
        orderBy: { name: 'asc' },
      });

      const cleanUsers = users.map(u => {
        const { passwordHash, ...rest } = u;
        return rest;
      });

      return res.json(cleanUsers);
    } catch (err) {
      console.error('[GET /api/users ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'users.create')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'users.create'." });
      }

      const { id, name, email, password, role, customPermissions, tenantId, phone } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, E-mail e Senha são obrigatórios.' });
      }

      if (role === 'PLATFORM_MASTER' && !isPlatformMaster) {
        return res.status(403).json({ error: 'Apenas um PLATFORM_MASTER pode atribuir o perfil PLATFORM_MASTER.' });
      }

      const targetTenantId = isPlatformMaster && !session.adminContext && tenantId ? tenantId : (session.effectiveTenantId || session.user.tenantId);

      const existing = await prisma.user.findUnique({
        where: { email: String(email).trim().toLowerCase() },
      });
      if (existing) {
        return res.status(400).json({ error: 'E-mail já está em uso.' });
      }

      const cleanPermissions = Array.isArray(customPermissions) ? customPermissions : [];

      const user = await prisma.user.create({
        data: {
          id: id || undefined,
          tenantId: targetTenantId || null,
          name: String(name).trim(),
          email: String(email).trim().toLowerCase(),
          passwordHash: await hashPassword(String(password).trim()),
          role: role || 'DIGITADOR',
          customPermissions: cleanPermissions,
          phone: phone || null,
          active: true,
        },
      });

      await AuditLogService.record(prisma, {
        tenantId: targetTenantId || null,
        userId: session.user.id,
        userName: session.user.name,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: user.id,
        newData: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          customPermissions: user.customPermissions,
        },
        req,
      });

      if (user.tenantId) {
        sseRegistry.broadcastToTenant(user.tenantId, {
          type: 'USER_CREATED',
          entity: 'User',
          entityId: user.id,
          userId: session.user.id,
        });
      }

      const { passwordHash, ...safeCreatedUser } = user;
      return res.json(safeCreatedUser);
    } catch (err) {
      console.error('[POST /api/users ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const { id } = req.params;
      const { name, active, role, customPermissions, tenantId, phone, password } = req.body;

      const isSelf = id === session.user.id;
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];

      const canUpdateUsers = isPlatformMaster || hasPermission(userRole, userCustomPerms, 'users.update');

      if (!isSelf && !canUpdateUsers) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'users.update'." });
      }

      if (!canUpdateUsers) {
        if (role !== undefined || customPermissions !== undefined || tenantId !== undefined || active !== undefined) {
          return res.status(403).json({ error: "Acesso negado. Alteração de role, permissões ou status requer permissão 'users.update'." });
        }
      }

      const targetUser = await prisma.user.findFirst({ where: { id } });
      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      if (!isPlatformMaster && targetUser.tenantId !== session.user.tenantId) {
        return res.status(403).json({ error: 'Acesso negado a usuário de outro tenant.' });
      }

      if (role === 'PLATFORM_MASTER' && !isPlatformMaster) {
        return res.status(403).json({ error: 'Apenas um PLATFORM_MASTER pode atribuir o perfil PLATFORM_MASTER.' });
      }

      if (targetUser.role === 'PLATFORM_MASTER') {
        const isDemoting = role !== undefined && role !== 'PLATFORM_MASTER';
        const isDeactivating = active === false;

        if (isDemoting || isDeactivating) {
          const remainingMasters = await prisma.user.count({
            where: {
              role: 'PLATFORM_MASTER',
              active: true,
              deletedAt: null,
              id: { not: targetUser.id },
            },
          });

          if (remainingMasters < 1) {
            return res.status(403).json({
              error: 'Operação bloqueada: Não é possível remover, rebaixar ou desativar o último PLATFORM_MASTER ativo da plataforma.',
            });
          }
        }
      }

      const auditActions: { action: string; details: any }[] = [];
      if (role !== undefined && role !== targetUser.role) {
        auditActions.push({ action: 'ROLE_CHANGED', details: { oldRole: targetUser.role, newRole: role } });
      }
      if (Array.isArray(customPermissions) && JSON.stringify(customPermissions) !== JSON.stringify(targetUser.customPermissions)) {
        auditActions.push({ action: 'PERMISSIONS_CHANGED', details: { oldPermissions: targetUser.customPermissions, newPermissions: customPermissions } });
      }
      if (tenantId !== undefined && tenantId !== targetUser.tenantId && isPlatformMaster) {
        auditActions.push({ action: 'TENANT_CHANGED', details: { oldTenantId: targetUser.tenantId, newTenantId: tenantId } });
      }
      if (active === false && targetUser.active === true) {
        auditActions.push({ action: 'USER_SUSPENDED', details: { email: targetUser.email } });
      } else if (active === true && targetUser.active === false) {
        auditActions.push({ action: 'USER_REACTIVATED', details: { email: targetUser.email } });
      }

      const finalTenantId = isPlatformMaster && tenantId !== undefined ? tenantId : undefined;
      const hashedPassword = password ? await hashPassword(String(password).trim()) : undefined;

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          name: name || undefined,
          active: active !== undefined ? Boolean(active) : undefined,
          role: role || undefined,
          customPermissions: Array.isArray(customPermissions) ? customPermissions : undefined,
          tenantId: finalTenantId,
          phone: phone !== undefined ? phone : undefined,
          passwordHash: hashedPassword,
        },
      });

      for (const item of auditActions) {
        await AuditLogService.record(prisma, {
          tenantId: updatedUser.tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: item.action,
          entity: 'User',
          entityId: id,
          oldData: {
            role: targetUser.role,
            customPermissions: targetUser.customPermissions,
            active: targetUser.active,
            tenantId: targetUser.tenantId,
          },
          newData: item.details,
          req,
        });
      }

      // Emissão pós-commit de USER_UPDATED para o tenant
      if (updatedUser.tenantId) {
        sseRegistry.broadcastToTenant(updatedUser.tenantId, {
          type: 'USER_UPDATED',
          entity: 'User',
          entityId: updatedUser.id,
          userId: session.user.id,
        });
      }

      const { passwordHash, ...safeUser } = updatedUser;
      return res.json({ success: true, user: safeUser });
    } catch (err) {
      console.error('[PUT /api/users/:id ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'users.delete')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'users.delete'." });
      }

      const { id } = req.params;

      if (id === session.user.id) {
        return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário ativo.' });
      }

      const targetUser = await prisma.user.findFirst({ where: { id } });
      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      if (!isPlatformMaster && targetUser.tenantId !== session.user.tenantId) {
        return res.status(403).json({ error: 'Acesso negado a usuário de outro tenant.' });
      }

      if (targetUser.role === 'PLATFORM_MASTER') {
        const remainingMasters = await prisma.user.count({
          where: {
            role: 'PLATFORM_MASTER',
            active: true,
            deletedAt: null,
            id: { not: targetUser.id },
          },
        });

        if (remainingMasters < 1) {
          return res.status(403).json({
            error: 'Operação bloqueada: Não é possível excluir o último PLATFORM_MASTER ativo da plataforma.',
          });
        }
      }

      await prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), active: false },
      });

      await AuditLogService.record(prisma, {
        tenantId: targetUser.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'USER_DELETED',
        entity: 'User',
        entityId: id,
        oldData: { email: targetUser.email, name: targetUser.name, role: targetUser.role },
        req,
      });

      if (targetUser.tenantId) {
        sseRegistry.broadcastToTenant(targetUser.tenantId, {
          type: 'USER_DELETED',
          entity: 'User',
          entityId: id,
          userId: session.user.id,
        });
      }

      return res.json({ success: true, message: 'Usuário excluído com sucesso.' });
    } catch (err) {
      console.error('[DELETE /api/users/:id ERROR]', err);
      return res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
  });

  // -------------------------------------------------------------
  // SAAS & TENANTS MANAGEMENT API (PLATFORM MASTER ONLY)
  // -------------------------------------------------------------

  // 0. GET /api/saas/metrics & GET /api/admin/metrics (PostgreSQL Aggregations)
  const getSaasMetricsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        cancelledTenants,
        trialTenants,
        totalUsers,
        activeUsers,
        totalProposals,
        storageAggregate,
        planGroups,
      ] = await Promise.all([
        prisma.tenant.count({ where: { deletedAt: null } }),
        prisma.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
        prisma.tenant.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
        prisma.tenant.count({ where: { deletedAt: null, status: 'CANCELLED' } }),
        prisma.tenant.count({ where: { deletedAt: null, status: 'TRIAL' } }),
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null, active: true } }),
        prisma.proposal.count({ where: { deletedAt: null } }),
        prisma.tenant.aggregate({
          where: { deletedAt: null },
          _sum: { storageLimitMb: true },
        }),
        prisma.tenant.groupBy({
          by: ['plan'],
          where: { deletedAt: null },
          _count: { id: true },
        }),
      ]);

      const planDistribution: Record<string, number> = {
        STARTER: 0,
        PRO: 0,
        ENTERPRISE: 0,
        CUSTOM: 0,
      };

      planGroups.forEach((g) => {
        if (g.plan) {
          planDistribution[g.plan] = g._count.id;
        }
      });

      return res.json({
        totalTenants,
        activeTenants,
        suspendedTenants,
        cancelledTenants,
        trialTenants,
        totalUsers,
        activeUsers,
        totalProposals,
        storageLimitMb: storageAggregate._sum.storageLimitMb || 0,
        storageUsedMb: 'N/D',
        planDistribution,
      });
    } catch (err) {
      console.error('[GET /api/saas/metrics ERROR]', err);
      return res.status(500).json({ error: 'Erro ao calcular métricas do SaaS.' });
    }
  };
  app.get('/api/saas/metrics', getSaasMetricsHandler);
  app.get('/api/admin/metrics', getSaasMetricsHandler);

  // 1. GET /api/saas/tenants (and aliases /api/admin/tenants, /api/tenants)
  const getTenantsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const pageParam = req.query.page ? parseInt(req.query.page as string, 10) : null;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const search = (req.query.search as string || '').trim();
      const statusFilter = req.query.status as string;
      const planFilter = req.query.plan as string;

      const whereClause: any = { deletedAt: null };

      if (statusFilter && statusFilter !== 'ALL') {
        whereClause.status = statusFilter;
      }
      if (planFilter && planFilter !== 'ALL') {
        whereClause.plan = planFilter;
      }

      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
          { customDomain: { contains: search, mode: 'insensitive' } },
          { cnpj: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (pageParam && !isNaN(pageParam)) {
        const page = Math.max(1, pageParam);
        const limit = Math.max(1, Math.min(100, limitParam));
        const skip = (page - 1) * limit;

        const [tenants, total] = await Promise.all([
          prisma.tenant.findMany({
            where: whereClause,
            include: {
              whiteLabel: true,
              users: {
                where: {
                  role: 'MASTER',
                  active: true,
                  deletedAt: null
                },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  active: true
                }
              },
              _count: {
                select: {
                  users: { where: { deletedAt: null } },
                  proposals: { where: { deletedAt: null } },
                  clients: { where: { deletedAt: null } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.tenant.count({ where: whereClause }),
        ]);

        return res.json({
          tenants,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        });
      }

      const tenants = await prisma.tenant.findMany({
        where: whereClause,
        include: {
          whiteLabel: true,
          users: {
            where: {
              role: 'MASTER',
              active: true,
              deletedAt: null
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true
            }
          },
          _count: {
            select: {
              users: { where: { deletedAt: null } },
              proposals: { where: { deletedAt: null } },
              clients: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(tenants);
    } catch (err) {
      console.error('[GET /api/saas/tenants ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar tenants.' });
    }
  };
  app.get('/api/saas/tenants', getTenantsHandler);
  app.get('/api/admin/tenants', getTenantsHandler);
  app.get('/api/tenants', getTenantsHandler);

  // 2. GET /api/saas/tenants/:id (and aliases /api/admin/tenants/:id, /api/tenants/:id)
  const getTenantByIdHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { id } = req.params;
      const tenant = await prisma.tenant.findUnique({
        where: { id },
        include: {
          whiteLabel: true,
          users: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
          _count: {
            select: {
              users: { where: { deletedAt: null } },
              proposals: { where: { deletedAt: null } },
              clients: { where: { deletedAt: null } },
              documents: true,
              tasks: true,
            },
          },
        },
      });

      if (!tenant || tenant.deletedAt) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const lastAudit = await prisma.auditLog.findFirst({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, action: true, userName: true },
      });

      return res.json({
        ...tenant,
        lastActivityAt: lastAudit?.createdAt || tenant.updatedAt,
        lastActivityDescription: lastAudit ? `${lastAudit.action} por ${lastAudit.userName}` : null,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao obter detalhes do tenant.' });
    }
  };
  app.get('/api/saas/tenants/:id', getTenantByIdHandler);
  app.get('/api/admin/tenants/:id', getTenantByIdHandler);
  app.get('/api/tenants/:id', getTenantByIdHandler);

  // 2.3. GET /api/saas/tenants/:id/usage
  const getTenantUsageHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';

      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Permissão insuficiente.' });
      }

      const { id } = req.params;
      if (!isPlatformMaster && id !== session.effectiveTenantId) {
        return res.status(403).json({ error: 'Acesso negado para outro tenant.' });
      }

      const tenantExists = await prisma.tenant.findUnique({ where: { id } });
      if (!tenantExists) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const usage = await SaasUsageService.getTenantUsage(prisma, id);
      return res.json(usage);
    } catch (err: any) {
      console.error('[GET /api/saas/tenants/:id/usage ERROR]', err);
      return res.status(500).json({ error: 'Erro ao obter consumo do tenant.' });
    }
  };
  app.get('/api/saas/tenants/:id/usage', getTenantUsageHandler);

  // 2.4. GET /api/saas/tenants/:id/limits
  const getTenantLimitsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';

      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Permissão insuficiente.' });
      }

      const { id } = req.params;
      if (!isPlatformMaster && id !== session.effectiveTenantId) {
        return res.status(403).json({ error: 'Acesso negado para outro tenant.' });
      }

      const tenantExists = await prisma.tenant.findUnique({ where: { id } });
      if (!tenantExists) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const limits = await SaasLimitsService.getTenantLimits(prisma, id);
      return res.json(limits);
    } catch (err: any) {
      console.error('[GET /api/saas/tenants/:id/limits ERROR]', err);
      return res.status(500).json({ error: 'Erro ao obter limites do tenant.' });
    }
  };
  app.get('/api/saas/tenants/:id/limits', getTenantLimitsHandler);

  // 2.5. GET /api/saas/tenants/:id/health
  const getTenantHealthHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';

      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Permissão insuficiente.' });
      }

      const { id } = req.params;
      if (!isPlatformMaster && id !== session.effectiveTenantId) {
        return res.status(403).json({ error: 'Acesso negado para outro tenant.' });
      }

      const tenantExists = await prisma.tenant.findUnique({ where: { id } });
      if (!tenantExists) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const health = await TenantHealthService.getTenantHealth(prisma, id);
      return res.json(health);
    } catch (err: any) {
      console.error('[GET /api/saas/tenants/:id/health ERROR]', err);
      return res.status(500).json({ error: 'Erro ao obter saúde do tenant.' });
    }
  };
  app.get('/api/saas/tenants/:id/health', getTenantHealthHandler);

  // 2.6. GET /api/saas/usage/overview (Only PLATFORM_MASTER)
  const getUsageOverviewHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      // Group users by tenantId (excluding deleted)
      const userGroups = await prisma.user.groupBy({
        by: ['tenantId'],
        where: { deletedAt: null, active: true },
        _count: true
      });

      // Group proposals by tenantId (excluding deleted)
      const proposalGroups = await prisma.proposal.groupBy({
        by: ['tenantId'],
        where: { deletedAt: null },
        _count: true
      });

      // Group documents by tenantId
      const documentGroups = await prisma.clientDocument.groupBy({
        by: ['tenantId'],
        _sum: { fileSizeBytes: true }
      });

      // Group recent proposals by tenantId (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentProposalGroups = await prisma.proposal.groupBy({
        by: ['tenantId'],
        where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
        _count: true
      });

      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' }
      });

      const activeUsersMap = new Map(userGroups.map(g => [g.tenantId, g._count]));
      const proposalsCountMap = new Map(proposalGroups.map(g => [g.tenantId, g._count]));
      const storageSumMap = new Map(documentGroups.map(g => [g.tenantId, g._sum.fileSizeBytes || 0]));
      const recentProposalsMap = new Map(recentProposalGroups.map(g => [g.tenantId, g._count]));

      const overview = tenants.map(t => {
        const activeUsers = activeUsersMap.get(t.id) || 0;
        const totalProposals = proposalsCountMap.get(t.id) || 0;
        const storageUsedBytes = storageSumMap.get(t.id) || 0;
        const storageUsedMb = Number((storageUsedBytes / (1024 * 1024)).toFixed(2));
        const recentProposals30d = recentProposalsMap.get(t.id) || 0;

        // Calc percents
        const uPercent = t.maxUsers > 0 ? Number(((activeUsers / t.maxUsers) * 100).toFixed(2)) : 0;
        const pPercent = t.maxProposals > 0 ? Number(((totalProposals / t.maxProposals) * 100).toFixed(2)) : 0;
        const sPercent = t.storageLimitMb > 0 ? Number(((storageUsedMb / t.storageLimitMb) * 100).toFixed(2)) : 0;

        // Sync calculation of health score
        let usersScore = 100;
        if (uPercent > 100) usersScore = 0;
        else if (uPercent >= 95) usersScore = 20;
        else if (uPercent >= 85) usersScore = 50;
        else if (uPercent >= 70) usersScore = 80;

        let storageScore = 100;
        if (sPercent > 100) storageScore = 0;
        else if (sPercent >= 95) storageScore = 20;
        else if (sPercent >= 85) storageScore = 50;
        else if (sPercent >= 70) storageScore = 80;

        let activityScore = 100;
        if (recentProposals30d >= 10) activityScore = 100;
        else if (recentProposals30d >= 5) activityScore = 80;
        else if (recentProposals30d >= 1) activityScore = 50;
        else if (totalProposals > 0) activityScore = 20;
        else activityScore = 10;

        const weightedScoreSum = (usersScore * 30) + (storageScore * 30) + (activityScore * 20);
        const healthScore = Math.max(0, Math.min(100, Math.round(weightedScoreSum / 80)));

        let healthStatus = 'CRITICAL';
        if (healthScore >= 90) healthStatus = 'EXCELLENT';
        else if (healthScore >= 75) healthStatus = 'GOOD';
        else if (healthScore >= 60) healthStatus = 'ATTENTION';
        else if (healthScore >= 40) healthStatus = 'RISK';

        // Categorize usage statuses
        let usersStatus = 'NORMAL';
        if (uPercent > 100) usersStatus = 'EXCEEDED';
        else if (uPercent >= 95) usersStatus = 'CRITICAL';
        else if (uPercent >= 85) usersStatus = 'ALERT';
        else if (uPercent >= 70) usersStatus = 'WARNING';

        let proposalsStatus = 'NORMAL';
        if (pPercent > 100) proposalsStatus = 'EXCEEDED';
        else if (pPercent >= 95) proposalsStatus = 'CRITICAL';
        else if (pPercent >= 85) proposalsStatus = 'ALERT';
        else if (pPercent >= 70) proposalsStatus = 'WARNING';

        let storageStatus = 'NORMAL';
        if (sPercent > 100) storageStatus = 'EXCEEDED';
        else if (sPercent >= 95) storageStatus = 'CRITICAL';
        else if (sPercent >= 85) storageStatus = 'ALERT';
        else if (sPercent >= 70) storageStatus = 'WARNING';

        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          status: t.status,
          users: {
            active: activeUsers,
            limit: t.maxUsers,
            percent: uPercent,
            status: usersStatus
          },
          proposals: {
            total: totalProposals,
            limit: t.maxProposals,
            percent: pPercent,
            status: proposalsStatus
          },
          storage: {
            usedMb: storageUsedMb,
            limitMb: t.storageLimitMb,
            percent: sPercent,
            status: storageStatus
          },
          healthScore,
          healthStatus
        };
      });

      return res.json(overview);
    } catch (err: any) {
      console.error('[GET /api/saas/usage/overview ERROR]', err);
      return res.status(500).json({ error: 'Erro ao gerar overview consolidado.' });
    }
  };
  app.get('/api/saas/usage/overview', getUsageOverviewHandler);

  // 3. POST /api/saas/tenants (and aliases /api/admin/tenants, /api/tenants)
  const createTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const {
        name,
        slug: rawSlug,
        customDomain: rawCustomDomain,
        cnpj,
        razaoSocial,
        tradeName,
        plan,
        maxUsers,
        storageLimitMb,
        maxProposals,
        enabledModules,
        adminEmail,
        adminName,
      } = req.body || {};

      if (!name || !rawSlug) {
        return res.status(400).json({ error: 'Nome e Slug são obrigatórios.' });
      }

      // Normalização estrita
      let slug: string;
      try {
        slug = TenantNormalization.normalizeSlug(rawSlug);
      } catch (normErr: any) {
        return res.status(400).json({ error: normErr.message });
      }

      let customDomain: string | null = null;
      if (rawCustomDomain) {
        try {
          customDomain = TenantNormalization.normalizeCustomDomain(rawCustomDomain);
        } catch (domErr: any) {
          return res.status(400).json({ error: domErr.message });
        }
      }

      const VALID_PLANS = ['STARTER', 'PRO', 'ENTERPRISE', 'CUSTOM'];
      if (plan && !VALID_PLANS.includes(plan)) {
        return res.status(400).json({ error: `Plano inválido '${plan}'. Planos válidos: ${VALID_PLANS.join(', ')}.` });
      }

      const cleanUsersLimit = Number(maxUsers);
      const cleanStorageLimit = Number(storageLimitMb);
      const cleanProposalsLimit = Number(maxProposals);

      if (maxUsers !== undefined && (isNaN(cleanUsersLimit) || cleanUsersLimit < 1 || cleanUsersLimit > 100000)) {
        return res.status(400).json({ error: 'maxUsers deve ser um número entre 1 e 100.000.' });
      }
      if (storageLimitMb !== undefined && (isNaN(cleanStorageLimit) || cleanStorageLimit < 100 || cleanStorageLimit > 10000000)) {
        return res.status(400).json({ error: 'storageLimitMb deve ser um número entre 100 e 10.000.000.' });
      }
      if (maxProposals !== undefined && (isNaN(cleanProposalsLimit) || cleanProposalsLimit < 100 || cleanProposalsLimit > 10000000)) {
        return res.status(400).json({ error: 'maxProposals deve ser um número entre 100 e 10.000.000.' });
      }

      const cleanCnpj = cnpj ? String(cnpj).replace(/\D/g, '') : null;

      // Validação de duplicidade
      const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
      if (existingSlug) {
        return res.status(400).json({ error: `O slug '${slug}' já está em uso por outro tenant.` });
      }

      if (customDomain) {
        const existingDomain = await prisma.tenant.findUnique({ where: { customDomain } });
        if (existingDomain) {
          return res.status(400).json({ error: `O domínio personalizado '${customDomain}' já está em uso.` });
        }
      }

      if (cleanCnpj) {
        const existingCnpj = await prisma.tenant.findUnique({ where: { cnpj: cleanCnpj } });
        if (existingCnpj) {
          return res.status(400).json({ error: `O CNPJ '${cleanCnpj}' já está cadastrado.` });
        }
      }

      const defaultModules = [
        'PROPOSALS',
        'SIMULATION',
        'KANBAN',
        'CRM',
        'FINANCIAL',
        'RADAR',
        'TV_MONITOR',
        'BI',
        'SENTINELA_AI',
        'DOCUMENTS',
        'PORTABILITY',
      ];

      const initialModules = Array.isArray(enabledModules) ? enabledModules : defaultModules;

      // Criação transacional do Tenant + WhiteLabel padrão
      const tenant = await prisma.$transaction(async (tx) => {
        const newTenant = await tx.tenant.create({
          data: {
            name: String(name).trim(),
            slug,
            customDomain,
            cnpj: cleanCnpj,
            tradeName: tradeName ? String(tradeName).trim() : String(name).trim(),
            plan: plan || 'PRO',
            status: 'ACTIVE',
            maxUsers: !isNaN(cleanUsersLimit) && cleanUsersLimit > 0 ? cleanUsersLimit : 10,
            storageLimitMb: !isNaN(cleanStorageLimit) && cleanStorageLimit >= 100 ? cleanStorageLimit : 5000,
            maxProposals: !isNaN(cleanProposalsLimit) && cleanProposalsLimit >= 100 ? cleanProposalsLimit : 10000,
            enabledModules: initialModules,
          },
        });

        // Configuração WhiteLabel padrão vinculada
        await tx.whiteLabelConfig.create({
          data: {
            tenantId: newTenant.id,
            companyName: String(name).trim(),
            legalName: razaoSocial ? String(razaoSocial).trim() : null,
            primaryColor: '#2563eb',
            secondaryColor: '#1e40af',
            accentColor: '#3b82f6',
            footerText: `© ${new Date().getFullYear()} ${String(name).trim()}`,
            supportEmail: adminEmail ? String(adminEmail).trim().toLowerCase() : null,
          },
        });

        // Se fornecido e-mail do admin do tenant, cria o usuário MASTER inicial
        if (adminEmail && adminName) {
          const cleanAdminEmail = String(adminEmail).trim().toLowerCase();
          const existingUser = await tx.user.findUnique({ where: { email: cleanAdminEmail } });
          if (!existingUser) {
            const initialHashedPassword = await hashPassword('Mudar@123');
            await tx.user.create({
              data: {
                tenantId: newTenant.id,
                name: String(adminName).trim(),
                email: cleanAdminEmail,
                passwordHash: initialHashedPassword,
                role: 'MASTER',
                active: true,
                mustChangePassword: true,
              },
            });
          }
        }

        return newTenant;
      });

      // Invalidação de cache de resolução de domínios
      TenantResolver.invalidateCache(slug + '.sentinelconsig.com.br');
      if (customDomain) {
        TenantResolver.invalidateCache(customDomain);
      }

      // Registro de Auditoria
      await AuditLogService.record(prisma, {
        tenantId: tenant.id,
        userId: session.user.id,
        userName: session.user.name,
        action: 'tenant.created',
        entity: 'Tenant',
        entityId: tenant.id,
        newData: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          customDomain: tenant.customDomain,
          plan: tenant.plan,
          maxUsers: tenant.maxUsers,
          storageLimitMb: tenant.storageLimitMb,
          maxProposals: tenant.maxProposals,
          enabledModules: tenant.enabledModules,
        },
        req,
      });

      // Emissão de evento thin via Pusher para o tenant
      eventBus.publishToTenant(tenant.id, {
        type: 'TENANT_CREATED',
        entity: 'tenant',
        entityId: tenant.id,
      }).catch(() => {});

      return res.status(201).json(tenant);
    } catch (err: any) {
      console.error('[POST /api/saas/tenants ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao criar tenant.' });
    }
  };
  app.post('/api/saas/tenants', createTenantHandler);
  app.post('/api/admin/tenants', createTenantHandler);
  app.post('/api/tenants', createTenantHandler);

  // 4. PUT /api/saas/tenants/:id (and aliases /api/admin/tenants/:id, /api/tenants/:id)
  const updateTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { id } = req.params;
      const {
        name,
        slug: rawSlug,
        customDomain: rawCustomDomain,
        cnpj,
        tradeName,
        plan,
        status,
        maxUsers,
        storageLimitMb,
        maxProposals,
        enabledModules,
        whiteLabel,
      } = req.body || {};

      const currentTenant = await prisma.tenant.findUnique({ where: { id } });
      if (!currentTenant) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      let slug: string | undefined = undefined;
      if (rawSlug) {
        try {
          slug = TenantNormalization.normalizeSlug(rawSlug);
          if (slug !== currentTenant.slug) {
            const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
            if (existingSlug && existingSlug.id !== id) {
              return res.status(400).json({ error: `O slug '${slug}' já pertence a outro tenant.` });
            }
          }
        } catch (normErr: any) {
          return res.status(400).json({ error: normErr.message });
        }
      }

      let customDomain: string | null | undefined = undefined;
      if (rawCustomDomain !== undefined) {
        if (rawCustomDomain === null || rawCustomDomain === '') {
          customDomain = null;
        } else {
          try {
            customDomain = TenantNormalization.normalizeCustomDomain(rawCustomDomain);
            if (customDomain && customDomain !== currentTenant.customDomain) {
              const existingDom = await prisma.tenant.findUnique({ where: { customDomain } });
              if (existingDom && existingDom.id !== id) {
                return res.status(400).json({ error: `O domínio personalizado '${customDomain}' já está em uso.` });
              }
            }
          } catch (domErr: any) {
            return res.status(400).json({ error: domErr.message });
          }
        }
      }

      const VALID_PLANS = ['STARTER', 'PRO', 'ENTERPRISE', 'CUSTOM'];
      if (plan && !VALID_PLANS.includes(plan)) {
        return res.status(400).json({ error: `Plano inválido '${plan}'. Planos válidos: ${VALID_PLANS.join(', ')}.` });
      }

      const VALID_STATUSES = ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'TRIAL'];
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status inválido '${status}'.` });
      }

      if (maxUsers !== undefined) {
        const num = Number(maxUsers);
        if (isNaN(num) || num < 1 || num > 100000) {
          return res.status(400).json({ error: 'maxUsers deve ser um número entre 1 e 100.000.' });
        }
      }
      if (storageLimitMb !== undefined) {
        const num = Number(storageLimitMb);
        if (isNaN(num) || num < 100 || num > 10000000) {
          return res.status(400).json({ error: 'storageLimitMb deve ser um número entre 100 e 10.000.000.' });
        }
      }
      if (maxProposals !== undefined) {
        const num = Number(maxProposals);
        if (isNaN(num) || num < 100 || num > 10000000) {
          return res.status(400).json({ error: 'maxProposals deve ser um número entre 100 e 10.000.000.' });
        }
      }

      const cleanCnpj = cnpj !== undefined ? (cnpj ? String(cnpj).replace(/\D/g, '') : null) : undefined;
      if (cleanCnpj && cleanCnpj !== currentTenant.cnpj) {
        const existingCnpj = await prisma.tenant.findUnique({ where: { cnpj: cleanCnpj } });
        if (existingCnpj && existingCnpj.id !== id) {
          return res.status(400).json({ error: `O CNPJ '${cleanCnpj}' já pertence a outro tenant.` });
        }
      }

      const updatedTenant = await prisma.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: {
            name: name ? String(name).trim() : undefined,
            slug,
            customDomain,
            cnpj: cleanCnpj,
            tradeName: tradeName !== undefined ? (tradeName ? String(tradeName).trim() : null) : undefined,
            plan: plan || undefined,
            status: status || undefined,
            maxUsers: maxUsers !== undefined ? Number(maxUsers) : undefined,
            storageLimitMb: storageLimitMb !== undefined ? Number(storageLimitMb) : undefined,
            maxProposals: maxProposals !== undefined ? Number(maxProposals) : undefined,
            enabledModules: Array.isArray(enabledModules) ? enabledModules : undefined,
          },
        });

        if (whiteLabel && typeof whiteLabel === 'object') {
          await tx.whiteLabelConfig.upsert({
            where: { tenantId: id },
            update: {
              companyName: whiteLabel.companyName || undefined,
              legalName: whiteLabel.legalName !== undefined ? whiteLabel.legalName : undefined,
              logoUrl: whiteLabel.logoUrl !== undefined ? whiteLabel.logoUrl : undefined,
              faviconUrl: whiteLabel.faviconUrl !== undefined ? whiteLabel.faviconUrl : undefined,
              primaryColor: whiteLabel.primaryColor || undefined,
              secondaryColor: whiteLabel.secondaryColor || undefined,
              accentColor: whiteLabel.accentColor || undefined,
              supportEmail: whiteLabel.supportEmail !== undefined ? whiteLabel.supportEmail : undefined,
              supportPhone: whiteLabel.supportPhone !== undefined ? whiteLabel.supportPhone : undefined,
              footerText: whiteLabel.footerText !== undefined ? whiteLabel.footerText : undefined,
              themeMode: whiteLabel.themeMode || undefined,
            },
            create: {
              tenantId: id,
              companyName: whiteLabel.companyName || t.name,
              legalName: whiteLabel.legalName || null,
              logoUrl: whiteLabel.logoUrl || null,
              faviconUrl: whiteLabel.faviconUrl || null,
              primaryColor: whiteLabel.primaryColor || '#2563eb',
              secondaryColor: whiteLabel.secondaryColor || '#1e40af',
              accentColor: whiteLabel.accentColor || '#3b82f6',
              supportEmail: whiteLabel.supportEmail || null,
              supportPhone: whiteLabel.supportPhone || null,
              footerText: whiteLabel.footerText || `© ${new Date().getFullYear()} ${t.name}`,
              themeMode: whiteLabel.themeMode || 'LIGHT',
            },
          });
        }

        return t;
      });

      // Invalidação de caches
      if (currentTenant.customDomain) TenantResolver.invalidateCache(currentTenant.customDomain);
      if (updatedTenant.customDomain) TenantResolver.invalidateCache(updatedTenant.customDomain);
      TenantResolver.invalidateCache(currentTenant.slug + '.sentinelconsig.com.br');
      TenantResolver.invalidateCache(updatedTenant.slug + '.sentinelconsig.com.br');

      // Auditoria com categorização precisa por tipo de alteração
      let auditAction = 'tenant.updated';
      if (plan && plan !== currentTenant.plan) auditAction = 'tenant.plan_changed';
      else if (
        (maxUsers !== undefined && maxUsers !== currentTenant.maxUsers) ||
        (storageLimitMb !== undefined && storageLimitMb !== currentTenant.storageLimitMb) ||
        (maxProposals !== undefined && maxProposals !== currentTenant.maxProposals)
      ) {
        auditAction = 'tenant.limits_changed';
      } else if (enabledModules && JSON.stringify(enabledModules) !== JSON.stringify(currentTenant.enabledModules)) {
        auditAction = 'tenant.modules_changed';
      } else if (whiteLabel) {
        auditAction = 'tenant.branding_changed';
      }

      await AuditLogService.record(prisma, {
        tenantId: id,
        userId: session.user.id,
        userName: session.user.name,
        action: auditAction,
        entity: 'Tenant',
        entityId: id,
        oldData: {
          name: currentTenant.name,
          slug: currentTenant.slug,
          customDomain: currentTenant.customDomain,
          status: currentTenant.status,
          plan: currentTenant.plan,
          maxUsers: currentTenant.maxUsers,
          storageLimitMb: currentTenant.storageLimitMb,
          maxProposals: currentTenant.maxProposals,
          enabledModules: currentTenant.enabledModules,
        },
        newData: {
          name: updatedTenant.name,
          slug: updatedTenant.slug,
          customDomain: updatedTenant.customDomain,
          status: updatedTenant.status,
          plan: updatedTenant.plan,
          maxUsers: updatedTenant.maxUsers,
          storageLimitMb: updatedTenant.storageLimitMb,
          maxProposals: updatedTenant.maxProposals,
          enabledModules: updatedTenant.enabledModules,
        },
        req,
      });

      // Emissão de evento thin via Pusher para o tenant
      eventBus.publishToTenant(id, {
        type: 'TENANT_UPDATED',
        entity: 'tenant',
        entityId: id,
      }).catch(() => {});

      return res.json(updatedTenant);
    } catch (err: any) {
      console.error('[PUT /api/saas/tenants/:id ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao atualizar tenant.' });
    }
  };
  app.put('/api/saas/tenants/:id', updateTenantHandler);
  app.put('/api/admin/tenants/:id', updateTenantHandler);
  app.put('/api/tenants/:id', updateTenantHandler);

  // 5. POST /api/saas/tenants/:id/suspend (and alias /api/admin/tenants/:id/suspend)
  const suspendTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { id } = req.params;
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      // Atualiza status para SUSPENDED
      const updated = await prisma.tenant.update({
        where: { id },
        data: { status: 'SUSPENDED' },
      });

      // Invalida sessões ativas no banco de dados para todos os usuários deste tenant
      const deletedSessions = await prisma.session.deleteMany({
        where: { user: { tenantId: id } },
      });
      console.log(`[TENANT SUSPEND] ${deletedSessions.count} sessões ativas revogadas para o Tenant ${id}`);

      // Invalidação de cache de domínio
      if (tenant.customDomain) TenantResolver.invalidateCache(tenant.customDomain);
      TenantResolver.invalidateCache(tenant.slug + '.sentinelconsig.com.br');

      // Emissão de evento thin via Pusher para o tenant
      eventBus.publishToTenant(id, {
        type: 'TENANT_SUSPENDED',
        entity: 'tenant',
        entityId: id,
      }).catch(() => {});

      // Registro de Auditoria
      await AuditLogService.record(prisma, {
        tenantId: id,
        userId: session.user.id,
        userName: session.user.name,
        action: 'tenant.suspended',
        entity: 'Tenant',
        entityId: id,
        newData: { status: 'SUSPENDED', revokedSessionsCount: deletedSessions.count },
        req,
      });

      return res.json({
        success: true,
        message: 'Tenant suspenso com sucesso. Todas as sessões foram encerradas.',
        tenant: updated,
      });
    } catch (err) {
      console.error('[POST /api/saas/tenants/:id/suspend ERROR]', err);
      return res.status(500).json({ error: 'Erro ao suspender tenant.' });
    }
  };
  app.post('/api/saas/tenants/:id/suspend', suspendTenantHandler);
  app.post('/api/admin/tenants/:id/suspend', suspendTenantHandler);

  // 6. POST /api/saas/tenants/:id/reactivate (and alias /api/admin/tenants/:id/reactivate)
  const reactivateTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { id } = req.params;
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const updated = await prisma.tenant.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });

      // Invalidação de cache de resolução
      if (tenant.customDomain) TenantResolver.invalidateCache(tenant.customDomain);
      TenantResolver.invalidateCache(tenant.slug + '.sentinelconsig.com.br');

      // Emissão de evento thin via Pusher para o tenant
      eventBus.publishToTenant(id, {
        type: 'TENANT_REACTIVATED',
        entity: 'tenant',
        entityId: id,
      }).catch(() => {});

      // Auditoria
      await AuditLogService.record(prisma, {
        tenantId: id,
        userId: session.user.id,
        userName: session.user.name,
        action: 'tenant.reactivated',
        entity: 'Tenant',
        entityId: id,
        newData: { status: 'ACTIVE' },
        req,
      });

      return res.json({
        success: true,
        message: 'Tenant reativado com sucesso.',
        tenant: updated,
      });
    } catch (err) {
      console.error('[POST /api/saas/tenants/:id/reactivate ERROR]', err);
      return res.status(500).json({ error: 'Erro ao reativar tenant.' });
    }
  };
  app.post('/api/saas/tenants/:id/reactivate', reactivateTenantHandler);
  app.post('/api/admin/tenants/:id/reactivate', reactivateTenantHandler);

  // 6.5. DELETE /api/saas/tenants/:id (and alias /api/admin/tenants/:id) - Soft delete a tenant
  const deleteTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { id } = req.params;
      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant || tenant.deletedAt) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      // Protect root tenant
      if (
        tenant.slug === 'evolve' ||
        tenant.slug === 'sentinel-consig' ||
        tenant.id === 'tenant_evolve'
      ) {
        return res.status(403).json({ error: 'A empresa raiz da plataforma não pode ser excluída.' });
      }

      // Soft delete in PostgreSQL using transaction to ensure consistency
      const updated = await prisma.$transaction(async (tx) => {
        // Soft delete the tenant
        const updatedTenant = await tx.tenant.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            deletedBy: session.user.id,
            status: 'CANCELLED',
          },
        });

        // Soft delete all users belonging to this tenant
        await tx.user.updateMany({
          where: { tenantId: id, deletedAt: null },
          data: {
            deletedAt: new Date(),
            deletedBy: session.user.id,
            active: false,
          },
        });

        // Kill active sessions for this tenant
        await tx.session.deleteMany({
          where: { user: { tenantId: id } },
        });

        return updatedTenant;
      });

      // Clear any active context switch for this tenant (both memory and DB)
      await AdminContextManager.clearContextByTenantId(id, prisma);

      // Invalidation of cache
      if (tenant.customDomain) TenantResolver.invalidateCache(tenant.customDomain);
      TenantResolver.invalidateCache(tenant.slug + '.sentinelconsig.com.br');

      // Publish realtime update
      eventBus.publishToTenant(id, {
        type: 'TENANT_DELETED',
        entity: 'tenant',
        entityId: id,
      }).catch(() => {});

      // Register Audit Log
      await AuditLogService.record(prisma, {
        tenantId: id,
        userId: session.user.id,
        userName: session.user.name,
        action: 'tenant.deleted',
        entity: 'Tenant',
        entityId: id,
        newData: {
          deletedAt: updated.deletedAt,
          deletedBy: updated.deletedBy,
          status: 'CANCELLED',
        },
        req,
      });

      return res.json({
        success: true,
        message: 'Empresa excluída com sucesso (soft-delete realizado).',
        tenant: updated,
      });
    } catch (err) {
      console.error('[DELETE /api/saas/tenants/:id ERROR]', err);
      return res.status(500).json({ error: 'Erro ao excluir tenant.' });
    }
  };
  app.delete('/api/saas/tenants/:id', deleteTenantHandler);
  app.delete('/api/admin/tenants/:id', deleteTenantHandler);

  // 6.6. POST /api/saas/tenants/bulk-delete (and alias /api/admin/tenants/bulk-delete) - Soft delete in batch
  class DryRunRollbackSignal extends Error {
    public details: any;
    constructor(details: any) {
      super('DRY_RUN_ROLLBACK_SIGNAL');
      this.name = 'DryRunRollbackSignal';
      this.details = details;
    }
  }

  const bulkDeleteTenantsHandler = async (req: express.Request, res: express.Response) => {
    let currentStep = 'STEP 1: validar sessão/PLATFORM_MASTER';
    let processingTenantId: string | null = null;

    try {
      // STEP 1: validar sessão/PLATFORM_MASTER
      currentStep = 'STEP 1: validar sessão/PLATFORM_MASTER';
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.', code: 'UNAUTHENTICATED' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.', code: 'FORBIDDEN' });
      }

      const isDryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
      const { tenantIds } = req.body || {};

      // STEP 2: normalizar IDs
      currentStep = 'STEP 2: normalizar IDs';
      if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
        return res.status(400).json({
          error: 'Lista de IDs de empresas (tenantIds) é obrigatória.',
          code: 'INVALID_INPUT',
          step: currentStep,
        });
      }

      const rawIds = tenantIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim());
      const uniqueIds = Array.from(new Set(rawIds));
      if (uniqueIds.length === 0) {
        return res.status(400).json({
          error: 'Nenhum ID de empresa válido fornecido.',
          code: 'INVALID_INPUT',
          step: currentStep,
        });
      }

      // STEP 3: proteger tenant raiz
      currentStep = 'STEP 3: proteger tenant raiz';
      const rootSlugs = new Set(['sentinel-consig', 'evolve', 'master']);
      const rootKnownIds = new Set(['tenant_evolve', 'sentinel-consig']);

      const isLiteralRoot = uniqueIds.some((id) => rootSlugs.has(id) || rootKnownIds.has(id));

      const rootTenants = await prisma.tenant.findMany({
        where: {
          OR: [
            { slug: 'sentinel-consig' },
            { slug: 'evolve' },
            { id: 'tenant_evolve' },
          ],
        },
        select: { id: true, slug: true, name: true },
      });
      const rootTenantIds = new Set(rootTenants.map((rt) => rt.id));
      const containsRootId = uniqueIds.some((id) => rootTenantIds.has(id));

      if (isLiteralRoot || containsRootId) {
        return res.status(403).json({
          error: 'Operação rejeitada: A empresa raiz da plataforma (sentinel-consig) não pode ser excluída.',
          code: 'ROOT_TENANT_PROTECTED',
          step: currentStep,
        });
      }

      // STEP 4: buscar tenants
      currentStep = 'STEP 4: buscar tenants';
      const existingTenants = await prisma.tenant.findMany({
        where: { id: { in: uniqueIds } },
        include: {
          _count: {
            select: {
              users: true,
              proposals: true,
              clients: true,
            },
          },
        },
      });

      const existingMap = new Map(existingTenants.map((t) => [t.id, t]));
      const toDelete: typeof existingTenants = [];
      const failedDetails: Array<{ tenantId: string; reason: string }> = [];

      // STEP 5 & STEP 6: validar existência e status
      currentStep = 'STEP 5: validar existência e status';
      for (const id of uniqueIds) {
        processingTenantId = id;
        const t = existingMap.get(id);
        if (!t) {
          failedDetails.push({ tenantId: id, reason: 'Empresa não encontrada no banco de dados.' });
        } else if (t.deletedAt !== null) {
          // Already soft-deleted with timestamp
          failedDetails.push({ tenantId: id, reason: 'Empresa já se encontra excluída (deletedAt definido).' });
        } else if (rootSlugs.has(t.slug) || rootTenantIds.has(t.id)) {
          return res.status(403).json({
            error: 'Operação rejeitada: A empresa raiz da plataforma não pode ser excluída.',
            code: 'ROOT_TENANT_PROTECTED',
            step: 'STEP 3: proteger tenant raiz',
            failedTenantId: t.id,
          });
        } else {
          // Apt for soft delete (ACTIVE, SUSPENDED, PENDING_DELETION or status CANCELLED with deletedAt=null)
          toDelete.push(t);
        }
      }
      processingTenantId = null;

      if (toDelete.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhuma empresa válida pôde ser excluída.',
          code: 'NO_VALID_TENANTS',
          processed: uniqueIds.length,
          cancelled: 0,
          failed: failedDetails.length,
          failedDetails,
          step: currentStep,
        });
      }

      const targetIds = toDelete.map((t) => t.id);
      const now = new Date();
      const actorId = session.user.id;
      const actorName = session.user.name;
      const actorRole = session.user.role;

      // STEP 7 a 17: Executar transação atômica
      await prisma.$transaction(async (tx) => {
        // STEP 7: identificar usuários
        currentStep = 'STEP 7: identificar usuários';
        const affectedUsers = await tx.user.findMany({
          where: { tenantId: { in: targetIds }, deletedAt: null },
          select: { id: true, tenantId: true },
        });

        // STEP 8: identificar sessões
        currentStep = 'STEP 8: identificar sessões';
        const userIds = affectedUsers.map((u) => u.id);

        // STEP 9: identificar contexto administrativo
        currentStep = 'STEP 9: identificar contexto administrativo';

        // STEP 10: atualizar tenants
        currentStep = 'STEP 10: atualizar tenants';
        await tx.tenant.updateMany({
          where: { id: { in: targetIds } },
          data: {
            status: 'CANCELLED',
            deletedAt: now,
            deletedBy: actorId,
          },
        });

        // STEP 11: atualizar usuários
        currentStep = 'STEP 11: atualizar usuários';
        if (targetIds.length > 0) {
          await tx.user.updateMany({
            where: { tenantId: { in: targetIds }, deletedAt: null },
            data: {
              deletedAt: now,
              deletedBy: actorId,
              active: false,
            },
          });
        }

        // STEP 12: invalidar sessões dos usuários dos tenants
        currentStep = 'STEP 12: invalidar sessões';
        if (userIds.length > 0) {
          await tx.session.deleteMany({
            where: { userId: { in: userIds } },
          });
        }

        // STEP 13: limpar contexto administrativo ativo apontando para os tenants
        currentStep = 'STEP 13: limpar contexto administrativo';
        await tx.session.updateMany({
          where: { adminTargetTenantId: { in: targetIds } },
          data: {
            adminTargetTenantId: null,
            adminTargetTenantName: null,
            adminSwitchedAt: null,
            adminContextExpiresAt: null,
          },
        });

        // STEP 14: desabilitar domínios
        currentStep = 'STEP 14: desabilitar domínios';
        await tx.tenantDomain.updateMany({
          where: { tenantId: { in: targetIds } },
          data: {
            status: 'DISABLED',
          },
        });

        // STEP 15: registrar AuditLog individual por tenant dentro da mesma transação
        currentStep = 'STEP 15: registrar AuditLog individual por tenant';
        for (const t of toDelete) {
          processingTenantId = t.id;
          await AuditLogService.record(tx as any, {
            tx: tx as any,
            tenantId: t.id,
            userId: actorId,
            userName: actorName,
            action: 'tenant.bulk_deleted',
            entity: 'Tenant',
            entityId: t.id,
            newData: {
              deletedAt: now,
              deletedBy: actorId,
              status: 'CANCELLED',
              operation: 'BULK_DELETE',
              tenantName: t.name,
              tenantSlug: t.slug,
            },
            req,
          });
        }
        processingTenantId = null;

        // STEP 16: registrar AuditLog em lote (batch) dentro da mesma transação
        currentStep = 'STEP 16: registrar AuditLog em lote';
        const primaryRootTenantId = rootTenants[0]?.id || null;
        await AuditLogService.record(tx as any, {
          tx: tx as any,
          tenantId: primaryRootTenantId || toDelete[0]?.id || null,
          userId: actorId,
          userName: actorName,
          action: 'tenant.bulk_delete_batch',
          entity: 'TenantBatch',
          entityId: `batch_${now.getTime()}`,
          newData: {
            totalRequested: uniqueIds.length,
            cancelledCount: toDelete.length,
            failedCount: failedDetails.length,
            affectedTenantIds: targetIds,
            failedDetails,
            actorRole,
          },
          req,
        });

        // STEP 17: commit da transaction ou rollback para dryRun
        currentStep = 'STEP 17: commit da transaction';
        if (isDryRun) {
          throw new DryRunRollbackSignal({
            processed: uniqueIds.length,
            cancelled: toDelete.length,
            failed: failedDetails.length,
            cancelledIds: targetIds,
            failedDetails,
            stepsExecuted: 17,
          });
        }
      }, { timeout: 30000, maxWait: 10000 });

      // Post-transaction caches and event dispatching (executed only upon successful commit)
      for (const t of toDelete) {
        AdminContextManager.clearContextByTenantId(t.id).catch(() => {});

        if (t.customDomain) TenantResolver.invalidateCache(t.customDomain);
        TenantResolver.invalidateCache(t.slug + '.sentinelconsig.com.br');

        eventBus.publishToTenant(t.id, {
          type: 'TENANT_DELETED',
          entity: 'tenant',
          entityId: t.id,
        }).catch(() => {});
      }

      return res.json({
        success: true,
        message: failedDetails.length === 0
          ? `Exclusão concluída: ${toDelete.length} empresas processadas e canceladas com sucesso.`
          : `Exclusão concluída com ressalvas: ${toDelete.length} canceladas, ${failedDetails.length} falharam.`,
        processed: uniqueIds.length,
        cancelled: toDelete.length,
        failed: failedDetails.length,
        cancelledIds: targetIds,
        failedDetails,
        stepsExecuted: 17,
      });
    } catch (err: any) {
      if (err instanceof DryRunRollbackSignal) {
        return res.json({
          success: true,
          dryRun: true,
          message: `Simulação concluída com sucesso: ${err.details.cancelled} empresas válidas para cancelamento. Nenhuma alteração foi gravada no banco de dados.`,
          processed: err.details.processed,
          cancelled: err.details.cancelled,
          failed: err.details.failed,
          cancelledIds: err.details.cancelledIds,
          failedDetails: err.details.failedDetails,
          stepsExecuted: 17,
        });
      }

      console.error('[POST /api/saas/tenants/bulk-delete ERROR]', {
        step: currentStep,
        processingTenantId,
        errorName: err?.name,
        errorMessage: err?.message,
        prismaCode: err?.code,
        prismaMeta: err?.meta,
        stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
      });

      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({
        success: false,
        code: 'TENANT_BULK_DELETE_FAILED',
        error: 'Erro ao processar exclusão em massa de tenants.',
        message: 'Não foi possível concluir a exclusão em massa.',
        step: currentStep,
        failedTenantId: processingTenantId || undefined,
        reason: err?.message || 'Erro interno de processamento transacional.',
        details: isDev ? err?.message : undefined,
        prismaCode: isDev ? err?.code : undefined,
      });
    }
  };
  app.post('/api/saas/tenants/bulk-delete', bulkDeleteTenantsHandler);
  app.post('/api/admin/tenants/bulk-delete', bulkDeleteTenantsHandler);

  // 6.7. POST /api/saas/users/bulk-delete (and alias /api/admin/users/bulk-delete) - Soft delete users in batch
  const bulkDeleteUsersHandler = async (req: express.Request, res: express.Response) => {
    let currentStep = 'STEP 1: validar sessão/PLATFORM_MASTER';
    let processingUserId: string | null = null;

    try {
      // STEP 1: validar sessão/PLATFORM_MASTER
      currentStep = 'STEP 1: validar sessão/PLATFORM_MASTER';
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.', code: 'UNAUTHENTICATED' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.', code: 'FORBIDDEN' });
      }

      const isDryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
      const { userIds } = req.body || {};

      // STEP 2: normalizar IDs
      currentStep = 'STEP 2: normalizar IDs';
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          error: 'Lista de IDs de usuários (userIds) é obrigatória.',
          code: 'INVALID_INPUT',
          step: currentStep,
        });
      }

      const rawIds = userIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim());
      const uniqueIds = Array.from(new Set(rawIds));
      if (uniqueIds.length === 0) {
        return res.status(400).json({
          error: 'Nenhum ID de usuário válido fornecido.',
          code: 'INVALID_INPUT',
          step: currentStep,
        });
      }

      // STEP 3: impedir exclusão do próprio usuário autenticado
      if (uniqueIds.includes(session.user.id)) {
        return res.status(403).json({
          error: 'Operação rejeitada: Você não pode excluir seu próprio usuário autenticado.',
          code: 'CANNOT_DELETE_SELF',
          step: 'STEP 3: proteger usuário logado',
        });
      }

      // STEP 4: buscar usuários no banco
      currentStep = 'STEP 4: buscar usuários';
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      // STEP 5: verificar proteção PLATFORM_MASTER e root (TUDO OU NADA)
      currentStep = 'STEP 5: verificar proteção PLATFORM_MASTER';
      const hasPlatformMaster = existingUsers.some((u) => u.role === 'PLATFORM_MASTER');
      if (hasPlatformMaster) {
        return res.status(403).json({
          error: 'Operação rejeitada: Usuários com perfil PLATFORM_MASTER não podem ser excluídos em lote.',
          code: 'PLATFORM_MASTER_PROTECTED',
          step: currentStep,
        });
      }

      const protectedEmails = new Set(['master@sentinel.com', 'kauaigouveia@gmail.com', 'admin@sentinelconsig.com.br']);
      const protectedIds = new Set(['u-master']);
      const hasRootProtected = existingUsers.some(
        (u) => protectedEmails.has(u.email.toLowerCase()) || protectedIds.has(u.id)
      );
      if (hasRootProtected) {
        return res.status(403).json({
          error: 'Operação rejeitada: Usuário master/root protegido não pode ser excluído.',
          code: 'ROOT_USER_PROTECTED',
          step: currentStep,
        });
      }

      // STEP 6: separar aptos vs falhas (já deletados ou não encontrados)
      currentStep = 'STEP 6: validar existência e status';
      const existingMap = new Map(existingUsers.map((u) => [u.id, u]));
      const toDelete: typeof existingUsers = [];
      const failedDetails: Array<{ userId: string; reason: string }> = [];

      for (const id of uniqueIds) {
        processingUserId = id;
        const u = existingMap.get(id);
        if (!u) {
          failedDetails.push({ userId: id, reason: 'Usuário não encontrado no banco de dados.' });
        } else if (u.deletedAt !== null) {
          failedDetails.push({ userId: id, reason: 'Usuário já se encontra excluído (deletedAt definido).' });
        } else {
          toDelete.push(u);
        }
      }
      processingUserId = null;

      if (toDelete.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum usuário válido pôde ser excluído.',
          code: 'NO_VALID_USERS',
          processed: uniqueIds.length,
          deleted: 0,
          failed: failedDetails.length,
          failedDetails,
          step: currentStep,
        });
      }

      const targetUserIds = toDelete.map((u) => u.id);
      const now = new Date();
      const actorId = session.user.id;
      const actorName = session.user.name;
      const actorRole = session.user.role;

      // STEP 7 a 11: Executar transação atômica
      await prisma.$transaction(
        async (tx) => {
          // STEP 7: soft delete dos usuários selecionados
          currentStep = 'STEP 7: soft delete usuários';
          await tx.user.updateMany({
            where: { id: { in: targetUserIds } },
            data: {
              active: false,
              deletedAt: now,
              deletedBy: actorId,
            },
          });

          // STEP 8: invalidar sessões ativas dos usuários
          currentStep = 'STEP 8: invalidar sessões';
          await tx.session.deleteMany({
            where: { userId: { in: targetUserIds } },
          });

          // STEP 9: limpar contexto administrativo órfão
          currentStep = 'STEP 9: limpar contexto administrativo';
          await tx.session.updateMany({
            where: { userId: { in: targetUserIds } },
            data: {
              adminTargetTenantId: null,
              adminTargetTenantName: null,
              adminSwitchedAt: null,
              adminContextExpiresAt: null,
            },
          });

          // STEP 10: registrar AuditLog individual por usuário na mesma transação
          currentStep = 'STEP 10: registrar AuditLog individual por usuário';
          for (const u of toDelete) {
            processingUserId = u.id;
            await AuditLogService.record(tx as any, {
              tx: tx as any,
              tenantId: u.tenantId || null,
              userId: actorId,
              userName: actorName,
              action: 'USER_SOFT_DELETED',
              entity: 'User',
              entityId: u.id,
              oldData: { email: u.email, name: u.name, role: u.role, active: u.active },
              newData: {
                deletedAt: now,
                deletedBy: actorId,
                active: false,
                operation: 'BULK_DELETE',
                userEmail: u.email,
                userName: u.name,
                userRole: u.role,
              },
              req,
            });
          }
          processingUserId = null;

          // STEP 11: registrar AuditLog em lote na mesma transação
          currentStep = 'STEP 11: registrar AuditLog em lote';
          await AuditLogService.record(tx as any, {
            tx: tx as any,
            tenantId: toDelete[0]?.tenantId || null,
            userId: actorId,
            userName: actorName,
            action: 'USER_BULK_SOFT_DELETED',
            entity: 'UserBatch',
            entityId: `user_batch_${now.getTime()}`,
            newData: {
              totalRequested: uniqueIds.length,
              deletedCount: toDelete.length,
              failedCount: failedDetails.length,
              affectedUserIds: targetUserIds,
              failedDetails,
              actorRole,
            },
            req,
          });

          // Rollback para simulação dryRun se solicitado
          if (isDryRun) {
            throw new DryRunRollbackSignal({
              processed: uniqueIds.length,
              deleted: toDelete.length,
              failed: failedDetails.length,
              deletedIds: targetUserIds,
              failedDetails,
              stepsExecuted: 11,
            });
          }
        },
        { timeout: 30000, maxWait: 10000 }
      );

      // Post-transaction events
      const tenantIdsToBroadcast = Array.from(new Set(toDelete.map((u) => u.tenantId).filter(Boolean)));
      for (const tid of tenantIdsToBroadcast) {
        if (tid) {
          sseRegistry.broadcastToTenant(tid, {
            type: 'USER_DELETED',
            entity: 'User',
            entityId: 'BULK_DELETE',
            userId: actorId,
            data: { batchSize: toDelete.length },
          });
        }
      }

      return res.json({
        success: true,
        message:
          failedDetails.length === 0
            ? `Exclusão concluída: ${toDelete.length} usuários processados e desativados com sucesso.`
            : `Exclusão concluída com ressalvas: ${toDelete.length} desativados, ${failedDetails.length} falharam.`,
        processed: uniqueIds.length,
        deleted: toDelete.length,
        failed: failedDetails.length,
        deletedIds: targetUserIds,
        failedDetails,
        stepsExecuted: 11,
      });
    } catch (err: any) {
      if (err instanceof DryRunRollbackSignal) {
        return res.json({
          success: true,
          dryRun: true,
          message: `Simulação concluída com sucesso: ${err.details.deleted} usuários válidos para cancelamento. Nenhuma alteração foi gravada no banco de dados.`,
          processed: err.details.processed,
          deleted: err.details.deleted,
          failed: err.details.failed,
          deletedIds: err.details.deletedIds,
          failedDetails: err.details.failedDetails,
          stepsExecuted: 11,
        });
      }

      console.error('[POST /api/saas/users/bulk-delete ERROR]', {
        step: currentStep,
        processingUserId,
        errorName: err?.name,
        errorMessage: err?.message,
        prismaCode: err?.code,
        prismaMeta: err?.meta,
        stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
      });

      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({
        success: false,
        code: 'USER_BULK_DELETE_FAILED',
        error: 'Erro ao processar exclusão em massa de usuários.',
        message: 'Não foi possível concluir a exclusão em massa de usuários.',
        step: currentStep,
        failedUserId: processingUserId || undefined,
        reason: err?.message || 'Erro interno de processamento transacional.',
        details: isDev ? err?.message : undefined,
        prismaCode: isDev ? err?.code : undefined,
      });
    }
  };
  app.post('/api/saas/users/bulk-delete', bulkDeleteUsersHandler);
  app.post('/api/admin/users/bulk-delete', bulkDeleteUsersHandler);

  // 7. CONTEXT SWITCHING API (PLATFORM_MASTER Support/Admin Inspection)
  const contextSwitchHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { targetTenantId } = req.body || {};
      if (!targetTenantId) {
        return res.status(400).json({ error: 'targetTenantId é obrigatório.' });
      }

      const targetTenant = await prisma.tenant.findUnique({ where: { id: targetTenantId } });
      if (!targetTenant || targetTenant.deletedAt) {
        return res.status(404).json({ error: 'Tenant alvo não encontrado.' });
      }

      const contextData = await AdminContextManager.setContext(
        session.id,
        targetTenant.id,
        targetTenant.name,
        session.user.id,
        prisma
      );

      // Auditoria obrigatória de início de contexto administrativo
      await AuditLogService.record(prisma, {
        tenantId: targetTenant.id,
        userId: session.user.id,
        userName: session.user.name,
        action: 'admin.context_entered',
        entity: 'Tenant',
        entityId: targetTenant.id,
        newData: {
          platformMasterUserId: session.user.id,
          targetTenantId: targetTenant.id,
          targetTenantName: targetTenant.name,
          timestamp: contextData.switchedAt.toISOString(),
        },
        req,
      });

      return res.json({
        success: true,
        message: `Contexto administrativo alternado para '${targetTenant.name}'.`,
        context: {
          targetTenantId: contextData.targetTenantId,
          targetTenantName: contextData.targetTenantName,
          switchedAt: contextData.switchedAt,
          expiresAt: contextData.expiresAt,
        },
      });
    } catch (err) {
      console.error('[POST /api/saas/context-switch ERROR]', err);
      return res.status(500).json({ error: 'Erro ao alternar contexto administrativo.' });
    }
  };
  app.post('/api/saas/context-switch', contextSwitchHandler);
  app.post('/api/admin/switch-tenant', contextSwitchHandler);

  const contextSwitchExitHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const currentContext = session.adminContext || AdminContextManager.getContext(session.id);
      await AdminContextManager.clearContext(session.id, prisma);

      if (currentContext) {
        // Auditoria de encerramento de contexto
        await AuditLogService.record(prisma, {
          tenantId: currentContext.targetTenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'admin.context_exited',
          entity: 'Tenant',
          entityId: currentContext.targetTenantId,
          newData: {
            platformMasterUserId: session.user.id,
            targetTenantId: currentContext.targetTenantId,
            timestamp: new Date().toISOString(),
          },
          req,
        });
      }

      return res.json({
        success: true,
        message: 'Contexto administrativo encerrado. Retornado ao escopo global.',
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao sair do contexto administrativo.' });
    }
  };
  app.post('/api/saas/context-switch/exit', contextSwitchExitHandler);
  app.post('/api/admin/exit-context', contextSwitchExitHandler);

  const contextStatusHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      if (session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const context = session.adminContext || AdminContextManager.getContext(session.id);
      return res.json({ active: Boolean(context), context });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao obter status do contexto.' });
    }
  };
  app.get('/api/saas/context-switch/status', contextStatusHandler);
  app.get('/api/admin/context-status', contextStatusHandler);

  // =============================================================
  // CUSTOM DOMAIN & DNS CHALLENGE API (FASE 8.2-B)
  // =============================================================

  // 1. GET /api/admin/tenants/:id/domains (and alias /api/saas/tenants/:id/domains)
  const getDomainsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';
      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { id: tenantId } = req.params;

      // IDOR check
      if (isMaster && session.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode gerenciar domínios de outro tenant.' });
      }

      if (isPlatformMaster) {
        const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!targetTenant) {
          return res.status(404).json({ error: 'Tenant não encontrado.' });
        }
      }

      const domains = await prisma.tenantDomain.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(domains);
    } catch (err) {
      console.error('[GET /api/admin/tenants/:id/domains ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar domínios.' });
    }
  };
  app.get('/api/admin/tenants/:id/domains', getDomainsHandler);
  app.get('/api/saas/tenants/:id/domains', getDomainsHandler);

  // 2. POST /api/admin/tenants/:id/domains (and alias /api/saas/tenants/:id/domains)
  const createDomainHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';
      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { id: tenantId } = req.params;

      // IDOR check
      if (isMaster && session.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode gerenciar domínios de outro tenant.' });
      }

      if (isPlatformMaster) {
        const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!targetTenant) {
          return res.status(404).json({ error: 'Tenant não encontrado.' });
        }
      }

      const rawDomain = req.body.domain;
      if (!rawDomain || typeof rawDomain !== 'string') {
        return res.status(400).json({ error: 'O domínio é obrigatório e deve ser uma string.' });
      }

      let domain: string;
      try {
        const norm = TenantNormalization.normalizeCustomDomain(rawDomain);
        if (!norm) {
          return res.status(400).json({ error: 'Domínio inválido ou vazio.' });
        }
        domain = norm;
      } catch (err: any) {
        return res.status(400).json({ error: err.message || 'Erro ao validar domínio.' });
      }

      if (domain.length > 253) {
        return res.status(400).json({ error: 'Domínio inválido: comprimento máximo de 253 caracteres excedido.' });
      }

      // Rejeitar IP literal ou localhost
      if (domain === 'localhost' || domain === '127.0.0.1' || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
        return res.status(400).json({ error: 'Domínio inválido: localhost ou IPs literais não são permitidos.' });
      }

      // Rejeitar domínios reservados do sistema se forem cadastrados incorretamente na plataforma
      const reservedPrefixes = ['admin', 'api', 'app', 'auth', 'saas', 'www', 'system', 'dashboard', 'dev', 'stage'];
      const parts = domain.split('.');
      if (parts.length > 0 && reservedPrefixes.includes(parts[0]) && domain.endsWith('.sentinelconsig.com.br')) {
        return res.status(400).json({ error: `O prefixo '${parts[0]}' é reservado do sistema.` });
      }

      // Check cross-tenant uniqueness
      const existingDomain = await prisma.tenantDomain.findUnique({
        where: { domain }
      });
      if (existingDomain) {
        return res.status(400).json({ error: `O domínio personalizado '${domain}' já está registrado.` });
      }

      const existingLegacy = await prisma.tenant.findUnique({
        where: { customDomain: domain }
      });
      if (existingLegacy) {
        return res.status(400).json({ error: `O domínio personalizado '${domain}' já está em uso por outro tenant (legado).` });
      }

      // Generate cryptographically secure verification token
      const secureBytes = crypto.randomBytes(24).toString('hex');
      const verificationToken = `st_${secureBytes}`;

      const tenantDomain = await prisma.tenantDomain.create({
        data: {
          tenantId,
          domain,
          status: 'PENDING',
          verificationToken,
          isPrimary: false,
        }
      });

      // Audit Log (NÃO expor verificationToken nos logs)
      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'domain.created',
        entity: 'TenantDomain',
        entityId: tenantDomain.id,
        newData: {
          id: tenantDomain.id,
          domain: tenantDomain.domain,
          status: tenantDomain.status,
          isPrimary: tenantDomain.isPrimary,
        },
        req,
      });

      return res.status(201).json(tenantDomain);
    } catch (err) {
      console.error('[POST /api/admin/tenants/:id/domains ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar domínio personalizado.' });
    }
  };
  app.post('/api/admin/tenants/:id/domains', createDomainHandler);
  app.post('/api/saas/tenants/:id/domains', createDomainHandler);

  // 3. POST /api/admin/tenants/:id/domains/:domainId/verify (and alias /api/saas/tenants/:id/domains/:domainId/verify)
  const verifyDomainHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';
      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { id: tenantId, domainId } = req.params;

      // IDOR check
      if (isMaster && session.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode gerenciar domínios de outro tenant.' });
      }

      if (isPlatformMaster) {
        const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!targetTenant) {
          return res.status(404).json({ error: 'Tenant não encontrado.' });
        }
      }

      const tenantDomain = await prisma.tenantDomain.findFirst({
        where: { id: domainId, tenantId }
      });
      if (!tenantDomain) {
        return res.status(404).json({ error: 'Domínio não encontrado para este tenant.' });
      }

      // Transition to VERIFYING status first
      await prisma.tenantDomain.update({
        where: { id: domainId },
        data: { status: 'VERIFYING' }
      });

      // Audit Log
      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'domain.verification_started',
        entity: 'TenantDomain',
        entityId: domainId,
        newData: { id: domainId, domain: tenantDomain.domain },
        req,
      });

      // DNS Challenge lookup
      const verificationResult = await DnsVerificationService.verifyTxtRecord(
        tenantDomain.domain,
        tenantDomain.verificationToken
      );

      if (verificationResult.success) {
        const updated = await prisma.tenantDomain.update({
          where: { id: domainId },
          data: {
            status: 'VERIFIED',
            verifiedAt: new Date()
          }
        });

        // Invalidate cache
        TenantResolver.invalidateCache(tenantDomain.domain);

        // Audit Log
        await AuditLogService.record(prisma, {
          tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'domain.verified',
          entity: 'TenantDomain',
          entityId: domainId,
          newData: { id: domainId, domain: tenantDomain.domain, status: 'VERIFIED' },
          req,
        });

        return res.json({
          success: true,
          message: 'Domínio verificado com sucesso.',
          domain: updated
        });
      } else {
        const updated = await prisma.tenantDomain.update({
          where: { id: domainId },
          data: { status: 'FAILED' }
        });

        // Audit Log
        await AuditLogService.record(prisma, {
          tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'domain.verification_failed',
          entity: 'TenantDomain',
          entityId: domainId,
          newData: { id: domainId, domain: tenantDomain.domain, status: 'FAILED', error: verificationResult.error },
          req,
        });

        return res.status(400).json({
          error: verificationResult.error || 'Registro TXT não encontrado ou inválido.',
          status: 'FAILED',
          domain: updated
        });
      }
    } catch (err) {
      console.error('[POST /api/admin/tenants/:id/domains/:domainId/verify ERROR]', err);
      return res.status(500).json({ error: 'Erro ao verificar domínio.' });
    }
  };
  app.post('/api/admin/tenants/:id/domains/:domainId/verify', verifyDomainHandler);
  app.post('/api/saas/tenants/:id/domains/:domainId/verify', verifyDomainHandler);

  // 4. POST /api/admin/tenants/:id/domains/:domainId/primary (and alias /api/saas/tenants/:id/domains/:domainId/primary)
  const setPrimaryDomainHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';
      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { id: tenantId, domainId } = req.params;

      // IDOR check
      if (isMaster && session.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode gerenciar domínios de outro tenant.' });
      }

      if (isPlatformMaster) {
        const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!targetTenant) {
          return res.status(404).json({ error: 'Tenant não encontrado.' });
        }
      }

      const tenantDomain = await prisma.tenantDomain.findFirst({
        where: { id: domainId, tenantId }
      });
      if (!tenantDomain) {
        return res.status(404).json({ error: 'Domínio não encontrado para este tenant.' });
      }

      if (tenantDomain.status !== 'VERIFIED') {
        return res.status(400).json({ error: 'Apenas domínios com status VERIFIED podem ser definidos como primários.' });
      }

      // Update primary domain in a transaction
      await prisma.$transaction([
        prisma.tenantDomain.updateMany({
          where: { tenantId, isPrimary: true },
          data: { isPrimary: false }
        }),
        prisma.tenantDomain.update({
          where: { id: domainId },
          data: { isPrimary: true }
        })
      ]);

      // Invalidate cache
      TenantResolver.invalidateCache(tenantDomain.domain);

      // Audit Log
      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'domain.updated',
        entity: 'TenantDomain',
        entityId: domainId,
        newData: { id: domainId, domain: tenantDomain.domain, isPrimary: true },
        req,
      });

      const updatedDomain = await prisma.tenantDomain.findUnique({ where: { id: domainId } });
      return res.json({
        success: true,
        message: 'Domínio primário atualizado com sucesso.',
        domain: updatedDomain
      });
    } catch (err) {
      console.error('[POST /api/admin/tenants/:id/domains/:domainId/primary ERROR]', err);
      return res.status(500).json({ error: 'Erro ao definir domínio primário.' });
    }
  };
  app.post('/api/admin/tenants/:id/domains/:domainId/primary', setPrimaryDomainHandler);
  app.post('/api/saas/tenants/:id/domains/:domainId/primary', setPrimaryDomainHandler);

  // 5. POST /api/admin/tenants/:id/domains/:domainId/disable (and alias /api/saas/tenants/:id/domains/:domainId/disable)
  const disableDomainHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';
      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { id: tenantId, domainId } = req.params;

      // IDOR check
      if (isMaster && session.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode gerenciar domínios de outro tenant.' });
      }

      if (isPlatformMaster) {
        const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!targetTenant) {
          return res.status(404).json({ error: 'Tenant não encontrado.' });
        }
      }

      const tenantDomain = await prisma.tenantDomain.findFirst({
        where: { id: domainId, tenantId }
      });
      if (!tenantDomain) {
        return res.status(404).json({ error: 'Domínio não encontrado para este tenant.' });
      }

      const updated = await prisma.tenantDomain.update({
        where: { id: domainId },
        data: { status: 'DISABLED', isPrimary: false }
      });

      // Invalidate cache
      TenantResolver.invalidateCache(tenantDomain.domain);

      // Audit Log
      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'domain.disabled',
        entity: 'TenantDomain',
        entityId: domainId,
        newData: { id: domainId, domain: tenantDomain.domain, status: 'DISABLED' },
        req,
      });

      return res.json({
        success: true,
        message: 'Domínio desativado com sucesso.',
        domain: updated
      });
    } catch (err) {
      console.error('[POST /api/admin/tenants/:id/domains/:domainId/disable ERROR]', err);
      return res.status(500).json({ error: 'Erro ao desativar domínio.' });
    }
  };
  app.post('/api/admin/tenants/:id/domains/:domainId/disable', disableDomainHandler);
  app.post('/api/saas/tenants/:id/domains/:domainId/disable', disableDomainHandler);

  // 6. DELETE /api/admin/tenants/:id/domains/:domainId (and alias /api/saas/tenants/:id/domains/:domainId)
  const deleteDomainHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = session.user.role === 'MASTER';
      if (!isPlatformMaster && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { id: tenantId, domainId } = req.params;

      // IDOR check
      if (isMaster && session.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Acesso negado: Você não pode gerenciar domínios de outro tenant.' });
      }

      if (isPlatformMaster) {
        const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!targetTenant) {
          return res.status(404).json({ error: 'Tenant não encontrado.' });
        }
      }

      const tenantDomain = await prisma.tenantDomain.findFirst({
        where: { id: domainId, tenantId }
      });
      if (!tenantDomain) {
        return res.status(404).json({ error: 'Domínio não encontrado para este tenant.' });
      }

      // Check if it is primary and the ONLY verified domain of the tenant
      if (tenantDomain.isPrimary) {
        const verifiedCount = await prisma.tenantDomain.count({
          where: { tenantId, status: 'VERIFIED' }
        });
        if (verifiedCount <= 1) {
          return res.status(400).json({
            error: 'Não é permitido remover o domínio primário quando ele é o único domínio verificado do tenant. Adicione ou defina outro domínio verificado como primário antes de remover este.'
          });
        }
      }

      await prisma.tenantDomain.delete({
        where: { id: domainId }
      });

      // Invalidate cache
      TenantResolver.invalidateCache(tenantDomain.domain);

      // Audit Log
      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'domain.deleted',
        entity: 'TenantDomain',
        entityId: domainId,
        oldData: { id: domainId, domain: tenantDomain.domain },
        req,
      });

      return res.json({
        success: true,
        message: 'Domínio personalizado removido com sucesso.'
      });
    } catch (err) {
      console.error('[DELETE /api/admin/tenants/:id/domains/:domainId ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover domínio personalizado.' });
    }
  };
  app.delete('/api/admin/tenants/:id/domains/:domainId', deleteDomainHandler);
  app.delete('/api/saas/tenants/:id/domains/:domainId', deleteDomainHandler);

  // -------------------------------------------------------------
  // BULK IMPORT & ASYNC JOBS API ROUTES (Phase 2.4)
  // -------------------------------------------------------------

  // Rate Limiter for bulk imports: max 15 imports per 15 min per IP
  const importRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de requisições de importação excedido. Aguarde alguns instantes.' },
  });

  // 1. POST /api/import/proposals - Async background processing
  app.post('/api/import/proposals', importRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para iniciar importação.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'proposals.create')) {
        return res.status(403).json({ error: 'Você não tem permissão para importar propostas.' });
      }

      const userId = session.user.id;

      // Rate limit / Concurrency protection: Check if there's already an active job in PROCESSING for this tenant
      const activeJob = await prisma.importJob.findFirst({
        where: {
          tenantId,
          status: { in: ['QUEUED', 'PROCESSING'] },
        },
      });

      if (activeJob) {
        return res.status(429).json({
          error: 'Já existe uma importação em processamento para este tenant.',
          activeJobId: activeJob.id,
        });
      }

      const { fileName, fileSize, rows } = req.body || {};
      const cleanFileName = String(fileName || 'importacao_propostas.xlsx').trim();

      if (cleanFileName.toLowerCase().endsWith('.xls')) {
        return res.status(400).json({ error: 'Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.' });
      }

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro válido enviado para importação.' });
      }

      const MAX_IMPORT_ROWS = 50000;
      if (rows.length > MAX_IMPORT_ROWS) {
        await AuditLogService.record(prisma, {
          tenantId,
          userId,
          action: 'IMPORT_REJECTED_ROW_LIMIT',
          entity: 'ImportJob',
          newData: {
            type: 'PROPOSALS',
            fileName: cleanFileName,
            totalRecords: rows.length,
            maxAllowed: MAX_IMPORT_ROWS,
          },
          req,
        });
        return res.status(400).json({ error: `O arquivo excede o limite máximo permitido de 50.000 registros para importação.` });
      }

      const numFileSize = Number(fileSize) || 0;

      // Create ImportJob record in PostgreSQL
      const job = await prisma.importJob.create({
        data: {
          tenantId,
          userId,
          type: 'PROPOSALS',
          fileName: cleanFileName,
          fileSize: numFileSize,
          status: 'QUEUED',
          totalRecords: rows.length,
        },
      });

      // Audit Log
      await AuditLogService.record(prisma, {
        tenantId,
        userId,
        action: 'IMPORT_STARTED',
        entity: 'ImportJob',
        entityId: job.id,
        newData: {
          type: 'PROPOSALS',
          fileName: cleanFileName,
          totalRecords: rows.length,
        },
        req,
      });

      // Dispatch async background runner without blocking HTTP response
      setImmediate(() => {
        ImportWorkerService.processProposalsJob(prisma, job.id, tenantId, userId, rows).catch(err => {
          console.error(`[BACKGROUND IMPORT ERROR] Job ${job.id} failed:`, err);
        });
      });

      // Return 202 Accepted immediately
      return res.status(202).json({
        success: true,
        message: 'Importação aceita e enfileirada para processamento em segundo plano.',
        importId: job.id,
        totalRecords: rows.length,
        status: 'QUEUED',
      });
    } catch (err: any) {
      console.error('[IMPORT PROPOSALS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao inicializar importação de propostas.' });
    }
  });

  // 2. POST /api/import/status - Bulk status updates
  app.post('/api/import/status', importRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para atualizar status em lote.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'statuses.manage') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'proposals.update')) {
        return res.status(403).json({ error: 'Você não tem permissão para gerenciar status de propostas.' });
      }

      const userId = session.user.id;

      const activeJob = await prisma.importJob.findFirst({
        where: {
          tenantId,
          status: { in: ['QUEUED', 'PROCESSING'] },
        },
      });

      if (activeJob) {
        return res.status(429).json({
          error: 'Já existe uma importação em processamento para este tenant.',
          activeJobId: activeJob.id,
        });
      }

      const { fileName, fileSize, rows } = req.body || {};
      const cleanFileName = String(fileName || 'retorno_status.xlsx').trim();

      if (cleanFileName.toLowerCase().endsWith('.xls')) {
        return res.status(400).json({ error: 'Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.' });
      }

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro de status fornecido.' });
      }

      const MAX_IMPORT_ROWS = 50000;
      if (rows.length > MAX_IMPORT_ROWS) {
        await AuditLogService.record(prisma, {
          tenantId,
          userId,
          action: 'IMPORT_REJECTED_ROW_LIMIT',
          entity: 'ImportJob',
          newData: {
            type: 'STATUS_UPDATE',
            fileName: cleanFileName,
            totalRecords: rows.length,
            maxAllowed: MAX_IMPORT_ROWS,
          },
          req,
        });
        return res.status(400).json({ error: `O arquivo excede o limite máximo permitido de 50.000 registros para importação.` });
      }

      const numFileSize = Number(fileSize) || 0;

      const job = await prisma.importJob.create({
        data: {
          tenantId,
          userId,
          type: 'STATUS_UPDATE',
          fileName: cleanFileName,
          fileSize: numFileSize,
          status: 'QUEUED',
          totalRecords: rows.length,
        },
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId,
        action: 'IMPORT_STARTED',
        entity: 'ImportJob',
        entityId: job.id,
        newData: {
          type: 'STATUS_UPDATE',
          fileName: cleanFileName,
          totalRecords: rows.length,
        },
        req,
      });

      setImmediate(() => {
        ImportWorkerService.processStatusJob(prisma, job.id, tenantId, userId, rows).catch(err => {
          console.error(`[BACKGROUND STATUS IMPORT ERROR] Job ${job.id} failed:`, err);
        });
      });

      return res.status(202).json({
        success: true,
        message: 'Atualização de status em lote aceita e enfileirada.',
        importId: job.id,
        totalRecords: rows.length,
        status: 'QUEUED',
      });
    } catch (err: any) {
      console.error('[IMPORT STATUS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao inicializar atualização de status em lote.' });
    }
  });

  // 3. POST /api/import/partners - Bulk partner imports
  app.post('/api/import/partners', importRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para importar parceiros.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'partners.create')) {
        return res.status(403).json({ error: 'Você não tem permissão para cadastrar parceiros.' });
      }

      const userId = session.user.id;

      const { fileName, fileSize, rows } = req.body || {};
      const cleanFileName = String(fileName || 'importacao_parceiros.xlsx').trim();

      if (cleanFileName.toLowerCase().endsWith('.xls')) {
        return res.status(400).json({ error: 'Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.' });
      }

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro de parceiro fornecido.' });
      }

      const MAX_IMPORT_ROWS = 50000;
      if (rows.length > MAX_IMPORT_ROWS) {
        await AuditLogService.record(prisma, {
          tenantId,
          userId,
          action: 'IMPORT_REJECTED_ROW_LIMIT',
          entity: 'ImportJob',
          newData: {
            type: 'PARTNERS',
            fileName: cleanFileName,
            totalRecords: rows.length,
            maxAllowed: MAX_IMPORT_ROWS,
          },
          req,
        });
        return res.status(400).json({ error: `O arquivo excede o limite máximo permitido de 50.000 registros para importação.` });
      }

      const numFileSize = Number(fileSize) || 0;

      const job = await prisma.importJob.create({
        data: {
          tenantId,
          userId,
          type: 'PARTNERS',
          fileName: cleanFileName,
          fileSize: numFileSize,
          status: 'QUEUED',
          totalRecords: rows.length,
        },
      });

      setImmediate(() => {
        ImportWorkerService.processPartnersJob(prisma, job.id, tenantId, userId, rows).catch(err => {
          console.error(`[BACKGROUND PARTNER IMPORT ERROR] Job ${job.id} failed:`, err);
        });
      });

      return res.status(202).json({
        success: true,
        message: 'Importação de parceiros enfileirada com sucesso.',
        importId: job.id,
        totalRecords: rows.length,
        status: 'QUEUED',
      });
    } catch (err: any) {
      console.error('[IMPORT PARTNERS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao inicializar importação de parceiros.' });
    }
  });

  // 4. GET /api/import/:id - Retrieve job status with tenant isolation
  app.get('/api/import/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária.' });
      }

      const { id } = req.params;
      const isMaster = session.user.role === 'PLATFORM_MASTER';

      const job = await prisma.importJob.findUnique({
        where: { id },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      if (!job) {
        return res.status(404).json({ error: 'Job de importação não encontrado.' });
      }

      // Strict Tenant Isolation check
      if (!isMaster && job.tenantId !== tenantId) {
        return res.status(404).json({ error: 'Job de importação não encontrado.' });
      }

      const percent = job.totalRecords > 0 ? Math.min(100, Math.round((job.processedRecords / job.totalRecords) * 100)) : 0;

      return res.json({
        ...job,
        percent,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar status da importação.' });
    }
  });

  // 5. POST /api/import/:id/cancel - Request job cancellation
  app.post('/api/import/:id/cancel', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária.' });
      }

      const { id } = req.params;
      const isMaster = session.user.role === 'PLATFORM_MASTER';

      const job = await prisma.importJob.findUnique({
        where: { id },
      });

      if (!job) {
        return res.status(404).json({ error: 'Job de importação não encontrado.' });
      }

      if (!isMaster && job.tenantId !== tenantId) {
        return res.status(404).json({ error: 'Job de importação não encontrado.' });
      }

      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        return res.status(400).json({ error: `O job já está finalizado (${job.status}).` });
      }

      // Flag cancellation
      ImportWorkerService.requestCancellation(id);

      if (job.status === 'QUEUED') {
        await prisma.importJob.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
          },
        });

        sseRegistry.broadcastToTenant(job.tenantId, {
          type: 'IMPORT_CANCELLED',
          entity: 'ImportJob',
          entityId: id,
          userId: session.user.id,
          data: { importId: id },
        });
      }

      return res.json({ success: true, message: 'Solicitação de cancelamento enviada com sucesso.' });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao solicitar cancelamento do job.' });
    }
  });

  // -------------------------------------------------------------
  // ANALYTICS & OPERATIONAL INTELLIGENCE API (Phase 4.1)
  // Strict Tenant Isolation, RBAC & Aggregations via PostgreSQL
  // -------------------------------------------------------------

  // Helper for parsing analytics query filters
  const parseAnalyticsFilters = (query: any) => {
    const filters: any = {};
    if (query.startDate) {
      const d = new Date(String(query.startDate));
      if (!isNaN(d.getTime())) filters.startDate = d;
    }
    if (query.endDate) {
      const d = new Date(String(query.endDate));
      if (!isNaN(d.getTime())) filters.endDate = d;
    }
    if (query.bankId && typeof query.bankId === 'string' && query.bankId.trim()) {
      filters.bankId = query.bankId.trim();
    }
    if (query.partnerId && typeof query.partnerId === 'string' && query.partnerId.trim()) {
      filters.partnerId = query.partnerId.trim();
    }
    if (query.statusId && typeof query.statusId === 'string' && query.statusId.trim()) {
      filters.statusId = query.statusId.trim();
    }
    if (query.productId && typeof query.productId === 'string' && query.productId.trim()) {
      filters.productId = query.productId.trim();
    }
    return filters;
  };

  // 1. GET /api/analytics/bottlenecks
  app.get('/api/analytics/bottlenecks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar inteligência operacional.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar indicadores analíticos.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseAnalyticsFilters(req.query);

      const result = await AnalyticsService.getBottlenecks(prisma, tenantId, filters);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[ANALYTICS BOTTLENECKS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de gargalos operacionais.' });
    }
  });

  // 2. GET /api/analytics/dwell-time
  app.get('/api/analytics/dwell-time', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar tempo de permanência.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar tempo de permanência.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseAnalyticsFilters(req.query);

      const result = await AnalyticsService.getDwellTime(prisma, tenantId, filters);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[ANALYTICS DWELL TIME ERROR]');
      return res.status(500).json({ error: 'Erro ao processar tempo de permanência na esteira.' });
    }
  });

  // 3. GET /api/analytics/aging
  app.get('/api/analytics/aging', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar aging de esteira.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar aging da esteira.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseAnalyticsFilters(req.query);

      const result = await AnalyticsService.getAging(prisma, tenantId, filters);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[ANALYTICS AGING ERROR]');
      return res.status(500).json({ error: 'Erro ao processar aging de propostas.' });
    }
  });

  // 4. GET /api/analytics/production
  app.get('/api/analytics/production', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar produção analítica.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar relatórios de produção.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseAnalyticsFilters(req.query);

      const result = await AnalyticsService.getProduction(prisma, tenantId, filters);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[ANALYTICS PRODUCTION ERROR]');
      return res.status(500).json({ error: 'Erro ao processar métricas de produção analítica.' });
    }
  });

  // 5. GET /api/analytics/sla
  app.get('/api/analytics/sla', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar SLA analítico.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar indicadores de SLA.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseAnalyticsFilters(req.query);

      const result = await AnalyticsService.getSla(prisma, tenantId, filters);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[ANALYTICS SLA ERROR]');
      return res.status(500).json({ error: 'Erro ao processar indicadores de SLA.' });
    }
  });

  // -------------------------------------------------------------
  // FASE 5.1: BI GERENCIAL P0 API
  // Strict Tenant Isolation, RBAC (dashboard.view) & PostgreSQL Source of Truth
  // -------------------------------------------------------------

  const parseBIFilters = (query: any) => {
    const filters: any = {};
    if (query.period && typeof query.period === 'string') {
      filters.period = query.period.trim();
    }
    if (query.startDate && typeof query.startDate === 'string') {
      filters.startDate = query.startDate.trim();
    }
    if (query.endDate && typeof query.endDate === 'string') {
      filters.endDate = query.endDate.trim();
    }
    if (query.bankId && typeof query.bankId === 'string' && query.bankId.trim()) {
      filters.bankId = query.bankId.trim();
    }
    if (query.partnerId && typeof query.partnerId === 'string' && query.partnerId.trim()) {
      filters.partnerId = query.partnerId.trim();
    }
    if (query.digitizerId && typeof query.digitizerId === 'string' && query.digitizerId.trim()) {
      filters.digitizerId = query.digitizerId.trim();
    }
    if (query.assignedToId && typeof query.assignedToId === 'string' && query.assignedToId.trim()) {
      filters.assignedToId = query.assignedToId.trim();
    }
    if (query.productId && typeof query.productId === 'string' && query.productId.trim()) {
      filters.productId = query.productId.trim();
    }
    if (query.proposalType && typeof query.proposalType === 'string' && query.proposalType.trim()) {
      filters.proposalType = query.proposalType.trim();
    }
    if (query.statusId && typeof query.statusId === 'string' && query.statusId.trim()) {
      filters.statusId = query.statusId.trim();
    }
    if (query.standardCategory && typeof query.standardCategory === 'string' && query.standardCategory.trim()) {
      filters.standardCategory = query.standardCategory.trim();
    }
    if (query.groupBy && ['day', 'week', 'month'].includes(String(query.groupBy))) {
      filters.groupBy = query.groupBy;
    }
    return filters;
  };

  // 1. GET /api/bi/overview - Strategic Overview KPIs
  app.get('/api/bi/overview', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar o BI Gerencial.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar o BI Gerencial.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const overview = await BIService.getOverview(prisma, tenantId, filters);
      return res.json(overview);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API OVERVIEW ERROR]');
      return res.status(500).json({ error: 'Erro ao processar visão geral do BI Gerencial.' });
    }
  });

  // 2. GET /api/bi/production - Aggregated Production Volume Time Series
  app.get('/api/bi/production', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar a produção do BI.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar a produção do BI.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const production = await BIService.getProduction(prisma, tenantId, filters);
      return res.json(production);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API PRODUCTION ERROR]');
      return res.status(500).json({ error: 'Erro ao processar dados de produção do BI Gerencial.' });
    }
  });

  // 3. GET /api/bi/banks - Bank Performance & Conversion
  app.get('/api/bi/banks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar a análise de bancos.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar a análise de bancos.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const banks = await BIService.getBanks(prisma, tenantId, filters);
      return res.json(banks);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API BANKS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de bancos do BI Gerencial.' });
    }
  });

  // 4. GET /api/bi/partners - Partner Performance & Conversion
  app.get('/api/bi/partners', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar a análise de parceiros.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar a análise de parceiros.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const partners = await BIService.getPartners(prisma, tenantId, filters);
      return res.json(partners);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API PARTNERS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de parceiros do BI Gerencial.' });
    }
  });

  // 5. GET /api/bi/comparison - Current vs Previous Period Delta Comparison
  app.get('/api/bi/comparison', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar o comparativo do BI.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar o comparativo do BI.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const comparison = await BIComparisonService.getComparison(prisma, tenantId, filters);
      return res.json(comparison);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API COMPARISON ERROR]');
      return res.status(500).json({ error: 'Erro ao processar comparativo do BI Gerencial.' });
    }
  });

  // 6. GET /api/bi/rankings - Extended Rankings for Banks, Partners, and Digitizers
  app.get('/api/bi/rankings', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar os rankings do BI.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar os rankings do BI.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const rankings = await BIComparisonService.getRankings(prisma, tenantId, filters);
      return res.json(rankings);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API RANKINGS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar rankings do BI Gerencial.' });
    }
  });

  // 7. POST /api/bi/export - Server-Side CSV Export with Multi-Tenant & RBAC Isolation
  app.post('/api/bi/export', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para exportar relatórios do BI.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para exportar relatórios do BI.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.body || req.query);

      const dateRange = BIService.resolveDateRange(filters);

      const where: Prisma.ProposalWhereInput = {
        tenantId,
        deletedAt: null,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      };

      if (filters.bankId && filters.bankId.trim()) where.bankId = filters.bankId.trim();
      if (filters.partnerId && filters.partnerId.trim()) where.partnerId = filters.partnerId.trim();
      if (filters.digitizerId && filters.digitizerId.trim()) where.createdById = filters.digitizerId.trim();
      if (filters.assignedToId && filters.assignedToId.trim()) where.assignedToId = filters.assignedToId.trim();
      if (filters.productId && filters.productId.trim()) where.productId = filters.productId.trim();
      if (filters.proposalType && Object.values(ProposalType).includes(filters.proposalType as ProposalType)) {
        where.type = filters.proposalType as ProposalType;
      }
      if (filters.statusId && filters.statusId.trim()) where.statusId = filters.statusId.trim();
      if (filters.standardCategory && Object.values(StandardStatusCategory).includes(filters.standardCategory as StandardStatusCategory)) {
        where.standardCategory = filters.standardCategory as StandardStatusCategory;
      }

      const proposals = await prisma.proposal.findMany({
        where,
        take: 10000,
        orderBy: { createdAt: 'desc' },
        select: {
          proposalNumber: true,
          client: { select: { fullName: true, cpf: true } },
          bank: { select: { name: true } },
          partner: { select: { name: true } },
          product: { select: { name: true } },
          type: true,
          standardCategory: true,
          releasedValue: true,
          contractValue: true,
          createdBy: { select: { name: true } },
          createdAt: true,
        },
      });

      const escapeCsv = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      const headers = [
        'N_PROPOSTA',
        'CPF_CLIENTE',
        'NOME_CLIENTE',
        'BANCO',
        'PARCEIRO',
        'PRODUTO',
        'TIPO_OPERACAO',
        'CATEGORIA_STATUS',
        'VALOR_LIBERADO_LIQUIDO',
        'VALOR_CONTRATO_BRUTO',
        'DIGITADOR_CRIADOR',
        'DATA_CADASTRO',
      ];

      const csvRows = [headers.join(',')];

      for (const p of proposals) {
        const row = [
          escapeCsv(p.proposalNumber),
          escapeCsv(p.client?.cpf || ''),
          escapeCsv(p.client?.fullName || ''),
          escapeCsv(p.bank?.name || ''),
          escapeCsv(p.partner?.name || ''),
          escapeCsv(p.product?.name || ''),
          escapeCsv(p.type || ''),
          escapeCsv(p.standardCategory || ''),
          escapeCsv(Number(p.releasedValue || 0).toFixed(2)),
          escapeCsv(Number(p.contractValue || 0).toFixed(2)),
          escapeCsv(p.createdBy?.name || ''),
          escapeCsv(p.createdAt ? new Date(p.createdAt).toISOString() : ''),
        ];
        csvRows.push(row.join(','));
      }

      const csvBuffer = Buffer.from('\uFEFF' + csvRows.join('\n'), 'utf-8');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="bi-relatorio-${tenantId.slice(0, 8)}-${Date.now()}.csv"`);
      return res.status(200).send(csvBuffer);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API EXPORT ERROR]');
      return res.status(500).json({ error: 'Erro ao gerar exportação CSV do BI Gerencial.' });
    }
  });

  // 8. GET /api/bi/insights - Deterministic Managerial Insights (Phase 5.3-B)
  app.get('/api/bi/insights', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar os insights gerenciais.' });
      }

      if (session.user.role === 'DIGITADOR') {
        return res.status(403).json({ error: 'Acesso a insights gerenciais restrito a gestores.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar insights gerenciais.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const insights = await ManagerialIntelligenceService.getInsights(prisma, tenantId, filters);
      return res.json({ insights, total: insights.length, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API INSIGHTS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar insights gerenciais determinísticos.' });
    }
  });

  // 9. GET /api/bi/health-score - Executive & Operational Health Scores (Phase 5.3-B)
  app.get('/api/bi/health-score', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar o Health Score.' });
      }

      if (session.user.role === 'DIGITADOR') {
        return res.status(403).json({ error: 'Acesso à pontuação de saúde gerencial restrito a gestores.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar o Health Score.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const healthScores = await ManagerialIntelligenceService.getHealthScores(prisma, tenantId, filters);
      return res.json(healthScores);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API HEALTH SCORE ERROR]');
      return res.status(500).json({ error: 'Erro ao processar o Health Score operacional e executivo.' });
    }
  });

  // -------------------------------------------------------------
  // FASE 6.0-B: SENTINELA AI QUERY ENDPOINT (READ-ONLY WITH GEMINI & TOOL ROUTER)
  // -------------------------------------------------------------
  const sentinelaRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req) => {
      const sessionToken = extractSessionToken(req);
      return sessionToken || req.ip || 'anonymous';
    },
    message: {
      error: 'Limite de consultas à Sentinela AI excedido (máximo 10 por minuto). Aguarde um instante.',
    },
    handler: (req, res, _next, options) => {
      logger.warn({ ip: req.ip }, '[SECURITY ALERT] Rate limit de Sentinela AI excedido');
      res.status(429).json(options.message);
    },
  });

  app.post('/api/sentinela/query', sentinelaRateLimiter, async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar a Sentinela AI.' });
      }

      // Check server-side rate limits (10/min per user, 200/hr per tenant)
      const rateCheck = SentinelaAIService.checkRateLimit(session.user.id, session.effectiveTenantId);
      if (!rateCheck.allowed) {
        return res.status(429).json({ error: rateCheck.reason });
      }

      const { message, context } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Mensagem inválida ou vazia.' });
      }

      const toolSession = {
        user: {
          id: session.user.id,
          role: session.user.role,
          customPermissions: session.user.customPermissions || [],
          name: session.user.name,
          email: session.user.email,
        },
        effectiveTenantId: session.effectiveTenantId,
      };

      const startTime = Date.now();
      const result = await SentinelaAIService.query(prisma, toolSession, {
        message: String(message).trim(),
        context: typeof context === 'object' && context ? {
          startDate: typeof context.startDate === 'string' ? context.startDate : undefined,
          endDate: typeof context.endDate === 'string' ? context.endDate : undefined,
        } : undefined,
      });
      const durationMs = Date.now() - startTime;

      logger.info({
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        role: session.user.role,
        toolsUsed: result.toolsUsed.map(t => t.toolName),
        durationMs,
        generatedAt: result.generatedAt,
      }, '[SENTINELA AI QUERY PROCESSED]');

      // Registrar auditoria da consulta na Sentinela AI
      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'SENTINELA_QUERY',
        entity: 'SentinelaAI',
        entityId: 'ai-query',
        newData: {
          promptSnippet: String(message).trim().slice(0, 150),
          toolsUsed: result.toolsUsed.map(t => t.toolName),
          durationMs,
        },
        req,
      });

      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[SENTINELA AI API ERROR]');
      return res.status(500).json({ error: 'Erro ao processar consulta na Sentinela AI.' });
    }
  });

  // -------------------------------------------------------------
  // FASE 4.2-B: PROTECTED OPERATIONAL RULES CRON ENDPOINT
  // -------------------------------------------------------------
  app.post('/api/cron/operational-rules', async (req, res) => {
    const startedAt = new Date();
    const requestId = req.requestId || (req as any).requestId || crypto.randomUUID();

    try {
      const expectedSecret = process.env.CRON_SECRET?.trim();

      // 1. Falha fechada: CRON_SECRET deve estar explicitamente configurado no ambiente
      if (!expectedSecret) {
        logger.error({ ip: req.ip, requestId }, '[CRON SECURITY] CRON_SECRET não configurado ou vazio no ambiente do servidor');
        return res.status(500).json({ error: 'Configuração de segurança do cron não definida no servidor.' });
      }

      const authHeader = req.headers.authorization;

      // 2. Verificação rigorosa do cabeçalho Authorization: Bearer
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn({ ip: req.ip, requestId }, '[CRON SECURITY] Tentativa de execução sem cabeçalho Authorization Bearer');
        return res.status(401).json({ error: 'Não autorizado: cabeçalho de autenticação do cron obrigatório.' });
      }

      const providedToken = authHeader.replace(/^Bearer\s+/i, '').trim();

      if (!providedToken) {
        logger.warn({ ip: req.ip, requestId }, '[CRON SECURITY] Token de autorização Bearer vazio');
        return res.status(401).json({ error: 'Não autorizado: token de autorização vazio.' });
      }

      // Comparação em tempo constante para evitar timing attacks
      const tokenBuffer = Buffer.from(providedToken);
      const expectedBuffer = Buffer.from(expectedSecret);

      if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
        logger.warn({ ip: req.ip, requestId }, '[CRON SECURITY] Token de autorização inválido fornecido');
        return res.status(403).json({ error: 'Proibido: credencial do cron inválida.' });
      }

      logger.info({ ip: req.ip, requestId }, '[CRON] Execução autorizada do motor de regras operacionais iniciada');

      // 2. Execução multi-tenant isolada através do RuleEngineService (P0 desativadas na Fase 4.2-B)
      const summary = await RuleEngineService.runAllTenants(prisma, { batchSize: 20 });

      logger.info(
        {
          requestId,
          durationMs: summary.durationMs,
          tenantsProcessed: summary.tenantsProcessed,
          totalEvaluated: summary.totalEvaluated,
          totalMatched: summary.totalMatched,
        },
        '[CRON] Ciclo de regras operacionais concluído com sucesso'
      );

      return res.status(200).json({
        status: 'SUCCESS',
        requestId,
        summary,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startedAt.getTime();
      const errorMessage = err?.message || String(err);

      logger.error(
        {
          requestId,
          durationMs,
          error: errorMessage,
        },
        '[CRON ERROR] Falha inesperada no processamento do cron de regras operacionais'
      );

      return res.status(500).json({
        status: 'ERROR',
        requestId,
        error: 'Falha interna ao executar motor de regras operacionais.',
      });
    }
  });

  // -------------------------------------------------------------
  // P0.2 GLOBAL ERROR HANDLER MIDDLEWARE
  // -------------------------------------------------------------
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const requestId = req.requestId || (req as any).requestId || crypto.randomUUID();

    logger.error({
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      code: err?.code,
      error: err?.message || String(err),
    }, '[GLOBAL ERROR HANDLER]');

    if (res.headersSent) {
      return next(err);
    }

    const rawStatus = err?.status || err?.statusCode;
    const statusCode = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

    return res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal server error' : (err.message || 'Erro interno no servidor.'),
      requestId,
    });
  });

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  
  // ==========================================
  // ANNOUNCEMENTS
  // ==========================================

  const getVisibilityWhere = () => {
    const now = new Date();
    return {
      status: 'PUBLISHED' as any,
      publishedAt: { lte: now },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } }
      ]
    };
  };

  app.post('/api/announcements', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const { role, id: userId } = session.user;
      const effectiveTenant = session.effectiveTenantId || session.user.tenantId;
      
      let { title, content, priority, scheduledAt, expiresAt, isGlobal } = req.body;
      let targetTenantId = effectiveTenant;

      if (role === 'PLATFORM_MASTER') {
        if (isGlobal && !session.adminContext) {
          targetTenantId = null;
        }
      } else if (role === 'MASTER') {
        if (isGlobal) {
          return res.status(403).json({ error: 'Apenas PLATFORM_MASTER pode criar comunicados globais.' });
        }
      } else {
        return res.status(403).json({ error: 'Acesso negado para criação de comunicados.' });
      }

      const announcement = await prisma.announcement.create({
        data: {
          title,
          content,
          priority: priority || 'MEDIUM',
          tenantId: targetTenantId,
          createdById: userId,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }
      });

      await AuditLogService.record(prisma, {
        tenantId: targetTenantId,
        userId,
        userName: session.user.name,
        action: 'announcement.created',
        entity: 'Announcement',
        entityId: announcement.id,
        newData: { title, priority: priority || 'MEDIUM', scheduledAt, expiresAt },
        req,
      });

      res.json(announcement);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao criar comunicado.' });
    }
  });

  app.get('/api/announcements/manage', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role } = session.user;
      const effectiveTenant = session.effectiveTenantId || session.user.tenantId;

      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const whereClause = role === 'PLATFORM_MASTER' && !session.adminContext
        ? {} 
        : { tenantId: effectiveTenant };

      const announcements = await prisma.announcement.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });
      res.json(announcements);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao listar comunicados.' });
    }
  });

  app.get('/api/announcements', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const userId = session.user.id;

      const limit = Number(req.query.limit) || 20;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

      const announcements = await prisma.announcement.findMany({
        where: {
          OR: [
            { tenantId: null },
            { tenantId }
          ],
          ...getVisibilityWhere()
        },
        orderBy: [
          { priority: 'desc' },
          { publishedAt: 'desc' }
        ],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        include: {
          reads: {
            where: { userId }
          }
        }
      });

      let nextCursor = undefined;
      if (announcements.length > limit) {
        const nextItem = announcements.pop();
        nextCursor = nextItem?.id;
      }

      const formatted = announcements.map(a => {
        const readRecord = (a as any).reads[0];
        return {
          ...a,
          read: !!readRecord?.readAt,
          dismissed: !!readRecord?.dismissedAt,
          reads: undefined
        };
      }).filter(a => !a.dismissed); // Do not show dismissed ones in the main feed

      res.json({ data: formatted, nextCursor, hasMore: !!nextCursor });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao listar comunicados do usuário.' });
    }
  });

  app.get('/api/announcements/unread-count', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;

      // Unread count: All visible announcements that don't have a read record for this user
      // Note: Since Prisma doesn't support left join IS NULL easily in count with relations,
      // we can fetch the IDs or do a small query. Assuming low volume of announcements per tenant:
      
      const visibleAnnouncements = await prisma.announcement.findMany({
        where: {
          OR: [
            { tenantId: null },
            { tenantId }
          ],
          ...getVisibilityWhere()
        },
        select: { id: true }
      });
      
      if (visibleAnnouncements.length === 0) {
        return res.json({ count: 0 });
      }

      const readRecords = await prisma.announcementRead.count({
        where: {
          userId,
          announcementId: { in: visibleAnnouncements.map(a => a.id) },
          readAt: { not: null }
        }
      });

      const count = visibleAnnouncements.length - readRecords;
      res.json({ count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao contar comunicados.' });
    }
  });

  app.get('/api/announcements/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const { role, tenantId: userTenantId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({
        where: { id: req.params.id }
      });
      
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      res.json(announcement);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar.' });
    }
  });

  app.put('/api/announcements/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const { role, tenantId: userTenantId, id: userId } = session.user;
      const { title, content, priority, scheduledAt, expiresAt } = req.body;
      
      const announcement = await prisma.announcement.findUnique({
        where: { id: req.params.id }
      });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const updated = await prisma.announcement.update({
        where: { id: req.params.id },
        data: {
          title,
          content,
          priority,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }
      });

      await AuditLogService.record(prisma, {
        tenantId: announcement.tenantId,
        userId,
        userName: session.user.name,
        action: 'announcement.updated',
        entity: 'Announcement',
        entityId: announcement.id,
        newData: { title, priority, scheduledAt, expiresAt },
        req,
      });
      
      if (updated.status === 'PUBLISHED') {
        if (updated.tenantId) {
          eventBus.publishToTenant(updated.tenantId, {
            type: 'ANNOUNCEMENT_UPDATED',
            entity: 'Announcement',
            entityId: updated.id,
          });
        } else {
          eventBus.publishGlobal({
            type: 'ANNOUNCEMENT_UPDATED',
            entity: 'Announcement',
            entityId: updated.id,
          });
        }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar.' });
    }
  });

  app.post('/api/announcements/:id/publish', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      const updated = await prisma.announcement.update({
        where: { id: announcement.id },
        data: {
          status: 'PUBLISHED' as any,
          publishedAt: new Date()
        }
      });

      await AuditLogService.record(prisma, {
        tenantId: announcement.tenantId,
        userId,
        userName: session.user.name,
        action: 'announcement.published',
        entity: 'Announcement',
        entityId: announcement.id,
        newData: { status: 'PUBLISHED', publishedAt: new Date().toISOString() },
        req,
      });

      if (updated.tenantId) {
        eventBus.publishToTenant(updated.tenantId, {
          type: 'ANNOUNCEMENT_PUBLISHED',
          entity: 'Announcement',
          entityId: updated.id,
        });
      } else {
        eventBus.publishGlobal({
          type: 'ANNOUNCEMENT_PUBLISHED',
          entity: 'Announcement',
          entityId: updated.id,
        });
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao publicar.' });
    }
  });

  app.post('/api/announcements/:id/cancel', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      const updated = await prisma.announcement.update({
        where: { id: announcement.id },
        data: { status: 'CANCELLED' }
      });

      await AuditLogService.record(prisma, {
        tenantId: announcement.tenantId,
        userId,
        userName: session.user.name,
        action: 'announcement.cancelled',
        entity: 'Announcement',
        entityId: announcement.id,
        newData: { status: 'CANCELLED' },
        req,
      });

      if (updated.tenantId) {
        eventBus.publishToTenant(updated.tenantId, {
          type: 'ANNOUNCEMENT_CANCELLED',
          entity: 'Announcement',
          entityId: updated.id,
        });
      } else {
        eventBus.publishGlobal({
          type: 'ANNOUNCEMENT_CANCELLED',
          entity: 'Announcement',
          entityId: updated.id,
        });
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao cancelar.' });
    }
  });

  app.post('/api/announcements/:id/archive', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      const updated = await prisma.announcement.update({
        where: { id: announcement.id },
        data: { status: 'ARCHIVED' }
      });

      await AuditLogService.record(prisma, {
        tenantId: announcement.tenantId,
        userId,
        userName: session.user.name,
        action: 'announcement.archived',
        entity: 'Announcement',
        entityId: announcement.id,
        newData: { status: 'ARCHIVED' },
        req,
      });
      
      if (updated.tenantId) {
        eventBus.publishToTenant(updated.tenantId, {
          type: 'ANNOUNCEMENT_ARCHIVED',
          entity: 'Announcement',
          entityId: updated.id,
        });
      } else {
        eventBus.publishGlobal({
          type: 'ANNOUNCEMENT_ARCHIVED',
          entity: 'Announcement',
          entityId: updated.id,
        });
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao arquivar.' });
    }
  });

  app.delete('/api/announcements/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      await prisma.announcement.delete({ where: { id: announcement.id } });

      await AuditLogService.record(prisma, {
        tenantId: announcement.tenantId,
        userId,
        userName: session.user.name,
        action: 'announcement.deleted',
        entity: 'Announcement',
        entityId: announcement.id,
        oldData: { title: announcement.title },
        req,
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao excluir.' });
    }
  });

  app.post('/api/announcements/:id/read', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findFirst({ 
        where: { 
          id: req.params.id,
          OR: [{ tenantId: null }, { tenantId }],
          ...getVisibilityWhere()
        } 
      });

      if (!announcement) return res.status(404).json({ error: 'Não encontrado ou invisível.' });

      await prisma.announcementRead.upsert({
        where: {
          announcementId_userId: {
            announcementId: announcement.id,
            userId
          }
        },
        update: {
          readAt: new Date()
        },
        create: {
          announcementId: announcement.id,
          userId,
          readAt: new Date()
        }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao marcar como lido.' });
    }
  });

  app.post('/api/announcements/:id/dismiss', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findFirst({ 
        where: { 
          id: req.params.id,
          OR: [{ tenantId: null }, { tenantId }],
          ...getVisibilityWhere()
        } 
      });

      if (!announcement) return res.status(404).json({ error: 'Não encontrado ou invisível.' });

      await prisma.announcementRead.upsert({
        where: {
          announcementId_userId: {
            announcementId: announcement.id,
            userId
          }
        },
        update: {
          readAt: new Date(),
          dismissedAt: new Date()
        },
        create: {
          announcementId: announcement.id,
          userId,
          readAt: new Date(),
          dismissedAt: new Date()
        }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao dispensar comunicado.' });
    }
  });


  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  serverInstance = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Sentinel Consig server running on http://localhost:${PORT}`);
    await auditAndEnsureMasterUser();
  });
}

// -------------------------------------------------------------
// P0.3 UNCAUGHT EXCEPTION, UNHANDLED REJECTION & GRACEFUL SHUTDOWN
// -------------------------------------------------------------

async function gracefulShutdown(reason: string | Error, exitCode = 0) {
  if (isShuttingDown) {
    logger.warn('[SHUTDOWN] Processo de shutdown já em andamento...');
    return;
  }
  isShuttingDown = true;

  logger.error({ reason: reason instanceof Error ? reason.message : String(reason) }, '[SHUTDOWN] Iniciando encerramento gracioso do servidor');

  const forceExitTimeout = setTimeout(() => {
    logger.error('[SHUTDOWN TIMEOUT] Forçando encerramento do processo após 10s');
    process.exit(exitCode || 1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    if (sseRegistry) {
      logger.info('[SHUTDOWN] Encerrando conexões SSE ativas...');
      sseRegistry.closeAllConnections();
    }

    if (serverInstance && serverInstance.close) {
      logger.info('[SHUTDOWN] Fechando servidor HTTP Express...');
      await new Promise<void>((resolve) => {
        serverInstance.close((err?: Error) => {
          if (err) logger.error({ error: err?.message || String(err) }, '[SHUTDOWN ERROR] Erro ao fechar servidor HTTP');
          resolve();
        });
      });
    }

    logger.info('[SHUTDOWN] Desconectando Prisma Client...');
    await prisma.$disconnect();

    logger.info('[SHUTDOWN] Encerramento gracioso concluído com sucesso.');
    process.exit(exitCode);
  } catch (err: any) {
    logger.error({ error: err?.message || String(err) }, '[SHUTDOWN ERROR] Erro durante o encerramento gracioso');
    process.exit(1);
  }
}

process.on('uncaughtException', (err: Error) => {
  logger.error({ error: err?.message || String(err) }, '[CRITICAL UNCAUGHT EXCEPTION]');
  gracefulShutdown(err, 1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error({ reason: reason instanceof Error ? reason.message : String(reason) }, '[CRITICAL UNHANDLED REJECTION]');
  gracefulShutdown(reason instanceof Error ? reason : new Error(String(reason)), 1);
});

process.on('SIGTERM', () => {
  logger.info('[SIGNAL] SIGTERM recebido.');
  gracefulShutdown('SIGTERM', 0);
});

process.on('SIGINT', () => {
  logger.info('[SIGNAL] SIGINT recebido.');
  gracefulShutdown('SIGINT', 0);
});

if (!process.env.VERCEL) {
  startServer();
}

export default app;

