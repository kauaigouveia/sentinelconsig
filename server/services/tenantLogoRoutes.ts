import crypto from 'node:crypto';
import type { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { buildLogoBlobPath, downloadBlob, uploadBlob } from './azureBlobStorage.js';
import { logger } from '../logger.js';

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_LOGO_SIZE / 3) * 4;
const SAFE_TENANT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_STORED_FILE = /^\d{13}_[0-9a-f-]{36}\.(png|jpg|webp)$/;
const ACCEPTED_MIMES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export interface TenantLogoRouteDependencies {
  getAuthSession: (req: Request) => Promise<any>;
  tenantExists: (tenantId: string) => Promise<boolean>;
  upload?: typeof uploadBlob;
  download?: typeof downloadBlob;
}

type ImageMime = keyof typeof ACCEPTED_MIMES;

type UploadStage = 'session' | 'tenant' | 'parse' | 'azure_upload';

/**
 * Report safe diagnostic categories only. Never serialize Azure errors,
 * connection strings, SAS tokens, request URLs or private blob contents.
 */
export function classifyLogoUploadFailure(error: unknown): {
  category: string;
  status: number | null;
  providerCode: string | null;
} {
  const e = error && typeof error === 'object' ? error as {
    code?: unknown;
    statusCode?: unknown;
    details?: { errorCode?: unknown };
    cause?: { code?: unknown };
    message?: unknown;
  } : {};
  const status = typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode <= 599
    ? e.statusCode : null;
  const rawCode = [e.details?.errorCode, e.code, e.cause?.code]
    .find(v => typeof v === 'string' && /^[A-Za-z0-9_-]{2,64}$/.test(v)) as string | undefined;
  const providerCode = rawCode ?? null;
  let category = 'unknown';
  if (providerCode && /Authentication|Authorization|InvalidAccount|AccountKey/i.test(providerCode) || status === 401 || status === 403)
    category = 'credentials_or_permissions';
  else if (providerCode && /ContainerNotFound|BlobNotFound/i.test(providerCode) || status === 404)
    category = 'storage_resource_missing';
  else if (providerCode && /ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|REQUEST_SEND_ERROR|AbortError|Timeout/i.test(providerCode))
    category = 'network';
  else if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504)
    category = 'storage_service_unavailable';
  else if (typeof e.message === 'string' && e.message.includes('AZURE_STORAGE_CONNECTION_STRING is missing'))
    category = 'missing_configuration';
  return { category, status, providerCode };
}

export function parseTenantLogoUpload(body: unknown):
  | { ok: true; data: Buffer; mime: ImageMime; extension: string }
  | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Arquivo não informado.' };
  const { fileBase64, mimeType } = body as { fileBase64?: unknown; mimeType?: unknown };
  if (typeof fileBase64 !== 'string' || typeof mimeType !== 'string')
    return { ok: false, reason: 'Imagem e formato são obrigatórios.' };
  if (!(mimeType in ACCEPTED_MIMES))
    return { ok: false, reason: 'Formato inválido. Use PNG, JPG ou WebP.' };

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(fileBase64);
  if (!match || match[1] !== mimeType)
    return { ok: false, reason: 'Arquivo de imagem inválido.' };
  const raw = match[2];
  if (raw.length > MAX_BASE64_LENGTH || raw.length % 4 !== 0)
    return { ok: false, reason: 'Imagem excede 2 MB ou está malformada.' };

  const data = Buffer.from(raw, 'base64');
  if (!data.length || data.length > MAX_LOGO_SIZE || data.toString('base64') !== raw)
    return { ok: false, reason: 'Imagem excede 2 MB ou está malformada.' };

  let contentMime: ImageMime | null = null;
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    // PNG must contain the IHDR header, with non-zero dimensions.
    if (data.toString('ascii', 12, 16) === 'IHDR' && data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0) {
      contentMime = 'image/png';
    }
  } else if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    contentMime = 'image/jpeg';
  } else if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    contentMime = 'image/webp';
  }
  if (contentMime !== mimeType)
    return { ok: false, reason: 'O conteúdo do arquivo não corresponde ao formato informado.' };

  return { ok: true, data, mime: contentMime, extension: ACCEPTED_MIMES[contentMime] };
}

