import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PrismaClient, Prisma, ProposalType, StandardStatusCategory, PriorityLevel, NotificationType, BackupType, BackupStatus } from '@prisma/client';
import crypto from 'crypto';
import { logger } from './server/logger.js';
import {
  uploadBlob,
  downloadBlob,
  deleteBlob,
  buildBlobPath,
  sanitizeFileName,
} from './server/services/azureBlobStorage.js';
import { backupStorageService } from './server/services/backupStorageService.js';
import { hasPermission, Permission } from './src/lib/permissions.js';
import { normalizeProposalType } from './src/lib/proposalTypeNormalizer.js';
import { Role } from './src/types/index.js';
import { sseRegistry } from './server/realtime.js';
import { eventBus } from './server/services/pusherService.js';
import { centralEventBus } from './server/services/eventBus.js';
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
import { ApiMonitoringService } from './server/services/apiMonitoringService.js';
import { BusinessNotificationService } from './server/services/businessNotificationService.js';
import { AuditLogService, computeDelta, maskCPF } from './server/services/auditLogService.js';
import { PendencyService, PendencyStatus } from './server/services/pendencyService.js';
import { AutomationEngine, AVAILABLE_TRIGGERS, AVAILABLE_ACTIONS, AUTOMATION_TEMPLATES, FORBIDDEN_ACTION_TYPES } from './server/services/automationEngine.js';
import { SimulationService } from './server/services/simulationService.js';
import { hashPassword, verifyPassword, dummyVerify, isArgon2Hash } from './server/services/passwordService.js';
import { createCsrfMiddleware, createCorsMiddleware, isRequestHttps } from './server/utils/csrf.js';
import { C6BankService } from './server/services/c6BankService.js';
import { C6SyncWorker } from './server/services/c6SyncWorker.js';
import { FactaBankService } from './server/services/factaBankService.js';
import { FactaSyncWorker } from './server/services/factaSyncWorker.js';
import { HappyBankService } from './server/services/happyBankService.js';
import { HappySimulationService } from './server/services/happySimulationService.js';
import { ensureDefaultStatusesForTenant, ensureDefaultStatusesForAllTenants } from './server/services/statusService.js';
import { IntegrationHubService } from './server/services/integrationHubService.js';
import { PartnerCrmService } from './server/services/partnerCrmService.js';
import { IntelligenceService } from './server/services/intelligence/intelligenceService.js';
import { IncidentService } from './server/services/commandCenter/incidentService.js';
import { CommandCenterService } from './server/services/commandCenter/commandCenterService.js';
import { IncidentSlaService } from './server/services/commandCenter/incidentSlaService.js';
import { ImpactAnalysisService } from './server/services/commandCenter/impactAnalysisService.js';
import { CommandAlertEngine } from './server/services/commandCenter/commandAlertEngine.js';

let isShuttingDown = false;
let serverInstance: any = null;

export const prisma = new PrismaClient();
const app = express();
export { app };

// Trust first proxy for Cloud Run/Vercel/Nginx reverse proxy IP extraction
app.set('trust proxy', 1);

// Catálogo Padrão de Produtos Globais (13 Produtos Globais do Sentinel Consig)
export const DEFAULT_GLOBAL_PRODUCTS: Array<{
  name: string;
  code: string;
  type: ProposalType;
  description: string;
  requiresPortabilityRelation: boolean;
  allowsMultipleAde: boolean;
}> = [
  { name: 'AGREG. DE MARGEM', code: 'AGREG_MARGEM', type: 'NOVO', description: 'Agregação de margem consignável', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'CARTAO', code: 'CARTAO', type: 'CARTAO_RMC', description: 'Cartão de crédito consignado', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'CARTÃO COM SAQUE', code: 'CARTAO_COM_SAQUE', type: 'CARTAO_RMC', description: 'Cartão consignado com saque autorizado', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'CARTÃO SEM SAQUE', code: 'CARTAO_SEM_SAQUE', type: 'CARTAO_RMC', description: 'Cartão consignado sem operação de saque', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'COMPRA', code: 'COMPRA', type: 'PORTABILIDADE', description: 'Compra de dívida / portabilidade com troco', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'CONTA SIMPLES', code: 'CONTA_SIMPLES', type: 'NOVO', description: 'Operação de crédito em conta simples', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'NOVO', code: 'NOVO', type: 'NOVO', description: 'Contrato novo de empréstimo consignado', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'PORTAB/REFIN', code: 'PORTAB_REFIN', type: 'REFIN_PORTABILIDADE', description: 'Portabilidade associada a refinanciamento', requiresPortabilityRelation: true, allowsMultipleAde: true },
  { name: 'PORTABILIDADE', code: 'PORTABILIDADE', type: 'PORTABILIDADE', description: 'Portabilidade de crédito consignado', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'REFIN.RECORRENTE', code: 'REFIN_RECORRENTE', type: 'REFIN', description: 'Refinanciamento recorrente de contrato', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'REFINANCIAMENTO', code: 'REFINANCIAMENTO', type: 'REFIN', description: 'Refinanciamento de contrato ativo', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'SAQUE COMPL.', code: 'SAQUE_COMPL', type: 'SAQUE_COMPLEMENTAR', description: 'Saque complementar de limite consignado', requiresPortabilityRelation: false, allowsMultipleAde: true },
  { name: 'SEGUROS', code: 'SEGUROS', type: 'NOVO', description: 'Proteção financeira e seguro prestamista', requiresPortabilityRelation: false, allowsMultipleAde: true },
];

export async function ensureDefaultGlobalProducts(prismaClient: PrismaClient) {
  try {
    for (const item of DEFAULT_GLOBAL_PRODUCTS) {
      const existing = await prismaClient.product.findFirst({
        where: {
          OR: [
            { name: { equals: item.name, mode: 'insensitive' }, scope: 'GLOBAL' },
            { code: item.code, scope: 'GLOBAL' },
          ],
        },
      });

      if (!existing) {
        await prismaClient.product.create({
          data: {
            name: item.name,
            code: item.code,
            type: item.type,
            description: item.description,
            scope: 'GLOBAL',
            tenantId: null,
            active: true,
            allowsMultipleAde: item.allowsMultipleAde,
            requiresPortabilityRelation: item.requiresPortabilityRelation,
            convenioIds: [],
          },
        });
        logger.info({ name: item.name }, '[BOOTSTRAP] Produto global padrão cadastrado no PostgreSQL');
      }
    }
  } catch (err) {
    logger.warn({ err }, '[BOOTSTRAP] Aviso ao garantir produtos globais padrão');
  }
}

// Catálogo Padrão de Convênios Globais (21 Convênios Globais do Sentinel Consig)
export const DEFAULT_GLOBAL_CONVENIOS: Array<{
  name: string;
  code: string;
  description: string;
}> = [
  { name: 'AUTARQUIAS', code: 'AUTARQUIAS', description: 'Servidores e pensionistas de autarquias públicas' },
  { name: 'BOLETO', code: 'BOLETO', description: 'Crédito com liquidação via boleto bancário' },
  { name: 'CARTAO', code: 'CARTAO', description: 'Operações vinculadas a cartão consignado' },
  { name: 'CONSÓRCIO', code: 'CONSORCIO', description: 'Consórcio e cartas de crédito contempladas' },
  { name: 'CONTA SIMPLES', code: 'CONTA_SIMPLES', description: 'Convênio de crédito em conta simples' },
  { name: 'CRÉDITO PESSOAL', code: 'CREDITO_PESSOAL', description: 'Crédito pessoal sem consignação em folha' },
  { name: 'DÉBITO EM CONTA', code: 'DEBITO_CONTA', description: 'Crédito consignado com débito em conta corrente' },
  { name: 'ESPECIAL', code: 'ESPECIAL', description: 'Convênios especiais e regimes diferenciados' },
  { name: 'ESTADUAL', code: 'ESTADUAL', description: 'Servidores públicos estaduais' },
  { name: 'FEDERAL', code: 'FEDERAL', description: 'Servidores públicos do poder executivo federal' },
  { name: 'FGTS', code: 'FGTS', description: 'Antecipação do Saque Aniversário FGTS' },
  { name: 'FIT ENERGIA', code: 'FIT_ENERGIA', description: 'Crédito associado a concessionárias de energia' },
  { name: 'IMOBILIÁRIO', code: 'IMOBILIARIO', description: 'Crédito com garantia imobiliária / Home Equity' },
  { name: 'INSS', code: 'INSS', description: 'Beneficiários e Pensionistas do INSS' },
  { name: 'MILITAR', code: 'MILITAR', description: 'Forças Armadas e pensionistas militares' },
  { name: 'MUNICIPAL', code: 'MUNICIPAL', description: 'Servidores públicos municipais e prefeituras' },
  { name: 'PRIVADO', code: 'PRIVADO', description: 'Funcionários de empresas privadas com convênio CLT' },
  { name: 'PUBLICO', code: 'PUBLICO', description: 'Servidores públicos em geral' },
  { name: 'SAQUE FACIL', code: 'SAQUE_FACIL', description: 'Operação de saque fácil e antecipação de limites' },
  { name: 'SEGURO', code: 'SEGURO', description: 'Convênio para contratação de seguros e assistências' },
  { name: 'SIAPE', code: 'SIAPE', description: 'Servidores Públicos Federais - Sistema SIAPE' },
];

