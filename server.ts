import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PrismaClient } from '@prisma/client';
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
import { ImportWorkerService } from './server/services/importWorker.js';
import { TenantNormalization } from './server/utils/tenantNormalization.js';
import { TenantResolver } from './server/utils/tenantResolver.js';
import { AdminContextManager } from './server/utils/adminContext.js';

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
          name: 'SENTINEL CONSIG / EVOLVE',
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
    } else {
      if (!masterPassword) {
        logger.error('[RBAC BOOTSTRAP CRITICAL] INITIAL_MASTER_PASSWORD não configurada no ambiente. Usuário master não criado.');
        return;
      }

      const created = await prisma.user.create({
        data: {
          name: 'Kauai Gouveia',
          email: masterEmail,
          passwordHash: masterPassword,
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

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

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
      // 3-second timeout for database health query
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database health check timeout')), 3000);
      });

      const dbPromise = prisma.$queryRaw`SELECT 1`;

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
        return res.status(401).json({ message: 'Credenciais inválidas ou usuário não encontrado.' });
      }

      // User status check
      if (!dbUser.active) {
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
          return res.status(403).json({
            message: 'Este usuário não pertence a esta organização.',
          });
        }
      }

      // Tenant status check (Instant suspension blocker)
      if (dbUser.tenant && (dbUser.tenant.status === 'SUSPENDED' || dbUser.tenant.status === 'CANCELLED')) {
        return res.status(403).json({ message: 'Tenant suspenso.' });
      }

      // Password hash check
      if (dbUser.passwordHash !== cleanPassword && !dbUser.passwordHash.includes(cleanPassword)) {
        return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
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

      // Set HttpOnly Cookie
      res.cookie('cg_session_id', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/',
      });

      return res.json({
        success: true,
        user: safeUser,
      });
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      return res.status(500).json({ message: 'Erro interno durante a autenticação.' });
    }
  });

  // 2. POST /api/auth/logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const token = req.cookies.cg_session_id;
      if (token) {
        try {
          const session = await prisma.session.findUnique({ where: { token } });
          if (session) {
            AdminContextManager.clearContext(session.id);
            await prisma.session.deleteMany({ where: { token } });
          }
        } catch (e) {
          // session already removed
        }
      }
      res.clearCookie('cg_session_id', { path: '/' });
      return res.json({ success: true, message: 'Sessão encerrada.' });
    } catch (err) {
      res.clearCookie('cg_session_id', { path: '/' });
      return res.json({ success: true, message: 'Sessão encerrada.' });
    }
  });

  // 3. GET /api/auth/session
  app.get('/api/auth/session', async (req, res) => {
    try {
      const token = req.cookies.cg_session_id;
      if (!token) {
        return res.status(401).json({ authenticated: false, message: 'Nenhuma sessão ativa.' });
      }

      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: { include: { tenant: true } } },
      });

      if (!session || session.expiresAt < new Date()) {
        res.clearCookie('cg_session_id', { path: '/' });
        return res.status(401).json({ authenticated: false, message: 'Sessão expirada ou inválida.' });
      }

      if (
        !session.user.active ||
        (session.user.tenant && (session.user.tenant.status === 'SUSPENDED' || session.user.tenant.status === 'CANCELLED'))
      ) {
        AdminContextManager.clearContext(session.id);
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        res.clearCookie('cg_session_id', { path: '/' });
        return res.status(403).json({ authenticated: false, message: 'Tenant suspenso ou usuário desativado.' });
      }

      // Check active AdminContext for PLATFORM_MASTER
      let adminContext: any = null;
      if (session.user.role === 'PLATFORM_MASTER') {
        adminContext = AdminContextManager.getContext(session.id);
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
      const token = req.cookies.cg_session_id;
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

      await prisma.user.update({
        where: { id: session.userId },
        data: {
          passwordHash: String(newPassword).trim(),
          mustChangePassword: false,
        },
      });

      return res.json({ success: true, message: 'Senha alterada com sucesso.' });
    } catch (err) {
      return res.status(500).json({ message: 'Erro ao alterar a senha.' });
    }
  });

  // Helper middleware/function for tenant context & session auth with instant suspension protection
  const getAuthSession = async (req: express.Request) => {
    const token = req.cookies.cg_session_id;
    if (!token) return null;

    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { tenant: true } } },
    });

    if (!session || session.expiresAt < new Date()) return null;

    // Instant suspension protection: if tenant is SUSPENDED or CANCELLED, kill session
    if (
      !session.user.active ||
      (session.user.tenant && (session.user.tenant.status === 'SUSPENDED' || session.user.tenant.status === 'CANCELLED'))
    ) {
      AdminContextManager.clearContext(session.id);
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    // Context switch support for PLATFORM_MASTER
    let effectiveTenantId = session.user.tenantId;
    let adminContext: any = null;
    if (session.user.role === 'PLATFORM_MASTER') {
      adminContext = AdminContextManager.getContext(session.id);
      if (adminContext) {
        effectiveTenantId = adminContext.targetTenantId;
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
      } else {
        return res.status(403).json({ error: 'Canal não suportado ou negado.' });
      }

      const { eventBus } = await import('./server/services/pusherService.js');
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
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Autenticação obrigatória para SSE.' });
      }

      const tenantId = session.user.tenantId;
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
      
      const tenantId = session.user.tenantId;
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
      const tenantId = session.user.tenantId;
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
      sseRegistry.broadcastToTenant(tenantId, {
        type: existingClient ? 'CLIENT_UPDATED' : 'CLIENT_CREATED',
        entity: 'Client',
        entityId: client.id,
        userId: session.user.id,
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
      const tenantId = session?.user?.tenantId;
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

      return res.json({ success: true, message: 'Cliente removido.' });
    } catch (err) {
      console.error('[API CLIENTS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover cliente.' });
    }
  });

  // -------------------------------------------------------------
  // PROPOSALS API (PostgreSQL / Prisma)
  // -------------------------------------------------------------
  app.get('/api/proposals', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.user.tenantId;
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
      const tenantId = session?.user?.tenantId;
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
      const tenantId = session?.user?.tenantId;
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
        if (isStatusChanging) {
          await tx.statusHistory.create({
            data: {
              tenantId,
              proposalId: id,
              statusId: statusId || null,
              statusName: statusName || 'Alteração de Fase',
              userId: session.user.id,
              notes: notes || null,
            },
          });
        }

        return updated;
      });

      // 4. Emissão PÓS-COMMIT garantida: somente após sucesso total da transação
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'PROPOSAL_UPDATED',
        entity: 'Proposal',
        entityId: result.id,
        userId: session.user.id,
      });

      if (isStatusChanging) {
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'STATUS_CHANGED',
          entity: 'Proposal',
          entityId: result.id,
          userId: session.user.id,
        });
      }

      return res.json(result);
    } catch (err) {
      console.error('[API PROPOSALS PATCH ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar proposta no PostgreSQL.' });
    }
  });

  // POST /api/proposals/:id/comments - Comentários com validação de tenant e SSE COMMENT_ADDED
  app.post('/api/proposals/:id/comments', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
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
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposta não encontrada neste tenant.' });
      }

      const comment = await prisma.comment.create({
        data: {
          tenantId,
          proposalId: id,
          userId: session.user.id,
          authorName: session.user.name,
          text: String(text).trim(),
        },
      });

      // Emissão PÓS-COMMIT
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'COMMENT_ADDED',
        entity: 'Comment',
        entityId: comment.id,
        userId: session.user.id,
      });

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
      const tenantId = session?.user?.tenantId;
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

      return res.json({ success: true, message: 'Proposta removida.' });
    } catch (err) {
      console.error('[API PROPOSALS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao remover proposta.' });
    }
  });

  // -------------------------------------------------------------
  // AUXILIARY ENTITIES (Banks, Promoters, Partners, Products)
  // -------------------------------------------------------------
  app.get('/api/banks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.user.tenantId;
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
      const tenantId = session.user.tenantId;
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
      const tenantId = session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const partners = await prisma.partner.findMany({
        where: { tenantId, deletedAt: null },
      });
      return res.json(partners);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar parceiros.' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.user.tenantId;
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
      const tenantId = session.user.tenantId;
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

  app.get('/api/notifications', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const userId = session.user.id;
      const notifications = await prisma.notification.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(notifications);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar notificações.' });
    }
  });

  // POST /api/notifications - Helper de criação com NOTIFICATION_CREATED pós-commit
  app.post('/api/notifications', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      const { targetUserId, title, message, linkUrl } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
      }

      const notification = await prisma.notification.create({
        data: {
          tenantId,
          userId: targetUserId || session.user.id,
          title,
          message,
          linkUrl: linkUrl || null,
        },
      });

      // Emissão pós-commit de NOTIFICATION_CREATED (seguro, sem dados sensíveis)
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'NOTIFICATION_CREATED',
        entity: 'Notification',
        entityId: notification.id,
        userId: notification.userId || undefined,
      });

      return res.json(notification);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar notificação.' });
    }
  });

  // -------------------------------------------------------------
  // TASKS API
  // -------------------------------------------------------------
  app.get('/api/tasks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
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
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id, title, description, category, priority, dueDate, completed, assignedToId } = req.body;
      if (!title) return res.status(400).json({ error: 'Título é obrigatório.' });
      const task = await prisma.task.create({
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
        },
      });

      // Emissão pós-commit de TASK_CREATED
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'TASK_CREATED',
        entity: 'Task',
        entityId: task.id,
        userId: session.user.id,
      });

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
      const { title, description, category, priority, dueDate, completed, assignedToId } = req.body;

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
      const tenantId = session?.user?.tenantId;
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
      const tenantId = session?.user?.tenantId;
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
      const tenantId = session?.user?.tenantId;
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

      return res.json({ success: true, id: docRecord.id });
    } catch (err: any) {
      console.error('[API /api/documents/:id DELETE] Error:', err?.message || err);
      return res.status(500).json({ error: 'Erro ao excluir o documento.' });
    }
  });

  // -------------------------------------------------------------
  // PARTNERS (POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.post('/api/partners', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id, name, code, promoterId, status, email, phone, document } = req.body;
      if (!name || !code) return res.status(400).json({ error: 'Nome e Código são obrigatórios.' });
      const partner = await prisma.partner.create({
        data: {
          id: id || undefined,
          tenantId,
          name,
          code,
          promoterId: promoterId || null,
          status: status || 'ATIVO',
          email: email || null,
          phone: phone || null,
          document: document || null,
        },
      });
      return res.json(partner);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar parceiro.' });
    }
  });

  app.put('/api/partners/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      const { name, code, promoterId, status, email, phone, document } = req.body;
      const partner = await prisma.partner.updateMany({
        where: { id, tenantId },
        data: {
          name,
          code,
          promoterId: promoterId !== undefined ? promoterId : undefined,
          status: status !== undefined ? status : undefined,
          email: email !== undefined ? email : undefined,
          phone: phone !== undefined ? phone : undefined,
          document: document !== undefined ? document : undefined,
        },
      });
      return res.json({ success: true, partner });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar parceiro.' });
    }
  });

  app.delete('/api/partners/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      const { id } = req.params;
      await prisma.partner.updateMany({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao remover parceiro.' });
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
  // AUDIT LOGS API (Read-only, Tenant-scoped, No deletes/updates)
  // -------------------------------------------------------------
  app.get('/api/audit-logs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      // RBAC check: Only GESTOR, MASTER, TENANT_ADMIN or PLATFORM_MASTER
      const allowed = ['GESTOR', 'MASTER', 'TENANT_ADMIN', 'PLATFORM_MASTER'];
      if (!allowed.includes(session.user.role)) {
        return res.status(403).json({ error: 'Acesso negado aos logs de auditoria.' });
      }

      const logs = await prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return res.json(logs);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
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

      const tenantId = session.user.tenantId;
      const whereCondition = isPlatformMaster
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

      const targetTenantId = isPlatformMaster && tenantId ? tenantId : session.user.tenantId;

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
          passwordHash: String(password).trim(),
          role: role || 'DIGITADOR',
          customPermissions: cleanPermissions,
          phone: phone || null,
          active: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: targetTenantId || null,
          userId: session.user.id,
          userName: session.user.name,
          action: 'USER_CREATED',
          entity: 'User',
          entityId: user.id,
          newData: JSON.stringify({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            customPermissions: user.customPermissions,
          }),
        },
      }).catch(() => {});

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

      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          name: name || undefined,
          active: active !== undefined ? Boolean(active) : undefined,
          role: role || undefined,
          customPermissions: Array.isArray(customPermissions) ? customPermissions : undefined,
          tenantId: finalTenantId,
          phone: phone !== undefined ? phone : undefined,
          passwordHash: password || undefined,
        },
      });

      for (const item of auditActions) {
        await prisma.auditLog.create({
          data: {
            tenantId: updatedUser.tenantId,
            userId: session.user.id,
            userName: session.user.name,
            action: item.action,
            entity: 'User',
            entityId: id,
            oldData: JSON.stringify({
              role: targetUser.role,
              customPermissions: targetUser.customPermissions,
              active: targetUser.active,
              tenantId: targetUser.tenantId,
            }),
            newData: JSON.stringify(item.details),
          },
        }).catch(() => {});
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

      await prisma.auditLog.create({
        data: {
          tenantId: targetUser.tenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'USER_DELETED',
          entity: 'User',
          entityId: id,
          oldData: JSON.stringify({ email: targetUser.email, name: targetUser.name, role: targetUser.role }),
        },
      }).catch(() => {});

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

  // 1. GET /api/saas/tenants (and alias /api/tenants)
  const getTenantsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const tenants = await prisma.tenant.findMany({
        where: { deletedAt: null },
        include: {
          whiteLabel: true,
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
  app.get('/api/tenants', getTenantsHandler);

  // 2. GET /api/saas/tenants/:id
  const getTenantByIdHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const { id } = req.params;
      const tenant = await prisma.tenant.findUnique({
        where: { id },
        include: {
          whiteLabel: true,
          _count: {
            select: {
              users: { where: { deletedAt: null } },
              proposals: { where: { deletedAt: null } },
              clients: { where: { deletedAt: null } },
            },
          },
        },
      });

      if (!tenant || tenant.deletedAt) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      return res.json(tenant);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao obter detalhes do tenant.' });
    }
  };
  app.get('/api/saas/tenants/:id', getTenantByIdHandler);

  // 3. POST /api/saas/tenants (and alias /api/tenants)
  const createTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
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
            maxUsers: Number(maxUsers) || 10,
            storageLimitMb: Number(storageLimitMb) || 5000,
            maxProposals: Number(maxProposals) || 10000,
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
            await tx.user.create({
              data: {
                tenantId: newTenant.id,
                name: String(adminName).trim(),
                email: cleanAdminEmail,
                passwordHash: 'Mudar@123', // Senha inicial temporária
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
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: session.user.id,
          userName: session.user.name,
          action: 'TENANT_CREATED',
          entity: 'Tenant',
          entityId: tenant.id,
          newData: JSON.stringify({
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            customDomain: tenant.customDomain,
            plan: tenant.plan,
          }),
        },
      }).catch(() => {});

      // Emissão SSE
      sseRegistry.broadcastToTenant(tenant.id, {
        type: 'TENANT_CREATED',
        entity: 'Tenant',
        entityId: tenant.id,
        userId: session.user.id,
      });

      return res.status(201).json(tenant);
    } catch (err: any) {
      console.error('[POST /api/saas/tenants ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao criar tenant.' });
    }
  };
  app.post('/api/saas/tenants', createTenantHandler);
  app.post('/api/tenants', createTenantHandler);

  // 4. PUT /api/saas/tenants/:id (and alias /api/tenants/:id)
  const updateTenantHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
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

      // Auditoria
      await prisma.auditLog.create({
        data: {
          tenantId: id,
          userId: session.user.id,
          userName: session.user.name,
          action: 'TENANT_UPDATED',
          entity: 'Tenant',
          entityId: id,
          oldData: JSON.stringify({
            name: currentTenant.name,
            slug: currentTenant.slug,
            customDomain: currentTenant.customDomain,
            status: currentTenant.status,
          }),
          newData: JSON.stringify({
            name: updatedTenant.name,
            slug: updatedTenant.slug,
            customDomain: updatedTenant.customDomain,
            status: updatedTenant.status,
          }),
        },
      }).catch(() => {});

      // Emissão SSE
      sseRegistry.broadcastToTenant(id, {
        type: 'TENANT_UPDATED',
        entity: 'Tenant',
        entityId: id,
        userId: session.user.id,
      });

      return res.json(updatedTenant);
    } catch (err: any) {
      console.error('[PUT /api/saas/tenants/:id ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao atualizar tenant.' });
    }
  };
  app.put('/api/saas/tenants/:id', updateTenantHandler);
  app.put('/api/tenants/:id', updateTenantHandler);

  // 5. POST /api/saas/tenants/:id/suspend - Suspensão imediata com expurgo de sessões e encerramento SSE
  app.post('/api/saas/tenants/:id/suspend', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
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

      // Notifica e desconecta todas as conexões SSE deste tenant imediatamente
      sseRegistry.broadcastToTenant(id, {
        type: 'TENANT_SUSPENDED',
        entity: 'Tenant',
        entityId: id,
        userId: session.user.id,
      });
      sseRegistry.disconnectTenant(id, 'TENANT_SUSPENDED');

      // Registro de Auditoria
      await prisma.auditLog.create({
        data: {
          tenantId: id,
          userId: session.user.id,
          userName: session.user.name,
          action: 'TENANT_SUSPENDED',
          entity: 'Tenant',
          entityId: id,
          newData: JSON.stringify({ status: 'SUSPENDED', revokedSessionsCount: deletedSessions.count }),
        },
      }).catch(() => {});

      return res.json({
        success: true,
        message: 'Tenant suspenso com sucesso. Todas as sessões e conexões foram encerradas.',
        tenant: updated,
      });
    } catch (err) {
      console.error('[POST /api/saas/tenants/:id/suspend ERROR]', err);
      return res.status(500).json({ error: 'Erro ao suspender tenant.' });
    }
  });

  // 6. POST /api/saas/tenants/:id/reactivate - Reativação
  app.post('/api/saas/tenants/:id/reactivate', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
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

      // Auditoria
      await prisma.auditLog.create({
        data: {
          tenantId: id,
          userId: session.user.id,
          userName: session.user.name,
          action: 'TENANT_REACTIVATED',
          entity: 'Tenant',
          entityId: id,
          newData: JSON.stringify({ status: 'ACTIVE' }),
        },
      }).catch(() => {});

      return res.json({
        success: true,
        message: 'Tenant reativado com sucesso.',
        tenant: updated,
      });
    } catch (err) {
      console.error('[POST /api/saas/tenants/:id/reactivate ERROR]', err);
      return res.status(500).json({ error: 'Erro ao reativar tenant.' });
    }
  });

  // 7. CONTEXT SWITCHING API (PLATFORM_MASTER Support/Admin Inspection)
  app.post('/api/saas/context-switch', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
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

      const contextData = AdminContextManager.setContext(
        session.id,
        targetTenant.id,
        targetTenant.name,
        session.user.id
      );

      // Auditoria obrigatória de início de contexto administrativo
      await prisma.auditLog.create({
        data: {
          tenantId: targetTenant.id,
          userId: session.user.id,
          userName: session.user.name,
          action: 'CONTEXT_SWITCH_STARTED',
          entity: 'Tenant',
          entityId: targetTenant.id,
          newData: JSON.stringify({
            platformMasterUserId: session.user.id,
            targetTenantId: targetTenant.id,
            targetTenantName: targetTenant.name,
            timestamp: contextData.switchedAt.toISOString(),
          }),
        },
      }).catch(() => {});

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
  });

  app.post('/api/saas/context-switch/exit', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const currentContext = AdminContextManager.getContext(session.id);
      AdminContextManager.clearContext(session.id);

      if (currentContext) {
        // Auditoria de encerramento de contexto
        await prisma.auditLog.create({
          data: {
            tenantId: currentContext.targetTenantId,
            userId: session.user.id,
            userName: session.user.name,
            action: 'CONTEXT_SWITCH_ENDED',
            entity: 'Tenant',
            entityId: currentContext.targetTenantId,
            newData: JSON.stringify({
              platformMasterUserId: session.user.id,
              targetTenantId: currentContext.targetTenantId,
              timestamp: new Date().toISOString(),
            }),
          },
        }).catch(() => {});
      }

      return res.json({
        success: true,
        message: 'Contexto administrativo encerrado. Retornado ao escopo global.',
      });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao sair do contexto administrativo.' });
    }
  });

  app.get('/api/saas/context-switch/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }

      const context = AdminContextManager.getContext(session.id);
      return res.json({ active: Boolean(context), context });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao obter status do contexto.' });
    }
  });

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
      if (!session || !session.user || !session.user.tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para iniciar importação.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'proposals.create')) {
        return res.status(403).json({ error: 'Você não tem permissão para importar propostas.' });
      }

      const tenantId = session.user.tenantId;
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
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId,
            action: 'IMPORT_REJECTED_ROW_LIMIT',
            entity: 'ImportJob',
            newData: JSON.stringify({
              type: 'PROPOSALS',
              fileName: cleanFileName,
              totalRecords: rows.length,
              maxAllowed: MAX_IMPORT_ROWS,
            }),
          },
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
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'IMPORT_STARTED',
          entity: 'ImportJob',
          entityId: job.id,
          newData: JSON.stringify({
            type: 'PROPOSALS',
            fileName: cleanFileName,
            totalRecords: rows.length,
          }),
        },
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
      if (!session || !session.user || !session.user.tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para atualizar status em lote.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'statuses.manage') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'proposals.update')) {
        return res.status(403).json({ error: 'Você não tem permissão para gerenciar status de propostas.' });
      }

      const tenantId = session.user.tenantId;
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
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId,
            action: 'IMPORT_REJECTED_ROW_LIMIT',
            entity: 'ImportJob',
            newData: JSON.stringify({
              type: 'STATUS_UPDATE',
              fileName: cleanFileName,
              totalRecords: rows.length,
              maxAllowed: MAX_IMPORT_ROWS,
            }),
          },
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

      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'IMPORT_STARTED',
          entity: 'ImportJob',
          entityId: job.id,
          newData: JSON.stringify({
            type: 'STATUS_UPDATE',
            fileName: cleanFileName,
            totalRecords: rows.length,
          }),
        },
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
      if (!session || !session.user || !session.user.tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para importar parceiros.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'partners.create')) {
        return res.status(403).json({ error: 'Você não tem permissão para cadastrar parceiros.' });
      }

      const tenantId = session.user.tenantId;
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
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId,
            action: 'IMPORT_REJECTED_ROW_LIMIT',
            entity: 'ImportJob',
            newData: JSON.stringify({
              type: 'PARTNERS',
              fileName: cleanFileName,
              totalRecords: rows.length,
              maxAllowed: MAX_IMPORT_ROWS,
            }),
          },
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
      if (!session || !session.user || !session.user.tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária.' });
      }

      const { id } = req.params;
      const tenantId = session.user.tenantId;
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
      if (!session || !session.user || !session.user.tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária.' });
      }

      const { id } = req.params;
      const tenantId = session.user.tenantId;
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