/**
 * Rotas de logo do White-Label: gravam imagens com nome aleatório na Azure
 * e permitem somente leitura pública de arquivos dentro de logos/{tenantId}.
 * A identidade/escopo do tenant vem exclusivamente da sessão validada.
 */
export function registerTenantLogoRoutes(app: Express, deps: TenantLogoRouteDependencies): void {
  const uploadLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Limite de envios atingido. Tente novamente mais tarde.' },
  });

  app.post('/api/upload/logo', uploadLimit, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let stage: UploadStage = 'session';
    const started = Date.now();
    try {
      const session = await deps.getAuthSession(req);
      if (!session?.user) return res.status(401).json({ error: 'Entre na plataforma para enviar a logomarca.' });

      const role = String(session.user.role || '');
      if (!['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN'].includes(role))
        return res.status(403).json({ error: 'Sem permissão para personalizar a identidade visual.' });

      const effectiveTenantId = session.effectiveTenantId || session.user.tenantId || null;
      const selected = typeof req.body?.targetTenantId === 'string' ? req.body.targetTenantId.trim() : '';
      if (role !== 'PLATFORM_MASTER' && selected && selected !== effectiveTenantId)
        return res.status(403).json({ error: 'A empresa informada não corresponde à sessão.' });

      const tenantId = (role === 'PLATFORM_MASTER' && selected) ? selected : effectiveTenantId;
      if (!tenantId || !SAFE_TENANT_ID.test(tenantId))
        return res.status(400).json({ error: 'Empresa ativa não identificada.' });

      stage = 'tenant';
      if (!(await deps.tenantExists(tenantId)))
        return res.status(404).json({ error: 'Empresa não encontrada ou inativa.' });

      stage = 'parse';
      const parsed = parseTenantLogoUpload(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.reason });

      // Do not trust client-side filenames; use a random, unique stored name.
      const { blobPath } = buildLogoBlobPath(tenantId, `${crypto.randomUUID()}.${parsed.extension}`);
      const storedName = blobPath.slice(blobPath.lastIndexOf('/') + 1);
      stage = 'azure_upload';
      await (deps.upload ?? uploadBlob)(blobPath, parsed.data, parsed.mime);
      const logoUrl = `/api/public/logos/${tenantId}/${storedName}`;
      return res.status(201).json({ logoUrl });
    } catch (err) {
      const diagnosis = classifyLogoUploadFailure(err);
      logger.error({
        errorCode: 'WHITE_LABEL_LOGO_UPLOAD_FAILED',
        stage,
        storageCategory: diagnosis.category,
        storageStatus: diagnosis.status,
        storageCode: diagnosis.providerCode,
        durationMs: Date.now() - started,
      }, '[WHITELABEL] Upload failed');
      const responseStatus = stage === 'azure_upload' ? 503 : 500;
      return res.status(responseStatus).json({
        error: stage === 'azure_upload'
          ? 'Não foi possível conectar ao armazenamento da logomarca. Contate o administrador.'
          : 'Erro interno ao preparar o upload. Contate o administrador.',
      });
    }
  });

  app.get('/api/public/logos/:tenantId/:fileName', async (req, res) => {
    const { tenantId, fileName } = req.params;
    if (!SAFE_TENANT_ID.test(tenantId) || !SAFE_STORED_FILE.test(fileName))
      return res.status(404).end();

    try {
      const { buffer, contentType } = await (deps.download ?? downloadBlob)(`logos/${tenantId}/${fileName}`);
      if (!contentType || !(contentType in ACCEPTED_MIMES) || buffer.length > MAX_LOGO_SIZE)
        return res.status(404).end();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buffer);
    } catch (err: any) {
      if (err?.statusCode === 404) return res.status(404).end();
      logger.warn({ errorCode: 'WHITE_LABEL_LOGO_READ_FAILED' }, '[WHITELABEL] Logo read failed');
      return res.status(503).end();
    }
  });
}