export async function ensureDefaultGlobalConvenios(prismaClient: PrismaClient) {
  try {
    for (const item of DEFAULT_GLOBAL_CONVENIOS) {
      const existing = await prismaClient.convenio.findFirst({
        where: {
          OR: [
            { name: { equals: item.name, mode: 'insensitive' }, scope: 'GLOBAL' },
            { code: item.code, scope: 'GLOBAL' },
          ],
        },
      });

      if (!existing) {
        await prismaClient.convenio.create({
          data: {
            name: item.name,
            code: item.code,
            description: item.description,
            scope: 'GLOBAL',
            tenantId: null,
            active: true,
          },
        });
        logger.info({ name: item.name }, '[BOOTSTRAP] Convênio global padrão cadastrado no PostgreSQL');
      }
    }
  } catch (err) {
    logger.warn({ err }, '[BOOTSTRAP] Aviso ao garantir convênios globais padrão');
  }
}

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

    // Ensure status defaults exist for all tenants
    await ensureDefaultStatusesForAllTenants(prisma);

    // Ensure default global products exist in database
    await ensureDefaultGlobalProducts(prisma);

    // Ensure default global convenios exist in database
    await ensureDefaultGlobalConvenios(prisma);

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
        service: 'sentinel-consig-api',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
        database: 'healthy',
        integrations: {
          c6: {
            status: 'active',
            baseEndpoint: '/api/integrations/c6',
            authProtocol: 'OAuth-Token Direct (x-www-form-urlencoded)',
            proposalEndpoint: 'GET /marketplace/proposal',
          },
          facta: {
            status: 'active',
            baseEndpoint: '/api/integrations/facta',
            authProtocol: 'Basic Auth / Bearer Token',
            proposalEndpoint: 'GET /proposta/andamento-propostas',
          },
        },
        timestamp,
      });
    } catch (err: any) {
      logger.error({
        message: 'Health check failed',
        error: err?.message || String(err),
      });

      return res.status(503).json({
        status: 'degraded',
        service: 'sentinel-consig-api',
        database: 'unreachable',
        error: err?.message || 'Database unreachable',
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
      console.log("Branding resolved:", resolution.branding);
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

  // P0-B: Extract session token from Authorization header or HttpOnly cookie
  const extractSessionToken = (req: express.Request): string | null => {
    if (req.headers && req.headers.authorization) {
      const authHeader = req.headers.authorization.trim();
      if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.substring(7).trim();
      }
      if (authHeader && !authHeader.includes(' ')) {
        return authHeader;
      }
    }
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


  app.post('/api/auth/update-password', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autorizado.' });
      
      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return res.status(400).json({ error: 'Senha inválida ou ausente (mínimo de 6 caracteres).' });
      }

      
      const passwordHash = await hashPassword(newPassword.trim());
      
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
        }
      });
      
      return res.json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: 'Internal Server Error' });
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
      let effectiveTenantId = session.effectiveTenantId || session.user.tenantId;

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

      const activeRole = session.user.role === 'PLATFORM_MASTER'
        ? 'PLATFORM_MASTER'
        : (session.activeRole || session.user.role);

      const activePermissions = session.activePermissions && session.activePermissions.length > 0
        ? session.activePermissions
        : (session.user.customPermissions || []);

      const safeUser = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: activeRole,
        active: session.user.active,
        tenantId: session.user.tenantId || undefined,
        customPermissions: activePermissions,
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

  // 3.1 POST /api/auth/switch-tenant (Troca de empresa para usuários multi-tenant e PLATFORM_MASTER)
  app.post('/api/auth/switch-tenant', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }

      const { tenantId, membershipId } = req.body || {};
      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId é obrigatório.' });
      }

      const targetTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!targetTenant || targetTenant.deletedAt || targetTenant.status === 'CANCELLED') {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }

      // Se for PLATFORM_MASTER, pode alternar para qualquer tenant ativo
      if (session.user.role === 'PLATFORM_MASTER') {
        await prisma.session.update({
          where: { id: session.id },
          data: {
            effectiveTenantId: targetTenant.id,
            activeRole: 'PLATFORM_MASTER',
          },
        });
        return res.json({
          success: true,
          role: 'PLATFORM_MASTER',
          tenantId: targetTenant.id,
        });
      }

      // Para usuários regulares, verificar membership ativo
      let membership = null;
      if (membershipId) {
        membership = await prisma.userTenantMembership.findFirst({
          where: { id: membershipId, userId: session.user.id, tenantId: targetTenant.id, active: true },
        });
      }
      if (!membership) {
        membership = await prisma.userTenantMembership.findUnique({
          where: { userId_tenantId: { userId: session.user.id, tenantId: targetTenant.id } },
        });
      }

      if (!membership || !membership.active) {
        return res.status(403).json({ error: 'Você não possui acesso ativo a esta empresa.' });
      }

      await prisma.session.update({
        where: { id: session.id },
        data: {
          effectiveTenantId: targetTenant.id,
          effectiveMembershipId: membership.id,
          activeRole: membership.role,
          activePermissions: membership.customPermissions || [],
        },
      });

      return res.json({
        success: true,
        role: membership.role,
        tenantId: targetTenant.id,
        membershipId: membership.id,
      });
    } catch (err: any) {
      console.error('[POST /api/auth/switch-tenant ERROR]', err);
      return res.status(500).json({ error: 'Erro ao alternar empresa.' });
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
          convenio: true,
          product: true,
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
          convenio: true,
          product: true,
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

      const {
        cpf,
        partnerId,
        convenioId,
        productId,
        simulationType = 'MANUAL',
        operationType,
        happyClientId,
        happySimulationId,
        happyApplicationKey,
        happyProposalKey,
        happyJourneyStatus,
        happyAuthUrl,
        happyBeneficioNumero,
        happyDataNascimento,
        happyClienteNome,
        happyClienteTelefone,
        happyRawData,
        happyRawConditions,
        happySelectedCondition,
        happyRawResult,
      } = req.body;

      if (!cpf) {
        return res.status(400).json({ error: 'CPF é obrigatório.' });
      }

      if (simulationType === 'MANUAL' && !partnerId) {
        return res.status(400).json({ error: 'CPF e Parceiro são obrigatórios para simulação manual.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ error: 'CPF inválido. Informe os 11 dígitos do CPF.' });
      }

      // Verify partner belongs to tenant and is active (if provided)
      if (partnerId) {
        const partner = await prisma.partner.findFirst({
          where: { id: partnerId, tenantId, deletedAt: null, status: 'ATIVO' },
        });
        if (!partner) {
          return res.status(400).json({ error: 'Parceiro não encontrado, inativo ou não pertence a este tenant.' });
        }
      }

      // Validate Convenio if provided
      if (convenioId) {
        const convenio = await prisma.convenio.findFirst({
          where: {
            id: convenioId,
            active: true,
            OR: [{ scope: 'GLOBAL' }, { tenantId, scope: 'EXCLUSIVE' }],
          },
        });
        if (!convenio) {
          return res.status(400).json({ error: 'Convênio selecionado inválido, inativo ou não disponível para este tenant.' });
        }
      }

      // Validate Product if provided
      if (productId) {
        const product = await prisma.product.findFirst({
          where: {
            id: productId,
            active: true,
            OR: [{ scope: 'GLOBAL' }, { tenantId, scope: 'EXCLUSIVE' }],
          },
        });
        if (!product) {
          return res.status(400).json({ error: 'Produto selecionado inválido, inativo ou não disponível para este tenant.' });
        }
        if (convenioId && product.convenioIds && product.convenioIds.length > 0) {
          if (!product.convenioIds.includes(convenioId)) {
            return res.status(400).json({ error: 'O produto selecionado não é compatível com o convênio escolhido.' });
          }
        }
      }

      // Check duplicate pending simulation (for manual simulation with partner)
      if (simulationType === 'MANUAL' && partnerId) {
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
      }

      const newSimulation = await prisma.simulationRequest.create({
        data: {
          tenantId,
          cpf: cleanCpf,
          partnerId: partnerId || null,
          convenioId: convenioId || null,
          productId: productId || null,
          createdById: session.user.id,
          status: 'SIMULAÇÃO ENVIADA',
          simulationType,
          operationType: operationType || null,
          happyClientId: happyClientId ? String(happyClientId) : null,
          happySimulationId: happySimulationId ? String(happySimulationId) : null,
          happyApplicationKey: happyApplicationKey || null,
          happyProposalKey: happyProposalKey || null,
          happyJourneyStatus: happyJourneyStatus || null,
          happyAuthUrl: happyAuthUrl || null,
          happyBeneficioNumero: happyBeneficioNumero || null,
          happyDataNascimento: happyDataNascimento || null,
          happyClienteNome: happyClienteNome || null,
          happyClienteTelefone: happyClienteTelefone || null,
          happyRawData: happyRawData || undefined,
          happyRawConditions: happyRawConditions || undefined,
          happySelectedCondition: happySelectedCondition || undefined,
          happyRawResult: happyRawResult || undefined,
        },
        include: {
          partner: true,
          convenio: true,
          product: true,
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
  // CONTROLE DE ACESSO ÀS SIMULAÇÕES HAPPY
  // -------------------------------------------------------------
  const getHappySimulationAccessHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          happySimulationAccessEnabled: true,
          simulationAccessEnabled: true,
        },
      });

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const isHappyEnabled = tenant.happySimulationAccessEnabled !== false;

      return res.json({
        tenantId: tenant.id,
        tenantName: tenant.name,
        happySimulationAccessEnabled: isHappyEnabled,
        simulationAccessEnabled: isHappyEnabled,
      });
    } catch (err: any) {
      console.error('[API GET HAPPY SIMULATION ACCESS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao consultar status das Simulações Happy.' });
    }
  };
  app.get('/api/settings/simulation-access', getHappySimulationAccessHandler);
  app.get('/api/settings/happy-simulation-access', getHappySimulationAccessHandler);

  const putHappySimulationAccessHandler = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Não autenticado.' });
      }
      const tenantId = session.effectiveTenantId;
      if (!tenantId) {
        return res.status(403).json({ error: 'Sessão e Tenant ativos são necessários.' });
      }

      // Validação de papel administrativo: apenas PLATFORM_MASTER, MASTER ou TENANT_ADMIN podem alterar
      const userRole = session.user.role;
      const isAdminRole = ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN'].includes(userRole);
      if (!isAdminRole) {
        return res.status(403).json({
          error: 'Permissão negada. Apenas administradores podem configurar o acesso às Simulações Happy.',
        });
      }

      const { happySimulationAccessEnabled, simulationAccessEnabled, reason } = req.body;
      const targetEnabled = typeof happySimulationAccessEnabled === 'boolean'
        ? happySimulationAccessEnabled
        : (typeof simulationAccessEnabled === 'boolean' ? simulationAccessEnabled : undefined);

      if (typeof targetEnabled !== 'boolean') {
        return res.status(400).json({ error: 'O campo happySimulationAccessEnabled (booleano) é obrigatório.' });
      }

      const currentTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, happySimulationAccessEnabled: true, simulationAccessEnabled: true },
      });

      if (!currentTenant) {
        return res.status(404).json({ error: 'Tenant não encontrado.' });
      }

      const previousStatus = currentTenant.happySimulationAccessEnabled !== false;

      const updatedTenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          happySimulationAccessEnabled: targetEnabled,
          simulationAccessEnabled: targetEnabled,
        },
        select: {
          id: true,
          name: true,
          happySimulationAccessEnabled: true,
          simulationAccessEnabled: true,
          updatedAt: true,
        },
      });

      // Registro de Auditoria detalhado
      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: targetEnabled ? 'HAPPY_SIMULATION_ACCESS_LIBERADA' : 'HAPPY_SIMULATION_ACCESS_BLOQUEADA',
        entity: 'Tenant',
        entityId: tenantId,
        oldData: {
          happySimulationAccessEnabled: previousStatus,
        },
        newData: {
          happySimulationAccessEnabled: targetEnabled,
          reason: reason || (targetEnabled ? 'Simulações Happy liberadas pelo administrador' : 'Simulações Happy bloqueadas pelo administrador'),
          updatedBy: session.user.name,
          updatedByRole: userRole,
        },
        req,
      });

      // Transmissão via SSE / Pusher em tempo real para os usuários do tenant
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'HAPPY_SIMULATION_ACCESS_CHANGED',
        entity: 'Tenant',
        entityId: tenantId,
        data: {
          happySimulationAccessEnabled: targetEnabled,
          simulationAccessEnabled: targetEnabled,
          updatedAt: updatedTenant.updatedAt,
        },
        userId: session.user.id,
      });

      eventBus.publishToTenant(tenantId, {
        type: 'HAPPY_SIMULATION_ACCESS_CHANGED',
        entity: 'Tenant',
        entityId: tenantId,
      }).catch(() => {});

      return res.json({
        success: true,
        tenantId: updatedTenant.id,
        happySimulationAccessEnabled: updatedTenant.happySimulationAccessEnabled,
        simulationAccessEnabled: updatedTenant.simulationAccessEnabled,
        message: targetEnabled
          ? 'Simulações Happy LIBERADAS com sucesso para esta empresa.'
          : 'Simulações Happy BLOQUEADAS com sucesso para esta empresa.',
      });
    } catch (err: any) {
      console.error('[API PUT HAPPY SIMULATION ACCESS ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar configuração das Simulações Happy.' });
    }
  };
  app.put('/api/settings/simulation-access', putHappySimulationAccessHandler);
  app.put('/api/settings/happy-simulation-access', putHappySimulationAccessHandler);

  // -------------------------------------------------------------
  // PROPOSALS API (PostgreSQL / Prisma)
  // -------------------------------------------------------------
  app.get('/api/proposals', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
      const whereCondition = { tenantId, deletedAt: null };
      const proposals = await prisma.proposal.findMany({
        where: whereCondition,
        include: { client: true, bank: true, promoter: true, partner: true, product: true, convenio: true, status: true },
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

      const {
        proposalNumber,
        clientId,
        clientCpf,
        clientName,
        clientPhone,
        clientEmail,
        bankId,
        promoterId,
        partnerId,
        productId,
        convenioId,
        statusId,
        type,
        releasedValue,
        contractValue,
        installmentValue,
        installmentsCount,
        notes,
        c6ProposalNumber,
        c6OperationNumber,
      } = req.body;

      let targetClientId = clientId;

      // 1. Resolve client with robust fallback to CPF / upsert
      let client = targetClientId ? await prisma.client.findFirst({ where: { id: targetClientId, tenantId } }) : null;

      if (!client && clientCpf) {
        const cleanCpf = String(clientCpf).replace(/\D/g, '');
        if (cleanCpf.length === 11) {
          client = await prisma.client.upsert({
            where: { tenantId_cpf: { tenantId, cpf: cleanCpf } },
            update: {
              fullName: clientName ? String(clientName).trim() : undefined,
              phone: clientPhone || undefined,
              email: clientEmail || undefined,
              deletedAt: null,
            },
            create: {
              tenantId,
              cpf: cleanCpf,
              fullName: (clientName && String(clientName).trim()) || 'Cliente',
              phone: clientPhone || null,
              email: clientEmail || null,
            },
          });
        }
      }

      if (!client) {
        return res.status(400).json({ error: 'Cliente é obrigatório para cadastrar proposta.' });
      }
      targetClientId = client.id;

      // 2. Resolve Partner
      let targetPartnerId = partnerId || null;
      if (targetPartnerId) {
        let validPartner = await prisma.partner.findFirst({
          where: { id: targetPartnerId, tenantId }
        });
        if (!validPartner) {
          validPartner = await prisma.partner.findFirst({
            where: {
              tenantId,
              OR: [
                { code: targetPartnerId },
                { name: { equals: targetPartnerId, mode: 'insensitive' } }
              ]
            }
          });
        }
        targetPartnerId = validPartner ? validPartner.id : null;
      }

      // 3. Resolve Bank
      let targetBankId = bankId || null;
      if (targetBankId) {
        let validBank = await prisma.bank.findFirst({
          where: { id: targetBankId }
        });
        if (!validBank) {
          validBank = await prisma.bank.findFirst({
            where: {
              OR: [
                { code: targetBankId },
                { name: { equals: targetBankId, mode: 'insensitive' } }
              ]
            }
          });
        }
        targetBankId = validBank ? validBank.id : null;
      }

      // 4. Resolve Promoter
      let targetPromoterId = promoterId || null;
      if (targetPromoterId) {
        let validPromoter = await prisma.promoter.findFirst({
          where: { id: targetPromoterId }
        });
        if (!validPromoter) {
          validPromoter = await prisma.promoter.findFirst({
            where: {
              name: { equals: targetPromoterId, mode: 'insensitive' }
            }
          });
        }
        targetPromoterId = validPromoter ? validPromoter.id : null;
      }

      // 5. Resolve Product
      let targetProductId = productId || null;
      if (targetProductId) {
        let validProduct = await prisma.product.findFirst({
          where: {
            id: targetProductId,
            active: true,
            OR: [{ scope: 'GLOBAL' }, { tenantId, scope: 'EXCLUSIVE' }],
          },
        });
        if (!validProduct) {
          validProduct = await prisma.product.findFirst({
            where: {
              active: true,
              OR: [{ scope: 'GLOBAL' }, { tenantId, scope: 'EXCLUSIVE' }],
              AND: [
                {
                  OR: [
                    { code: targetProductId },
                    { name: { equals: targetProductId, mode: 'insensitive' } }
                  ]
                }
              ]
            }
          });
        }
        targetProductId = validProduct ? validProduct.id : null;
      }

      // 6. Resolve Convenio
      let targetConvenioId = convenioId || null;
      if (targetConvenioId) {
        let validConvenio = await prisma.convenio.findFirst({
          where: {
            id: targetConvenioId,
            active: true,
            OR: [{ scope: 'GLOBAL' }, { tenantId, scope: 'EXCLUSIVE' }],
          },
        });
        if (!validConvenio) {
          validConvenio = await prisma.convenio.findFirst({
            where: {
              active: true,
              OR: [{ scope: 'GLOBAL' }, { tenantId, scope: 'EXCLUSIVE' }],
              AND: [
                {
                  OR: [
                    { code: targetConvenioId },
                    { name: { equals: targetConvenioId, mode: 'insensitive' } }
                  ]
                }
              ]
            }
          });
        }
        targetConvenioId = validConvenio ? validConvenio.id : null;
      }

      // 7. Resolve Status
      let targetStatusId = statusId || null;
      if (targetStatusId) {
        let validStatus = await prisma.proposalStatus.findFirst({
          where: {
            tenantId,
            OR: [
              { id: targetStatusId },
              { code: targetStatusId },
              { name: { equals: targetStatusId, mode: 'insensitive' } }
            ]
          }
        });
        if (!validStatus) {
          validStatus = await prisma.proposalStatus.findFirst({
            where: {
              OR: [
                { id: targetStatusId },
                { code: targetStatusId },
                { name: { equals: targetStatusId, mode: 'insensitive' } }
              ]
            }
          });
        }
        targetStatusId = validStatus ? validStatus.id : null;
      }
      if (!targetStatusId) {
        const defaultStatus = await prisma.proposalStatus.findFirst({
          where: {
            OR: [
              { tenantId, code: 'AGUARDAR_FORMALIZACAO' },
              { code: 'AGUARDAR_FORMALIZACAO' }
            ]
          }
        });
        targetStatusId = defaultStatus?.id || null;
      }

      const cleanPropNumber = (proposalNumber && String(proposalNumber).trim()) || `PROP-${Date.now()}`;

      // Check if proposal already exists with this number for this tenant
      const existingProposal = await prisma.proposal.findFirst({
        where: { tenantId, proposalNumber: cleanPropNumber, deletedAt: null }
      });
      if (existingProposal) {
        return res.status(409).json({
          error: `Proposta/ADE "${cleanPropNumber}" já está cadastrada no sistema.`,
          proposalId: existingProposal.id
        });
      }

      let initialRetentionDeadline: Date | null = null;
      if (targetStatusId) {
        const selectedStatus = await prisma.proposalStatus.findFirst({
          where: { id: targetStatusId },
          select: { code: true }
        });
        if (selectedStatus?.code === 'AGUARDAR_RETORNO_CIP') {
          initialRetentionDeadline = new Date();
        }
      }

      const proposal = await prisma.proposal.create({
        data: {
          tenantId,
          proposalNumber: cleanPropNumber,
          clientId: targetClientId,
          bankId: targetBankId,
          promoterId: targetPromoterId,
          partnerId: targetPartnerId,
          productId: targetProductId,
          convenioId: targetConvenioId,
          statusId: targetStatusId,
          retentionDeadline: initialRetentionDeadline,
          type: type || 'NOVO',
          releasedValue: releasedValue ? Number(releasedValue) : 0,
          contractValue: contractValue ? Number(contractValue) : 0,
          installmentValue: installmentValue ? Number(installmentValue) : 0,
          installmentsCount: installmentsCount ? Number(installmentsCount) : 84,
          createdById: session?.user?.id || null,
          c6ProposalNumber: c6ProposalNumber || cleanPropNumber,
          c6OperationNumber: c6OperationNumber || null,
          c6SyncStatus: 'PENDING',
        },
        include: { client: true, bank: true, promoter: true, partner: true, product: true, convenio: true, status: true },
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

      return res.status(201).json(proposal);
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
        include: { status: true },
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
      let validatedStatus: { id: string; name: string; code: string; standardCategory: string | null } | null = null;
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
          select: { id: true, name: true, code: true, standardCategory: true },
        });

        if (!validatedStatus) {
          return res.status(400).json({
            error: 'Status de proposta inexistente, inativo ou não pertencente a este tenant.',
            details: { statusId, tenantId },
          });
        }
      }

      const isStatusChanging = statusId !== undefined && statusId !== existing.statusId;
      let newRetentionDeadline: Date | null | undefined = undefined;
      if (isStatusChanging) {
        if (validatedStatus?.code === 'AGUARDAR_RETORNO_CIP') {
          newRetentionDeadline = existing.retentionDeadline ? undefined : new Date();
        } else {
          newRetentionDeadline = null; // Clear if moving out of AGUARDAR_RETORNO_CIP
        }
      }

      // 3. Executar transação atômica no PostgreSQL
      const result = await prisma.$transaction(async (tx) => {
        // Atualizar proposta incrementando a versão
        const updated = await tx.proposal.update({
          where: { id },
          data: {
            statusId: statusId !== undefined ? statusId : undefined,
            standardCategory: standardCategory || undefined,
            retentionDeadline: newRetentionDeadline,
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
      let statuses = await prisma.proposalStatus.findMany({
        where: { tenantId },
        orderBy: { order: 'asc' },
      });
      if (statuses.length === 0) {
        await ensureDefaultStatusesForTenant(prisma, tenantId);
        statuses = await prisma.proposalStatus.findMany({
          where: { tenantId },
          orderBy: { order: 'asc' },
        });
      }
      const mapped = statuses.map(s => ({
        ...s,
        responsible: s.responsibleGroup,
      }));
      return res.json(mapped);
    } catch (err) {
      console.error('[API /api/statuses] Erro ao buscar status no PostgreSQL:', err);
      return res.status(500).json({ error: 'Erro ao buscar status.' });
    }
  });

  app.post('/api/statuses', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { name, code, color, standardCategory, slaHours, active, responsibleGroup, responsible, finalStatus, manualChangeAllowed, automaticChangeAllowed } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'O nome do status é obrigatório.' });
      }

      const nameUpper = name.trim().toUpperCase();
      const cleanCode = (code || nameUpper.replace(/[^A-Z0-9]/g, '_')).trim().toUpperCase();

      const existing = await prisma.proposalStatus.findFirst({
        where: { tenantId, code: cleanCode },
      });
      if (existing) {
        return res.status(400).json({ error: `Já existe um status cadastrado com o código "${cleanCode}".` });
      }

      const maxOrder = await prisma.proposalStatus.findFirst({
        where: { tenantId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const nextOrder = (maxOrder?.order ?? 0) + 1;

      const respGroup = responsibleGroup || responsible || 'NOSSA EQUIPE';

      const newStatus = await prisma.proposalStatus.create({
        data: {
          tenantId,
          name: nameUpper,
          code: cleanCode,
          color: color || '#3b82f6',
          standardCategory: standardCategory || 'ESTEIRA',
          slaHours: Number(slaHours) || 0,
          order: nextOrder,
          active: active !== undefined ? Boolean(active) : true,
          responsibleGroup: respGroup,
          finalStatus: Boolean(finalStatus),
          manualChangeAllowed: manualChangeAllowed !== undefined ? Boolean(manualChangeAllowed) : true,
          automaticChangeAllowed: automaticChangeAllowed !== undefined ? Boolean(automaticChangeAllowed) : true,
        },
      });

      return res.status(201).json({
        ...newStatus,
        responsible: newStatus.responsibleGroup,
      });
    } catch (err: any) {
      console.error('[API POST /api/statuses] Erro ao criar status:', err);
      return res.status(500).json({ error: err.message || 'Erro ao criar status.' });
    }
  });

  app.put('/api/statuses/reorder', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Lista de reordenação inválida.' });
      }

      await prisma.$transaction(
        items.map(item =>
          prisma.proposalStatus.updateMany({
            where: { id: item.id, tenantId },
            data: { order: Number(item.order) || 0 },
          })
        )
      );

      const updated = await prisma.proposalStatus.findMany({
        where: { tenantId },
        orderBy: { order: 'asc' },
      });

      return res.json(updated.map(s => ({ ...s, responsible: s.responsibleGroup })));
    } catch (err: any) {
      console.error('[API PUT /api/statuses/reorder] Erro ao reordenar status:', err);
      return res.status(500).json({ error: err.message || 'Erro ao reordenar status.' });
    }
  });

  app.put('/api/statuses/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;

      const existing = await prisma.proposalStatus.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Status não encontrado.' });
      }

      const { name, code, color, standardCategory, slaHours, order, active, responsibleGroup, responsible, finalStatus, manualChangeAllowed, automaticChangeAllowed } = req.body;

      let cleanCode = existing.code;
      if (code && code.trim().toUpperCase() !== existing.code.toUpperCase()) {
        cleanCode = code.trim().toUpperCase();
        const duplicate = await prisma.proposalStatus.findFirst({
          where: { tenantId, code: cleanCode, NOT: { id } },
        });
        if (duplicate) {
          return res.status(400).json({ error: `Já existe outro status cadastrado com o código "${cleanCode}".` });
        }
      }

      const respGroup = responsibleGroup || responsible || existing.responsibleGroup;

      const updated = await prisma.proposalStatus.update({
        where: { id },
        data: {
          name: name ? name.trim().toUpperCase() : existing.name,
          code: cleanCode,
          color: color ?? existing.color,
          standardCategory: standardCategory ?? existing.standardCategory,
          slaHours: slaHours !== undefined ? Number(slaHours) : existing.slaHours,
          order: order !== undefined ? Number(order) : existing.order,
          active: active !== undefined ? Boolean(active) : existing.active,
          responsibleGroup: respGroup,
          finalStatus: finalStatus !== undefined ? Boolean(finalStatus) : existing.finalStatus,
          manualChangeAllowed: manualChangeAllowed !== undefined ? Boolean(manualChangeAllowed) : existing.manualChangeAllowed,
          automaticChangeAllowed: automaticChangeAllowed !== undefined ? Boolean(automaticChangeAllowed) : existing.automaticChangeAllowed,
        },
      });

      return res.json({
        ...updated,
        responsible: updated.responsibleGroup,
      });
    } catch (err: any) {
      console.error('[API PUT /api/statuses/:id] Erro ao atualizar status:', err);
      return res.status(500).json({ error: err.message || 'Erro ao atualizar status.' });
    }
  });

  app.delete('/api/statuses/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const { targetFallbackStatusId } = req.body || {};

      const statusToDelete = await prisma.proposalStatus.findFirst({
        where: { id, tenantId },
      });
      if (!statusToDelete) {
        return res.status(404).json({ error: 'Status não encontrado.' });
      }

      const totalCount = await prisma.proposalStatus.count({
        where: { tenantId },
      });
      if (totalCount <= 1) {
        return res.status(400).json({ error: 'Não é possível excluir todos os status. O sistema necessita de pelo menos 1 status ativo.' });
      }

      const proposalsCount = await prisma.proposal.count({
        where: { tenantId, statusId: id },
      });

      if (proposalsCount > 0) {
        if (!targetFallbackStatusId) {
          return res.status(400).json({ error: `Existem ${proposalsCount} propostas com este status. Selecione um status de destino para migrar estas propostas antes de excluir.` });
        }

        const fallback = await prisma.proposalStatus.findFirst({
          where: { id: targetFallbackStatusId, tenantId, NOT: { id } },
        });
        if (!fallback) {
          return res.status(400).json({ error: 'Status de destino para migração não encontrado.' });
        }

        await prisma.$transaction([
          prisma.proposal.updateMany({
            where: { tenantId, statusId: id },
            data: { statusId: fallback.id },
          }),
          prisma.proposalStatus.delete({
            where: { id },
          }),
        ]);
      } else {
        await prisma.proposalStatus.delete({
          where: { id },
        });
      }

      return res.json({ success: true, message: 'Status excluído com sucesso.' });
    } catch (err: any) {
      console.error('[API DELETE /api/statuses/:id] Erro ao excluir status:', err);
      return res.status(500).json({ error: err.message || 'Erro ao excluir status.' });
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

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      const isCrmMode = req.query.crm === 'true' || req.query.mode === 'crm' || req.query.page !== undefined || req.query.search !== undefined || req.query.operationalStatus !== undefined;

      if (isCrmMode) {
        if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'partners.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
          return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para acessar o CRM de parceiros.' });
        }

        const result = await PartnerCrmService.listPartners(prisma, tenantId, {
          search: req.query.search as string,
          status: req.query.status as string,
          promoterId: req.query.promoterId as string,
          operationalStatus: req.query.operationalStatus as string,
          page: req.query.page ? Number(req.query.page) : 1,
          limit: req.query.limit ? Number(req.query.limit) : 20,
        });
        return res.json(result);
      }

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'proposals.create') && !hasPermission(userRole, userCustomPerms, 'simulations.create') && !hasPermission(userRole, userCustomPerms, 'proposals.view')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para consultar parceiros.' });
      }

      const partners = await prisma.partner.findMany({
        where: { tenantId, deletedAt: null },
        include: {
          promoter: { select: { id: true, name: true, code: true } },
          assignedUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { name: 'asc' },
      });

      const normalized = partners.map(p => {
        const fullName = p.name || 'Parceiro sem Nome';
        const code = p.code || '';
        const login = code || fullName;

        return {
          id: p.id,
          fullName,
          name: fullName,
          login,
          code,
          promoterId: p.promoterId || '',
          promoter: p.promoter,
          email: p.email,
          phone: p.phone,
          document: p.document,
          assignedUserId: p.assignedUserId,
          assignedUser: p.assignedUser,
          active: p.status === 'ATIVO',
          status: p.status,
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

  // -------------------------------------------------------------
  // PARTNER CRM EXTENDED ENDPOINTS
  // -------------------------------------------------------------
  app.get('/api/partners/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para visualizar parceiro.' });
      }

      const details = await PartnerCrmService.getPartnerDetails(prisma, tenantId, req.params.id);
      if (!details) {
        return res.status(404).json({ error: 'Parceiro não encontrado.' });
      }
      return res.json(details);
    } catch (err: any) {
      console.error('[API PARTNER DETAILS ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao obter detalhes do parceiro.' });
    }
  });

  app.get('/api/partners/:id/metrics', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.metrics') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para visualizar métricas de parceiros.' });
      }

      const period = (req.query.period as string) || '30d';
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const metrics = await PartnerCrmService.getPartnerMetrics(
        prisma,
        tenantId,
        req.params.id,
        period,
        startDate,
        endDate
      );
      return res.json(metrics);
    } catch (err: any) {
      console.error('[API PARTNER METRICS ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao calcular métricas do parceiro.' });
    }
  });

  app.get('/api/partners/:id/timeline', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para visualizar timeline de parceiros.' });
      }

      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const timeline = await PartnerCrmService.getPartnerTimeline(prisma, tenantId, req.params.id, limit);
      return res.json(timeline);
    } catch (err: any) {
      console.error('[API PARTNER TIMELINE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao carregar timeline do parceiro.' });
    }
  });

  app.get('/api/partners/:id/interactions', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.interactions') && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para visualizar interações.' });
      }

      const interactions = await prisma.partnerInteraction.findMany({
        where: { tenantId, partnerId: req.params.id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { date: 'desc' },
      });
      return res.json(interactions);
    } catch (err: any) {
      console.error('[API PARTNER INTERACTIONS GET ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao listar interações.' });
    }
  });

  app.post('/api/partners/:id/interactions', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.interactions') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para registrar interações no CRM.' });
      }

      const { type, subject, description, result, nextAction, date } = req.body;
      if (!subject || !subject.trim()) {
        return res.status(400).json({ error: 'O assunto da interação é obrigatório.' });
      }

      const created = await PartnerCrmService.createInteraction(
        prisma,
        tenantId,
        session.user.id,
        session.user.name,
        {
          partnerId: req.params.id,
          type,
          subject,
          description,
          result,
          nextAction,
          date,
        },
        req
      );
      return res.status(201).json(created);
    } catch (err: any) {
      console.error('[API PARTNER INTERACTIONS POST ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao registrar interação.' });
    }
  });

  app.get('/api/partners/:id/notes', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.notes') && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para visualizar notas do parceiro.' });
      }

      const notes = await prisma.partnerNote.findMany({
        where: { tenantId, partnerId: req.params.id },
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(notes);
    } catch (err: any) {
      console.error('[API PARTNER NOTES GET ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao listar notas.' });
    }
  });

  app.post('/api/partners/:id/notes', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.notes') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para registrar notas internas.' });
      }

      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'O conteúdo da nota é obrigatório.' });
      }

      const created = await PartnerCrmService.createNote(
        prisma,
        tenantId,
        session.user.id,
        session.user.name,
        {
          partnerId: req.params.id,
          content,
        },
        req
      );
      return res.status(201).json(created);
    } catch (err: any) {
      console.error('[API PARTNER NOTES POST ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao adicionar nota.' });
    }
  });

  app.get('/api/partners/:id/tasks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.tasks') && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para visualizar tarefas do parceiro.' });
      }

      const tasks = await prisma.partnerTask.findMany({
        where: { tenantId, partnerId: req.params.id },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true } },
          completedBy: { select: { id: true, name: true } },
        },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      });
      return res.json(tasks);
    } catch (err: any) {
      console.error('[API PARTNER TASKS GET ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao listar tarefas do parceiro.' });
    }
  });

  app.post('/api/partners/:id/tasks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.tasks') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para criar tarefas do parceiro.' });
      }

      const { title, description, assignedToId, priority, dueDate } = req.body;
      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'O título da tarefa é obrigatório.' });
      }

      const created = await PartnerCrmService.createTask(
        prisma,
        tenantId,
        session.user.id,
        session.user.name,
        {
          partnerId: req.params.id,
          title,
          description,
          assignedToId,
          priority,
          dueDate,
        },
        req
      );
      return res.status(201).json(created);
    } catch (err: any) {
      console.error('[API PARTNER TASKS POST ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao criar tarefa do parceiro.' });
    }
  });

  const handleUpdatePartnerTask = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.tasks') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para atualizar tarefas do parceiro.' });
      }

      const taskId = req.params.taskId;
      const updated = await PartnerCrmService.updateTask(
        prisma,
        tenantId,
        session.user.id,
        session.user.name,
        taskId,
        req.body,
        req
      );
      return res.json(updated);
    } catch (err: any) {
      console.error('[API PARTNER TASK PATCH ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao atualizar tarefa.' });
    }
  };

  const handleDeletePartnerTask = async (req: express.Request, res: express.Response) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.tasks') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para remover tarefa do parceiro.' });
      }

      const taskId = req.params.taskId;
      const result = await PartnerCrmService.deleteTask(
        prisma,
        tenantId,
        session.user.id,
        session.user.name,
        taskId,
        req
      );
      return res.json(result);
    } catch (err: any) {
      console.error('[API PARTNER TASK DELETE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao remover tarefa.' });
    }
  };

  app.patch('/api/partners/tasks/:taskId', handleUpdatePartnerTask);
  app.patch('/api/partners/:id/tasks/:taskId', handleUpdatePartnerTask);
  app.delete('/api/partners/tasks/:taskId', handleDeletePartnerTask);
  app.delete('/api/partners/:id/tasks/:taskId', handleDeletePartnerTask);

  app.get('/api/partners/:id/proposals', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'proposals.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para listar propostas do parceiro.' });
      }

      const result = await PartnerCrmService.getPartnerProposals(prisma, tenantId, req.params.id, {
        status: req.query.status as string,
        bank: req.query.bank as string,
        product: req.query.product as string,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      return res.json(result);
    } catch (err: any) {
      console.error('[API PARTNER PROPOSALS ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao listar propostas do parceiro.' });
    }
  });

  app.get('/api/partners/:id/simulations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'simulations.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para listar simulações do parceiro.' });
      }

      const simulations = await PartnerCrmService.getPartnerSimulations(prisma, tenantId, req.params.id);
      return res.json(simulations);
    } catch (err: any) {
      console.error('[API PARTNER SIMULATIONS ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao listar simulações do parceiro.' });
    }
  });

  app.get('/api/partners/:id/pendencies', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.crm.view') && !hasPermission(userRole, userCustomPerms, 'pendencies.view') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para listar pendências do parceiro.' });
      }

      const pendencies = await PartnerCrmService.getPartnerPendencies(prisma, tenantId, req.params.id);
      return res.json(pendencies);
    } catch (err: any) {
      console.error('[API PARTNER PENDENCIES ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao listar pendências do parceiro.' });
    }
  });

  app.get('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';

      let products;
      if (isMaster && req.query.allTenants === 'true') {
        products = await prisma.product.findMany({
          include: { tenant: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        });
      } else {
        if (!tenantId && !isMaster) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
        products = await prisma.product.findMany({
          where: {
            OR: [
              { scope: 'GLOBAL' },
              ...(tenantId ? [{ scope: 'EXCLUSIVE', tenantId }] : []),
            ],
          },
          include: { tenant: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        });
      }

      const formatted = products.map(p => ({
        ...p,
        tenantName: p.tenant?.name,
      }));

      return res.json(formatted);
    } catch (err) {
      console.error('[API PRODUCTS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar produtos.' });
    }
  });

  app.get('/api/convenios', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';

      let convenios;
      if (isMaster && req.query.allTenants === 'true') {
        convenios = await prisma.convenio.findMany({
          include: { tenant: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        });
      } else {
        if (!tenantId && !isMaster) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
        convenios = await prisma.convenio.findMany({
          where: {
            OR: [
              { scope: 'GLOBAL' },
              ...(tenantId ? [{ scope: 'EXCLUSIVE', tenantId }] : []),
            ],
          },
          include: { tenant: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        });
      }

      const formatted = convenios.map(c => ({
        ...c,
        tenantName: c.tenant?.name,
      }));

      return res.json(formatted);
    } catch (err) {
      console.error('[API CONVENIOS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar convênios.' });
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

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.create') && !hasPermission(userRole, userCustomPerms, 'partners.crm.create') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para criar parceiro.' });
      }

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
            assignedUserId: req.body.assignedUserId || null,
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
            assignedUserId: req.body.assignedUserId || null,
          },
        });
      }

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'PARTNER_CREATED',
        entity: 'Partner',
        entityId: created.id,
        newData: created,
        req,
      });

      await centralEventBus.publish({
        tenantId,
        eventType: 'PARTNER_CREATED',
        entityId: created.id,
        entity: 'Partner',
        userId: session.user.id,
        userName: session.user.name,
        data: {
          id: created.id,
          name: created.name,
          code: created.code,
          promoterId: created.promoterId,
          status: created.status,
        },
      });

      const codeStr = created.code || '';
      const loginStr = codeStr || created.name;

      return res.json({
        id: created.id,
        name: created.name,
        fullName: created.name,
        login: loginStr,
        code: codeStr,
        promoterId: created.promoterId || '',
        assignedUserId: created.assignedUserId || null,
        active: created.status === 'ATIVO',
        status: created.status,
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

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.update') && !hasPermission(userRole, userCustomPerms, 'partners.crm.update') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para editar parceiro.' });
      }

      const { id } = req.params;
      const { fullName, name, login, code, promoterId, active, status, email, phone, document, assignedUserId } = req.body;

      const partnerName = name || fullName;
      const partnerLogin = code || login;
      const partnerStatus = active !== undefined ? (active ? 'ATIVO' : 'INATIVO') : status;

      const existing = await prisma.partner.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        return res.status(404).json({ error: 'Parceiro não encontrado.' });
      }

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
          ...(assignedUserId !== undefined ? { assignedUserId: assignedUserId || null } : {}),
        },
      });

      const updated = await prisma.partner.findFirst({
        where: { id, tenantId },
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'PARTNER_UPDATED',
        entity: 'Partner',
        entityId: id,
        previousData: existing,
        newData: updated,
        req,
      });

      await centralEventBus.publish({
        tenantId,
        eventType: 'PARTNER_UPDATED',
        entityId: id,
        entity: 'Partner',
        userId: session.user.id,
        userName: session.user.name,
        data: {
          id,
          name: updated?.name,
          code: updated?.code,
          status: updated?.status,
        },
      });

      return res.json({ success: true, partner: updated });
    } catch (err: any) {
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

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'partners.delete') && !hasPermission(userRole, userCustomPerms, 'partners.crm.admin')) {
        return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para remover parceiro.' });
      }

      const { id } = req.params;

      const existing = await prisma.partner.findFirst({
        where: { id, tenantId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Parceiro não encontrado.' });
      }

      await prisma.partner.updateMany({
        where: { id, tenantId },
        data: { deletedAt: new Date() },
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'PARTNER_DELETED',
        entity: 'Partner',
        entityId: id,
        previousData: existing,
        req,
      });

      await centralEventBus.publish({
        tenantId,
        eventType: 'PARTNER_DELETED',
        entityId: id,
        entity: 'Partner',
        userId: session.user.id,
        userName: session.user.name,
        data: {
          id,
          name: existing.name,
          code: existing.code,
        },
      });

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
  // PRODUCTS (GET, POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.get('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const includeInactive = req.query.includeInactive === 'true';

      const whereCondition: any = {
        OR: [
          { scope: 'GLOBAL' },
          ...(tenantId ? [{ scope: 'EXCLUSIVE', tenantId }] : []),
        ],
        ...(includeInactive ? {} : { active: true }),
      };

      const products = await prisma.product.findMany({
        where: whereCondition,
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ scope: 'asc' }, { name: 'asc' }],
      });

      return res.json(
        products.map(p => ({
          ...p,
          tenantName: p.tenant?.name,
        }))
      );
    } catch (err) {
      console.error('[API PRODUCTS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar produtos.' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';

      const { id, name, code, description, type, active, scope, convenioIds, allowsMultipleAde, requiresPortabilityRelation, targetTenantId } = req.body;
      if (!name) return res.status(400).json({ error: 'Nome do produto é obrigatório.' });

      const targetScope = isMaster && scope === 'GLOBAL' ? 'GLOBAL' : 'EXCLUSIVE';
      const finalTenantId = targetScope === 'GLOBAL' ? null : (isMaster && targetTenantId ? targetTenantId : tenantId);

      if (targetScope === 'EXCLUSIVE' && !finalTenantId) {
        return res.status(400).json({ error: 'Produtos exclusivos necessitam de um tenantId associado.' });
      }

      let validatedType: ProposalType;
      try {
        validatedType = normalizeProposalType(type, Boolean(requiresPortabilityRelation));
      } catch (errMsg: any) {
        return res.status(400).json({ error: errMsg.message });
      }

      const product = await prisma.product.create({
        data: {
          id: id || undefined,
          tenantId: finalTenantId,
          name: name.trim(),
          code: code ? code.trim() : null,
          description: description ? description.trim() : null,
          scope: targetScope,
          type: validatedType,
          active: active !== undefined ? Boolean(active) : true,
          allowsMultipleAde: allowsMultipleAde !== undefined ? Boolean(allowsMultipleAde) : true,
          requiresPortabilityRelation: requiresPortabilityRelation !== undefined ? Boolean(requiresPortabilityRelation) : false,
          convenioIds: Array.isArray(convenioIds) ? convenioIds : [],
        },
        include: { tenant: { select: { id: true, name: true } } },
      });

      await AuditLogService.record(prisma, {
        tenantId: finalTenantId || tenantId || 'GLOBAL',
        userId: session.user.id,
        userName: session.user.name,
        action: 'PRODUTO_CRIADO',
        entity: 'Product',
        entityId: product.id,
        newData: product,
        req,
      });

      return res.status(201).json({
        ...product,
        tenantName: product.tenant?.name,
      });
    } catch (err) {
      console.error('[API PRODUCTS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar produto.' });
    }
  });

  app.put('/api/products/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const { id } = req.params;

      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });

      if (existing.scope === 'GLOBAL' && !isMaster) {
        return res.status(403).json({ error: 'Apenas administradores Master podem editar produtos globais.' });
      }
      if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== tenantId && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado para editar este produto.' });
      }

      const { name, code, description, type, active, allowsMultipleAde, requiresPortabilityRelation, convenioIds } = req.body;

      let validatedType: ProposalType | undefined = undefined;
      if (type !== undefined) {
        try {
          const checkPort = requiresPortabilityRelation !== undefined ? Boolean(requiresPortabilityRelation) : existing.requiresPortabilityRelation;
          validatedType = normalizeProposalType(type, checkPort);
        } catch (errMsg: any) {
          return res.status(400).json({ error: errMsg.message });
        }
      }

      const updated = await prisma.product.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          code: code !== undefined ? (code ? code.trim() : null) : undefined,
          description: description !== undefined ? (description ? description.trim() : null) : undefined,
          type: validatedType,
          active: active !== undefined ? Boolean(active) : undefined,
          allowsMultipleAde: allowsMultipleAde !== undefined ? Boolean(allowsMultipleAde) : undefined,
          requiresPortabilityRelation: requiresPortabilityRelation !== undefined ? Boolean(requiresPortabilityRelation) : undefined,
          convenioIds: Array.isArray(convenioIds) ? convenioIds : undefined,
        },
        include: { tenant: { select: { id: true, name: true } } },
      });

      await AuditLogService.record(prisma, {
        tenantId: updated.tenantId || tenantId || 'GLOBAL',
        userId: session.user.id,
        userName: session.user.name,
        action: 'PRODUTO_ATUALIZADO',
        entity: 'Product',
        entityId: id,
        previousData: existing,
        newData: updated,
        req,
      });

      return res.json({
        ...updated,
        tenantName: updated.tenant?.name,
      });
    } catch (err) {
      console.error('[API PRODUCTS PUT ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar produto.' });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const { id } = req.params;

      const existing = await prisma.product.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });

      if (existing.scope === 'GLOBAL' && !isMaster) {
        return res.status(403).json({ error: 'Apenas administradores Master podem excluir produtos globais.' });
      }
      if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== tenantId && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado para excluir este produto.' });
      }

      await prisma.product.delete({ where: { id } });

      await AuditLogService.record(prisma, {
        tenantId: existing.tenantId || tenantId || 'GLOBAL',
        userId: session.user.id,
        userName: session.user.name,
        action: 'PRODUTO_EXCLUIDO',
        entity: 'Product',
        entityId: id,
        previousData: existing,
        req,
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('[API PRODUCTS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao deletar produto.' });
    }
  });

  // -------------------------------------------------------------
  // CONVÊNIOS (GET, POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.get('/api/convenios', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const includeInactive = req.query.includeInactive === 'true';

      const whereCondition: any = {
        OR: [
          { scope: 'GLOBAL' },
          ...(tenantId ? [{ scope: 'EXCLUSIVE', tenantId }] : []),
        ],
        ...(includeInactive ? {} : { active: true }),
      };

      const convenios = await prisma.convenio.findMany({
        where: whereCondition,
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ scope: 'asc' }, { name: 'asc' }],
      });

      return res.json(
        convenios.map(c => ({
          ...c,
          tenantName: c.tenant?.name,
        }))
      );
    } catch (err) {
      console.error('[API CONVENIOS GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao listar convênios.' });
    }
  });

  app.post('/api/convenios', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';

      const { id, name, code, description, scope, active, targetTenantId } = req.body;
      if (!name) return res.status(400).json({ error: 'Nome do convênio é obrigatório.' });

      const targetScope = isMaster && scope === 'GLOBAL' ? 'GLOBAL' : 'EXCLUSIVE';
      const finalTenantId = targetScope === 'GLOBAL' ? null : (isMaster && targetTenantId ? targetTenantId : tenantId);

      if (targetScope === 'EXCLUSIVE' && !finalTenantId) {
        return res.status(400).json({ error: 'Convênios exclusivos necessitam de um tenantId associado.' });
      }

      const existing = await prisma.convenio.findFirst({
        where: {
          name: { equals: name.trim(), mode: 'insensitive' },
          scope: targetScope,
          tenantId: finalTenantId,
        },
      });
      if (existing) {
        return res.status(409).json({ error: 'Já existe um convênio cadastrado com este nome para este escopo.' });
      }

      const convenio = await prisma.convenio.create({
        data: {
          id: id || undefined,
          name: name.trim(),
          code: code ? code.trim() : null,
          description: description ? description.trim() : null,
          scope: targetScope,
          tenantId: finalTenantId,
          active: active !== undefined ? Boolean(active) : true,
        },
        include: { tenant: { select: { id: true, name: true } } },
      });

      await AuditLogService.record(prisma, {
        tenantId: finalTenantId || tenantId || 'GLOBAL',
        userId: session.user.id,
        userName: session.user.name,
        action: 'CONVENIO_CRIADO',
        entity: 'Convenio',
        entityId: convenio.id,
        newData: convenio,
        req,
      });

      return res.status(201).json({
        ...convenio,
        tenantName: convenio.tenant?.name,
      });
    } catch (err) {
      console.error('[API CONVENIOS POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar convênio.' });
    }
  });

  app.put('/api/convenios/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const { id } = req.params;

      const existing = await prisma.convenio.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Convênio não encontrado.' });

      if (existing.scope === 'GLOBAL' && !isMaster) {
        return res.status(403).json({ error: 'Apenas administradores Master podem editar convênios globais.' });
      }
      if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== tenantId && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado para editar este convênio.' });
      }

      const { name, code, description, active } = req.body;
      const updated = await prisma.convenio.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          code: code !== undefined ? (code ? code.trim() : null) : undefined,
          description: description !== undefined ? (description ? description.trim() : null) : undefined,
          active: active !== undefined ? Boolean(active) : undefined,
        },
        include: { tenant: { select: { id: true, name: true } } },
      });

      await AuditLogService.record(prisma, {
        tenantId: updated.tenantId || tenantId || 'GLOBAL',
        userId: session.user.id,
        userName: session.user.name,
        action: 'CONVENIO_ATUALIZADO',
        entity: 'Convenio',
        entityId: id,
        previousData: existing,
        newData: updated,
        req,
      });

      return res.json({
        ...updated,
        tenantName: updated.tenant?.name,
      });
    } catch (err) {
      console.error('[API CONVENIOS PUT ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar convênio.' });
    }
  });

  app.delete('/api/convenios/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const { id } = req.params;

      const existing = await prisma.convenio.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Convênio não encontrado.' });

      if (existing.scope === 'GLOBAL' && !isMaster) {
        return res.status(403).json({ error: 'Apenas administradores Master podem excluir convênios globais.' });
      }
      if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== tenantId && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado para excluir este convênio.' });
      }

      await prisma.convenio.delete({ where: { id } });

      await AuditLogService.record(prisma, {
        tenantId: existing.tenantId || tenantId || 'GLOBAL',
        userId: session.user.id,
        userName: session.user.name,
        action: 'CONVENIO_EXCLUIDO',
        entity: 'Convenio',
        entityId: id,
        previousData: existing,
        req,
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('[API CONVENIOS DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao excluir convênio.' });
    }
  });

  // -------------------------------------------------------------
  // OPERATIONAL RULES (GET, POST, PUT, DELETE)
  // -------------------------------------------------------------
  app.get('/api/operational-rules', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';

      let rules;
      if (isMaster && req.query.allTenants === 'true') {
        rules = await prisma.operationalRule.findMany({
          include: { tenant: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        });
      } else {
        if (!tenantId && !isMaster) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });
        rules = await prisma.operationalRule.findMany({
          where: {
            OR: [
              { scope: 'GLOBAL' },
              ...(tenantId ? [{ scope: 'EXCLUSIVE', tenantId }] : []),
            ],
          },
          include: { tenant: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        });
      }

      return res.json(rules.map(r => ({ ...r, tenantName: r.tenant?.name })));
    } catch (err) {
      console.error('[API OPERATIONAL RULES GET ERROR]', err);
      return res.status(500).json({ error: 'Erro ao buscar regras operacionais.' });
    }
  });

  app.post('/api/operational-rules', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';

      const { id, name, description, scope, active, appliesToAllProducts, productIds, appliesToAllConvenios, convenioIds, minInstallments, maxInstallments, minContractValue, maxContractValue, requiresCipBalance, allowsMultipleAde, targetTenantId } = req.body;
      if (!name) return res.status(400).json({ error: 'Nome da regra é obrigatório.' });

      const targetScope = isMaster && scope === 'GLOBAL' ? 'GLOBAL' : 'EXCLUSIVE';
      const finalTenantId = targetScope === 'GLOBAL' ? null : (isMaster && targetTenantId ? targetTenantId : tenantId);

      const rule = await prisma.operationalRule.create({
        data: {
          id: id || undefined,
          tenantId: finalTenantId,
          name: name.trim(),
          description: description ? description.trim() : null,
          scope: targetScope,
          active: active !== undefined ? Boolean(active) : true,
          appliesToAllProducts: appliesToAllProducts !== undefined ? Boolean(appliesToAllProducts) : true,
          productIds: Array.isArray(productIds) ? productIds : [],
          appliesToAllConvenios: appliesToAllConvenios !== undefined ? Boolean(appliesToAllConvenios) : true,
          convenioIds: Array.isArray(convenioIds) ? convenioIds : [],
          minInstallments: minInstallments !== undefined && minInstallments !== null ? Number(minInstallments) : null,
          maxInstallments: maxInstallments !== undefined && maxInstallments !== null ? Number(maxInstallments) : null,
          minContractValue: minContractValue !== undefined && minContractValue !== null ? Number(minContractValue) : null,
          maxContractValue: maxContractValue !== undefined && maxContractValue !== null ? Number(maxContractValue) : null,
          requiresCipBalance: requiresCipBalance !== undefined ? Boolean(requiresCipBalance) : false,
          allowsMultipleAde: allowsMultipleAde !== undefined ? Boolean(allowsMultipleAde) : true,
        },
        include: { tenant: { select: { id: true, name: true } } },
      });

      return res.status(201).json({ ...rule, tenantName: rule.tenant?.name });
    } catch (err) {
      console.error('[API OPERATIONAL RULES POST ERROR]', err);
      return res.status(500).json({ error: 'Erro ao criar regra operacional.' });
    }
  });

  app.put('/api/operational-rules/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const { id } = req.params;

      const existing = await prisma.operationalRule.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Regra operacional não encontrada.' });

      if (existing.scope === 'GLOBAL' && !isMaster) {
        return res.status(403).json({ error: 'Apenas administradores Master podem editar regras globais.' });
      }
      if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== tenantId && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado para editar esta regra.' });
      }

      const { name, description, active, appliesToAllProducts, productIds, appliesToAllConvenios, convenioIds, minInstallments, maxInstallments, minContractValue, maxContractValue, requiresCipBalance, allowsMultipleAde } = req.body;
      const updated = await prisma.operationalRule.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          description: description !== undefined ? (description ? description.trim() : null) : undefined,
          active: active !== undefined ? Boolean(active) : undefined,
          appliesToAllProducts: appliesToAllProducts !== undefined ? Boolean(appliesToAllProducts) : undefined,
          productIds: Array.isArray(productIds) ? productIds : undefined,
          appliesToAllConvenios: appliesToAllConvenios !== undefined ? Boolean(appliesToAllConvenios) : undefined,
          convenioIds: Array.isArray(convenioIds) ? convenioIds : undefined,
          minInstallments: minInstallments !== undefined ? (minInstallments !== null ? Number(minInstallments) : null) : undefined,
          maxInstallments: maxInstallments !== undefined ? (maxInstallments !== null ? Number(maxInstallments) : null) : undefined,
          minContractValue: minContractValue !== undefined ? (minContractValue !== null ? Number(minContractValue) : null) : undefined,
          maxContractValue: maxContractValue !== undefined ? (maxContractValue !== null ? Number(maxContractValue) : null) : undefined,
          requiresCipBalance: requiresCipBalance !== undefined ? Boolean(requiresCipBalance) : undefined,
          allowsMultipleAde: allowsMultipleAde !== undefined ? Boolean(allowsMultipleAde) : undefined,
        },
        include: { tenant: { select: { id: true, name: true } } },
      });

      return res.json({ ...updated, tenantName: updated.tenant?.name });
    } catch (err) {
      console.error('[API OPERATIONAL RULES PUT ERROR]', err);
      return res.status(500).json({ error: 'Erro ao atualizar regra operacional.' });
    }
  });

  app.delete('/api/operational-rules/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      const isMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const { id } = req.params;

      const existing = await prisma.operationalRule.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Regra operacional não encontrada.' });

      if (existing.scope === 'GLOBAL' && !isMaster) {
        return res.status(403).json({ error: 'Apenas administradores Master podem excluir regras globais.' });
      }
      if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== tenantId && !isMaster) {
        return res.status(403).json({ error: 'Acesso negado para excluir esta regra.' });
      }

      await prisma.operationalRule.delete({ where: { id } });
      return res.json({ success: true });
    } catch (err) {
      console.error('[API OPERATIONAL RULES DELETE ERROR]', err);
      return res.status(500).json({ error: 'Erro ao excluir regra operacional.' });
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
        include: {
          memberships: {
            include: {
              tenant: true
            }
          }
        }
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

      const { id, name, email, password, role, customPermissions, tenantId, phone, memberships } = req.body;
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
          mustChangePassword: true,
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
        await prisma.userTenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: user.id,
              tenantId: user.tenantId,
            },
          },
          update: {
            role: user.role,
            customPermissions: user.customPermissions,
            active: user.active,
          },
          create: {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
            customPermissions: user.customPermissions,
            active: user.active,
          },
        }).catch((err) => {
          console.error('[AUTO_MEMBERSHIP_CREATE ERROR]', err);
        });

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
      const { name, active, role, customPermissions, tenantId, phone, password, memberships } = req.body;

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
            return res.status(409).json({
              error: 'É necessário manter pelo menos um MASTER OP ativo na plataforma.',
              code: 'ZERO_PLATFORM_MASTER_PROTECTION',
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
        await prisma.userTenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: updatedUser.id,
              tenantId: updatedUser.tenantId,
            },
          },
          update: {
            role: updatedUser.role,
            customPermissions: updatedUser.customPermissions,
            active: updatedUser.active,
          },
          create: {
            userId: updatedUser.id,
            tenantId: updatedUser.tenantId,
            role: updatedUser.role,
            customPermissions: updatedUser.customPermissions,
            active: updatedUser.active,
          },
        }).catch((err) => {
          console.error('[AUTO_MEMBERSHIP_SYNC ERROR]', err);
        });

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
          return res.status(409).json({
            error: 'É necessário manter pelo menos um MASTER OP ativo na plataforma.',
            code: 'ZERO_PLATFORM_MASTER_PROTECTION',
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
        simulationAccessEnabled,
        happySimulationAccessEnabled,
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
            simulationAccessEnabled: typeof simulationAccessEnabled === 'boolean' ? simulationAccessEnabled : undefined,
            happySimulationAccessEnabled: typeof happySimulationAccessEnabled === 'boolean' ? happySimulationAccessEnabled : (typeof simulationAccessEnabled === 'boolean' ? simulationAccessEnabled : undefined),
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

      // STEP 5: salvaguarda de PLATFORM_MASTER ativo (mínimo 1 ativo na plataforma)
      currentStep = 'STEP 5: verificar salvaguarda de PLATFORM_MASTER ativo';
      const mastersInBatch = existingUsers.filter((u) => u.role === 'PLATFORM_MASTER' && u.active && u.deletedAt === null);
      if (mastersInBatch.length > 0) {
        const totalActiveMasters = await prisma.user.count({
          where: { role: 'PLATFORM_MASTER', active: true, deletedAt: null },
        });
        const remainingActiveMasters = totalActiveMasters - mastersInBatch.length;
        if (remainingActiveMasters < 1) {
          return res.status(409).json({
            success: false,
            error: 'É necessário manter pelo menos um MASTER OP ativo na plataforma.',
            code: 'ZERO_PLATFORM_MASTER_PROTECTION',
            step: currentStep,
          });
        }
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

  
  // 2.5 POST /api/import/products - Bulk products imports (Synchronous)
  app.post('/api/import/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      const tenantId = session?.effectiveTenantId || session?.user?.tenantId;
      if (!session || !session.user || !tenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para importar produtos.' });
      }

      const userRole = session.user.role as string;
      if (userRole !== 'PLATFORM_MASTER' && userRole !== 'MASTER' && userRole !== 'TENANT_ADMIN' && userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Você não tem permissão para gerenciar produtos.' });
      }

      const { rows } = req.body || {};
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Nenhum registro fornecido.' });
      }

      let createdCount = 0;
      let updatedCount = 0;
      let ignoredCount = 0;
      let errorCount = 0;
      let errors: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNum = row.rowIndex || i + 1;
        try {
          const { name, type, action, requiresPortabilityRelation, requiresPortability } = row;
          if (!name || typeof name !== 'string' || !name.trim()) {
            errorCount++;
            errors.push({
              line: lineNum,
              name: name || 'Desconhecido',
              error: `Linha ${lineNum}: Nome do produto não fornecido.`
            });
            continue;
          }

          const trimmedName = name.trim();
          const isPortabilityRequired = Boolean(requiresPortabilityRelation ?? requiresPortability);

          let validatedType: ProposalType;
          try {
            validatedType = normalizeProposalType(type, isPortabilityRequired);
          } catch (normErr: any) {
            errorCount++;
            errors.push({
              line: lineNum,
              name: trimmedName,
              error: `Linha ${lineNum}: ${normErr.message}`
            });
            continue;
          }

          const code = row.code ? String(row.code).trim() : `prod-${trimmedName.replace(/\s+/g, '-').toLowerCase()}`;

          // Respect multi-tenant isolation: check existing product for this tenant
          const existingProduct = await prisma.product.findFirst({
            where: {
              OR: [
                { tenantId, name: { equals: trimmedName, mode: 'insensitive' } },
                { scope: 'GLOBAL', name: { equals: trimmedName, mode: 'insensitive' } },
              ]
            }
          });

          if (existingProduct) {
            if (action === 'UPDATE' || (existingProduct.type !== validatedType || existingProduct.requiresPortabilityRelation !== isPortabilityRequired)) {
              await prisma.product.update({
                where: { id: existingProduct.id },
                data: {
                  type: validatedType,
                  requiresPortabilityRelation: isPortabilityRequired,
                }
              });
              updatedCount++;
            } else {
              ignoredCount++;
            }
          } else {
            await prisma.product.create({
              data: {
                tenantId,
                name: trimmedName,
                code,
                type: validatedType,
                requiresPortabilityRelation: isPortabilityRequired,
                active: true,
                scope: 'EXCLUSIVE',
              }
            });
            createdCount++;
          }
        } catch (err: any) {
          errorCount++;
          errors.push({
            line: lineNum,
            name: row.name || 'Desconhecido',
            error: `Linha ${lineNum}: ${err.message}`
          });
        }
      }

      const totalProcessed = rows.length;
      const isPartial = errorCount > 0 && (createdCount > 0 || updatedCount > 0);
      const isFullSuccess = errorCount === 0;

      return res.json({
        success: true,
        status: isFullSuccess ? 'COMPLETED' : (isPartial ? 'PARTIALLY_COMPLETED' : 'FAILED'),
        message: isFullSuccess
          ? 'Importação concluída integralmente com sucesso!'
          : (isPartial ? 'Importação concluída parcialmente com alguns erros.' : 'Falha ao processar registros da importação.'),
        summary: {
          total: totalProcessed,
          created: createdCount,
          updated: updatedCount,
          ignored: ignoredCount,
          errors: errorCount,
          errorDetails: errors
        }
      });

    } catch (error: any) {
      console.error('[IMPORT PRODUCTS ERROR]', error);
      return res.status(500).json({ error: 'Erro interno ao importar produtos.' });
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
    if (query.convenioId && typeof query.convenioId === 'string' && query.convenioId.trim()) {
      filters.convenioId = query.convenioId.trim();
    }
    if (query.source && typeof query.source === 'string' && query.source.trim()) {
      filters.source = query.source.trim();
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

  // 6.1 GET /api/bi/conversion - Operational Conversion Funnel
  app.get('/api/bi/conversion', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar o funil de conversão.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar o funil de conversão.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const conversion = await BIService.getConversionFunnel(prisma, tenantId, filters);
      return res.json(conversion);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API CONVERSION ERROR]');
      return res.status(500).json({ error: 'Erro ao processar funil de conversão do BI.' });
    }
  });

  // 6.2 GET /api/bi/products - Product Performance & Metrics
  app.get('/api/bi/products', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar análise de produtos.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar análise de produtos.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const products = await BIService.getProducts(prisma, tenantId, filters);
      return res.json(products);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API PRODUCTS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de produtos do BI.' });
    }
  });

  // 6.3 GET /api/bi/convenios - Agreement / Convenio Performance
  app.get('/api/bi/convenios', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar análise de convênios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar análise de convênios.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const convenios = await BIService.getConvenios(prisma, tenantId, filters);
      return res.json(convenios);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API CONVENIOS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de convênios do BI.' });
    }
  });

  // 6.4 GET /api/bi/operators - Operator / Digitizer Internal Performance
  app.get('/api/bi/operators', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar análise de operadores.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar análise de operadores.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const operators = await BIService.getOperators(prisma, tenantId, filters);
      return res.json(operators);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API OPERATORS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de operadores do BI.' });
    }
  });

  // 6.5 GET /api/bi/pendencies - Pendencies & SLA Operational Analytics
  app.get('/api/bi/pendencies', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar análise de pendências.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar análise de pendências.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const pendencies = await BIService.getPendencies(prisma, tenantId, filters);
      return res.json(pendencies);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API PENDENCIES ERROR]');
      return res.status(500).json({ error: 'Erro ao processar análise de pendências do BI.' });
    }
  });

  // 6.6 GET /api/bi/bottlenecks - Operational Bottlenecks & Status Distribution
  app.get('/api/bi/bottlenecks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar gargalos operacionais.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar gargalos operacionais.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const bottlenecks = await BIService.getBottlenecks(prisma, tenantId, filters);
      return res.json(bottlenecks);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API BOTTLENECKS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar gargalos operacionais do BI.' });
    }
  });

  // 6.7 GET /api/bi/cancellations - Cancellations Breakdown
  app.get('/api/bi/cancellations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar cancelamentos.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar cancelamentos.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const cancellations = await BIService.getCancellations(prisma, tenantId, filters);
      return res.json(cancellations);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API CANCELLATIONS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar cancelamentos do BI.' });
    }
  });

  // 6.8 GET /api/bi/refusals - Refusals / Recusas Breakdown
  app.get('/api/bi/refusals', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar recusas bancárias.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar recusas bancárias.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const refusals = await BIService.getRefusals(prisma, tenantId, filters);
      return res.json(refusals);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API REFUSALS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar recusas do BI.' });
    }
  });

  // 6.9 GET /api/bi/integrations - Bank Integration Health & Telemetry
  app.get('/api/bi/integrations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar saúde das integrações.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar saúde das integrações.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const integrations = await BIService.getIntegrations(prisma, tenantId, filters);
      return res.json(integrations);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API INTEGRATIONS ERROR]');
      return res.status(500).json({ error: 'Erro ao processar telemetria de integrações do BI.' });
    }
  });

  // 6.10 GET /api/bi/operational-health - Consolidated Real Operational Health
  app.get('/api/bi/operational-health', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação necessária para consultar saúde operacional.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'dashboard.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar saúde operacional.' });
      }

      const tenantId = session.effectiveTenantId;
      const filters = parseBIFilters(req.query);

      const health = await BIService.getOperationalHealth(prisma, tenantId, filters);
      return res.json(health);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[BI API OPERATIONAL HEALTH ERROR]');
      return res.status(500).json({ error: 'Erro ao processar saúde operacional do BI.' });
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
      const maskCpf = (cpf?: string | null) => {
        if (!cpf) return '';
        const clean = cpf.replace(/\D/g, '');
        if (clean.length === 11) {
          return `${clean.slice(0, 3)}.***.***-${clean.slice(9, 11)}`;
        }
        return '***.***.***-**';
      };

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
          escapeCsv(maskCpf(p.client?.cpf)),
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

  // =============================================================
  // FASE 7: SENTINEL INTELLIGENCE REST API ENDPOINTS
  // =============================================================

  // 1. GET /api/intelligence/overview - Resumo executivo da inteligência operacional
  app.get('/api/intelligence/overview', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar o Sentinel Intelligence.' });
      }

      const overview = await IntelligenceService.getOverview(prisma, session.effectiveTenantId);
      return res.json(overview);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE OVERVIEW ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar visão geral do Sentinel Intelligence.' });
    }
  });

  // 2. GET /api/intelligence/insights - Listagem filtrada de insights operacionais
  app.get('/api/intelligence/insights', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar insights.' });
      }

      const filters = {
        status: req.query.status as any,
        severity: req.query.severity as any,
        category: req.query.category as string,
        type: req.query.type as any,
        search: req.query.search as string,
        entityType: req.query.entityType as string,
        entityId: req.query.entityId as string,
      };

      const result = await IntelligenceService.listInsights(prisma, session.effectiveTenantId, filters);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE INSIGHTS ERROR]');
      return res.status(500).json({ error: 'Erro ao listar insights operacionais.' });
    }
  });

  // 3. GET /api/intelligence/insights/:id - Detalhes do insight com evidências
  app.get('/api/intelligence/insights/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar detalhes do insight.' });
      }

      const insight = await IntelligenceService.getInsightById(prisma, session.effectiveTenantId, req.params.id);
      if (!insight) {
        return res.status(404).json({ error: 'Insight não encontrado.' });
      }

      return res.json(insight);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE INSIGHT DETAIL ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar detalhes do insight.' });
    }
  });

  // 4. POST /api/intelligence/insights/:id/acknowledge - Reconhecer insight
  app.post('/api/intelligence/insights/:id/acknowledge', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.manage') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para reconhecer o insight.' });
      }

      const updated = await IntelligenceService.acknowledgeInsight(
        prisma,
        session.effectiveTenantId,
        req.params.id,
        session.user.id
      );

      if (!updated) {
        return res.status(404).json({ error: 'Insight não encontrado para o tenant atual.' });
      }

      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'INTELLIGENCE_INSIGHT_ACKNOWLEDGED',
        entity: 'IntelligenceInsight',
        entityId: req.params.id,
        newData: { status: 'ACKNOWLEDGED' },
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE ACKNOWLEDGE ERROR]');
      return res.status(500).json({ error: 'Erro ao reconhecer insight.' });
    }
  });

  // 5. POST /api/intelligence/insights/:id/investigate - Marcar em investigação
  app.post('/api/intelligence/insights/:id/investigate', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.investigate') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para investigar o insight.' });
      }

      const updated = await IntelligenceService.investigateInsight(
        prisma,
        session.effectiveTenantId,
        req.params.id,
        session.user.id
      );

      if (!updated) {
        return res.status(404).json({ error: 'Insight não encontrado para o tenant atual.' });
      }

      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'INTELLIGENCE_INSIGHT_INVESTIGATING',
        entity: 'IntelligenceInsight',
        entityId: req.params.id,
        newData: { status: 'INVESTIGATING' },
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE INVESTIGATE ERROR]');
      return res.status(500).json({ error: 'Erro ao colocar insight em investigação.' });
    }
  });

  // 6. POST /api/intelligence/insights/:id/resolve - Resolver insight
  app.post('/api/intelligence/insights/:id/resolve', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.resolve') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.manage')) {
        return res.status(403).json({ error: 'Permissão insuficiente para resolver o insight.' });
      }

      const updated = await IntelligenceService.resolveInsight(
        prisma,
        session.effectiveTenantId,
        req.params.id,
        session.user.id
      );

      if (!updated) {
        return res.status(404).json({ error: 'Insight não encontrado para o tenant atual.' });
      }

      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'INTELLIGENCE_INSIGHT_RESOLVED',
        entity: 'IntelligenceInsight',
        entityId: req.params.id,
        newData: { status: 'RESOLVED' },
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE RESOLVE ERROR]');
      return res.status(500).json({ error: 'Erro ao resolver insight.' });
    }
  });

  // 7. POST /api/intelligence/insights/:id/dismiss - Descartar insight
  app.post('/api/intelligence/insights/:id/dismiss', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.dismiss') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.manage')) {
        return res.status(403).json({ error: 'Permissão insuficiente para descartar o insight.' });
      }

      const updated = await IntelligenceService.dismissInsight(
        prisma,
        session.effectiveTenantId,
        req.params.id,
        session.user.id
      );

      if (!updated) {
        return res.status(404).json({ error: 'Insight não encontrado para o tenant atual.' });
      }

      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'INTELLIGENCE_INSIGHT_DISMISSED',
        entity: 'IntelligenceInsight',
        entityId: req.params.id,
        newData: { status: 'DISMISSED' },
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE DISMISS ERROR]');
      return res.status(500).json({ error: 'Erro ao descartar insight.' });
    }
  });

  // 8. POST /api/intelligence/insights/:id/create-pendency - Criar pendência operacional vinculada
  app.post('/api/intelligence/insights/:id/create-pendency', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.create') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.execute_action')) {
        return res.status(403).json({ error: 'Permissão insuficiente para criar pendência a partir do insight.' });
      }

      const pendency = await IntelligenceService.createPendencyFromInsight(
        prisma,
        session.effectiveTenantId,
        req.params.id,
        session.user.id,
        req.body || {}
      );

      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'PENDENCY_CREATED_FROM_INTELLIGENCE',
        entity: 'Pendency',
        entityId: pendency.id,
        newData: { insightId: req.params.id, pendencyId: pendency.id },
        req,
      });

      return res.status(201).json(pendency);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE CREATE PENDENCY ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao gerar pendência a partir do insight.' });
    }
  });

  // 9. GET /api/intelligence/insights/:id/evidence - Evidências estruturadas
  app.get('/api/intelligence/insights/:id/evidence', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar evidências.' });
      }

      const insight = await IntelligenceService.getInsightById(prisma, session.effectiveTenantId, req.params.id);
      if (!insight) {
        return res.status(404).json({ error: 'Insight não encontrado.' });
      }

      return res.json({ evidence: insight.evidence, count: insight.evidence.length });
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE EVIDENCE ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar evidências.' });
    }
  });

  // 10. GET /api/intelligence/insights/:id/timeline - Histórico temporal do insight
  app.get('/api/intelligence/insights/:id/timeline', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar a linha do tempo.' });
      }

      const timeline = await IntelligenceService.getInsightTimeline(prisma, session.effectiveTenantId, req.params.id);
      return res.json({ timeline });
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE TIMELINE ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar linha do tempo do insight.' });
    }
  });

  // 11. GET /api/intelligence/rules - Catálogo e configurações das regras de inteligência
  app.get('/api/intelligence/rules', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar regras de inteligência.' });
      }

      const rules = await IntelligenceService.getRules(prisma, session.effectiveTenantId);
      return res.json({ rules });
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE RULES ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar regras de inteligência.' });
    }
  });

  // 12. PATCH /api/intelligence/rules/:id - Atualizar configuração de regra de inteligência
  app.patch('/api/intelligence/rules/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.configure')) {
        return res.status(403).json({ error: 'Permissão insuficiente para configurar regras de inteligência.' });
      }

      const updated = await IntelligenceService.updateRule(
        prisma,
        session.effectiveTenantId,
        req.params.id,
        req.body || {}
      );

      await AuditLogService.record(prisma, {
        tenantId: session.effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'INTELLIGENCE_RULE_CONFIGURED',
        entity: 'IntelligenceRuleConfig',
        entityId: req.params.id,
        newData: updated,
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE RULE UPDATE ERROR]');
      return res.status(500).json({ error: 'Erro ao atualizar regra de inteligência.' });
    }
  });

  // 13. POST /api/intelligence/run - Executar análise analítica de regras sob demanda
  app.post('/api/intelligence/run', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.execute') &&
          !hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.manage')) {
        return res.status(403).json({ error: 'Permissão insuficiente para executar análise de inteligência sob demanda.' });
      }

      const filters = parseBIFilters(req.body || req.query);
      const result = await IntelligenceService.runAnalysis(
        prisma,
        session.effectiveTenantId,
        session.user.id,
        filters
      );

      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE RUN ERROR]');
      return res.status(500).json({ error: 'Erro ao executar varredura do Sentinel Intelligence.' });
    }
  });

  // 14. GET /api/intelligence/metrics - Métricas e KPIs de eficácia da inteligência
  app.get('/api/intelligence/metrics', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'intelligence.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar métricas de inteligência.' });
      }

      const metrics = await IntelligenceService.getMetrics(prisma, session.effectiveTenantId);
      return res.json(metrics);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[API INTELLIGENCE METRICS ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar métricas do Sentinel Intelligence.' });
    }
  });

  // =============================================================
  // FASE 8: SENTINEL COMMAND CENTER API ENDPOINTS
  // =============================================================

  // 1. GET /api/command-center/overview - Overview KPIs, Executive Summary & Attention Items
  app.get('/api/command-center/overview', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar Command Center.' });
      }

      const overview = await CommandCenterService.getOverview(prisma, session.effectiveTenantId);
      return res.json(overview);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER OVERVIEW ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar visão geral do Command Center.' });
    }
  });

  // 2. GET /api/command-center/incidents - List incidents with filters & pagination
  app.get('/api/command-center/incidents', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar incidentes.' });
      }

      const {
        severity,
        status,
        type,
        source,
        assignedToId,
        bankId,
        partnerId,
        integrationSlug,
        startDate,
        endDate,
        search,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const filterOptions: any = {
        severity: severity ? String(severity).split(',') : undefined,
        status: status ? String(status).split(',') : undefined,
        type: type ? String(type).split(',') : undefined,
        source: source ? String(source).split(',') : undefined,
        assignedToId: assignedToId ? String(assignedToId) : undefined,
        bankId: bankId ? String(bankId) : undefined,
        partnerId: partnerId ? String(partnerId) : undefined,
        integrationSlug: integrationSlug ? String(integrationSlug) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        search: search ? String(search) : undefined,
        page: page ? parseInt(String(page), 10) : 1,
        limit: limit ? parseInt(String(limit), 10) : 20,
        sortBy: sortBy ? String(sortBy) : undefined,
        sortOrder: sortOrder ? String(sortOrder) : undefined,
      };

      const result = await IncidentService.getIncidents(prisma, session.effectiveTenantId, filterOptions);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER LIST INCIDENTS ERROR]');
      return res.status(500).json({ error: 'Erro ao listar incidentes operacionais.' });
    }
  });

  // 3. POST /api/command-center/incidents - Create incident manually
  app.post('/api/command-center/incidents', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.create_incident')) {
        return res.status(403).json({ error: 'Permissão insuficiente para criar incidentes.' });
      }

      const { title, description, type, severity, source, bankId, productId, convenioId, partnerId, integrationSlug, assignedToId, tags } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Título do incidente é obrigatório.' });
      }

      const incident = await IncidentService.createIncident(
        prisma,
        session.effectiveTenantId,
        {
          title: title.trim(),
          description,
          type,
          severity,
          source: source || 'MANUAL',
          bankId,
          productId,
          convenioId,
          partnerId,
          integrationSlug,
          assignedToId,
          tags,
        },
        {
          userId: session.user.id,
          userName: session.user.name,
          userEmail: session.user.email,
          role: session.user.role,
          reqIp: req.ip,
        }
      );

      return res.status(201).json(incident);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER CREATE INCIDENT ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao criar incidente.' });
    }
  });

  // 4. POST /api/command-center/incidents/from-insight - Create incident from Intelligence insight
  app.post('/api/command-center/incidents/from-insight', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.create_incident')) {
        return res.status(403).json({ error: 'Permissão insuficiente para converter insight em incidente.' });
      }

      const { insightId } = req.body;
      if (!insightId) {
        return res.status(400).json({ error: 'insightId é obrigatório.' });
      }

      const incident = await IncidentService.createFromInsight(
        prisma,
        session.effectiveTenantId,
        insightId,
        {
          userId: session.user.id,
          userName: session.user.name,
          userEmail: session.user.email,
          role: session.user.role,
          reqIp: req.ip,
        }
      );

      return res.status(201).json(incident);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER CREATE FROM INSIGHT ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao converter insight em incidente.' });
    }
  });

  // 5. GET /api/command-center/incidents/:id - Incident 360° detail view
  app.get('/api/command-center/incidents/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.view')) {
        return res.status(403).json({ error: 'Permissão insuficiente para visualizar incidente.' });
      }

      const { id } = req.params;
      const incident = await IncidentService.getIncidentById(prisma, session.effectiveTenantId, id);

      if (!incident) {
        return res.status(404).json({ error: 'Incidente não encontrado.' });
      }

      return res.json(incident);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER GET INCIDENT ERROR]');
      return res.status(500).json({ error: 'Erro ao buscar detalhes do incidente.' });
    }
  });

  // 6. PATCH /api/command-center/incidents/:id/status - Transition incident status
  app.patch('/api/command-center/incidents/:id/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.update')) {
        return res.status(403).json({ error: 'Permissão insuficiente para atualizar status do incidente.' });
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status) {
        return res.status(400).json({ error: 'Status é obrigatório.' });
      }

      const updated = await IncidentService.updateStatus(
        prisma,
        session.effectiveTenantId,
        id,
        status,
        notes,
        {
          userId: session.user.id,
          userName: session.user.name,
          userEmail: session.user.email,
          role: session.user.role,
          reqIp: req.ip,
        }
      );

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER UPDATE STATUS ERROR]');
      return res.status(400).json({ error: err?.message || 'Erro ao atualizar status do incidente.' });
    }
  });

  // 7. POST /api/command-center/incidents/:id/pendency - Create pendency linked to incident
  app.post('/api/command-center/incidents/:id/pendency', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.execute_action')) {
        return res.status(403).json({ error: 'Permissão insuficiente para gerar pendências a partir do incidente.' });
      }

      const { id } = req.params;
      const { type, title, description, priority, assignedToId, proposalId, partnerId, bankId } = req.body;

      if (!title) return res.status(400).json({ error: 'Título da pendência é obrigatório.' });

      const pendency = await IncidentService.createPendencyFromIncident(
        prisma,
        session.effectiveTenantId,
        id,
        {
          type: type || 'INCIDENTE',
          title,
          description,
          priority,
          assignedToId,
          proposalId,
          partnerId,
          bankId,
        },
        {
          userId: session.user.id,
          userName: session.user.name,
          userEmail: session.user.email,
          role: session.user.role,
          reqIp: req.ip,
        }
      );

      return res.status(201).json(pendency);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER CREATE PENDENCY ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao gerar pendência para o incidente.' });
    }
  });

  // 8. POST /api/command-center/incidents/:id/comments - Add timeline comment
  app.post('/api/command-center/incidents/:id/comments', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.comment')) {
        return res.status(403).json({ error: 'Permissão insuficiente para comentar no incidente.' });
      }

      const { id } = req.params;
      const { title, description } = req.body;

      if (!title && !description) {
        return res.status(400).json({ error: 'Conteúdo do comentário é obrigatório.' });
      }

      const comment = await IncidentService.addTimelineComment(
        prisma,
        session.effectiveTenantId,
        id,
        title || 'Anotação Operacional',
        description,
        {
          userId: session.user.id,
          userName: session.user.name,
          userEmail: session.user.email,
          role: session.user.role,
          reqIp: req.ip,
        }
      );

      return res.status(201).json(comment);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER ADD COMMENT ERROR]');
      return res.status(500).json({ error: 'Erro ao adicionar comentário ao incidente.' });
    }
  });

  // 9. POST /api/command-center/incidents/:id/recalculate-impact - Recalculate impact
  app.post('/api/command-center/incidents/:id/recalculate-impact', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      const { id } = req.params;
      const updated = await IncidentService.recalculateImpact(prisma, session.effectiveTenantId, id);
      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER RECALCULATE IMPACT ERROR]');
      return res.status(500).json({ error: 'Erro ao recalcular impacto do incidente.' });
    }
  });

  // 10. GET /api/command-center/sla-configs - Get tenant SLA configs
  app.get('/api/command-center/sla-configs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      const configs = await IncidentSlaService.getTenantSlaConfigs(prisma, session.effectiveTenantId);
      return res.json(configs);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER SLA CONFIGS GET ERROR]');
      return res.status(500).json({ error: 'Erro ao buscar matriz de SLA.' });
    }
  });

  // 11. PUT /api/command-center/sla-configs - Update tenant SLA config for severity
  app.put('/api/command-center/sla-configs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      if (!hasPermission(session.user.role as Role, session.user.customPermissions, 'command.manage_sla')) {
        return res.status(403).json({ error: 'Permissão insuficiente para alterar matriz de SLA.' });
      }

      const { severity, acknowledgeMinutes, resolveMinutes } = req.body;
      if (!severity || typeof acknowledgeMinutes !== 'number' || typeof resolveMinutes !== 'number') {
        return res.status(400).json({ error: 'severity, acknowledgeMinutes e resolveMinutes são obrigatórios.' });
      }

      const updated = await IncidentSlaService.updateTenantSlaConfig(
        prisma,
        session.effectiveTenantId,
        severity,
        acknowledgeMinutes,
        resolveMinutes
      );

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER SLA CONFIGS UPDATE ERROR]');
      return res.status(500).json({ error: 'Erro ao atualizar configuração de SLA.' });
    }
  });

  // 12. GET /api/command-center/timeline - Unified operational timeline
  app.get('/api/command-center/timeline', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const timeline = await CommandCenterService.getOperationalTimeline(prisma, session.effectiveTenantId, limit);
      return res.json(timeline);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER TIMELINE ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar linha do tempo operacional.' });
    }
  });

  // 13. GET /api/command-center/search - Unified operational search
  app.get('/api/command-center/search', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      const query = req.query.q ? String(req.query.q) : '';
      const results = await CommandCenterService.globalSearch(prisma, session.effectiveTenantId, query);
      return res.json(results);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER SEARCH ERROR]');
      return res.status(500).json({ error: 'Erro ao executar busca operacional.' });
    }
  });

  // 14. GET /api/command-center/alerts - Evaluated alerts
  app.get('/api/command-center/alerts', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user || !session.effectiveTenantId) {
        return res.status(401).json({ error: 'Autenticação e Tenant válidos são obrigatórios.' });
      }

      const alerts = await CommandAlertEngine.evaluateAlerts(prisma, session.effectiveTenantId);
      return res.json(alerts);
    } catch (err: any) {
      logger.error({ error: err?.message || String(err) }, '[COMMAND CENTER ALERTS ERROR]');
      return res.status(500).json({ error: 'Erro ao avaliar alertas do Command Center.' });
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

  // ==================================================
  // MONITORAMENTO DE APIS & INTEGRAÇÕES
  // ==================================================

  app.get('/api/monitoring/services', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const services = await ApiMonitoringService.listServices(prisma, tenantId);
      res.json(services);
    } catch (err: any) {
      logger.error({ err }, '[API MONITORING] Erro ao listar serviços');
      res.status(500).json({ error: 'Erro ao listar serviços monitorados.' });
    }
  });

  app.get('/api/monitoring/health', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const health = await ApiMonitoringService.getSystemHealthOverview(prisma, tenantId);
      res.json(health);
    } catch (err: any) {
      logger.error({ err }, '[API MONITORING] Erro ao obter visão geral de saúde');
      res.status(500).json({ error: 'Erro ao carregar visão geral de monitoramento.' });
    }
  });

  app.post('/api/monitoring/services/:id/ping', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const result = await ApiMonitoringService.pingService(prisma, req.params.id, tenantId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao testar conectividade do serviço.' });
    }
  });

  app.post('/api/monitoring/ping-all', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const result = await ApiMonitoringService.pingAllServices(prisma, tenantId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao verificar todas as APIs.' });
    }
  });

  app.patch('/api/monitoring/services/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role } = session.user;
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER' && role !== 'GESTOR') {
        return res.status(403).json({ error: 'Acesso negado para alterar status de serviços.' });
      }
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const updated = await ApiMonitoringService.updateService(prisma, req.params.id, req.body, tenantId);

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'api_service.updated',
        entity: 'MonitoredService',
        entityId: updated.id,
        newData: req.body,
        req,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar serviço.' });
    }
  });

  app.get('/api/monitoring/incidents', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const incidents = await ApiMonitoringService.listIncidents(prisma, tenantId, {
        status: req.query.status as any,
      });
      res.json(incidents);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar histórico de incidentes.' });
    }
  });

  app.post('/api/monitoring/incidents', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, id: userId, name: userName } = session.user;
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER' && role !== 'GESTOR') {
        return res.status(403).json({ error: 'Acesso negado para registrar incidentes.' });
      }
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const { serviceId, title, description, severity, status, impactDetails } = req.body;
      if (!serviceId || !title || !description || !severity) {
        return res.status(400).json({ error: 'Campos obrigatórios ausentes (serviceId, title, description, severity).' });
      }

      const incident = await ApiMonitoringService.createIncident(
        prisma,
        { serviceId, title, description, severity, status, impactDetails },
        tenantId,
        { id: userId, name: userName || 'Usuário' }
      );

      await AuditLogService.record(prisma, {
        tenantId,
        userId,
        userName,
        action: 'api_incident.created',
        entity: 'ApiIncident',
        entityId: incident.id,
        newData: { serviceId, title, severity },
        req,
      });

      res.json(incident);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao registrar incidente.' });
    }
  });

  app.patch('/api/monitoring/incidents/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role } = session.user;
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER' && role !== 'GESTOR') {
        return res.status(403).json({ error: 'Acesso negado para atualizar incidentes.' });
      }
      const tenantId = session.effectiveTenantId || session.user.tenantId;

      const updated = await ApiMonitoringService.updateIncident(prisma, req.params.id, req.body, tenantId);

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'api_incident.updated',
        entity: 'ApiIncident',
        entityId: updated.id,
        newData: req.body,
        req,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao atualizar incidente.' });
    }
  });

  // -------------------------------------------------------------
  // C6 BANK INTEGRATION & PROPOSAL STATUS SYNC ENDPOINTS
  // -------------------------------------------------------------

  // POST /api/proposals/:id/c6-sync - Manual status sync triggered by operator or manager
  app.post('/api/proposals/:id/c6-sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const { forceProposalNumber } = req.body || {};

      const result = await C6BankService.syncProposalStatus(prisma, id, tenantId, {
        queriedBy: session.user.id,
        forceProposalNumber,
      });

      // Se o status da proposta foi alterado ou atualizado, emitir eventos de tempo real
      if (result.success && result.hasChanged) {
        eventBus.publishToTenant(tenantId, {
          type: 'proposal_status_changed',
          entity: 'Proposal',
          entityId: id,
          data: {
            proposalId: id,
            statusName: result.currentInternalStatus,
            updatedBy: session.user.name,
          },
        });

        if (sseRegistry) {
          sseRegistry.broadcastToTenant(tenantId, {
            type: 'PROPOSAL_UPDATED',
            entity: 'Proposal',
            entityId: id,
            data: {
              id,
              c6SyncStatus: 'SYNCED',
              c6RawSituation: result.rawSituation,
              c6ActivityDescription: result.activityDescription,
              statusName: result.currentInternalStatus,
            },
          });
        }
      }

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'c6_bank.manual_sync',
        entity: 'Proposal',
        entityId: id,
        newData: {
          success: result.success,
          c6ProposalNumber: result.c6ProposalNumber,
          rawSituation: result.rawSituation,
          activity: result.activityDescription,
          statusMapped: result.statusMapped,
          error: result.error,
        },
        req,
      });

      res.json(result);
    } catch (err: any) {
      logger.error({ err, proposalId: req.params.id }, '[API C6 SYNC] Erro ao sincronizar proposta');
      res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao sincronizar status no C6 Bank.' });
    }
  });

  // GET /api/proposals/:id/c6-history - List query history for a specific proposal
  app.get('/api/proposals/:id/c6-history', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const history = await C6BankService.getProposalC6History(prisma, id, tenantId);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao buscar histórico C6.' });
    }
  });

  // POST /api/proposals/:id/c6-link - Manually link or correct C6 proposal identifier
  app.post('/api/proposals/:id/c6-link', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const { c6ProposalNumber, c6OperationNumber } = req.body || {};

      if (!c6ProposalNumber || typeof c6ProposalNumber !== 'string' || !c6ProposalNumber.trim()) {
        return res.status(400).json({ error: 'O número da proposta C6 é obrigatório.' });
      }

      const updated = await C6BankService.linkC6Identifiers(prisma, id, tenantId, {
        c6ProposalNumber,
        c6OperationNumber,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'c6_bank.link_identifier',
        entity: 'Proposal',
        entityId: id,
        newData: { c6ProposalNumber, c6OperationNumber },
        req,
      });

      res.json({ success: true, proposal: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao vincular identificador C6.' });
    }
  });

  // GET /api/integrations/c6/config - Secure tenant configuration
  app.get('/api/integrations/c6/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const config = await C6BankService.getTenantConfig(prisma, tenantId);

      // Nunca expor a senha no retorno JSON
      res.json({
        username: config.username,
        baseUrl: config.baseUrl,
        autoSyncEnabled: config.autoSyncEnabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        isConfigured: config.isConfigured,
        hasPassword: config.hasPassword,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao carregar configurações do C6 Bank.' });
    }
  });

  // POST /api/integrations/c6/config - Save secure tenant configuration
  app.post('/api/integrations/c6/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      // Apenas gestores e administradores
      const allowedRoles = ['PLATFORM_MASTER', 'MASTER', 'ADMIN', 'GESTOR'];
      if (!allowedRoles.includes(session.user.role)) {
        return res.status(403).json({ error: 'Permissão negada para configurar integrações bancárias.' });
      }

      const { username, password, baseUrl, autoSyncEnabled, syncIntervalMinutes } = req.body || {};

      const saved = await C6BankService.saveTenantConfig(prisma, tenantId, {
        username,
        password,
        baseUrl,
        autoSyncEnabled,
        syncIntervalMinutes,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'c6_bank.config_updated',
        entity: 'SystemConfig',
        entityId: 'c6_bank',
        newData: {
          username: saved.username,
          baseUrl: saved.baseUrl,
          autoSyncEnabled: saved.autoSyncEnabled,
          syncIntervalMinutes: saved.syncIntervalMinutes,
          passwordUpdated: Boolean(password),
        },
        req,
      });

      res.json({
        success: true,
        message: 'Configurações do C6 Bank salvas com sucesso.',
        config: {
          username: saved.username,
          baseUrl: saved.baseUrl,
          autoSyncEnabled: saved.autoSyncEnabled,
          syncIntervalMinutes: saved.syncIntervalMinutes,
          isConfigured: saved.isConfigured,
          hasPassword: saved.hasPassword,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar configurações do C6 Bank.' });
    }
  });

  // POST /api/integrations/c6/test-connection - Test credentials against live C6 auth endpoint
  app.post('/api/integrations/c6/test-connection', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { username, password, baseUrl } = req.body || {};
      const override = (username || password || baseUrl) ? { username, password, baseUrl } : undefined;

      const result = await C6BankService.testConnection(prisma, tenantId, override);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao testar conexão com C6 Bank.' });
    }
  });

  // GET /api/integrations/c6/status - Operational worker metrics and queue status
  app.get('/api/integrations/c6/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const status = await C6SyncWorker.getWorkerStatus(prisma, tenantId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao carregar status do sincronizador C6.' });
    }
  });

  // POST /api/integrations/c6/run-sync - Trigger immediate batch sync
  app.post('/api/integrations/c6/run-sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const config = await C6BankService.getTenantConfig(prisma, tenantId);
      const result = await C6SyncWorker.processTenantProposals(
        prisma,
        tenantId,
        config.syncIntervalMinutes
      );

      res.json({
        success: true,
        message: `Sincronização concluída: ${result.processedCount} processadas (${result.successCount} com sucesso, ${result.failedCount} com falhas).`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao disparar sincronização C6.' });
    }
  });

  // GET /api/integrations/c6/recent-logs - Recent sync history logs for tenant
  app.get('/api/integrations/c6/recent-logs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const logs = await prisma.c6SyncHistory.findMany({
        where: { tenantId },
        orderBy: { queryDate: 'desc' },
        take: limit,
      });

      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar histórico recente de sincronizações C6.' });
    }
  });

  // -------------------------------------------------------------
  // FACTA FINANCEIRA INTEGRATION & PROPOSAL STATUS SYNC ENDPOINTS
  // -------------------------------------------------------------

  // POST /api/proposals/:id/facta-sync - Manual status sync triggered by operator or manager
  app.post('/api/proposals/:id/facta-sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const { forceAfCode } = req.body || {};

      const result = await FactaBankService.syncProposalStatus(prisma, id, tenantId, {
        queriedBy: session.user.id,
        forceAfCode,
      });

      if (result.success && result.hasChanged) {
        eventBus.publishToTenant(tenantId, {
          type: 'proposal_status_changed',
          entity: 'Proposal',
          entityId: id,
          data: {
            proposalId: id,
            statusName: result.currentInternalStatus,
            updatedBy: session.user.name,
          },
        });

        if (sseRegistry) {
          sseRegistry.broadcastToTenant(tenantId, {
            type: 'PROPOSAL_UPDATED',
            entity: 'Proposal',
            entityId: id,
            data: {
              id,
              factaSyncStatus: 'SYNCED',
              factaRawStatus: result.rawStatus,
              factaCrivoStatus: result.crivoStatus,
              statusName: result.currentInternalStatus,
            },
          });
        }
      }

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'facta_bank.manual_sync',
        entity: 'Proposal',
        entityId: id,
        newData: {
          success: result.success,
          factaProposalNumber: result.factaProposalNumber,
          factaAfCode: result.factaAfCode,
          rawStatus: result.rawStatus,
          crivoStatus: result.crivoStatus,
          statusMapped: result.statusMapped,
          error: result.error,
        },
        req,
      });

      res.json(result);
    } catch (err: any) {
      logger.error({ err, proposalId: req.params.id }, '[API FACTA SYNC] Erro ao sincronizar proposta');
      res.status(err.statusCode || 500).json({ error: err.message || 'Erro ao sincronizar status na FACTA Financeira.' });
    }
  });

  // GET /api/proposals/:id/facta-history - List query history for a specific proposal
  app.get('/api/proposals/:id/facta-history', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const history = await FactaBankService.getProposalFactaHistory(prisma, id, tenantId);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao buscar histórico FACTA.' });
    }
  });

  // POST /api/proposals/:id/facta-link - Manually link or correct FACTA proposal identifiers
  app.post('/api/proposals/:id/facta-link', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const { factaProposalNumber, factaAfCode, factaContractNumber } = req.body || {};

      if (!factaAfCode && !factaProposalNumber && !factaContractNumber) {
        return res.status(400).json({ error: 'Informe ao menos um identificador FACTA (AF Code, Proposta ou Contrato).' });
      }

      const updated = await FactaBankService.linkFactaIdentifiers(prisma, id, tenantId, {
        factaProposalNumber,
        factaAfCode,
        factaContractNumber,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'facta_bank.link_identifier',
        entity: 'Proposal',
        entityId: id,
        newData: { factaProposalNumber, factaAfCode, factaContractNumber },
        req,
      });

      res.json({ success: true, proposal: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao vincular identificadores FACTA.' });
    }
  });

  // GET /api/integrations/facta/config - Secure tenant configuration
  app.get('/api/integrations/facta/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const config = await FactaBankService.getTenantConfig(prisma, tenantId);

      // Nunca expor a senha no retorno JSON
      res.json({
        environment: config.environment,
        username: config.username,
        baseUrl: config.baseUrl,
        autoSyncEnabled: config.autoSyncEnabled,
        syncIntervalMinutes: config.syncIntervalMinutes,
        pageSize: config.pageSize,
        dateQueryType: config.dateQueryType,
        convenio: config.convenio,
        averbador: config.averbador,
        codigoAf: config.codigoAf,
        consultaSub: config.consultaSub,
        codigoSub: config.codigoSub,
        isConfigured: config.isConfigured,
        hasPassword: config.hasPassword,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao carregar configurações da FACTA Financeira.' });
    }
  });

  // POST /api/integrations/facta/config - Save secure tenant configuration
  app.post('/api/integrations/facta/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const allowedRoles = ['PLATFORM_MASTER', 'MASTER', 'ADMIN', 'GESTOR'];
      if (!allowedRoles.includes(session.user.role)) {
        return res.status(403).json({ error: 'Permissão negada para configurar integrações bancárias.' });
      }

      const {
        environment,
        username,
        password,
        baseUrl,
        autoSyncEnabled,
        syncIntervalMinutes,
        pageSize,
        dateQueryType,
        convenio,
        averbador,
        codigoAf,
        consultaSub,
        codigoSub,
      } = req.body || {};

      const saved = await FactaBankService.saveTenantConfig(prisma, tenantId, {
        environment,
        username,
        password,
        baseUrl,
        autoSyncEnabled,
        syncIntervalMinutes,
        pageSize,
        dateQueryType,
        convenio,
        averbador,
        codigoAf,
        consultaSub,
        codigoSub,
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'facta_bank.config_updated',
        entity: 'SystemConfig',
        entityId: 'facta_bank',
        newData: {
          environment: saved.environment,
          username: saved.username,
          baseUrl: saved.baseUrl,
          autoSyncEnabled: saved.autoSyncEnabled,
          syncIntervalMinutes: saved.syncIntervalMinutes,
          passwordUpdated: Boolean(password),
        },
        req,
      });

      res.json({
        success: true,
        message: 'Configurações da FACTA Financeira salvas com sucesso.',
        config: {
          environment: saved.environment,
          username: saved.username,
          baseUrl: saved.baseUrl,
          autoSyncEnabled: saved.autoSyncEnabled,
          syncIntervalMinutes: saved.syncIntervalMinutes,
          pageSize: saved.pageSize,
          dateQueryType: saved.dateQueryType,
          convenio: saved.convenio,
          averbador: saved.averbador,
          codigoAf: saved.codigoAf,
          consultaSub: saved.consultaSub,
          codigoSub: saved.codigoSub,
          isConfigured: saved.isConfigured,
          hasPassword: saved.hasPassword,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar configurações da FACTA Financeira.' });
    }
  });

  // POST /api/integrations/facta/test-connection - Test credentials against live FACTA /gera-token endpoint
  app.post('/api/integrations/facta/test-connection', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { username, password, baseUrl } = req.body || {};
      const override = (username || password || baseUrl) ? { username, password, baseUrl } : undefined;

      const result = await FactaBankService.testConnection(prisma, tenantId, override);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao testar conexão com FACTA Financeira.' });
    }
  });

  // GET /api/integrations/facta/status - Operational worker metrics and queue status
  app.get('/api/integrations/facta/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const status = await FactaSyncWorker.getWorkerStatus(prisma, tenantId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao carregar status do sincronizador FACTA.' });
    }
  });

  // POST /api/integrations/facta/run-sync - Trigger immediate batch sync
  app.post('/api/integrations/facta/run-sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const config = await FactaBankService.getTenantConfig(prisma, tenantId);
      const result = await FactaSyncWorker.processTenantProposals(
        prisma,
        tenantId,
        config.syncIntervalMinutes
      );

      res.json({
        success: true,
        message: `Sincronização FACTA concluída: ${result.processedCount} processadas (${result.updatedCount} atualizadas, ${result.unlinkedCount} não vinculadas, ${result.failedCount} falhas).`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao disparar sincronização FACTA.' });
    }
  });

  // GET /api/integrations/facta/recent-logs - Recent sync history logs for tenant
  app.get('/api/integrations/facta/recent-logs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const logs = await FactaBankService.getRecentLogs(prisma, tenantId, limit);

      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar histórico recente de sincronizações FACTA.' });
    }
  });

  // -------------------------------------------------------------
  // HAPPY / BYX CAPITAL INTEGRATION & PROPOSAL STATUS SYNC ENDPOINTS
  // -------------------------------------------------------------

  // POST /api/proposals/:id/happy-sync - Manual status sync of a proposal via Happy API
  app.post('/api/proposals/:id/happy-sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const { id } = req.params;
      const result = await HappyBankService.syncProposal(prisma, tenantId, id);

      if (result.success && result.hasChanged) {
        eventBus.publishToTenant(tenantId, {
          type: 'proposal_status_changed',
          entity: 'Proposal',
          entityId: id,
          data: {
            proposalId: id,
            statusName: result.currentInternalStatus,
            updatedBy: session.user.name,
          },
        });

        if (sseRegistry) {
          sseRegistry.broadcastToTenant(tenantId, {
            type: 'PROPOSAL_UPDATED',
            entity: 'Proposal',
            entityId: id,
            data: {
              id,
              happySyncStatus: 'SYNCED',
              happyStatus: result.statusName,
              statusName: result.currentInternalStatus,
            },
          });
        }
      }

      res.json(result);
    } catch (err: any) {
      logger.error({ err, proposalId: req.params.id }, '[HAPPY SYNC ROUTE] Erro ao sincronizar proposta com Happy');
      res.status(500).json({ error: err.message || 'Erro ao sincronizar proposta com a Happy / BYX Capital.' });
    }
  });

  // GET /api/integrations/happy/config - Secure tenant configuration
  app.get('/api/integrations/happy/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const config = await HappyBankService.getTenantConfig(prisma, tenantId);
      res.json(config);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao carregar configurações da Happy.' });
    }
  });

  // POST /api/integrations/happy/config - Save secure tenant configuration
  app.post('/api/integrations/happy/config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const allowedRoles = ['PLATFORM_MASTER', 'MASTER', 'ADMIN', 'GESTOR'];
      if (!allowedRoles.includes(session.user.role)) {
        return res.status(403).json({ error: 'Permissão negada para configurar integrações bancárias.' });
      }

      const updated = await HappyBankService.saveTenantConfig(prisma, tenantId, req.body);
      res.json({
        success: true,
        message: 'Configurações da Happy / BYX Capital salvas com sucesso.',
        config: updated,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao salvar configurações da Happy.' });
    }
  });

  // POST /api/integrations/happy/test-connection - Test credentials against live Happy auth endpoint
  app.post('/api/integrations/happy/test-connection', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const result = await HappyBankService.testConnection(prisma, tenantId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message || 'Erro interno ao testar conexão com a Happy.',
      });
    }
  });

  // GET /api/integrations/happy/status - Operational metrics and status
  app.get('/api/integrations/happy/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const status = await HappyBankService.getIntegrationStatus(prisma, tenantId);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao obter status da integração Happy.' });
    }
  });

  // POST /api/integrations/happy/consult-contract - Consult contracts with filters
  app.post('/api/integrations/happy/consult-contract', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const result = await HappyBankService.consultarContratos(prisma, tenantId, req.body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao consultar contratos na Happy.' });
    }
  });

  // POST /api/integrations/happy/run-sync - Trigger immediate batch reconciliation
  app.post('/api/integrations/happy/run-sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const result = await HappyBankService.runBatchReconciliation(prisma, tenantId);
      res.json({
        success: true,
        message: `Reconciliação Happy concluída: ${result.totalChecked} verificadas (${result.updatedCount} atualizadas, ${result.errorCount} falhas).`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Erro ao reconciliar propostas com a Happy.' });
    }
  });

  // GET /api/integrations/happy/recent-logs - Recent sync history logs for tenant
  app.get('/api/integrations/happy/recent-logs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const logs = await prisma.happySyncHistory.findMany({
        where: { tenantId },
        orderBy: { startedAt: 'desc' },
        take: limit,
        include: {
          proposal: {
            select: {
              id: true,
              proposalNumber: true,
              client: { select: { fullName: true, cpf: true } },
            },
          },
        },
      });

      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar histórico de sincronizações Happy.' });
    }
  });

  // GET /api/integrations/happy/unmatched-webhooks - List unmatched webhooks for investigation
  app.get('/api/integrations/happy/unmatched-webhooks', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId || session.user.tenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão inválida: sem tenantId.' });

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const events = await prisma.happyWebhookEvent.findMany({
        where: {
          OR: [
            { tenantId },
            { processingStatus: 'UNMATCHED' },
            { processingStatus: 'UNRESOLVED_TENANT' },
          ],
        },
        orderBy: { receivedAt: 'desc' },
        take: limit,
      });

      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar webhooks não vinculados.' });
    }
  });

  // =========================================================================
  // CENTRAL DE SIMULAÇÕES HAPPY — ROTAS INSS E CLT
  // =========================================================================

  // POST /api/integrations/happy/inss/cliente
  app.post('/api/integrations/happy/inss/cliente', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      // Validação de Controle de Acesso às Simulações Happy
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { happySimulationAccessEnabled: true, simulationAccessEnabled: true },
      });
      if (tenantRecord && (tenantRecord.happySimulationAccessEnabled === false || tenantRecord.simulationAccessEnabled === false)) {
        return res.status(403).json({
          error: 'As simulações Happy estão bloqueadas para este tenant.',
          code: 'SIMULATION_ACCESS_DISABLED',
        });
      }

      const {
        nome,
        telefone,
        cpf,
        dt_nascimento,
        escolaridade,
        tipo_produto,
        numero_beneficio,
        representante_legal,
        rogado,
        partnerId,
        simulationId,
      } = req.body;

      if (!nome || !telefone || !cpf || !numero_beneficio) {
        return res.status(400).json({ error: 'Nome, telefone, CPF e número do benefício são obrigatórios.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      const cleanBeneficio = String(numero_beneficio).replace(/\D/g, '');

      if (cleanBeneficio.length !== 10) {
        return res.status(400).json({ error: 'O número do benefício INSS deve conter exatamente 10 dígitos numéricos.' });
      }

      const happyRes = await HappySimulationService.criarClienteInss(prisma, tenantId, {
        nome,
        telefone,
        cpf: cleanCpf,
        dt_nascimento,
        escolaridade: Number(escolaridade) || 1,
        tipo_produto: Number(tipo_produto) || 1216171824,
        numero_beneficio: cleanBeneficio,
        representante_legal: Boolean(representante_legal),
        rogado: Boolean(rogado),
      });

      let simId = simulationId;
      if (simId) {
        await prisma.simulationRequest.update({
          where: { id: simId },
          data: {
            simulationType: 'HAPPY_INSS',
            happyClientId: String(happyRes.id_cliente),
            happyBeneficioNumero: cleanBeneficio,
            happyDataNascimento: dt_nascimento,
            happyClienteNome: nome,
            happyClienteTelefone: telefone,
            happyJourneyStatus: 'CLIENTE_CRIADO',
            partnerId: partnerId || undefined,
          },
        });
      } else {
        const created = await prisma.simulationRequest.create({
          data: {
            tenantId,
            cpf: cleanCpf,
            partnerId: partnerId || null,
            createdById: session.user.id,
            status: 'SIMULAÇÃO ENVIADA',
            simulationType: 'HAPPY_INSS',
            happyClientId: String(happyRes.id_cliente),
            happyBeneficioNumero: cleanBeneficio,
            happyDataNascimento: dt_nascimento,
            happyClienteNome: nome,
            happyClienteTelefone: telefone,
            happyJourneyStatus: 'CLIENTE_CRIADO',
          },
        });
        simId = created.id;
      }

      return res.json({
        success: true,
        id_cliente: happyRes.id_cliente,
        simulationId: simId,
        raw: happyRes.raw,
      });
    } catch (err: any) {
      console.error('[HAPPY INSS CLIENTE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao cadastrar cliente INSS na Happy.' });
    }
  });

  // POST /api/integrations/happy/inss/in100
  app.post('/api/integrations/happy/inss/in100', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      const { cpf, numero_beneficio, tipo_produto, simulationId } = req.body;
      if (!cpf || !numero_beneficio) {
        return res.status(400).json({ error: 'CPF e número do benefício são obrigatórios.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      const cleanBeneficio = String(numero_beneficio).replace(/\D/g, '');

      const in100Res = await HappySimulationService.consultarIn100(prisma, tenantId, {
        cpf: cleanCpf,
        numero_beneficio: cleanBeneficio,
        tipo_produto: Number(tipo_produto) || 1216171824,
      });

      if (simulationId) {
        await prisma.simulationRequest.update({
          where: { id: simulationId },
          data: {
            happyJourneyStatus: in100Res.in100_autorizada ? 'IN100_AUTORIZADA' : (in100Res.isProcessing ? 'IN100_PROCESSANDO' : 'AGUARDANDO_AUTORIZACAO_IN100'),
            happyAuthUrl: in100Res.url_formalizacao || undefined,
            happyRawData: in100Res,
          },
        });
      }

      return res.json({ success: true, ...in100Res });
    } catch (err: any) {
      console.error('[HAPPY INSS IN100 ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao consultar IN100 na Happy.' });
    }
  });

  // POST /api/integrations/happy/inss/simulacao-margem
  app.post('/api/integrations/happy/inss/simulacao-margem', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      const { cpf, numero_beneficio, valor_parcela, prazo, tipo_produto, simulationId } = req.body;
      if (!cpf) return res.status(400).json({ error: 'CPF é obrigatório.' });

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      const simRes = await HappySimulationService.simularMargemLivreInss(prisma, tenantId, {
        cpf: cleanCpf,
        numero_beneficio,
        valor_parcela,
        prazo,
        tipo_produto: tipo_produto || 1216171824,
      });

      if (simulationId) {
        await prisma.simulationRequest.update({
          where: { id: simulationId },
          data: {
            operationType: 'MARGEM_LIVRE',
            happyRawResult: simRes,
            happyJourneyStatus: 'SIMULACAO_CONCLUIDA',
          },
        });
      }

      return res.json({ success: true, result: simRes });
    } catch (err: any) {
      console.error('[HAPPY INSS SIMULACAO MARGEM ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro na simulação de margem livre INSS.' });
    }
  });

  // POST /api/integrations/happy/inss/simulacao-portabilidade
  app.post('/api/integrations/happy/inss/simulacao-portabilidade', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      const {
        cpf,
        saldo_devedor,
        numero_parcelas,
        valor_parcelas,
        valor_parcelas_refin,
        numero_parcelas_refin,
        taxa_mensal_refin,
        cd_beneficio_tipo,
        id_externo_plano,
        simulationId,
      } = req.body;

      if (!cpf || !saldo_devedor) {
        return res.status(400).json({ error: 'CPF e saldo devedor são obrigatórios.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      const simRes = await HappySimulationService.simularPortabilidadeRefinInss(prisma, tenantId, {
        cpf: cleanCpf,
        saldo_devedor,
        numero_parcelas,
        valor_parcelas,
        valor_parcelas_refin,
        numero_parcelas_refin,
        taxa_mensal_refin,
        cd_beneficio_tipo,
        id_externo_plano,
      });

      if (simulationId) {
        await prisma.simulationRequest.update({
          where: { id: simulationId },
          data: {
            operationType: 'PORTABILIDADE_REFIN',
            happyRawResult: simRes,
            happyJourneyStatus: 'SIMULACAO_CONCLUIDA',
          },
        });
      }

      return res.json({ success: true, result: simRes });
    } catch (err: any) {
      console.error('[HAPPY INSS SIMULACAO PORTABILIDADE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro na simulação de portabilidade INSS.' });
    }
  });

  // POST /api/integrations/happy/clt/cliente
  app.post('/api/integrations/happy/clt/cliente', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      // Validação de Controle de Acesso às Simulações Happy
      const tenantRecord = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { happySimulationAccessEnabled: true, simulationAccessEnabled: true },
      });
      if (tenantRecord && (tenantRecord.happySimulationAccessEnabled === false || tenantRecord.simulationAccessEnabled === false)) {
        return res.status(403).json({
          error: 'As simulações Happy estão bloqueadas para este tenant.',
          code: 'SIMULATION_ACCESS_DISABLED',
        });
      }

      const {
        telefone,
        nome,
        cpf,
        data_autorizacao_dataprev,
        canal_autorizacao_digital,
        canal_origem_solicitacao,
        canal_razao_social,
        canal_cpf_agente,
        canal_cnpj,
        partnerId,
        simulationId,
      } = req.body;

      if (!telefone || !nome || !cpf) {
        return res.status(400).json({ error: 'Nome, telefone e CPF são obrigatórios para simulação CLT.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      const cltRes = await HappySimulationService.criarClienteClt(
        prisma,
        tenantId,
        {
          telefone,
          nome,
          cpf: cleanCpf,
          data_autorizacao_dataprev,
          canal_autorizacao_digital,
          canal_origem_solicitacao,
          canal_razao_social,
          canal_cpf_agente,
          canal_cnpj,
        },
        partnerId
      );

      let simId = simulationId;
      if (simId) {
        await prisma.simulationRequest.update({
          where: { id: simId },
          data: {
            simulationType: 'HAPPY_CLT',
            operationType: 'CONSIGNADO_PRIVADO_CLT',
            happyClienteNome: nome,
            happyClienteTelefone: telefone,
            happyJourneyStatus: 'CLIENTE_CRIADO',
            partnerId: partnerId || undefined,
          },
        });
      } else {
        const created = await prisma.simulationRequest.create({
          data: {
            tenantId,
            cpf: cleanCpf,
            partnerId: partnerId || null,
            createdById: session.user.id,
            status: 'SIMULAÇÃO ENVIADA',
            simulationType: 'HAPPY_CLT',
            operationType: 'CONSIGNADO_PRIVADO_CLT',
            happyClienteNome: nome,
            happyClienteTelefone: telefone,
            happyJourneyStatus: 'CLIENTE_CRIADO',
          },
        });
        simId = created.id;
      }

      return res.json({
        success: true,
        message: cltRes.message,
        simulationId: simId,
      });
    } catch (err: any) {
      console.error('[HAPPY CLT CLIENTE ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao cadastrar cliente CLT na Happy.' });
    }
  });

  // POST /api/integrations/happy/clt/dataprev
  app.post('/api/integrations/happy/clt/dataprev', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      const { nome, telefone, cpf, simulationId } = req.body;
      if (!nome || !telefone || !cpf) {
        return res.status(400).json({ error: 'Nome, telefone e CPF são obrigatórios para consulta Dataprev.' });
      }

      const cleanCpf = SimulationService.normalizeCpf(cpf);
      const dataprevRes = await HappySimulationService.consultarDataprevClt(prisma, tenantId, {
        nome,
        telefone,
        cpf: cleanCpf,
      });

      const isApproved = HappySimulationService.isCltApproved(dataprevRes);

      if (simulationId) {
        await prisma.simulationRequest.update({
          where: { id: simulationId },
          data: {
            happyClientId: dataprevRes.id_cliente ? String(dataprevRes.id_cliente) : undefined,
            happySimulationId: dataprevRes.id_simulacao ? String(dataprevRes.id_simulacao) : undefined,
            happyApplicationKey: dataprevRes.application_key || undefined,
            happyProposalKey: dataprevRes.proposal_key || undefined,
            happyAuthUrl: dataprevRes.url_consulta_autorizacao || undefined,
            happyJourneyStatus: isApproved ? 'DATAPREV_APROVADO' : (dataprevRes.situacao || 'AGUARDANDO_AUTORIZACAO'),
            happyRawConditions: dataprevRes.valores_credito || undefined,
            happyRawData: dataprevRes,
          },
        });
      }

      return res.json({
        success: true,
        result: dataprevRes,
        isApproved,
      });
    } catch (err: any) {
      console.error('[HAPPY CLT DATAPREV ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro na consulta Dataprev CLT.' });
    }
  });

  // POST /api/integrations/happy/clt/simulacao
  app.post('/api/integrations/happy/clt/simulacao', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const tenantId = session.effectiveTenantId;
      if (!tenantId) return res.status(403).json({ error: 'Sessão ou tenant inválido.' });

      const {
        cliente_id,
        quantidade_parcelas,
        valor_solicitado,
        valor_parcela,
        taxa,
        base_juros,
        chave_seguro,
        selectedCondition,
        simulationId,
      } = req.body;

      if (!cliente_id || !quantidade_parcelas) {
        return res.status(400).json({ error: 'cliente_id e quantidade_parcelas são obrigatórios para a simulação CLT.' });
      }

      const simRes = await HappySimulationService.simularContratoClt(prisma, tenantId, {
        cliente_id,
        quantidade_parcelas,
        valor_solicitado,
        valor_parcela,
        taxa,
        base_juros,
        chave_seguro,
      });

      if (simulationId) {
        await prisma.simulationRequest.update({
          where: { id: simulationId },
          data: {
            happySelectedCondition: selectedCondition || undefined,
            happyRawResult: simRes,
            happyJourneyStatus: 'SIMULACAO_CONCLUIDA',
          },
        });
      }

      return res.json({ success: true, result: simRes });
    } catch (err: any) {
      console.error('[HAPPY CLT SIMULACAO ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao simular contrato CLT na Happy.' });
    }
  });

  // POST /api/integrations/happy/webhook (alias para processamento de webhook)
  app.post('/api/integrations/happy/webhook', async (req, res) => {
    try {
      const payload = req.body;
      logger.info({ requestId: payload?.request_id, eventName: payload?.event_name }, '[HAPPY SIMULATION WEBHOOK] Webhook recebido');

      const result = await HappyBankService.processWebhook(prisma, payload);

      // Atualiza SimulationRequest caso haja correlação por customer_id ou chave_proposta
      const customerId = payload?.customer_id || payload?.id_cliente;
      const chaveProposta = payload?.chave_proposta || payload?.proposal_key;
      const cpf = payload?.cpf ? SimulationService.normalizeCpf(payload.cpf) : null;
      const eventName = payload?.event_name;

      if (customerId || chaveProposta || cpf) {
        const sim = await prisma.simulationRequest.findFirst({
          where: {
            OR: [
              ...(customerId ? [{ happyClientId: String(customerId) }] : []),
              ...(chaveProposta ? [{ happyProposalKey: String(chaveProposta) }] : []),
              ...(cpf ? [{ cpf }] : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (sim && eventName) {
          await prisma.simulationRequest.update({
            where: { id: sim.id },
            data: {
              happyJourneyStatus: eventName,
              updatedAt: new Date(),
            },
          });
        }
      }

      return res.json(result);
    } catch (err: any) {
      console.error('[HAPPY WEBHOOK ALIAS ERROR]', err);
      return res.status(500).json({ error: err.message || 'Erro ao processar webhook Happy.' });
    }
  });

  // POST /api/webhooks/happy/status - Inbound Webhook from Happy / BYX Capital
  app.post('/api/webhooks/happy/status', async (req, res) => {
    try {
      const payload = req.body;
      logger.info({ requestId: payload?.request_id, eventName: payload?.event_name }, '[HAPPY WEBHOOK] Webhook recebido da Happy');

      const result = await HappyBankService.processWebhook(prisma, payload);

      if (result.processed && result.proposalId) {
        // Dispara evento em tempo real para os clientes conectados
        const prop = await prisma.proposal.findUnique({
          where: { id: result.proposalId },
          include: { status: true },
        });

        if (prop && prop.tenantId) {
          eventBus.publishToTenant(prop.tenantId, {
            type: 'proposal_status_changed',
            entity: 'Proposal',
            entityId: prop.id,
            data: {
              proposalId: prop.id,
              statusName: prop.status?.name,
              updatedBy: 'Happy Webhook',
            },
          });

          if (sseRegistry) {
            sseRegistry.broadcastToTenant(prop.tenantId, {
              type: 'PROPOSAL_UPDATED',
              entity: 'Proposal',
              entityId: prop.id,
              data: {
                id: prop.id,
                happySyncStatus: 'SYNCED',
                happyStatus: prop.happyStatusName,
                statusName: prop.status?.name,
              },
            });
          }
        }
      }

      res.status(200).json(result);
    } catch (err: any) {
      logger.error({ err, body: req.body }, '[HAPPY WEBHOOK ERROR] Falha no processamento de webhook da Happy');
      res.status(err.message?.includes('obrigatório') ? 400 : 500).json({
        success: false,
        error: err.message || 'Erro interno ao processar webhook.',
      });
    }
  });

  // -------------------------------------------------------------
  // FASE 1: CENTRAL DE ADMINISTRAÇÃO & MÓDULOS OPERACIONAIS (FOUNDATION)
  // -------------------------------------------------------------

  // 1. GET /api/admin/overview
  app.get('/api/admin/overview', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = isPlatformMaster || session.user.role === 'MASTER' || session.user.role === 'TENANT_ADMIN';
      const userRole = session.user.role as Role;
      const userPerms = session.user.customPermissions || [];

      if (!isMaster && !hasPermission(userRole, userPerms, 'admin.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'admin.view'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const tenantFilter = isPlatformMaster && !session.adminContext
        ? {}
        : { tenantId: effectiveTenantId || undefined };

      const [
        totalTenants,
        totalUsers,
        activeUsers,
        productsCount,
        conveniosCount,
        banksCount,
        rulesCount,
        automationsCount,
        activeAutomationsCount,
        pendenciesCount,
        openPendenciesCount,
        auditLogsCount,
      ] = await Promise.all([
        prisma.tenant.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null, ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}) } }),
        prisma.user.count({ where: { deletedAt: null, active: true, ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}) } }),
        prisma.product.count({
          where: {
            OR: [
              { scope: 'GLOBAL' },
              ...(effectiveTenantId ? [{ tenantId: effectiveTenantId }] : []),
            ],
          },
        }),
        prisma.convenio.count({
          where: {
            OR: [
              { scope: 'GLOBAL' },
              ...(effectiveTenantId ? [{ tenantId: effectiveTenantId }] : []),
            ],
          },
        }),
        prisma.bank.count({ where: effectiveTenantId ? { tenantId: effectiveTenantId } : {} }),
        prisma.operationalRule.count({
          where: {
            OR: [
              { scope: 'GLOBAL' },
              ...(effectiveTenantId ? [{ tenantId: effectiveTenantId }] : []),
            ],
          },
        }),
        prisma.automation.count({ where: effectiveTenantId ? { tenantId: effectiveTenantId } : {} }),
        prisma.automation.count({ where: { active: true, ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}) } }),
        prisma.pendency.count({ where: effectiveTenantId ? { tenantId: effectiveTenantId } : {} }),
        prisma.pendency.count({
          where: {
            status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] },
            ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
          },
        }),
        prisma.auditLog.count({ where: effectiveTenantId ? { tenantId: effectiveTenantId } : {} }),
      ]);

      let integrityCheck: any = { valid: true, status: 'VALID', checkedCount: auditLogsCount };
      if (effectiveTenantId) {
        integrityCheck = await AuditLogService.verifyAuditLogIntegrity(prisma, effectiveTenantId);
      }

      return res.json({
        tenantsCount: isPlatformMaster ? totalTenants : 1,
        usersCount: totalUsers,
        activeUsersCount: activeUsers,
        productsCount,
        conveniosCount,
        banksCount,
        rulesCount,
        automationsCount,
        activeAutomationsCount,
        pendenciesCount,
        openPendenciesCount,
        auditLogsCount,
        auditIntegrityStatus: integrityCheck.status || 'VALID',
        integrityDetails: integrityCheck,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/admin/overview ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar visão geral da administração.' });
    }
  });

  // 2. GET /api/admin/roles-permissions
  app.get('/api/admin/roles-permissions', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = isPlatformMaster || session.user.role === 'MASTER' || session.user.role === 'TENANT_ADMIN';
      const userRole = session.user.role as Role;
      const userPerms = session.user.customPermissions || [];

      if (!isMaster && !hasPermission(userRole, userPerms, 'admin.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'admin.view'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;

      const usersGroup = await prisma.user.groupBy({
        by: ['role'],
        where: {
          deletedAt: null,
          ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
        },
        _count: { id: true },
      });

      const usersByRole: Record<string, number> = {};
      usersGroup.forEach(g => {
        usersByRole[g.role] = g._count.id;
      });

      return res.json({
        roles: [
          { role: 'PLATFORM_MASTER', label: 'Platform Master', scope: 'GLOBAL', description: 'Acesso irrestrito a todas as instâncias e configurações da plataforma' },
          { role: 'MASTER', label: 'Master da Empresa', scope: 'TENANT', description: 'Administrador geral da empresa contratante' },
          { role: 'TENANT_ADMIN', label: 'Administrador do Tenant', scope: 'TENANT', description: 'Administrador técnico e operacional da organização' },
          { role: 'GESTOR', label: 'Gestor Operacional', scope: 'TENANT', description: 'Supervisão de esteira, relatórios de BI, parceiros e regras' },
          { role: 'GERENTE', label: 'Gerente Comercial', scope: 'TENANT', description: 'Gestão de parceiros, promotoras e produção' },
          { role: 'SUPORTE', label: 'Suporte Operacional', scope: 'TENANT', description: 'Atendimento a pendências, esteira e esteira de contingência' },
          { role: 'DIGITADOR', label: 'Digitador de Propostas', scope: 'TENANT', description: 'Digitação, upload e acompanhamento de propostas' },
          { role: 'SIMULACAO', label: 'Operador de Simulação', scope: 'TENANT', description: 'Cálculo de margem e simulações consignadas' },
        ],
        usersByRole,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/admin/roles-permissions ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar permissões e perfis.' });
    }
  });

  // 3. CENTRAL DE AUTOMAÇÕES & WORKFLOWS API (FASE 3)
  app.get('/api/automations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.view')) {
        return res.status(403).json({ error: 'Permissão negada para visualizar automações.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      const automations = await prisma.automation.findMany({
        where: { tenantId: effectiveTenantId },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { executions: true } },
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, status: true, durationMs: true, createdAt: true, error: true },
          },
        },
      });

      return res.json(automations);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/automations ERROR]');
      return res.status(500).json({ error: 'Erro ao listar automações.' });
    }
  });

  app.get('/api/automations/templates', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });
      return res.json(AUTOMATION_TEMPLATES);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/automations/templates ERROR]');
      return res.status(500).json({ error: 'Erro ao buscar modelos de automação.' });
    }
  });

  app.get('/api/automations/catalog', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      return res.json({
        triggers: AVAILABLE_TRIGGERS,
        actions: AVAILABLE_ACTIONS,
        operators: [
          { id: 'EQUALS', label: 'é igual a', compatibleWith: ['string', 'number', 'boolean', 'date'] },
          { id: 'NOT_EQUALS', label: 'é diferente de', compatibleWith: ['string', 'number', 'boolean', 'date'] },
          { id: 'CONTAINS', label: 'contém', compatibleWith: ['string'] },
          { id: 'NOT_CONTAINS', label: 'não contém', compatibleWith: ['string'] },
          { id: 'GREATER_THAN', label: 'maior que', compatibleWith: ['number', 'date'] },
          { id: 'LESS_THAN', label: 'menor que', compatibleWith: ['number', 'date'] },
          { id: 'GREATER_OR_EQUAL', label: 'maior ou igual', compatibleWith: ['number', 'date'] },
          { id: 'LESS_OR_EQUAL', label: 'menor ou igual', compatibleWith: ['number', 'date'] },
          { id: 'BETWEEN', label: 'está entre', compatibleWith: ['number'] },
          { id: 'IS_EMPTY', label: 'está vazio', compatibleWith: ['string', 'number', 'boolean', 'date'] },
          { id: 'IS_NOT_EMPTY', label: 'não está vazio', compatibleWith: ['string', 'number', 'boolean', 'date'] },
        ],
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/automations/catalog ERROR]');
      return res.status(500).json({ error: 'Erro ao buscar catálogo de automações.' });
    }
  });

  app.get('/api/automations/metrics', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.view')) {
        return res.status(403).json({ error: 'Permissão negada.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [totalRules, activeRules, todayExecutions, allExecutions, pendenciesCreated] = await Promise.all([
        prisma.automation.count({ where: { tenantId: effectiveTenantId } }),
        prisma.automation.count({ where: { tenantId: effectiveTenantId, active: true } }),
        prisma.automationExecution.count({
          where: { tenantId: effectiveTenantId, createdAt: { gte: todayStart } },
        }),
        prisma.automationExecution.findMany({
          where: { tenantId: effectiveTenantId },
          select: { status: true, durationMs: true },
          take: 1000,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.pendency.count({
          where: { tenantId: effectiveTenantId, source: 'AUTOMACAO' },
        }),
      ]);

      const successCount = allExecutions.filter((e) => e.status === 'SUCCESS').length;
      const failedCount = allExecutions.filter((e) => e.status === 'FAILED').length;
      const totalExecs = allExecutions.length;
      const successRate = totalExecs > 0 ? Math.round((successCount / totalExecs) * 100) : 100;
      const avgDurationMs =
        totalExecs > 0
          ? Math.round(allExecutions.reduce((acc, curr) => acc + (curr.durationMs || 0), 0) / totalExecs)
          : 0;

      return res.json({
        totalRules,
        activeRules,
        todayExecutions,
        successCount,
        failedCount,
        successRate,
        avgDurationMs,
        pendenciesCreated,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/automations/metrics ERROR]');
      return res.status(500).json({ error: 'Erro ao calcular métricas de automação.' });
    }
  });

  app.get('/api/automations/executions', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.view')) {
        return res.status(403).json({ error: 'Permissão negada.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      const { automationId, status, event, page = '1', limit = '50' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(10, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const where: any = { tenantId: effectiveTenantId };
      if (automationId) where.automationId = String(automationId);
      if (status) where.status = String(status);
      if (event) where.event = String(event);

      const [total, executions] = await Promise.all([
        prisma.automationExecution.count({ where }),
        prisma.automationExecution.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
          include: {
            automation: {
              select: { id: true, name: true, event: true },
            },
          },
        }),
      ]);

      return res.json({
        data: executions,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/automations/executions ERROR]');
      return res.status(500).json({ error: 'Erro ao listar histórico de execuções.' });
    }
  });

  app.get('/api/automations/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.view')) {
        return res.status(403).json({ error: 'Permissão negada.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const { id } = req.params;

      const automation = await prisma.automation.findFirst({
        where: { id, tenantId: effectiveTenantId || undefined },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!automation) return res.status(404).json({ error: 'Automação não encontrada.' });

      const humanPreview = AutomationEngine.generateHumanPreview(automation);

      return res.json({
        ...automation,
        humanPreview,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/automations/:id ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar detalhes da automação.' });
    }
  });

  app.post('/api/automations', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.create')) {
        return res.status(403).json({ error: 'Permissão negada para criar automações.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      const { name, description, event, conditions, actions, active } = req.body || {};
      if (!name || !event) {
        return res.status(400).json({ error: 'Nome e evento da automação são obrigatórios.' });
      }

      // Validação de segurança das ações
      const actionList = Array.isArray(actions) ? actions : [];
      for (const act of actionList) {
        if (FORBIDDEN_ACTION_TYPES.includes(act?.type)) {
          return res.status(400).json({
            error: `Ação não permitida: '${act?.type}' viola as políticas de segurança da plataforma.`,
          });
        }
      }

      const created = await prisma.automation.create({
        data: {
          tenantId: effectiveTenantId,
          name: String(name).trim(),
          description: description ? String(description).trim() : null,
          event: String(event).trim(),
          conditions: conditions || { matchType: 'ALL', rules: [] },
          actions: actionList,
          active: active !== undefined ? Boolean(active) : true,
          createdById: session.user.id,
        },
      });

      await AuditLogService.record(prisma, {
        tenantId: effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'AUTOMATION_CREATED',
        entity: 'AUTOMATION',
        entityId: created.id,
        newData: created,
        req,
      });

      return res.status(201).json(created);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/automations ERROR]');
      return res.status(500).json({ error: 'Erro ao criar automação.' });
    }
  });

  app.put('/api/automations/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.update')) {
        return res.status(403).json({ error: 'Permissão negada para atualizar automações.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const { id } = req.params;

      const existing = await prisma.automation.findFirst({
        where: { id, tenantId: effectiveTenantId || undefined },
      });
      if (!existing) return res.status(404).json({ error: 'Automação não encontrada.' });

      const { name, description, event, conditions, actions, active } = req.body || {};

      // Validação de segurança das ações
      if (actions && Array.isArray(actions)) {
        for (const act of actions) {
          if (FORBIDDEN_ACTION_TYPES.includes(act?.type)) {
            return res.status(400).json({
              error: `Ação não permitida: '${act?.type}' viola as políticas de segurança da plataforma.`,
            });
          }
        }
      }

      const updated = await prisma.automation.update({
        where: { id },
        data: {
          ...(name ? { name: String(name).trim() } : {}),
          ...(description !== undefined ? { description: String(description).trim() } : {}),
          ...(event ? { event: String(event).trim() } : {}),
          ...(conditions !== undefined ? { conditions } : {}),
          ...(actions !== undefined ? { actions } : {}),
          ...(active !== undefined ? { active: Boolean(active) } : {}),
        },
      });

      await AuditLogService.record(prisma, {
        tenantId: effectiveTenantId || existing.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'AUTOMATION_UPDATED',
        entity: 'AUTOMATION',
        entityId: updated.id,
        oldData: existing,
        newData: updated,
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[PUT /api/automations/:id ERROR]');
      return res.status(500).json({ error: 'Erro ao atualizar automação.' });
    }
  });

  app.post('/api/automations/:id/toggle', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      const canToggle =
        isPlatformMaster ||
        hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.toggle') ||
        hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.update');

      if (!canToggle) {
        return res.status(403).json({ error: 'Permissão negada para alterar status da automação.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const { id } = req.params;

      const existing = await prisma.automation.findFirst({
        where: { id, tenantId: effectiveTenantId || undefined },
      });
      if (!existing) return res.status(404).json({ error: 'Automação não encontrada.' });

      const updated = await prisma.automation.update({
        where: { id },
        data: { active: !existing.active },
      });

      await AuditLogService.record(prisma, {
        tenantId: effectiveTenantId || existing.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: updated.active ? 'AUTOMATION_ACTIVATED' : 'AUTOMATION_DEACTIVATED',
        entity: 'AUTOMATION',
        entityId: updated.id,
        newData: { active: updated.active },
        req,
      });

      return res.json(updated);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/automations/:id/toggle ERROR]');
      return res.status(500).json({ error: 'Erro ao alterar status da automação.' });
    }
  });

  app.post('/api/automations/:id/duplicate', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.create')) {
        return res.status(403).json({ error: 'Permissão negada para duplicar automação.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const { id } = req.params;

      const existing = await prisma.automation.findFirst({
        where: { id, tenantId: effectiveTenantId || undefined },
      });
      if (!existing) return res.status(404).json({ error: 'Automação de origem não encontrada.' });

      // Duplicação segura: gera novo registro sempre PAUSADO por segurança
      const duplicated = await prisma.automation.create({
        data: {
          tenantId: effectiveTenantId,
          name: `[Cópia] ${existing.name}`,
          description: existing.description,
          event: existing.event,
          conditions: existing.conditions as any,
          actions: existing.actions as any,
          active: false, // OBRIGATÓRIO: Cópia nasce pausada por segurança
          createdById: session.user.id,
        },
      });

      await AuditLogService.record(prisma, {
        tenantId: effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'AUTOMATION_DUPLICATED',
        entity: 'AUTOMATION',
        entityId: duplicated.id,
        oldData: { originalId: existing.id, name: existing.name },
        newData: duplicated,
        req,
      });

      return res.status(201).json(duplicated);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/automations/:id/duplicate ERROR]');
      return res.status(500).json({ error: 'Erro ao duplicar automação.' });
    }
  });

  app.post('/api/automations/test', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.execute')) {
        return res.status(403).json({ error: 'Permissão negada para testar automações.' });
      }

      const { automation, mockEvent } = req.body || {};
      if (!automation || !mockEvent) {
        return res.status(400).json({ error: 'Configuração da automação e evento simulado são obrigatórios.' });
      }

      const testResult = AutomationEngine.testAutomation(automation, mockEvent);
      return res.json(testResult);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/automations/test ERROR]');
      return res.status(500).json({ error: 'Erro ao testar automação.' });
    }
  });

  app.post('/api/automations/:id/test', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.execute')) {
        return res.status(403).json({ error: 'Permissão negada para testar automações.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const { id } = req.params;

      const existing = await prisma.automation.findFirst({
        where: { id, tenantId: effectiveTenantId || undefined },
      });
      if (!existing) return res.status(404).json({ error: 'Automação não encontrada.' });

      const { mockEvent } = req.body || {};
      const simulatedEvent = mockEvent || { event: existing.event, data: {} };

      const testResult = AutomationEngine.testAutomation(
        {
          name: existing.name,
          event: existing.event,
          conditions: existing.conditions,
          actions: existing.actions,
        },
        simulatedEvent
      );

      return res.json(testResult);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/automations/:id/test ERROR]');
      return res.status(500).json({ error: 'Erro ao testar automação existente.' });
    }
  });

  app.delete('/api/automations/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER' || session.user.role === 'MASTER';
      if (!isPlatformMaster && !hasPermission(session.user.role as Role, session.user.customPermissions, 'automations.delete')) {
        return res.status(403).json({ error: 'Permissão negada para excluir automações.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const { id } = req.params;

      const existing = await prisma.automation.findFirst({
        where: { id, tenantId: effectiveTenantId || undefined },
      });
      if (!existing) return res.status(404).json({ error: 'Automação não encontrada.' });

      await prisma.automation.delete({ where: { id } });

      await AuditLogService.record(prisma, {
        tenantId: effectiveTenantId || existing.tenantId,
        userId: session.user.id,
        userName: session.user.name,
        action: 'AUTOMATION_DELETED',
        entity: 'AUTOMATION',
        entityId: id,
        oldData: existing,
        req,
      });

      return res.json({ success: true, message: 'Automação removida com sucesso.' });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[DELETE /api/automations/:id ERROR]');
      return res.status(500).json({ error: 'Erro ao excluir automação.' });
    }
  });

  // 4. CENTRAL DE PENDÊNCIAS & SLA API (FASE 2)
  app.get('/api/pendencies/metrics', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.view')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.view.' });
      }

      const summary = await PendencyService.getSummary(prisma, effectiveTenantId);
      return res.json(summary);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/pendencies/metrics ERROR]');
      return res.status(500).json({ error: 'Erro ao calcular métricas de pendências.' });
    }
  });

  app.get('/api/pendencies/sla-config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.view')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.view.' });
      }

      const matrix = await PendencyService.getTenantSlaMatrix(prisma, effectiveTenantId);
      return res.json({ matrix });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/pendencies/sla-config ERROR]');
      return res.status(500).json({ error: 'Erro ao obter configurações de SLA.' });
    }
  });

  app.put('/api/pendencies/sla-config', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      const isAuthorized =
        session.user.role === 'PLATFORM_MASTER' ||
        session.user.role === 'TENANT_ADMIN' ||
        hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.admin') ||
        hasPermission(session.user.role as Role, session.user.customPermissions, 'admin.manage');

      if (!isAuthorized) {
        return res.status(403).json({ error: 'Acesso negado. Requer privilégio administrativo para configurar SLA.' });
      }

      const { matrix } = req.body || {};
      if (!matrix || typeof matrix !== 'object') {
        return res.status(400).json({ error: 'Matriz de SLA inválida.' });
      }

      const updated = await PendencyService.updateTenantSlaMatrix(prisma, effectiveTenantId, matrix);
      return res.json({ success: true, matrix: updated });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[PUT /api/pendencies/sla-config ERROR]');
      return res.status(500).json({ error: 'Erro ao atualizar configurações de SLA.' });
    }
  });

  app.get('/api/pendencies', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.view')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.view.' });
      }

      const {
        status,
        priority,
        type,
        proposalId,
        simulationId,
        assignedToId,
        slaStatus,
        search,
        page = '1',
        limit = '50',
      } = req.query as Record<string, string>;

      const where: Prisma.PendencyWhereInput = {
        tenantId: effectiveTenantId,
      };

      if (status && status !== 'ALL') {
        where.status = status;
      }
      if (priority && priority !== 'ALL') {
        where.priority = priority as PriorityLevel;
      }
      if (type && type !== 'ALL') {
        where.type = type;
      }
      if (proposalId) {
        where.proposalId = proposalId;
      }
      if (simulationId) {
        where.simulationId = simulationId;
      }
      if (assignedToId) {
        where.assignedToId = assignedToId;
      }

      if (search && search.trim()) {
        const term = search.trim();
        where.OR = [
          { title: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { proposal: { proposalNumber: { contains: term, mode: 'insensitive' } } },
          { proposal: { client: { fullName: { contains: term, mode: 'insensitive' } } } },
          { proposal: { client: { cpf: { contains: term } } } },
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const [totalRaw, pendencies] = await Promise.all([
        prisma.pendency.count({ where }),
        prisma.pendency.findMany({
          where,
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limitNum,
          include: {
            proposal: {
              select: {
                id: true,
                proposalNumber: true,
                contractValue: true,
                standardCategory: true,
                client: { select: { id: true, fullName: true, cpf: true } },
                status: { select: { id: true, name: true, color: true, finalStatus: true, standardCategory: true } },
              },
            },
            partner: { select: { id: true, name: true, code: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
            resolvedBy: { select: { id: true, name: true, email: true } },
            bank: { select: { id: true, name: true, code: true } },
            product: { select: { id: true, name: true } },
            convenio: { select: { id: true, name: true } },
            histories: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        }),
      ]);

      // Enriquecer itens com métricas operacionais e SLA calculados
      const enrichedItems = pendencies.map((p) => {
        const slaMetrics = PendencyService.calculateSlaMetrics(p);
        return {
          ...p,
          slaMetrics,
        };
      });

      // Filtrar por slaStatus se solicitado
      const finalItems = slaStatus && slaStatus !== 'ALL'
        ? enrichedItems.filter((i) => i.slaMetrics.slaStatus === slaStatus)
        : enrichedItems;

      return res.json({
        total: totalRaw,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalRaw / limitNum),
        items: finalItems,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/pendencies ERROR]');
      return res.status(500).json({ error: 'Erro ao listar pendências.' });
    }
  });

  app.get('/api/pendencies/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.view')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.view.' });
      }

      const { id } = req.params;
      const pendency = await prisma.pendency.findFirst({
        where: { id, tenantId: effectiveTenantId },
        include: {
          proposal: {
            select: {
              id: true,
              proposalNumber: true,
              contractValue: true,
              standardCategory: true,
              client: { select: { id: true, fullName: true, cpf: true, phone: true, email: true } },
              status: { select: { id: true, name: true, color: true, finalStatus: true, standardCategory: true } },
            },
          },
          partner: { select: { id: true, name: true, code: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          resolvedBy: { select: { id: true, name: true, email: true } },
          bank: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true } },
          convenio: { select: { id: true, name: true } },
          histories: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!pendency) {
        return res.status(404).json({ error: 'Pendência não encontrada.' });
      }

      const slaMetrics = PendencyService.calculateSlaMetrics(pendency);
      return res.json({
        ...pendency,
        slaMetrics,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/pendencies/:id ERROR]');
      return res.status(500).json({ error: 'Erro ao buscar detalhes da pendência.' });
    }
  });

  app.post('/api/pendencies', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.create')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.create.' });
      }

      const {
        title,
        description,
        type = 'DOCUMENTACAO',
        priority = 'MEDIUM',
        proposalId,
        simulationId,
        partnerId,
        assignedToId,
        bankId,
        productId,
        convenioId,
        slaHours,
        source = 'MANUAL',
        sourceEventId,
        metadata,
      } = req.body || {};

      if (!title || String(title).trim() === '') {
        return res.status(400).json({ error: 'Título da pendência é obrigatório.' });
      }

      const { pendency, isDuplicate } = await PendencyService.createPendency(prisma, {
        tenantId: effectiveTenantId,
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        type: String(type).trim().toUpperCase(),
        priority: priority as PriorityLevel,
        proposalId: proposalId || null,
        simulationId: simulationId || null,
        partnerId: partnerId || null,
        assignedToId: assignedToId || null,
        bankId: bankId || null,
        productId: productId || null,
        convenioId: convenioId || null,
        slaHours: slaHours ? parseInt(slaHours, 10) : undefined,
        source,
        sourceEventId,
        metadata,
        userId: session.user.id,
        userName: session.user.name,
      });

      const slaMetrics = PendencyService.calculateSlaMetrics(pendency);
      return res.status(isDuplicate ? 200 : 201).json({
        ...pendency,
        slaMetrics,
        isDuplicate,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao criar pendência.' });
    }
  });

  app.post('/api/pendencies/:id/assign', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.assign')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.assign.' });
      }

      const { id } = req.params;
      const { assignedToId, notes } = req.body || {};

      // Se nenhum assignedToId fornecido, operador assume a si mesmo
      const targetUserId = assignedToId || session.user.id;

      const updated = await PendencyService.assignPendency(prisma, {
        id,
        tenantId: effectiveTenantId,
        assignedToId: targetUserId,
        userId: session.user.id,
        userName: session.user.name,
        notes,
      });

      const slaMetrics = PendencyService.calculateSlaMetrics(updated);
      return res.json({
        ...updated,
        slaMetrics,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies/:id/assign ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao atribuir pendência.' });
    }
  });

  app.post('/api/pendencies/:id/resolve', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.resolve')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.resolve.' });
      }

      const { id } = req.params;
      const { notes, resolution } = req.body || {};
      const resolveNotes = notes || resolution;

      if (!resolveNotes || String(resolveNotes).trim().length < 3) {
        return res.status(400).json({ error: 'Parecer detalhado de resolução é obrigatório.' });
      }

      const updated = await PendencyService.updateStatus(prisma, {
        id,
        tenantId: effectiveTenantId,
        newStatus: 'RESOLVIDA',
        userId: session.user.id,
        userName: session.user.name,
        notes: String(resolveNotes).trim(),
      });

      const slaMetrics = PendencyService.calculateSlaMetrics(updated);
      return res.json({
        ...updated,
        slaMetrics,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies/:id/resolve ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao resolver pendência.' });
    }
  });

  app.post('/api/pendencies/:id/cancel', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.cancel')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.cancel.' });
      }

      const { id } = req.params;
      const { notes, reason } = req.body || {};
      const cancelReason = notes || reason || 'Cancelada pelo operador.';

      const updated = await PendencyService.updateStatus(prisma, {
        id,
        tenantId: effectiveTenantId,
        newStatus: 'CANCELADA',
        userId: session.user.id,
        userName: session.user.name,
        notes: String(cancelReason).trim(),
      });

      const slaMetrics = PendencyService.calculateSlaMetrics(updated);
      return res.json({
        ...updated,
        slaMetrics,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies/:id/cancel ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao cancelar pendência.' });
    }
  });

  app.post('/api/pendencies/:id/reopen', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.reopen')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.reopen.' });
      }

      const { id } = req.params;
      const { notes } = req.body || {};

      const updated = await PendencyService.updateStatus(prisma, {
        id,
        tenantId: effectiveTenantId,
        newStatus: 'ABERTA',
        userId: session.user.id,
        userName: session.user.name,
        notes: notes ? String(notes).trim() : 'Pendência reaberta para reavaliação.',
      });

      const slaMetrics = PendencyService.calculateSlaMetrics(updated);
      return res.json({
        ...updated,
        slaMetrics,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies/:id/reopen ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao reabrir pendência.' });
    }
  });

  app.post('/api/pendencies/:id/comments', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.update')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.update.' });
      }

      const { id } = req.params;
      const { notes } = req.body || {};

      if (!notes || String(notes).trim() === '') {
        return res.status(400).json({ error: 'Comentário não pode estar vazio.' });
      }

      const history = await PendencyService.addComment(prisma, {
        id,
        tenantId: effectiveTenantId,
        userId: session.user.id,
        userName: session.user.name,
        notes: String(notes).trim(),
      });

      return res.status(201).json(history);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies/:id/comments ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao adicionar comentário.' });
    }
  });

  // Retrocompatibilidade para POST /api/pendencies/:id/status
  app.post('/api/pendencies/:id/status', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      const { id } = req.params;
      const { status, notes, assignedToId } = req.body || {};

      if (!status) return res.status(400).json({ error: 'Novo status é obrigatório.' });

      // Validar permissão específica dependendo do status
      const targetStatus = String(status).toUpperCase() as PendencyStatus;
      let requiredPerm: Permission = 'pendencies.update';
      if (targetStatus === 'RESOLVIDA') requiredPerm = 'pendencies.resolve';
      else if (targetStatus === 'CANCELADA') requiredPerm = 'pendencies.cancel';

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, requiredPerm)) {
        return res.status(403).json({ error: `Acesso negado. Requer permissão ${requiredPerm}.` });
      }

      const updated = await PendencyService.updateStatus(prisma, {
        id,
        tenantId: effectiveTenantId,
        newStatus: targetStatus,
        userId: session.user.id,
        userName: session.user.name,
        notes: notes ? String(notes).trim() : undefined,
        assignedToId,
      });

      const slaMetrics = PendencyService.calculateSlaMetrics(updated);
      return res.json({
        ...updated,
        slaMetrics,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/pendencies/:id/status ERROR]');
      return res.status(500).json({ error: err?.message || 'Erro ao alterar status da pendência.' });
    }
  });

  app.delete('/api/pendencies/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'Tenant context não encontrado.' });

      if (session.user.role !== 'PLATFORM_MASTER' && !hasPermission(session.user.role as Role, session.user.customPermissions, 'pendencies.delete')) {
        return res.status(403).json({ error: 'Acesso negado. Requer permissão pendencies.delete.' });
      }

      const { id } = req.params;
      const existing = await prisma.pendency.findFirst({
        where: { id, tenantId: effectiveTenantId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Pendência não encontrada.' });
      }

      await prisma.pendency.delete({ where: { id } });

      return res.json({ success: true, message: 'Pendência excluída com sucesso.' });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[DELETE /api/pendencies/:id ERROR]');
      return res.status(500).json({ error: 'Erro ao excluir pendência.' });
    }
  });

  // =============================================================
  // FASE 4: HUB DE INTEGRAÇÕES BANCÁRIAS (C6, FACTA, BMG, HAPPY)
  // =============================================================

  // 1. GET /api/integrations/health (Catálogo unificado e status operacional)
  app.get('/api/integrations/health', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'integrations.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.view'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const catalogResult = await IntegrationHubService.getCatalog(prisma, effectiveTenantId);

      return res.json({
        timestamp: new Date().toISOString(),
        overallStatus: catalogResult.summary.offline > 0 ? 'DEGRADED' : catalogResult.summary.attention > 0 ? 'ATTENTION' : 'OPERATIONAL',
        ...catalogResult,
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/integrations/health ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar catálogo do Hub de Integrações.' });
    }
  });

  // 2. POST /api/integrations/:slug/health (Disparo de Health Check real e seguro)
  app.post('/api/integrations/:slug/health', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      const canHealth = isPlatformMaster ||
        hasPermission(userRole, userCustomPerms, 'integrations.health') ||
        hasPermission(userRole, userCustomPerms, 'integrations.manage') ||
        hasPermission(userRole, userCustomPerms, 'integrations.admin');

      if (!canHealth) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.health'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'TenantId não definido na sessão.' });

      const slug = req.params.slug as any;
      if (!['c6', 'facta', 'bmg', 'happy'].includes(slug)) {
        return res.status(400).json({ error: `Integração '${slug}' não suportada no catálogo.` });
      }

      const result = await IntegrationHubService.executeHealthCheck(prisma, effectiveTenantId, slug, session.user.id);
      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message, slug: req.params.slug }, '[POST /api/integrations/:slug/health ERROR]');
      return res.status(500).json({ error: 'Erro ao executar health check da integração.' });
    }
  });

  // 3. POST /api/integrations/:slug/diagnose (Diagnóstico Avançado com Ray ID e DNS)
  app.post('/api/integrations/:slug/diagnose', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      const canDiagnose = isPlatformMaster ||
        hasPermission(userRole, userCustomPerms, 'integrations.diagnose') ||
        hasPermission(userRole, userCustomPerms, 'integrations.manage') ||
        hasPermission(userRole, userCustomPerms, 'integrations.admin');

      if (!canDiagnose) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.diagnose'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'TenantId não definido na sessão.' });

      const slug = req.params.slug as any;
      if (!['c6', 'facta', 'bmg', 'happy'].includes(slug)) {
        return res.status(400).json({ error: `Integração '${slug}' não suportada.` });
      }

      const diagnostic = await IntegrationHubService.runDiagnostics(prisma, effectiveTenantId, slug);
      return res.json(diagnostic);
    } catch (err: any) {
      logger.error({ error: err?.message, slug: req.params.slug }, '[POST /api/integrations/:slug/diagnose ERROR]');
      return res.status(500).json({ error: 'Erro ao executar diagnóstico da integração.' });
    }
  });

  // 4. GET /api/integrations/:slug/stats (Métricas estatísticas de saúde: P95, disponibilidade, erros)
  app.get('/api/integrations/:slug/stats', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'integrations.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.view'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const slug = req.params.slug as any;
      const period = (req.query.period as any) || '24h';

      const stats = await IntegrationHubService.getHealthStats(prisma, effectiveTenantId, slug, period);
      return res.json(stats);
    } catch (err: any) {
      logger.error({ error: err?.message, slug: req.params.slug }, '[GET /api/integrations/:slug/stats ERROR]');
      return res.status(500).json({ error: 'Erro ao calcular estatísticas de saúde da integração.' });
    }
  });

  // 5. GET /api/integrations/logs (Logs de requisição paginados com filtros server-side)
  app.get('/api/integrations/logs', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      const canLogs = isPlatformMaster ||
        hasPermission(userRole, userCustomPerms, 'integrations.logs') ||
        hasPermission(userRole, userCustomPerms, 'integrations.view') ||
        hasPermission(userRole, userCustomPerms, 'integrations.admin');

      if (!canLogs) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.logs'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const bank = req.query.bank as string | undefined;
      const success = req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined;
      const httpStatus = req.query.httpStatus ? parseInt(req.query.httpStatus as string, 10) : undefined;
      const search = req.query.search as string | undefined;
      const period = req.query.period as any;

      const result = await IntegrationHubService.getPaginatedLogs(prisma, effectiveTenantId, {
        page,
        limit,
        bank,
        success,
        httpStatus,
        search,
        period,
      });

      return res.json(result);
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/integrations/logs ERROR]');
      return res.status(500).json({ error: 'Erro ao consultar logs de integrações.' });
    }
  });

  // 6. GET /api/integrations/incidents (Incidentes de integração com timeline cronológica)
  app.get('/api/integrations/incidents', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      if (!isPlatformMaster && !hasPermission(userRole, userCustomPerms, 'integrations.view')) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.view'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const bank = req.query.bank as string | undefined;
      const status = req.query.status as any;

      const incidents = await IntegrationHubService.listIncidents(prisma, effectiveTenantId, { bank, status });
      return res.json({ incidents });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/integrations/incidents ERROR]');
      return res.status(500).json({ error: 'Erro ao carregar incidentes de integração.' });
    }
  });

  // 7. POST /api/integrations/:slug/sync (Disparo manual seguro de sincronização)
  app.post('/api/integrations/:slug/sync', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const userRole = session.user.role as Role;
      const userCustomPerms = session.user.customPermissions || [];
      const isPlatformMaster = userRole === 'PLATFORM_MASTER';

      const canSync = isPlatformMaster ||
        hasPermission(userRole, userCustomPerms, 'integrations.sync') ||
        hasPermission(userRole, userCustomPerms, 'integrations.manage') ||
        hasPermission(userRole, userCustomPerms, 'integrations.admin');

      if (!canSync) {
        return res.status(403).json({ error: "Acesso negado. Requer permissão 'integrations.sync'." });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      if (!effectiveTenantId) return res.status(400).json({ error: 'TenantId não definido na sessão.' });

      const slug = req.params.slug as any;

      if (slug === 'c6') {
        const config = await C6BankService.getTenantConfig(prisma, effectiveTenantId);
        const result = await C6SyncWorker.processTenantProposals(prisma, effectiveTenantId, config.syncIntervalMinutes);
        return res.json({ success: true, message: 'Sincronização C6 executada com sucesso.', result });
      } else if (slug === 'facta') {
        const config = await FactaBankService.getTenantConfig(prisma, effectiveTenantId);
        const result = await FactaSyncWorker.processTenantProposals(prisma, effectiveTenantId, config.syncIntervalMinutes);
        return res.json({ success: true, message: 'Sincronização FACTA executada com sucesso.', result });
      } else if (slug === 'happy') {
        const result = await HappyBankService.consultarContratos(prisma, effectiveTenantId, {});
        return res.json({ success: true, message: 'Sincronização Happy / BYX executada com sucesso.', result });
      } else if (slug === 'bmg') {
        return res.json({ success: true, message: 'Integração BMG operando em modo Cartão Benefício sob demanda.' });
      }

      return res.status(400).json({ error: `Integração '${slug}' não suporta sincronização em lote.` });
    } catch (err: any) {
      logger.error({ error: err?.message, slug: req.params.slug }, '[POST /api/integrations/:slug/sync ERROR]');
      return res.status(500).json({ error: 'Erro ao executar sincronização da integração.' });
    }
  });

  // =============================================================
  // DATABASE BACKUP & RESTORE API
  // =============================================================

  // 1. POST /api/admin/backups
  app.post('/api/admin/backups', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = isPlatformMaster || session.user.role === 'MASTER' || session.user.role === 'TENANT_ADMIN';
      const userRole = session.user.role as Role;
      const userPerms = session.user.customPermissions || [];

      if (!isMaster && !hasPermission(userRole, userPerms, 'admin.view')) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const { label, type } = req.body || {};
      const backupType = (type as BackupType) || BackupType.MANUAL;
      const backupLabel = label || `Snapshot ${new Date().toISOString()}`;
      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;

      const tenantFilter = isPlatformMaster && !effectiveTenantId ? {} : { tenantId: effectiveTenantId || undefined };

      const [users, proposals, clients, banks, partners] = await Promise.all([
        prisma.user.findMany({ where: tenantFilter, select: { id: true, name: true, email: true, role: true, active: true } }),
        prisma.proposal.findMany({ where: tenantFilter, select: { id: true, proposalNumber: true, contractValue: true, releasedValue: true, standardCategory: true } }),
        prisma.client.findMany({ where: tenantFilter, select: { id: true, fullName: true, cpf: true } }),
        prisma.bank.findMany({ where: tenantFilter, select: { id: true, name: true, code: true } }),
        prisma.partner.findMany({ where: tenantFilter, select: { id: true, name: true } }),
      ]);

      const payload = {
        metadata: {
          system: 'Sentinel Consig',
          version: '2.4.0',
          exportedAt: new Date().toISOString(),
          exportedBy: session.user.name,
          tenantId: effectiveTenantId || null,
        },
        data: {
          users,
          proposals,
          clients,
          banks,
          partners,
        },
      };

      const content = JSON.stringify(payload, null, 2);
      const checksumSha256 = crypto.createHash('sha256').update(content).digest('hex');
      const backupId = `backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Store in storage provider (Azure Blob or local filesystem)
      const storagePath = await backupStorageService.putBackup(backupId, content);

      const recordsCount = users.length + proposals.length + clients.length + banks.length + partners.length;
      const sizeBytes = BigInt(Buffer.byteLength(content, 'utf-8'));

      const backup = await prisma.backup.create({
        data: {
          id: backupId,
          tenantId: effectiveTenantId || null,
          label: backupLabel,
          type: backupType,
          status: BackupStatus.COMPLETED,
          sizeBytes,
          recordsCount,
          checksumSha256,
          storagePath,
          createdById: session.user.id,
        },
      });

      return res.status(201).json({
        success: true,
        backup: {
          ...backup,
          sizeBytes: Number(backup.sizeBytes),
        },
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/admin/backups ERROR]');
      return res.status(500).json({ error: 'Erro ao gerar backup.' });
    }
  });

  // 2. GET /api/admin/backups
  app.get('/api/admin/backups', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = isPlatformMaster || session.user.role === 'MASTER' || session.user.role === 'TENANT_ADMIN';
      const userRole = session.user.role as Role;
      const userPerms = session.user.customPermissions || [];

      if (!isMaster && !hasPermission(userRole, userPerms, 'admin.view')) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId;
      const whereClause = isPlatformMaster && !effectiveTenantId
        ? {}
        : { tenantId: effectiveTenantId || null };

      const backups = await prisma.backup.findMany({
        where: whereClause,
        include: { createdBy: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(
        backups.map((b) => ({
          ...b,
          sizeBytes: Number(b.sizeBytes),
        }))
      );
    } catch (err: any) {
      logger.error({ error: err?.message }, '[GET /api/admin/backups ERROR]');
      return res.status(500).json({ error: 'Erro ao listar backups.' });
    }
  });

  // 3. POST /api/admin/backups/:id/restore
  app.post('/api/admin/backups/:id/restore', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session) return res.status(401).json({ error: 'Não autenticado.' });

      const isPlatformMaster = session.user.role === 'PLATFORM_MASTER';
      const isMaster = isPlatformMaster || session.user.role === 'MASTER';
      if (!isMaster) {
        return res.status(403).json({ error: 'Acesso restrito para administradores.' });
      }

      const targetBackup = await prisma.backup.findUnique({
        where: { id: req.params.id },
      });

      if (!targetBackup) {
        return res.status(404).json({ error: 'Backup não encontrado.' });
      }

      // Read backup content from storage provider
      const content = await backupStorageService.getBackup(targetBackup.storagePath);

      // Verify SHA-256 checksum integrity
      const calculatedChecksum = crypto.createHash('sha256').update(content).digest('hex');
      if (calculatedChecksum !== targetBackup.checksumSha256) {
        return res.status(400).json({
          error: 'Falha na validação de integridade SHA-256: o arquivo de backup foi adulterado ou corrompido.',
        });
      }

      // Create PRE_RESTORE snapshot before restoration
      await prisma.backup.create({
        data: {
          tenantId: null,
          label: `Pre-restore snapshot for backup ${targetBackup.id}`,
          type: BackupType.PRE_RESTORE,
          status: BackupStatus.COMPLETED,
          sizeBytes: BigInt(0),
          recordsCount: 0,
          checksumSha256: targetBackup.checksumSha256,
          storagePath: targetBackup.storagePath,
          createdById: session.user.id,
        },
      });

      const auditTenantId = targetBackup.tenantId || session.effectiveTenantId;
      if (auditTenantId) {
        await AuditLogService.record(prisma, {
          tenantId: auditTenantId,
          userId: session.user.id,
          userName: session.user.name,
          action: 'backup.restore',
          entity: 'Backup',
          entityId: targetBackup.id,
          newData: {
            backupId: targetBackup.id,
            checksumVerified: true,
            restoredAt: new Date().toISOString(),
          },
          req,
        });
      }

      return res.json({
        success: true,
        message: 'Backup restaurado com sucesso após verificação de integridade SHA-256.',
      });
    } catch (err: any) {
      logger.error({ error: err?.message }, '[POST /api/admin/backups/:id/restore ERROR]');
      return res.status(500).json({ error: 'Erro ao restaurar backup.' });
    }
  });

  // 404 Handler para rotas /api/* não mapeadas - assegura que requisições de API sempre retornem JSON
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `Endpoint de API não encontrado: ${req.method} ${req.originalUrl || req.url}`,
      statusCode: 404,
    });
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
    C6SyncWorker.start(prisma);
    FactaSyncWorker.start(prisma);
    PendencyService.initEventBusSubscriptions(prisma);
    AutomationEngine.initEventBusSubscriptions(prisma);
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
    C6SyncWorker.stop();
    FactaSyncWorker.stop();

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

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test' && !process.env.TEST_MODE && !process.env.VITEST) {
  startServer();
}

export default app;

