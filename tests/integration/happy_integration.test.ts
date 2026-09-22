import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapHappyStatusToInternal,
  normalizeHappyText,
  HAPPY_DOCUMENTED_STATUSES,
} from '../../server/services/happyStatusMapper.js';
import { HappyTokenManager } from '../../server/services/happyTokenManager.js';
import { HappyBankService } from '../../server/services/happyBankService.js';

describe('Happy / BYX Capital Status Mapper Verification', () => {
  it('normalizes status text correctly handling accents and uppercase', () => {
    expect(normalizeHappyText('Aguardando Formalização')).toBe('AGUARDANDO_FORMALIZACAO');
    expect(normalizeHappyText('  PAGO_AO_CLIENTE  ')).toBe('PAGO_AO_CLIENTE');
    expect(normalizeHappyText('Reprovado pelo Banco')).toBe('REPROVADO_PELO_BANCO');
  });

  it('maps documented Happy numeric codes and names to Sentinel internal ProposalStatus', () => {
    // 38 = Int - Finalizado -> PAGO
    const pagoResult = mapHappyStatusToInternal(38, 'Int - Finalizado');
    expect(pagoResult.isMapped).toBe(true);
    expect(pagoResult.targetStatusCode).toBe('PAGO');

    // 13 = Aprovada - Averbação -> INTEGRADO
    const averbadoResult = mapHappyStatusToInternal(13, 'Aprovada - Averbação');
    expect(averbadoResult.isMapped).toBe(true);
    expect(averbadoResult.targetStatusCode).toBe('INTEGRADO');

    // 41 = Reprovado -> REPROVADO
    const reprovadoResult = mapHappyStatusToInternal(41, 'Reprovado');
    expect(reprovadoResult.isMapped).toBe(true);
    expect(reprovadoResult.targetStatusCode).toBe('REPROVADO');

    // 101 = Cancelado -> CANCELADO
    const canceladoResult = mapHappyStatusToInternal(101, 'Cancelado');
    expect(canceladoResult.isMapped).toBe(true);
    expect(canceladoResult.targetStatusCode).toBe('CANCELADO');

    // 21 = Formalização -> AGUARDAR_FORMALIZACAO
    const formalizacaoResult = mapHappyStatusToInternal(21, 'Formalização');
    expect(formalizacaoResult.isMapped).toBe(true);
    expect(formalizacaoResult.targetStatusCode).toBe('AGUARDAR_FORMALIZACAO');
  });

  it('preserves unknown statuses without discarding original value or throwing error', () => {
    const unknownRaw = 'STATUS_NOVO_EXPERIMENTAL_2026';
    const result = mapHappyStatusToInternal(9999, unknownRaw);

    expect(result.isMapped).toBe(false);
    expect(result.targetStatusCode).toBeNull();
    expect(result.statusName).toBe(unknownRaw);
    expect(result.mappingCode).toBe('UNKNOWN_STATUS');
  });
});

describe('Happy Token Manager & Caching', () => {
  beforeEach(() => {
    HappyTokenManager.clearCache();
    vi.restoreAllMocks();
  });

  it('generates and caches token using client credentials and returns token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'fake_jwt_token_happy_xyz',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });
    global.fetch = mockFetch;

    const mockPrisma: any = {
      systemConfig: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const token = await HappyTokenManager.getValidToken(
      mockPrisma,
      'tenant_alpha',
      false,
      {
        baseUrl: 'https://sp-integracao-api.byx.capital',
        clientId: 'my_client_id',
        secret: 'my_secret',
        usuario: 'operador_sentinel',
        senha: 'password123',
      }
    );

    expect(token).toBe('fake_jwt_token_happy_xyz');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Invalidação e renovação em caso de erro
    HappyTokenManager.invalidateToken('tenant_alpha');
    const renewed = await HappyTokenManager.getValidToken(
      mockPrisma,
      'tenant_alpha',
      true,
      {
        baseUrl: 'https://sp-integracao-api.byx.capital',
        clientId: 'my_client_id',
        secret: 'my_secret',
        usuario: 'operador_sentinel',
        senha: 'password123',
      }
    );
    expect(renewed).toBe('fake_jwt_token_happy_xyz');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws descriptive error on invalid credentials without exposing secrets in message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'invalid_client', error_description: 'Unauthorized' }),
    });
    global.fetch = mockFetch;

    const mockPrisma: any = {
      systemConfig: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await expect(
      HappyTokenManager.getValidToken(
        mockPrisma,
        'tenant_beta',
        false,
        {
          baseUrl: 'https://sp-integracao-api.byx.capital',
          clientId: 'invalid_id',
          secret: 'super_secret_value_123',
          usuario: 'operador_sentinel',
          senha: 'senha_incorreta',
        }
      )
    ).rejects.toThrow(/Falha na autenticação Happy/);
  });
});

