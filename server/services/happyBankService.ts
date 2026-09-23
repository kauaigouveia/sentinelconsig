import { PrismaClient } from '@prisma/client';
import {
  HappyTenantConfig,
  HappyConsultarContratoFilters,
  HappyConsultarResponse,
  HappyContratoItem,
  HappyWebhookPayload,
  HappyTestConnectionResult,
  HappySyncResult,
  HappyIntegrationStatus,
} from './happyBankTypes.js';
import { HappyTokenManager } from './happyTokenManager.js';
import { mapHappyStatusToInternal } from './happyStatusMapper.js';

export class HappyBankService {
  /**
   * Obtém a configuração da Happy para um determinado tenant (lendo de SystemConfig)
   */
  public static async getTenantConfig(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<HappyTenantConfig> {
    const configs = await prisma.systemConfig.findMany({
      where: {
        tenantId,
        configKey: {
          in: [
            'happy_ambiente',
            'happy_base_url',
            'happy_client_id',
            'happy_secret',
            'happy_usuario',
            'happy_senha',
            'happy_cpf_digitador',
            'happy_correspondente_banqueiro',
            'happy_ativo',
          ],
        },
      },
    });

    const configMap = new Map(configs.map((c) => [c.configKey, c.configValue]));

    const ambiente = (configMap.get('happy_ambiente') || 'staging') as 'staging' | 'production';
    const defaultUrl = 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico';
    const baseUrl = configMap.get('happy_base_url') || defaultUrl;
    const clientId = configMap.get('happy_client_id') || process.env.HAPPY_CLIENT_ID || '';
    const secret = configMap.get('happy_secret') || process.env.HAPPY_SECRET || '';
    const usuario = configMap.get('happy_usuario') || process.env.HAPPY_USUARIO || '';
    const senha = configMap.get('happy_senha') || process.env.HAPPY_SENHA || '';
    const cpfDigitador = configMap.get('happy_cpf_digitador') || '';
    const correspondenteBanqueiro = configMap.get('happy_correspondente_banqueiro') || '';
    const ativo = configMap.get('happy_ativo') === 'true';

    const hasSecret = Boolean(secret);
    const hasSenha = Boolean(senha);
    const isConfigured = Boolean(clientId && hasSecret && usuario && hasSenha);

    return {
      ambiente,
      baseUrl,
      clientId,
      usuario,
      cpfDigitador,
      correspondenteBanqueiro,
      ativo,
      isConfigured,
      hasSecret,
      hasSenha,
    };
  }

  /**
   * Salva configurações da Happy com segurança no SystemConfig do tenant
   */
  public static async saveTenantConfig(
    prisma: PrismaClient,
    tenantId: string,
    data: {
      ambiente?: 'staging' | 'production';
      baseUrl?: string;
      clientId?: string;
      secret?: string;
      usuario?: string;
      senha?: string;
      cpfDigitador?: string;
      correspondenteBanqueiro?: string;
      ativo?: boolean;
    }
  ): Promise<HappyTenantConfig> {
    const keysToUpsert: Array<{ key: string; value: string }> = [];

    if (data.ambiente !== undefined) {
      keysToUpsert.push({ key: 'happy_ambiente', value: data.ambiente });
    }
    if (data.baseUrl !== undefined) {
      keysToUpsert.push({ key: 'happy_base_url', value: data.baseUrl.trim() });
    }
    if (data.clientId !== undefined) {
      keysToUpsert.push({ key: 'happy_client_id', value: data.clientId.trim() });
    }
    if (data.secret && data.secret.trim() !== '') {
      keysToUpsert.push({ key: 'happy_secret', value: data.secret.trim() });
    }
    if (data.usuario !== undefined) {
      keysToUpsert.push({ key: 'happy_usuario', value: data.usuario.trim() });
    }
    if (data.senha && data.senha.trim() !== '') {
      keysToUpsert.push({ key: 'happy_senha', value: data.senha.trim() });
    }
    if (data.cpfDigitador !== undefined) {
      keysToUpsert.push({ key: 'happy_cpf_digitador', value: data.cpfDigitador.replace(/\D/g, '') });
    }
    if (data.correspondenteBanqueiro !== undefined) {
      keysToUpsert.push({ key: 'happy_correspondente_banqueiro', value: data.correspondenteBanqueiro.trim() });
    }
    if (data.ativo !== undefined) {
      keysToUpsert.push({ key: 'happy_ativo', value: String(data.ativo) });
    }

    for (const item of keysToUpsert) {
      await prisma.systemConfig.upsert({
        where: {
          tenantId_configKey: {
            tenantId,
            configKey: item.key,
          },
        },
        create: {
          tenantId,
          configKey: item.key,
          configValue: item.value,
          isSecret: item.key.includes('secret') || item.key.includes('senha'),
        },
        update: {
          configValue: item.value,
          updatedAt: new Date(),
        },
      });
    }

    // Invalida cache de token após alteração de credenciais
    HappyTokenManager.invalidateToken(tenantId);

    return this.getTenantConfig(prisma, tenantId);
  }

  /**
   * Testa a conexão exclusivamente com o endpoint de autenticação
   * POST /api/v1/consignado-publico/auth
   * NÃO consulta contratos nem expõe credenciais.
   */
  public static async testConnection(
    prisma: PrismaClient,
    tenantId: string,
    overrideCredentials?: Partial<HappyTenantConfig>
  ): Promise<HappyTestConnectionResult> {
    try {
      // Força refresh do token para validar as credenciais agora
      await HappyTokenManager.getValidToken(prisma, tenantId, true, overrideCredentials);

      return {
        success: true,
        message: 'Conexão com a Happy / BYX Capital autenticada com sucesso! Token de acesso emitido.',
        httpStatus: 200,
        diagnostics: 'Autenticação bem-sucedida em POST /api/v1/consignado-publico/auth.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Falha ao autenticar com a API da Happy / BYX Capital.',
        httpStatus: 401,
        diagnostics: 'Erro no endpoint de autenticação. Verifique Client ID, Secret, Usuário e Senha.',
      };
    }
  }

  /**
   * Consulta contratos na API Happy
   * POST /api/v1/consignado-publico/contrato/consultar
   */
  public static async consultarContratos(
    prisma: PrismaClient,
    tenantId: string,
    filters: HappyConsultarContratoFilters,
    overrideCredentials?: Partial<HappyTenantConfig>
  ): Promise<HappyConsultarResponse> {
    const config = await this.getTenantConfig(prisma, tenantId);
    const baseUrl = (overrideCredentials?.baseUrl || config.baseUrl || 'https://vhagar-staging.byxcapital.com.br/api/v1/consignado-publico').replace(/\/+$/, '');
    const consultUrl = `${baseUrl}/contrato/consultar`;

    const cpfDigitador = overrideCredentials?.cpfDigitador || config.cpfDigitador || '';
    const correspondenteBanqueiro = overrideCredentials?.correspondenteBanqueiro || config.correspondenteBanqueiro || '';

    const executeRequest = async (token: string) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      };

      if (cpfDigitador) {
        headers['cpf-digitador'] = cpfDigitador;
      }
      if (correspondenteBanqueiro) {
        headers['x-correspondente-banqueiro'] = correspondenteBanqueiro;
      }

      const body = {
        nome: filters.nome ?? null,
        cpf: filters.cpf ? filters.cpf.replace(/\D/g, '') : null,
        id_contrato: filters.id_contrato != null ? Number(filters.id_contrato) : null,
        tipo_produto: filters.tipo_produto ?? null,
        status: filters.status ?? null,
        periodo: filters.periodo ?? null,
      };

      return fetch(consultUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    };

    let token = await HappyTokenManager.getValidToken(prisma, tenantId, false, overrideCredentials);
    let res = await executeRequest(token);

    // Se retornar 401, invalida token, autentica novamente e tenta uma única vez
    if (res.status === 401) {
      HappyTokenManager.invalidateToken(tenantId);
      token = await HappyTokenManager.getValidToken(prisma, tenantId, true, overrideCredentials);
      res = await executeRequest(token);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = '';
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed.message || parsed.error || errText;
      } catch {
        errMsg = errText || res.statusText;
      }
      throw new Error(`Erro na consulta de contratos Happy (HTTP ${res.status}): ${errMsg}`);
    }

