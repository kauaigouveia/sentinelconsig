import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';
import {
  FactaTenantConfig,
  FactaTokenResponse,
  FactaProposalItem,
  FactaQueryParams,
  FactaSyncResult,
} from './factaBankTypes.js';
import { mapFactaStatusToInternal } from './factaStatusMapper.js';
import { factaFetch } from './factaTransport.js';
import { normalizeFactaBaseUrl } from './factaBaseUrl.js';
import { resolveBankPromoter, readBankPromoterConfig, bankPromoterConfigKey, currentIntegrationPromoter } from './bankPromoterConfig.js';

interface TokenCacheEntry {
  token: string;
  expiresAt: number; // Timestamp em ms
}

export class FactaBankService {
  public static readonly HOMOLOGATION_BASE_URL = 'https://webservice-homol.facta.com.br';
  public static readonly PRODUCTION_BASE_URL = 'https://webservice.facta.com.br';
  private static readonly REQUEST_TIMEOUT_MS = 15000;
  private static readonly TOKEN_EXPIRATION_BUFFER_MS = 300000; // 5 minutos antes da expiração oficial de 1h

  // Cache de tokens em memória por tenant/ambiente
  private static tokenCache: Map<string, TokenCacheEntry> = new Map();

  // Promessas de geração de token em andamento para evitar chamadas simultâneas duplicadas
  private static inFlightTokenPromises: Map<string, Promise<string>> = new Map();

  // Trava de concorrência por proposta
  private static inFlightProposalQueries: Set<string> = new Set();

  /**
   * Obtém a configuração da FACTA para um determinado tenant.
   */
  public static async getTenantConfig(
    prisma: PrismaClient,
    tenantId: string,
    promoterId?: string
  ): Promise<FactaTenantConfig> {
    const promoter = await resolveBankPromoter(prisma, tenantId, promoterId || currentIntegrationPromoter(), 'DG');
    const { values: configMap, allowLegacy } = await readBankPromoterConfig(prisma, tenantId, 'facta', promoter.id, 'DG');
    const legacyEnv = (key: string) => allowLegacy ? process.env[key] : undefined;

    const rawEnv = (configMap.get('facta_environment') || legacyEnv('FACTA_ENVIRONMENT') || 'homologation').toLowerCase();
    const environment: 'homologation' | 'production' = rawEnv === 'production' ? 'production' : 'homologation';

    const defaultUrl = environment === 'production' ? this.PRODUCTION_BASE_URL : this.HOMOLOGATION_BASE_URL;
    const baseUrl = normalizeFactaBaseUrl(configMap.get('facta_base_url') || legacyEnv('FACTA_BASE_URL') || defaultUrl, environment);

    const username = (configMap.get('facta_username') || '').trim();
    const password = (configMap.get('facta_password') || '').trim();

    const autoSyncEnabled = configMap.has('facta_auto_sync_enabled')
      ? configMap.get('facta_auto_sync_enabled') === 'true'
      : legacyEnv('FACTA_AUTO_SYNC_ENABLED') === 'true';

    const rawInterval = configMap.get('facta_sync_interval_minutes') || legacyEnv('FACTA_SYNC_INTERVAL_MINUTES');
    const syncIntervalMinutes = Math.max(5, rawInterval ? parseInt(rawInterval, 10) || 15 : 15);

    const rawPageSize = configMap.get('facta_page_size');
    const pageSize = Math.min(5000, Math.max(10, rawPageSize ? parseInt(rawPageSize, 10) || 100 : 100));

    const dateQueryType = configMap.get('facta_date_query_type') === 'data_alteracao' ? 'data_alteracao' : 'data_movimento';

    const consultaSub = configMap.get('facta_consulta_sub') === 'S' ? 'S' : 'N';

    return {
      promoterId: promoter.id,
      promoterName: promoter.name,
      enabled: configMap.has('facta_enabled') ? configMap.get('facta_enabled') === 'true' : allowLegacy,
      environment,
      username,
      password,
      baseUrl,
      autoSyncEnabled,
      simulationEnabled: configMap.get('facta_simulation_enabled') === 'true',
      syncIntervalMinutes,
      pageSize,
      dateQueryType,
      convenio: configMap.get('facta_convenio') || undefined,
      averbador: configMap.get('facta_averbador') || undefined,
      codigoAf: configMap.get('facta_codigo_af') || undefined,
      consultaSub,
      codigoSub: configMap.get('facta_codigo_sub') || undefined,
      isConfigured: Boolean(username && password) && (configMap.has('facta_enabled') ? configMap.get('facta_enabled') === 'true' : allowLegacy),
      hasPassword: Boolean(password),
    };
  }

  /**
   * Salva as configurações da FACTA para um tenant.
   */
  public static async getPromoterConfigs(prisma: PrismaClient, tenantId: string) {
    const promoters = await prisma.promoter.findMany({ where: { tenantId, status: 'ATIVO' }, select: { id: true } });
    return Promise.all(promoters.map(promoter => this.getTenantConfig(prisma, tenantId, promoter.id)));
  }

