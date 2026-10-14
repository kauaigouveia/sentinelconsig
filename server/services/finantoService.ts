import { integrationConfigStore, integrationCacheKey, currentIntegrationPromoter, withIntegrationPromoter, resolveBankPromoter } from './bankPromoterConfig.js';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { BlobSASPermissions, StorageSharedKeyCredential, generateBlobSASQueryParameters } from '@azure/storage-blob';
import { getAzureContainerClient } from './azureBlobStorage';
import { finantoCalculationBody } from './finantoCalculation';

const CONFIG_KEY = 'finanto_api_key';
const API_BASE = 'https://integration.ajin.io';
const FILES_BASE = 'https://api-drive.ajin.io';

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('JWT_SECRET/AUTH_SECRET precisa estar configurado para proteger a chave FINANTO.');
  return crypto.createHash('sha256').update(`sentinel:finanto:${secret}`).digest();
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(value: string): string {
  if (!value.startsWith('enc:v1:')) return value; // Compatibilidade com chave cadastrada antes da criptografia.
  const [, , iv, tag, payload] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
}

export interface FinantoConfig {
  isConfigured: boolean;
  hasApiKey: boolean;
  enabled: boolean;
}

export class FinantoService {
  static readonly documentChunkSize = 512 * 1024;
  static documentBlockId(index: number) { return Buffer.from(String(index).padStart(6, '0')).toString('base64'); }
  static prepareDocument(tenantId: string, file: { name: string; type: string; size: number }) {
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || !Number.isInteger(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('Envie JPG, PNG ou PDF de até 5 MB.');
    return { uploadToken: encrypt(JSON.stringify({ tenantId, path: `finanto-temp/${tenantId}/${crypto.randomUUID()}`, name: String(file.name || 'documento').slice(0, 200), type: file.type, size: file.size, expiresAt: Date.now() + 20 * 60_000 })), chunkSize: this.documentChunkSize };
  }
  static documentTicket(tenantId: string, token: string) {
    if (typeof token !== 'string' || !token.startsWith('enc:v1:') || token.length > 2000) throw new Error('Envio de documento inválido.');
    const encodedParts = token.split(':').slice(2);
    if (encodedParts.length !== 3 || encodedParts.some(part => Buffer.from(part, 'base64').toString('base64') !== part)) throw new Error('Envio de documento inválido.');
    let ticket: any;
    try { ticket = JSON.parse(decrypt(token)); } catch { throw new Error('Envio de documento inválido.'); }
    if (ticket.tenantId !== tenantId || !ticket.path?.startsWith(`finanto-temp/${tenantId}/`) || ticket.expiresAt < Date.now() || !Number.isInteger(ticket.size) || ticket.size <= 0 || ticket.size > 5 * 1024 * 1024) throw new Error('Envio de documento expirado ou inválido.');
    return ticket;
  }
  static async uploadDocumentChunk(tenantId: string, body: any) {
    const ticket = this.documentTicket(tenantId, body.uploadToken);
    const count = Math.ceil(ticket.size / this.documentChunkSize);
    if (!Number.isInteger(body.index) || body.index < 0 || body.index >= count || typeof body.content !== 'string' || body.content.length > 710000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content)) throw new Error('Parte do documento inválida.');
    const data = Buffer.from(body.content, 'base64');
    const expected = Math.min(this.documentChunkSize, ticket.size - body.index * this.documentChunkSize);
    if (data.length !== expected) throw new Error('Parte do documento incompleta.');
    await getAzureContainerClient().getBlockBlobClient(ticket.path).stageBlock(this.documentBlockId(body.index), data, data.length);
  }

  static async saveAuthTermKey(prisma: PrismaClient, tenantId: string, simulationId: string, key: string) {
    const configKey = `finanto_auth_term:${simulationId}`;
    await (await integrationConfigStore(prisma, tenantId, 'finanto')).upsert({
      where: { tenantId_configKey: { tenantId, configKey } },
      create: { tenantId, configKey, configValue: encrypt(key), isSecret: true },
      update: { configValue: encrypt(key), isSecret: true },
    });
  }

  static async getAuthTermKey(prisma: PrismaClient, tenantId: string, simulationId: string) {
    const entry = await (await integrationConfigStore(prisma, tenantId, 'finanto')).findUnique({
      where: { tenantId_configKey: { tenantId, configKey: `finanto_auth_term:${simulationId}` } },
    });
    return entry?.configValue ? decrypt(entry.configValue) : null;
  }

