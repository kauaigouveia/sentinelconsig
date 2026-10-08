import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';
import {
  C6TokenResponse,
  C6ProposalResponse,
  C6SyncResult,
  C6TenantConfig,
} from './c6BankTypes.js';
import { mapC6StatusToInternal } from './c6StatusMapper.js';

interface TokenCacheEntry {
  token: string;
  expiresAt: number; // Unix timestamp in ms
}

export class C6BankService {
  public static readonly DEFAULT_BASE_URL = 'https://marketplace-proposal-service-api-p.c6bank.info';
  private static readonly REQUEST_TIMEOUT_MS = 15000;
  private static readonly EXPIRATION_BUFFER_MS = 60000; // 60s antes da expiração oficial

  // Cache de tokens em memória indexado por chave tenant/ambiente
  private static tokenCache: Map<string, TokenCacheEntry> = new Map();

  // Promessas de requisições de token em andamento para evitar concorrência desnecessária por tenant
  private static inFlightTokenPromises: Map<string, Promise<string>> = new Map();

  // Bloqueio de concorrência em memória por ID de proposta
  private static inFlightQueries: Set<string> = new Set();

  /**
   * Obtém a configuração do C6 para um determinado tenant (respeitando SystemConfig e variáveis de ambiente)
   */
  public static async getTenantConfig(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<C6TenantConfig> {
    const configs = await prisma.systemConfig.findMany({
      where: {
        tenantId,
        configKey: {
          in: [
            'c6_bank_username',
            'c6_bank_password',
            'c6_bank_base_url',
            'c6_bank_auto_sync_enabled',
            'c6_bank_sync_interval_minutes',
          ],
        },
      },
    });

    const configMap = new Map(configs.map((c) => [c.configKey, c.configValue]));

    const username =
      configMap.get('c6_bank_username') ||
      process.env.C6_API_USERNAME ||
      '';

    const password =
      configMap.get('c6_bank_password') ||
      process.env.C6_API_PASSWORD ||
      '';

    const baseUrl =
      configMap.get('c6_bank_base_url') ||
      process.env.C6_API_BASE_URL ||
      this.DEFAULT_BASE_URL;

    const autoSyncEnabled =
      configMap.get('c6_bank_auto_sync_enabled') === 'true' ||
      process.env.C6_AUTO_SYNC_ENABLED === 'true';

    const rawInterval = configMap.get('c6_bank_sync_interval_minutes') || process.env.C6_SYNC_INTERVAL_MINUTES;
    const syncIntervalMinutes = Math.max(
      5,
      rawInterval ? parseInt(rawInterval, 10) || 15 : 15
    );

    return {
      username: username.trim(),
      password: password.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      autoSyncEnabled,
      syncIntervalMinutes,
      isConfigured: Boolean(username.trim() && password.trim()),
      hasPassword: Boolean(password.trim()),
    };
  }

  /**
   * Salva configurações do C6 Bank para um tenant no banco de dados de forma segura
   */
  public static async saveTenantConfig(
    prisma: PrismaClient,
    tenantId: string,
    data: {
      username?: string;
      password?: string;
      baseUrl?: string;
      autoSyncEnabled?: boolean;
      syncIntervalMinutes?: number;
    }
  ): Promise<C6TenantConfig> {
    const upsertConfig = async (key: string, value: string, isSecret = false) => {
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

    if (data.username !== undefined) {
      await upsertConfig('c6_bank_username', data.username.trim(), false);
    }
    if (data.password !== undefined && data.password.trim() !== '') {
      await upsertConfig('c6_bank_password', data.password.trim(), true);
      // Limpar cache de token após alteração de senha
      this.invalidateTokenCache(tenantId);
    }
    if (data.baseUrl !== undefined) {
      await upsertConfig(
        'c6_bank_base_url',
        data.baseUrl.trim().replace(/\/+$/, ''),
        false
      );
    }
    if (data.autoSyncEnabled !== undefined) {
      await upsertConfig(
        'c6_bank_auto_sync_enabled',
        data.autoSyncEnabled ? 'true' : 'false',
        false
      );
    }
    if (data.syncIntervalMinutes !== undefined) {
      const interval = Math.max(5, Number(data.syncIntervalMinutes) || 15);
      await upsertConfig('c6_bank_sync_interval_minutes', String(interval), false);
    }

    return this.getTenantConfig(prisma, tenantId);
  }

  /**
   * Limpa cache de token para um tenant
   */
  public static invalidateTokenCache(tenantId: string): void {
    this.tokenCache.delete(tenantId);
    this.inFlightTokenPromises.delete(tenantId);
  }

  /**
   * Obtém token de autenticação no C6 Bank com cache seguro e renovação automática
   */
  public static async getAccessToken(
    prisma: PrismaClient,
    tenantId: string,
    forceRefresh = false,
    overrideCredentials?: {
      username?: string;
      password?: string;
      baseUrl?: string;
    }
  ): Promise<string> {
    const now = Date.now();

    // Se não houver credenciais temporárias de teste, utilizar cache se válido
    if (!overrideCredentials && !forceRefresh) {
      const cached = this.tokenCache.get(tenantId);
      if (cached && cached.expiresAt - now > this.EXPIRATION_BUFFER_MS) {
        return cached.token;
      }

      // Se já houver uma requisição de token em andamento para este tenant, reutilizar a mesma Promise
      const inFlight = this.inFlightTokenPromises.get(tenantId);
      if (inFlight) {
        return inFlight;
      }
    }

    const fetchPromise = (async () => {
      // Carregar configurações do tenant
      const savedConfig = await this.getTenantConfig(prisma, tenantId);

      const username = (overrideCredentials?.username ?? savedConfig.username).trim();
      // Se a senha foi informada no override, usá-la; caso contrário usar a salva no banco
      const password = (overrideCredentials?.password !== undefined && overrideCredentials.password.trim() !== ''
        ? overrideCredentials.password
        : savedConfig.password || '').trim();
      const baseUrl = (overrideCredentials?.baseUrl ?? savedConfig.baseUrl).trim().replace(/\/+$/, '') || this.DEFAULT_BASE_URL;

      if (!username || !password) {
        throw new Error(
          'Credenciais do C6 Bank não preenchidas. Informe o Usuário e a Senha da API para testar a conexão.'
        );
      }

      const tokenUrl = `${baseUrl}/auth/token`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

      try {
        logger.info(
          {
            tenantId,
            tokenUrl,
            method: 'POST',
            hasUsername: Boolean(username),
            hasPassword: Boolean(password),
            isOverride: Boolean(overrideCredentials),
          },
          '[C6 BANK] Executando requisição de autenticação POST /auth/token'
        );

        const bodyParams = new URLSearchParams();
        bodyParams.append('username', username);
        bodyParams.append('password', password);

        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/json, */*',
          },
          body: bodyParams.toString(),
          signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') || '';
        const rawText = await response.text();
        const trimmedText = rawText.trim();

        logger.info(
          {
            tenantId,
            tokenUrl,
            status: response.status,
            contentType,
            bodyLength: rawText.length,
          },
          '[C6 BANK] Resposta HTTP recebida do endpoint C6'
        );

        // Detecção de respostas HTML (ex: 404, páginas de proxy, WAF ou login do gateway)
        const isHtml =
          trimmedText.startsWith('<!DOCTYPE') ||
          trimmedText.startsWith('<html') ||
          trimmedText.startsWith('<head') ||
          contentType.toLowerCase().includes('text/html');

        if (isHtml) {
          logger.warn(
            { tenantId, status: response.status, url: tokenUrl },
            '[C6 BANK] Resposta em formato HTML recebida ao autenticar no C6'
          );
          throw new Error(
            `O C6 retornou uma resposta inesperada em formato HTML (HTTP ${response.status}). Verifique a URL-base configurada (${baseUrl}) e a disponibilidade do serviço.`
          );
        }

        // Interpretação segura de JSON
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch (parseErr) {
          logger.warn(
            { tenantId, status: response.status, rawSnippet: trimmedText.slice(0, 150) },
            '[C6 BANK] Resposta com formato não-JSON recebida da API C6'
          );
          throw new Error(
            `O C6 retornou uma resposta com formato inválido (HTTP ${response.status}). Resposta: ${trimmedText.slice(0, 100)}`
          );
        }

        if (!response.ok) {
          logger.warn(
            { tenantId, status: response.status, data },
            '[C6 BANK] Falha na autenticação POST /auth/token'
          );

          if (response.status === 401 || response.status === 403) {
            const detail = data?.message || data?.error || data?.type || 'Credenciais inválidas';
            throw new Error(
              `Falha de autenticação no C6 Bank (HTTP ${response.status}): ${detail}. Verifique o usuário e a senha da API.`
            );
          }

          if (response.status === 404) {
            throw new Error(
              `Endpoint de autenticação não encontrado no C6 Bank (HTTP 404 em ${tokenUrl}). Verifique a URL-base configurada.`
            );
          }

          if (response.status === 429) {
            throw new Error(
              'Limite de requisições excedido no C6 Bank (HTTP 429). Aguarde alguns instantes antes de tentar novamente.'
            );
          }

          if (response.status >= 500) {
            throw new Error(
              `Serviço do C6 Bank indisponível (HTTP ${response.status}). Tente novamente mais tarde.`
            );
          }

          throw new Error(
            `Falha na autenticação C6 Bank (HTTP ${response.status}): ${data?.message || data?.error || 'Acesso recusado'}`
          );
        }

        if (!data || typeof data !== 'object' || !data.access_token) {
          throw new Error(
            'O C6 retornou uma resposta inesperada: access_token não localizado no corpo da resposta.'
          );
        }

        // Validade retornada pela API (ex: expires_in_seconds retornado no payload oficial)
        const expiresInSeconds = Number(data.expires_in_seconds) || 1199;
        const expiresAt = now + expiresInSeconds * 1000;

        // Armazenar no cache em memória somente se for credencial persistida (não override efêmero)
        if (!overrideCredentials) {
          this.tokenCache.set(tenantId, {
            token: data.access_token,
            expiresAt,
          });
        }

        return data.access_token;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new Error(
            `Tempo limite excedido (${this.REQUEST_TIMEOUT_MS / 1000}s) ao conectar com o C6 Bank em ${tokenUrl}. Verifique a conectividade.`
          );
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    })();

    if (!overrideCredentials) {
      this.inFlightTokenPromises.set(tenantId, fetchPromise);
      fetchPromise.catch(() => {});
      fetchPromise.finally(() => {
        this.inFlightTokenPromises.delete(tenantId);
      });
    }

    return fetchPromise;
  }

  /**
   * Testa a conectividade e credenciais do C6 Bank sem expor dados confidenciais
   */
  public static async testConnection(
    prisma: PrismaClient,
    tenantId: string,
    overrideCredentials?: {
      username?: string;
      password?: string;
      baseUrl?: string;
    }
  ): Promise<{ success: boolean; message: string; responseTimeMs: number }> {
    const startTime = Date.now();
    try {
      await this.getAccessToken(prisma, tenantId, true, overrideCredentials);
      const responseTimeMs = Date.now() - startTime;
      return {
        success: true,
        message: 'Conexão com C6 Bank estabelecida com sucesso! Autenticação validada via POST /auth/token.',
        responseTimeMs,
      };
    } catch (err: any) {
      const responseTimeMs = Date.now() - startTime;
      logger.warn(
        { tenantId, error: err?.message, responseTimeMs },
        '[C6 BANK] Teste de conexão C6 concluído com erro'
      );
      return {
        success: false,
        message: err?.message || 'Falha ao conectar com o C6 Bank.',
        responseTimeMs,
      };
    }
  }

  /**
   * Consulta a proposta diretamente no endpoint C6 Bank (Multiproduto: Portabilidade, Consignado, FGTS, etc.):
   * GET /marketplace/proposal?proposalNumber={proposalNumber}
   * Headers:
   *   Authorization: {access_token} (conforme documentação oficial C6, SEM prefixo "Bearer")
   */
  public static async queryProposalFromC6(
    prisma: PrismaClient,
    tenantId: string,
    proposalNumber: string,
    retryCount = 0
  ): Promise<{ data: C6ProposalResponse; statusCode: number }> {
    const config = await this.getTenantConfig(prisma, tenantId);
    const token = await this.getAccessToken(prisma, tenantId);

    const targetUrl = `${config.baseUrl}/marketplace/proposal?proposalNumber=${encodeURIComponent(
      proposalNumber
    )}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Authorization': token,
        },
        signal: controller.signal,
      });

      // 401 Unauthorized: token expirado ou revogado
      if (response.status === 401 && retryCount === 0) {
        logger.info({ tenantId, proposalNumber }, '[C6 BANK] Token expirado (401). Renovando e retentando...');
        this.invalidateTokenCache(tenantId);
        return this.queryProposalFromC6(prisma, tenantId, proposalNumber, retryCount + 1);
      }

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      const trimmedText = rawText.trim();

      // Checagem de HTML
      const isHtml =
        trimmedText.startsWith('<!DOCTYPE') ||
        trimmedText.startsWith('<html') ||
        trimmedText.startsWith('<head') ||
        contentType.toLowerCase().includes('text/html');

      if (isHtml) {
        logger.warn(
          { tenantId, proposalNumber, status: response.status },
          '[C6 BANK] Resposta em HTML recebida na consulta de proposta C6'
        );
        const err: any = new Error(
          `O C6 retornou uma resposta inesperada em HTML (HTTP ${response.status}) ao consultar a proposta.`
        );
        err.statusCode = response.status;
        throw err;
      }

      // Parse seguro de JSON
      let json: any;
      try {
        json = JSON.parse(rawText);
      } catch (parseErr) {
        const err: any = new Error(
          `O C6 retornou uma resposta com formato inválido (HTTP ${response.status}) ao consultar a proposta.`
        );
        err.statusCode = response.status;
        throw err;
      }

      if (!response.ok) {
        logger.warn(
          { tenantId, proposalNumber, status: response.status, json },
          '[C6 BANK] Resposta com erro da API do C6'
        );

        if (response.status === 404) {
          const err: any = new Error(
            `Proposta ${proposalNumber} não localizada na base do C6 Bank (HTTP 404).`
          );
          err.statusCode = 404;
          throw err;
        }

        if (response.status === 429) {
          const err: any = new Error(
            'Limite de requisições excedido no C6 Bank (HTTP 429 Rate Limit). Tente novamente em instantes.'
          );
          err.statusCode = 429;
          throw err;
        }

        if (response.status >= 500) {
          const err: any = new Error(
            `Barramento C6 Bank momentaneamente instável ou indisponível (HTTP ${response.status}).`
          );
          err.statusCode = response.status;
          throw err;
        }

        const err: any = new Error(
          `Falha ao consultar proposta no C6 Bank (HTTP ${response.status}): ${json?.message || json?.error || 'Erro desconhecido'}`
        );
        err.statusCode = response.status;
        throw err;
      }

      return { data: json as C6ProposalResponse, statusCode: 200 };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const timeoutErr: any = new Error('Tempo limite esgotado ao consultar proposta no C6 Bank (Timeout).');
        timeoutErr.statusCode = 408;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Sanitiza a resposta bruta para gravação em histórico/banco,
   * removendo dados sensíveis desnecessários (CPF completo, dados bancários completos, tokens).
   */
  public static sanitizeC6Response(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const sanitized = { ...data };

    // Remover possíveis campos de token ou chaves
    delete sanitized.token;
    delete sanitized.access_token;
    delete sanitized.password;

    // Se houver cliente ou dados bancários no payload, mascarar CPF/conta
    if (sanitized.client && typeof sanitized.client === 'object') {
      const clientCopy = { ...sanitized.client };
      if (typeof clientCopy.cpf === 'string' && clientCopy.cpf.length >= 11) {
        clientCopy.cpf = `***.${clientCopy.cpf.slice(3, 6)}.***-**`;
      }
      sanitized.client = clientCopy;
    }

    return sanitized;
  }

  /**
   * Executa a sincronização completa de uma proposta C6:
   * 1. Validação de isolamento do tenant.
   * 2. Verificação de concorrência com Lock.
   * 3. Chamada da API C6.
   * 4. Mapeamento estrito de status (preservando o status interno se desconhecido).
   * 5. Gravação atômica em Proposal, C6SyncHistory e StatusHistory.
   */
  public static async syncProposalStatus(
    prisma: PrismaClient,
    proposalId: string,
    tenantId: string,
    options: {
      queriedBy?: string; // 'AUTO_WORKER' | userId
      forceProposalNumber?: string;
    } = {}
  ): Promise<C6SyncResult> {
    // 1. Bloqueio de concorrência por proposta
    if (this.inFlightQueries.has(proposalId)) {
      throw new Error(
        'Uma consulta já está em andamento para esta proposta. Aguarde a conclusão.'
      );
    }

    this.inFlightQueries.add(proposalId);

    try {
      // 2. Buscar proposta no banco com tenant e relacionamentos
      const proposal = await prisma.proposal.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { id: proposalId },
            { proposalNumber: proposalId },
            { c6ProposalNumber: proposalId },
          ],
        },
        include: {
          status: true,
          bank: true,
        },
      });

      if (!proposal) {
        throw new Error('Proposta não encontrada ou não pertence a este tenant.');
      }

      // Validar banco C6 (código 336 ou nome C6)
      const isC6Bank =
        proposal.bank?.code === '336' ||
        (proposal.bank?.name && proposal.bank.name.toUpperCase().includes('C6'));

      if (!isC6Bank) {
        throw new Error('Esta proposta não pertence ao C6 Bank.');
      }

      // Garantir nome do status interno anterior sem N/A
      let previousInternalStatusName = proposal.status?.name;
      if (!previousInternalStatusName && proposal.statusId) {
        const foundSt = await prisma.proposalStatus.findFirst({
          where: { id: proposal.statusId },
        });
        if (foundSt) previousInternalStatusName = foundSt.name;
      }
      if (!previousInternalStatusName) {
        previousInternalStatusName = 'AGUARDAR FORMALIZAÇÃO';
      }
      const targetC6Number =
        options.forceProposalNumber ||
        proposal.c6ProposalNumber ||
        proposal.proposalNumber;

      if (!targetC6Number || targetC6Number.trim() === '') {
        // Atualizar proposta com status MISSING_IDENTIFIER
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            c6SyncStatus: 'MISSING_IDENTIFIER',
            c6SyncError: 'Número da proposta C6 não informado.',
            c6LastSyncAt: new Date(),
          },
        });

        // Registrar histórico
        await prisma.c6SyncHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            c6ProposalNumber: 'N/A',
            success: false,
            technicalError: 'Número da proposta C6 não informado.',
            queriedBy: options.queriedBy || 'MANUAL',
            previousInternalStatus: previousInternalStatusName,
            currentInternalStatus: previousInternalStatusName,
          },
        });

        return {
          success: false,
          hasChanged: false,
          proposalId,
          proposalNumber: proposal.proposalNumber,
          error: 'Número da proposta no C6 Bank não informado. Vincule o número para consultar.',
          statusMapped: false,
        };
      }

      // 3. Executar chamada da API externa do C6
      let queryResponse: { data: C6ProposalResponse; statusCode: number };
      try {
        queryResponse = await this.queryProposalFromC6(
          prisma,
          tenantId,
          targetC6Number.trim()
        );
      } catch (apiErr: any) {
        // Falha na chamada da API:
        // IMPORTANTE: NÃO alterar status da proposta nem marcar como reprovada/cancelada!
        const errorMessage = apiErr?.message || 'Falha de comunicação com o C6 Bank.';
        const statusCode = apiErr?.statusCode || 500;

        await prisma.proposal.update({
          where: { id: proposal.id },
          data: {
            c6SyncStatus: 'ERROR',
            c6SyncError: errorMessage,
            c6LastSyncAt: new Date(),
          },
        });

        await prisma.c6SyncHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            c6ProposalNumber: targetC6Number.trim(),
            success: false,
            technicalError: errorMessage,
            queriedBy: options.queriedBy || 'MANUAL',
            previousInternalStatus: previousInternalStatusName,
            currentInternalStatus: previousInternalStatusName,
          },
        });

        return {
          success: false,
          hasChanged: false,
          proposalId,
          proposalNumber: proposal.proposalNumber,
          c6ProposalNumber: targetC6Number.trim(),
          error: errorMessage,
          statusCode,
          statusMapped: false,
        };
      }

      const c6Data = queryResponse.data;
      const sanitizedRaw = this.sanitizeC6Response(c6Data);

      // 4. Mapear status com regras estritas
      const mapping = mapC6StatusToInternal(c6Data);

      // Identificadores retornados
      const returnedC6Number = c6Data.proposal_number != null ? String(c6Data.proposal_number).trim() : targetC6Number.trim();
      const returnedOpNumber = c6Data.operation_number != null ? String(c6Data.operation_number).trim() : (proposal.c6OperationNumber || null);
      const returnedSituation = c6Data.loan_track?.situation || proposal.c6RawSituation || null;
      const returnedActivity =
        c6Data.loan_track?.current_activity_number != null
          ? String(c6Data.loan_track.current_activity_number)
          : proposal.c6CurrentActivity || null;
      const returnedActivityDesc =
        c6Data.loan_track?.current_activity_description || proposal.c6ActivityDescription || null;
      const returnedFormalizationStatus =
        c6Data.formalization_status || proposal.c6FormalizationStatus || null;
      const returnedFormalizationCode =
        (c6Data.formalization_code ?? c6Data.formalizationCode) != null
          ? String(c6Data.formalization_code ?? c6Data.formalizationCode)
          : proposal.c6FormalizationCode || null;

      let lastActivityDate: Date | null = null;
      if (c6Data.loan_track?.activity_last_update) {
        const parsed = new Date(c6Data.loan_track.activity_last_update);
        if (!isNaN(parsed.getTime())) {
          lastActivityDate = parsed;
        }
      }

      // 5. Verificar se houve alteração nos dados do C6
      const situationChanged = proposal.c6RawSituation !== returnedSituation;
      const activityChanged = proposal.c6CurrentActivity !== returnedActivity;
      const formalizationChanged = proposal.c6FormalizationStatus !== returnedFormalizationStatus;

      // 6. Verificar se deve alterar o status interno
      let newInternalStatusId: string | null = null;
      let newStandardCategory: any = undefined;
      let targetStatusRecord: any = null;

      if (mapping.isMapped && mapping.targetStatusCode) {
        const targetCode = mapping.targetStatusCode;
        // Search by tenant first
        targetStatusRecord = await prisma.proposalStatus.findFirst({
          where: {
            tenantId,
            OR: [
              { code: targetCode },
              { code: { equals: targetCode, mode: 'insensitive' } },
              { name: { equals: targetCode, mode: 'insensitive' } },
            ],
          },
        });

        if (targetStatusRecord && targetStatusRecord.id !== proposal.statusId) {
          newInternalStatusId = targetStatusRecord.id;
          newStandardCategory = targetStatusRecord.standardCategory;
        }
      }

      const internalStatusChanged = Boolean(newInternalStatusId);
      const hasChanged = situationChanged || activityChanged || formalizationChanged || internalStatusChanged;

      // 7. Transação atômica de gravação
      await prisma.$transaction(async (tx) => {
        // Atualizar campos da proposta
        await tx.proposal.update({
          where: { id: proposal.id },
          data: {
            c6ProposalNumber: returnedC6Number,
            c6OperationNumber: returnedOpNumber,
            c6RawSituation: returnedSituation,
            c6CurrentActivity: returnedActivity,
            c6ActivityDescription: returnedActivityDesc,
            c6FormalizationStatus: returnedFormalizationStatus,
            c6FormalizationCode: returnedFormalizationCode,
            c6LastActivityDate: lastActivityDate || proposal.c6LastActivityDate,
            c6LastSyncAt: new Date(),
            c6SyncStatus: 'SYNCED',
            c6SyncError: null,
            c6RawData: sanitizedRaw,
            ...(newInternalStatusId
              ? {
                  statusId: newInternalStatusId,
                  standardCategory: newStandardCategory,
                  retentionDeadline: targetStatusRecord?.code === 'AGUARDAR_RETORNO_CIP'
                    ? (proposal.retentionDeadline ? undefined : new Date())
                    : null,
                  version: { increment: 1 },
                }
              : {}),
          },
        });

        // Se houve alteração de status interno mapeado com certeza, gravar no StatusHistory
        if (internalStatusChanged && targetStatusRecord) {
          await tx.statusHistory.create({
            data: {
              tenantId,
              proposalId: proposal.id,
              statusId: targetStatusRecord.id,
              statusName: targetStatusRecord.name,
              userId: options.queriedBy && options.queriedBy !== 'AUTO_WORKER' ? options.queriedBy : null,
              notes: `[C6 Bank Sync] ${mapping.notes}`,
            },
          });
        }

        // Gravar histórico de auditoria da consulta C6
        await tx.c6SyncHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            c6ProposalNumber: returnedC6Number,
            c6OperationNumber: returnedOpNumber,
            success: true,
            hasChanged,
            previousRawSituation: proposal.c6RawSituation || 'N/A',
            currentRawSituation: returnedSituation || 'N/A',
            previousActivity: proposal.c6ActivityDescription || proposal.c6CurrentActivity || 'N/A',
            currentActivity: returnedActivityDesc || returnedActivity || 'N/A',
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
        proposalId,
        proposalNumber: proposal.proposalNumber,
        c6ProposalNumber: returnedC6Number,
        c6OperationNumber: returnedOpNumber || undefined,
        rawSituation: returnedSituation || undefined,
        currentActivity: returnedActivity || undefined,
        activityDescription: returnedActivityDesc || undefined,
        formalizationStatus: returnedFormalizationStatus || undefined,
        formalizationCode: returnedFormalizationCode || undefined,
        lastActivityDate: lastActivityDate ? lastActivityDate.toISOString() : undefined,
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
      this.inFlightQueries.delete(proposalId);
    }
  }

  /**
   * Obtém histórico de consultas C6 para uma proposta com isolamento de tenant
   */
  public static async getProposalC6History(
    prisma: PrismaClient,
    proposalId: string,
    tenantId: string
  ) {
    return prisma.c6SyncHistory.findMany({
      where: {
        proposalId,
        tenantId,
      },
      orderBy: {
        queryDate: 'desc',
      },
      take: 30,
    });
  }

  /**
   * Vincula ou atualiza manualmente o identificador do C6 Bank em uma proposta
   */
  public static async linkC6Identifiers(
    prisma: PrismaClient,
    proposalId: string,
    tenantId: string,
    data: {
      c6ProposalNumber: string;
      c6OperationNumber?: string;
    }
  ) {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId },
    });
    if (!proposal) {
      throw new Error('Proposta não encontrada.');
    }

    return prisma.proposal.update({
      where: { id: proposalId },
      data: {
        c6ProposalNumber: data.c6ProposalNumber.trim(),
        c6OperationNumber: data.c6OperationNumber ? data.c6OperationNumber.trim() : proposal.c6OperationNumber,
        c6SyncStatus: 'PENDING',
        c6SyncError: null,
      },
    });
  }
}