  public static async saveTenantConfig(
    prisma: PrismaClient,
    tenantId: string,
    data: {
      enabled?: boolean;
      environment?: 'homologation' | 'production';
      username?: string;
      password?: string;
      baseUrl?: string;
      autoSyncEnabled?: boolean;
      simulationEnabled?: boolean;
      syncIntervalMinutes?: number;
      pageSize?: number;
      dateQueryType?: 'data_movimento' | 'data_alteracao';
      convenio?: string;
      averbador?: string;
      codigoAf?: string;
      consultaSub?: 'S' | 'N';
      codigoSub?: string;
    },
    promoterId?: string
  ): Promise<FactaTenantConfig> {
    const promoter = await resolveBankPromoter(prisma, tenantId, promoterId || currentIntegrationPromoter(), 'DG');
    const upsertConfig = async (key: string, value: string, isSecret = false) => {
      key = bankPromoterConfigKey('facta', promoter.id, key);
      await prisma.systemConfig.upsert({
        where: {
          tenantId_configKey: {
            tenantId,
            configKey: key,
          },
        },
        update: {
          configValue: value,
          isSecret,
        },
        create: {
          tenantId,
          configKey: key,
          configValue: value,
          isSecret,
        },
      });
    };

    let normalizedBaseUrl: string | undefined;
    if (data.baseUrl?.trim()) {
      const saved = await readBankPromoterConfig(prisma, tenantId, 'facta', promoter.id, 'DG');
      const savedEnvironment = saved.values.get('facta_environment') || (saved.allowLegacy ? process.env.FACTA_ENVIRONMENT : undefined);
      normalizedBaseUrl = normalizeFactaBaseUrl(data.baseUrl, data.environment || (savedEnvironment === 'production' ? 'production' : 'homologation'));
    }

    if (typeof data.enabled === 'boolean') await upsertConfig('facta_enabled', String(data.enabled));
    if (data.environment) {
      await upsertConfig('facta_environment', data.environment, false);
      const defaultUrl = data.environment === 'production' ? this.PRODUCTION_BASE_URL : this.HOMOLOGATION_BASE_URL;
      await upsertConfig('facta_base_url', defaultUrl, false);
      this.invalidateTokenCache(tenantId);
    }

    if (data.username !== undefined) {
      await upsertConfig('facta_username', data.username.trim(), false);
      this.invalidateTokenCache(tenantId);
    }

    if (data.password !== undefined && data.password.trim() !== '') {
      await upsertConfig('facta_password', data.password.trim(), true);
      this.invalidateTokenCache(tenantId);
    }

    if (data.baseUrl !== undefined && data.baseUrl.trim() !== '') {
      await upsertConfig('facta_base_url', normalizedBaseUrl!, false);
      this.invalidateTokenCache(tenantId);
    }

    if (data.autoSyncEnabled !== undefined) {
      await upsertConfig('facta_auto_sync_enabled', data.autoSyncEnabled ? 'true' : 'false', false);
    }
    if (typeof data.simulationEnabled === 'boolean') {
      await upsertConfig('facta_simulation_enabled', String(data.simulationEnabled));
    }

    if (data.syncIntervalMinutes !== undefined) {
      const interval = Math.max(5, Number(data.syncIntervalMinutes) || 15);
      await upsertConfig('facta_sync_interval_minutes', String(interval), false);
    }

    if (data.pageSize !== undefined) {
      const size = Math.min(5000, Math.max(10, Number(data.pageSize) || 100));
      await upsertConfig('facta_page_size', String(size), false);
    }

    if (data.dateQueryType !== undefined) {
      await upsertConfig('facta_date_query_type', data.dateQueryType, false);
    }

    if (data.convenio !== undefined) {
      await upsertConfig('facta_convenio', data.convenio.trim(), false);
    }

    if (data.averbador !== undefined) {
      await upsertConfig('facta_averbador', data.averbador.trim(), false);
    }

    if (data.codigoAf !== undefined) {
      await upsertConfig('facta_codigo_af', data.codigoAf.trim(), false);
    }

    if (data.consultaSub !== undefined) {
      await upsertConfig('facta_consulta_sub', data.consultaSub === 'S' ? 'S' : 'N', false);
    }

    if (data.codigoSub !== undefined) {
      await upsertConfig('facta_codigo_sub', data.codigoSub.trim(), false);
    }

    return this.getTenantConfig(prisma, tenantId, promoter.id);
  }

