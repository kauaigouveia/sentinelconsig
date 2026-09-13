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

const prisma = new PrismaClient();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust first proxy for Cloud Run/Vercel/Nginx reverse proxy IP extraction
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '20mb' }));
  app.use(cookieParser());

  // Rate Limiter for Authentication Endpoints (Brute Force Guard)
  // 5 login attempts per IP every 15 minutes
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: 'Muitas tentativas de login a partir deste IP. Tente novamente após 15 minutes.',
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
        console.warn('[AUTH] Falha ou banco não migrado no Prisma:', err);
      }

      if (dbUser) {
        // User status check
        if (!dbUser.active) {
          return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
        }

        // Tenant status check
        if (dbUser.tenant && dbUser.tenant.status === 'SUSPENDED') {
          return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
        }

        // Password hash check
        if (dbUser.passwordHash !== cleanPassword && !dbUser.passwordHash.includes(cleanPassword)) {
          return res.status(401).json({ message: 'Credenciais inválidas ou acesso desativado.' });
        }
      }

      // Safe user output object (NO PASSWORDS, NO HASHES)
      const safeUser = dbUser
        ? {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            active: dbUser.active,
            tenantId: dbUser.tenantId || undefined,
            mustChangePassword: dbUser.mustChangePassword,
            createdAt: dbUser.createdAt.toISOString(),
            updatedAt: dbUser.updatedAt.toISOString(),
          }
        : {
            id: `u-${cleanEmail.replace(/[^a-z0-9]/g, '')}`,
            name: cleanEmail.split('@')[0].toUpperCase(),
            email: cleanEmail,
            role: cleanEmail.includes('master') ? 'PLATFORM_MASTER' : 'DIGITADOR',
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

      // Create Server Session
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      if (dbUser) {
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
        }
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

      await prisma.client.updateMany({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
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

      return res.json(proposal);
    } catch (err) {
      console.error('[API PROPOSALS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar proposta no PostgreSQL.' });
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

      await prisma.proposal.deleteMany({
        where: { id, tenantId },
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
      const task = await prisma.task.updateMany({
        where: { id, tenantId },
        data: {
          title,
          description: description !== undefined ? description : undefined,
          category: category !== undefined ? category : undefined,
          priority: priority !== undefined ? priority : undefined,
          dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
          completed: completed !== undefined ? Boolean(completed) : undefined,
          assignedToId: assignedToId !== undefined ? assignedToId : undefined,
        },
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
      await prisma.task.deleteMany({
        where: { id, tenantId },
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
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      // Only Admin or Master can see list of users
      const allowed = ['TENANT_ADMIN', 'MASTER', 'PLATFORM_MASTER'];
      if (!allowed.includes(session.user.role)) {
        return res.status(403).json({ error: 'Permissão negada para listar usuários.' });
      }

      const users = await prisma.user.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { name: 'asc' },
      });
      // Safety clean (remove passwordHash)
      const cleanUsers = users.map(u => {
        const { passwordHash, ...rest } = u;
        return rest;
      });
      return res.json(cleanUsers);
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao listar usuários.' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      // RBAC check
      if (session.user.role !== 'TENANT_ADMIN' && session.user.role !== 'MASTER' && session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Permissão negada para cadastrar usuário.' });
      }

      const { id, name, email, password, role, phone } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, E-mail e Senha são obrigatórios.' });
      }

      // Block privileged role escalation
      const allowedRoles = ['DIGITADOR', 'SIMULACAO', 'SUPORTE', 'GERENTE', 'GESTOR'];
      if (session.user.role === 'PLATFORM_MASTER' || session.user.role === 'TENANT_ADMIN') {
        allowedRoles.push('TENANT_ADMIN');
      }
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Papel de usuário (role) inválido ou privilégio excessivo.' });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ error: 'E-mail já está em uso.' });
      }

      const user = await prisma.user.create({
        data: {
          id: id || undefined,
          tenantId,
          name,
          email: String(email).trim().toLowerCase(),
          passwordHash: password, // simple hash or plain for staging as audited
          role: role || 'DIGITADOR',
          phone: phone || null,
          active: true,
        },
      });

      const { passwordHash, ...safeCreatedUser } = user;
      return res.json(safeCreatedUser);
    } catch (err) {
      console.error('[POST /api/users]', err);
      return res.status(500).json({ error: 'Erro ao criar usuário.' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Não autenticado.' });

      const { id } = req.params;
      const { name, active, role, phone, password } = req.body;

      // Access Check: self update OR admin update
      const isSelf = id === session.user.id;
      const isAdmin = session.user.role === 'TENANT_ADMIN' || session.user.role === 'MASTER' || session.user.role === 'PLATFORM_MASTER';

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ error: 'Não autorizado.' });
      }

      // Guard Master protection
      const targetUser = await prisma.user.findFirst({ where: { id, tenantId } });
      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      if (targetUser.isMasterProtected && !isSelf && session.user.role !== 'PLATFORM_MASTER') {
        return res.status(403).json({ error: 'Este usuário está protegido e não pode ser editado.' });
      }

      // Roles checks
      let finalRole = undefined;
      if (role !== undefined && isAdmin && !isSelf) {
        const allowedRoles = ['DIGITADOR', 'SIMULACAO', 'SUPORTE', 'GERENTE', 'GESTOR', 'TENANT_ADMIN'];
        if (allowedRoles.includes(role)) {
          finalRole = role;
        }
      }

      const user = await prisma.user.updateMany({
        where: { id, tenantId },
        data: {
          name: name || undefined,
          active: active !== undefined ? Boolean(active) : undefined,
          role: finalRole,
          phone: phone !== undefined ? phone : undefined,
          passwordHash: password || undefined,
        },
      });

      return res.json({ success: true, user });
    } catch (err) {
      return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sentinel Consig server running on http://localhost:${PORT}`);
  });
}

startServer();

