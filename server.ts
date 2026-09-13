import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
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

const prisma = new PrismaClient();

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
        console.log(`[RBAC BOOTSTRAP] Perfil de ${masterEmail} sincronizado para PLATFORM_MASTER:`, updated.role);
      }
    } else {
      if (!masterPassword) {
        console.error(`[RBAC BOOTSTRAP CRITICAL] INITIAL_MASTER_PASSWORD não configurada no ambiente. Usuário master não criado.`);
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
      console.log(`[RBAC BOOTSTRAP] Usuario PLATFORM_MASTER criado com sucesso no PostgreSQL:`, {
        id: created.id,
        email: created.email,
        role: created.role,
        tenantId: created.tenantId,
      });
    }
  } catch (err) {
    console.warn('[RBAC BOOTSTRAP WARNING]', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust first proxy for Cloud Run/Vercel/Nginx reverse proxy IP extraction
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '20mb' }));
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
      console.warn(`[SECURITY ALERT] Rate limit de autenticação excedido para IP: ${req.ip}`);
      res.status(429).json(options.message);
    },
  });

  // Health and environment audit route
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasDirectUrl: Boolean(process.env.DIRECT_URL),
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION API ROUTES (Server-Side Authority)
  // -------------------------------------------------------------

  // 1. POST /api/auth/login - Rate limited
  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPassword = String(password).trim();

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

      // Tenant status check
      if (dbUser.tenant && dbUser.tenant.status === 'SUSPENDED') {
        return res.status(401).json({ message: 'Empresa com acesso suspenso temporariamente.' });
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
            userAgent: req.headers['user-agent'] || 'Unknown',
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
          await prisma.session.deleteMany({ where: { token } });
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

      if (!session.user.active || (session.user.tenant && session.user.tenant.status === 'SUSPENDED')) {
        await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        res.clearCookie('cg_session_id', { path: '/' });
        return res.status(401).json({ authenticated: false, message: 'Usuário desativado ou empresa suspensa.' });
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

      return res.json({ authenticated: true, user: safeUser });
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

  // Helper middleware/function for tenant context & session auth
  const getAuthSession = async (req: express.Request) => {
    const token = req.cookies.cg_session_id;
    if (!token) return null;
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { include: { tenant: true } } },
    });
    if (!session || session.expiresAt < new Date()) return null;
    if (!session.user.active || (session.user.tenant && session.user.tenant.status === 'SUSPENDED')) return null;
    return session;
  };

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
      const tenantId = session?.user?.tenantId;
      const whereCondition = tenantId ? { tenantId, deletedAt: null } : { deletedAt: null };
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
      const tenantId = session?.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Sessão e Tenant ativos são necessários para cadastrar cliente.' });
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
      const tenantId = session?.user?.tenantId;
      const whereCondition = tenantId ? { tenantId } : {};
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
      const tenantId = session?.user?.tenantId;
      const banks = await prisma.bank.findMany({
        where: tenantId ? { tenantId } : {},
      });
      return res.json(banks);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar bancos.' });
    }
  });

  app.get('/api/promoters', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      const promoters = await prisma.promoter.findMany({
        where: tenantId ? { tenantId } : {},
      });
      return res.json(promoters);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar promotoras.' });
    }
  });

  app.get('/api/partners', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      const partners = await prisma.partner.findMany({
        where: tenantId ? { tenantId, deletedAt: null } : { deletedAt: null },
      });
      return res.json(partners);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar parceiros.' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      const products = await prisma.product.findMany({
        where: tenantId ? { tenantId } : {},
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
      const tenantId = session?.user?.tenantId;
      const entries = await prisma.financialEntry.findMany({
        where: tenantId ? { tenantId } : {},
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
      const tenantId = session?.user?.tenantId;
      const userId = session?.user?.id;
      const notifications = await prisma.notification.findMany({
        where: tenantId ? { tenantId, userId } : {},
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
  app.get('/api/documents', async (req, res) => {
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
  app.post('/api/documents', async (req, res) => {
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
  app.get('/api/documents/:id', async (req, res) => {
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
  app.delete('/api/documents/:id', async (req, res) => {
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
      const tenantId = session?.user?.tenantId;
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
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });
      
      // RBAC Check: Only TENANT_ADMIN or higher
      if (session.user.role !== 'TENANT_ADMIN' && session.user.role !== 'MASTER' && session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Permissão negada para alterar White Label.' });
      }

      const { companyName, legalName, logoUrl, faviconUrl, primaryColor, secondaryColor, accentColor, supportEmail, themeMode } = req.body;
      if (!companyName) return res.status(400).json({ error: 'Nome da Empresa é obrigatório.' });

      const config = await prisma.whiteLabelConfig.upsert({
        where: { tenantId },
        update: {
          companyName,
          legalName: legalName || null,
          logoUrl: logoUrl || null,
          faviconUrl: faviconUrl || null,
          primaryColor: primaryColor || '#2563eb',
          secondaryColor: secondaryColor || '#1e40af',
          accentColor: accentColor || '#3b82f6',
          supportEmail: supportEmail || null,
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
          themeMode: themeMode || 'LIGHT',
        },
      });
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
  // TENANTS MANAGEMENT (PLATFORM MASTER ONLY)
  // -------------------------------------------------------------
  app.get('/api/tenants', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (session?.user?.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }
      const list = await prisma.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(list);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao buscar tenants.' });
    }
  });

  app.post('/api/tenants', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (session?.user?.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }
      const { id, name, slug, cnpj, tradeName, plan, status } = req.body;
      if (!name || !slug) {
        return res.status(400).json({ error: 'Nome e Slug são obrigatórios.' });
      }
      const tenant = await prisma.tenant.create({
        data: {
          id: id || undefined,
          name,
          slug: String(slug).trim().toLowerCase(),
          cnpj: cnpj || null,
          tradeName: tradeName || null,
          plan: plan || 'PRO',
          status: status || 'ACTIVE',
        },
      });

      // Emissão para o próprio tenant recém-criado
      sseRegistry.broadcastToTenant(tenant.id, {
        type: 'TENANT_UPDATED',
        entity: 'Tenant',
        entityId: tenant.id,
        userId: session.user.id,
      });

      return res.json(tenant);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao criar tenant.' });
    }
  });

  app.put('/api/tenants/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (session?.user?.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Acesso restrito para PLATFORM_MASTER.' });
      }
      const { id } = req.params;
      const { name, slug, cnpj, tradeName, plan, status } = req.body;
      const tenant = await prisma.tenant.update({
        where: { id },
        data: {
          name: name || undefined,
          slug: slug ? String(slug).trim().toLowerCase() : undefined,
          cnpj: cnpj !== undefined ? cnpj : undefined,
          tradeName: tradeName !== undefined ? tradeName : undefined,
          plan: plan || undefined,
          status: status || undefined,
        },
      });

      // Emissão pós-commit de TENANT_UPDATED
      sseRegistry.broadcastToTenant(id, {
        type: 'TENANT_UPDATED',
        entity: 'Tenant',
        entityId: tenant.id,
        userId: session.user.id,
      });

      return res.json(tenant);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar tenant.' });
    }
  });

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

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Sentinel Consig server running on http://localhost:${PORT}`);
    await auditAndEnsureMasterUser();
  });
}

startServer();

