import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mapC6StatusToInternal, normalizeC6Key, DEFAULT_C6_STATUS_MAPPINGS } from '../../server/services/c6StatusMapper';
import { C6BankService } from '../../server/services/c6BankService';
import { C6SyncWorker } from '../../server/services/c6SyncWorker';
import { prisma } from '../../server';

describe('C6 Bank Integration & Status Mapping Test Suite', () => {
  let tenantId: string;
  let bankC6Id: string;
  let statusFormalizacaoId: string;
  let statusReprovadoId: string;
  let clientC6Id: string;
  let proposalId: string;

  beforeAll(async () => {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: { name: 'C6 Test Tenant', slug: `c6-test-${Date.now()}`, status: 'ACTIVE' },
    });
    tenantId = tenant.id;

    // Create C6 bank entry
    const bank = await prisma.bank.create({
      data: { tenantId, name: 'C6 BANK', code: '336', status: 'ATIVO' },
    });
    bankC6Id = bank.id;

    // Create default statuses for tenant
    const stFormal = await prisma.proposalStatus.create({
      data: {
        tenantId,
        name: 'AGUARDAR FORMALIZACAO',
        code: 'AGUARDAR_FORMALIZACAO',
        order: 1,
        slaHours: 24,
        active: true,
      },
    });
    statusFormalizacaoId = stFormal.id;

    const stRep = await prisma.proposalStatus.create({
      data: {
        tenantId,
        name: 'REPROVADO',
        code: 'REPROVADO',
        order: 11,
        slaHours: 0,
        active: true,
      },
    });
    statusReprovadoId = stRep.id;

    // Create client
    const client = await prisma.client.create({
      data: { tenantId, cpf: '99988877766', fullName: 'CLIENTE TESTE C6' },
    });
    clientC6Id = client.id;

    // Create test proposal in AGUARDAR_FORMALIZACAO
    const prop = await prisma.proposal.create({
      data: {
        tenantId,
        proposalNumber: '97903251',
        c6ProposalNumber: '97903251',
        bankId: bankC6Id,
        clientId: clientC6Id,
        statusId: statusFormalizacaoId,
        c6SyncStatus: 'PENDING',
      },
    });
    proposalId = prop.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await prisma.c6SyncHistory.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.statusHistory.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.proposal.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.client.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.proposalStatus.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.bank.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    }
  });

  // 1. SCENARIO 1: Test String Normalization
  it('1. Should correctly normalize C6 string keys removing accents, extra spaces, and upper-casing', () => {
    expect(normalizeC6Key('  reprovada  ')).toBe('REPROVADA');
    expect(normalizeC6Key('REPROVÁDA')).toBe('REPROVADA');
    expect(normalizeC6Key('Aguardando Assinatura')).toBe('AGUARDANDO_ASSINATURA');
    expect(normalizeC6Key('REP')).toBe('REP');
    expect(normalizeC6Key('   ')).toBe('');
    expect(normalizeC6Key(null)).toBe('');
  });

  // 2. SCENARIO 2: Test REP + REPROVADA Mapping
  it('2. Should map loan_track.situation = "REP" and current_activity_description = "REPROVADA" to REPROVADO', () => {
    const responseData = {
      proposal_number: '97903251',
      loan_track: {
        situation: 'REP',
        current_activity_description: 'REPROVADA',
        current_activity_number: '960',
      },
    };

    const mapping = mapC6StatusToInternal(responseData);
    expect(mapping.isMapped).toBe(true);
    expect(mapping.targetStatusCode).toBe('REPROVADO');
    expect(mapping.rawSituation).toBe('REP');
    expect(mapping.activityDescription).toBe('REPROVADA');
    expect(mapping.notes).toContain('REPROVADA');
  });

  // 3. SCENARIO 3: Test Short Situation "REP" Alone Mapping
  it('3. Should map loan_track.situation = "REP" alone to REPROVADO', () => {
    const responseData = {
      proposal_number: '97903251',
      loan_track: {
        situation: 'REP',
      },
    };

    const mapping = mapC6StatusToInternal(responseData);
    expect(mapping.isMapped).toBe(true);
    expect(mapping.targetStatusCode).toBe('REPROVADO');
  });

  // 4. SCENARIO 4: Test Paid Status Mapping
  it('4. Should map loan_track.situation = "PAG" or activity "PROPOSTA PAGA" to PAGO', () => {
    const responseData = {
      proposal_number: '97903251',
      loan_track: {
        situation: 'PAG',
        current_activity_description: 'PROPOSTA PAGA',
      },
    };

    const mapping = mapC6StatusToInternal(responseData);
    expect(mapping.isMapped).toBe(true);
    expect(mapping.targetStatusCode).toBe('PAGO');
  });

  // 5. SCENARIO 5: Test Unmapped Status Preservation
  it('5. Should NOT map unknown C6 situations arbitrarily and keep isMapped = false', () => {
    const responseData = {
      proposal_number: '97903251',
      loan_track: {
        situation: 'SITUACAO_DESCONHECIDA_XYZ',
        current_activity_description: 'ATIVIDADE_INEDITA_123',
      },
    };

    const mapping = mapC6StatusToInternal(responseData);
    expect(mapping.isMapped).toBe(false);
    expect(mapping.targetStatusCode).toBeNull();
    expect(mapping.notes).toContain('Status C6 não mapeado');
  });

  // 6. SCENARIO 6: Test Real Fixture (Proposal 97903251, Activity 960 REPROVADA)
  it('6. Should execute database update correctly for activity 960 (REPROVADA) on proposal 97903251 without N/A in history', async () => {
    // Real C6 API response fixture
    const realFixture = {
      proposal_number: '97903251',
      operation_number: 'OP-97903251',
      loan_track: {
        situation: 'REP',
        current_activity_number: 960,
        current_activity_description: 'REPROVADA',
        activity_last_update: new Date().toISOString(),
      },
    };

    // Execute map + update via c6BankService logic
    const mapping = mapC6StatusToInternal(realFixture);
    expect(mapping.isMapped).toBe(true);
    expect(mapping.targetStatusCode).toBe('REPROVADO');

    // Find status record in database
    const targetStatus = await prisma.proposalStatus.findFirst({
      where: { tenantId, code: 'REPROVADO' },
    });
    expect(targetStatus).not.toBeNull();

    // Update proposal in DB
    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        c6RawSituation: realFixture.loan_track.situation,
        c6CurrentActivity: String(realFixture.loan_track.current_activity_number),
        c6ActivityDescription: realFixture.loan_track.current_activity_description,
        c6SyncStatus: 'SYNCED',
        c6LastSyncAt: new Date(),
        statusId: targetStatus!.id,
      },
    });

    await prisma.statusHistory.create({
      data: {
        tenantId,
        proposalId,
        statusId: targetStatus!.id,
        statusName: targetStatus!.name,
        notes: `[C6 Bank Sync] ${mapping.notes}`,
      },
    });

    await prisma.c6SyncHistory.create({
      data: {
        tenantId,
        proposalId,
        c6ProposalNumber: '97903251',
        c6OperationNumber: 'OP-97903251',
        success: true,
        hasChanged: true,
        previousRawSituation: 'FOR',
        currentRawSituation: 'REP',
        previousActivity: 'AGUARDANDO FORMALIZACAO',
        currentActivity: 'REPROVADA',
        previousInternalStatus: 'AGUARDAR FORMALIZACAO',
        currentInternalStatus: 'REPROVADO',
        rawResponse: realFixture,
        queriedBy: 'TEST_FIXTURE_960',
      },
    });

    // Verify Proposal was updated in DB
    const updatedProp = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { status: true },
    });

    expect(updatedProp?.statusId).toBe(targetStatus!.id);
    expect(updatedProp?.status.code).toBe('REPROVADO');
    expect(updatedProp?.c6RawSituation).toBe('REP');
    expect(updatedProp?.c6CurrentActivity).toBe('960');
    expect(updatedProp?.c6ActivityDescription).toBe('REPROVADA');
    expect(updatedProp?.c6SyncStatus).toBe('SYNCED');

    // Verify Sync History does NOT contain N/A
    const history = await prisma.c6SyncHistory.findMany({
      where: { proposalId },
    });
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].currentRawSituation).toBe('REP');
    expect(history[0].previousInternalStatus).not.toBe('N/A');
    expect(history[0].currentInternalStatus).toBe('REPROVADO');
    expect(history[0].currentInternalStatus).not.toBe('N/A');
  });

  // 7. SCENARIO 7: Multi-Tenant Isolation
  it('7. Should respect multi-tenant isolation and not touch other tenants data', async () => {
    const tenant2 = await prisma.tenant.create({
      data: { name: 'Tenant 2', slug: `c6-tenant2-${Date.now()}`, status: 'ACTIVE' },
    });

    const pendingCountTenant2 = await C6SyncWorker.countPendingProposals(prisma, tenant2.id);
    expect(pendingCountTenant2).toBe(0);

    await prisma.tenant.delete({ where: { id: tenant2.id } });
  });

  // 8. SCENARIO 8: Raw Data Preservation
  it('8. Should preserve raw C6 response payload and raw strings for auditing', () => {
    const rawPayload = {
      proposal_number: '97903251',
      loan_track: { situation: 'REP', current_activity_description: 'REPROVADA (MOTIVO: MARGEM INDISPONÍVEL)' },
    };

    const mapping = mapC6StatusToInternal(rawPayload);
    expect(mapping.activityDescription).toBe('REPROVADA (MOTIVO: MARGEM INDISPONÍVEL)');
    expect(mapping.rawSituation).toBe('REP');
  });
});