  static async uploadTemporaryFile(prisma: PrismaClient, tenantId: string, file: { name: string; type: string; content: string } | { uploadToken: string }) {
    const container = getAzureContainerClient();
    let blobPath: string;
    let type: string;
    let name: string;
    if ('uploadToken' in file) {
      const ticket = this.documentTicket(tenantId, file.uploadToken);
      blobPath = ticket.path; type = ticket.type; name = ticket.name;
      const blob = container.getBlockBlobClient(blobPath);
      const blocks = Array.from({ length: Math.ceil(ticket.size / this.documentChunkSize) }, (_, index) => this.documentBlockId(index));
      await blob.commitBlockList(blocks, { blobHTTPHeaders: { blobContentType: type } });
      const properties = await blob.getProperties();
      if (properties.contentLength !== ticket.size) { await blob.deleteIfExists(); throw new Error('Documento incompleto. Envie novamente.'); }
    } else {
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) || typeof file.content !== 'string' || file.content.length > 7_000_000) throw new Error('Documento inválido. Envie JPG, PNG ou PDF de até 5 MB.');
      const data = Buffer.from(file.content, 'base64');
      if (!data.length || data.length > 5 * 1024 * 1024) throw new Error('Documento inválido ou maior que 5 MB.');
      blobPath = `finanto-temp/${tenantId}/${crypto.randomUUID()}`; type = file.type; name = file.name;
      await container.getBlockBlobClient(blobPath).uploadData(data, { blobHTTPHeaders: { blobContentType: type } });
    }
    const blob = container.getBlockBlobClient(blobPath);

    try {
      const connection = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
      const accountName = connection.match(/(?:^|;)AccountName=([^;]+)/i)?.[1] || process.env.AZURE_STORAGE_ACCOUNT_NAME || 'sentinelconsig2026';
      const accountKeyFromConnection = connection.match(/(?:^|;)AccountKey=([^;]+)/i)?.[1];
      const accountKey = accountKeyFromConnection || (connection.startsWith('DefaultEndpointsProtocol=') ? '' : connection);
      if (!accountName || !accountKey) throw new Error('Não foi possível gerar URL temporária para o documento.');
      const credential = new StorageSharedKeyCredential(accountName, accountKey);
      const now = new Date();
      const sas = generateBlobSASQueryParameters({
        containerName: container.containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(now.getTime() - 30_000),
        expiresOn: new Date(now.getTime() + 4 * 60_000),
      }, credential).toString();
      const upload = await this.request(prisma, tenantId, 'POST', '/v3/files/upload-by-url', { url: `${blob.url}?${sas}` });
      const response = upload.data as any;
      if (!upload.success || !response?.id || response?.messages?.length) {
        throw new Error(response?.messages?.map((item: any) => item?.text).filter(Boolean).join(' ') || 'A FINANTO não aceitou o documento enviado.');
      }
      return { id: String(response.id), name, type };
    } finally {
      await blob.deleteIfExists().catch(() => undefined);
    }
  }

  static async getConfig(prisma: PrismaClient, tenantId: string): Promise<FinantoConfig> {
    const entries = await (await integrationConfigStore(prisma, tenantId, 'finanto')).findMany({
      where: { tenantId, configKey: { in: [CONFIG_KEY, 'finanto_enabled'] } },
    });
    const map = new Map(entries.map(entry => [entry.configKey, entry.configValue]));
    return {
      isConfigured: Boolean(map.get(CONFIG_KEY)),
      hasApiKey: Boolean(map.get(CONFIG_KEY)),
      enabled: map.get('finanto_enabled') === 'true',
    };
  }

  static async saveConfig(prisma: PrismaClient, tenantId: string, apiKey?: string, enabled?: boolean) {
    if (apiKey?.trim()) {
      const encrypted = encrypt(apiKey.trim());
      await (await integrationConfigStore(prisma, tenantId, 'finanto')).upsert({
        where: { tenantId_configKey: { tenantId, configKey: CONFIG_KEY } },
        create: { tenantId, configKey: CONFIG_KEY, configValue: encrypted, isSecret: true },
        update: { configValue: encrypted, isSecret: true },
      });
    }
    if (enabled !== undefined) {
      await (await integrationConfigStore(prisma, tenantId, 'finanto')).upsert({
        where: { tenantId_configKey: { tenantId, configKey: 'finanto_enabled' } },
        create: { tenantId, configKey: 'finanto_enabled', configValue: String(enabled), isSecret: false },
        update: { configValue: String(enabled) },
      });
    }
    return this.getConfig(prisma, tenantId);
  }

  private static async getApiKey(prisma: PrismaClient, tenantId: string): Promise<string> {
    const entry = await (await integrationConfigStore(prisma, tenantId, 'finanto')).findUnique({
      where: { tenantId_configKey: { tenantId, configKey: CONFIG_KEY } },
    });
    if (!entry?.configValue) throw new Error('Configure a chave API da FINANTO no Hub de Integrações.');
    return decrypt(entry.configValue);
  }

  static async request(prisma: PrismaClient, tenantId: string, method: string, endpoint: string, body?: unknown, allowDisabled = false) {
    const normalizedMethod = method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
      throw new Error('Método HTTP não permitido.');
    }
    if (!endpoint.startsWith('/v3/') || endpoint.startsWith('//') || endpoint.includes('..')) {
      throw new Error('Endpoint FINANTO inválido.');
    }
    if (!allowDisabled && !(await this.getConfig(prisma, tenantId)).enabled) {
      throw new Error('Ative a integração FINANTO no Hub antes de usar os serviços.');
    }
    const apiKey = await this.getApiKey(prisma, tenantId);
    const isFileApi = endpoint.startsWith('/v3/files/');
    const url = `${isFileApi ? FILES_BASE : API_BASE}${endpoint}`;
    const response = await fetch(url, {
      method: normalizedMethod,
      headers: { apikey: apiKey, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(finantoCalculationBody(endpoint, body)) }),
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    let data: unknown = raw;
    if (contentType.includes('json')) {
      try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: 'Resposta JSON inválida da FINANTO.' }; }
    }
    return { success: response.ok, status: response.status, data };
  }

  static async testConnection(prisma: PrismaClient, tenantId: string) {
    const startedAt = Date.now();
    const result = await this.request(prisma, tenantId, 'GET', '/v3/about', undefined, true);
    return { ...result, responseTimeMs: Date.now() - startedAt };
  }
}