  /**
   * Invalida o cache de token em memória para um determinado tenant.
   */
  public static invalidateTokenCache(tenantId: string): void {
    for (const key of this.tokenCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.tokenCache.delete(key);
      }
    }
  }

  /**
   * Obtém ou gera um Bearer Token válido para a API FACTA.
   */
  public static async getToken(
    prisma: PrismaClient,
    tenantId: string,
    overrideConfig?: { username?: string; password?: string; baseUrl?: string; environment?: 'production' | 'homologation' },
    promoterId?: string
  ): Promise<string> {
    const config = await this.getTenantConfig(prisma, tenantId, promoterId);
    const username = overrideConfig?.username || config.username;
    const password = overrideConfig?.password || config.password;
    const baseUrl = normalizeFactaBaseUrl(overrideConfig?.baseUrl || config.baseUrl, overrideConfig?.environment || config.environment);

    if (!config.enabled) throw new Error('Conexão FACTA desativada para esta promotora.');
    if (!username || !password) {
      throw new Error('Credenciais da FACTA Financeira (usuário e senha) não configuradas.');
    }

    const cacheKey = `${tenantId}:${config.promoterId}:${username}:${baseUrl}:${process.env.FACTA_GATEWAY_URL || 'direct'}`;
    const now = Date.now();
    const cached = this.tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > now + this.TOKEN_EXPIRATION_BUFFER_MS) {
      return cached.token;
    }

    // Trava de concorrência contra requisições de token simultâneas
    const existingPromise = this.inFlightTokenPromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const fetchTokenPromise = (async () => {
      try {
        const tokenEndpoint = `${baseUrl}/gera-token`;
        const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

        const response = await factaFetch(tokenEndpoint, {
          method: 'GET',
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          let errText = '';
          try {
            errText = await response.text();
          } catch (_) {}

          if (status === 401 || status === 403) {
            throw new Error('Falha de autenticação FACTA: Usuário ou senha inválidos.');
          }
          throw new Error(`Erro ${status} ao solicitar token FACTA: ${errText || response.statusText}`);
        }

        const data: any = await response.json();
        if (data?.erro === true || data?.erro === 'true') throw new Error(data.mensagem || 'FACTA recusou a autenticação.');
        
        // Extrair o token da resposta
        let tokenStr = '';
        if (typeof data === 'string') {
          tokenStr = data;
        } else if (data && typeof data === 'object') {
          tokenStr = data.token || data.bearer_token || data.access_token || data.token_acesso || '';
          if (!tokenStr && data.error) {
            throw new Error(`FACTA retornou erro na geração de token: ${data.error || data.mensagem}`);
          }
        }

        if (!tokenStr || typeof tokenStr !== 'string' || !tokenStr.trim()) {
          throw new Error('Resposta de autenticação FACTA não forneceu um token válido.');
        }

        const cleanToken = tokenStr.trim();
        // Token expira em 1 hora (3600s)
        const expiresAt = now + 3600 * 1000;

        this.tokenCache.set(cacheKey, {
          token: cleanToken,
          expiresAt,
        });

        return cleanToken;
      } finally {
        this.inFlightTokenPromises.delete(cacheKey);
      }
    })();

    this.inFlightTokenPromises.set(cacheKey, fetchTokenPromise);
    return fetchTokenPromise;
  }

  /**
   * Testa a conexão e credenciais com a FACTA chamando /gera-token.
   */
  public static async testConnection(
    prisma: PrismaClient,
    tenantId: string,
    overrideConfig?: { username?: string; password?: string; baseUrl?: string; environment?: 'production' | 'homologation' },
    promoterId?: string
  ): Promise<{ success: boolean; message: string; responseTimeMs?: number; isHomologation?: boolean }> {
    const startTime = Date.now();
    try {
      this.invalidateTokenCache(tenantId);
      const config = await this.getTenantConfig(prisma, tenantId, promoterId);
      const activeBaseUrl = normalizeFactaBaseUrl(overrideConfig?.baseUrl || config.baseUrl, overrideConfig?.environment || config.environment);
      const isHomol = new URL(activeBaseUrl).hostname === 'webservice-homol.facta.com.br';

      const token = await this.getToken(prisma, tenantId, overrideConfig, promoterId);
      const responseTimeMs = Date.now() - startTime;

      if (token && typeof token === 'string' && token.length > 5) {
        return {
          success: true,
          message: `Conexão e autenticação com a FACTA Financeira estabelecidas com sucesso! Token de acesso gerado (${responseTimeMs}ms).`,
          responseTimeMs,
          isHomologation: isHomol,
        };
      }
      return {
        success: false,
        message: 'A FACTA respondeu a requisição, porém não retornou um token de acesso válido.',
        responseTimeMs,
        isHomologation: isHomol,
      };
    } catch (err: any) {
      const responseTimeMs = Date.now() - startTime;
      const rawMsg = err.message || '';
      let userFriendlyMsg = rawMsg;

      if (rawMsg.includes('fetch failed') || rawMsg.includes('ENOTFOUND') || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('getaddrinfo')) {
        userFriendlyMsg = 'Falha de rede/DNS ao conectar no servidor FACTA (URL/Host inacessível). Verifique se o endereço do serviço está correto.';
      } else if (rawMsg.includes('Timeout') || rawMsg.includes('AbortError')) {
        userFriendlyMsg = 'Tempo limite de conexão esgotado (timeout de 15s). O servidor da FACTA demorou para responder.';
      } else if (rawMsg.includes('401') || rawMsg.includes('403') || rawMsg.includes('autenticação') || rawMsg.includes('Usuário ou senha')) {
        userFriendlyMsg = 'Credenciais inválidas ou acesso negado pela FACTA (HTTP 401/403). Verifique o usuário Corban e a senha cadastrada.';
      } else if (rawMsg.includes('404')) {
        userFriendlyMsg = 'Endpoint /gera-token não encontrado na FACTA (HTTP 404). Verifique a URL Base configurada.';
      } else if (rawMsg.includes('429')) {
        userFriendlyMsg = 'Limite de requisições excedido na FACTA (HTTP 429). Aguarde alguns instantes e tente novamente.';
      } else if (rawMsg.includes('500') || rawMsg.includes('502') || rawMsg.includes('503') || rawMsg.includes('504')) {
        userFriendlyMsg = 'Servidor da FACTA indisponível ou com erro interno (HTTP 5xx). Tente novamente mais tarde.';
      }

      return {
        success: false,
        message: userFriendlyMsg,
        responseTimeMs,
      };
    }
  }

  /**
   * Formata objeto Date para DD/MM/AAAA.
   */
  public static formatDateToDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Executa a consulta de andamento de propostas na API FACTA (GET /proposta/andamento-propostas).
   */
  public static async queryAndamentoPropostas(
    prisma: PrismaClient,
    tenantId: string,
    params: FactaQueryParams = {},
    options: { retryOn401?: boolean; promoterId?: string } = { retryOn401: true }
  ): Promise<{ data: FactaProposalItem[]; totalRecords?: number }> {
    const config = await this.getTenantConfig(prisma, tenantId, options.promoterId);
    if (!config.isConfigured) {
      throw new Error('Integração FACTA não configurada.');
    }

    const token = await this.getToken(prisma, tenantId, undefined, config.promoterId);

    // Montagem da Query String sem parâmetros vazios
    const queryMap = new URLSearchParams();

    if (params.convenio != null && String(params.convenio).trim()) {
      queryMap.append('convenio', String(params.convenio).trim());
    } else if (config.convenio) {
      queryMap.append('convenio', config.convenio);
    }

    if (params.averbador != null && String(params.averbador).trim()) {
      queryMap.append('averbador', String(params.averbador).trim());
    } else if (config.averbador) {
      queryMap.append('averbador', config.averbador);
    }

    if (params.af != null && String(params.af).trim()) {
      queryMap.append('af', String(params.af).trim());
    }

    if (params.data_ini) queryMap.append('data_ini', params.data_ini);
    if (params.data_fim) queryMap.append('data_fim', params.data_fim);
    if (params.data_alteracao_ini) queryMap.append('data_alteracao_ini', params.data_alteracao_ini);
    if (params.data_alteracao_fim) queryMap.append('data_alteracao_fim', params.data_alteracao_fim);

    if (params.pagina != null && params.pagina > 0) {
      queryMap.append('pagina', String(params.pagina));
    }

    const quantidade = params.quantidade || config.pageSize || 100;
    queryMap.append('quantidade', String(Math.min(5000, Math.max(1, quantidade))));

    const consultaSub = params.consulta_sub || config.consultaSub || 'N';
    if (consultaSub === 'S') {
      queryMap.append('consulta_sub', 'S');
      if (params.codigo_sub || config.codigoSub) {
        queryMap.append('codigo_sub', (params.codigo_sub || config.codigoSub!).trim());
      }
    }

    const queryString = queryMap.toString();
    const endpoint = `${config.baseUrl}/proposta/andamento-propostas${queryString ? `?${queryString}` : ''}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await factaFetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 && options.retryOn401) {
        logger.warn({ tenantId }, '[FACTA SERVICE] HTTP 401 recebido na consulta. Renovando token e tentando novamente...');
        this.invalidateTokenCache(tenantId);
        return this.queryAndamentoPropostas(prisma, tenantId, params, { retryOn401: false, promoterId: config.promoterId });
      }

      if (!response.ok) {
        let errBody = '';
        try {
          errBody = await response.text();
        } catch (_) {}
        throw new Error(`Erro HTTP ${response.status} na consulta FACTA: ${errBody || response.statusText}`);
      }

      const resJson: any = await response.json();
      if (resJson?.erro === true || resJson?.erro === 'true') throw new Error(resJson.mensagem || 'FACTA recusou a consulta de propostas.');

      let items: FactaProposalItem[] = [];
      if (Array.isArray(resJson)) {
        items = resJson;
      } else if (resJson && typeof resJson === 'object') {
        if (Array.isArray(resJson.data)) {
          items = resJson.data;
        } else if (Array.isArray(resJson.propostas)) {
          items = resJson.propostas;
        } else if (Array.isArray(resJson.registros)) {
          items = resJson.registros;
        } else if (resJson.proposta || resJson.codigo_af) {
          items = [resJson];
        }
      }

      return {
        data: items,
        totalRecords: items.length,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Timeout de ${this.REQUEST_TIMEOUT_MS / 1000}s atingido ao consultar a FACTA.`);
      }
      throw err;
    }
  }

  /**
   * Sanitiza a resposta bruta da FACTA removendo dados extremamente sensíveis antes de salvar no log.
   */
  public static sanitizeFactaResponse(data: any): any {
    if (!data) return null;
    const clone = JSON.parse(JSON.stringify(data));
    const maskField = (obj: any, key: string) => {
      if (obj && typeof obj[key] === 'string') {
        const cpf = obj[key].replace(/\D/g, '');
        if (cpf.length === 11) obj[key] = `${cpf.slice(0, 3)}******${cpf.slice(-2)}`;
      }
    };
    if (Array.isArray(clone)) {
      clone.forEach((item) => maskField(item, 'cpf'));
    } else if (typeof clone === 'object') {
      maskField(clone, 'cpf');
    }
    return clone;
  }

  /**
   * Resolve e localiza a proposta no Sentinel que corresponde a um registro retornado da FACTA.
   */
  public static async findMatchingProposal(
    prisma: PrismaClient,
    tenantId: string,
    item: FactaProposalItem,
    promoterId?: string
  ): Promise<{
    proposal: any | null;
    matchType: 'EXACT' | 'MULTIPLE_MATCHES' | 'NOT_FOUND';
    reason?: string;
  }> {
    const promoter = await resolveBankPromoter(prisma, tenantId, promoterId || currentIntegrationPromoter(), 'DG');
    const itemProposalNum = item.proposta != null ? String(item.proposta).trim() : '';
    const itemAfCode = item.codigo_af != null ? String(item.codigo_af).trim() : '';
    const itemContract = item.numero_contrato != null ? String(item.numero_contrato).trim() : '';
    const itemContractRefin = item.numero_contrato_refin != null ? String(item.numero_contrato_refin).trim() : '';
    const itemCpf = item.cpf ? String(item.cpf).replace(/\D/g, '') : '';

    const identifiers = [
      ...(itemProposalNum ? [{ factaProposalNumber: itemProposalNum }, { proposalNumber: itemProposalNum }] : []),
      ...(itemAfCode ? [{ factaAfCode: itemAfCode }, { proposalNumber: itemAfCode }] : []),
      ...(itemContract ? [{ factaContractNumber: itemContract }, { proposalNumber: itemContract }] : []),
    ];
    if (!identifiers.length) return { proposal: null, matchType: 'NOT_FOUND', reason: 'FACTA não informou identificador. Vincule o código AF da proposta.' };
    const matches = await prisma.proposal.findMany({
      where: { tenantId, promoterId: promoter.id, deletedAt: null, bank: { OR: [{ name: { contains: 'FACTA', mode: 'insensitive' } }, { code: '149' }] }, OR: identifiers },
      include: { status: true, client: true },
    });
    if (matches.length > 1) return { proposal: null, matchType: 'MULTIPLE_MATCHES', reason: 'Identificador FACTA vinculado a mais de uma proposta.' };
    if (matches.length === 1) {
      const cpf = String(matches[0].client?.cpf || '').replace(/\D/g, '');
      if (itemCpf && cpf && itemCpf !== cpf) return { proposal: null, matchType: 'NOT_FOUND', reason: 'CPF retornado não corresponde ao cliente da proposta.' };
      return { proposal: matches[0], matchType: 'EXACT', reason: 'Banco e identificador FACTA correspondentes.' };
    }
    return { proposal: null, matchType: 'NOT_FOUND', reason: 'Vincule o AF ou número da proposta FACTA no Sentinel.' };
  }

  /**
   * Sincroniza uma proposta individual disparada manualmente pelo operador.
   */
  public static async syncProposalStatus(
    prisma: PrismaClient,
    proposalId: string,
    tenantId: string,
    options: { queriedBy?: string; forceAfCode?: string } = {}
  ): Promise<FactaSyncResult> {
    if (this.inFlightProposalQueries.has(proposalId)) {
      throw new Error('Já existe uma consulta em andamento para esta proposta.');
    }

    this.inFlightProposalQueries.add(proposalId);

    try {
      // Localizar proposta no banco com tenant e status
      const proposal = await prisma.proposal.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          bank: { OR: [{ name: { contains: 'FACTA', mode: 'insensitive' } }, { code: '149' }] },
          OR: [
            { id: proposalId },
            { proposalNumber: proposalId },
            { factaProposalNumber: proposalId },
            { factaAfCode: proposalId },
          ],
        },
        include: { status: true, client: true },
      });

      if (!proposal) {
        throw new Error('Proposta não encontrada no Sentinel.');
      }
      if (!proposal.promoterId) throw new Error('Vincule a promotora à proposta antes de consultar a FACTA.');
      await this.getTenantConfig(prisma, tenantId, proposal.promoterId);

      let previousInternalStatusName = proposal.status?.name;
      if (!previousInternalStatusName && proposal.statusId) {
        const foundSt = await prisma.proposalStatus.findFirst({ where: { id: proposal.statusId } });
        if (foundSt) previousInternalStatusName = foundSt.name;
      }
      if (!previousInternalStatusName) {
        previousInternalStatusName = 'AGUARDAR FORMALIZAÇÃO';
      }

      const targetAfCode = options.forceAfCode || proposal.factaAfCode || proposal.factaProposalNumber || proposal.proposalNumber;

      if (!targetAfCode) {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            factaSyncStatus: 'UNLINKED',
            factaSyncError: 'Identificador FACTA (AF ou número de proposta) não vinculado.',
            factaLastSyncAt: new Date(),
          },
        });

        await prisma.factaSyncHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            factaProposalNumber: proposal.factaProposalNumber || 'N/A',
            factaAfCode: 'N/A',
            success: false,
            technicalError: 'Identificador FACTA não informado.',
            queriedBy: options.queriedBy || 'MANUAL',
            previousInternalStatus: previousInternalStatusName,
            currentInternalStatus: previousInternalStatusName,
          },
        });

        return {
          success: false,
          hasChanged: false,
          proposalId: proposal.id,
          proposalNumber: proposal.proposalNumber,
          statusMapped: false,
          error: 'Número de AF/Proposta FACTA não informado.',
        };
      }

      // Executar consulta na FACTA por AF
      const queryResult = await this.queryAndamentoPropostas(prisma, tenantId, {
        af: targetAfCode,
      }, { retryOn401: true, promoterId: proposal.promoterId });

      if (!queryResult.data || queryResult.data.length === 0) {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            factaSyncStatus: 'ERROR',
            factaSyncError: `Nenhum registro encontrado na FACTA para o AF ${targetAfCode}.`,
            factaLastSyncAt: new Date(),
          },
        });

        await prisma.factaSyncHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            factaAfCode: targetAfCode,
            success: false,
            technicalError: `Proposta não encontrada na FACTA para AF ${targetAfCode}`,
            queriedBy: options.queriedBy || 'MANUAL',
            previousInternalStatus: previousInternalStatusName,
            currentInternalStatus: previousInternalStatusName,
          },
        });

        return {
          success: false,
          hasChanged: false,
          proposalId: proposal.id,
          proposalNumber: proposal.proposalNumber,
          statusMapped: false,
          error: `Proposta não localizada na FACTA com AF "${targetAfCode}".`,
        };
      }

      const candidates = queryResult.data.filter(record => String(record.codigo_af || '').trim() === String(targetAfCode).trim() || (!options.forceAfCode && !proposal.factaAfCode && String(record.proposta || '').trim() === String(targetAfCode).trim()));
      if (candidates.length !== 1) throw new Error('FACTA retornou identificador divergente ou múltiplos registros para o AF consultado.');
      const item = candidates[0];
      const returnedCpf = String(item.cpf || '').replace(/\D/g, '');
      const clientCpf = String(proposal.client?.cpf || '').replace(/\D/g, '');
      if (returnedCpf && clientCpf && returnedCpf !== clientCpf) throw new Error('CPF retornado pela FACTA diverge do cliente da proposta.');
      const sanitizedRaw = this.sanitizeFactaResponse(item);
      const mapping = mapFactaStatusToInternal(item);

      const returnedProposalNum = item.proposta != null ? String(item.proposta).trim() : (proposal.factaProposalNumber || null);
      const returnedAfCode = item.codigo_af != null ? String(item.codigo_af).trim() : targetAfCode;
      const returnedContract = item.numero_contrato != null ? String(item.numero_contrato).trim() : (proposal.factaContractNumber || null);
      const returnedRawStatus = item.status_proposta || proposal.factaRawStatus || null;
      const returnedCrivoStatus = item.status_crivo || proposal.factaCrivoStatus || null;

      let movementDate: Date | null = null;
      if (item.data_movimento || item.data_movimento_ocorrencia) {
        const rawDate = item.data_movimento_ocorrencia || item.data_movimento;
        if (rawDate) {
          const parts = rawDate.split('/');
          if (parts.length === 3) {
            movementDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`);
          }
        }
      }

      const rawStatusChanged = proposal.factaRawStatus !== returnedRawStatus;
      const crivoStatusChanged = proposal.factaCrivoStatus !== returnedCrivoStatus;

      let targetStatusRecord: any = null;
      if (mapping.isMapped && mapping.targetStatusCode) {
        targetStatusRecord = await prisma.proposalStatus.findFirst({
          where: {
            tenantId,
            OR: [
              { code: mapping.targetStatusCode },
              { name: mapping.targetStatusCode },
              { code: mapping.targetStatusCode.replace(/\s+/g, '_') },
            ],
          },
        });

        if (!targetStatusRecord) {
          const allStatuses = await prisma.proposalStatus.findMany({ where: { tenantId } });
          const targetNorm = mapping.targetStatusCode.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
          targetStatusRecord = allStatuses.find((st) => {
            const stCodeNorm = st.code.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
            const stNameNorm = st.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
            return stCodeNorm === targetNorm || stNameNorm === targetNorm;
          }) || null;
        }
      }

      const internalStatusChanged = Boolean(
        targetStatusRecord && targetStatusRecord.id !== proposal.statusId
      );

      const hasChanged = rawStatusChanged || crivoStatusChanged || internalStatusChanged;

      await prisma.$transaction(async (tx) => {
        // 1. Atualizar proposta
        await tx.proposal.update({
          where: { id: proposal.id },
          data: {
            factaProposalNumber: returnedProposalNum,
            factaAfCode: returnedAfCode,
            factaContractNumber: returnedContract,
            factaRawStatus: returnedRawStatus,
            factaCrivoStatus: returnedCrivoStatus,
            factaLastMovementAt: movementDate || proposal.factaLastMovementAt,
            factaLastSyncAt: new Date(),
            factaSyncStatus: 'SYNCED',
            factaSyncError: null,
            factaRawData: sanitizedRaw,
            ...(targetStatusRecord
              ? {
                  statusId: targetStatusRecord.id,
                  standardCategory: targetStatusRecord.standardCategory,
                  retentionDeadline: targetStatusRecord.code === 'AGUARDAR_RETORNO_CIP'
                    ? (proposal.retentionDeadline ? undefined : new Date())
                    : null,
                }
              : {}),
          },
        });

        // 2. Criar histórico de status se o status interno foi alterado
        if (internalStatusChanged && targetStatusRecord) {
          await tx.statusHistory.create({
            data: {
              tenantId,
              proposalId: proposal.id,
              statusId: targetStatusRecord.id,
              statusName: targetStatusRecord.name,
              userId: options.queriedBy && options.queriedBy !== 'AUTO_WORKER' ? options.queriedBy : null,
              notes: `[FACTA Sync] ${mapping.notes}`,
            },
          });
        }

        // 3. Criar registro no FactaSyncHistory
        await tx.factaSyncHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            factaProposalNumber: returnedProposalNum,
            factaAfCode: returnedAfCode,
            factaContractNumber: returnedContract,
            success: true,
            hasChanged,
            statusMapped: mapping.isMapped,
            previousRawStatus: proposal.factaRawStatus || 'N/A',
            currentRawStatus: returnedRawStatus || 'N/A',
            previousCrivoStatus: proposal.factaCrivoStatus || 'N/A',
            currentCrivoStatus: returnedCrivoStatus || 'N/A',
            previousInternalStatus: previousInternalStatusName,
            currentInternalStatus: targetStatusRecord?.name || previousInternalStatusName,
            rawResponse: sanitizedRaw,
            queriedBy: options.queriedBy || 'MANUAL',
          },
        });
      });

      return {
        success: true,
        hasChanged,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        factaProposalNumber: returnedProposalNum || undefined,
        factaAfCode: returnedAfCode,
        factaContractNumber: returnedContract || undefined,
        rawStatus: returnedRawStatus || undefined,
        crivoStatus: returnedCrivoStatus || undefined,
        previousInternalStatus: previousInternalStatusName,
        currentInternalStatus: targetStatusRecord?.name || previousInternalStatusName,
        statusId: targetStatusRecord?.id || proposal.statusId,
        statusName: targetStatusRecord?.name || previousInternalStatusName,
        statusMapped: mapping.isMapped,
        internalStatusUpdated: internalStatusChanged,
        mappingNotes: mapping.notes,
        rawData: sanitizedRaw,
      };
    } finally {
      this.inFlightProposalQueries.delete(proposalId);
    }
  }

  /**
   * Executa a sincronização em lote para o tenant consultando o período de andamento (ex: últimos 30 dias).
   */
  public static async processBatchProposals(
    prisma: PrismaClient,
    tenantId: string,
    options: { daysBack?: number; queriedBy?: string; promoterId?: string } = {}
  ): Promise<{
    processedCount: number;
    updatedCount: number;
    unlinkedCount: number;
    failedCount: number;
    errors: string[];
  }> {
    const config = await this.getTenantConfig(prisma, tenantId, options.promoterId);
    if (!config.isConfigured) {
      throw new Error('Integração FACTA não configurada para este tenant.');
    }

    const daysBack = Math.min(config.consultaSub === 'S' ? 10 : 30, Math.max(1, options.daysBack || 30));
    const now = new Date();
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const dataIni = this.formatDateToDDMMYYYY(startDate);
    const dataFim = this.formatDateToDDMMYYYY(now);

    const queryParams: FactaQueryParams = {
      pagina: 1,
      quantidade: config.pageSize || 100,
    };

    if (config.dateQueryType === 'data_alteracao') {
      queryParams.data_alteracao_ini = dataIni;
      queryParams.data_alteracao_fim = dataFim;
    } else {
      queryParams.data_ini = dataIni;
      queryParams.data_fim = dataFim;
    }

    let processedCount = 0;
    let updatedCount = 0;
    let unlinkedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const visited = new Set<string>();

    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= 50) {
      queryParams.pagina = currentPage;

      let queryResult;
      try {
        queryResult = await this.queryAndamentoPropostas(prisma, tenantId, queryParams, { retryOn401: true, promoterId: config.promoterId });
      } catch (err: any) {
        failedCount++;
        errors.push(`Erro na página ${currentPage}: ${err.message}`);
        break;
      }

      const items = queryResult.data || [];
      if (items.length === 0) {
        hasMorePages = false;
        break;
      }

      for (const item of items) {
        processedCount++;
        try {
          const matchResult = await this.findMatchingProposal(prisma, tenantId, item, config.promoterId);

          if (!matchResult.proposal) {
            unlinkedCount++;
            await prisma.factaSyncHistory.create({
              data: {
                tenantId,
                factaProposalNumber: item.proposta != null ? String(item.proposta) : null,
                factaAfCode: item.codigo_af != null ? String(item.codigo_af) : null,
                factaContractNumber: item.numero_contrato != null ? String(item.numero_contrato) : null,
                success: true,
                hasChanged: false,
                statusMapped: false,
                unlinkedReason: matchResult.reason || matchResult.matchType,
                rawResponse: this.sanitizeFactaResponse(item),
                queriedBy: options.queriedBy || 'AUTO_WORKER',
              },
            });
            continue;
          }

          visited.add(matchResult.proposal.id);
          const syncRes = await this.syncProposalStatus(prisma, matchResult.proposal.id, tenantId, {
            queriedBy: options.queriedBy || 'AUTO_WORKER',
            forceAfCode: item.codigo_af != null ? String(item.codigo_af) : undefined,
          });

          if (syncRes.success) {
            if (syncRes.hasChanged) updatedCount++;
          } else {
            failedCount++;
            if (syncRes.error) errors.push(syncRes.error);
          }
        } catch (itemErr: any) {
          failedCount++;
          errors.push(`Erro ao processar item FACTA: ${itemErr.message}`);
        }
      }

      if (items.length < queryParams.quantidade!) {
        hasMorePages = false;
      } else {
        currentPage++;
      }
    }

    // The date window is for discovery. Linked pending proposals must continue
    // to be followed even when their original movement is older than 30 days.
    let cursor: string | undefined;
    while (true) {
      const linked = await prisma.proposal.findMany({
        where: { tenantId, promoterId: config.promoterId, deletedAt: null, bank: { OR: [{ name: { contains: 'FACTA', mode: 'insensitive' } }, { code: '149' }] }, standardCategory: { notIn: ['PAGO', 'CANCELADO', 'RECUSADO'] } },
        select: { id: true, factaAfCode: true }, orderBy: { id: 'asc' }, take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!linked.length) break;
      for (const proposal of linked) {
        if (visited.has(proposal.id) || !proposal.factaAfCode?.trim()) continue;
        processedCount++;
        try {
          const result = await this.syncProposalStatus(prisma, proposal.id, tenantId, { queriedBy: options.queriedBy || 'AUTO_WORKER' });
          if (result.success) { if (result.hasChanged) updatedCount++; }
          else { failedCount++; if (result.error) errors.push(result.error); }
        } catch (error: any) { failedCount++; errors.push(error.message || 'Falha ao consultar proposta FACTA.'); }
      }
      cursor = linked[linked.length - 1].id;
      if (linked.length < 100) break;
    }

    return {
      processedCount,
      updatedCount,
      unlinkedCount,
      failedCount,
      errors,
    };
  }

  /**
   * Vincula manualmente um identificador FACTA (AF Code, Proposta, Contrato) a uma proposta do Sentinel.
   */
  public static async linkFactaIdentifiers(
    prisma: PrismaClient,
    proposalId: string,
    tenantId: string,
    data: {
      factaProposalNumber?: string;
      factaAfCode?: string;
      factaContractNumber?: string;
    }
  ) {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId, deletedAt: null, bank: { OR: [{ name: { contains: 'FACTA', mode: 'insensitive' } }, { code: '149' }] } },
    });

    if (!proposal) {
      throw new Error('Proposta não encontrada.');
    }

    const identifiers = [
      ...(data.factaAfCode?.trim() ? [{ factaAfCode: data.factaAfCode.trim() }] : []),
      ...(data.factaProposalNumber?.trim() ? [{ factaProposalNumber: data.factaProposalNumber.trim() }] : []),
      ...(data.factaContractNumber?.trim() ? [{ factaContractNumber: data.factaContractNumber.trim() }] : []),
    ];
    if (identifiers.length) {
      const duplicate = await prisma.proposal.findFirst({ where: { tenantId, promoterId: proposal.promoterId, deletedAt: null, id: { not: proposal.id }, OR: identifiers } });
      if (duplicate) throw new Error('Identificador FACTA já vinculado a outra proposta nesta empresa.');
    }

    const updated = await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        factaProposalNumber: data.factaProposalNumber ? data.factaProposalNumber.trim() : proposal.factaProposalNumber,
        factaAfCode: data.factaAfCode ? data.factaAfCode.trim() : proposal.factaAfCode,
        factaContractNumber: data.factaContractNumber ? data.factaContractNumber.trim() : proposal.factaContractNumber,
        factaSyncStatus: 'PENDING',
        factaSyncError: null,
      },
    });

    return updated;
  }

  /**
   * Obtém histórico de logs FACTA para uma proposta específica.
   */
  public static async getProposalFactaHistory(
    prisma: PrismaClient,
    proposalId: string,
    tenantId: string
  ) {
    return prisma.factaSyncHistory.findMany({
      where: { proposalId, tenantId },
      orderBy: { queryDate: 'desc' },
      take: 50,
    });
  }

  /**
   * Obtém os logs recentes de sincronização FACTA para o tenant.
   */
  public static async getRecentLogs(
    prisma: PrismaClient,
    tenantId: string,
    limit: number = 20,
    promoterId?: string
  ) {
    const config = await this.getTenantConfig(prisma, tenantId, promoterId);
    return prisma.factaSyncHistory.findMany({
      where: { tenantId, proposal: { promoterId: config.promoterId } },
      orderBy: { queryDate: 'desc' },
      take: Math.min(limit, 100),
    });
  }
}
