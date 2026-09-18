import { describe, it, expect, vi, beforeEach } from 'vitest';
import { C6BankService } from '../../server/services/c6BankService.js';

describe('C6 Proposal Sync & Database Isolation Tests', () => {
  const mockTenantId = 'tenant_test_123';
  const otherTenantId = 'tenant_other_456';

  it('handles missing C6 identifier gracefully without throwing database error', async () => {
    const mockPrisma: any = {
      proposal: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'prop_uuid_1',
          tenantId: mockTenantId,
          proposalNumber: null,
          c6ProposalNumber: null,
          c6OperationNumber: null,
          bank: { code: '336', name: 'C6 Bank' },
          status: { id: 'st_1', name: 'AGUARDAR FORMALIZAÇÃO' },
        }),
        update: vi.fn().mockResolvedValue({ id: 'prop_uuid_1' }),
      },
      proposalStatus: {
        findFirst: vi.fn().mockResolvedValue({ id: 'st_1', name: 'AGUARDAR FORMALIZAÇÃO' }),
      },
      c6SyncHistory: {
        create: vi.fn().mockResolvedValue({ id: 'hist_1' }),
      },
      c6TenantConfig: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await C6BankService.syncProposalStatus(mockPrisma, 'prop_uuid_1', mockTenantId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Número da proposta no C6 Bank não informado');
    expect(mockPrisma.proposal.update).toHaveBeenCalledWith({
      where: { id: 'prop_uuid_1' },
      data: expect.objectContaining({
        c6SyncStatus: 'MISSING_IDENTIFIER',
      }),
    });
  });

  it('queries C6 proposal status using C6 proposal number and updates internal status', async () => {
    const mockProposal = {
      id: 'prop_uuid_2',
      tenantId: mockTenantId,
      proposalNumber: '12345678',
      c6ProposalNumber: '12345678',
      c6OperationNumber: 'OP-999',
      statusId: 'st_1',
      status: { id: 'st_1', name: 'AGUARDAR FORMALIZAÇÃO' },
      bank: { code: '336', name: 'C6 Bank' },
    };

    const mockPrisma: any = {
      proposal: {
        findFirst: vi.fn().mockResolvedValue(mockProposal),
        update: vi.fn().mockResolvedValue({ ...mockProposal, statusId: 'st_reprovado' }),
      },
      proposalStatus: {
        findFirst: vi.fn().mockResolvedValue({ id: 'st_reprovado', name: 'REPROVADO', code: 'REPROVADO' }),
      },
      c6TenantConfig: {
        findMany: vi.fn().mockResolvedValue([
          { key: 'c6_username', value: 'user_test' },
          { key: 'c6_password', value: 'pass_test' },
          { key: 'c6_client_id', value: 'client_id_test' },
          { key: 'c6_client_secret', value: 'secret_test' },
        ]),
      },
      c6SyncHistory: {
        create: vi.fn().mockResolvedValue({ id: 'hist_2' }),
      },
      statusHistory: {
        create: vi.fn().mockResolvedValue({ id: 'st_hist_1' }),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockPrisma)),
    };

    // Mock queryProposalFromC6
    vi.spyOn(C6BankService as any, 'queryProposalFromC6').mockResolvedValue({
      statusCode: 200,
      data: {
        proposal_number: '12345678',
        operation_number: 'OP-999',
        loan_track: {
          situation: 'REP',
          current_activity_number: 960,
          current_activity_description: 'REPROVADA',
        },
      },
    });

    const result = await C6BankService.syncProposalStatus(mockPrisma, 'prop_uuid_2', mockTenantId);

    expect(result.success).toBe(true);
    expect(result.hasChanged).toBe(true);
    expect(result.currentInternalStatus).toBe('REPROVADO');
    expect(result.c6ProposalNumber).toBe('12345678');
    expect(result.c6OperationNumber).toBe('OP-999');
  });

  it('preserves existing proposal status when C6 API throws a technical error', async () => {
    const mockProposal = {
      id: 'prop_uuid_3',
      tenantId: mockTenantId,
      proposalNumber: '87654321',
      c6ProposalNumber: '87654321',
      statusId: 'st_1',
      status: { id: 'st_1', name: 'AGUARDAR FORMALIZAÇÃO' },
      bank: { code: '336', name: 'C6 Bank' },
    };

    const mockPrisma: any = {
      proposal: {
        findFirst: vi.fn().mockResolvedValue(mockProposal),
        update: vi.fn().mockResolvedValue(mockProposal),
      },
      proposalStatus: {
        findFirst: vi.fn().mockResolvedValue({ id: 'st_1', name: 'AGUARDAR FORMALIZAÇÃO' }),
      },
      c6SyncHistory: {
        create: vi.fn().mockResolvedValue({ id: 'hist_3' }),
      },
    };

    vi.spyOn(C6BankService as any, 'queryProposalFromC6').mockRejectedValue(
      new Error('Timeout de comunicação com o C6 Bank')
    );

    const result = await C6BankService.syncProposalStatus(mockPrisma, 'prop_uuid_3', mockTenantId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout de comunicação');
    expect(mockPrisma.proposal.update).toHaveBeenCalledWith({
      where: { id: 'prop_uuid_3' },
      data: expect.objectContaining({
        c6SyncStatus: 'ERROR',
        c6SyncError: expect.stringContaining('Timeout'),
      }),
    });
  });

  it('enforces multi-tenant isolation and rejects queries for other tenants', async () => {
    const mockPrisma: any = {
      proposal: {
        findFirst: vi.fn().mockResolvedValue(null), // Not found for other tenant
      },
    };

    await expect(
      C6BankService.syncProposalStatus(mockPrisma, 'prop_uuid_4', otherTenantId)
    ).rejects.toThrow('Proposta não encontrada ou não pertence a este tenant.');
  });
});
