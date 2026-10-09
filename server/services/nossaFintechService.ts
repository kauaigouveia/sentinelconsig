import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { nossaFintechAgeError, nossaFintechBalanceError, nossaFintechTableRate, nossaFintechBenefitError } from '../../src/lib/inssEligibility';
import { getNossaFintechNovoOptions } from '../../src/lib/nossaFintech';

const API_BASE = 'https://nossa-fintech-api.spixiiservices.com.br';
const CONFIG_KEYS = {
  cpf: 'nossa_fintech_cpf',
  promoterId: 'nossa_fintech_promot_id',
  password: 'nossa_fintech_password',
  enabled: 'nossa_fintech_enabled',
} as const;

const allowedPrefixes = ['/nossa/v1/', '/nossa/v2/', '/inss/v1/', '/port-refin/v1/', '/clt-loan/v1/'];
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function encryptionKey() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('JWT_SECRET/AUTH_SECRET precisa estar configurado para proteger as credenciais Nossa Fintech.');
  return crypto.createHash('sha256').update(`sentinel:nossa-fintech:${secret}`).digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(value: string) {
  if (!value.startsWith('enc:v1:')) return value;
  const [, , iv, tag, payload] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
}

export interface NossaFintechConfig {
  isConfigured: boolean;
  enabled: boolean;
}

export class NossaFintechService {
  static async getConfig(prisma: PrismaClient, tenantId: string): Promise<NossaFintechConfig> {
    const entries = await prisma.systemConfig.findMany({ where: { tenantId, configKey: { in: Object.values(CONFIG_KEYS) } } });
    const map = new Map(entries.map(entry => [entry.configKey, entry.configValue]));
    return {
      isConfigured: Boolean(map.get(CONFIG_KEYS.cpf) && map.get(CONFIG_KEYS.promoterId) && map.get(CONFIG_KEYS.password)),
      enabled: map.get(CONFIG_KEYS.enabled) === 'true',
    };
  }

  static async saveConfig(prisma: PrismaClient, tenantId: string, values: { cpf?: string; promoterId?: string; password?: string; enabled?: boolean }) {
    const secrets: Array<[string, string | undefined]> = [
      [CONFIG_KEYS.cpf, values.cpf?.replace(/\D/g, '')],
      [CONFIG_KEYS.promoterId, values.promoterId?.trim()],
      [CONFIG_KEYS.password, values.password?.trim()],
    ];
    for (const [configKey, value] of secrets) {
      if (!value) continue;
      await prisma.systemConfig.upsert({
        where: { tenantId_configKey: { tenantId, configKey } },
        create: { tenantId, configKey, configValue: encrypt(value), isSecret: true },
        update: { configValue: encrypt(value), isSecret: true },
      });
    }
    if (values.enabled !== undefined) {
      await prisma.systemConfig.upsert({
        where: { tenantId_configKey: { tenantId, configKey: CONFIG_KEYS.enabled } },
        create: { tenantId, configKey: CONFIG_KEYS.enabled, configValue: String(values.enabled), isSecret: false },
        update: { configValue: String(values.enabled) },
      });
    }
    tokenCache.delete(tenantId);
    return this.getConfig(prisma, tenantId);
  }

  private static async credentials(prisma: PrismaClient, tenantId: string) {
    const entries = await prisma.systemConfig.findMany({ where: { tenantId, configKey: { in: [CONFIG_KEYS.cpf, CONFIG_KEYS.promoterId, CONFIG_KEYS.password] } } });
    const values = new Map(entries.map(entry => [entry.configKey, entry.configValue]));
    const cpf = values.get(CONFIG_KEYS.cpf);
    const promoterId = values.get(CONFIG_KEYS.promoterId);
    const password = values.get(CONFIG_KEYS.password);
    if (!cpf || !promoterId || !password) throw new Error('Configure CPF, código da promotora e senha Nossa Fintech no Hub de Integrações.');
    return { cpf: decrypt(cpf), promoterId: decrypt(promoterId), password: decrypt(password) };
  }