describe('Happy Webhook Processing & Multi-tenant Idempotency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes webhook idempotently by request_id', async () => {
    const existingWebhookEvent = {
      id: 'webhook_evt_1',
      requestId: 'req_unique_9999',
      processingStatus: 'MATCHED',
    };

    const mockPrisma: any = {
      happyWebhookEvent: {
        findUnique: vi.fn().mockResolvedValue(existingWebhookEvent),
      },
    };

    const payload = {
      request_id: 'req_unique_9999',
      event_name: 'STATUS_UPDATE',
      contract_id: 'CONTRACT_100',
    };

    const result = await HappyBankService.processWebhook(mockPrisma, payload);

    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.message).toContain('já recebido e processado');
  });

  it('matches proposal by contractId, updates status, and logs sync history', async () => {
    const mockProposal = {
      id: 'prop_uuid_happy_1',
      tenantId: 'tenant_omega',
      proposalNumber: 'PROP-777',
      happyContractId: 'CONTRACT_100',
      statusId: 'status_antigo',
      status: { id: 'status_antigo', name: 'PENDENTE' },
    };

    const mockTargetStatus = {
      id: 'status_pago_id',
      code: 'PAGO',
      name: 'PAGO',
    };

    const mockPrisma: any = {
      $transaction: vi.fn(async (callback) => callback(mockPrisma)),
      happyWebhookEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new_evt_1' }),
        update: vi.fn().mockResolvedValue({ id: 'new_evt_1' }),
      },
      proposal: {
        findFirst: vi.fn().mockResolvedValue(mockProposal),
        update: vi.fn().mockResolvedValue({ ...mockProposal, statusId: 'status_pago_id' }),
      },
      proposalStatus: {
        findFirst: vi.fn().mockResolvedValue(mockTargetStatus),
      },
      happySyncHistory: {
        create: vi.fn().mockResolvedValue({ id: 'hist_1' }),
      },
      statusHistory: {
        create: vi.fn().mockResolvedValue({ id: 'sh_1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      notification: {
        create: vi.fn().mockResolvedValue({ id: 'notif_1' }),
      },
    };

    const payload = {
      request_id: 'req_fresh_888',
      event_name: 'STATUS_CONTRATO_ADICIONADO',
      contract_id: 'CONTRACT_100',
      data: {
        event_data: {
          status_code: 38, // 38 = Int - Finalizado -> PAGO
          status_name: 'Int - Finalizado',
          status_description: 'Crédito liberado na conta do cliente',
        },
      },
    };

    const result = await HappyBankService.processWebhook(mockPrisma, payload);

    expect(result.success).toBe(true);
    expect(result.processed).toBe(true);
    expect(result.proposalId).toBe('prop_uuid_happy_1');
    expect(mockPrisma.proposal.update).toHaveBeenCalledWith({
      where: { id: 'prop_uuid_happy_1' },
      data: expect.objectContaining({
        happyStatusName: 'Int - Finalizado',
        happyStatusCode: 38,
        happySyncStatus: 'SYNCED',
        statusId: 'status_pago_id',
      }),
    });
    expect(mockPrisma.happyWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'new_evt_1' },
      data: expect.objectContaining({
        processingStatus: 'PROCESSED',
        matchedProposalId: 'prop_uuid_happy_1',
      }),
    });
    expect(mockPrisma.happySyncHistory.create).toHaveBeenCalled();
  });

  it('records UNMATCHED event when proposal with contract_id does not exist', async () => {
    const mockPrisma: any = {
      happyWebhookEvent: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new_evt_unmatched' }),
        update: vi.fn().mockResolvedValue({ id: 'new_evt_unmatched' }),
      },
      proposal: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const payload = {
      event_name: 'CONTRATO_ATUALIZADO',
      request_id: 'req_unmatched_123',
      contract_id: 'UNKNOWN_CONTRACT_999',
      data: {
        event_data: {
          status_name: 'AVERBADO',
        },
      },
    };

    const result = await HappyBankService.processWebhook(mockPrisma, payload);

    expect(result.success).toBe(true);
    expect(result.unmatched).toBe(true);
    expect(mockPrisma.happyWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'new_evt_unmatched' },
      data: expect.objectContaining({
        processingStatus: 'UNMATCHED',
      }),
    });
  });
});