    const data: HappyConsultarResponse = await res.json();
    return data;
  }

  /**
   * Processa Webhooks recebidos da Happy com garantia de idempotência e isolamento multi-tenant
   * POST /api/webhooks/happy/status
   */
  public static async processWebhook(
    prisma: PrismaClient,
    payload: HappyWebhookPayload
  ): Promise<{
    success: boolean;
    duplicate?: boolean;
    unmatched?: boolean;
    unresolvedTenant?: boolean;
    processed?: boolean;
    proposalId?: string;
    message?: string;
  }> {
    if (!payload || !payload.request_id) {
      throw new Error("Payload de webhook inválido: campo 'request_id' é obrigatório.");
    }

    const requestId = String(payload.request_id).trim();

    // 1. Idempotência: verificar se requestId já existe
    const existingEvent = await prisma.happyWebhookEvent.findUnique({
      where: { requestId },
    });

    if (existingEvent) {
      return {
        success: true,
        duplicate: true,
        message: 'Evento de webhook já recebido e processado anteriormente (idempotência atendida).',
      };
    }

    const eventName = payload.event_name || 'STATUS_CONTRATO_ADICIONADO';
    const customerId = payload.customer_id ? String(payload.customer_id).trim() : null;
    const contractId = payload.contract_id != null ? String(payload.contract_id).trim() : null;
    const digitador = payload.digitador ? String(payload.digitador).trim() : null;

    const eventData = payload.data?.event_data;
    const statusCode = eventData?.status_code != null ? Number(eventData.status_code) : null;
    const statusName = eventData?.status_name?.trim() || null;
    const statusDescription = eventData?.status_description?.trim() || null;
    const proposalKey = eventData?.chave_proposta?.trim() || null;

    // Registra recebimento inicial do evento
    const createdEvent = await prisma.happyWebhookEvent.create({
      data: {
        requestId,
        eventName,
        customerId,
        contractId,
        digitador,
        statusCode,
        statusName,
        statusDescription,
        proposalKey,
        payload: payload as any,
        processingStatus: 'RECEIVED',
      },
    });

    // 2. Localização estrita da proposta
    // Prioridade 1: chave_proposta (happyProposalKey ou proposalNumber)
    let proposal: any = null;

    if (proposalKey) {
      proposal = await prisma.proposal.findFirst({
        where: {
          OR: [
            { happyProposalKey: proposalKey },
            { proposalNumber: proposalKey },
          ],
        },
        include: { status: true, client: true },
      });
    }

    // Prioridade 2: contract_id (happyContractId)
    if (!proposal && contractId) {
      proposal = await prisma.proposal.findFirst({
        where: {
          happyContractId: contractId,
        },
        include: { status: true, client: true },
      });
    }

    // Prioridade 3: customer_id compatível no cliente
    if (!proposal && customerId) {
      proposal = await prisma.proposal.findFirst({
        where: {
          OR: [
            { happyCustomerId: customerId },
            { client: { cpf: customerId } },
          ],
        },
        include: { status: true, client: true },
      });
    }

    // Se nenhuma proposta for encontrada de forma inequívoca:
    if (!proposal) {
      await prisma.happyWebhookEvent.update({
        where: { id: createdEvent.id },
        data: {
          processingStatus: 'UNMATCHED',
          processingError: 'Nenhuma proposta interna foi localizada com os identificadores fornecidos.',
          processedAt: new Date(),
        },
      });

      return {
        success: true,
        unmatched: true,
        message: 'Evento registrado, porém nenhuma proposta interna correspondente foi localizada.',
      };
    }

    const tenantId = proposal.tenantId;

    // 3. Mapeamento de status
    const mapping = mapHappyStatusToInternal(statusCode, statusName, statusDescription);

    let internalStatusChanged = false;
    let targetStatusRecord: any = null;

    if (mapping.isMapped && mapping.targetStatusCode) {
      targetStatusRecord = await prisma.proposalStatus.findFirst({
        where: {
          tenantId,
          code: mapping.targetStatusCode,
        },
      });

      if (targetStatusRecord && proposal.statusId !== targetStatusRecord.id) {
        internalStatusChanged = true;
      }
    }

    // 4. Atualizar a proposta e registrar histórico em transação
    await prisma.$transaction(async (tx) => {
      // Atualizar proposta com dados brutos da Happy
      await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          happyContractId: contractId || proposal.happyContractId,
          happyStatusCode: statusCode ?? proposal.happyStatusCode,
          happyStatusName: statusName ?? proposal.happyStatusName,
          happyStatusDescription: statusDescription ?? proposal.happyStatusDescription,
          happyProposalKey: proposalKey || proposal.happyProposalKey,
          happyCustomerId: customerId || proposal.happyCustomerId,
          happyDigitizer: digitador || proposal.happyDigitizer,
          happyLastSyncAt: new Date(),
          happySyncStatus: 'SYNCED',
          happyRawData: payload as any,
          ...(internalStatusChanged && targetStatusRecord
            ? {
                statusId: targetStatusRecord.id,
                retentionDeadline: targetStatusRecord.code === 'AGUARDAR_RETORNO_CIP'
                  ? (proposal.retentionDeadline ? undefined : new Date())
                  : null,
              }
            : {}),
        },
      });

      // Se status interno mudou, registrar em StatusHistory
      if (internalStatusChanged && targetStatusRecord) {
        await tx.statusHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            statusId: targetStatusRecord.id,
            statusName: targetStatusRecord.name,
            notes: `[Happy Webhook] ${mapping.notes}. RequestId: ${requestId}`,
          },
        });
      }

      // Registrar histórico de sincronização auditável
      await tx.happySyncHistory.create({
        data: {
          tenantId,
          proposalId: proposal.id,
          happyContractId: contractId || proposal.happyContractId,
          operation: 'WEBHOOK',
          status: 'SUCCESS',
          previousStatus: proposal.status?.name || null,
          newStatus: targetStatusRecord?.name || statusName || 'Atualizado',
          requestId,
          completedAt: new Date(),
          rawResponse: payload as any,
        },
      });

      // Atualizar HappyWebhookEvent como processado com sucesso
      await tx.happyWebhookEvent.update({
        where: { id: createdEvent.id },
        data: {
          tenantId,
          matchedProposalId: proposal.id,
          processingStatus: mapping.isMapped ? 'PROCESSED' : 'UNKNOWN_MAPPING',
          processedAt: new Date(),
        },
      });
    });

    return {
      success: true,
      processed: true,
      proposalId: proposal.id,
      message: `Webhook processado com sucesso para a proposta ${proposal.proposalNumber}.`,
    };
  }

  /**
   * Sincronização manual de uma proposta específica via consulta na API Happy
   */
  public static async syncProposal(
    prisma: PrismaClient,
    tenantId: string,
    proposalId: string
  ): Promise<HappySyncResult> {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId },
      include: { client: true, status: true },
    });

    if (!proposal) {
      throw new Error('Proposta não encontrada no tenant especificado.');
    }

    const contractIdToQuery = proposal.happyContractId
      ? Number(proposal.happyContractId)
      : null;
    const cpfToQuery = proposal.client?.cpf || null;

    if (!contractIdToQuery && !cpfToQuery) {
      throw new Error('A proposta não possui ID de contrato Happy nem CPF do cliente para consulta.');
    }

    let responseData: HappyConsultarResponse;
    try {
      responseData = await this.consultarContratos(prisma, tenantId, {
        id_contrato: contractIdToQuery,
        cpf: cpfToQuery,
      });
    } catch (err: any) {
      await prisma.happySyncHistory.create({
        data: {
          tenantId,
          proposalId: proposal.id,
          happyContractId: proposal.happyContractId,
          operation: 'MANUAL_SYNC',
          status: 'ERROR',
          error: err.message,
          completedAt: new Date(),
        },
      });

      await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          happySyncStatus: 'ERROR',
          happySyncError: err.message,
          happyLastSyncAt: new Date(),
        },
      });

      throw err;
    }

    const contratos = responseData.contratos || [];
    let matchedContract: HappyContratoItem | undefined;

    if (contractIdToQuery) {
      matchedContract = contratos.find((c) => String(c.id) === String(contractIdToQuery));
    }
    if (!matchedContract && contratos.length > 0) {
      matchedContract = contratos[0];
    }

    if (!matchedContract) {
      await prisma.happySyncHistory.create({
        data: {
          tenantId,
          proposalId: proposal.id,
          happyContractId: proposal.happyContractId,
          operation: 'MANUAL_SYNC',
          status: 'UNMATCHED',
          error: 'Nenhum contrato correspondente retornado pela API Happy',
          completedAt: new Date(),
          rawResponse: responseData as any,
        },
      });

      await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          happySyncStatus: 'UNMATCHED',
          happySyncError: 'Contrato não localizado na API Happy',
          happyLastSyncAt: new Date(),
        },
      });

      return {
        success: false,
        hasChanged: false,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        statusMapped: false,
        error: 'Nenhum contrato retornado para os critérios de busca.',
      };
    }

    const rawStatus = matchedContract.status;
    const mapping = mapHappyStatusToInternal(null, rawStatus, null);

    let internalStatusChanged = false;
    let targetStatusRecord: any = null;

    if (mapping.isMapped && mapping.targetStatusCode) {
      targetStatusRecord = await prisma.proposalStatus.findFirst({
        where: { tenantId, code: mapping.targetStatusCode },
      });

      if (targetStatusRecord && proposal.statusId !== targetStatusRecord.id) {
        internalStatusChanged = true;
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          happyContractId: String(matchedContract.id),
          happyStatus: rawStatus,
          happyStatusName: rawStatus,
          happyProductType: matchedContract.tipo_produto || proposal.happyProductType,
          happyPortabilityStatus: matchedContract.status_port || proposal.happyPortabilityStatus,
          happyDigitizer: String(matchedContract.digitador || proposal.happyDigitizer || ''),
          happyLastSyncAt: new Date(),
          happySyncStatus: 'SYNCED',
          happySyncError: null,
          happyRawData: matchedContract as any,
          ...(internalStatusChanged && targetStatusRecord
            ? {
                statusId: targetStatusRecord.id,
                retentionDeadline: targetStatusRecord.code === 'AGUARDAR_RETORNO_CIP'
                  ? (proposal.retentionDeadline ? undefined : new Date())
                  : null,
              }
            : {}),
        },
      });

      if (internalStatusChanged && targetStatusRecord) {
        await tx.statusHistory.create({
          data: {
            tenantId,
            proposalId: proposal.id,
            statusId: targetStatusRecord.id,
            statusName: targetStatusRecord.name,
            notes: `[Happy Manual Sync] ${mapping.notes}`,
          },
        });
      }

      await tx.happySyncHistory.create({
        data: {
          tenantId,
          proposalId: proposal.id,
          happyContractId: String(matchedContract.id),
          operation: 'MANUAL_SYNC',
          status: 'SUCCESS',
          previousStatus: proposal.status?.name || null,
          newStatus: targetStatusRecord?.name || rawStatus || 'Sincronizado',
          completedAt: new Date(),
          rawResponse: matchedContract as any,
        },
      });
    });

    return {
      success: true,
      hasChanged: internalStatusChanged,
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      happyContractId: String(matchedContract.id),
      statusName: rawStatus || undefined,
      previousInternalStatus: proposal.status?.name,
      currentInternalStatus: targetStatusRecord?.name || proposal.status?.name,
      statusMapped: mapping.isMapped,
      internalStatusUpdated: internalStatusChanged,
      mappingNotes: mapping.notes,
      rawData: matchedContract,
    };
  }

  /**
   * Reconcilia propostas ativas pendentes de sincronização
   */
  public static async runBatchReconciliation(
    prisma: PrismaClient,
    tenantId: string,
    limit = 25
  ): Promise<{
    totalChecked: number;
    updatedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const proposals = await prisma.proposal.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { happyContractId: { not: null } },
          { happyProposalKey: { not: null } },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'asc' },
    });

    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const prop of proposals) {
      try {
        const result = await this.syncProposal(prisma, tenantId, prop.id);
        if (result.hasChanged) {
          updatedCount++;
        }
      } catch (err: any) {
        errorCount++;
        errors.push(`Proposta ${prop.proposalNumber}: ${err.message}`);
      }
    }

    return {
      totalChecked: proposals.length,
      updatedCount,
      errorCount,
      errors,
    };
  }

  /**
   * Obtém status operacional consolidado da integração Happy para o painel
   */
  public static async getIntegrationStatus(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<HappyIntegrationStatus> {
    const config = await this.getTenantConfig(prisma, tenantId);

    const [lastSync, lastWebhook, unmatchedCount, totalSynced, recentErrors] = await Promise.all([
      prisma.happySyncHistory.findFirst({
        where: { tenantId },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.happyWebhookEvent.findFirst({
        where: { tenantId },
        orderBy: { receivedAt: 'desc' },
      }),
      prisma.happyWebhookEvent.count({
        where: {
          tenantId,
          processingStatus: 'UNMATCHED',
        },
      }),
      prisma.proposal.count({
        where: {
          tenantId,
          happySyncStatus: 'SYNCED',
        },
      }),
      prisma.happySyncHistory.count({
        where: {
          tenantId,
          status: 'ERROR',
        },
      }),
    ]);

    return {
      isConfigured: config.isConfigured,
      isActive: config.ativo,
      ambiente: config.ambiente,
      lastSyncAt: lastSync?.completedAt?.toISOString() || null,
      lastWebhookReceivedAt: lastWebhook?.receivedAt?.toISOString() || null,
      lastWebhookProcessedAt: lastWebhook?.processedAt?.toISOString() || null,
      unmatchedWebhooksCount: unmatchedCount,
      totalSyncedCount: totalSynced,
      recentErrorsCount: recentErrors,
      lastError: recentErrors > 0 && lastSync?.error ? lastSync.error : null,
    };
  }
}