  private static async token(prisma: PrismaClient, tenantId: string, refresh = false): Promise<string> {
    const cached = tokenCache.get(tenantId);
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.token;
    const credentials = await this.credentials(prisma, tenantId);
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ cpf: credentials.cpf, promot_id: credentials.promoterId, password: credentials.password }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await this.readResponse(response);
    const token = (data as any)?.access_token;
    if (!response.ok || typeof token !== 'string' || !token) {
      throw new Error((data as any)?.message || `Falha de autenticação Nossa Fintech (HTTP ${response.status}).`);
    }
    tokenCache.set(tenantId, { token, expiresAt: Date.now() + 4 * 60_000 });
    return token;
  }

  private static async readResponse(response: Response): Promise<unknown> {
    const raw = await response.text();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return { message: raw.slice(0, 1000) }; }
  }

  private static validateEndpoint(endpoint: string) {
    if (typeof endpoint !== 'string' || !endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('..') || !allowedPrefixes.some(prefix => endpoint.startsWith(prefix))) {
      throw new Error('Endpoint Nossa Fintech não permitido. Use apenas os caminhos documentados de FGTS, INSS, Port/Refin ou CLT.');
    }
  }

  static async request(prisma: PrismaClient, tenantId: string, method: string, endpoint: string, body?: unknown) {
    if (!(await this.getConfig(prisma, tenantId)).enabled) throw new Error('Ative a integração Nossa Fintech no Hub antes de usar os serviços.');
    const normalizedMethod = method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) throw new Error('Método HTTP não permitido.');
    this.validateEndpoint(endpoint);
    const hasBody = normalizedMethod !== 'GET' && body !== undefined;
    const send = async (token: string) => {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: normalizedMethod,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(hasBody ? { 'Content-Type': 'application/json' } : {}) },
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
      return { response, data: await this.readResponse(response) };
    };
    let token = await this.token(prisma, tenantId);
    let result = await send(token);
    if (result.response.status === 401) {
      tokenCache.delete(tenantId);
      token = await this.token(prisma, tenantId, true);
      result = await send(token);
    }
    return { success: result.response.ok, status: result.response.status, data: result.data };
  }

  static async testConnection(prisma: PrismaClient, tenantId: string) {
    const startedAt = Date.now();
    await this.token(prisma, tenantId, true);
    return { success: true, status: 200, message: 'Autenticação Nossa Fintech concluída.', responseTimeMs: Date.now() - startedAt };
  }

  static async simulatePortabilityAcrossTables(prisma: PrismaClient, tenantId: string, input: {
    lastDueBalance: number; installmentFaceValue: number; openedInstallmentNumber: number;
    numberOfInstallments: number; legalRepresentative: boolean; birthDate: string; refinancingRate?: number; benefitType?: number;
  }) {
    const ageError = nossaFintechAgeError(input.birthDate, input.numberOfInstallments);
    if (ageError) throw new Error(ageError);
    const tableResult = await this.request(prisma, tenantId, 'GET', `/inss/v1/rebates_parceiro?op_type=PORT-REFIN&legal_rep=${input.legalRepresentative}`);
    if (!tableResult.success) return { success: false, status: tableResult.status, data: tableResult.data };
    const tableData = tableResult.data as any;
    const tables = Array.isArray(tableData) ? tableData
      : tableData?.tabela_rebates || tableData?.table_rebates || tableData?.items ||
        tableData?.data?.tabela_rebates || tableData?.data?.items || tableData?.data || [];
    const termCandidates = (Array.isArray(tables) ? tables : []).filter((table: any) => {
      const installments = Array.isArray(table.number_of_installments) ? table.number_of_installments.map(Number) : [];
      return table.cod_tabela && (!installments.length || installments.includes(input.numberOfInstallments));
    });
    const excludedTables: Array<{ table: any; reason: string }> = [];
    const candidates = termCandidates.filter((table: any) => {
      if (input.benefitType && nossaFintechBenefitError(table.name || table.nome_tabela || '', input.benefitType)) return false;
      if (input.refinancingRate !== undefined && Math.abs((nossaFintechTableRate(table) ?? 0) - input.refinancingRate) > 0.00001) return false;
      const reason = nossaFintechBalanceError(table, input.lastDueBalance);
      if (reason) excludedTables.push({ table, reason });
      return !reason;
    });
    if (!candidates.length) return { success: true, status: 200, data: { tables: [], results: [], excludedTables, message: 'Nenhuma tabela elegível para o prazo e saldo informados.' } };

    const results: Array<{ table: any; success: boolean; status: number; data?: unknown; error?: string }> = [];
    for (let index = 0; index < candidates.length; index += 4) {
      const batch = candidates.slice(index, index + 4);
      const batchResults = await Promise.all(batch.map(async (table: any) => {
        try {
          const response = await this.request(prisma, tenantId, 'POST', '/port-refin/v1/simulation', {
            last_due_balance: input.lastDueBalance,
            installment_face_value: input.installmentFaceValue,
            portability: { opened_installment_number: String(input.openedInstallmentNumber) },
            refinancing: { number_of_installments: String(input.numberOfInstallments), cod_tabela: String(table.cod_tabela) },
          });
          return { table, success: response.success, status: response.status, data: response.data };
        } catch (error: any) {
          return { table, success: false, status: 0, error: error.message || 'Falha ao consultar esta tabela.' };
        }
      }));
      results.push(...batchResults);
    }
    return { success: true, status: 200, data: { tables: candidates, results, excludedTables } };
  }

  static async simulateInssNovoAcrossTables(prisma: PrismaClient, tenantId: string, input: {
    numberOfInstallments: number; mode: 'INSTALLMENT' | 'AMOUNT'; value: number; legalRepresentative: boolean; birthDate: string; benefitType?: number;
  }) {
    const ageError = nossaFintechAgeError(input.birthDate, input.numberOfInstallments);
    if (ageError) throw new Error(ageError);
    const tableResult = await this.request(prisma, tenantId, 'GET', `/inss/v1/rebates_parceiro?op_type=NOVO&legal_rep=${input.legalRepresentative}`);
    if (!tableResult.success) return { success: false, status: tableResult.status, data: tableResult.data };
    const tableData = tableResult.data as any;
    const tables = Array.isArray(tableData) ? tableData
      : tableData?.tabela_rebates || tableData?.table_rebates || tableData?.items ||
        tableData?.data?.tabela_rebates || tableData?.data?.items || tableData?.data || [];
    const candidates = (Array.isArray(tables) ? tables : []).filter((table: any) => {
      const terms = Array.isArray(table.number_of_installments) ? table.number_of_installments.map(Number) : [];
      if (input.benefitType && nossaFintechBenefitError(table.name || table.nome_tabela || table.description || '', input.benefitType)) return false;
      return Number.isInteger(Number(table.cod_produto)) && Number(table.cod_produto) > 0 && (!terms.length || terms.includes(input.numberOfInstallments));
    });
    if (!candidates.length) return { success: true, status: 200, data: { results: [], message: input.benefitType ? `Nenhuma tabela compatível com a espécie ${input.benefitType} e o prazo de ${input.numberOfInstallments} meses foi retornada pela Nossa Fintech.` : 'Nossa Fintech não retornou tabelas para o prazo selecionado.' } };

    // Novo accepts cod_produto, so commercial tables sharing a product must not
    // cause identical requests or be presented as distinct simulated offers.
    const products = Array.from(new Set<number>(candidates.map((table: any) => Number(table.cod_produto))));
    const results: Array<{ table: any; success: boolean; status: number; data?: unknown; error?: string }> = [];
    for (let index = 0; index < products.length; index += 4) {
      const batch = products.slice(index, index + 4);
      const batchResults = await Promise.all(batch.map(async (product) => {
        const productTables = candidates.filter((table: any) => Number(table.cod_produto) === product);
        const names = [...new Set<string>(productTables.map((item: any) => item.name || item.nome_tabela).filter(Boolean))];
        const table = productTables.length === 1 ? productTables[0] : { cod_produto: product, name: names.length === 1 ? names[0] : `INSS Novo${input.benefitType && [4, 5, 6, 11, 32, 33, 34, 51, 83, 92].includes(input.benefitType) ? ' · Invalidez' : ''} · produto ${product}`, availableTables: productTables };
        try {
          const body = {
            number_of_installments: input.numberOfInstallments,
            cod_produto: product,
            ...(input.mode === 'INSTALLMENT' ? { installment_face_value: input.value } : { disbursed_amount: input.value }),
          };
          const response = await this.request(prisma, tenantId, 'POST', '/inss/v1/simulation', body);
          const options = response.success ? getNossaFintechNovoOptions(response.data).filter(option => {
            const returnedTable = (Array.isArray(tables) ? tables : []).find((candidate: any) => option.cod_tabela != null && String(candidate.cod_tabela) === String(option.cod_tabela));
            return !input.benefitType || !returnedTable || !nossaFintechBenefitError(returnedTable.name || returnedTable.nome_tabela || '', input.benefitType);
          }) : [];
          if (!options.length) {
            const payload = response.data as any;
            const detail = [payload?.message, payload?.detail, payload?.error].find(value => typeof value === 'string');
            return [{ table, success: false, status: response.status, data: response.data, error: detail || 'A Nossa Fintech não retornou uma opção com valor liberado válido para este produto.' }];
          }
          return options.map(option => ({
            table: productTables.find((candidate: any) => option.cod_tabela != null && String(candidate.cod_tabela) === String(option.cod_tabela)) || table,
            success: true, status: response.status, data: { ...(response.data as Record<string, unknown>), disbursement_options: [option] },
          }));
        } catch (error: any) {
          return [{ table, success: false, status: 0, error: error.message || 'Falha neste produto Nossa Fintech.' }];
        }
      }));
      results.push(...batchResults.flat());
    }
    return { success: true, status: 200, data: { tables: candidates, results } };
  }
}
